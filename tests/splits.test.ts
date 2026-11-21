import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { GymDB } from '../src/lib/db';
import { MUSCLE_DE } from '../src/lib/muscles';
import {
  addDay, advanceCycle, blankSplit, currentDay, defaultPlan, describeDays, duplicateSplit, formatPlan,
  moveDay, moveItem, newDay, normalizePlan, removeDay, splitFromTemplate,
} from '../src/lib/split-logic';
import {
  ensureSplitsSeeded, deleteSplit, getActiveSplit, listSplits, resetBuiltin, saveSplit, setActiveSplit, TEMPLATES,
} from '../src/lib/split-store';
import type { Split } from '../src/lib/types';

const tpl = (id: string) => TEMPLATES.find((t) => t.id === id)!;

describe('Vorlagen (splits.json)', () => {
  it('enthält alle 23 geforderten Vorlagen', () => {
    expect(TEMPLATES.map((t) => t.id).sort()).toEqual([
      'antagonist-4', 'ap-4', 'ap-6', 'arnold-6', 'bodypart-4', 'bro-5', 'fbeod', 'fullbody-2', 'fullbody-3', 'fullbody-4',
      'phat-5', 'phul-4', 'pplxul-5', 'ppl-3', 'ppl-6', 'ppl-plus-one-4', 'pushpull-4', 'torso-limbs-4', 'ul-2', 'ul-4', 'ul-6',
      'ulf-3', 'ulppl-5',
    ].sort());
  });
  it.each([
    ['fullbody-2', 2], ['fullbody-3', 3], ['fullbody-4', 4], ['fbeod', 3], ['ul-2', 2], ['ulf-3', 3], ['ul-4', 4], ['ul-6', 6],
    ['phul-4', 4], ['ppl-3', 3], ['ppl-6', 6], ['ppl-plus-one-4', 4], ['pushpull-4', 4], ['pplxul-5', 5], ['ulppl-5', 5],
    ['phat-5', 5], ['ap-4', 4], ['ap-6', 6], ['torso-limbs-4', 4], ['antagonist-4', 4], ['arnold-6', 6], ['bro-5', 5], ['bodypart-4', 4],
  ])('%s hat %i Tage', (id, n) => {
    expect(tpl(id).days).toHaveLength(n);
  });
  it('Vorlagen enthalten keine Übungen, nur gültige Muskeln', () => {
    for (const t of TEMPLATES) {
      for (const d of t.days) {
        expect('exercises' in d).toBe(false);
        for (const m of d.focus) expect(MUSCLE_DE[m], `${t.id}: ${m}`).toBeTruthy();
      }
    }
  });
  it('IDs und Namen sind eindeutig', () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    expect(new Set(TEMPLATES.map((t) => t.name)).size).toBe(TEMPLATES.length);
  });
  it('FBEOD ist rotierend, PPL plus one hat einen freien vierten Tag', () => {
    expect(tpl('fbeod').rotating).toBe(true);
    expect(tpl('ppl-plus-one-4').days[3].focus).toEqual([]);
  });
  it('PHAT hat die fünf geforderten Tage', () => {
    expect(tpl('phat-5').days.map((d) => d.name)).toEqual(
      ['Upper Power', 'Lower Power', 'Rücken + Schultern', 'Lower Hypertrophie', 'Brust + Arme']);
  });
  it('Anterior/Posterior: Anterior hat Quads/Brust/Bizeps/Bauch, Posterior Hamstrings/Glutes/Trizeps', () => {
    const [a, p] = tpl('ap-4').days;
    expect(a.focus).toEqual(expect.arrayContaining(['quadriceps', 'chest', 'biceps', 'abdominals']));
    expect(p.focus).toEqual(expect.arrayContaining(['hamstrings', 'glutes', 'triceps', 'lats']));
  });
});

describe('Zyklus und Tage', () => {
  const make = (): Split => ({ ...splitFromTemplate(tpl('ppl-3')), nextDayIndex: 1 });
  it('"Als Nächstes" ist der Tag am Zeiger, nach dem letzten Tag geht es von vorn los', () => {
    let s = make();
    expect(currentDay(s)!.name).toBe('Pull');
    s = advanceCycle(advanceCycle(s));
    expect(currentDay(s)!.name).toBe('Push');
  });
  it('Tag verschieben: Zeiger bleibt auf demselben Tag', () => {
    const s = moveDay(make(), 1, 0);
    expect(s.days.map((d) => d.name)).toEqual(['Pull', 'Push', 'Legs']);
    expect(currentDay(s)!.name).toBe('Pull');
  });
  it('Tag löschen vor dem Zeiger schiebt ihn zurück; letzter Tag bleibt immer erhalten', () => {
    let s = removeDay(make(), 0);
    expect(currentDay(s)!.name).toBe('Pull');
    s = removeDay(removeDay(s, 0), 0);
    expect(s.days).toHaveLength(1);
  });
  it('Zeiger auf gelöschtem letzten Tag bleibt gültig', () => {
    const s = removeDay({ ...make(), nextDayIndex: 2 }, 2);
    expect(s.nextDayIndex).toBeLessThan(s.days.length);
    expect(currentDay(s)).toBeDefined();
  });
  it('Ruhetag einfügen und zusammenfassen', () => {
    const s = addDay(make(), newDay('Ruhetag', true));
    expect(s.days).toHaveLength(4);
    expect(describeDays(s)).toBe('3 Trainingstage, 1 Ruhetag');
  });
  it('moveItem klemmt auf gültige Grenzen', () => {
    expect(moveItem([1, 2, 3], 0, 99)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 2, -5)).toEqual([3, 1, 2]);
    expect(moveItem([1, 2, 3], 7, 0)).toEqual([1, 2, 3]);
  });
});

