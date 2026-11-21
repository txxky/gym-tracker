/**
 * Pausentimer. Läuft über einen Zeitstempel (endsAt), nicht über einen Zähler: Wenn das Handy kurz
 * einschläft oder der Tab im Hintergrund war, stimmt die Restzeit trotzdem.
 */
export interface RestState {
  endsAt: number;
  total: number;
  sound: boolean;
}

export type RestStatus =
  | { phase: 'idle' }
  | { phase: 'running'; remainingSec: number; totalSec: number }
  | { phase: 'done' };

/** Wie lange "Pause vorbei" sichtbar bleibt. */
export const DONE_VISIBLE_MS = 5000;
const KEY = 'gt-rest';

export function computeStatus(state: RestState | null, now: number): RestStatus {
  if (!state) return { phase: 'idle' };
  const left = state.endsAt - now;
  if (left > 0) return { phase: 'running', remainingSec: Math.ceil(left / 1000), totalSec: state.total };
  return left > -DONE_VISIBLE_MS ? { phase: 'done' } : { phase: 'idle' };
}

let state: RestState | null = load();
let announced = false;
let timer = 0;
let audio: AudioContext | null = null;
const listeners = new Set<() => void>();

function load(): RestState | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw.endsAt === 'number' && typeof raw.total === 'number') return raw as RestState;
  } catch { /* kein Speicher */ }
  return null;
}
function save(): void {
  try {
    if (state) sessionStorage.setItem(KEY, JSON.stringify(state));
    else sessionStorage.removeItem(KEY);
  } catch { /* ignorieren */ }
}

export function restStatus(now = Date.now()): RestStatus {
  return computeStatus(state, now);
}

function emit(): void {
  listeners.forEach((l) => l());
}

function tick(): void {
  const s = restStatus();
  if (s.phase === 'done' && !announced) {
    announced = true;
    onFinished();
  }
  if (s.phase === 'idle') {
    window.clearInterval(timer);
    timer = 0;
    state = null;
    save();
  }
  emit();
}

function schedule(): void {
  if (!timer) timer = window.setInterval(tick, 250);
}

/** Muss aus einem Tippen heraus aufgerufen werden, damit Browser den Ton erlauben. */
export function unlockAudio(): void {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch { /* kein Audio verfügbar */ }
}

function beep(): void {
  if (!audio) return;
  try {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, audio.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.5);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.55);
  } catch { /* ignorieren */ }
}

function onFinished(): void {
  navigator.vibrate?.([200, 100, 200]);
  if (state?.sound) beep();
}

export function startRest(sec: number, sound = false): void {
  state = { endsAt: Date.now() + sec * 1000, total: sec, sound };
  announced = false;
  save();
  schedule();
  emit();
}

/** Zeit anpassen, z. B. +15 s. Die Pause kann nicht unter 5 s gedrückt werden, solange sie läuft. */
export function adjustRest(deltaSec: number): void {
  const s = restStatus();
  if (!state || s.phase !== 'running') return;
  const minEnd = Date.now() + 5000;
  state = { ...state, endsAt: Math.max(minEnd, state.endsAt + deltaSec * 1000), total: Math.max(5, state.total + deltaSec) };
  save();
  emit();
}

export function stopRest(): void {
  state = null;
  announced = true;
  window.clearInterval(timer);
  timer = 0;
  save();
  emit();
}

export function subscribeRest(fn: () => void): () => void {
  listeners.add(fn);
  if (state) schedule(); // nach Neuladen weiterlaufen lassen
  return () => { listeners.delete(fn); };
}
