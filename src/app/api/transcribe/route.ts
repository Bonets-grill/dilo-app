import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const audio = formData.get("audio") as Blob | null;

  if (!audio) {
    return NextResponse.json({ error: "No audio provided" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  // Mock response for development
  if (!apiKey || apiKey === "placeholder") {
    return NextResponse.json({ text: "[Voice transcription - requires OpenAI API key]" });
  }

  // Real Whisper transcription
  const whisperFormData = new FormData();
  whisperFormData.append("file", audio, "audio.webm");
  whisperFormData.append("model", "whisper-1");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: whisperFormData,
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
  }

  const data = await res.json();
  return NextResponse.json({ text: data.text });
}
