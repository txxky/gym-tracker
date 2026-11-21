import { db, type GymDB } from './db';
import { clamp, normalizePlan, SET_LIMITS } from './split-logic';
import { ensureSplitsSeeded } from './split-store';
import type { Exercise, Session, SetLog, Split, SplitDay } from './types';

export const BACKUP_FORMAT = 'gym-tracker-backup';
export const BACKUP_VERSION = 1;
/** Nur diese Einstellungen gehören ins Backup (kein internes Seeding-Flag). */
export const BACKUP_SETTINGS = ['defaultRestSec', 'activeSplitId', 'useRpe', 'restAuto', 'restSound'] as const;

const LIMITS = { sessions: 100_000, sets: 1_000_000, splits: 500, exercises: 2000 };

interface BackupExercise extends Omit<Exercise, 'photo'> {
  photo?: { type: string; base64: string };
}
export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  customExercises: BackupExercise[];
  splits: Split[];
  sessions: Session[];
  sets: SetLog[];
  settings: Record<string, unknown>;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToBlob(base64: string, type: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function buildBackup(d: GymDB = db, now = new Date()): Promise<Backup> {
  const [exercises, splits, sessions, sets, settingRows] = await Promise.all([
    d.exercises.filter((e) => e.custom === true).toArray(), d.splits.toArray(), d.sessions.toArray(), d.sets.toArray(), d.settings.toArray(),
  ]);
  const customExercises: BackupExercise[] = await Promise.all(exercises.map(async ({ photo, ...rest }) => (
    photo ? { ...rest, photo: { type: photo.type || 'image/jpeg', base64: await blobToBase64(photo) } } : rest
  )));
  const settings: Record<string, unknown> = {};
  for (const row of settingRows) if ((BACKUP_SETTINGS as readonly string[]).includes(row.key)) settings[row.key] = row.value;
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), customExercises, splits, sessions, sets, settings };
}

// ---- Prüfen und Bereinigen ----

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 200): string | null => (typeof v === 'string' ? v.slice(0, max) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strArr = (v: unknown, max = 40): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max).map((x) => x.slice(0, 200)) : []);

function cleanSplit(raw: unknown): Split | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id, 120);
  const name = str(raw.name, 80)?.trim();
  if (!id || !name || !Array.isArray(raw.days) || raw.days.length === 0) return null;
  const days: SplitDay[] = [];
  for (const d of raw.days.slice(0, 14)) {
    if (!isObj(d)) continue;
    const did = str(d.id, 120);
    if (!did) continue;
    const wd = num(d.weekday);
    days.push({
      id: did, name: (str(d.name, 60)?.trim() || 'Tag'), rest: d.rest === true, focus: strArr(d.focus),
      weekday: wd !== null && wd >= 0 && wd <= 6 ? Math.round(wd) : null,
      exercises: (Array.isArray(d.exercises) ? d.exercises : []).slice(0, 60).flatMap((p: unknown) => {
        if (!isObj(p) || typeof p.exerciseId !== 'string') return [];
        return [normalizePlan({
          exerciseId: p.exerciseId.slice(0, 120), sets: num(p.sets) ?? 3, repMin: num(p.repMin) ?? 8, repMax: num(p.repMax) ?? 12,
          restSec: num(p.restSec) ?? 90,
        })];
      }),
    });
  }
  if (!days.length) return null;
  const next = num(raw.nextDayIndex) ?? 0;
  return {
    id, name, group: str(raw.group, 60) ?? 'Eigene', description: str(raw.description, 400) ?? '',
    templateId: str(raw.templateId, 120), builtin: raw.builtin === true, rotating: raw.rotating === true, days,
    nextDayIndex: clamp(next, [0, days.length - 1]), createdAt: num(raw.createdAt) ?? Date.now(),
  };
}

export type ParseBackup = { ok: true; value: Backup; dropped: number } | { ok: false; error: string };

