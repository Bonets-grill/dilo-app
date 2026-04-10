/**
 * Call Manager — Orquesta señalización + WebRTC para llamadas completas.
 */

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  createCallChannel,
  sendSignal,
  onSignal,
  type SignalMessage,
} from "./signaling";
import { WebRTCManager, type CallType } from "./webrtc";

export type CallState =
  | "idle"
  | "outgoing"
  | "incoming"
  | "connecting"
  | "active"
  | "ended";

export class CallManager {
  private webrtc: WebRTCManager | null = null;
  private channel: RealtimeChannel | null = null;
  private callId: string | null = null;
  private durationTimer: ReturnType<typeof setInterval> | null = null;
  private ringTimeout: ReturnType<typeof setTimeout> | null = null;
  private callStartTime: number | null = null;

  // Estado público
  state: CallState = "idle";
  callType: CallType = "voice";
  remoteUserId: string | null = null;
  localStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;
  isMuted = false;
  isCameraOff = false;
  duration = 0;

  // Callbacks
  onStateChange: ((state: CallState) => void) | null = null;
  onRemoteStream: ((stream: MediaStream) => void) | null = null;
  onDurationUpdate: ((seconds: number) => void) | null = null;

  private setState(newState: CallState) {
    this.state = newState;
    this.onStateChange?.(newState);
  }

  /**
   * Iniciar una llamada saliente.
   */
  async call(
    userId: string,
    calleeId: string,
    callerName: string,
    type: CallType
  ): Promise<void> {
    const supabase = createBrowserSupabase();
    this.callType = type;
    this.remoteUserId = calleeId;

    // Crear registro en call_log (tabla no está en tipos generados aún)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: callRecord } = await (supabase as any)
      .from("call_log")
      .insert({
        caller_id: userId,
        callee_id: calleeId,
        call_type: type,
        status: "ringing",
      })
      .select("id")
      .single();

    if (!callRecord) throw new Error("No se pudo crear el registro de llamada");

    this.callId = (callRecord as { id: string }).id;

    // Inicializar WebRTC
    this.webrtc = new WebRTCManager();
    this.localStream = await this.webrtc.initialize(type);

    // Crear canal de señalización
    this.channel = createCallChannel(this.callId);
    this.setupSignalHandlers(userId);
    await this.channel.subscribe();

    // Manejar ICE candidates
    const currentCallId = this.callId;

    this.webrtc.onIceCandidate = (candidate) => {
      if (this.channel && currentCallId) {
        sendSignal(this.channel, {
          type: "ice-candidate",
          from: userId,
          to: calleeId,
          payload: candidate.toJSON(),
          callId: currentCallId,
          callType: type,
        });
      }
    };

    // Estado de conexión WebRTC
    this.webrtc.onConnectionStateChange = (connState) => {
      if (connState === "connected") {
        this.setState("active");
        this.startDurationTimer();
      } else if (connState === "failed" || connState === "disconnected") {
        this.endCall("connection_failed");
      }
    };

    // Track remoto
    this.webrtc.onTrack = (stream) => {
      this.remoteStream = stream;
      this.onRemoteStream?.(stream);
    };

    // Crear oferta SDP
    const offer = await this.webrtc.createOffer();

    // Enviar señal de oferta
    await sendSignal(this.channel, {
      type: "offer",
      from: userId,
      to: calleeId,
      payload: offer,
      callId: currentCallId,
      callType: type,
    });

    // Notificar al destinatario por su canal personal
    const incomingChannel = supabase.channel(`incoming:${calleeId}`);
    await incomingChannel.subscribe();
    await incomingChannel.send({
      type: "broadcast",
      event: "incoming-call",
      payload: {
        callId: this.callId,
        callerId: userId,
        callerName,
        callType: type,
        offer,
      },
    });
    supabase.removeChannel(incomingChannel);

    this.setState("outgoing");

    // Timeout de 30s si no contestan
    this.ringTimeout = setTimeout(() => {
      if (this.state === "outgoing") {
        this.endCall("no_answer");
      }
    }, 30_000);
  }

  /**
   * Contestar una llamada entrante.
   */
  async answer(
    userId: string,
    offer: RTCSessionDescriptionInit
  ): Promise<void> {
    if (!this.callId || !this.remoteUserId) {
      throw new Error("No hay llamada entrante para contestar");
    }

    const supabase = createBrowserSupabase();
    this.setState("connecting");

    // Inicializar WebRTC
    this.webrtc = new WebRTCManager();
    this.localStream = await this.webrtc.initialize(this.callType);

    // Crear canal de señalización
    this.channel = createCallChannel(this.callId);
    this.setupSignalHandlers(userId);
    await this.channel.subscribe();

    // Manejar ICE candidates
    this.webrtc.onIceCandidate = (candidate) => {
      if (this.channel && this.callId) {
        sendSignal(this.channel, {
          type: "ice-candidate",
          from: userId,
          to: this.remoteUserId!,
          payload: candidate.toJSON(),
          callId: this.callId,
          callType: this.callType,
        });
      }
    };

    // Estado de conexión
    this.webrtc.onConnectionStateChange = (connState) => {
      if (connState === "connected") {
        this.setState("active");
        this.startDurationTimer();
      } else if (connState === "failed" || connState === "disconnected") {
        this.endCall("connection_failed");
      }
    };

    // Track remoto
    this.webrtc.onTrack = (stream) => {
      this.remoteStream = stream;
      this.onRemoteStream?.(stream);
    };

    // Manejar la oferta y crear respuesta
    const answer = await this.webrtc.handleOffer(offer);

    // Enviar respuesta por señalización
    const answerCallId = this.callId;
    const answerRemoteUserId = this.remoteUserId;
    await sendSignal(this.channel, {
      type: "answer",
      from: userId,
      to: answerRemoteUserId,
      payload: answer,
      callId: answerCallId,
      callType: this.callType,
    });

    // Actualizar BD: llamada activa
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("call_log")
      .update({
        status: "active",
        answered_at: new Date().toISOString(),
      })
      .eq("id", answerCallId);
  }

