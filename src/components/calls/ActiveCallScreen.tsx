"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  SwitchCamera,
  Volume2,
} from "lucide-react";
import { useCall } from "./CallProvider";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function ActiveCallScreen() {
  const t = useTranslations("calls");
  const {
    callState,
    callType,
    remoteUserName,
    duration,
    isMuted,
    isCameraOff,
    localStream,
    remoteStream,
    endCall,
    toggleMute,
    toggleCamera,
    switchCamera,
  } = useCall();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Attach streams to video elements
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const isVideo = callType === "video";

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
      {/* Video call layout */}
      {isVideo ? (
        <>
          {/* Remote video (full screen) */}
          <div className="flex-1 relative">
            {remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl font-bold text-white">
                      {remoteUserName?.charAt(0)?.toUpperCase() || "?"}
                    </span>
                  </div>
                  <p className="text-white text-lg font-semibold">
                    {remoteUserName}
                  </p>
                  <p className="text-[var(--dim)] text-sm mt-1">
                    {callState === "connecting" || callState === "outgoing"
                      ? t("outgoingCall")
                      : formatDuration(duration)}
                  </p>
                </div>
              </div>
            )}

            {/* Local video (PiP corner) */}
            {localStream && !isCameraOff && (
              <div className="absolute top-12 right-4 w-28 h-40 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover mirror"
                  style={{ transform: "scaleX(-1)" }}
                />
              </div>
            )}
          </div>
        </>
      ) : (
        /* Voice call layout */
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center mb-6">
            <span className="text-4xl font-bold text-white">
              {remoteUserName?.charAt(0)?.toUpperCase() || "?"}
            </span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            {remoteUserName}
          </h2>
          <p className="text-[var(--dim)] text-lg">
            {callState === "connecting" || callState === "outgoing"
              ? t("outgoingCall")
              : formatDuration(duration)}
          </p>
        </div>
      )}

      {/* Controls bar */}
      <div className="flex-shrink-0 pb-12 pt-6 px-8">
        <div className="flex items-center justify-center gap-6">
          {/* Mute */}
          <button
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
              isMuted ? "bg-white text-black" : "bg-white/15 text-white"
            }`}
            title={isMuted ? t("unmute") : t("mute")}
          >
            {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
          </button>

          {/* Speaker (voice only) */}
          {!isVideo && (
            <button
              className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center text-white"
              title={t("speaker")}
            >
              <Volume2 size={22} />
            </button>
          )}

          {/* Camera toggle (video only) */}
          {isVideo && (
            <button
              onClick={toggleCamera}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                isCameraOff ? "bg-white text-black" : "bg-white/15 text-white"
              }`}
              title={isCameraOff ? t("cameraOn") : t("cameraOff")}
            >
              {isCameraOff ? <VideoOff size={22} /> : <Video size={22} />}
            </button>
          )}

          {/* Switch camera (video only) */}
          {isVideo && (
            <button
              onClick={switchCamera}
              className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center text-white"
              title={t("switchCamera")}
            >
              <SwitchCamera size={22} />
            </button>
          )}

          {/* Hang up */}
          <button
            onClick={endCall}
            className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center active:scale-95 transition-transform"
            title={t("hangUp")}
          >
            <PhoneOff size={26} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
