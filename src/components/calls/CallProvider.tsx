"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { CallManager, type CallState as CMCallState } from "@/lib/calls/call-manager";
import {
  startIncomingCallListener,
  type IncomingCallData,
} from "@/lib/calls/incoming-listener";
import IncomingCallModal from "./IncomingCallModal";
import ActiveCallScreen from "./ActiveCallScreen";

type CallType = "voice" | "video";

interface CallContextValue {
  callState: CMCallState;
  callType: CallType;
  remoteUserName: string;
  duration: number;
  isMuted: boolean;
  isCameraOff: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  initiateCall: (calleeId: string, calleeName: string, type: CallType) => void;
  answerCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  switchCamera: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
}

export function CallProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const callManagerRef = useRef<CallManager | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const [callState, setCallState] = useState<CMCallState>("idle");
  const [callType, setCallType] = useState<CallType>("voice");
  const [remoteUserName, setRemoteUserName] = useState("");
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(
    null
  );

  // Initialize CallManager
  useEffect(() => {
    if (!callManagerRef.current) {
      const cm = new CallManager();

      cm.onStateChange = (state: CMCallState) => {
        setCallState(state);
        if (state === "ended" || state === "idle") {
          setLocalStream(null);
          setRemoteStream(null);
          setIsMuted(false);
          setIsCameraOff(false);
          setDuration(0);
        }
      };

      cm.onRemoteStream = (stream: MediaStream) => {
        setRemoteStream(stream);
      };

      cm.onDurationUpdate = (seconds: number) => {
        setDuration(seconds);
      };

      callManagerRef.current = cm;
    }
  }, []);

  // Start incoming call listener
  useEffect(() => {
    unsubRef.current = startIncomingCallListener(
      userId,
      (data: IncomingCallData) => {
        // Prepare the call manager for the incoming call
        const cm = callManagerRef.current;
        if (!cm || cm.state !== "idle") return;

        cm.setIncomingCall(data.callId, data.callerId, data.callType);
        setIncomingCall(data);
        setCallType(data.callType);
        setRemoteUserName(data.callerName);
        // callState will be set by the cm.onStateChange callback
      }
    );

    return () => {
      if (unsubRef.current) {
        unsubRef.current();
      }
    };
  }, [userId]);

  const initiateCall = useCallback(
    (calleeId: string, calleeName: string, type: CallType) => {
      const cm = callManagerRef.current;
      if (!cm || cm.state !== "idle") return;
      setCallType(type);
      setRemoteUserName(calleeName);
      cm.call(userId, calleeId, calleeName, type).then(() => {
        if (cm.localStream) setLocalStream(cm.localStream);
      });
    },
    [userId]
  );

  const answerCall = useCallback(() => {
    const cm = callManagerRef.current;
    if (!incomingCall || !cm) return;
    cm.answer(userId, incomingCall.offer).then(() => {
      if (cm.localStream) setLocalStream(cm.localStream);
    });
    setIncomingCall(null);
  }, [incomingCall, userId]);

  const rejectCall = useCallback(() => {
    const cm = callManagerRef.current;
    if (!cm) return;
    cm.reject(userId);
    setIncomingCall(null);
  }, [userId]);

  const endCall = useCallback(() => {
    const cm = callManagerRef.current;
    if (!cm) return;
    cm.endCall("normal");
    setIncomingCall(null);
  }, []);

  const toggleMute = useCallback(() => {
    const cm = callManagerRef.current;
    if (!cm) return;
    const muted = cm.toggleMute();
    setIsMuted(muted);
  }, []);

  const toggleCamera = useCallback(() => {
    const cm = callManagerRef.current;
    if (!cm) return;
    const camOff = cm.toggleCamera();
    setIsCameraOff(camOff);
  }, []);

  // switchCamera is a no-op if not supported by backend
  const switchCamera = useCallback(() => {
    // Not implemented in CallManager yet — placeholder for future
  }, []);

  const value: CallContextValue = {
    callState,
    callType,
    remoteUserName,
    duration,
    isMuted,
    isCameraOff,
    localStream,
    remoteStream,
    initiateCall,
    answerCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
    switchCamera,
  };

  return (
    <CallContext.Provider value={value}>
      {children}

      {/* Incoming call modal */}
      {callState === "incoming" && incomingCall && (
        <IncomingCallModal
          callerName={incomingCall.callerName}
          callType={incomingCall.callType}
          onAnswer={answerCall}
          onReject={rejectCall}
        />
      )}

      {/* Active call screen */}
      {(callState === "outgoing" ||
        callState === "connecting" ||
        callState === "active") && <ActiveCallScreen />}
    </CallContext.Provider>
  );
}
