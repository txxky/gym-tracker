import { exerciseThumb } from '../components/exercise-media';
import { openExercisePicker } from '../components/exercise-picker';
import { openPlanEditor } from '../components/plan-editor';
import { openSheet, toast } from '../components/modal';
import { setHeader } from '../components/shell';
import { makeSortable } from '../components/sortable';
import { getSetting } from '../lib/db';
import { h, svg } from '../lib/dom';
import { allExercises } from '../lib/exercises';
import { ICON } from '../lib/icons';
import { MUSCLE_ORDER, equipmentLabel, muscleLabel } from '../lib/muscles';
import { navigate, type RouteContext } from '../lib/router';
import { defaultPlan, formatPlan, moveItem, removeDay, updateDay } from '../lib/split-logic';
import { getSplit, saveSplit } from '../lib/split-store';
import type { Exercise, PlannedExercise, Split } from '../lib/types';
import { DEFAULT_REST_KEY, DEFAULT_REST_SEC } from './settings';
import { WEEKDAYS } from './split-detail';

function openFocusSheet(current: string[], onSave: (focus: string[]) => void): void {
  const sheet = openSheet('Muskel-Fokus');
  const selected = new Set(current);
  const chips = MUSCLE_ORDER.map((m) => {
    const b = h('button', { class: 'chip chip-btn', type: 'button', 'aria-pressed': String(selected.has(m)), 'data-muscle': m }, muscleLabel(m));
    b.addEventListener('click', () => {
      if (selected.has(m)) selected.delete(m); else selected.add(m);
      b.setAttribute('aria-pressed', String(selected.has(m)));
    });
    return b;
  });
  sheet.body.append(
    h('p', { class: 'muted' }, 'Welche Muskeln stehen an diesem Tag im Fokus?'),
    h('div', { class: 'chip-row chip-row-wide' }, chips),
    h('button', { class: 'btn btn-primary btn-block', type: 'button', 'data-testid': 'focus-save',
      onclick: () => { sheet.close(); onSave(MUSCLE_ORDER.filter((m) => selected.has(m))); } }, 'Übernehmen'));
}

