import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

console.log("══ FIX 1: push notification URL is '/dm' ══");
const dmRoute = fs.readFileSync("src/app/api/dm/route.ts","utf8");
const connRoute = fs.readFileSync("src/app/api/connections/route.ts","utf8");
console.log("dm/route.ts        →", /url: "\/dm"/.test(dmRoute) ? "url: /dm ✓" : "FAIL");
console.log("connections/route  →", /url: "\/dm"/.test(connRoute) ? "url: /dm ✓" : "FAIL");
console.log("no /channels refs  →", !/"\/channels"/.test(dmRoute) && !/"\/channels"/.test(connRoute) ? "✓" : "FAIL");

console.log("\n══ FIX 2: DM MediaRecorder mime detection ══");
const dmPage = fs.readFileSync("src/app/[locale]/(app)/dm/page.tsx","utf8");
console.log("isTypeSupported used →", /isTypeSupported/.test(dmPage) ? "✓" : "FAIL");
console.log("no hardcoded webm   →", !/mimeType:\s*"audio\/webm"\s*}/.test(dmPage) ? "✓" : "FAIL");

console.log("\n══ FIX 3: audio.play awaited + onerror ══");
console.log("async toggleAudio →", /async function toggleAudio/.test(dmPage) ? "✓" : "FAIL");
console.log("audio.onerror      →", /audio\.onerror/.test(dmPage) ? "✓" : "FAIL");
console.log("await audio.play   →", /await audio\.play/.test(dmPage) ? "✓" : "FAIL");

console.log("\n══ FIX 4: inbox realtime subscription ══");
console.log("dm-inbox-${userId} channel →", /dm-inbox-\$\{userId\}/.test(dmPage) ? "✓" : "FAIL");
console.log("filters by receiver_id      →", /filter: `receiver_id=eq\.\$\{userId\}`/.test(dmPage) ? "✓" : "FAIL");

console.log("\n══ FIX 5: PTT completely removed ══");
console.log("no pttRef/pttActive/toggelePTT →", !/pttRef|pttActive|togglePTT|pttTalking|pttStatus/.test(dmPage) ? "✓" : "FAIL");
console.log("no import ptt                  →", !/from "@\/lib\/rtc\/ptt"/.test(dmPage) ? "✓" : "FAIL");

console.log("\n══ FIX 6: transcribe order (Whisper first) ══");
const trRoute = fs.readFileSync("src/app/api/transcribe/route.ts","utf8");
const whisperIdx = trRoute.indexOf("transcribeOpenAI(audio");
const assemblyIdx = trRoute.indexOf("transcribeAssemblyAI(audio");
console.log("Whisper index   :", whisperIdx);
console.log("AssemblyAI index:", assemblyIdx);
console.log("Whisper-first →", whisperIdx > 0 && whisperIdx < assemblyIdx ? "✓" : "FAIL");

console.log("\n══ FIX 7: transcribe error surface in client ══");
const chatPage = fs.readFileSync("src/app/[locale]/(app)/chat/page.tsx","utf8");
console.log("429 handled → ", /res\.status === 429/.test(chatPage) ? "✓" : "FAIL");
console.log("empty text handled →", /No se pudo transcribir/.test(chatPage) ? "✓" : "FAIL");
console.log("no silent catch →", !/catch \{ \/\* \*\/ \}\s*\n\s*setTranscribing\(false\)/.test(chatPage) ? "✓" : "FAIL");

console.log("\n══ FIX 4 LIVE: realtime channel actually fires on INSERT ══");
// Buscar 2 usuarios conectados con accepted
const { data: conn } = await supa.from("user_connections").select("requester_id,receiver_id").eq("status","accepted").limit(1).maybeSingle();
if (!conn) { console.log("(no accepted connections to test with, skip)"); }
else {
  let received = false;
  const ch = supa.channel(`proof-inbox-${conn.receiver_id}`)
    .on("postgres_changes", { event:"INSERT", schema:"public", table:"direct_messages", filter:`receiver_id=eq.${conn.receiver_id}` }, () => { received = true; })
    .subscribe();
  await new Promise(r => setTimeout(r, 1500)); // let subscription connect
  const { data: msg } = await supa.from("direct_messages").insert({ sender_id: conn.requester_id, receiver_id: conn.receiver_id, content: "PROOF-ping-"+Date.now(), message_type:"text" }).select("id").single();
  await new Promise(r => setTimeout(r, 2000));
  console.log("inserted msg id:", msg?.id);
  console.log("realtime event received →", received ? "✓" : "✗ (Supabase Realtime might not be enabled for direct_messages)");
  await supa.from("direct_messages").delete().eq("id", msg.id);
  ch.unsubscribe();
}

console.log("\n══ FIX 6 LIVE: transcribe latency end-to-end ══");
// Generar un audio de prueba corto (silence WAV) — solo para medir latencia de Whisper
// Nota: Whisper puede devolver vacío para silencio, pero la latency se mide igual
const t0 = Date.now();
const { default: OpenAI } = await import("openai");
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
// WAV mínimo: header + 0.5s de silencio @ 16kHz mono 16-bit
const sampleRate = 16000, samples = sampleRate / 2;
const header = Buffer.alloc(44);
header.write("RIFF",0); header.writeUInt32LE(36 + samples*2, 4); header.write("WAVE",8);
header.write("fmt ",12); header.writeUInt32LE(16,16); header.writeUInt16LE(1,20); header.writeUInt16LE(1,22);
header.writeUInt32LE(sampleRate,24); header.writeUInt32LE(sampleRate*2,28); header.writeUInt16LE(2,32); header.writeUInt16LE(16,34);
header.write("data",36); header.writeUInt32LE(samples*2,40);
const pcm = Buffer.alloc(samples*2); // silence
const wav = Buffer.concat([header, pcm]);
fs.writeFileSync("/tmp/silence.wav", wav);
const { toFile } = await import("openai/uploads");
const file = await toFile(wav, "a.wav", { type: "audio/wav" });
const r = await openai.audio.transcriptions.create({ file, model: "whisper-1", language: "es" });
console.log("Whisper latency:", (Date.now()-t0)+"ms");
console.log("Whisper result:", JSON.stringify(r.text || "(empty)"));
