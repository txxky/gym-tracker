/** Deutsche Anzeigenamen. Übungsnamen bleiben Englisch, Muskeln und Equipment sind Deutsch. */
export const MUSCLE_DE: Record<string, string> = {
  abdominals: 'Bauch',
  abductors: 'Abduktoren',
  adductors: 'Adduktoren',
  biceps: 'Bizeps',
  calves: 'Waden',
  chest: 'Brust',
  forearms: 'Unterarme',
  glutes: 'Gesäß',
  hamstrings: 'Beinbeuger',
  lats: 'Latissimus',
  'lower back': 'Unterer Rücken',
  'middle back': 'Mittlerer Rücken',
  neck: 'Nacken',
  quadriceps: 'Quadrizeps',
  shoulders: 'Schultern',
  traps: 'Trapez',
  triceps: 'Trizeps',
};

/** Reihenfolge für Filter-Chips (grob von oben nach unten). */
export const MUSCLE_ORDER = [
  'chest', 'lats', 'middle back', 'lower back', 'traps', 'shoulders', 'biceps', 'triceps', 'forearms',
  'abdominals', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'neck',
];

export const NO_EQUIPMENT = 'none';

export const EQUIPMENT_DE: Record<string, string> = {
  [NO_EQUIPMENT]: 'Kein Gerät',
  'body only': 'Körpergewicht',
  machine: 'Maschine',
  other: 'Sonstiges',
  'foam roll': 'Faszienrolle',
  kettlebells: 'Kettlebell',
  dumbbell: 'Kurzhantel',
  cable: 'Kabelzug',
  barbell: 'Langhantel',
  bands: 'Bänder',
  'medicine ball': 'Medizinball',
  'exercise ball': 'Gymnastikball',
  'e-z curl bar': 'SZ-Stange',
};

export const LEVEL_DE: Record<string, string> = {
  beginner: 'Anfänger',
  intermediate: 'Fortgeschritten',
  expert: 'Experte',
};

export function muscleLabel(m: string): string {
  return MUSCLE_DE[m] ?? m;
}

export function equipmentLabel(e: string | null): string {
  return EQUIPMENT_DE[e ?? NO_EQUIPMENT] ?? e ?? EQUIPMENT_DE[NO_EQUIPMENT];
}
