import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { GymDB } from '../src/lib/db';
import {
  deleteSet, discardSession, finishSession, firstIncomplete, formatKg, formatSet, getOpenSession, lastTimeFor,
  lastTimeSets, logSet, nextIncomplete, pickLastTime, setCounts, setsForSession, skipToNextDay, startSession,
  suggestStart, updateSet,
} from '../src/lib/log';
import { defaultPlan, newDay } from '../src/lib/split-logic';
import { blankSplit } from '../src/lib/split-logic';
import type { SetLog, Split } from '../src/lib/types';

const S = (sessionId: number, exerciseId: string, setIndex: number, kg: number, reps: number, ts: number): SetLog =>
  ({ sessionId, exerciseId, exerciseName: exerciseId, setIndex, kg, reps, rpe: null, ts });

describe('Formatierung', () => {
  it('Komma statt Punkt, "kg x"', () => {
    expect(formatKg(82.5)).toBe('82,5');
    expect(formatKg(80)).toBe('80');
    expect(formatSet({ kg: 80, reps: 8 })).toBe('80 kg x 8');
  });
});

describe('Letztes Mal und Startwerte', () => {
  const old = [S(1, 'a', 1, 80, 8, 100), S(1, 'a', 2, 80, 7, 101), S(1, 'a', 3, 77.5, 8, 102)];
  const newer = [S(2, 'a', 1, 82.5, 6, 200), S(2, 'a', 2, 82.5, 5, 201)];
  it('nimmt die jüngste andere Session, nie die aktuelle', () => {
    expect(pickLastTime([...old, ...newer], 3).map((s) => s.sessionId)).toEqual([2, 2]);
    expect(pickLastTime([...old, ...newer], 2).map((s) => s.sessionId)).toEqual([1, 1, 1]);
    expect(pickLastTime(newer, 2)).toEqual([]);
    expect(pickLastTime([], 1)).toEqual([]);
  });
  it('Satz passend zur Satznummer, sonst der letzte Satz damals', () => {
    expect(lastTimeFor(2, old)).toMatchObject({ kg: 80, reps: 7 });
    expect(lastTimeFor(5, old)).toMatchObject({ kg: 77.5, reps: 8 });
    expect(lastTimeFor(1, [])).toBeUndefined();
  });
  it('Räder starten bei den Werten vom letzten Mal', () => {
    expect(suggestStart(1, old, [])).toEqual({ kg: 80, reps: 8, source: 'last-time' });
    expect(suggestStart(3, old, [S(9, 'a', 2, 99, 9, 1)])).toMatchObject({ kg: 77.5, source: 'last-time' });
  });
  it('ohne Historie: vorheriger Satz heute, sonst Standard mit Rep-Min', () => {
    expect(suggestStart(2, [], [S(9, 'a', 1, 60, 10, 1)])).toEqual({ kg: 60, reps: 10, source: 'this-session' });
    expect(suggestStart(1, [], [], defaultPlan('a', 90))).toEqual({ kg: 20, reps: 8, source: 'default' });
    expect(suggestStart(1, [], [])).toMatchObject({ kg: 20, reps: 8 });
  });
});

describe('Übungs-Fortschritt', () => {
  const plans = [defaultPlan('a', 90), defaultPlan('b', 90), defaultPlan('c', 90)]; // je 3 Sätze
  const sets = [S(1, 'a', 1, 1, 1, 1), S(1, 'a', 2, 1, 1, 2), S(1, 'a', 3, 1, 1, 3), S(1, 'b', 1, 1, 1, 4)];
  it('zählt Sätze pro Übung', () => {
    expect(setCounts(plans, sets)).toEqual([3, 1, 0]);
  });
  it('erste offene Übung; wenn alles fertig, die letzte', () => {
    expect(firstIncomplete(plans, [3, 1, 0])).toBe(1);
    expect(firstIncomplete(plans, [3, 3, 3])).toBe(2);
    expect(firstIncomplete([], [])).toBe(0);
  });
  it('nächste offene Übung mit Umlauf, -1 wenn nichts offen', () => {
    expect(nextIncomplete(plans, [3, 1, 0], 1)).toBe(1 + 1);
    expect(nextIncomplete(plans, [0, 3, 3], 2)).toBe(0);
    expect(nextIncomplete(plans, [3, 3, 3], 0)).toBe(-1);
    expect(nextIncomplete([], [], 0)).toBe(-1);
  });
});