/** Liest ein Backup defensiv. Kaputte Einzelteile werden verworfen (und gezählt), das Ganze stürzt nie ab. */
export function parseBackup(text: string): ParseBackup {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'Die Datei ist kein gültiges JSON.' }; }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT) return { ok: false, error: 'Das ist keine Gym-Tracker-Sicherung.' };
  if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION) {
    return { ok: false, error: 'Diese Sicherung stammt aus einer neueren App-Version. Bitte die App aktualisieren.' };
  }
  const arr = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
  let dropped = 0;

  const splits: Split[] = [];
  for (const s of arr(raw.splits, LIMITS.splits)) { const c = cleanSplit(s); if (c) splits.push(c); else dropped++; }

  const sessions: Session[] = [];
  const sessionIds = new Set<number>();
  for (const s of arr(raw.sessions, LIMITS.sessions)) {
    if (!isObj(s)) { dropped++; continue; }
    const id = num(s.id); const startedAt = num(s.startedAt);
    if (id === null || startedAt === null || sessionIds.has(id)) { dropped++; continue; }
    sessionIds.add(id);
    sessions.push({
      id, startedAt, endedAt: num(s.endedAt), splitId: str(s.splitId, 120), dayId: str(s.dayId, 120), dayName: str(s.dayName, 60) ?? 'Training',
    });
  }

  const sets: SetLog[] = [];
  const setIds = new Set<number>();
  for (const s of arr(raw.sets, LIMITS.sets)) {
    if (!isObj(s)) { dropped++; continue; }
    const id = num(s.id); const sessionId = num(s.sessionId); const kg = num(s.kg); const reps = num(s.reps);
    const exerciseId = str(s.exerciseId, 120);
    // Sätze ohne zugehöriges Training würden in der App nirgends auftauchen
    if (id === null || sessionId === null || !sessionIds.has(sessionId) || kg === null || reps === null || !exerciseId || setIds.has(id)) { dropped++; continue; }
    setIds.add(id);
    const rpe = num(s.rpe);
    sets.push({
      id, sessionId, exerciseId, exerciseName: str(s.exerciseName, 120) ?? exerciseId,
      setIndex: Math.max(1, Math.round(num(s.setIndex) ?? 1)), kg: Math.min(1000, Math.max(0, kg)), reps: clamp(reps, [1, 1000]),
      rpe: rpe === null ? null : Math.min(10, Math.max(0, rpe)), ts: num(s.ts) ?? 0,
    });
  }

  const customExercises: BackupExercise[] = [];
  for (const e of arr(raw.customExercises, LIMITS.exercises)) {
    if (!isObj(e)) { dropped++; continue; }
    const id = str(e.id, 120); const name = str(e.name, 80)?.trim();
    // Nur eigene Übungen: mitgelieferte lassen sich nicht über eine Datei überschreiben
    if (!id || !id.startsWith('custom-') || !name) { dropped++; continue; }
    const photo = isObj(e.photo) && typeof e.photo.base64 === 'string' && typeof e.photo.type === 'string' && e.photo.type.startsWith('image/')
      ? { type: e.photo.type, base64: e.photo.base64 } : undefined;
    customExercises.push({
      id, name, primaryMuscles: strArr(e.primaryMuscles), secondaryMuscles: strArr(e.secondaryMuscles), equipment: str(e.equipment, 60),
      level: null, instructions: [], images: [], custom: true, photo,
    });
  }

  const settings: Record<string, unknown> = {};
  if (isObj(raw.settings)) {
    for (const key of BACKUP_SETTINGS) {
      const v = raw.settings[key];
      if (key === 'defaultRestSec') { const n = num(v); if (n !== null) settings[key] = clamp(n, SET_LIMITS.rest); }
      else if (key === 'activeSplitId') { if (typeof v === 'string' || v === null) settings[key] = v; }
      else if (typeof v === 'boolean') settings[key] = v;
    }
  }
  // Aktiver Split muss existieren
  if (typeof settings.activeSplitId === 'string' && !splits.some((s) => s.id === settings.activeSplitId)) settings.activeSplitId = null;

  return {
    ok: true, dropped,
    value: { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: str(raw.exportedAt, 40) ?? '', customExercises, splits, sessions, sets, settings },
  };
}

export interface RestoreResult { sessions: number; sets: number; splits: number; exercises: number }

/** Ersetzt alle Nutzerdaten durch das Backup. Alles in einer Transaktion: bei einem Fehler bleibt der alte Stand. */
export async function restoreBackup(b: Backup, d: GymDB = db): Promise<RestoreResult> {
  const customs: Exercise[] = b.customExercises.map(({ photo, ...rest }) => (photo ? { ...rest, photo: base64ToBlob(photo.base64, photo.type) } : rest));
  await d.transaction('rw', [d.exercises, d.splits, d.sessions, d.sets, d.settings], async () => {
    await d.sessions.clear();
    await d.sets.clear();
    await d.splits.clear();
    await d.exercises.bulkDelete(await d.exercises.filter((e) => e.custom === true).primaryKeys());
    for (const key of BACKUP_SETTINGS) await d.settings.delete(key);
    await d.exercises.bulkPut(customs);
    await d.splits.bulkPut(b.splits);
    await d.sessions.bulkPut(b.sessions);
    await d.sets.bulkPut(b.sets);
    await d.settings.bulkPut(Object.entries(b.settings).map(([key, value]) => ({ key, value })));
  });
  // Fehlende mitgelieferte Vorlagen wieder anlegen (z. B. Backup aus einer älteren Version)
  await ensureSplitsSeeded(d);
  return { sessions: b.sessions.length, sets: b.sets.length, splits: b.splits.length, exercises: customs.length };
}

export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `gym-tracker-sicherung-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}