  /**
   * Rechazar una llamada entrante.
   */
  async reject(userId: string): Promise<void> {
    if (!this.callId || !this.remoteUserId) return;

    const supabase = createBrowserSupabase();

    // Enviar señal de rechazo
    if (this.channel) {
      await sendSignal(this.channel, {
        type: "reject",
        from: userId,
        to: this.remoteUserId,
        payload: null,
        callId: this.callId,
        callType: this.callType,
      });
    }

    // Actualizar BD
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("call_log")
      .update({
        status: "rejected",
        ended_at: new Date().toISOString(),
        end_reason: "rejected",
      })
      .eq("id", this.callId);

    this.cleanup();
    this.setState("ended");
  }

  /**
   * Finalizar la llamada activa.
   */
  async endCall(reason = "normal"): Promise<void> {
    if (!this.callId) return;

    const supabase = createBrowserSupabase();
    const wasActive = this.state === "active";

    // Enviar señal de colgar
    if (this.channel && this.remoteUserId) {
      await sendSignal(this.channel, {
        type: "hang-up",
        from: "",
        to: this.remoteUserId,
        payload: { reason },
        callId: this.callId,
        callType: this.callType,
      }).catch(() => {});
    }

    // Determinar estado final
    let finalStatus: string;
    if (reason === "no_answer") {
      finalStatus = "missed";
    } else if (reason === "rejected") {
      finalStatus = "rejected";
    } else if (reason === "connection_failed") {
      finalStatus = "failed";
    } else {
      finalStatus = "ended";
    }

    // Actualizar BD con duración
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("call_log")
      .update({
        status: finalStatus,
        ended_at: new Date().toISOString(),
        duration_seconds: wasActive ? this.duration : 0,
        end_reason: reason,
      })
      .eq("id", this.callId);

    this.cleanup();
    this.setState("ended");
  }

  /**
   * Silenciar / activar micrófono.
   */
  toggleMute(): boolean {
    if (!this.webrtc) return this.isMuted;
    this.isMuted = this.webrtc.toggleMute();
    return this.isMuted;
  }

  /**
   * Activar / desactivar cámara.
   */
  toggleCamera(): boolean {
    if (!this.webrtc) return this.isCameraOff;
    this.isCameraOff = this.webrtc.toggleCamera();
    return this.isCameraOff;
  }

  /**
   * Preparar el estado para una llamada entrante (antes de contestar).
   */
  setIncomingCall(
    callId: string,
    callerId: string,
    callType: CallType
  ): void {
    this.callId = callId;
    this.remoteUserId = callerId;
    this.callType = callType;
    this.setState("incoming");
  }

  // --- Privados ---

  private setupSignalHandlers(userId: string): void {
    if (!this.channel) return;

    onSignal(this.channel, async (signal: SignalMessage) => {
      if (signal.to !== userId) return;

      switch (signal.type) {
        case "answer":
          if (this.webrtc) {
            await this.webrtc.handleAnswer(
              signal.payload as RTCSessionDescriptionInit
            );
            this.setState("connecting");
          }
          break;

        case "ice-candidate":
          if (this.webrtc) {
            await this.webrtc.addIceCandidate(
              signal.payload as RTCIceCandidateInit
            );
          }
          break;

        case "hang-up":
          this.cleanup();
          this.setState("ended");
          break;

        case "reject":
          this.cleanup();
          this.setState("ended");
          break;

        case "busy":
          this.cleanup();
          this.setState("ended");
          break;
      }
    });
  }

  private startDurationTimer(): void {
    this.callStartTime = Date.now();
    this.duration = 0;

    this.durationTimer = setInterval(() => {
      if (this.callStartTime) {
        this.duration = Math.floor((Date.now() - this.callStartTime) / 1000);
        this.onDurationUpdate?.(this.duration);
      }
    }, 1000);
  }

  private cleanup(): void {
    if (this.ringTimeout) {
      clearTimeout(this.ringTimeout);
      this.ringTimeout = null;
    }
    if (this.durationTimer) {
      clearInterval(this.durationTimer);
      this.durationTimer = null;
    }
    if (this.webrtc) {
      this.webrtc.hangUp();
      this.webrtc = null;
    }
    if (this.channel) {
      const supabase = createBrowserSupabase();
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.localStream = null;
    this.remoteStream = null;
    this.callId = null;
    this.remoteUserId = null;
    this.callStartTime = null;
    this.isMuted = false;
    this.isCameraOff = false;
    this.duration = 0;
  }
}
