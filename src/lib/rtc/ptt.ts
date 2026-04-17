/**
 * Push-to-Talk (PTT) via WebRTC
 * Handles peer connection, audio streaming, and signaling.
 */

import { getIceServers } from "./ice";

const SIGNAL_POLL_INTERVAL = 1000; // Poll every 1s for signals

export class PTTConnection {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private signalPollInterval: ReturnType<typeof setInterval> | null = null;
  private userId: string;
  private peerId: string;
  private onStatusChange: (status: string) => void;
  private onDebug: (msg: string) => void;
  private externalAudioEl: HTMLAudioElement | null;
  private pendingIce: RTCIceCandidateInit[] = [];

  constructor(
    userId: string,
    peerId: string,
    onStatusChange: (status: string) => void,
    opts?: { audioEl?: HTMLAudioElement | null; onDebug?: (msg: string) => void }
  ) {
    this.userId = userId;
    this.peerId = peerId;
    this.onStatusChange = onStatusChange;
    this.onDebug = opts?.onDebug ?? (() => {});
    this.externalAudioEl = opts?.audioEl ?? null;
  }

  setAudioEl(el: HTMLAudioElement | null) {
    this.externalAudioEl = el;
  }

  private getAudioEl(): HTMLAudioElement {
    // Prefer the DOM-attached element supplied by the UI. On iOS Safari a
    // detached `new Audio()` silently refuses to play incoming WebRTC
    // tracks; attaching + explicit play() is the only reliable path.
    if (this.externalAudioEl) return this.externalAudioEl;
    const el = new Audio();
    el.autoplay = true;
    (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    return el;
  }

  private attachRemoteStream(stream: MediaStream) {
    const el = this.getAudioEl();
    el.srcObject = stream;
    el.muted = false;
    el.volume = 1;
    this.remoteAudio = el;
    this.onDebug(`remote track tracks=${stream.getAudioTracks().length}`);
    el.play()
      .then(() => this.onDebug("remote audio playing"))
      .catch((err) => this.onDebug(`play() failed: ${err?.name || err}`));
  }

  private wirePeer(pc: RTCPeerConnection) {
    pc.ontrack = (event) => {
      this.attachRemoteStream(event.streams[0]);
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal("ice-candidate", event.candidate.toJSON());
      }
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      this.onDebug(`pc state=${s}`);
      this.onStatusChange(s || "unknown");
    };
    pc.oniceconnectionstatechange = () => {
      this.onDebug(`ice=${pc.iceConnectionState}`);
    };
    pc.onicegatheringstatechange = () => {
      this.onDebug(`ice-gather=${pc.iceGatheringState}`);
    };
  }

  async startCall() {
    this.onStatusChange("connecting");
    this.onDebug("startCall: creating pc");
    this.pc = new RTCPeerConnection({ iceServers: getIceServers() });
    this.wirePeer(this.pc);

    this.onDebug("getUserMedia…");
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.onDebug(`mic tracks=${this.localStream.getAudioTracks().length}`);

    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = false; // Muted by default
      this.pc.addTrack(track, this.localStream);
    }

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.onDebug("offer sent");
    await this.sendSignal("offer", offer);

    this.startSignalPolling();
  }

  async acceptCall(offer: RTCSessionDescriptionInit) {
    this.onStatusChange("connecting");
    this.onDebug("acceptCall: creating pc");
    this.pc = new RTCPeerConnection({ iceServers: getIceServers() });
    this.wirePeer(this.pc);

    this.onDebug("getUserMedia…");
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.onDebug(`mic tracks=${this.localStream.getAudioTracks().length}`);

    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = false;
      this.pc.addTrack(track, this.localStream);
    }

    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    // Flush any ICE candidates that arrived before the remote description
    // was ready (rare but possible if they share a single polling batch).
    for (const c of this.pendingIce) {
      try { await this.pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* ignore */ }
    }
    this.pendingIce = [];

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.onDebug("answer sent");
    await this.sendSignal("answer", answer);
  }

  // PTT: hold to talk
  startTalking() {
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = true;
      }
    }
    this.sendSignal("ptt-start", {});
  }

  // PTT: release to stop
  stopTalking() {
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = false;
      }
    }
    this.sendSignal("ptt-end", {});
  }

  disconnect() {
    if (this.signalPollInterval) clearInterval(this.signalPollInterval);
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
    }
    if (this.pc) this.pc.close();
    this.pc = null;
    this.localStream = null;
    this.onStatusChange("disconnected");
  }

  /**
   * Lightweight listener: arranca el polling para recibir una "offer" del
   * otro peer sin pedir el micrófono todavía. Cuando el otro pulse el botón
   * y mande su offer, acceptCall se dispara y ahí sí pide el mic.
   * Uso: el lado que NO habla primero abre el chat y llama a listen() para
   * estar preparado a recibir audio en cuanto el otro empiece a hablar.
   */
  listen() {
    if (this.signalPollInterval) return;
    this.onStatusChange("listening");
    this.startSignalPolling();
  }

  private async sendSignal(type: string, data: unknown) {
    try {
      const res = await fetch("/api/rtc/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromUserId: this.userId, toUserId: this.peerId, type, data }),
      });
      if (!res.ok) console.error("[walkie] sendSignal non-ok", type, res.status);
    } catch (err) {
      console.error("[walkie] sendSignal failed", type, err);
    }
  }

  private startSignalPolling() {
    this.signalPollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/rtc/signal?userId=${this.userId}`);
        if (!res.ok) { console.error("[walkie] poll non-ok", res.status); return; }
        const { signals } = await res.json();

        for (const signal of signals || []) {
          if (signal.from !== this.peerId) continue;

          switch (signal.type) {
            case "offer":
              await this.acceptCall(signal.data);
              break;
            case "answer":
              if (this.pc) {
                await this.pc.setRemoteDescription(new RTCSessionDescription(signal.data));
                this.onDebug("answer applied; flushing queued ICE=" + this.pendingIce.length);
                for (const c of this.pendingIce) {
                  try { await this.pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* ignore */ }
                }
                this.pendingIce = [];
                this.onStatusChange("connected");
              }
              break;
            case "ice-candidate":
              if (this.pc && this.pc.remoteDescription) {
                try { await this.pc.addIceCandidate(new RTCIceCandidate(signal.data)); } catch (e) {
                  this.onDebug("ice add err: " + (e as Error).message);
                }
              } else {
                // pc not ready yet → queue until remote description is set.
                this.pendingIce.push(signal.data);
              }
              break;
            case "ptt-start":
              this.onStatusChange("receiving");
              break;
            case "ptt-end":
              this.onStatusChange("connected");
              break;
          }
        }
      } catch (err) { console.error("[walkie] poll error", err); }
    }, SIGNAL_POLL_INTERVAL);
  }
}
