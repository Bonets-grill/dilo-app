import { NextRequest, NextResponse } from "next/server";

const ASSEMBLYAI_KEY = process.env.ASSEMBLYAI_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const BASE = "https://api.assemblyai.com/v2";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const audio = formData.get("audio") as Blob | null;
  const locale = (formData.get("locale") as string) || "es";

  if (!audio) {
    return NextResponse.json({ error: "No audio" }, { status: 400 });
  }

  // Primary: OpenAI Whisper — typical latency 1-3s, 4.2% WER
  // (Antes era AssemblyAI primario con polling 3-30s; Mario reportó que se
  //  demora demasiado. Whisper responde sync en ~1s, la diferencia de WER es
  //  marginal para español.)
  if (OPENAI_KEY && OPENAI_KEY !== "placeholder") {
    try {
      const text = await transcribeOpenAI(audio, locale);
      if (text) return NextResponse.json({ text: normalizeTranscription(text) });
    } catch (err) {
      console.error("[Whisper] Error, falling back to AssemblyAI:", err);
    }
  }

  // Fallback: AssemblyAI Universal-3 Pro (3.2% WER, con polling)
  if (ASSEMBLYAI_KEY && ASSEMBLYAI_KEY !== "placeholder") {
    try {
      const text = await transcribeAssemblyAI(audio, locale);
      return NextResponse.json({ text: normalizeTranscription(text || "") });
    } catch (err) {
      console.error("[AssemblyAI] Error:", err);
    }
  }

  return NextResponse.json({ error: "No STT service configured" }, { status: 500 });
}

// ── AssemblyAI Universal-3 Pro ──
async function transcribeAssemblyAI(audio: Blob, locale: string): Promise<string | null> {
  const buffer = Buffer.from(await audio.arrayBuffer());
  const lang = locale.split("-")[0]; // "es", "en", "fr", "it", "de"

  // Step 1: Upload audio
  const uploadRes = await fetch(`${BASE}/upload`, {
    method: "POST",
    headers: {
      Authorization: ASSEMBLYAI_KEY!,
      "Content-Type": "application/octet-stream",
    },
    body: buffer,
  });
  if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
  const { upload_url } = await uploadRes.json();

  // Step 2: Create transcription
  const transcriptRes = await fetch(`${BASE}/transcript`, {
    method: "POST",
    headers: {
      Authorization: ASSEMBLYAI_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio_url: upload_url,
      speech_model: "best",
      language_code: lang,
    }),
  });
  if (!transcriptRes.ok) throw new Error(`Transcript create failed: ${transcriptRes.status}`);
  const transcript = await transcriptRes.json();

  // Step 3: Poll until done (3-8 sec for short clips)
  let result = transcript;
  const maxPolls = 30; // 30 seconds max
  for (let i = 0; i < maxPolls; i++) {
    if (result.status === "completed" || result.status === "error") break;
    await new Promise(r => setTimeout(r, 1000));
    const pollRes = await fetch(`${BASE}/transcript/${result.id}`, {
      headers: { Authorization: ASSEMBLYAI_KEY! },
    });
    result = await pollRes.json();
  }

  if (result.status === "error") {
    throw new Error(`Transcription error: ${result.error}`);
  }
  if (result.status !== "completed") {
    throw new Error("Transcription timeout");
  }

  return result.text || null;
}

// ── OpenAI Whisper (fallback) ──
async function transcribeOpenAI(audio: Blob, locale: string): Promise<string | null> {
  const buffer = Buffer.from(await audio.arrayBuffer());
  const file = new File([buffer], "audio.webm", { type: audio.type || "audio/webm" });

  const whisperForm = new FormData();
  whisperForm.append("file", file);
  whisperForm.append("model", "whisper-1");
  whisperForm.append("language", locale.split("-")[0]);

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}` },
    body: whisperForm,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[Whisper] Error:", res.status, errText);
    throw new Error("Whisper transcription failed");
  }

  const data = await res.json();
  return data.text || null;
}

// ── Normalize spoken patterns to their written form ──
function normalizeTranscription(text: string): string {
  let t = text;

  // Email patterns: "info arroba bonnet grill punto com" → "info@bonnetgrill.com"
  // Handle "arroba" → "@" and collapse spaces around it into an email
  t = t.replace(/(\S+)\s+arroba\s+([\w\s]+?)\s+punto\s+(com|es|org|net|io|app|dev|co|eu|info)\b/gi,
    (_, local, domain, tld) => `${local}@${domain.replace(/\s+/g, "")}\.${tld}`);
  // Fallback: just replace "arroba" → "@"
  t = t.replace(/\s+arroba\s+/gi, "@");
  // Handle "punto" in domain context after @
  t = t.replace(/(@\S+)\s+punto\s+/gi, "$1.");
  t = t.replace(/(\S+@\S+?)(?:\s+punto\s+)(\S+)/gi, "$1.$2");
  // "algo punto com/es/org" → "algo.com"
  t = t.replace(/(\w+)\s+punto\s+(com|es|org|net|io|app|dev|co|eu|info)\b/gi, "$1.$2");

  // Phone patterns: "más 34" or "mas 34" → "+34"
  t = t.replace(/\bm[aá]s\s+(\d)/gi, "+$1");

  // Remove spaces in phone numbers after +: "+34 692 325 738" → "+34692325738"
  t = t.replace(/(\+\d{1,3})\s+(\d[\d\s]*\d)/g, (_, prefix, rest) => prefix + rest.replace(/\s/g, ""));

  // "guion" or "guión" → "-"
  t = t.replace(/\s+gui[oó]n\s+/gi, "-");

  // "barra" → "/"
  t = t.replace(/\s+barra\s+/gi, "/");

  // "doble uve doble" / "doble u doble u doble u" → "www"
  t = t.replace(/\btriple\s+w\b/gi, "www");
  t = t.replace(/\bw{3}\b/gi, "www");

  // Clean up multiple spaces
  t = t.replace(/\s{2,}/g, " ").trim();

  return t;
}
