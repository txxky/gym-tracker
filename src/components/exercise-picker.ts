import { h, svg, clear } from '../lib/dom';
import { ICON } from '../lib/icons';
import {
  addCustomExercise, allExercises, deleteCustomExercise, filterExercises,
} from '../lib/exercises';
import { EQUIPMENT_DE, LEVEL_DE, MUSCLE_ORDER, equipmentLabel, muscleLabel } from '../lib/muscles';
import { shrinkPhoto } from '../lib/photo';
import type { Exercise } from '../lib/types';
import { exerciseGallery, exerciseThumb } from './exercise-media';
import { openSheet, toast } from './modal';

const PAGE = 40;

export interface PickerOptions {
  /** Gesetzt = Auswahlmodus: Tippen wählt die Übung. Sonst: Tippen zeigt Details. */
  onPick?: (ex: Exercise) => void;
  title?: string;
}

export function openExerciseDetail(ex: Exercise, onChanged?: () => void, onPick?: (ex: Exercise) => void): void {
  const sheet = openSheet(ex.name);
  const chips = [...ex.primaryMuscles.map((m) => h('span', { class: 'chip chip-accent' }, muscleLabel(m))),
    ...ex.secondaryMuscles.map((m) => h('span', { class: 'chip' }, muscleLabel(m)))];
  sheet.body.append(
    exerciseGallery(ex),
    h('div', { class: 'chip-row' }, chips),
    h('p', { class: 'muted' }, `${equipmentLabel(ex.equipment)}${ex.level ? ' · ' + (LEVEL_DE[ex.level] ?? ex.level) : ''}`),
  );
  if (ex.instructions.length) {
    sheet.body.append(
      h('h3', null, 'Ausführung'),
      h('p', { class: 'muted small' }, 'Anleitung auf Englisch (Quelle: free-exercise-db)'),
      h('ol', { class: 'instructions' }, ex.instructions.map((s) => h('li', null, s))),
    );
  }
  if (onPick) {
    sheet.body.append(h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => { sheet.close(); onPick(ex); } }, 'Übung auswählen'));
  }
  if (ex.custom) {
    sheet.body.append(
      h('button', {
        class: 'btn btn-danger btn-block', type: 'button',
        onclick: async () => {
          if (!confirm(`„${ex.name}“ löschen? Bereits geloggte Sätze bleiben erhalten.`)) return;
          await deleteCustomExercise(ex.id);
          sheet.close();
          onChanged?.();
        },
      }, svg(ICON.trash), 'Eigene Übung löschen'),
    );
  }
}

export function openCustomExerciseForm(onSaved: (ex: Exercise) => void): void {
  const sheet = openSheet('Eigene Übung');
  const name = h('input', { class: 'input', type: 'text', placeholder: 'Name der Übung', maxlength: '80', 'data-testid': 'custom-name' });
  const muscle = h('select', { class: 'input', 'data-testid': 'custom-muscle' }, [
    h('option', { value: '' }, 'Hauptmuskel wählen'),
    ...MUSCLE_ORDER.map((m) => h('option', { value: m }, muscleLabel(m))),
  ]);
  const equipment = h('select', { class: 'input' },
    Object.entries(EQUIPMENT_DE).map(([k, v]) => h('option', { value: k }, v)));
  const file = h('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: 'custom-photo' });
  const preview = h('div', { class: 'photo-preview' }, 'Kein Foto');
  let photo: Blob | undefined;
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      photo = await shrinkPhoto(f);
      const url = URL.createObjectURL(photo);
      const img = h('img', { src: url, alt: 'Vorschau', class: 'media-img' });
      img.addEventListener('load', () => URL.revokeObjectURL(url));
      preview.replaceChildren(img);
    } catch {
      toast('Foto konnte nicht gelesen werden');
    }
  });
  const save = h('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: true, 'data-testid': 'custom-save' }, 'Speichern');
  const validate = () => { save.toggleAttribute('disabled', !(name.value.trim() && muscle.value)); };
  name.addEventListener('input', validate);
  muscle.addEventListener('change', validate);
  save.addEventListener('click', async () => {
    const ex = await addCustomExercise({
      name: name.value, primaryMuscles: [muscle.value], equipment: equipment.value, photo,
    });
    sheet.close();
    toast('Übung gespeichert');
    onSaved(ex);
  });
  sheet.body.append(
    h('label', { class: 'field' }, h('span', null, 'Name'), name),
    h('label', { class: 'field' }, h('span', null, 'Hauptmuskel'), muscle),
    h('label', { class: 'field' }, h('span', null, 'Equipment'), equipment),
    h('div', { class: 'field' }, h('span', null, 'Foto (optional)'), preview,
      h('label', { class: 'btn btn-ghost', for: 'custom-photo' }, svg(ICON.camera), 'Foto wählen'), file),
    save,
  );
}

