import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import data from '../src/data/exercises.json';
import { GymDB, getSetting } from '../src/lib/db';
import { filterExercises, seedExercises } from '../src/lib/exercises';
import { collectImageUrls, imageUrl } from '../src/lib/images';
import { EQUIPMENT_DE, MUSCLE_DE, NO_EQUIPMENT } from '../src/lib/muscles';
import type { Exercise } from '../src/lib/types';

const list = data as Exercise[];

describe('mitgelieferte Übungs-DB', () => {
  it('hat 876 Übungen, 3 davon ohne Bild', () => {
    expect(list).toHaveLength(876);
    expect(list.filter((e) => e.images.length === 0).map((e) => e.name).sort()).toEqual([
      'Kettlebell Halo', 'Kettlebell Halo with Overhead Extension', 'Kettlebell Overhead Triceps Extension',
    ]);
  });
  it('jede Muskel- und Equipment-Angabe hat eine deutsche Übersetzung', () => {
    const muscles = new Set(list.flatMap((e) => [...e.primaryMuscles, ...e.secondaryMuscles]));
    for (const m of muscles) expect(MUSCLE_DE[m], m).toBeTruthy();
    for (const e of list) expect(EQUIPMENT_DE[e.equipment ?? NO_EQUIPMENT], String(e.equipment)).toBeTruthy();
  });
  it('baut Bild-URLs auf raw.githubusercontent', () => {
    expect(imageUrl('3_4_Sit-Up/0.jpg')).toBe(
      'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/3_4_Sit-Up/0.jpg');
    expect(collectImageUrls(list)).toHaveLength(1746);
  });
});

describe('filterExercises', () => {
  it('Suche: alle Wörter, egal in welcher Reihenfolge, ohne Groß/Klein', () => {
    const r = filterExercises(list, { q: 'PRESS bench' });
    expect(r.length).toBeGreaterThan(5);
    expect(r.every((e) => /bench/i.test(e.name) && /press/i.test(e.name))).toBe(true);
  });
  it('Muskel-Filter nutzt den Hauptmuskel', () => {
    const r = filterExercises(list, { muscle: 'chest' });
    expect(r).toHaveLength(84);
  });
  it('Equipment "kein Gerät" findet Übungen mit equipment null', () => {
    expect(filterExercises(list, { equipment: NO_EQUIPMENT })).toHaveLength(77);
  });
  it('Filter lassen sich kombinieren; leeres Ergebnis ist ein leeres Array', () => {
    expect(filterExercises(list, { q: 'zzzzqq' })).toEqual([]);
    const r = filterExercises(list, { muscle: 'biceps', equipment: 'barbell', q: 'curl' });
    expect(r.length).toBeGreaterThan(0);
  });
});

describe('Seeding', () => {
  let d: GymDB;
  beforeEach(() => { d = new GymDB(`test-${Math.random()}`); });
  it('kopiert alle Übungen in IndexedDB und merkt sich das', async () => {
    await seedExercises(list, d);
    expect(await d.exercises.count()).toBe(876);
    expect(await getSetting('exercisesSeeded', false, d)).toBe(true);
    expect((await d.exercises.get(list[0].id))?.name).toBe(list[0].name);
  });
});
