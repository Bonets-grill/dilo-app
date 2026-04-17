/**
 * Client-side WAV encoder.
 *
 * Takes a Blob recorded by MediaRecorder (webm/opus on Chrome, mp4/aac on
 * Safari) and returns a 16-bit mono PCM WAV Blob that plays in every modern
 * browser, including Safari — which does NOT decode webm/opus.
 *
 * Pipeline: Blob → AudioContext.decodeAudioData (PCM Float32, whatever rate)
 *           → mixDownToMono → resample to 16kHz → write 44-byte WAV header.
 *
 * No external dependencies, ~100 lines, runs fully client-side.
 */

type MaybeAC = {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

export async function toWavBlob(input: Blob, opts?: { sampleRate?: number }): Promise<Blob> {
  const g = window as unknown as MaybeAC;
  const AC = g.AudioContext || g.webkitAudioContext;
  if (!AC) throw new Error("AudioContext not available");

  const ctx = new AC();
  try {
    const arrayBuffer = await input.arrayBuffer();
    // Safari's decodeAudioData mutates the buffer → slice(0) to hand a copy.
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const targetRate = opts?.sampleRate ?? 16000; // voice-grade mono
    const mono = mixDownToMono(audioBuffer);
    const resampled = resample(mono, audioBuffer.sampleRate, targetRate);
    return encodeWav(resampled, targetRate);
  } finally {
    await ctx.close().catch(() => {});
  }
}

function mixDownToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const len = buffer.length;
  const out = new Float32Array(len);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) out[i] += data[i];
  }
  for (let i = 0; i < len; i++) out[i] /= buffer.numberOfChannels;
  return out;
}

function resample(data: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return data;
  const ratio = fromRate / toRate;
  const newLen = Math.floor(data.length / ratio);
  const out = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const srcIdx = i * ratio;
    const i0 = Math.floor(srcIdx);
    const i1 = Math.min(i0 + 1, data.length - 1);
    const frac = srcIdx - i0;
    out[i] = data[i0] * (1 - frac) + data[i1] * frac;
  }
  return out;
}

function encodeWav(pcm: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const numChannels = 1;
  const byteRate = sampleRate * numChannels * bytesPerSample;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = pcm.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, s: string) {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}
