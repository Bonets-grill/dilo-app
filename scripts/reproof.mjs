import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

console.log("══ FIX #4 RE-TEST: realtime after migration 046 ══");
const { data: conn } = await supa.from("user_connections").select("requester_id,receiver_id").eq("status","accepted").limit(1).maybeSingle();
if (!conn) { console.log("(no accepted conns)"); process.exit(0); }
let received = false;
const ch = supa.channel(`reproof-${conn.receiver_id}-${Date.now()}`)
  .on("postgres_changes", { event:"INSERT", schema:"public", table:"direct_messages", filter:`receiver_id=eq.${conn.receiver_id}` }, (p) => { received = true; console.log("EVENT FIRED:", p.new?.id); })
  .subscribe((status) => console.log("subscription status:", status));
await new Promise(r => setTimeout(r, 3000));
const { data: msg } = await supa.from("direct_messages").insert({ sender_id: conn.requester_id, receiver_id: conn.receiver_id, content: "REPROOF-"+Date.now(), message_type:"text" }).select("id").single();
console.log("inserted:", msg?.id);
await new Promise(r => setTimeout(r, 3000));
console.log("realtime fired →", received ? "✓ YES" : "✗ still broken");
await supa.from("direct_messages").delete().eq("id", msg.id);
ch.unsubscribe();
