// Erzeugt src/data/splits.json (Vorlagen: nur Tage + Muskel-Fokus, keine Übungen).
// Aufruf: node scripts/gen-splits.mjs
// Danach ist die JSON die Quelle der Wahrheit; dieses Skript ist nur die kompakte Schreibweise.
import { writeFileSync } from 'node:fs';

// Muskelgruppen (Schlüssel der Übungs-DB)
const BACK = ['lats', 'middle back', 'lower back', 'traps'];
const LEGS = ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'];
const PUSH = ['chest', 'shoulders', 'triceps'];
const PULL = ['lats', 'middle back', 'traps', 'biceps', 'forearms'];
const ARMS = ['biceps', 'triceps', 'forearms'];
const UPPER = ['chest', 'lats', 'middle back', 'traps', 'shoulders', 'biceps', 'triceps'];
const LOWER = ['quadriceps', 'hamstrings', 'glutes', 'calves', 'abdominals'];
const FULL = ['chest', 'lats', 'middle back', 'shoulders', 'quadriceps', 'hamstrings', 'glutes', 'biceps', 'triceps', 'abdominals'];
const ANTERIOR = ['quadriceps', 'chest', 'shoulders', 'biceps', 'abdominals'];
const POSTERIOR = ['hamstrings', 'glutes', ...BACK, 'shoulders', 'triceps'];
const TORSO = ['chest', ...BACK, 'shoulders'];
const LIMBS = [...LEGS, ...ARMS];

const d = (name, focus) => ({ name, rest: false, focus, weekday: null });
const G = {
  full: 'Ganzkörper',
  ul: 'Upper/Lower',
  ppl: 'Push/Pull/Legs',
  hybrid: 'Hybride',
  other: 'Vorne/Hinten & Sonstige',
  body: 'Body Part',
};

const t = (id, group, name, description, days, extra = {}) => ({ id, name, group, description, rotating: false, ...extra, days });

