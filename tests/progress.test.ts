import { describe, expect, it } from 'vitest';
import {
  buildRecords, buildSeries, dayStart, epley, filterOptions, personalRecords, rangeStart, summarize, weekStart,
  type Filters, type SetRec,
} from '../src/lib/progress';
import type { Exercise, Session, SetLog } from '../src/lib/types';

// Lokale Zeiten, damit die Tests in jeder Zeitzone gleich laufen. Montag, 2026-01-05.
const at = (m: number, d: number, h = 12) => new Date(2026, m - 1, d, h).getTime();
const NOW = at(2, 20); // Freitag, 2026-02-20

let id = 0;
const rec = (exId: string, kg: number, reps: number, ms: number, day = 'Push', muscles = ['chest']): SetRec => ({
  set: { id: ++id, sessionId: 1, exerciseId: exId, exerciseName: exId.toUpperCase(), setIndex: 1, kg, reps, rpe: null, ts: ms } as SetLog,
  startedAt: ms, dayName: day, muscles,
});
const F = (p: Partial<Filters>): Filters => ({ view: 'total', range: 'all', metric: 'e1rm', ...p });

describe('Epley', () => {
  it('1RM = kg x (1 + Wdh/30), bei 1 Wdh. das Gewicht selbst', () => {
    expect(epley(100, 1)).toBe(100);
    expect(epley(100, 5)).toBeCloseTo(116.667, 3);
    expect(epley(80, 8)).toBeCloseTo(101.333, 3);
    expect(epley(60, 30)).toBe(120);
  });
});

describe('Zeit-Hilfen', () => {
  it('Woche beginnt am Montag (lokal), auch am Sonntag', () => {
    expect(weekStart(at(1, 5, 9))).toBe(at(1, 5, 0)); // Montag
    expect(weekStart(at(1, 11, 23))).toBe(at(1, 5, 0)); // Sonntag gehört zur Woche davor
    expect(weekStart(at(1, 12, 0))).toBe(at(1, 12, 0));
  });
  it('Zeiträume', () => {
    expect(rangeStart('all', NOW)).toBeNull();
    expect(rangeStart('4w', NOW)).toBe(dayStart(NOW) - 27 * 86_400_000);
    expect(rangeStart('3m', NOW)).toBe(new Date(2025, 10, 20).getTime());
    expect(rangeStart('1y', NOW)).toBe(new Date(2025, 1, 20).getTime());
  });
});

describe('Kennzahlen: einzelne Übung', () => {
  const recs = [
    rec('bench', 80, 8, at(1, 5)), rec('bench', 85, 5, at(1, 5)),
    rec('bench', 82.5, 8, at(1, 12)),
    rec('squat', 100, 5, at(1, 12), 'Legs', ['quadriceps']),
  ];
  it('1RM: bester Wert des Tages in kg', () => {
    const s = buildSeries(recs, F({ view: 'exercise', exerciseId: 'bench' }), NOW);
    expect(s.kind).toBe('line');
    expect(s.unit).toBe('kg');
    expect(s.points).toEqual([
      { x: at(1, 5, 0), y: Math.round(Math.max(epley(80, 8), epley(85, 5)) * 10) / 10 },
      { x: at(1, 12, 0), y: Math.round(epley(82.5, 8) * 10) / 10 },
    ]);
  });
  it('Top-Set: schwerstes Gewicht des Tages', () => {
    const s = buildSeries(recs, F({ view: 'exercise', exerciseId: 'bench', metric: 'top' }), NOW);
    expect(s.points.map((p) => p.y)).toEqual([85, 82.5]);
  });
  it('Volumen: Summe kg x Wdh. pro Tag', () => {
    const s = buildSeries(recs, F({ view: 'exercise', exerciseId: 'bench', metric: 'volume' }), NOW);
    expect(s.points.map((p) => p.y)).toEqual([80 * 8 + 85 * 5, 82.5 * 8]);
  });
  it('ohne gewählte Übung: leer statt Absturz', () => {
    expect(buildSeries(recs, F({ view: 'exercise' }), NOW).points).toEqual([]);
    expect(buildSeries(recs, F({ view: 'muscle' }), NOW).points).toEqual([]);
    expect(buildSeries(recs, F({ view: 'day' }), NOW).points).toEqual([]);
  });
});

describe('Kennzahlen: aggregierte Ansichten sind ein Index (Start = 100)', () => {
  const recs = [
    rec('bench', 80, 1, at(1, 5)), rec('squat', 100, 1, at(1, 5), 'Legs', ['quadriceps']),
    rec('bench', 88, 1, at(1, 12)), // +10 %
    rec('squat', 120, 1, at(1, 19), 'Legs', ['quadriceps']), // +20 %
  ];
  it('Gesamt: Mittel der Übungen relativ zu ihrem ersten Wert', () => {
    const s = buildSeries(recs, F({ metric: 'top' }), NOW);
    expect(s.index).toBe(true);
    expect(s.unit).toBe('%');
    expect(s.points.map((p) => p.y)).toEqual([100, 110, 120]);
  });
  it('Muskelgruppe und Split-Tag', () => {
    expect(buildSeries(recs, F({ view: 'muscle', muscle: 'quadriceps', metric: 'top' }), NOW).points.map((p) => p.y)).toEqual([100, 120]);
    expect(buildSeries(recs, F({ view: 'day', dayName: 'Legs', metric: 'top' }), NOW).points).toHaveLength(2);
  });
  it('Volumen und Sätze bleiben absolut (keine Index-Ansicht)', () => {
    expect(buildSeries(recs, F({ metric: 'volume' }), NOW).index).toBe(false);
  });
  it('Gewicht 0 (Körpergewicht) erzeugt keinen Index und keine Division durch 0', () => {
    const s = buildSeries([rec('dips', 0, 10, at(1, 5)), rec('dips', 0, 12, at(1, 12))], F({ metric: 'top' }), NOW);
    expect(s.points).toEqual([]);
  });
});

