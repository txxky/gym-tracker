import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { backupFileName, buildBackup, parseBackup, restoreBackup } from '../src/lib/backup';
import { GymDB, setSetting } from '../src/lib/db';
import { logSet, startSession, finishSession } from '../src/lib/log';
import { defaultPlan, blankSplit } from '../src/lib/split-logic';
import { ensureSplitsSeeded, saveSplit } from '../src/lib/split-store';
import type { Exercise } from '../src/lib/types';

let d: GymDB;
beforeEach(() => { d = new GymDB(`backup-${Math.random()}`); });

async function fill(db: GymDB) {
  await ensureSplitsSeeded(db);
  const split = blankSplit('Mein Split');
  split.days[0].exercises.push(defaultPlan('custom-1', 75));
  await saveSplit(split, db);
  const photo = new Blob([new Uint8Array([1, 2, 3, 250, 251, 252])], { type: 'image/jpeg' });
  const custom: Exercise = { id: 'custom-1', name: 'Eigen', primaryMuscles: ['chest'], secondaryMuscles: [], equipment: null, level: null, instructions: [], images: [], custom: true, photo };
  await db.exercises.put(custom);
  await db.exercises.put({ ...custom, id: 'Bench', name: 'Bench', custom: undefined, photo: undefined });
  const sid = await startSession(split, split.days[0].id, 1000, db);
  await logSet({ sessionId: sid, exerciseId: 'custom-1', exerciseName: 'Eigen', kg: 50, reps: 8, rpe: 8.5 }, db);
  await finishSession(sid, 2000, db);
  await setSetting('defaultRestSec', 120, db);
  await setSetting('activeSplitId', split.id, db);
  await setSetting('exercisesSeeded', true, db);
  return { split };
}

describe('Backup: Export und Import aller Daten', () => {
  it('Runde Export -> Datei -> Import in eine leere DB stellt alles her (inkl. Foto)', async () => {
    const { split } = await fill(d);
    const text = JSON.stringify(await buildBackup(d, new Date(2026, 0, 2)));
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.dropped).toBe(0);

    const fresh = new GymDB(`restore-${Math.random()}`);
    const res = await restoreBackup(parsed.value, fresh);
    expect(res).toMatchObject({ sessions: 1, sets: 1, exercises: 1 });
    expect((await fresh.splits.get(split.id))!.days[0].exercises[0]).toMatchObject({ exerciseId: 'custom-1', restSec: 75 });
    const ex = (await fresh.exercises.get('custom-1'))!;
    expect(ex.photo).toBeInstanceOf(Blob);
    expect(new Uint8Array(await ex.photo!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 250, 251, 252]));
    expect((await fresh.sets.toArray())[0]).toMatchObject({ kg: 50, reps: 8, rpe: 8.5, exerciseName: 'Eigen' });
    expect((await fresh.settings.get('defaultRestSec'))!.value).toBe(120);
    expect((await fresh.settings.get('activeSplitId'))!.value).toBe(split.id);
    // Vorlagen sind nach dem Import wieder vollständig da
    expect(await fresh.splits.count()).toBe(24);
  });

  it('Import ersetzt vorhandene Daten, mitgelieferte Übungen bleiben unangetastet', async () => {
    await fill(d);
    const backup = parseBackup(JSON.stringify(await buildBackup(d)));
    if (!backup.ok) throw new Error('parse');
    const other = new GymDB(`other-${Math.random()}`);
    await other.exercises.put({ id: 'Squat', name: 'Squat', primaryMuscles: ['quadriceps'], secondaryMuscles: [], equipment: null, level: null, instructions: [], images: [] });
    await other.exercises.put({ id: 'custom-alt', name: 'Alt', primaryMuscles: ['lats'], secondaryMuscles: [], equipment: null, level: null, instructions: [], images: [], custom: true });
    await other.sessions.add({ startedAt: 5, endedAt: 6, splitId: null, dayId: null, dayName: 'Alt' });
    await restoreBackup(backup.value, other);
    expect(await other.exercises.get('Squat')).toBeDefined();
    expect(await other.exercises.get('custom-alt')).toBeUndefined();
    expect(await other.exercises.get('custom-1')).toBeDefined();
    expect((await other.sessions.toArray()).map((s) => s.dayName)).toEqual(['Tag 1']);
  });

  it('Fehler beim Import lassen den alten Stand unberührt (Transaktion)', async () => {
    await fill(d);
    const before = await d.sets.count();
    const parsed = parseBackup(JSON.stringify(await buildBackup(d)));
    if (!parsed.ok) throw new Error('parse');
    // künstlich kaputt: ein Satz mit Schlüssel, der in IndexedDB nicht erlaubt ist
    parsed.value.sets = [{ ...parsed.value.sets[0], id: {} as unknown as number }];
    await expect(restoreBackup(parsed.value, d)).rejects.toBeDefined();
    expect(await d.sets.count()).toBe(before);
    expect(await d.sessions.count()).toBe(1);
  });
});

