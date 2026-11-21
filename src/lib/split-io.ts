import { MUSCLE_DE, NO_EQUIPMENT, EQUIPMENT_DE } from './muscles';
import { clamp, newDay, newId, normalizePlan, SET_LIMITS, MAX_DAYS } from './split-logic';
import type { Exercise, Split, SplitDay } from './types';

export const EXPORT_FORMAT = 'gym-tracker-split';
export const EXPORT_VERSION = 1;

interface ExportedExercise {
  exerciseId: string;
  exerciseName: string;
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
}
interface ExportedCustom {
  id: string;
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string | null;
}
export interface SplitExport {
  format: typeof EXPORT_FORMAT;
  version: number;
  split: {
    name: string;
    description: string;
    rotating: boolean;
    days: Array<{ name: string; rest: boolean; focus: string[]; weekday: number | null; exercises: ExportedExercise[] }>;
  };
  /** Eigene Übungen, die der Split nutzt (ohne Foto), damit Kollegen ihn vollständig bekommen. */
  customExercises: ExportedCustom[];
}

export function buildExport(split: Split, exercises: Exercise[]): SplitExport {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const usedCustom = new Map<string, ExportedCustom>();
  const days = split.days.map((d) => ({
    name: d.name, rest: d.rest, focus: [...d.focus], weekday: d.weekday,
    exercises: d.exercises.map((p) => {
      const ex = byId.get(p.exerciseId);
      if (ex?.custom) {
        usedCustom.set(ex.id, {
          id: ex.id, name: ex.name, primaryMuscles: ex.primaryMuscles, secondaryMuscles: ex.secondaryMuscles, equipment: ex.equipment,
        });
      }
      return { ...p, exerciseName: ex?.name ?? p.exerciseId };
    }),
  }));
  return {
    format: EXPORT_FORMAT, version: EXPORT_VERSION,
    split: { name: split.name, description: split.description, rotating: split.rotating, days },
    customExercises: [...usedCustom.values()],
  };
}

export type ParseResult = { ok: true; value: SplitExport } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number, fallback = ''): string => (typeof v === 'string' ? v.trim().slice(0, max) : fallback);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const muscles = (v: unknown): string[] => (Array.isArray(v) ? v.filter((m): m is string => typeof m === 'string' && m in MUSCLE_DE) : []);

/**
 * Liest fremdes JSON defensiv: nichts wird blind übernommen, Zahlen werden begrenzt,
 * unbekannte Muskeln verworfen. Wirft nie, sondern gibt eine verständliche Fehlermeldung zurück.
 */
export function parseSplitExport(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Die Datei ist kein gültiges JSON.' };
  }
  if (!isObj(raw) || raw.format !== EXPORT_FORMAT) return { ok: false, error: 'Das ist keine Gym-Tracker-Split-Datei.' };
  if (typeof raw.version !== 'number' || raw.version > EXPORT_VERSION) {
    return { ok: false, error: 'Diese Datei stammt aus einer neueren App-Version. Bitte die App aktualisieren.' };
  }
  if (!isObj(raw.split) || !Array.isArray(raw.split.days)) return { ok: false, error: 'Die Datei enthält keinen Split.' };
  const name = str(raw.split.name, 80);
  if (!name) return { ok: false, error: 'Der Split hat keinen Namen.' };
  if (raw.split.days.length === 0) return { ok: false, error: 'Der Split hat keine Tage.' };

  const days = raw.split.days.slice(0, MAX_DAYS).map((d: unknown) => {
    const day = isObj(d) ? d : {};
    const weekday = num(day.weekday, -1);
    return {
      name: str(day.name, 60, 'Tag') || 'Tag',
      rest: day.rest === true,
      focus: muscles(day.focus),
      weekday: weekday >= 0 && weekday <= 6 ? Math.round(weekday) : null,
      exercises: (Array.isArray(day.exercises) ? day.exercises : []).slice(0, 60).flatMap((e: unknown) => {
        if (!isObj(e) || typeof e.exerciseId !== 'string' || !e.exerciseId) return [];
        return [{
          exerciseId: e.exerciseId.slice(0, 120),
          exerciseName: str(e.exerciseName, 120),
          sets: clamp(num(e.sets, 3), SET_LIMITS.sets),
          repMin: clamp(num(e.repMin, 8), SET_LIMITS.reps),
          repMax: clamp(num(e.repMax, 12), SET_LIMITS.reps),
          restSec: clamp(num(e.restSec, 90), SET_LIMITS.rest),
        }];
      }),
    };
  });

  // Eigene Übungen: IDs müssen mit "custom-" beginnen, damit eine Datei nie mitgelieferte Übungen überschreibt.
  const customExercises = (Array.isArray(raw.customExercises) ? raw.customExercises : []).slice(0, 300).flatMap((c: unknown) => {
    if (!isObj(c) || typeof c.id !== 'string' || !c.id.startsWith('custom-') || c.id.length > 80) return [];
    const nm = str(c.name, 80);
    const primary = muscles(c.primaryMuscles);
    if (!nm || !primary.length) return [];
    const eq = typeof c.equipment === 'string' && c.equipment in EQUIPMENT_DE && c.equipment !== NO_EQUIPMENT ? c.equipment : null;
    return [{ id: c.id, name: nm, primaryMuscles: primary, secondaryMuscles: muscles(c.secondaryMuscles), equipment: eq }];
  });

  return {
    ok: true,
    value: {
      format: EXPORT_FORMAT, version: EXPORT_VERSION,
      split: { name, description: str(raw.split.description, 400), rotating: raw.split.rotating === true, days },
      customExercises,
    },
  };
}

export interface ImportResult {
  split: Split;
  /** Eigene Übungen, die lokal noch fehlen und neu angelegt werden müssen */
  newCustom: Exercise[];
  /** Übungen, die es hier nicht gibt (z. B. andere DB-Version) und die ausgelassen wurden */
  skipped: number;
}

export function importSplit(exp: SplitExport, known: Exercise[], takenNames: string[], now = Date.now()): ImportResult {
  const knownIds = new Set(known.map((e) => e.id));
  const newCustom: Exercise[] = [];
  for (const c of exp.customExercises) {
    if (knownIds.has(c.id)) continue;
    knownIds.add(c.id);
    newCustom.push({ ...c, level: null, instructions: [], images: [], custom: true });
  }
  let skipped = 0;
  const days: SplitDay[] = exp.split.days.map((d) => ({
    ...newDay(d.name, d.rest),
    focus: d.focus,
    weekday: d.weekday,
    exercises: d.exercises.flatMap((e) => {
      if (!knownIds.has(e.exerciseId)) { skipped++; return []; }
      return [normalizePlan({ exerciseId: e.exerciseId, sets: e.sets, repMin: e.repMin, repMax: e.repMax, restSec: e.restSec })];
    }),
  }));
  let name = exp.split.name;
  for (let i = 2; takenNames.includes(name); i++) name = `${exp.split.name} (${i})`;
  return {
    split: {
      id: newId(), name, group: 'Eigene', description: exp.split.description, templateId: null, builtin: false,
      rotating: exp.split.rotating, days, nextDayIndex: 0, createdAt: now,
    },
    newCustom, skipped,
  };
}

export function exportFileName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-+|-+$/g, '') || 'split';
  return `gym-split-${slug}.json`;
}
