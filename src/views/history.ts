import { openSheet, toast } from '../components/modal';
import { setHeader } from '../components/shell';
import { Wheel } from '../components/wheel';
import { db, getSetting } from '../lib/db';
import { h, svg } from '../lib/dom';
import { ICON } from '../lib/icons';
import { deleteSet, discardSession, formatKg, KG, REPS, RPE, updateSet } from '../lib/log';
import type { RouteContext } from '../lib/router';
import type { Session, SetLog } from '../lib/types';
import { formatDayLong, formatNumber } from '../components/chart';

const PAGE = 15;

function openSetEditor(s: SetLog, useRpe: boolean, onChanged: () => void): void {
  const sheet = openSheet(`${s.exerciseName}, Satz ${s.setIndex}`);
  const kg = new Wheel({ label: 'Gewicht', min: KG.min, max: KG.max, step: KG.step, value: s.kg, unit: 'kg' });
  const reps = new Wheel({ label: 'Wiederholungen', min: REPS.min, max: REPS.max, step: 1, value: s.reps });
  const rpe = useRpe || s.rpe !== null ? new Wheel({ label: 'RPE', min: RPE.min, max: RPE.max, step: RPE.step, value: s.rpe ?? RPE.fallback }) : null;
  sheet.body.append(
    h('div', { class: rpe ? 'wheels wheels-3' : 'wheels' }, kg.el, reps.el, rpe?.el ?? null),
    h('button', { class: 'btn btn-primary btn-block', type: 'button', 'data-testid': 'edit-save',
      onclick: async () => {
        await updateSet(s.id!, { kg: kg.value, reps: reps.value, rpe: rpe ? rpe.value : null });
        sheet.close(); toast('Satz geändert'); onChanged();
      } }, 'Speichern'),
    h('button', { class: 'btn btn-danger btn-block', type: 'button', 'data-testid': 'edit-delete',
      onclick: async () => {
        if (!confirm('Diesen Satz löschen?')) return;
        await deleteSet(s.id!);
        sheet.close(); toast('Satz gelöscht'); onChanged();
      } }, svg(ICON.trash), 'Satz löschen'));
}

/** Listenansicht aller geloggten Sätze, nach Training gruppiert, mit Korrektur-Möglichkeit. */
export async function renderHistory({ root, isCurrent }: RouteContext): Promise<void> {
  setHeader({ title: 'Verlauf', back: '/progress' });
  const useRpe = await getSetting<boolean>('useRpe', false);
  let shown = PAGE;
  let exerciseFilter = '';

  const filterEl = h('select', { class: 'input', 'aria-label': 'Übung filtern', 'data-testid': 'history-filter' });
  const listEl = h('div', { class: 'list history', 'data-testid': 'history-list' });
  const moreBtn = h('button', { class: 'btn btn-ghost btn-block', type: 'button', 'data-testid': 'history-more' }, 'Ältere laden');
  moreBtn.addEventListener('click', () => { shown += PAGE; void draw(); });
  filterEl.addEventListener('change', () => { exerciseFilter = filterEl.value; shown = PAGE; void draw(); });
  root.append(h('label', { class: 'field' }, h('span', null, 'Übung'), filterEl), listEl, moreBtn);

  async function draw() {
    const [sessions, sets] = await Promise.all([db.sessions.toArray(), db.sets.toArray()]);
    if (!isCurrent()) return;
    const names = new Map<string, string>();
    sets.forEach((s) => names.set(s.exerciseId, s.exerciseName));
    const current = filterEl.value;
    filterEl.replaceChildren(h('option', { value: '' }, 'Alle Übungen'),
      ...[...names].sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => h('option', { value: id }, n)));
    filterEl.value = names.has(current) ? current : '';
    exerciseFilter = filterEl.value;

    const bySession = new Map<number, SetLog[]>();
    for (const s of sets) {
      if (exerciseFilter && s.exerciseId !== exerciseFilter) continue;
      bySession.set(s.sessionId, [...(bySession.get(s.sessionId) ?? []), s]);
    }
    const rows: Array<[Session, SetLog[]]> = sessions
      .filter((s) => bySession.has(s.id!))
      .sort((a, b) => b.startedAt - a.startedAt)
      .map((s) => [s, bySession.get(s.id!)!.sort((a, b) => a.ts - b.ts || a.setIndex - b.setIndex)]);

    listEl.replaceChildren();
    if (!rows.length) {
      listEl.append(h('div', { class: 'empty', 'data-testid': 'history-empty' }, svg(ICON.splits, 'icon icon-xl muted'),
        h('h2', null, 'Noch keine Sätze'), h('p', { class: 'muted' }, 'Geloggte Sätze erscheinen hier, das neueste Training zuerst.')));
      moreBtn.hidden = true;
      return;
    }
    for (const [session, list] of rows.slice(0, shown)) {
      const byEx = new Map<string, SetLog[]>();
      list.forEach((s) => byEx.set(s.exerciseId, [...(byEx.get(s.exerciseId) ?? []), s]));
      const volume = Math.round(list.reduce((n, s) => n + s.kg * s.reps, 0));
      listEl.append(h('section', { class: 'card history-session', 'data-testid': 'history-session' },
        h('div', { class: 'history-head' },
          h('div', null, h('strong', null, session.dayName), h('div', { class: 'muted small' }, `${formatDayLong(session.startedAt)} · ${list.length} Sätze · ${formatNumber(volume)} kg`)),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Training ${session.dayName} löschen`, 'data-testid': 'delete-session',
            onclick: async () => {
              if (!confirm(`Training „${session.dayName}“ vom ${formatDayLong(session.startedAt)} mit allen Sätzen löschen?`)) return;
              await discardSession(session.id!); toast('Training gelöscht'); void draw();
            } }, svg(ICON.trash))),
        [...byEx].map(([, exSets]) => h('div', { class: 'history-ex' },
          h('div', { class: 'history-ex-name' }, exSets[0].exerciseName),
          h('ul', { class: 'set-list' }, exSets.map((s) => h('li', { class: 'set-row' },
            h('button', { class: 'set-main', type: 'button', 'data-testid': 'history-set', 'aria-label': `Satz ${s.setIndex} bearbeiten`,
              onclick: () => openSetEditor(s, useRpe, () => void draw()) },
            h('span', { class: 'set-no' }, `Satz ${s.setIndex}`),
            h('span', { class: 'set-val' }, `${formatKg(s.kg)} kg x ${s.reps}`),
            s.rpe !== null ? h('span', { class: 'muted small' }, `RPE ${formatKg(s.rpe)}`) : null))))))));
    }
    moreBtn.hidden = rows.length <= shown;
  }
  await draw();
}