const templates = [
  // Ganzkörper
  t('fullbody-2', G.full, 'Full Body 2x', 'Zwei Ganzkörper-Einheiten pro Woche. Einstieg mit wenig Zeitaufwand.',
    ['A', 'B'].map((x) => d(`Full Body ${x}`, FULL))),
  t('fullbody-3', G.full, 'Full Body 3x', 'Drei Ganzkörper-Einheiten pro Woche, z. B. Mo/Mi/Fr.',
    ['A', 'B', 'C'].map((x) => d(`Full Body ${x}`, FULL))),
  t('fullbody-4', G.full, 'Full Body 4x', 'Vier Ganzkörper-Einheiten pro Woche für mehr Frequenz und Volumen.',
    ['A', 'B', 'C', 'D'].map((x) => d(`Full Body ${x}`, FULL))),
  t('fbeod', G.full, 'FBEOD (Full Body Every Other Day)',
    'Ganzkörper jeden zweiten Tag, rotierend A/B/C. Keine festen Wochentage: Du trainierst, wenn du an der Reihe bist.',
    ['A', 'B', 'C'].map((x) => d(`Full Body ${x}`, FULL)), { rotating: true }),

  // Upper/Lower
  t('ul-2', G.ul, 'Upper/Lower 2 Tage', 'Oberkörper und Unterkörper je einmal pro Woche.',
    [d('Upper', UPPER), d('Lower', LOWER)]),
  t('ulf-3', G.ul, 'Upper/Lower/Full Body 3 Tage', 'Upper, Lower und ein Ganzkörper-Tag.',
    [d('Upper', UPPER), d('Lower', LOWER), d('Full Body', FULL)]),
  t('ul-4', G.ul, 'Upper/Lower 4 Tage', 'Jeder Muskel zweimal pro Woche.',
    [d('Upper A', UPPER), d('Lower A', LOWER), d('Upper B', UPPER), d('Lower B', LOWER)]),
  t('ul-6', G.ul, 'Upper/Lower 6 Tage', 'U L U L U L mit A/B/C-Varianten. Jeder Muskel dreimal pro Woche.',
    ['A', 'B', 'C'].flatMap((x) => [d(`Upper ${x}`, UPPER), d(`Lower ${x}`, LOWER)])),
  t('phul-4', G.ul, 'PHUL 4 Tage', 'Power Hypertrophy Upper Lower: zwei Kraft-Tage, zwei Hypertrophie-Tage.',
    [d('Upper Power', UPPER), d('Lower Power', LOWER), d('Upper Hypertrophie', UPPER), d('Lower Hypertrophie', LOWER)]),

  // Push/Pull/Legs
  t('ppl-3', G.ppl, 'PPL 3 Tage', 'Push, Pull, Legs, jede Gruppe einmal pro Woche.',
    [d('Push', PUSH), d('Pull', PULL), d('Legs', [...LEGS, 'abdominals'])]),
  t('ppl-6', G.ppl, 'PPL 6 Tage', 'Push, Pull, Legs zweimal pro Woche (A/B-Varianten).',
    ['A', 'B'].flatMap((x) => [d(`Push ${x}`, PUSH), d(`Pull ${x}`, PULL), d(`Legs ${x}`, [...LEGS, 'abdominals'])])),
  t('ppl-plus-one-4', G.ppl, 'PPL plus one 4 Tage', 'Push, Pull, Legs plus ein vierter Tag, den du frei belegst (z. B. Schwachstellen).',
    [d('Push', PUSH), d('Pull', PULL), d('Legs', [...LEGS, 'abdominals']), d('Freier Tag', [])]),
  t('pushpull-4', G.ppl, 'Push/Pull 4 Tage', 'Zwei Push- und zwei Pull-Tage. Push enthält Quadrizeps, Pull enthält Beinbeuger und Gesäß.',
    ['A', 'B'].flatMap((x) => [
      d(`Push ${x}`, [...PUSH, 'quadriceps', 'calves']),
      d(`Pull ${x}`, [...PULL, 'hamstrings', 'glutes', 'lower back']),
    ])),

  // Hybride
  t('pplxul-5', G.hybrid, 'PPLxUL 5 Tage', 'Push, Pull, Legs, dann Upper und Lower.',
    [d('Push', PUSH), d('Pull', PULL), d('Legs', [...LEGS, 'abdominals']), d('Upper', UPPER), d('Lower', LOWER)]),
  t('ulppl-5', G.hybrid, 'ULPPL 5 Tage', 'Upper, Lower, dann Push, Pull, Legs.',
    [d('Upper', UPPER), d('Lower', LOWER), d('Push', PUSH), d('Pull', PULL), d('Legs', [...LEGS, 'abdominals'])]),
  t('phat-5', G.hybrid, 'PHAT 5 Tage', 'Power Hypertrophy Adaptive Training: zwei Power-Tage, drei Hypertrophie-Tage.',
    [
      d('Upper Power', UPPER),
      d('Lower Power', LOWER),
      d('Rücken + Schultern', ['lats', 'middle back', 'traps', 'lower back', 'shoulders']),
      d('Lower Hypertrophie', LOWER),
      d('Brust + Arme', ['chest', ...ARMS]),
    ]),

  // Vorne/Hinten und Sonstige
  t('ap-4', G.other, 'Anterior/Posterior 4 Tage',
    'Vorderseite (Quads, Brust, vordere Schulter, Bizeps, Bauch) und Rückseite (Hamstrings, Glutes, Rücken, hintere Schulter, Trizeps). Jeder Muskel zweimal.',
    ['A', 'B'].flatMap((x) => [d(`Anterior ${x}`, ANTERIOR), d(`Posterior ${x}`, POSTERIOR)])),
  t('ap-6', G.other, 'Anterior/Posterior 6 Tage', 'Wie Anterior/Posterior 4, aber dreimal pro Muskel und Woche.',
    ['A', 'B', 'C'].flatMap((x) => [d(`Anterior ${x}`, ANTERIOR), d(`Posterior ${x}`, POSTERIOR)])),
  t('torso-limbs-4', G.other, 'Torso/Limbs 4 Tage', 'Torso: Brust, Rücken, Schultern. Limbs: Beine, Bizeps, Trizeps.',
    ['A', 'B'].flatMap((x) => [d(`Torso ${x}`, TORSO), d(`Limbs ${x}`, LIMBS)])),
  t('antagonist-4', G.other, 'Antagonist-Split 4 Tage', 'Gegenspieler-Muskeln am selben Tag, Beine separat.',
    [
      d('Brust + Rücken + Arme', ['chest', ...BACK, ...ARMS]),
      d('Beine A', LEGS),
      d('Brust + Rücken + Schultern + Arme', ['chest', ...BACK, 'shoulders', ...ARMS]),
      d('Beine B', LEGS),
    ]),

  // Body Part
  t('arnold-6', G.body, 'Arnold Split 6 Tage', 'Brust + Rücken, Schultern + Arme, Beine + Core, dann alles nochmal.',
    [0, 1].flatMap((i) => [
      d(`Brust + Rücken ${'AB'[i]}`, ['chest', ...BACK]),
      d(`Schultern + Arme ${'AB'[i]}`, ['shoulders', ...ARMS]),
      d(`Beine + Core ${'AB'[i]}`, [...LEGS, 'abdominals', 'lower back']),
    ])),
  t('bro-5', G.body, 'Bro Split 5 Tage', 'Ein Muskel pro Tag: Brust, Rücken, Schultern, Arme, Beine.',
    [d('Brust', ['chest']), d('Rücken', BACK), d('Schultern', ['shoulders', 'traps']), d('Arme', ARMS), d('Beine', LEGS)]),
  t('bodypart-4', G.body, 'Body Part 4 Tage', 'Brust + Trizeps, Rücken + Bizeps, Schultern + Bauch, Beine + Waden.',
    [
      d('Brust + Trizeps', ['chest', 'triceps']),
      d('Rücken + Bizeps', [...BACK, 'biceps']),
      d('Schultern + Bauch', ['shoulders', 'abdominals']),
      d('Beine + Waden', LEGS),
    ]),
];

