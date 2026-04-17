import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: user } = await supabase.from("users").select("id, email").eq("email", "l.gomez1010@icloud.com").single();
if (!user) { console.error("no user"); process.exit(1); }
console.log(`User: ${user.email} (${user.id})\n`);

const { data: reminders } = await supabase
  .from("reminders")
  .select("id, text, due_at, status, repeat_count, repeats_sent, created_at, channel")
  .eq("user_id", user.id)
  .order("created_at", { ascending: false })
  .limit(15);

console.log(`=== Últimos ${reminders?.length || 0} recordatorios ===\n`);
for (const r of reminders || []) {
  console.log(`[${r.status.toUpperCase()}] ${r.text}`);
  console.log(`  due_at:      ${r.due_at}`);
  console.log(`  created_at:  ${r.created_at}`);
  console.log(`  channel:     ${r.channel}`);
  console.log(`  repeats:     ${r.repeats_sent || 0}/${r.repeat_count || 1}`);
  console.log();
}
