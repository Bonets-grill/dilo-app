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

  // Primary: AssemblyAI Universal-3 Pro (best quality, 3.2% WER)
  if (ASSEMBLYAI_KEY && ASSEMBLYAI_KEY !== "placeholder") {
    try {
      const text = await transcribeAssemblyAI(audio, locale);
      if (text) return NextResponse.json({ text });
    } catch (err) {
      console.error("[AssemblyAI] Error, falling back to OpenAI:", err);
    }
  }

  // Fallback: OpenAI Whisper (4.2% WER, reliable)
  if (OPENAI_KEY && OPENAI_KEY !== "placeholder") {
    try {
      const text = await transcribeOpenAI(audio, locale);
      return NextResponse.json({ text: text || "" });
    } catch (err) {
      console.error("[Whisper] Error:", err);
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
