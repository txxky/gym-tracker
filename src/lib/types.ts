export interface Exercise {
  id: string;
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string | null;
  level: string | null;
  instructions: string[];
  /** Pfade relativ zu IMAGE_BASE, z. B. "3_4_Sit-Up/0.jpg" */
  images: string[];
  custom?: boolean;
  /** Eigenes Foto (nur bei eigenen Übungen) */
  photo?: Blob;
}

export interface PlannedExercise {
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
}

export interface SplitDay {
  id: string;
  name: string;
  rest: boolean;
  /** Muskel-Fokus (englische DB-Schlüssel, z. B. "chest") */
  focus: string[];
  /** 0 = Montag ... 6 = Sonntag, optional */
  weekday: number | null;
  exercises: PlannedExercise[];
}

export interface Split {
  id: string;
  name: string;
  group: string;
  description: string;
  /** Vorlagen-ID aus splits.json, falls aus einer Vorlage entstanden */
  templateId: string | null;
  /** true = mitgelieferte Vorlage (zurücksetzbar) */
  builtin: boolean;
  /** Rotierend ohne feste Wochentage (z. B. FBEOD) */
  rotating: boolean;
  days: SplitDay[];
  /** Zyklus-Zeiger: Index des nächsten Tages */
  nextDayIndex: number;
  createdAt: number;
}

export type SessionType = 'full' | 'checkin';

export interface Session {
  id?: number;
  /** 'checkin' = nur im Gym gewesen (ohne Sätze). Fehlt das Feld (alte Daten), gilt 'full'. */
  type?: SessionType;
  startedAt: number;
  endedAt: number | null;
  splitId: string | null;
  dayId: string | null;
  dayName: string;
}

export interface SetLog {
  id?: number;
  sessionId: number;
  exerciseId: string;
  /** Namenskopie, falls die Übung später gelöscht wird */
  exerciseName: string;
  setIndex: number;
  kg: number;
  reps: number;
  rpe: number | null;
  ts: number;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

export type Gender = 'female' | 'male' | 'diverse';

/** Lokales Profil (eine Zeile mit id 'me'). Alles optional außer der id. */
export interface Profile {
  id: 'me';
  username: string;
  photo?: Blob;
  heightCm: number | null;
  weightKg: number | null;
  birthYear: number | null;
  gender: Gender | null;
  goal: string;
  updatedAt: number;
}