writeFileSync(new URL('../src/data/splits.json', import.meta.url), JSON.stringify(templates, null, 1) + '\n');

// Lesbare Übersicht zum Gegenprüfen (ohne JSON-Kenntnisse)
const DE = {
  abdominals: 'Bauch', abductors: 'Abduktoren', adductors: 'Adduktoren', biceps: 'Bizeps', calves: 'Waden', chest: 'Brust',
  forearms: 'Unterarme', glutes: 'Gesäß', hamstrings: 'Beinbeuger', lats: 'Latissimus', 'lower back': 'Unterer Rücken',
  'middle back': 'Mittlerer Rücken', neck: 'Nacken', quadriceps: 'Quadrizeps', shoulders: 'Schultern', traps: 'Trapez', triceps: 'Trizeps',
};
const lines = [
  '# Split-Vorlagen im Überblick',
  '',
  'Diese Datei wird automatisch aus `src/data/splits.json` erzeugt (`node scripts/gen-splits.mjs`). Nicht von Hand ändern.',
  'Vorlagen geben nur **Tage und Muskel-Fokus** vor, keine Übungen. In der App lässt sich alles ändern.',
  '',
];
for (const group of [...new Set(templates.map((t) => t.group))]) {
  lines.push(`## ${group}`, '');
  for (const t of templates.filter((x) => x.group === group)) {
    lines.push(`### ${t.name}`, '', t.description + (t.rotating ? ' (rotierend, ohne feste Wochentage)' : ''), '', '| Tag | Muskel-Fokus |', '|---|---|');
    for (const d of t.days) lines.push(`| ${d.name} | ${d.focus.length ? d.focus.map((m) => DE[m]).join(', ') : 'frei wählbar'} |`);
    lines.push('');
  }
}
writeFileSync(new URL('../docs/vorlagen.md', import.meta.url), lines.join('\n'));
console.log(`${templates.length} Vorlagen geschrieben`);
