import { askText, toast } from '../components/modal';
import { setHeader } from '../components/shell';
import { makeSortable } from '../components/sortable';
import { h, svg } from '../lib/dom';
import { allExercises } from '../lib/exercises';
import { shareOrDownload } from '../lib/files';
import { ICON } from '../lib/icons';
import { muscleLabel } from '../lib/muscles';
import { navigate, type RouteContext } from '../lib/router';
import { buildExport, exportFileName } from '../lib/split-io';
import {
  addDay, currentDay, describeDays, duplicateSplit, MAX_DAYS, moveDay, newDay,
} from '../lib/split-logic';
import {
  deleteSplit, getActiveSplitId, getSplit, resetBuiltin, saveSplit, setActiveSplit,
} from '../lib/split-store';
import type { Split } from '../lib/types';

export const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

export async function renderSplitDetail({ root, params, isCurrent }: RouteContext): Promise<void> {
  const id = params[0];
  let split = await getSplit(id);
  if (!split) {
    setHeader({ title: 'Split', back: '/splits' });
    root.append(h('div', { class: 'empty' }, h('h2', null, 'Split nicht gefunden'), h('a', { class: 'btn btn-primary', href: '#/splits' }, 'Zur Übersicht')));
    return;
  }
  let activeId = await getActiveSplitId();
  if (!isCurrent()) return;
  setHeader({ title: split.name, back: '/splits' });

  const persist = async (next: Split) => { split = next; await saveSplit(next); render(); };

  async function rename() {
    const name = await askText('Split umbenennen', split!.name);
    if (name) { await persist({ ...split!, name }); if (isCurrent()) setHeader({ title: name, back: '/splits' }); }
  }
  async function duplicate() {
    const name = await askText('Kopie benennen', `${split!.name} (Kopie)`, 'Duplizieren');
    if (!name) return;
    const copy = duplicateSplit(split!, name);
    await saveSplit(copy);
    toast('Kopie angelegt');
    navigate(`/splits/${encodeURIComponent(copy.id)}`);
  }
  async function exportIt() {
    const text = JSON.stringify(buildExport(split!, await allExercises()), null, 2);
    const r = await shareOrDownload(exportFileName(split!.name), text);
    if (r === 'downloaded') toast('Datei gespeichert');
  }
  async function reset() {
    if (!confirm('Auf den Originalzustand zurücksetzen? Alle Änderungen und Übungen in diesem Split gehen verloren.')) return;
    const fresh = await resetBuiltin(split!.id);
    if (fresh) { split = fresh; if (isCurrent()) setHeader({ title: fresh.name, back: '/splits' }); toast('Zurückgesetzt'); render(); }
  }
  async function remove() {
    if (!confirm(`„${split!.name}“ löschen? Bereits geloggte Trainings bleiben erhalten.`)) return;
    await deleteSplit(split!.id);
    navigate('/splits');
  }
  async function activate() {
    await setActiveSplit(split!.id);
    activeId = split!.id;
    toast('Aktiver Split gesetzt');
    render();
  }

  function dayRow(day: Split['days'][number], index: number): HTMLElement {
    const s = split!;
    const isNext = s.nextDayIndex === index;
    const focus = day.rest ? 'Ruhetag' : day.focus.length ? day.focus.map(muscleLabel).join(', ') : 'Kein Fokus gesetzt';
    const meta = [focus, !day.rest ? `${day.exercises.length} Übungen` : null, day.weekday !== null ? WEEKDAYS[day.weekday] : null].filter(Boolean).join(' · ');
    return h('li', { class: 'row', 'data-testid': 'day-row' },
      h('button', { class: 'grip', type: 'button', 'aria-label': `${day.name} verschieben (Pfeil hoch oder runter)`, 'data-testid': 'grip' }, svg(ICON.grip)),
      h('a', { class: 'row-main', href: `#/splits/${encodeURIComponent(s.id)}/day/${encodeURIComponent(day.id)}` },
        h('span', { class: 'list-item-text' },
          h('span', { class: 'list-item-title' }, day.name,
            isNext ? h('span', { class: 'chip chip-accent chip-inline' }, 'Als Nächstes') : null),
          h('span', { class: 'muted small' }, meta))),
      svg(ICON.chevron, 'icon muted'));
  }

  function render() {
    const s = split!;
    root.replaceChildren();
    const isActive = activeId === s.id;
    const next = currentDay(s);

    root.append(
      h('section', { class: 'card' },
        s.description ? h('p', { class: 'muted' }, s.description) : null,
        h('div', { class: 'chip-row' },
          h('span', { class: 'chip' }, describeDays(s)),
          s.builtin ? h('span', { class: 'chip' }, 'Vorlage') : null,
          s.rotating ? h('span', { class: 'chip' }, 'Rotierend, keine festen Wochentage') : null,
          isActive ? h('span', { class: 'chip chip-accent' }, 'Aktiv') : null),
        next ? h('p', null, 'Als Nächstes: ', h('strong', null, next.name)) : null,
        h('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: isActive, 'data-testid': 'set-active', onclick: () => void activate() },
          isActive ? 'Aktiver Split' : 'Als aktiven Split setzen')),
    );

    const list = h('ul', { class: 'sortable', 'data-testid': 'day-list' }, s.days.map((d, i) => dayRow(d, i)));
    makeSortable({
      list, handle: '.grip',
      onMove: (from, to) => { void persist(moveDay(split!, from, to)); },
    });
    root.append(
      h('section', null, h('h2', null, 'Tage'), list,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-ghost', type: 'button', disabled: s.days.length >= MAX_DAYS, 'data-testid': 'add-day',
            onclick: () => void persist(addDay(s, newDay(`Tag ${s.days.length + 1}`))) }, svg(ICON.plus), 'Tag hinzufügen'),
          h('button', { class: 'btn btn-ghost', type: 'button', disabled: s.days.length >= MAX_DAYS, 'data-testid': 'add-rest',
            onclick: () => void persist(addDay(s, newDay('Ruhetag', true))) }, svg(ICON.plus), 'Ruhetag hinzufügen'))),
      h('section', { class: 'card' }, h('h2', null, 'Verwalten'),
        h('div', { class: 'btn-stack' },
          h('button', { class: 'btn btn-ghost', type: 'button', 'data-testid': 'rename', onclick: () => void rename() }, 'Umbenennen'),
          h('button', { class: 'btn btn-ghost', type: 'button', 'data-testid': 'duplicate', onclick: () => void duplicate() }, 'Duplizieren'),
          h('button', { class: 'btn btn-ghost', type: 'button', 'data-testid': 'export', onclick: () => void exportIt() }, svg(ICON.download), 'Als JSON exportieren'),
          s.builtin
            ? h('button', { class: 'btn btn-ghost', type: 'button', 'data-testid': 'reset', onclick: () => void reset() }, 'Auf Original zurücksetzen')
            : h('button', { class: 'btn btn-danger', type: 'button', 'data-testid': 'delete', onclick: () => void remove() }, svg(ICON.trash), 'Split löschen'))),
    );
  }
  render();
}
