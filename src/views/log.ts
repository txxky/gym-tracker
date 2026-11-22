import { exerciseGallery } from '../components/exercise-media';
import { openSheet, toast } from '../components/modal';
import { restBar } from '../components/rest-bar';
import { setHeader } from '../components/shell';
import { Wheel } from '../components/wheel';
import { db, getSetting } from '../lib/db';
import { h, svg } from '../lib/dom';
import { allExercises } from '../lib/exercises';
import { ICON } from '../lib/icons';
import {
  deleteSet, discardSession, finishSession, firstIncomplete, formatKg, formatSet, KG, lastTimeFor, lastTimeSets, logSet,
  nextIncomplete, REPS, RPE, setCounts, setsForSession, suggestStart, updateSet,
} from '../lib/log';
import { startRest, stopRest, unlockAudio } from '../lib/rest-timer';
import { navigate, type RouteContext } from '../lib/router';
import { getSplit } from '../lib/split-store';
import type { Exercise, SetLog } from '../lib/types';

export const USE_RPE_KEY = 'useRpe';
export const REST_AUTO_KEY = 'restAuto';
export const REST_SOUND_KEY = 'restSound';

export async function renderLog({ root, params, isCurrent }: RouteContext): Promise<void> {
  const sessionId = Number(params[0]);
  const session = await db.sessions.get(sessionId);
  if (!isCurrent()) return;
  setHeader({ title: session?.dayName ?? 'Training', back: '/training', large: false });
  if (!session || session.endedAt !== null) {
    root.append(h('div', { class: 'empty' }, h('h2', null, session ? 'Dieses Training ist schon beendet' : 'Training nicht gefunden'),
      h('a', { class: 'btn btn-primary', href: '#/training' }, 'Zum Training')));
    return;
  }

  const split = session.splitId ? await getSplit(session.splitId) : undefined;
  const plans = split?.days.find((d) => d.id === session.dayId)?.exercises ?? [];
  const [all, useRpe, restAuto, restSound] = await Promise.all([
    allExercises(), getSetting<boolean>(USE_RPE_KEY, false),
    getSetting<boolean>(REST_AUTO_KEY, true), getSetting<boolean>(REST_SOUND_KEY, false),
  ]);
  const byId = new Map<string, Exercise>(all.map((e) => [e.id, e]));
  let sets = await setsForSession(sessionId);
  if (!isCurrent()) return;
  let exIndex = firstIncomplete(plans, setCounts(plans, sets));
  let editing: SetLog | null = null;
  let saving = false;
  const lastCache = new Map<string, SetLog[]>();
  const lastOf = async (id: string) => {
    if (!lastCache.has(id)) lastCache.set(id, await lastTimeSets(id, sessionId));
    return lastCache.get(id)!;
  };

  async function finish() {
    const counts = setCounts(plans, sets);
    const missing = plans.reduce((n, p, i) => n + Math.max(0, p.sets - counts[i]), 0);
    if (!sets.length) {
      if (!confirm('Noch kein Satz geloggt. Training verwerfen?')) return;
      await discardSession(sessionId);
      stopRest();
      navigate('/training');
      return;
    }
    if (missing && !confirm(`Es fehlen noch ${missing} geplante Sätze. Trotzdem beenden?`)) return;
    await finishSession(sessionId);
    stopRest();
    toast('Training gespeichert');
    navigate('/training');
  }

  function openOverview() {
    const sheet = openSheet('Übungen im Training');
    const counts = setCounts(plans, sets);
    sheet.body.append(h('div', { class: 'list' }, plans.map((p, i) => {
      const ex = byId.get(p.exerciseId);
      const done = counts[i] >= p.sets;
      return h('button', { class: 'list-item', type: 'button', 'data-testid': 'overview-item',
        onclick: () => { sheet.close(); exIndex = i; editing = null; void render(); } },
        h('span', { class: 'list-item-text' },
          h('span', { class: 'list-item-title' }, ex?.name ?? 'Gelöschte Übung'),
          h('span', { class: 'muted small' }, `${counts[i]} von ${p.sets} Sätzen`)),
        done ? h('span', { class: 'chip chip-accent' }, 'Fertig') : null);
    })), h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => { sheet.close(); void finish(); } }, 'Training beenden'));
  }

  async function render() {
    root.replaceChildren();
    if (!plans.length) {
      root.append(h('div', { class: 'empty' }, h('h2', null, 'Keine Übungen an diesem Tag'),
        h('p', { class: 'muted' }, 'Der Tag existiert nicht mehr oder hat keine Übungen.'),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => void finish() }, 'Training beenden')));
      return;
    }
    const plan = plans[exIndex];
    const ex = byId.get(plan.exerciseId);
    const exName = ex?.name ?? 'Gelöschte Übung';
    const exSets = sets.filter((s) => s.exerciseId === plan.exerciseId).sort((a, b) => a.setIndex - b.setIndex);
    const done = exSets.length;
    const setNo = editing ? editing.setIndex : done + 1;
    const isExtra = !editing && done >= plan.sets;
    const last = await lastOf(plan.exerciseId);
    if (!isCurrent()) return;
    const ref = lastTimeFor(setNo, last);
    const start = editing ? { kg: editing.kg, reps: editing.reps } : suggestStart(setNo, last, exSets, plan);

    const kg = new Wheel({ label: 'Gewicht', min: KG.min, max: KG.max, step: KG.step, value: start.kg, unit: 'kg' });
    const reps = new Wheel({ label: 'Wiederholungen', min: REPS.min, max: REPS.max, step: 1, value: start.reps });
    const rpe = useRpe ? new Wheel({ label: 'RPE', min: RPE.min, max: RPE.max, step: RPE.step, value: editing?.rpe ?? RPE.fallback }) : null;

    const saveBtn = h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button', 'data-testid': 'save-set' },
      editing ? 'Satz ändern' : isExtra ? 'Zusatzsatz speichern' : 'Satz speichern');
    saveBtn.addEventListener('click', async () => {
      if (saving) return;
      saving = true;
      if (restSound) unlockAudio(); // Ton braucht eine Nutzer-Geste
      saveBtn.setAttribute('disabled', '');
      try {
        const values = { kg: kg.value, reps: reps.value, rpe: rpe ? rpe.value : null };
        const wasEdit = editing !== null;
        if (editing) {
          await updateSet(editing.id!, values);
          editing = null;
        } else {
          await logSet({ sessionId, exerciseId: plan.exerciseId, exerciseName: exName, ...values });
        }
        sets = await setsForSession(sessionId);
        navigator.vibrate?.(30);
        const counts = setCounts(plans, sets);
        const justCompleted = !wasEdit && counts[exIndex] === plan.sets;
        const nextEx = justCompleted ? nextIncomplete(plans, counts, exIndex) : -2;
        if (wasEdit) toast('Satz geändert');
        else if (justCompleted) {
          // Übung abgeschlossen -> automatisch zur nächsten offenen Übung
          if (nextEx >= 0) { exIndex = nextEx; toast(`${exName} abgeschlossen`); }
          else toast('Alle Sätze erledigt');
        } else toast('Satz gespeichert');
        // Pause nach jedem neuen Satz, außer nach dem allerletzten geplanten Satz des Trainings
        if (!wasEdit && restAuto) {
          if (justCompleted && nextEx === -1) stopRest();
          else startRest(plan.restSec, restSound);
        }
      } finally {
        saving = false;
      }
      await render();
    });

    const nav = h('div', { class: 'log-nav' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Vorherige Übung', disabled: plans.length < 2, 'data-testid': 'prev-ex',
        onclick: () => { exIndex = (exIndex - 1 + plans.length) % plans.length; editing = null; void render(); } }, svg(ICON.back)),
      h('button', { class: 'log-nav-label', type: 'button', 'data-testid': 'overview', onclick: openOverview }, `Übung ${exIndex + 1} von ${plans.length}`),
      h('button', { class: 'icon-btn icon-flip', type: 'button', 'aria-label': 'Nächste Übung', disabled: plans.length < 2, 'data-testid': 'next-ex',
        onclick: () => { exIndex = (exIndex + 1) % plans.length; editing = null; void render(); } }, svg(ICON.back)));

    const allDone = done >= plan.sets && !editing;
    root.append(
      h('div', { class: 'log' },
        restBar(),
        nav,
        ex ? h('div', { class: 'log-media' }, exerciseGallery(ex)) : null,
        h('h2', { class: 'log-title', 'data-testid': 'ex-name' }, exName),
        h('p', { class: 'log-setline' },
          h('strong', { 'data-testid': 'set-line' }, editing ? `Satz ${setNo} ändern` : isExtra ? `Zusatzsatz ${setNo}` : `Satz ${setNo} von ${plan.sets}`),
          h('span', { class: 'muted', 'data-testid': 'last-time' }, ref ? `Letztes Mal: ${formatSet(ref)}` : 'Noch keine Daten')),
        allDone ? h('p', { class: 'muted small', 'data-testid': 'ex-done' }, 'Alle geplanten Sätze sind erledigt. Du kannst einen Zusatzsatz machen oder zur nächsten Übung wechseln.') : null,
        h('div', { class: rpe ? 'wheels wheels-3' : 'wheels' }, kg.el, reps.el, rpe?.el ?? null),
        saveBtn,
        editing ? h('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: () => { editing = null; void render(); } }, 'Abbrechen') : null,
        exSets.length ? h('section', { class: 'log-sets' }, h('h3', null, 'Gespeicherte Sätze'),
          h('ul', { class: 'set-list', 'data-testid': 'set-list' }, exSets.map((s) =>
            h('li', { class: s.id === editing?.id ? 'set-row is-editing' : 'set-row', 'data-testid': 'set-row' },
              h('button', { class: 'set-main', type: 'button', 'aria-label': `Satz ${s.setIndex} bearbeiten`, onclick: () => { editing = s; void render(); } },
                h('span', { class: 'set-no' }, `Satz ${s.setIndex}`),
                h('span', { class: 'set-val' }, `${formatKg(s.kg)} kg x ${s.reps}`),
                s.rpe !== null ? h('span', { class: 'muted small' }, `RPE ${formatKg(s.rpe)}`) : null),
              h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Satz ${s.setIndex} löschen`, 'data-testid': 'delete-set',
                onclick: async () => {
                  await deleteSet(s.id!);
                  sets = await setsForSession(sessionId);
                  if (editing?.id === s.id) editing = null;
                  await render();
                } }, svg(ICON.trash))))))
          : null,
        h('button', { class: 'btn btn-ghost btn-block', type: 'button', 'data-testid': 'finish', onclick: () => void finish() }, 'Training beenden'),
      ),
    );
  }

  await render();
}
