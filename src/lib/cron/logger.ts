/**
 * Cron Logger — logs every cron execution to cron_logs table
 */

import { getServiceRoleClient } from "@/lib/supabase/service";

const supabase = getServiceRoleClient();

/** Log a successful cron execution */
export async function logCronResult(
  cronName: string,
  metrics: Record<string, unknown>,
  durationMs?: number
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("cron_logs") as any).insert({
      cron_name: cronName,
      status: "success",
      duration_ms: durationMs || 0,
      metrics,
    });
  } catch { /* never fail */ }
}

/** Log a failed cron execution */
export async function logCronError(
  cronName: string,
  error: string,
  durationMs?: number
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("cron_logs") as any).insert({
      cron_name: cronName,
      status: "error",
      duration_ms: durationMs || 0,
      error,
    });
  } catch { /* never fail */ }
}