export async function renderDayBuilder({ root, params, isCurrent }: RouteContext): Promise<void> {
  const [splitId, dayId] = params;
  let split = await getSplit(splitId);
  if (!isCurrent()) return;
  const back = `/splits/${encodeURIComponent(splitId)}`;
  if (!split || !split.days.some((d) => d.id === dayId)) {
    setHeader({ title: 'Tag', back: '/splits' });
    root.append(h('div', { class: 'empty' }, h('h2', null, 'Tag nicht gefunden'), h('a', { class: 'btn btn-primary', href: '#/splits' }, 'Zur Übersicht')));
    return;
  }
  const [all, defaultRest] = await Promise.all([allExercises(), getSetting<number>(DEFAULT_REST_KEY, DEFAULT_REST_SEC)]);
  if (!isCurrent()) return;
  const byId = new Map(all.map((e) => [e.id, e]));
  const day = () => split!.days.find((d) => d.id === dayId)!;
  setHeader({ title: day().name, back });

  const save = async (next: Split, rerender = true) => { split = next; await saveSplit(next); if (rerender) render(); };
  const patchDay = (patch: Partial<ReturnType<typeof day>>, rerender = true) => save(updateDay(split!, dayId, patch), rerender);
  const setPlans = (plans: PlannedExercise[], rerender = true) => patchDay({ exercises: plans }, rerender);

  function exerciseRow(p: PlannedExercise, index: number): HTMLElement {
    const ex: Exercise | undefined = byId.get(p.exerciseId);
    // Immer den aktuellen Plan nehmen: die Zeile wird bei Rad-Änderungen nicht neu gerendert.
    const open = () => openPlanEditor(ex, day().exercises[index] ?? p,
      (np) => { void setPlans(day().exercises.map((x, i) => (i === index ? np : x)), false).then(() => refreshRow(index)); },
      () => { void setPlans(day().exercises.filter((_, i) => i !== index)); });
    return h('li', { class: 'row', 'data-testid': 'exercise-plan-row' },
      h('button', { class: 'grip', type: 'button', 'aria-label': `${ex?.name ?? 'Übung'} verschieben (Pfeil hoch oder runter)`, 'data-testid': 'grip' }, svg(ICON.grip)),
      h('button', { class: 'row-main row-btn', type: 'button', onclick: open },
        ex ? exerciseThumb(ex) : h('div', { class: 'media thumb' }),
        h('span', { class: 'list-item-text' },
          h('span', { class: 'list-item-title' }, ex?.name ?? 'Gelöschte Übung'),
          h('span', { class: 'muted small' }, ex ? `${ex.primaryMuscles.map(muscleLabel).join(', ')} · ${equipmentLabel(ex.equipment)}` : 'Nicht mehr vorhanden')),
        h('span', { class: 'plan-badge', 'data-testid': 'plan' }, formatPlan(p))));
  }

  function refreshRow(index: number) {
    const li = root.querySelectorAll<HTMLElement>('[data-testid="exercise-plan-row"]')[index];
    const badge = li?.querySelector('.plan-badge');
    if (badge) badge.textContent = formatPlan(day().exercises[index]);
  }

  function render() {
    const d = day();
    root.replaceChildren();
    if (isCurrent()) setHeader({ title: d.name, back });

    const nameInput = h('input', { class: 'input', type: 'text', maxlength: '60', 'aria-label': 'Name des Tages', 'data-testid': 'day-name' });
    nameInput.value = d.name;
    nameInput.addEventListener('change', () => {
      const v = nameInput.value.trim();
      if (v) void patchDay({ name: v }); else nameInput.value = day().name;
    });
    const weekday = h('select', { class: 'input', 'aria-label': 'Wochentag', 'data-testid': 'day-weekday' }, [
      h('option', { value: '' }, 'Kein fester Wochentag'),
      ...WEEKDAYS.map((w, i) => h('option', { value: String(i) }, w)),
    ]);
    weekday.value = d.weekday === null ? '' : String(d.weekday);
    weekday.addEventListener('change', () => { void patchDay({ weekday: weekday.value === '' ? null : Number(weekday.value) }, false); });
    const restToggle = h('input', { type: 'checkbox', class: 'check', id: 'rest-toggle', 'data-testid': 'day-rest' });
    restToggle.checked = d.rest;
    restToggle.addEventListener('change', () => { void patchDay({ rest: restToggle.checked }); });

    const settingsCard = h('section', { class: 'card' },
      h('h2', null, 'Tag-Einstellungen'),
      h('label', { class: 'field' }, h('span', null, 'Name'), nameInput),
      h('label', { class: 'check-row', for: 'rest-toggle' }, restToggle, h('span', null, 'Ruhetag (kein Training)')),
      !d.rest ? h('div', { class: 'field' }, h('span', null, 'Muskel-Fokus'),
        h('div', { class: 'chip-row' }, d.focus.length ? d.focus.map((m) => h('span', { class: 'chip chip-accent' }, muscleLabel(m))) : h('span', { class: 'muted' }, 'Noch keiner gewählt')),
        h('button', { class: 'btn btn-ghost', type: 'button', 'data-testid': 'edit-focus',
          onclick: () => openFocusSheet(day().focus, (focus) => { void patchDay({ focus }); }) }, 'Fokus ändern')) : null,
      h('label', { class: 'field' }, h('span', null, 'Wochentag (optional)'), weekday),
      h('div', { class: 'btn-stack' },
        h('button', { class: 'btn btn-ghost', type: 'button', 'data-testid': 'set-next',
          onclick: () => { void save({ ...split!, nextDayIndex: split!.days.findIndex((x) => x.id === dayId) }, false).then(() => toast('Als nächster Tag gesetzt')); } }, 'Als nächsten Tag setzen'),
        h('button', { class: 'btn btn-danger', type: 'button', disabled: split!.days.length <= 1, 'data-testid': 'delete-day',
          onclick: () => {
            if (!confirm(`Tag „${day().name}“ löschen?`)) return;
            const idx = split!.days.findIndex((x) => x.id === dayId);
            void save(removeDay(split!, idx), false).then(() => navigate(back));
          } }, svg(ICON.trash), 'Tag löschen')));

    if (d.rest) {
      root.append(h('p', { class: 'muted' }, 'Ruhetage haben keine Übungen. Im Zyklus kommt danach der nächste Tag.'), settingsCard);
      return;
    }

    const list = h('ul', { class: 'sortable', 'data-testid': 'exercise-list-plan' }, d.exercises.map((p, i) => exerciseRow(p, i)));
    makeSortable({ list, handle: '.grip', onMove: (from, to) => { void setPlans(moveItem(day().exercises, from, to)); } });
    root.append(h('section', null, h('h2', null, 'Übungen'),
      d.exercises.length ? list : h('div', { class: 'empty' }, h('p', { class: 'muted' }, 'Noch keine Übungen an diesem Tag.')),
      h('button', { class: 'btn btn-primary btn-block', type: 'button', 'data-testid': 'add-exercise',
        onclick: () => openExercisePicker({
          title: 'Übung hinzufügen',
          onPick: (ex) => {
            if (!byId.has(ex.id)) byId.set(ex.id, ex);
            void setPlans([...day().exercises, defaultPlan(ex.id, defaultRest)]);
          },
        }) }, svg(ICON.plus), 'Übung hinzufügen')), settingsCard);
  }
  render();
}
