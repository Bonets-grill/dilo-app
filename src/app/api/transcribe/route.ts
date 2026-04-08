import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const audio = formData.get("audio") as Blob | null;
  const locale = (formData.get("locale") as string) || "es";

  if (!audio) {
    return NextResponse.json({ error: "No audio" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === "placeholder") {
    return NextResponse.json({ error: "OpenAI key not configured" }, { status: 500 });
  }

  // Convert to proper file for Whisper
  const buffer = Buffer.from(await audio.arrayBuffer());
  const file = new File([buffer], "audio.webm", { type: audio.type || "audio/webm" });

  const whisperForm = new FormData();
  whisperForm.append("file", file);
  whisperForm.append("model", "whisper-1");
  whisperForm.append("language", locale.split("-")[0]); // "es", "en", "fr", etc

  try {
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: whisperForm,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Whisper] Error:", res.status, errText);
      return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
    }

    const data = await res.json();
    return NextResponse.json({ text: data.text || "" });
  } catch (err) {
    console.error("[Whisper] Exception:", err);
    return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
  }
}
