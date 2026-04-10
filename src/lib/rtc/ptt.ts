/**
 * Push-to-Talk (PTT) via WebRTC
 * Handles peer connection, audio streaming, and signaling.
 */

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const SIGNAL_POLL_INTERVAL = 1000; // Poll every 1s for signals

export class PTTConnection {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private signalPollInterval: ReturnType<typeof setInterval> | null = null;
  private userId: string;
  private peerId: string;
  private onStatusChange: (status: string) => void;

  constructor(userId: string, peerId: string, onStatusChange: (status: string) => void) {
    this.userId = userId;
    this.peerId = peerId;
    this.onStatusChange = onStatusChange;
  }

  async startCall() {
    this.onStatusChange("connecting");

    // Create peer connection
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Handle incoming audio
    this.remoteAudio = new Audio();
    this.remoteAudio.autoplay = true;

    this.pc.ontrack = (event) => {
      if (this.remoteAudio) {
        this.remoteAudio.srcObject = event.streams[0];
      }
    };

    // Send ICE candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal("ice-candidate", event.candidate.toJSON());
      }
    };

    this.pc.onconnectionstatechange = () => {
      this.onStatusChange(this.pc?.connectionState || "unknown");
    };

    // Get microphone
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Add tracks but muted (PTT — unmute on push)
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = false; // Muted by default
      this.pc.addTrack(track, this.localStream);
    }

    // Create and send offer
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this.sendSignal("offer", offer);

    // Start polling for signals
    this.startSignalPolling();
  }

  async acceptCall(offer: RTCSessionDescriptionInit) {
    this.onStatusChange("connecting");

    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.remoteAudio = new Audio();
    this.remoteAudio.autoplay = true;

    this.pc.ontrack = (event) => {
      if (this.remoteAudio) {
        this.remoteAudio.srcObject = event.streams[0];
      }
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal("ice-candidate", event.candidate.toJSON());
      }
    };

    this.pc.onconnectionstatechange = () => {
      this.onStatusChange(this.pc?.connectionState || "unknown");
    };

    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = false;
      this.pc.addTrack(track, this.localStream);
    }

    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
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

  private async sendSignal(type: string, data: unknown) {
    await fetch("/api/rtc/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromUserId: this.userId, toUserId: this.peerId, type, data }),
    }).catch(() => {});
  }

  private startSignalPolling() {
    this.signalPollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/rtc/signal?userId=${this.userId}`);
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
                this.onStatusChange("connected");
              }
              break;
            case "ice-candidate":
              if (this.pc) {
                await this.pc.addIceCandidate(new RTCIceCandidate(signal.data));
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
      } catch { /* skip */ }
    }, SIGNAL_POLL_INTERVAL);
  }
}