describe('Training speichern (IndexedDB)', () => {
  let d: GymDB;
  let split: Split;
  beforeEach(async () => {
    d = new GymDB(`log-${Math.random()}`);
    split = { ...blankSplit('Test'), days: [newDay('Push'), newDay('Pull'), newDay('Legs')], nextDayIndex: 0 };
    await d.splits.put(split);
  });
  const set = (sessionId: number, ex = 'a', kg = 50, reps = 8) =>
    ({ sessionId, exerciseId: ex, exerciseName: ex, kg, reps, rpe: null });

  it('es gibt immer nur ein offenes Training', async () => {
    const a = await startSession(split, split.days[0].id, 1, d);
    const b = await startSession(split, split.days[1].id, 2, d);
    expect(b).toBe(a);
    expect((await getOpenSession(d))!.dayName).toBe('Push');
  });
  it('Sätze werden pro Übung lückenlos nummeriert, auch nach Löschen', async () => {
    const id = await startSession(split, split.days[0].id, 1, d);
    const s1 = await logSet(set(id), d);
    await logSet(set(id, 'b'), d);
    await logSet(set(id), d);
    await logSet(set(id), d);
    expect((await setsForSession(id, d)).filter((s) => s.exerciseId === 'a').map((s) => s.setIndex)).toEqual([1, 2, 3]);
    await deleteSet(s1, d);
    expect((await setsForSession(id, d)).filter((s) => s.exerciseId === 'a').map((s) => s.setIndex).sort()).toEqual([1, 2]);
  });
  it('Satz ändern', async () => {
    const id = await startSession(split, split.days[0].id, 1, d);
    const sid = await logSet(set(id), d);
    await updateSet(sid, { kg: 52.5, reps: 6, rpe: 9 }, d);
    expect((await d.sets.get(sid))).toMatchObject({ kg: 52.5, reps: 6, rpe: 9 });
  });
  it('Beenden rückt den Zyklus hinter den trainierten Tag (mit Umlauf)', async () => {
    const id = await startSession(split, split.days[1].id, 1, d); // Pull trainiert, Zeiger stand auf Push
    await logSet(set(id), d);
    expect(await finishSession(id, 5, d)).toBe('finished');
    expect((await d.splits.get(split.id))!.nextDayIndex).toBe(2);
    const id2 = await startSession(split, split.days[2].id, 6, d);
    await logSet(set(id2), d);
    await finishSession(id2, 7, d);
    expect((await d.splits.get(split.id))!.nextDayIndex).toBe(0);
    expect(await getOpenSession(d)).toBeUndefined();
  });
  it('Training ohne Sätze wird verworfen, der Zyklus bleibt stehen', async () => {
    const id = await startSession(split, split.days[0].id, 1, d);
    expect(await finishSession(id, 5, d)).toBe('discarded');
    expect(await d.sessions.count()).toBe(0);
    expect((await d.splits.get(split.id))!.nextDayIndex).toBe(0);
  });
  it('Beenden funktioniert auch, wenn der Tag inzwischen gelöscht wurde', async () => {
    const id = await startSession(split, split.days[2].id, 1, d);
    await logSet(set(id), d);
    await d.splits.put({ ...split, days: split.days.slice(0, 2), nextDayIndex: 1 });
    expect(await finishSession(id, 5, d)).toBe('finished');
    const s = (await d.splits.get(split.id))!;
    expect(s.nextDayIndex).toBeLessThan(s.days.length);
  });
  it('Beenden funktioniert auch, wenn der Split gelöscht wurde', async () => {
    const id = await startSession(split, split.days[0].id, 1, d);
    await logSet(set(id), d);
    await d.splits.delete(split.id);
    expect(await finishSession(id, 5, d)).toBe('finished');
  });
  it('"Letztes Mal" kommt aus der vorherigen Session derselben Übung', async () => {
    const a = await startSession(split, split.days[0].id, 1, d);
    await logSet({ ...set(a, 'x', 80, 8), ts: 10 }, d);
    await finishSession(a, 11, d);
    const b = await startSession(split, split.days[0].id, 20, d);
    expect((await lastTimeSets('x', b, d)).map((s) => s.kg)).toEqual([80]);
    expect(await lastTimeSets('y', b, d)).toEqual([]);
  });
  it('Verwerfen löscht Training samt Sätzen; Ruhetag abhaken rückt den Zyklus', async () => {
    const id = await startSession(split, split.days[0].id, 1, d);
    await logSet(set(id), d);
    await discardSession(id, d);
    expect(await d.sets.count()).toBe(0);
    await skipToNextDay(split.id, d);
    expect((await d.splits.get(split.id))!.nextDayIndex).toBe(1);
  });
});
