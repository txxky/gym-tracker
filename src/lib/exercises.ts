import { db, getSetting, setSetting, type GymDB } from './db';
import { NO_EQUIPMENT } from './muscles';
import type { Exercise } from './types';

let cache: Exercise[] | null = null;

export function invalidateExercises(): void {
  cache = null;
}

/** Kopiert die mitgelieferte Übungs-DB beim ersten Start in IndexedDB. */
export async function seedExercises(data: Exercise[], d: GymDB = db): Promise<void> {
  await d.exercises.bulkPut(data.map((e) => ({ ...e, equipment: e.equipment ?? null })));
  await setSetting('exercisesSeeded', true, d);
}

export async function ensureExercisesSeeded(d: GymDB = db): Promise<void> {
  if (await getSetting('exercisesSeeded', false, d)) return;
  const mod = await import('../data/exercises.json');
  await seedExercises(mod.default as Exercise[], d);
  invalidateExercises();
}

export async function allExercises(): Promise<Exercise[]> {
  if (!cache) {
    const list = await db.exercises.toArray();
    list.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    cache = list;
  }
  return cache;
}

export async function getExercise(id: string): Promise<Exercise | undefined> {
  return (await allExercises()).find((e) => e.id === id);
}

export interface ExerciseFilter {
  q?: string;
  muscle?: string | null;
  equipment?: string | null;
}

/** Suche: alle Wörter müssen im Namen vorkommen. Muskel = Hauptmuskel. */
export function filterExercises(list: Exercise[], f: ExerciseFilter): Exercise[] {
  const tokens = (f.q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((e) => {
    if (f.muscle && !e.primaryMuscles.includes(f.muscle)) return false;
    if (f.equipment && (e.equipment ?? NO_EQUIPMENT) !== f.equipment) return false;
    const name = e.name.toLowerCase();
    return tokens.every((t) => name.includes(t));
  });
}

export interface CustomExerciseInput {
  name: string;
  primaryMuscles: string[];
  secondaryMuscles?: string[];
  equipment: string | null;
  photo?: Blob;
}

export async function addCustomExercise(input: CustomExerciseInput, d: GymDB = db): Promise<Exercise> {
  const ex: Exercise = {
    id: `custom-${crypto.randomUUID()}`,
    name: input.name.trim(),
    primaryMuscles: input.primaryMuscles,
    secondaryMuscles: input.secondaryMuscles ?? [],
    equipment: input.equipment === NO_EQUIPMENT ? null : input.equipment,
    level: null,
    instructions: [],
    images: [],
    custom: true,
    photo: input.photo,
  };
  await d.exercises.put(ex);
  invalidateExercises();
  return ex;
}

export async function deleteCustomExercise(id: string, d: GymDB = db): Promise<void> {
  await d.exercises.delete(id);
  invalidateExercises();
}