describe('Sätze pro Woche', () => {
  const recs = [
    rec('a', 50, 5, at(1, 5)), rec('a', 50, 5, at(1, 6)), rec('a', 50, 5, at(1, 7)),
    rec('a', 50, 5, at(1, 26)), // zwei Wochen Pause dazwischen
  ];
  it('Balken je Woche, leere Wochen als 0, bis einschließlich aktueller Woche', () => {
    const s = buildSeries(recs, F({ metric: 'sets' }), at(2, 2));
    expect(s.kind).toBe('bar');
    expect(s.points.map((p) => p.y)).toEqual([3, 0, 0, 1, 0]);
    expect(s.points[0].x).toBe(at(1, 5, 0));
  });
  it('keine Daten: leere Serie', () => {
    expect(buildSeries([], F({ metric: 'sets' }), NOW).points).toEqual([]);
  });
});

describe('Zeitraum-Filter', () => {
  const recs = [rec('a', 50, 5, at(2, 18)), rec('a', 50, 5, at(1, 5)), rec('a', 50, 5, new Date(2025, 5, 1).getTime())];
  it.each([['4w', 1], ['3m', 2], ['1y', 3], ['all', 3]] as const)('%s zeigt %i Trainingstag(e)', (range, n) => {
    expect(buildSeries(recs, F({ range, metric: 'volume' }), NOW).points).toHaveLength(n);
  });
});

describe('Rekorde', () => {
  it('Gewicht-PR (Gleichstand: mehr Wdh.) und 1RM-PR getrennt, jüngster zuerst', () => {
    const prs = personalRecords([
      rec('bench', 100, 3, at(1, 5)), rec('bench', 100, 5, at(1, 12)), rec('bench', 90, 10, at(1, 19)),
      rec('squat', 140, 5, at(2, 2)),
    ]);
    expect(prs.map((p) => p.exerciseId)).toEqual(['squat', 'bench']);
    const bench = prs[1];
    expect(bench.weight).toMatchObject({ kg: 100, reps: 5, date: at(1, 12) });
    expect(bench.e1rm.value).toBeCloseTo(Math.max(epley(100, 5), epley(90, 10)), 5);
    expect(bench.e1rm.kg).toBe(epley(100, 5) >= epley(90, 10) ? 100 : 90);
  });
  it('gleicher Wert später wiederholt ist kein neuer Rekord', () => {
    const pr = personalRecords([rec('a', 100, 5, at(1, 5)), rec('a', 100, 5, at(1, 12))])[0];
    expect(pr.weight.date).toBe(at(1, 5));
    expect(pr.e1rm.date).toBe(at(1, 5));
  });
  it('Körpergewichtsübungen (0 kg) tauchen nicht als Gewichts-Rekord auf', () => {
    expect(personalRecords([rec('dips', 0, 12, at(1, 5))])).toEqual([]);
  });
  it('keine Daten: leere Liste', () => {
    expect(personalRecords([])).toEqual([]);
  });
});

describe('Zusammenfassung und Optionen', () => {
  const recs = [rec('a', 50, 10, at(1, 5)), rec('a', 50, 10, at(1, 5)), rec('b', 20, 10, at(1, 6), 'Pull', ['lats'])];
  it('Trainingstage, Sätze, Volumen', () => {
    expect(summarize(recs)).toEqual({ days: 2, sets: 3, volume: 1200 });
    expect(summarize([])).toEqual({ days: 0, sets: 0, volume: 0 });
  });
  it('Auswahllisten nur mit vorhandenen Daten', () => {
    const o = filterOptions(recs);
    expect(o.exercises.map((e) => e.id)).toEqual(['a', 'b']);
    expect(o.muscles.sort()).toEqual(['chest', 'lats']);
    expect(o.days).toEqual(['Pull', 'Push']);
  });
});

describe('buildRecords', () => {
  it('verknüpft Session und Muskeln; Sätze ohne Session und gelöschte Übungen sind okay', () => {
    const sessions: Session[] = [{ id: 1, startedAt: at(1, 5), endedAt: at(1, 5), splitId: null, dayId: null, dayName: 'Push' }];
    const ex = [{ id: 'bench', primaryMuscles: ['chest'] }] as Exercise[];
    const sets = [
      { id: 1, sessionId: 1, exerciseId: 'bench', exerciseName: 'Bench', setIndex: 1, kg: 1, reps: 1, rpe: null, ts: 1 },
      { id: 2, sessionId: 1, exerciseId: 'gone', exerciseName: 'Gone', setIndex: 1, kg: 1, reps: 1, rpe: null, ts: 2 },
      { id: 3, sessionId: 99, exerciseId: 'bench', exerciseName: 'Bench', setIndex: 1, kg: 1, reps: 1, rpe: null, ts: 3 },
    ] as SetLog[];
    const r = buildRecords(sets, sessions, ex);
    expect(r).toHaveLength(2);
    expect(r[0].muscles).toEqual(['chest']);
    expect(r[1].muscles).toEqual([]);
  });
});
