import type { Exercise, Session, SetLog } from './types';

export type View = 'total' | 'exercise' | 'muscle' | 'day';
export type Range = '4w' | '3m' | '1y' | 'all';
export type Metric = 'e1rm' | 'volume' | 'top' | 'sets';

export interface Filters {
  view: View;
  range: Range;
  metric: Metric;
  exerciseId?: string | null;
  muscle?: string | null;
  dayName?: string | null;
}

export const DEFAULT_FILTERS: Filters = { view: 'total', range: '3m', metric: 'e1rm' };

const DAY_MS = 86_400_000;

/** Epley: 1RM = Gewicht x (1 + Wdh. / 30). Bei einer Wiederholung ist das Gewicht selbst das 1RM. */
export function epley(kg: number, reps: number): number {
  if (reps <= 1) return kg;
  return kg * (1 + reps / 30);
}

export interface SetRec {
  set: SetLog;
  /** Beginn des Trainings (ms) */
  startedAt: number;
  dayName: string;
  /** Hauptmuskeln der Übung (leer, wenn die Übung nicht mehr existiert) */
  muscles: string[];
}

/** Sätze mit Datum, Tag und Muskeln anreichern. Sätze ohne Session werden übersprungen. */
export function buildRecords(sets: SetLog[], sessions: Session[], exercises: Exercise[]): SetRec[] {
  // Check-ins (nur im Gym gewesen) zählen nie für Diagramme, Rekorde, Volumen oder Sätze pro Woche
  const sess = new Map(sessions.filter((s) => s.type !== 'checkin').map((s) => [s.id, s]));
  const ex = new Map(exercises.map((e) => [e.id, e]));
  return sets.flatMap((set) => {
    const s = sess.get(set.sessionId);
    if (!s) return [];
    return [{ set, startedAt: s.startedAt, dayName: s.dayName, muscles: ex.get(set.exerciseId)?.primaryMuscles ?? [] }];
  });
}

/** Lokaler Tagesbeginn (ms). */
export function dayStart(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Lokaler Montag der Woche (ms). */
export function weekStart(ms: number): number {
  const d = new Date(dayStart(ms));
  const back = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back).getTime();
}

export function rangeStart(range: Range, now: number): number | null {
  const d = new Date(now);
  switch (range) {
    case '4w': return dayStart(now) - 27 * DAY_MS;
    case '3m': return new Date(d.getFullYear(), d.getMonth() - 3, d.getDate()).getTime();
    case '1y': return new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()).getTime();
    default: return null;
  }
}

/** Ansichts-Filter (ohne Zeitraum). */
export function filterByView(recs: SetRec[], f: Filters): SetRec[] {
  switch (f.view) {
    case 'exercise': return f.exerciseId ? recs.filter((r) => r.set.exerciseId === f.exerciseId) : [];
    case 'muscle': return f.muscle ? recs.filter((r) => r.muscles.includes(f.muscle!)) : [];
    case 'day': return f.dayName ? recs.filter((r) => r.dayName === f.dayName) : [];
    default: return recs;
  }
}

export function filterByRange(recs: SetRec[], range: Range, now: number): SetRec[] {
  const from = rangeStart(range, now);
  return from === null ? recs : recs.filter((r) => r.startedAt >= from && r.startedAt <= now + DAY_MS);
}

export interface Point { x: number; y: number }
export interface Series {
  kind: 'line' | 'bar';
  points: Point[];
  /** Einheit für Achse und Tooltip */
  unit: string;
  /** true bei Index-Ansicht (Start = 100) */
  index: boolean;
}

const bestOf = (rs: SetRec[], metric: 'e1rm' | 'top'): number =>
  Math.max(...rs.map((r) => (metric === 'e1rm' ? epley(r.set.kg, r.set.reps) : r.set.kg)));

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Kennzahl über die Zeit.
 * - Volumen: Summe kg x Wdh. pro Trainingstag.
 * - Sätze pro Woche: Balken je Kalenderwoche (Montag), leere Wochen zählen als 0.
 * - 1RM / Top-Set: bei einer einzelnen Übung der beste Wert des Tages in kg. Bei mehreren Übungen
 *   (Gesamt, Muskel, Split-Tag) ein Index: Mittel der Tagesbestwerte aller trainierten Übungen,
 *   jeweils relativ zum ersten Wert der Übung im Zeitraum (100 = Start). So lassen sich Übungen mischen.
 */
