import { describe, expect, it } from 'vitest';
import {
  addDaysKey, addMonthsKey, addYearsKey, dayKey, indexDays, isTrainingDay, keyOf, monthCounts, monthGrid, parseKey, weekdayIndex,
} from '../src/lib/calendar';
import type { Session } from '../src/lib/types';

describe('Kalender: Datumsberechnung', () => {
  it('Schlüssel sind lokal und nullgefüllt', () => {
    expect(keyOf(2026, 0, 5)).toBe('2026-01-05');
    expect(dayKey(new Date(2026, 10, 22, 23, 59))).toBe('2026-11-22');
    expect(dayKey(new Date(2026, 10, 22, 0, 0))).toBe('2026-11-22');
    expect(parseKey('2026-02-03').getDate()).toBe(3);
  });
  it('Wochenstart Montag', () => {
    expect(weekdayIndex(new Date(2026, 10, 23))).toBe(0); // Montag
    expect(weekdayIndex(new Date(2026, 10, 22))).toBe(6); // Sonntag
  });
  it('November 2026 (1. ist ein Sonntag): 6 Zeilen, Zeile 1 beginnt am 26. Oktober', () => {
    const g = monthGrid(2026, 10);
    expect(g).toHaveLength(6);
    expect(g.every((r) => r.length === 7)).toBe(true);
    expect(g[0][0]).toMatchObject({ key: '2026-10-26', inMonth: false });
    expect(g[0][6]).toMatchObject({ key: '2026-11-01', inMonth: true });
    expect(g[4][6]).toMatchObject({ key: '2026-11-29', inMonth: true });
    expect(g[5][0]).toMatchObject({ key: '2026-11-30', inMonth: true });
    expect(g[5][1]).toMatchObject({ key: '2026-12-01', inMonth: false });
  });
  it('Februar 2027 (1. ist Montag, 28 Tage) hat genau 4 Zeilen', () => {
    const g = monthGrid(2027, 1);
    expect(g).toHaveLength(4);
    expect(g[0][0]).toMatchObject({ key: '2027-02-01', inMonth: true });
    expect(g[3][6]).toMatchObject({ key: '2027-02-28', inMonth: true });
  });
  it('Schaltjahr: Februar 2028 hat den 29.', () => {
    const days = monthGrid(2028, 1).flat().filter((c) => c.inMonth);
    expect(days).toHaveLength(29);
    expect(days[28].key).toBe('2028-02-29');
  });
  it('Jede Zelle hat einen eindeutigen Tag, lückenlos aufsteigend (auch über die Sommerzeit-Umstellung)', () => {
    for (const [y, m] of [[2026, 2], [2026, 9], [2026, 10], [2027, 2]] as const) {
      const keys = monthGrid(y, m).flat().map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
      keys.slice(1).forEach((k, i) => expect(k).toBe(addDaysKey(keys[i], 1)));
    }
  });
  it('Tage und Monate verschieben, Jahres- und Monatsgrenzen', () => {
    expect(addDaysKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysKey('2027-03-01', -1)).toBe('2027-02-28');
    expect(addDaysKey('2026-03-28', 1)).toBe('2026-03-29'); // Sommerzeit-Tag
    expect(addDaysKey('2026-03-29', 1)).toBe('2026-03-30');
    expect(addMonthsKey('2026-01-31', 1)).toBe('2026-02-01'); // kein Überlauf in den März
    expect(addMonthsKey('2026-01-15', -1)).toBe('2025-12-01');
    expect(addMonthsKey('2026-11-22', 3)).toBe('2027-02-01');
    expect(addYearsKey('2026-11-22', 1)).toBe('2027-01-01');
  });
});

describe('Kalender: Trainingstage aus Sessions', () => {
  const at = (y: number, m: number, d: number, h = 18) => new Date(y, m, d, h).getTime();
  const sessions: Session[] = [
    { id: 1, type: 'full', startedAt: at(2026, 10, 3), endedAt: at(2026, 10, 3, 19), splitId: null, dayId: null, dayName: 'Push' },
    { id: 2, startedAt: at(2026, 10, 5), endedAt: at(2026, 10, 5, 19), splitId: null, dayId: null, dayName: 'Alt (ohne type)' },
    { id: 3, type: 'checkin', startedAt: at(2026, 10, 7), endedAt: at(2026, 10, 7), splitId: null, dayId: null, dayName: 'Im Gym' },
    { id: 4, type: 'full', startedAt: at(2026, 10, 9), endedAt: null, splitId: null, dayId: null, dayName: 'Offen, ohne Sätze' },
    { id: 5, type: 'checkin', startedAt: at(2026, 10, 3, 7), endedAt: at(2026, 10, 3, 7), splitId: null, dayId: null, dayName: 'Im Gym' },
    { id: 6, type: 'full', startedAt: at(2026, 9, 31, 23), endedAt: at(2026, 9, 31, 23), splitId: null, dayId: null, dayName: 'Spät' },
  ];
  const map = indexDays(sessions, new Set([1, 2, 6]));

  it('volles Training mit Sätzen, altes ohne type und Check-in zählen; offenes ohne Sätze nicht', () => {
    expect(map.get('2026-11-03')).toMatchObject({ full: true, checkin: true });
    expect(map.get('2026-11-05')).toMatchObject({ full: true, checkin: false });
    expect(map.get('2026-11-07')).toMatchObject({ full: false, checkin: true });
    expect(map.has('2026-11-09')).toBe(false);
    expect(isTrainingDay(map.get('2026-11-09'))).toBe(false);
  });
  it('mehrere Einträge am Tag sind nach Zeit sortiert; Datum zählt lokal (23 Uhr bleibt am selben Tag)', () => {
    expect(map.get('2026-11-03')!.sessions.map((s) => s.id)).toEqual([5, 1]);
    expect(map.get('2026-10-31')).toBeDefined();
    expect(map.has('2026-11-01')).toBe(false);
  });
  it('Monatszähler für die Jahresübersicht', () => {
    const c = monthCounts(map, 2026);
    expect(c[10]).toBe(3); // 3., 5., 7. November
    expect(c[9]).toBe(1);
    expect(c.reduce((a, b) => a + b, 0)).toBe(4);
    expect(monthCounts(map, 2025).every((n) => n === 0)).toBe(true);
  });
  it('keine Daten: leere Karte, kein Absturz', () => {
    expect(indexDays([], new Set()).size).toBe(0);
    expect(monthCounts(new Map(), 2026)).toEqual(Array(12).fill(0));
  });
});
