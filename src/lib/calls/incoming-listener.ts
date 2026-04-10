/**
 * Listener global para llamadas entrantes.
 * Se suscribe al canal personal del usuario para recibir notificaciones de llamada.
 */

import { createBrowserSupabase } from "@/lib/supabase/client";

export interface IncomingCallData {
  callId: string;
  callerId: string;
  callerName: string;
  callType: "voice" | "video";
  offer: RTCSessionDescriptionInit;
}

/**
 * Inicia un listener para llamadas entrantes dirigidas al usuario.
 * Devuelve una función de cleanup para desuscribirse.
 */
export function startIncomingCallListener(
  userId: string,
  onIncomingCall: (data: IncomingCallData) => void
): () => void {
  const supabase = createBrowserSupabase();
  const channel = supabase.channel(`incoming:${userId}`);

  channel
    .on("broadcast", { event: "incoming-call" }, ({ payload }) => {
      const data = payload as IncomingCallData;
      onIncomingCall(data);
    })
    .subscribe();

  // Devolver función de limpieza
  return () => {
    supabase.removeChannel(channel);
  };
}
