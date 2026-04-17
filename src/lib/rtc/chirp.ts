/**
 * Nextel-style "chirp" beeps synthesized with Web Audio API — no assets, no
 * network. Played at 3 transition points in the walkie flow:
 *
 *   playOutgoingChirp()  — local user pressed PTT, about to transmit.
 *   playIncomingChirp()  — remote peer started transmitting, about to hear.
 *   playEndChirp()       — transmission ended (release or remote end).
 *
 * Pattern: two-tone square-ish beep ~180ms total with quick attack + release
 * envelope to avoid clicks. Classic Nextel: slight ascending + descending
 * pair; ours approximates with fixed pitches per direction so the user knows
 * by ear whether it's their press or the peer's.
 */

type MaybeAC = {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (sharedCtx && sharedCtx.state !== "closed") return sharedCtx;
  const g = window as unknown as MaybeAC;
  const Ctor = g.AudioContext || g.webkitAudioContext;
  if (!Ctor) return null;
  sharedCtx = new Ctor();
  return sharedCtx;
}

interface ToneSpec {
  freq: number;      // Hz
  durMs: number;     // duration of the tone
  peakGain?: number; // 0..1 peak volume (default 0.15 — comfortable, not startling)
  type?: OscillatorType;
}

/** Play a sequence of tones with small inter-tone gaps. Resolves when done. */
async function playSequence(tones: ToneSpec[], gapMs = 30): Promise<void> {
  const ctx = getCtx();
  if (!ctx) return;
  // Resume if suspended by browser autoplay policy (needs a prior user gesture
  // — the caller invokes these from a click/pointerdown, so resume works).
  if (ctx.state === "suspended") {
    try { await ctx.resume(); } catch { /* pass */ }
  }

  let t = ctx.currentTime;
  for (const tone of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type ?? "square";
    osc.frequency.setValueAtTime(tone.freq, t);

    const peak = tone.peakGain ?? 0.15;
    const durS = tone.durMs / 1000;
    // Envelope: 8ms attack, hold, 12ms release — avoids click artefacts.
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.008);
    gain.gain.setValueAtTime(peak, t + Math.max(0.008, durS - 0.012));
    gain.gain.linearRampToValueAtTime(0, t + durS);

    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + durS);

    t += durS + gapMs / 1000;
  }

  // Return a promise that resolves a tad after the last tone finishes.
  const totalMs = tones.reduce((s, x) => s + x.durMs, 0) + (tones.length - 1) * gapMs + 20;
  return new Promise((r) => setTimeout(r, totalMs));
}

/** Local PTT press — ascending pair. "I'm about to talk." */
export function playOutgoingChirp(): Promise<void> {
  return playSequence([
    { freq: 1400, durMs: 60 },
    { freq: 2000, durMs: 90 },
  ]);
}

/** Remote started transmitting — single higher beep. "Someone's talking." */
export function playIncomingChirp(): Promise<void> {
  return playSequence([
    { freq: 2200, durMs: 80 },
    { freq: 2200, durMs: 50 },
  ], 50);
}

/** Transmission ended — descending pair. "Channel clear." */
export function playEndChirp(): Promise<void> {
  return playSequence([
    { freq: 1600, durMs: 50 },
    { freq: 1000, durMs: 70 },
  ]);
}