/** Suche mit Muskel- und Equipment-Filter. Öffnet als Sheet. */
export function openExercisePicker(opts: PickerOptions = {}): void {
  const sheet = openSheet(opts.title ?? 'Übungen', { tall: true });
  const q = h('input', { class: 'input', type: 'search', placeholder: 'Übung suchen (z. B. bench press)', 'aria-label': 'Suche', 'data-testid': 'search' });
  const equipment = h('select', { class: 'input', 'aria-label': 'Equipment-Filter', 'data-testid': 'filter-equipment' }, [
    h('option', { value: '' }, 'Alle Geräte'),
    ...Object.entries(EQUIPMENT_DE).map(([k, v]) => h('option', { value: k }, v)),
  ]);
  let muscle: string | null = null;
  const chipRow = h('div', { class: 'chip-scroll', role: 'group', 'aria-label': 'Muskel-Filter' });
  const count = h('p', { class: 'muted small', 'aria-live': 'polite' });
  const list = h('div', { class: 'list', 'data-testid': 'exercise-list' });
  const sentinel = h('div', { class: 'sentinel' });

  const chipBtns = [null, ...MUSCLE_ORDER].map((m) => {
    const b = h('button', { class: 'chip chip-btn', type: 'button', 'aria-pressed': String(m === null), 'data-muscle': m ?? '' }, m ? muscleLabel(m) : 'Alle');
    b.addEventListener('click', () => {
      muscle = m;
      chipBtns.forEach((c) => c.setAttribute('aria-pressed', String((c.dataset.muscle || null) === m)));
      refresh();
    });
    return b;
  });
  chipRow.append(...chipBtns);

  const addBtn = h('button', { class: 'btn btn-ghost btn-block', type: 'button', 'data-testid': 'add-custom' }, svg(ICON.plus), 'Eigene Übung hinzufügen');
  addBtn.addEventListener('click', () => openCustomExerciseForm((ex) => {
    if (opts.onPick) { sheet.close(); opts.onPick(ex); return; }
    // Filter zurücksetzen, damit die neue Übung sofort sichtbar ist.
    muscle = null;
    chipBtns.forEach((c) => c.setAttribute('aria-pressed', String(!c.dataset.muscle)));
    equipment.value = '';
    q.value = ex.name;
    void refresh();
  }));

  sheet.body.append(
    h('div', { class: 'sticky-filters' }, q, h('div', { class: 'filter-row' }, equipment), chipRow),
    count, list, sentinel, addBtn,
  );

  let results: Exercise[] = [];
  let shown = 0;

  function renderMore() {
    const next = results.slice(shown, shown + PAGE);
    shown += next.length;
    for (const ex of next) {
      const row = h('button', { class: 'list-item', type: 'button', 'data-testid': 'exercise-row' },
        exerciseThumb(ex),
        h('span', { class: 'list-item-text' },
          h('span', { class: 'list-item-title' }, ex.name, ex.custom ? h('span', { class: 'chip chip-accent chip-inline' }, 'Eigen') : null),
          h('span', { class: 'muted small' }, `${ex.primaryMuscles.map(muscleLabel).join(', ')} · ${equipmentLabel(ex.equipment)}`)),
        svg(ICON.chevron, 'icon muted'));
      row.addEventListener('click', () => {
        if (opts.onPick) { sheet.close(); opts.onPick(ex); }
        else openExerciseDetail(ex, refresh);
      });
      list.appendChild(row);
    }
  }

  async function refresh() {
    const all = await allExercises();
    results = filterExercises(all, { q: q.value, muscle, equipment: equipment.value || null });
    shown = 0;
    clear(list);
    count.textContent = `${results.length} Übungen`;
    if (!results.length) {
      list.appendChild(h('div', { class: 'empty' }, h('p', null, 'Nichts gefunden.'), h('p', { class: 'muted' }, 'Anderen Suchbegriff probieren oder eine eigene Übung anlegen.')));
      return;
    }
    renderMore();
  }

  new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting) && shown < results.length) renderMore();
  }, { root: sheet.body, rootMargin: '300px' }).observe(sentinel);

  let timer = 0;
  q.addEventListener('input', () => { window.clearTimeout(timer); timer = window.setTimeout(refresh, 120); });
  equipment.addEventListener('change', refresh);
  void refresh();
}
