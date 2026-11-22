import { openExercisePicker } from '../components/exercise-picker';
import { openSheet, toast } from '../components/modal';
import { setHeader } from '../components/shell';
import { h, svg } from '../lib/dom';
import { allExercises, invalidateExercises } from '../lib/exercises';
import { pickTextFile } from '../lib/files';
import { ICON } from '../lib/icons';
import { db } from '../lib/db';
import { navigate, type RouteContext } from '../lib/router';
import { importSplit, parseSplitExport } from '../lib/split-io';
import { blankSplit, currentDay, describeDays, duplicateSplit, splitFromTemplate } from '../lib/split-logic';
import { getActiveSplitId, listSplits, saveSplit, TEMPLATES } from '../lib/split-store';
import type { Split } from '../lib/types';

function splitCard(s: Split, activeId: string | null): HTMLElement {
  const day = currentDay(s);
  return h('a', { class: 'list-item split-card', href: `#/splits/${encodeURIComponent(s.id)}`, 'data-testid': 'split-card' },
    h('span', { class: 'list-item-text' },
      h('span', { class: 'list-item-title' }, s.name,
        s.id === activeId ? h('span', { class: 'chip chip-accent chip-inline' }, 'Aktiv') : null,
        s.rotating ? h('span', { class: 'chip chip-inline' }, 'Rotierend') : null),
      h('span', { class: 'muted small' }, describeDays(s) + (s.id === activeId && day ? ` · als Nächstes: ${day.name}` : ''))),
    svg(ICON.chevron, 'icon muted'));
}

export function openNewSplitSheet(): void {
  const sheet = openSheet('Neuer Split');
  const name = h('input', { class: 'input', type: 'text', maxlength: '80', placeholder: 'Name, z. B. Mein Push/Pull', 'data-testid': 'new-split-name' });
  const groups = [...new Set(TEMPLATES.map((t) => t.group))];
  const from = h('select', { class: 'input', 'data-testid': 'new-split-from' }, [
    h('option', { value: '' }, 'Leer beginnen'),
    ...groups.map((g) => h('optgroup', { label: g }, TEMPLATES.filter((t) => t.group === g).map((t) => h('option', { value: t.id }, t.name)))),
  ]);
  const create = h('button', { class: 'btn btn-primary btn-block', type: 'button', 'data-testid': 'new-split-create' }, 'Erstellen');
  create.addEventListener('click', async () => {
    const tpl = TEMPLATES.find((t) => t.id === from.value);
    const label = name.value.trim() || (tpl ? `${tpl.name} (Kopie)` : 'Mein Split');
    const split = tpl ? duplicateSplit(splitFromTemplate(tpl), label) : blankSplit(label);
    await saveSplit(split);
    sheet.close();
    navigate(`/splits/${encodeURIComponent(split.id)}`);
  });
  sheet.body.append(
    h('label', { class: 'field' }, h('span', null, 'Name'), name),
    h('label', { class: 'field' }, h('span', null, 'Ausgangspunkt'), from),
    h('p', { class: 'muted small' }, 'Aus einer Vorlage startest du mit deren Tagen und Muskel-Fokus. Alles lässt sich danach ändern.'),
    create);
}

export async function importSplitFromFile(): Promise<void> {
  const text = await pickTextFile();
  if (text === null) return;
  const parsed = parseSplitExport(text);
  if (!parsed.ok) { toast(parsed.error); return; }
  const [known, existing] = await Promise.all([allExercises(), listSplits()]);
  const res = importSplit(parsed.value, known, existing.map((s) => s.name));
  if (res.newCustom.length) { await db.exercises.bulkPut(res.newCustom); invalidateExercises(); }
  await saveSplit(res.split);
  toast(res.skipped ? `Importiert. ${res.skipped} unbekannte Übungen ausgelassen.` : 'Split importiert');
  navigate(`/splits/${encodeURIComponent(res.split.id)}`);
}

export async function renderSplits({ root, isCurrent }: RouteContext): Promise<void> {
  setHeader({ title: 'Splits' });
  const [splits, activeId] = await Promise.all([listSplits(), getActiveSplitId()]);
  if (!isCurrent()) return;
  const active = splits.find((s) => s.id === activeId);
  const mine = splits.filter((s) => !s.builtin).sort((a, b) => b.createdAt - a.createdAt);
  // Reihenfolge wie in splits.json (Gruppen und Vorlagen), nicht nach ID
  const order = new Map(TEMPLATES.map((t, i) => [`tpl-${t.id}`, i]));
  const builtin = splits.filter((s) => s.builtin).sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));

  root.append(
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': 'new-split', onclick: openNewSplitSheet }, svg(ICON.plus), 'Neuer Split'),
      h('button', { class: 'btn btn-ghost', type: 'button', 'data-testid': 'import-split', onclick: () => void importSplitFromFile() }, svg(ICON.download), 'Importieren')),
  );

  if (active) root.append(h('section', null, h('h2', null, 'Aktiver Split'), h('div', { class: 'list' }, splitCard(active, activeId))));

  root.append(h('section', null, h('h2', null, 'Meine Splits'),
    mine.length
      ? h('div', { class: 'list' }, mine.map((s) => splitCard(s, activeId)))
      : h('p', { class: 'muted' }, 'Noch nichts Eigenes. Erstelle einen neuen Split oder kopiere eine Vorlage.')));

  const groups = [...new Set(builtin.map((s) => s.group))];
  root.append(h('section', null, h('h2', null, 'Vorlagen'),
    h('p', { class: 'muted small' }, 'Vorlagen geben nur Tage und Muskel-Fokus vor. Du füllst sie mit deinen Übungen.'),
    groups.map((g) => h('details', { class: 'group', 'data-testid': 'group' },
      h('summary', null, g, h('span', { class: 'muted small' }, ` (${builtin.filter((s) => s.group === g).length})`)),
      h('div', { class: 'list' }, builtin.filter((s) => s.group === g).map((s) => splitCard(s, activeId)))))));

  root.append(h('section', { class: 'card' }, h('h2', null, 'Übungsdatenbank'),
    h('p', { class: 'muted' }, '876 Übungen mit Bildern. Suche nach Name, Muskel und Equipment oder lege eigene Übungen an.'),
    h('button', { class: 'btn btn-ghost btn-block', type: 'button', 'data-testid': 'open-exercises', onclick: () => openExercisePicker() },
      svg(ICON.search), 'Übungen durchsuchen')));
}
