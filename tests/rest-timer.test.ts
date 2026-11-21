import { describe, expect, it } from 'vitest';
import { computeStatus, DONE_VISIBLE_MS } from '../src/lib/rest-timer';

const T0 = 1_000_000;
const state = { endsAt: T0 + 90_000, total: 90, sound: false };

describe('Pausentimer-Status', () => {
  it('ohne Timer: idle', () => {
    expect(computeStatus(null, T0)).toEqual({ phase: 'idle' });
  });
  it('läuft: Restzeit wird aufgerundet', () => {
    expect(computeStatus(state, T0)).toEqual({ phase: 'running', remainingSec: 90, totalSec: 90 });
    expect(computeStatus(state, T0 + 89_001)).toEqual({ phase: 'running', remainingSec: 1, totalSec: 90 });
  });
  it('rechnet über Zeitstempel: nach Hintergrund-Pause stimmt die Zeit', () => {
    // 60 s "geschlafen", ohne dass ein Zähler lief
    expect(computeStatus(state, T0 + 60_000)).toMatchObject({ phase: 'running', remainingSec: 30 });
  });
  it('abgelaufen: kurz "done", danach idle', () => {
    expect(computeStatus(state, T0 + 90_000)).toEqual({ phase: 'done' });
    expect(computeStatus(state, T0 + 90_000 + DONE_VISIBLE_MS - 1)).toEqual({ phase: 'done' });
    expect(computeStatus(state, T0 + 90_000 + DONE_VISIBLE_MS)).toEqual({ phase: 'idle' });
  });
});