export function buildSeries(all: SetRec[], f: Filters, now: number): Series {
  const recs = filterByRange(filterByView(all, f), f.range, now);

  if (f.metric === 'sets') {
    const buckets = new Map<number, number>();
    for (const r of recs) buckets.set(weekStart(r.startedAt), (buckets.get(weekStart(r.startedAt)) ?? 0) + 1);
    if (!buckets.size) return { kind: 'bar', points: [], unit: 'Sätze', index: false };
    const from = rangeStart(f.range, now);
    const first = Math.min(...buckets.keys());
    const points: Point[] = [];
    const end = weekStart(now);
    for (let w = from === null ? first : Math.min(first, weekStart(from)); w <= end; ) {
      points.push({ x: w, y: buckets.get(w) ?? 0 });
      const d = new Date(w);
      w = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7).getTime();
    }
    return { kind: 'bar', points, unit: 'Sätze', index: false };
  }

  const byDay = new Map<number, SetRec[]>();
  for (const r of recs) {
    const k = dayStart(r.startedAt);
    byDay.set(k, [...(byDay.get(k) ?? []), r]);
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);

  if (f.metric === 'volume') {
    return {
      kind: 'line', unit: 'kg', index: false,
      points: days.map((x) => ({ x, y: Math.round(byDay.get(x)!.reduce((s, r) => s + r.set.kg * r.set.reps, 0)) })),
    };
  }

  const metric = f.metric;
  const single = f.view === 'exercise';
  if (single) {
    return { kind: 'line', unit: 'kg', index: false, points: days.map((x) => ({ x, y: round1(bestOf(byDay.get(x)!, metric)) })) };
  }
  const baseline = new Map<string, number>();
  const points: Point[] = [];
  for (const x of days) {
    const perEx = new Map<string, SetRec[]>();
    for (const r of byDay.get(x)!) perEx.set(r.set.exerciseId, [...(perEx.get(r.set.exerciseId) ?? []), r]);
    const ratios: number[] = [];
    for (const [id, rs] of perEx) {
      const v = bestOf(rs, metric);
      if (v <= 0) continue;
      if (!baseline.has(id)) baseline.set(id, v);
      ratios.push((v / baseline.get(id)!) * 100);
    }
    if (ratios.length) points.push({ x, y: round1(ratios.reduce((a, b) => a + b, 0) / ratios.length) });
  }
  return { kind: 'line', unit: '%', index: true, points };
}

export interface PR {
  exerciseId: string;
  name: string;
  weight: { kg: number; reps: number; date: number };
  e1rm: { value: number; kg: number; reps: number; date: number };
  /** Zeitpunkt des jüngsten der beiden Rekorde */
  latest: number;
}

/** Rekorde je Übung über alle Zeit (Gewicht, bei Gleichstand mehr Wdh.; geschätztes 1RM). */
export function personalRecords(recs: SetRec[]): PR[] {
  const by = new Map<string, PR>();
  for (const r of recs) {
    const { exerciseId, exerciseName: name, kg, reps } = r.set;
    const e = epley(kg, reps);
    const cur = by.get(exerciseId);
    if (!cur) {
      by.set(exerciseId, {
        exerciseId, name, weight: { kg, reps, date: r.startedAt }, e1rm: { value: e, kg, reps, date: r.startedAt }, latest: r.startedAt,
      });
      continue;
    }
    // Bei Gleichstand gilt der frühere Rekord (erster Wurf zählt).
    if (kg > cur.weight.kg || (kg === cur.weight.kg && reps > cur.weight.reps)) cur.weight = { kg, reps, date: r.startedAt };
    if (e > cur.e1rm.value + 1e-9) cur.e1rm = { value: e, kg, reps, date: r.startedAt };
    cur.latest = Math.max(cur.weight.date, cur.e1rm.date);
  }
  return [...by.values()].filter((p) => p.weight.kg > 0).sort((a, b) => b.latest - a.latest || a.name.localeCompare(b.name));
}

export interface Summary { days: number; sets: number; volume: number }

export function summarize(recs: SetRec[]): Summary {
  return {
    days: new Set(recs.map((r) => dayStart(r.startedAt))).size,
    sets: recs.length,
    volume: Math.round(recs.reduce((s, r) => s + r.set.kg * r.set.reps, 0)),
  };
}

/** Optionen für die Auswahllisten, nur Dinge mit Daten. */
export function filterOptions(recs: SetRec[]): {
  exercises: Array<{ id: string; name: string }>;
  muscles: string[];
  days: string[];
} {
  const ex = new Map<string, string>();
  const muscles = new Set<string>();
  const days = new Set<string>();
  for (const r of recs) {
    ex.set(r.set.exerciseId, r.set.exerciseName);
    r.muscles.forEach((m) => muscles.add(m));
    days.add(r.dayName);
  }
  return {
    exercises: [...ex].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    muscles: [...muscles],
    days: [...days].sort((a, b) => a.localeCompare(b)),
  };
}
