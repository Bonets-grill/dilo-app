/**
 * Señalización WebRTC via Supabase Realtime
 * Gestiona el intercambio de offers, answers e ICE candidates entre peers.
 */

import { createBrowserSupabase } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface SignalMessage {
  type: "offer" | "answer" | "ice-candidate" | "hang-up" | "reject" | "busy";
  from: string;
  to: string;
  payload: unknown;
  callId: string;
  callType: "voice" | "video";
}

/**
 * Crea un canal de Supabase Realtime para una llamada específica.
 */
export function createCallChannel(callId: string): RealtimeChannel {
  const supabase = createBrowserSupabase();
  return supabase.channel(`call:${callId}`, {
    config: { broadcast: { self: false } },
  });
}

/**
 * Envía una señal a través del canal de la llamada.
 */
export async function sendSignal(
  channel: RealtimeChannel,
  signal: SignalMessage
): Promise<void> {
  await channel.send({
    type: "broadcast",
    event: "signal",
    payload: signal,
  });
}

/**
 * Escucha señales entrantes en el canal.
 */
export function onSignal(
  channel: RealtimeChannel,
  callback: (signal: SignalMessage) => void
): void {
  channel.on("broadcast", { event: "signal" }, ({ payload }) => {
    callback(payload as SignalMessage);
  });
}
