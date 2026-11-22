import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { GymDB } from '../src/lib/db';
import { createCheckin, getOpenSession, isCheckin, logSet, sessionType, startSession, finishSession } from '../src/lib/log';
import { buildRecords, buildSeries, DEFAULT_FILTERS, personalRecords, summarize } from '../src/lib/progress';
import { blankSplit, currentDay, newDay } from '../src/lib/split-logic';
import type { Session, SetLog, Split } from '../src/lib/types';

let d: GymDB;
beforeEach(() => { d = new GymDB(`checkin-${Math.random()}`); });

function split3(): Split {
  let s = blankSplit('Test');
  s = { ...s, days: [{ ...newDay('Push'), id: 'a' }, { ...newDay('Pull'), id: 'b' }, { ...newDay('Ruhetag', true), id: 'c' }], nextDayIndex: 0 };
  return s;
}

describe('Check-in: Datenmodell', () => {
  it('legt ein abgeschlossenes Training ohne Sätze an', async () => {
    const s = split3();
    await d.splits.put(s);
    const id = await createCheckin(s, { advance: true }, 5000, d);
    const row = (await d.sessions.get(id))!;
    expect(row).toMatchObject({ type: 'checkin', startedAt: 5000, endedAt: 5000, splitId: s.id, dayId: 'a', dayName: 'Push' });
    expect(await d.sets.count()).toBe(0);
    expect(await getOpenSession(d)).toBeUndefined(); // nie "laufend"
  });
  it('advance: Zeiger rückt hinter den heutigen Tag', async () => {
    const s = split3();
    await d.splits.put(s);
    await createCheckin(s, { advance: true }, 1, d);
    expect((await d.splits.get(s.id))!.nextDayIndex).toBe(1);
  });
  it('ohne advance: Zeiger bleibt, Eintrag heißt "Im Gym", kein Tag', async () => {
    const s = split3();
    await d.splits.put(s);
    const id = await createCheckin(s, { advance: false }, 1, d);
    expect((await d.splits.get(s.id))!.nextDayIndex).toBe(0);
    expect(await d.sessions.get(id)).toMatchObject({ dayName: 'Im Gym', dayId: null, splitId: s.id });
  });
  it('Ruhetag: Zeiger rückt nie weiter, auch nicht mit advance', async () => {
    const s = { ...split3(), nextDayIndex: 2 };
    await d.splits.put(s);
    expect(currentDay(s)!.rest).toBe(true);
    const id = await createCheckin(s, { advance: true }, 1, d);
    expect((await d.splits.get(s.id))!.nextDayIndex).toBe(2);
    expect((await d.sessions.get(id))!.dayName).toBe('Im Gym');
  });
  it('ohne Split geht es auch', async () => {
    const id = await createCheckin(undefined, { advance: true }, 1, d);
    expect(await d.sessions.get(id)).toMatchObject({ type: 'checkin', splitId: null, dayName: 'Im Gym' });
  });
  it('ein laufendes Training bleibt davon unberührt', async () => {
    const s = split3();
    await d.splits.put(s);
    const sid = await startSession(s, 'a', 10, d);
    await createCheckin(s, { advance: false }, 11, d);
    expect((await getOpenSession(d))!.id).toBe(sid);
    expect((await d.sessions.get(sid))!.type).toBe('full');
  });
});

describe('Check-in: alte Daten und Migration', () => {
  it('ohne type-Feld gilt "full"', () => {
    expect(sessionType({})).toBe('full');
    expect(isCheckin({ type: 'checkin' })).toBe(true);
    expect(isCheckin({ type: 'full' })).toBe(false);
  });
  it('Dexie-Upgrade von v1: Trainings bekommen type "full", Profil-Tabelle existiert', async () => {
    const name = `mig-${Math.random()}`;
    const old = new Dexie(name);
    old.version(1).stores({ exercises: 'id, name, equipment, custom', splits: 'id, templateId', sessions: '++id, startedAt', sets: '++id, sessionId, exerciseId, ts', settings: 'key' });
    await old.table('sessions').add({ startedAt: 1, endedAt: 2, splitId: null, dayId: null, dayName: 'Alt' });
    old.close();
    const upgraded = new GymDB(name);
    const rows = await upgraded.sessions.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ dayName: 'Alt', type: 'full' });
    expect(await upgraded.profile.count()).toBe(0);
  });
  it('finishSession funktioniert wie vorher', async () => {
    const s = split3();
    await d.splits.put(s);
    const sid = await startSession(s, 'a', 1, d);
    await logSet({ sessionId: sid, exerciseId: 'x', exerciseName: 'X', kg: 10, reps: 5, rpe: null }, d);
    expect(await finishSession(sid, 2, d)).toBe('finished');
    expect((await d.splits.get(s.id))!.nextDayIndex).toBe(1);
  });
});

describe('Check-in: kommt nie in Diagramme, Rekorde, Volumen, Sätze pro Woche', () => {
  const DAY = 86_400_000;
  const now = new Date(2026, 10, 20, 12).getTime();
  const sessions: Session[] = [
    { id: 1, type: 'full', startedAt: now - DAY, endedAt: now, splitId: null, dayId: null, dayName: 'Push' },
    { id: 2, type: 'checkin', startedAt: now - 2 * DAY, endedAt: now - 2 * DAY, splitId: null, dayId: null, dayName: 'Im Gym' },
  ];
  const mk = (id: number, sessionId: number, kg: number, reps: number): SetLog => ({ id, sessionId, exerciseId: 'bench', exerciseName: 'Bench', setIndex: id, kg, reps, rpe: null, ts: now });
  // Satz 3 hängt (absichtlich kaputt) an einem Check-in: darf trotzdem nirgends auftauchen
  const sets = [mk(1, 1, 100, 5), mk(2, 1, 100, 5), mk(3, 2, 200, 10)];
  const recs = buildRecords(sets, sessions, []);

  it('buildRecords überspringt Sätze von Check-ins', () => {
    expect(recs).toHaveLength(2);
    expect(recs.every((r) => r.set.sessionId === 1)).toBe(true);
  });
  it('Rekorde, Volumen und Trainingstage ohne Check-in', () => {
    expect(personalRecords(recs)[0].weight.kg).toBe(100);
    expect(summarize(recs)).toEqual({ days: 1, sets: 2, volume: 1000 });
  });
  it('Diagramm-Serien (Volumen, Sätze/Woche, 1RM) enthalten ihn nicht', () => {
    const vol = buildSeries(recs, { ...DEFAULT_FILTERS, metric: 'volume', range: 'all' }, now);
    expect(vol.points).toHaveLength(1);
    const wk = buildSeries(recs, { ...DEFAULT_FILTERS, metric: 'sets', range: 'all' }, now);
    expect(wk.points.reduce((n, p) => n + p.y, 0)).toBe(2);
  });
  it('ohne Sätze und nur Check-ins: leere Daten, kein Absturz', () => {
    const only = buildRecords([], [sessions[1]], []);
    expect(only).toEqual([]);
    expect(summarize(only)).toEqual({ days: 0, sets: 0, volume: 0 });
    expect(buildSeries(only, DEFAULT_FILTERS, now).points).toEqual([]);
  });
});
