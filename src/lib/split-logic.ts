import type { PlannedExercise, Split, SplitDay } from './types';

/** Eintrag aus src/data/splits.json: nur Tage und Muskel-Fokus, keine Übungen. */
export interface SplitTemplate {
  id: string;
  name: string;
  group: string;
  description: string;
  rotating: boolean;
  days: Array<Pick<SplitDay, 'name' | 'rest' | 'focus' | 'weekday'>>;
}

export const MAX_DAYS = 14;
export const SET_LIMITS = { sets: [1, 12], reps: [1, 50], rest: [15, 600] } as const;

export const newId = (): string => crypto.randomUUID();

export function newDay(name = 'Neuer Tag', rest = false): SplitDay {
  return { id: newId(), name, rest, focus: [], weekday: null, exercises: [] };
}

export function splitFromTemplate(t: SplitTemplate, now = Date.now()): Split {
  return {
    id: `tpl-${t.id}`,
    name: t.name,
    group: t.group,
    description: t.description,
    templateId: t.id,
    builtin: true,
    rotating: t.rotating,
    days: t.days.map((d) => ({ ...newDay(d.name, d.rest), focus: [...d.focus], weekday: d.weekday })),
    nextDayIndex: 0,
    createdAt: now,
  };
}

export function blankSplit(name: string, now = Date.now()): Split {
  return {
    id: newId(), name: name.trim() || 'Mein Split', group: 'Eigene', description: '', templateId: null,
    builtin: false, rotating: false, days: [newDay('Tag 1')], nextDayIndex: 0, createdAt: now,
  };
}

/** Kopie mit neuen IDs. Kopien sind immer eigene Splits (nicht zurücksetzbar). */
export function duplicateSplit(s: Split, name: string, now = Date.now()): Split {
  return {
    ...structuredClone(s),
    id: newId(),
    name: name.trim() || `${s.name} (Kopie)`,
    group: 'Eigene',
    templateId: null,
    builtin: false,
    nextDayIndex: 0,
    createdAt: now,
    days: s.days.map((d) => ({ ...structuredClone(d), id: newId() })),
  };
}

export function moveItem<T>(arr: readonly T[], from: number, to: number): T[] {
  const out = arr.slice();
  if (from < 0 || from >= out.length) return out;
  const clamped = Math.min(out.length - 1, Math.max(0, to));
  const [it] = out.splice(from, 1);
  out.splice(clamped, 0, it);
  return out;
}

/** Verschiebt einen Tag. Der Zyklus-Zeiger bleibt auf demselben Tag. */
export function moveDay(s: Split, from: number, to: number): Split {
  const pointed = s.days[s.nextDayIndex]?.id;
  const days = moveItem(s.days, from, to);
  const idx = days.findIndex((d) => d.id === pointed);
  return { ...s, days, nextDayIndex: idx < 0 ? 0 : idx };
}

export function addDay(s: Split, day: SplitDay): Split {
  if (s.days.length >= MAX_DAYS) return s;
  return { ...s, days: [...s.days, day] };
}

/** Löscht einen Tag. Ein Split behält mindestens einen Tag. */
export function removeDay(s: Split, index: number): Split {
  if (s.days.length <= 1 || index < 0 || index >= s.days.length) return s;
  const days = s.days.filter((_, i) => i !== index);
  let next = s.nextDayIndex;
  if (index < next) next -= 1;
  return { ...s, days, nextDayIndex: Math.min(Math.max(0, next), days.length - 1) };
}

export function updateDay(s: Split, dayId: string, patch: Partial<SplitDay>): Split {
  return { ...s, days: s.days.map((d) => (d.id === dayId ? { ...d, ...patch } : d)) };
}

export function currentDay(s: Split): SplitDay | undefined {
  return s.days[s.nextDayIndex] ?? s.days[0];
}

export function advanceCycle(s: Split): Split {
  return { ...s, nextDayIndex: s.days.length ? (s.nextDayIndex + 1) % s.days.length : 0 };
}

export function clamp(n: number, [lo, hi]: readonly [number, number] | readonly number[]): number {
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

/** Hält Sätze/Reps/Pause in gültigen Grenzen; Rep-Max ist nie kleiner als Rep-Min. */
export function normalizePlan(p: PlannedExercise): PlannedExercise {
  const repMin = clamp(p.repMin, SET_LIMITS.reps);
  return {
    exerciseId: p.exerciseId,
    sets: clamp(p.sets, SET_LIMITS.sets),
    repMin,
    repMax: Math.max(repMin, clamp(p.repMax, SET_LIMITS.reps)),
    restSec: clamp(p.restSec, SET_LIMITS.rest),
  };
}

/** "3 x 6 bis 8" oder "3 x 8" */
export function formatPlan(p: PlannedExercise): string {
  return p.repMin === p.repMax ? `${p.sets} x ${p.repMin}` : `${p.sets} x ${p.repMin} bis ${p.repMax}`;
}

export function defaultPlan(exerciseId: string, restSec: number): PlannedExercise {
  return normalizePlan({ exerciseId, sets: 3, repMin: 8, repMax: 12, restSec });
}

/** Zusammenfassung für Listen: "5 Tage" oder "5 Tage, 1 Ruhetag". */
export function describeDays(s: Split): string {
  const rest = s.days.filter((d) => d.rest).length;
  const train = s.days.length - rest;
  return `${train} Trainingstag${train === 1 ? '' : 'e'}${rest ? `, ${rest} Ruhetag${rest === 1 ? '' : 'e'}` : ''}`;
}
