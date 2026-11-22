import { db, type GymDB } from './db';
import type { Gender, Profile } from './types';

export const PROFILE_LIMITS = {
  height: [120, 230] as const,
  weight: [30, 250] as const,
  weightStep: 0.5,
  birthYear: [1930, new Date().getFullYear()] as const,
  usernameMax: 30,
  goalMax: 60,
};
export const GENDERS: Array<[Gender | '', string]> = [['', 'Keine Angabe'], ['female', 'Weiblich'], ['male', 'Männlich'], ['diverse', 'Divers']];
export const GOAL_SUGGESTIONS = ['Muskelaufbau', 'Kraft', 'Abnehmen', 'Fit bleiben'];

export const emptyProfile = (): Profile => ({
  id: 'me', username: '', heightCm: null, weightKg: null, birthYear: null, gender: null, goal: '', updatedAt: 0,
});

const inRange = (n: unknown, [lo, hi]: readonly [number, number]): number | null =>
  typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi ? n : null;

/** Macht aus beliebigen Eingaben ein gültiges Profil (ungültige Felder werden leer). Photo wird nicht angefasst. */
export function cleanProfile(raw: Record<string, unknown>): Omit<Profile, 'photo'> {
  const g = raw.gender;
  const wt = inRange(raw.weightKg, PROFILE_LIMITS.weight);
  const yr = inRange(raw.birthYear, PROFILE_LIMITS.birthYear);
  const ht = inRange(raw.heightCm, PROFILE_LIMITS.height);
  return {
    id: 'me',
    username: typeof raw.username === 'string' ? raw.username.trim().slice(0, PROFILE_LIMITS.usernameMax) : '',
    heightCm: ht === null ? null : Math.round(ht),
    weightKg: wt === null ? null : Math.round(wt * 2) / 2,
    birthYear: yr === null ? null : Math.round(yr),
    gender: g === 'female' || g === 'male' || g === 'diverse' ? g : null,
    goal: typeof raw.goal === 'string' ? raw.goal.trim().slice(0, PROFILE_LIMITS.goalMax) : '',
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
  };
}

/** Initialen für den Avatar: erste Buchstaben der ersten zwei Wörter, groß. Leer, wenn kein Name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const first = Array.from(parts[0])[0] ?? '';
  const second = parts.length > 1 ? Array.from(parts[1])[0] ?? '' : '';
  return (first + second).toUpperCase();
}

export async function getProfile(d: GymDB = db): Promise<Profile> {
  return (await d.profile.get('me')) ?? emptyProfile();
}

let chain: Promise<unknown> = Promise.resolve();

/** Ändert einzelne Felder. Schreibzugriffe laufen nacheinander, damit schnelle Eingaben sich nicht überholen. */
export function saveProfile(patch: Partial<Omit<Profile, 'id'>>, d: GymDB = db): Promise<Profile> {
  const run = chain.then(async () => {
    const cur = await getProfile(d);
    const next: Profile = { ...cleanProfile({ ...cur, ...patch }), photo: 'photo' in patch ? patch.photo : cur.photo, updatedAt: Date.now() };
    if (!next.photo) delete next.photo;
    await d.profile.put(next);
    if (d === db && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('profilechange'));
    return next;
  });
  chain = run.catch(() => undefined);
  return run;
}
