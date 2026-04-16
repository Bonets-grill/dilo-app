import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. List recent users to see what's there
const { data: users } = await supabase
  .from("users")
  .select("id, email, name, created_at")
  .order("created_at", { ascending: false })
  .limit(20);

console.log("Recent users in public.users:");
for (const u of users || []) console.log(`  ${u.created_at.slice(0,10)} · ${u.email || "(no email)"} · ${u.name || "(no name)"} · ${u.id}`);

// 2. Also check auth.users via admin
const { data: authList } = await supabase.auth.admin.listUsers({ perPage: 20 });
console.log("\nRecent auth.users:");
for (const u of authList?.users || []) console.log(`  ${u.created_at.slice(0,10)} · ${u.email || "(no email)"} · ${u.id}`);