describe('Sätze und Rep-Range', () => {
  it('formatiert "3 x 6 bis 8" und "3 x 8"', () => {
    expect(formatPlan({ exerciseId: 'x', sets: 3, repMin: 6, repMax: 8, restSec: 90 })).toBe('3 x 6 bis 8');
    expect(formatPlan({ exerciseId: 'x', sets: 3, repMin: 8, repMax: 8, restSec: 90 })).toBe('3 x 8');
  });
  it('Rep-Max ist nie kleiner als Rep-Min; Werte werden begrenzt', () => {
    const p = normalizePlan({ exerciseId: 'x', sets: 99, repMin: 20, repMax: 5, restSec: 0 });
    expect(p).toMatchObject({ sets: 12, repMin: 20, repMax: 20, restSec: 15 });
    expect(defaultPlan('x', 120)).toMatchObject({ sets: 3, repMin: 8, repMax: 12, restSec: 120 });
  });
});

describe('Duplizieren', () => {
  it('Kopie hat neue IDs, ist nicht builtin, Original bleibt unverändert', () => {
    const orig = splitFromTemplate(tpl('ul-4'));
    orig.days[0].exercises.push(defaultPlan('abc', 90));
    const copy = duplicateSplit(orig, 'Mein UL');
    expect(copy.name).toBe('Mein UL');
    expect(copy.builtin).toBe(false);
    expect(copy.templateId).toBeNull();
    expect(copy.id).not.toBe(orig.id);
    expect(copy.days[0].id).not.toBe(orig.days[0].id);
    copy.days[0].exercises[0].sets = 9;
    expect(orig.days[0].exercises[0].sets).toBe(3);
  });
  it('blankSplit hat einen Tag und einen Standardnamen bei leerem Namen', () => {
    expect(blankSplit('  ').name).toBe('Mein Split');
    expect(blankSplit('X').days).toHaveLength(1);
  });
});

describe('Split-Speicher (IndexedDB)', () => {
  let d: GymDB;
  beforeEach(() => { d = new GymDB(`splits-${Math.random()}`); });

  it('kopiert beim ersten Start alle Vorlagen und überschreibt später nichts', async () => {
    await ensureSplitsSeeded(d);
    expect(await d.splits.count()).toBe(23);
    const s = (await d.splits.get('tpl-ppl-3'))!;
    s.days[0].exercises.push(defaultPlan('abc', 90));
    s.name = 'Mein PPL';
    await saveSplit(s, d);
    await ensureSplitsSeeded(d);
    expect((await d.splits.get('tpl-ppl-3'))!.name).toBe('Mein PPL');
    expect(await d.splits.count()).toBe(23);
  });
  it('Reset stellt den Originalzustand wieder her', async () => {
    await ensureSplitsSeeded(d);
    const s = (await d.splits.get('tpl-ppl-3'))!;
    s.days = [newDay('Kaputt')];
    s.name = 'Kaputt';
    await saveSplit(s, d);
    const fresh = (await resetBuiltin('tpl-ppl-3', d))!;
    expect(fresh.name).toBe('PPL 3 Tage');
    expect(fresh.days.map((x) => x.name)).toEqual(['Push', 'Pull', 'Legs']);
  });
  it('Reset gilt nur für Vorlagen; eigene Splits lassen sich löschen, Vorlagen nicht', async () => {
    await ensureSplitsSeeded(d);
    const mine = blankSplit('Eigen');
    await saveSplit(mine, d);
    expect(await resetBuiltin(mine.id, d)).toBeUndefined();
    expect(await deleteSplit('tpl-ppl-3', d)).toBe(false);
    expect(await deleteSplit(mine.id, d)).toBe(true);
    expect(await listSplits(d)).toHaveLength(23);
  });
  it('aktiver Split: setzen, lesen; Löschen des aktiven Splits räumt auf', async () => {
    await ensureSplitsSeeded(d);
    expect(await getActiveSplit(d)).toBeUndefined();
    const mine = blankSplit('Eigen');
    await saveSplit(mine, d);
    await setActiveSplit(mine.id, d);
    expect((await getActiveSplit(d))!.id).toBe(mine.id);
    await deleteSplit(mine.id, d);
    expect(await getActiveSplit(d)).toBeUndefined();
  });
});

describe('Lesbare Übersicht docs/vorlagen.md', () => {
  it('ist synchron zu splits.json (nach Änderungen: node scripts/gen-splits.mjs)', async () => {
    const { readFileSync } = await import('node:fs');
    const md = readFileSync(new URL('../docs/vorlagen.md', import.meta.url), 'utf8');
    for (const t of TEMPLATES) {
      expect(md, t.name).toContain(`### ${t.name}`);
      for (const d of t.days) expect(md, `${t.name}: ${d.name}`).toContain(`| ${d.name} |`);
    }
  });
});
