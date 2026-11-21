import { describe, expect, it } from 'vitest';
import {
  buildExport, exportFileName, importSplit, parseSplitExport,
} from '../src/lib/split-io';
import { defaultPlan, splitFromTemplate } from '../src/lib/split-logic';
import { TEMPLATES } from '../src/lib/split-store';
import type { Exercise } from '../src/lib/types';

const ex = (id: string, custom = false): Exercise => ({
  id, name: `Name ${id}`, primaryMuscles: ['chest'], secondaryMuscles: [], equipment: 'barbell', level: null,
  instructions: [], images: [], custom,
});
const known = [ex('Bench'), ex('custom-1', true)];

function sample() {
  const s = splitFromTemplate(TEMPLATES.find((t) => t.id === 'ppl-3')!);
  s.days[0].exercises.push(defaultPlan('Bench', 90), defaultPlan('custom-1', 60));
  return s;
}

describe('Export/Import', () => {
  it('Runde Export -> Text -> Import ergibt denselben Split mit neuen IDs', () => {
    const text = JSON.stringify(buildExport(sample(), known));
    const parsed = parseSplitExport(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const res = importSplit(parsed.value, [ex('Bench')], []);
    expect(res.split.days.map((d) => d.name)).toEqual(['Push', 'Pull', 'Legs']);
    expect(res.split.builtin).toBe(false);
    expect(res.split.days[0].exercises.map((e) => e.exerciseId)).toEqual(['Bench', 'custom-1']);
    // die eigene Übung des Kollegen wird mit angelegt
    expect(res.newCustom.map((e) => e.id)).toEqual(['custom-1']);
    expect(res.skipped).toBe(0);
  });
  it('doppelter Name bekommt einen Zähler', () => {
    const parsed = parseSplitExport(JSON.stringify(buildExport(sample(), known)));
    if (!parsed.ok) throw new Error('parse');
    expect(importSplit(parsed.value, known, ['PPL 3 Tage']).split.name).toBe('PPL 3 Tage (2)');
    expect(importSplit(parsed.value, known, ['PPL 3 Tage', 'PPL 3 Tage (2)']).split.name).toBe('PPL 3 Tage (3)');
  });
  it('unbekannte Übungen werden ausgelassen und gezählt', () => {
    const parsed = parseSplitExport(JSON.stringify(buildExport(sample(), known)));
    if (!parsed.ok) throw new Error('parse');
    parsed.value.customExercises = [];
    const res = importSplit(parsed.value, [ex('Bench')], []);
    expect(res.skipped).toBe(1);
    expect(res.split.days[0].exercises).toHaveLength(1);
  });
});

describe('Import: kaputte oder fremde Dateien', () => {
  it.each([
    ['kein JSON', 'das ist kein json', /kein gültiges JSON/],
    ['leeres Objekt', '{}', /keine Gym-Tracker/],
    ['Array', '[]', /keine Gym-Tracker/],
    ['null', 'null', /keine Gym-Tracker/],
    ['falsches Format', '{"format":"anderes","version":1}', /keine Gym-Tracker/],
    ['neuere Version', '{"format":"gym-tracker-split","version":99,"split":{}}', /neueren/],
    ['kein Split', '{"format":"gym-tracker-split","version":1}', /keinen Split/],
    ['kein Name', '{"format":"gym-tracker-split","version":1,"split":{"name":"  ","days":[{}]}}', /keinen Namen/],
    ['keine Tage', '{"format":"gym-tracker-split","version":1,"split":{"name":"X","days":[]}}', /keine Tage/],
  ])('%s -> verständliche Fehlermeldung statt Absturz', (_n, text, re) => {
    const r = parseSplitExport(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(re);
  });

  it('begrenzt Zahlen, verwirft unbekannte Muskeln und Müll-Felder', () => {
    const r = parseSplitExport(JSON.stringify({
      format: 'gym-tracker-split', version: 1,
      split: { name: 'X', days: [{ name: 5, focus: ['chest', 'pizza', 7], weekday: 9, exercises: [
        { exerciseId: 'Bench', sets: 9999, repMin: -3, repMax: 'viele', restSec: 1 }, 'müll', { exerciseId: 5 },
      ] }] },
      customExercises: [],
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const day = r.value.split.days[0];
    expect(day.name).toBe('Tag');
    expect(day.focus).toEqual(['chest']);
    expect(day.weekday).toBeNull();
    expect(day.exercises).toHaveLength(1);
    expect(day.exercises[0]).toMatchObject({ sets: 12, repMin: 1, repMax: 12, restSec: 15 });
  });

  it('eine Datei kann keine mitgelieferten Übungen überschreiben (nur custom-IDs)', () => {
    const r = parseSplitExport(JSON.stringify({
      format: 'gym-tracker-split', version: 1,
      split: { name: 'X', days: [{ name: 'A', exercises: [] }] },
      customExercises: [
        { id: 'Bench', name: 'Gehackt', primaryMuscles: ['chest'] },
        { id: 'custom-ok', name: 'OK', primaryMuscles: ['chest'] },
        { id: 'custom-ohne-muskel', name: 'Nope', primaryMuscles: ['pizza'] },
      ],
    }));
    if (!r.ok) throw new Error('parse');
    expect(r.value.customExercises.map((c) => c.id)).toEqual(['custom-ok']);
  });

  it('sehr viele Tage werden auf das Maximum gekürzt', () => {
    const days = Array.from({ length: 100 }, (_, i) => ({ name: `T${i}`, exercises: [] }));
    const r = parseSplitExport(JSON.stringify({ format: 'gym-tracker-split', version: 1, split: { name: 'X', days } }));
    if (!r.ok) throw new Error('parse');
    expect(r.value.split.days.length).toBe(14);
  });
});

describe('Dateiname', () => {
  it('macht aus dem Namen einen sicheren Dateinamen', () => {
    expect(exportFileName('PPL 3 Tage / Test?')).toBe('gym-split-ppl-3-tage-test.json');
    expect(exportFileName('???')).toBe('gym-split-split.json');
  });
});
