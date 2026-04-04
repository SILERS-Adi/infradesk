/**
 * useSound — pleasant notification sounds via Web Audio API.
 * Ported 1:1 from PakOps (pakops.silers.pl).
 * Sound preference stored in localStorage ('packhub_sound_enabled').
 */

const STORAGE_KEY = 'packhub_sound_enabled';

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', gain = 0.15) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    audioCtx = null;
  }
}

/** Pleasant "collected" chime — two ascending soft tones */
export function soundCollect() {
  if (!isSoundEnabled()) return;
  playTone(523, 0.15, 'sine', 0.13);  // C5
  setTimeout(() => playTone(659, 0.2, 'sine', 0.13), 80); // E5
}

/** Success fanfare — three ascending tones */
export function soundSuccess() {
  if (!isSoundEnabled()) return;
  playTone(523, 0.12, 'sine', 0.13);  // C5
  setTimeout(() => playTone(659, 0.12, 'sine', 0.13), 100); // E5
  setTimeout(() => playTone(784, 0.25, 'sine', 0.15), 200); // G5
}

/** Error/warning — low soft tone */
export function soundError() {
  if (!isSoundEnabled()) return;
  playTone(330, 0.25, 'triangle', 0.1); // E4
  setTimeout(() => playTone(262, 0.3, 'triangle', 0.1), 120); // C4
}

/** Info blip */
export function soundInfo() {
  if (!isSoundEnabled()) return;
  playTone(587, 0.15, 'sine', 0.1); // D5
}

export function isSoundEnabled(): boolean {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    return val !== 'false'; // default ON
  } catch { return true; }
}

export function setSoundEnabled(enabled: boolean) {
  localStorage.setItem(STORAGE_KEY, String(enabled));
}
