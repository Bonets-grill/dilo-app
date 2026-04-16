import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const email = process.argv[2], skillId = process.argv[3];
const { data: user } = await supabase.from("users").select("id, email").eq("email", email).single();
if (!user) { console.error("no user"); process.exit(1); }
console.log(`✓ user ${user.id}`);
const { data, error } = await supabase.from("user_skills").upsert(
  { user_id: user.id, skill_id: skillId, source: "admin_grant", status: "active" },
  { onConflict: "user_id,skill_id" }
).select("id, skill_id, status, source").single();
if (error) { console.error(error.message); process.exit(1); }
console.log("✓ Granted:", data);
