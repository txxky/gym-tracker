import { db, type GymDB } from './db';
import { advanceCycle, currentDay } from './split-logic';
import type { PlannedExercise, Session, SessionType, SetLog, Split } from './types';

/** Einstellung: rückt ein Check-in den Zyklus-Zeiger standardmäßig weiter? (Standard: ja) */
export const CHECKIN_ADVANCE_KEY = 'checkinAdvance';
export const CHECKIN_LABEL = 'Im Gym';

/** Alte Daten haben kein type-Feld: sie sind volle Trainings. */
export const sessionType = (s: Pick<Session, 'type'>): SessionType => (s.type === 'checkin' ? 'checkin' : 'full');
export const isCheckin = (s: Pick<Session, 'type'>): boolean => sessionType(s) === 'checkin';

export const KG = { min: 0, max: 500, step: 2.5, fallback: 20 } as const;
export const REPS = { min: 1, max: 50 } as const;
export const RPE = { min: 5, max: 10, step: 0.5, fallback: 8 } as const;

export const formatKg = (kg: number): string => String(kg).replace('.', ',');
export const formatSet = (s: Pick<SetLog, 'kg' | 'reps'>): string => `${formatKg(s.kg)} kg x ${s.reps}`;

/** Sätze der zuletzt trainierten anderen Session für diese Übung, nach Satznummer sortiert. */
export function pickLastTime(all: SetLog[], currentSessionId: number): SetLog[] {
  const other = all.filter((s) => s.sessionId !== currentSessionId);
  if (!other.length) return [];
  const latest = other.reduce((a, b) => (b.ts > a.ts ? b : a)).sessionId;
  return other.filter((s) => s.sessionId === latest).sort((a, b) => a.setIndex - b.setIndex);
}

/** Der Satz vom letzten Mal, der zu dieser Satznummer passt (sonst der letzte Satz damals). */
export function lastTimeFor(setNo: number, lastTime: SetLog[]): SetLog | undefined {
  return lastTime.find((s) => s.setIndex === setNo) ?? lastTime[lastTime.length - 1];
}

export interface StartValues {
  kg: number;
  reps: number;
  source: 'last-time' | 'this-session' | 'default';
}

/** Startwerte der Räder: letztes Mal, sonst vorheriger Satz heute, sonst Standard. */
export function suggestStart(setNo: number, lastTime: SetLog[], thisSession: SetLog[], plan?: PlannedExercise): StartValues {
  const ref = lastTimeFor(setNo, lastTime);
  if (ref) return { kg: ref.kg, reps: ref.reps, source: 'last-time' };
  const prev = thisSession[thisSession.length - 1];
  if (prev) return { kg: prev.kg, reps: prev.reps, source: 'this-session' };
  return { kg: KG.fallback, reps: plan?.repMin ?? 8, source: 'default' };
}

export function setCounts(plans: PlannedExercise[], sets: SetLog[]): number[] {
  return plans.map((p) => sets.filter((s) => s.exerciseId === p.exerciseId).length);
}

/** Nächste Übung nach `from` (mit Umlauf), die noch offene Sätze hat. -1 wenn alles erledigt ist. */
export function nextIncomplete(plans: PlannedExercise[], counts: number[], from: number): number {
  for (let k = 1; k <= plans.length; k++) {
    const i = (from + k) % plans.length;
    if (counts[i] < plans[i].sets) return i;
  }
  return -1;
}

export function firstIncomplete(plans: PlannedExercise[], counts: number[]): number {
  const i = plans.findIndex((p, k) => counts[k] < p.sets);
  return i < 0 ? Math.max(0, plans.length - 1) : i;
}

// ---- Datenbank ----

export async function getOpenSession(d: GymDB = db): Promise<Session | undefined> {
  return d.sessions.filter((s) => s.endedAt === null && !isCheckin(s)).first();
}

/** Startet ein Training. Läuft schon eines, wird dieses zurückgegeben (es gibt immer nur ein offenes). */
export async function startSession(split: Split, dayId: string, now = Date.now(), d: GymDB = db): Promise<number> {
  const open = await getOpenSession(d);
  if (open?.id !== undefined) return open.id;
  const day = split.days.find((x) => x.id === dayId);
  return d.sessions.add({ type: 'full', startedAt: now, endedAt: null, splitId: split.id, dayId, dayName: day?.name ?? 'Training' });
}

