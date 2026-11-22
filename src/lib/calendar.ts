import { isCheckin } from './log';
import type { Session } from './types';

/** Reine Datumslogik für den Kalender. Alles in lokaler Zeit, Wochenstart Montag. Keine Millisekunden-Rechnung über Tage (Sommerzeit!). */

const p2 = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" in lokaler Zeit. */
export const keyOf = (y: number, m: number, d: number): string => `${y}-${p2(m + 1)}-${p2(d)}`;
export const dayKey = (ms: number | Date): string => {
  const d = typeof ms === 'number' ? new Date(ms) : ms;
  return keyOf(d.getFullYear(), d.getMonth(), d.getDate());
};

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysKey(key: string, n: number): string {
  const d = parseKey(key);
  return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

/** Monat verschieben; liefert immer den 1. des Zielmonats (kein Überlauf wie 31. Jan + 1 Monat). */
export function addMonthsKey(key: string, n: number): string {
  const d = parseKey(key);
  return keyOf(...ym(new Date(d.getFullYear(), d.getMonth() + n, 1)), 1);
}
const ym = (d: Date): [number, number] => [d.getFullYear(), d.getMonth()];

export function addYearsKey(key: string, n: number): string {
  return keyOf(parseKey(key).getFullYear() + n, 0, 1);
}

/** 0 = Montag ... 6 = Sonntag */
export const weekdayIndex = (d: Date): number => (d.getDay() + 6) % 7;

export interface Cell { key: string; day: number; inMonth: boolean }

/** Wochen (Zeilen) eines Monats, Montag zuerst, aufgefüllt mit Tagen der Nachbarmonate. 4 bis 6 Zeilen. */
export function monthGrid(year: number, month: number): Cell[][] {
  const first = new Date(year, month, 1);
  const lead = weekdayIndex(first);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const total = Math.ceil((lead + daysInMonth) / 7) * 7;
  const cells: Cell[] = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(year, month, 1 - lead + i);
    cells.push({ key: dayKey(d), day: d.getDate(), inMonth: d.getMonth() === month });
  }
  const rows: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

export interface DayInfo {
  key: string;
  sessions: Session[];
  /** mindestens ein volles Training mit Sätzen */
  full: boolean;
  /** mindestens ein Check-in ("im Gym gewesen") */
  checkin: boolean;
}

/**
 * Trainingstage nach Datum. Ein volles Training zählt nur, wenn es mindestens einen Satz hat
 * (withSets = Session-IDs mit Sätzen); ein leeres, offenes Training ist kein Trainingstag.
 * Ein Check-in zählt immer.
 */
export function indexDays(sessions: Session[], withSets: ReadonlySet<number>): Map<string, DayInfo> {
  const map = new Map<string, DayInfo>();
  for (const s of sessions) {
    const checkin = isCheckin(s);
    if (!checkin && !(s.id !== undefined && withSets.has(s.id))) continue;
    const key = dayKey(s.startedAt);
    const info = map.get(key) ?? { key, sessions: [], full: false, checkin: false };
    info.sessions.push(s);
    if (checkin) info.checkin = true; else info.full = true;
    map.set(key, info);
  }
  for (const info of map.values()) info.sessions.sort((a, b) => a.startedAt - b.startedAt);
  return map;
}

export const isTrainingDay = (i: DayInfo | undefined): boolean => !!i && (i.full || i.checkin);

/** Anzahl Trainingstage (voll oder Check-in) je Monat eines Jahres. */
export function monthCounts(map: Map<string, DayInfo>, year: number): number[] {
  const out = Array<number>(12).fill(0);
  for (const info of map.values()) {
    const d = parseKey(info.key);
    if (d.getFullYear() === year && isTrainingDay(info)) out[d.getMonth()]++;
  }
  return out;
}
