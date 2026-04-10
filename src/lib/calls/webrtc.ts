/**
 * WebRTC Peer Connection Manager
 * Gestiona la conexión peer-to-peer para llamadas de voz y vídeo.
 */

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// Añadir TURN server si está configurado
if (
  typeof process !== "undefined" &&
  process.env?.NEXT_PUBLIC_TURN_URL
) {
  ICE_SERVERS.push({
    urls: process.env.NEXT_PUBLIC_TURN_URL,
    username: process.env.NEXT_PUBLIC_TURN_USER || "",
    credential: process.env.NEXT_PUBLIC_TURN_PASS || "",
  });
}

export type CallType = "voice" | "video";

export class WebRTCManager {
  private pc: RTCPeerConnection | null = null;
  private _localStream: MediaStream | null = null;
  private _isMuted = false;
  private _isCameraOff = false;

  /** Callbacks externos */
  onTrack: ((stream: MediaStream) => void) | null = null;
  onIceCandidate: ((candidate: RTCIceCandidate) => void) | null = null;
  onConnectionStateChange: ((state: RTCPeerConnectionState) => void) | null = null;

  get localStream(): MediaStream | null {
    return this._localStream;
  }

  get isMuted(): boolean {
    return this._isMuted;
  }

  get isCameraOff(): boolean {
    return this._isCameraOff;
  }

  /**
   * Inicializa la conexión: obtiene media del usuario y crea el RTCPeerConnection.
   */
  async initialize(callType: CallType): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: callType === "video" ? { facingMode: "user" } : false,
    };

    this._localStream = await navigator.mediaDevices.getUserMedia(constraints);

    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Añadir tracks locales al peer connection
    for (const track of this._localStream.getTracks()) {
      this.pc.addTrack(track, this._localStream);
    }

    // Manejar tracks remotos
    this.pc.ontrack = (event) => {
      if (event.streams[0] && this.onTrack) {
        this.onTrack(event.streams[0]);
      }
    };

    // Reenviar ICE candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidate) {
        this.onIceCandidate(event.candidate);
      }
    };

    // Estado de conexión
    this.pc.onconnectionstatechange = () => {
      if (this.onConnectionStateChange && this.pc) {
        this.onConnectionStateChange(this.pc.connectionState);
      }
    };

    return this._localStream;
  }

  /**
   * Crea una oferta SDP (quien inicia la llamada).
   */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error("PeerConnection no inicializado");
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  /**
   * Maneja una oferta recibida y genera una respuesta.
   */
  async handleOffer(
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error("PeerConnection no inicializado");
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  /**
   * Maneja la respuesta SDP del peer remoto.
   */
  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) throw new Error("PeerConnection no inicializado");
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  /**
   * Añade un ICE candidate recibido del peer remoto.
   */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) throw new Error("PeerConnection no inicializado");
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  /**
   * Silenciar / activar micrófono.
   */
  toggleMute(): boolean {
    if (!this._localStream) return this._isMuted;
    for (const track of this._localStream.getAudioTracks()) {
      track.enabled = this._isMuted; // Si estaba muted, activar
    }
    this._isMuted = !this._isMuted;
    return this._isMuted;
  }

  /**
   * Activar / desactivar cámara.
   */
  toggleCamera(): boolean {
    if (!this._localStream) return this._isCameraOff;
    for (const track of this._localStream.getVideoTracks()) {
      track.enabled = this._isCameraOff; // Si estaba off, activar
    }
    this._isCameraOff = !this._isCameraOff;
    return this._isCameraOff;
  }

  /**
   * Cambiar entre cámara frontal y trasera (móvil).
   */
  async switchCamera(): Promise<void> {
    if (!this._localStream || !this.pc) return;

    const currentTrack = this._localStream.getVideoTracks()[0];
    if (!currentTrack) return;

    // Detectar dirección actual
    const settings = currentTrack.getSettings();
    const newFacing = settings.facingMode === "user" ? "environment" : "user";

    // Obtener nuevo stream de vídeo
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: newFacing },
    });

    const newTrack = newStream.getVideoTracks()[0];

    // Reemplazar track en el peer connection
    const sender = this.pc
      .getSenders()
      .find((s) => s.track?.kind === "video");
    if (sender) {
      await sender.replaceTrack(newTrack);
    }

    // Parar track viejo y reemplazar en stream local
    currentTrack.stop();
    this._localStream.removeTrack(currentTrack);
    this._localStream.addTrack(newTrack);
  }

  /**
   * Terminar la llamada: parar tracks y cerrar conexión.
   */
  hangUp(): void {
    if (this._localStream) {
      for (const track of this._localStream.getTracks()) {
        track.stop();
      }
      this._localStream = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this._isMuted = false;
    this._isCameraOff = false;
  }
}
