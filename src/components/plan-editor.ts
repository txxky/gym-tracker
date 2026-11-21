import { h, svg } from '../lib/dom';
import { ICON } from '../lib/icons';
import { formatPlan, normalizePlan, SET_LIMITS } from '../lib/split-logic';
import type { Exercise, PlannedExercise } from '../lib/types';
import { exerciseThumb } from './exercise-media';
import { openSheet } from './modal';
import { Wheel, formatSeconds } from './wheel';

/**
 * Sätze, Rep-Range und Pause einer Übung bearbeiten, alles über Wheels.
 * onChange wird bei jeder Änderung mit dem normalisierten Plan aufgerufen, onRemove beim Entfernen.
 */
export function openPlanEditor(
  ex: Exercise | undefined,
  plan: PlannedExercise,
  onChange: (p: PlannedExercise) => void,
  onRemove: () => void,
): void {
  const sheet = openSheet('Sätze und Wiederholungen');
  let cur = { ...plan };
  const summary = h('p', { class: 'plan-summary', 'aria-live': 'polite', 'data-testid': 'plan-summary' }, formatPlan(cur));
  const update = (patch: Partial<PlannedExercise>) => {
    cur = normalizePlan({ ...cur, ...patch });
    summary.textContent = formatPlan(cur);
    onChange(cur);
  };

  const sets = new Wheel({ label: 'Sätze', min: SET_LIMITS.sets[0], max: SET_LIMITS.sets[1], step: 1, value: cur.sets, onChange: (v) => update({ sets: v }) });
  const repMin: Wheel = new Wheel({
    label: 'Wdh. von', min: SET_LIMITS.reps[0], max: SET_LIMITS.reps[1], step: 1, value: cur.repMin,
    onChange: (v) => {
      update({ repMin: v });
      if (cur.repMax !== repMax.value) repMax.setValue(cur.repMax);
    },
  });
  const repMax: Wheel = new Wheel({
    label: 'Wdh. bis', min: SET_LIMITS.reps[0], max: SET_LIMITS.reps[1], step: 1, value: cur.repMax,
    onChange: (v) => {
      // "bis" unter "von" ergibt keinen Sinn: dann zieht "von" nach unten mit.
      if (v < cur.repMin) { update({ repMin: v, repMax: v }); repMin.setValue(v); } else update({ repMax: v });
    },
  });
  const rest = new Wheel({
    label: 'Pause', min: SET_LIMITS.rest[0], max: SET_LIMITS.rest[1], step: 15, value: cur.restSec, format: formatSeconds, unit: 'min',
    onChange: (v) => update({ restSec: v }),
  });

  sheet.body.append(
    h('div', { class: 'plan-head' }, ex ? exerciseThumb(ex) : null, h('strong', null, ex?.name ?? 'Gelöschte Übung')),
    summary,
    h('div', { class: 'wheel-grid' }, sets.el, rest.el, repMin.el, repMax.el),
    h('button', { class: 'btn btn-primary btn-block', type: 'button', 'data-testid': 'plan-done', onclick: () => sheet.close() }, 'Fertig'),
    h('button', { class: 'btn btn-danger btn-block', type: 'button', onclick: () => { sheet.close(); onRemove(); } }, svg(ICON.trash), 'Übung entfernen'),
  );
}