describe('Backup: kaputte oder fremde Dateien', () => {
  it.each([
    ['kein JSON', '<html>', /kein gültiges JSON/],
    ['Array', '[]', /keine Gym-Tracker-Sicherung/],
    ['Split-Export statt Sicherung', '{"format":"gym-tracker-split","version":1}', /keine Gym-Tracker-Sicherung/],
    ['neuere Version', '{"format":"gym-tracker-backup","version":99}', /neueren/],
  ])('%s -> Meldung statt Absturz', (_n, text, re) => {
    const r = parseBackup(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(re);
  });

  it('leere Sicherung ist gültig und leer', () => {
    const r = parseBackup('{"format":"gym-tracker-backup","version":1}');
    expect(r.ok && r.value.sets).toEqual([]);
  });

  it('verwirft kaputte Einträge und zählt sie; Zahlen werden begrenzt', () => {
    const r = parseBackup(JSON.stringify({
      format: 'gym-tracker-backup', version: 1,
      sessions: [{ id: 1, startedAt: 10, endedAt: null, dayName: 'A' }, { id: 1, startedAt: 11 }, 'x', { startedAt: 3 }],
      sets: [
        { id: 1, sessionId: 1, exerciseId: 'a', kg: 99999, reps: -5, rpe: 99 },
        { id: 2, sessionId: 777, exerciseId: 'a', kg: 1, reps: 1 }, // Session fehlt
        { id: 3, sessionId: 1, exerciseId: 'a', kg: 'viel', reps: 1 },
        null,
      ],
      splits: [{ id: 's', name: 'S', days: [] }, { id: 't', name: 'T', days: [{ id: 'd', name: 'D', exercises: [{ exerciseId: 'a', sets: 99 }] }], nextDayIndex: 9 }],
      customExercises: [{ id: 'Bench', name: 'Gehackt' }, { id: 'custom-9', name: 'Ok' }],
      settings: { defaultRestSec: 99999, activeSplitId: 'gibt-es-nicht', useRpe: 'ja', exercisesSeeded: false, evil: 1 },
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sessions).toHaveLength(1);
    expect(r.value.sets).toHaveLength(1);
    expect(r.value.sets[0]).toMatchObject({ kg: 1000, reps: 1, rpe: 10 });
    expect(r.value.splits).toHaveLength(1);
    expect(r.value.splits[0].days[0].exercises[0].sets).toBe(12);
    expect(r.value.splits[0].nextDayIndex).toBe(0);
    expect(r.value.customExercises.map((e) => e.id)).toEqual(['custom-9']);
    expect(r.value.settings).toEqual({ defaultRestSec: 600, activeSplitId: null });
    expect(r.dropped).toBeGreaterThanOrEqual(8);
  });
});

describe('Dateiname', () => {
  it('enthält das Datum', () => {
    expect(backupFileName(new Date(2026, 0, 5))).toBe('gym-tracker-sicherung-2026-01-05.json');
  });
});
