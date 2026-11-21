import { openSheet, toast } from '../components/modal';
import { setHeader } from '../components/shell';
import { h, svg } from '../lib/dom';
import { allExercises } from '../lib/exercises';
import { ICON } from '../lib/icons';
import { discardSession, getOpenSession, skipToNextDay, startSession } from '../lib/log';
import { muscleLabel } from '../lib/muscles';
import { navigate, type RouteContext } from '../lib/router';
import { currentDay, formatPlan } from '../lib/split-logic';
import { getActiveSplit } from '../lib/split-store';
import type { Split, SplitDay } from '../lib/types';
import { WEEKDAYS } from './split-detail';

async function start(split: Split, day: SplitDay): Promise<void> {
  const id = await startSession(split, day.id);
  navigate(`/log/${id}`);
}

function openDayChooser(split: Split): void {
  const sheet = openSheet('Anderen Tag wählen');
  sheet.body.append(
    h('p', { class: 'muted' }, 'Danach geht der Zyklus mit dem Tag weiter, der auf deine Wahl folgt.'),
    h('div', { class: 'list' }, split.days.filter((d) => !d.rest && d.exercises.length).map((d) =>
      h('button', { class: 'list-item', type: 'button', 'data-testid': 'choose-day', onclick: () => { sheet.close(); void start(split, d); } },
        h('span', { class: 'list-item-text' },
          h('span', { class: 'list-item-title' }, d.name),
          h('span', { class: 'muted small' }, `${d.exercises.length} Übungen`)),
        svg(ICON.chevron, 'icon muted')))));
}

export async function renderTraining({ root, isCurrent }: RouteContext): Promise<void> {
  setHeader({ title: 'Training' });
  const [split, open, exercises] = await Promise.all([getActiveSplit(), getOpenSession(), allExercises()]);
  if (!isCurrent()) return;
  const names = new Map(exercises.map((e) => [e.id, e.name]));

  if (open) {
    root.append(h('section', { class: 'card card-accent', 'data-testid': 'open-session' },
      h('h2', null, 'Training läuft'),
      h('p', null, h('strong', null, open.dayName), ` seit ${new Date(open.startedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`),
      h('a', { class: 'btn btn-primary btn-block', href: `#/log/${open.id}`, 'data-testid': 'resume' }, 'Fortsetzen'),
      h('button', { class: 'btn btn-ghost btn-block', type: 'button', 'data-testid': 'discard',
        onclick: async () => {
          if (!confirm('Dieses Training mit allen Sätzen verwerfen?')) return;
          await discardSession(open.id!);
          toast('Training verworfen');
          void renderAgain();
        } }, 'Verwerfen')));
    return;
  }

  if (!split) {
    root.append(h('div', { class: 'empty' }, svg(ICON.training, 'icon icon-xl muted'),
      h('h2', null, 'Noch kein aktiver Split'),
      h('p', { class: 'muted' }, 'Such dir im Splits-Tab einen Split aus, dann steht hier dein nächster Trainingstag.'),
      h('a', { class: 'btn btn-primary', href: '#/splits' }, 'Zu den Splits')));
    return;
  }

  const day = currentDay(split);
  if (!day) return;
  const trainable = split.days.some((d) => !d.rest && d.exercises.length);

  if (day.rest) {
    root.append(h('section', { class: 'card', 'data-testid': 'next-day' },
      h('p', { class: 'muted small' }, split.name),
      h('h2', { 'data-testid': 'next-title' }, `Als Nächstes: ${day.name}`),
      h('p', { class: 'muted' }, 'Heute ist Erholung dran. Hak den Ruhetag ab, dann geht es im Zyklus weiter.'),
      h('button', { class: 'btn btn-primary btn-block', type: 'button', 'data-testid': 'skip-rest',
        onclick: async () => { await skipToNextDay(split.id); void renderAgain(); } }, 'Ruhetag abhaken')));
  } else {
    root.append(h('section', { class: 'card', 'data-testid': 'next-day' },
      h('p', { class: 'muted small' }, split.name + (day.weekday !== null ? ` · ${WEEKDAYS[day.weekday]}` : '')),
      h('h2', { 'data-testid': 'next-title' }, `Als Nächstes: ${day.name}`),
      day.focus.length ? h('div', { class: 'chip-row' }, day.focus.map((m) => h('span', { class: 'chip chip-accent' }, muscleLabel(m)))) : null,
      day.exercises.length
        ? h('ol', { class: 'preview' }, day.exercises.map((p) => h('li', null, h('span', null, names.get(p.exerciseId) ?? 'Gelöschte Übung'), h('span', { class: 'muted' }, formatPlan(p)))))
        : h('p', { class: 'muted' }, 'An diesem Tag sind noch keine Übungen eingetragen.'),
      day.exercises.length
        ? h('button', { class: 'btn btn-primary btn-block', type: 'button', 'data-testid': 'start',
          onclick: () => void start(split, day) }, svg(ICON.training), 'Training starten')
        : h('a', { class: 'btn btn-primary btn-block', href: `#/splits/${encodeURIComponent(split.id)}/day/${encodeURIComponent(day.id)}` }, 'Übungen eintragen')));
  }

  if (trainable) {
    root.append(h('button', { class: 'btn btn-ghost btn-block', type: 'button', 'data-testid': 'other-day', onclick: () => openDayChooser(split) }, 'Anderen Tag wählen'));
  }

  async function renderAgain() {
    root.replaceChildren();
    await renderTraining({ root, params: [], isCurrent });
  }
}