export async function setsForSession(sessionId: number, d: GymDB = db): Promise<SetLog[]> {
  const list = await d.sets.where('sessionId').equals(sessionId).toArray();
  return list.sort((a, b) => a.ts - b.ts || a.setIndex - b.setIndex);
}

export async function lastTimeSets(exerciseId: string, currentSessionId: number, d: GymDB = db): Promise<SetLog[]> {
  return pickLastTime(await d.sets.where('exerciseId').equals(exerciseId).toArray(), currentSessionId);
}

export type NewSet = Omit<SetLog, 'id' | 'setIndex' | 'ts'> & { ts?: number };

export async function logSet(input: NewSet, d: GymDB = db): Promise<number> {
  const existing = await d.sets.where('sessionId').equals(input.sessionId).filter((s) => s.exerciseId === input.exerciseId).count();
  return d.sets.add({ ...input, setIndex: existing + 1, ts: input.ts ?? Date.now() });
}

export async function updateSet(id: number, patch: Partial<Pick<SetLog, 'kg' | 'reps' | 'rpe'>>, d: GymDB = db): Promise<void> {
  await d.sets.update(id, patch);
}

/** Löscht einen Satz und nummeriert die übrigen Sätze der Übung wieder lückenlos. */
export async function deleteSet(id: number, d: GymDB = db): Promise<void> {
  const s = await d.sets.get(id);
  if (!s) return;
  await d.sets.delete(id);
  const rest = (await d.sets.where('sessionId').equals(s.sessionId).filter((x) => x.exerciseId === s.exerciseId).toArray())
    .sort((a, b) => a.setIndex - b.setIndex);
  await Promise.all(rest.map((x, i) => (x.setIndex === i + 1 ? undefined : d.sets.update(x.id!, { setIndex: i + 1 }))));
}

export type FinishResult = 'finished' | 'discarded';

/**
 * Beendet ein Training und rückt den Zyklus-Zeiger hinter den trainierten Tag.
 * Ohne einen einzigen Satz wird das Training verworfen und der Zyklus bleibt stehen.
 */
export async function finishSession(sessionId: number, now = Date.now(), d: GymDB = db): Promise<FinishResult> {
  const session = await d.sessions.get(sessionId);
  if (!session) return 'discarded';
  if ((await d.sets.where('sessionId').equals(sessionId).count()) === 0) {
    await d.sessions.delete(sessionId);
    return 'discarded';
  }
  await d.sessions.update(sessionId, { endedAt: now });
  const split = session.splitId ? await d.splits.get(session.splitId) : undefined;
  if (split) {
    const idx = split.days.findIndex((x) => x.id === session.dayId);
    const base = idx >= 0 ? { ...split, nextDayIndex: idx } : split;
    await d.splits.put(advanceCycle(base));
  }
  return 'finished';
}

export async function discardSession(sessionId: number, d: GymDB = db): Promise<void> {
  await d.sets.where('sessionId').equals(sessionId).delete();
  await d.sessions.delete(sessionId);
}

/** Ruhetag abhaken: Zyklus ohne Training weiterschieben. */
export async function skipToNextDay(splitId: string, d: GymDB = db): Promise<void> {
  const split = await d.splits.get(splitId);
  if (split) await d.splits.put(advanceCycle(split));
}

export interface CheckinOptions {
  /** Zyklus-Zeiger hinter den heutigen Tag setzen (nur bei einem Trainingstag, nie bei Ruhetag) */
  advance: boolean;
}

/**
 * "Ich war im Gym": legt sofort ein abgeschlossenes Training ohne Sätze an (type 'checkin').
 * Mit advance gilt der Tag "Als Nächstes" als erledigt (Name wird übernommen, der Zeiger rückt weiter),
 * sonst heißt der Eintrag nur "Im Gym" und der Zyklus bleibt stehen.
 * Check-ins fließen nie in Diagramme, Rekorde, Volumen oder Sätze pro Woche ein.
 */
export async function createCheckin(split: Split | undefined, opts: CheckinOptions, now = Date.now(), d: GymDB = db): Promise<number> {
  const day = split ? currentDay(split) : undefined;
  const counts = !!split && !!day && !day.rest && opts.advance;
  const id = await d.sessions.add({
    type: 'checkin', startedAt: now, endedAt: now, splitId: split?.id ?? null, dayId: counts ? day!.id : null, dayName: counts ? day!.name : CHECKIN_LABEL,
  });
  if (counts && split) await d.splits.put(advanceCycle(split));
  return id;
}
