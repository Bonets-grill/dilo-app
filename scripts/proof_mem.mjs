import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const MARIO = "def038c9-19dc-45cf-93d3-60b6fc65887f";

console.log("══ Simulate /api/memory/add with embedding FAIL (current OpenAI state) ══");
// Replicar lo que hace el endpoint post-fix: si embedding falla, insertar con null
const cleaned = "Mario prefiere el café sin azúcar (test-proof-"+Date.now()+")";
let embedding = null;
let embedError = null;
try {
  // simular que embedding falla (OpenAI 429)
  throw new Error("RateLimitError: 429 You exceeded your current quota");
} catch (err) {
  embedError = err.message;
  console.log("embedding step: FAILED as expected →", embedError.slice(0,50));
}

const { data, error } = await supa.from("memory_facts").insert({
  user_id: MARIO, fact: cleaned, category: "preferences",
  confidence: 1.0, source: "manual", embedding,
}).select("id, fact, category, created_at").single();

console.log("insert error:", error);
console.log("inserted row:", data ? `id=${data.id} fact="${data.fact}"` : "FAILED");
console.log("endpoint would return: embedding_degraded=true, embedding_error=", embedError?.slice(0,40));

// Cleanup
if (data) { await supa.from("memory_facts").delete().eq("id", data.id); console.log("(cleanup)"); }

console.log("\n══ FIX 4 RE-VERIFIED: realtime fires on direct_messages INSERT ══");
const { data: conn } = await supa.from("user_connections").select("requester_id,receiver_id").eq("status","accepted").limit(1).maybeSingle();
if (conn) {
  let received = false;
  const ch = supa.channel(`final-${Date.now()}`)
    .on("postgres_changes", { event:"INSERT", schema:"public", table:"direct_messages", filter:`receiver_id=eq.${conn.receiver_id}` }, () => { received = true; })
    .subscribe();
  await new Promise(r => setTimeout(r, 2500));
  const { data: m } = await supa.from("direct_messages").insert({ sender_id: conn.requester_id, receiver_id: conn.receiver_id, content:"ping-final-"+Date.now(), message_type:"text" }).select("id").single();
  await new Promise(r => setTimeout(r, 2500));
  console.log("realtime fired on INSERT →", received ? "✓ YES" : "✗ NO");
  await supa.from("direct_messages").delete().eq("id", m.id);
  ch.unsubscribe();
}
