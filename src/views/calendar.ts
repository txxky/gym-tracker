import { formatDayLong, formatNumber } from '../components/chart';
import { setHeader } from '../components/shell';
import { segmented } from '../components/ui';
import {
  addDaysKey, addMonthsKey, addYearsKey, dayKey, indexDays, monthCounts, monthGrid, parseKey, type DayInfo,
} from '../lib/calendar';
import { db } from '../lib/db';
import { h, svg } from '../lib/dom';
import { ICON } from '../lib/icons';
import { formatKg, isCheckin } from '../lib/log';
import type { RouteContext } from '../lib/router';
import type { Session, SetLog } from '../lib/types';

type Mode = 'day' | 'month' | 'year';
const MODES: Array<[Mode, string]> = [['day', 'Tag'], ['month', 'Monat'], ['year', 'Jahr']];
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const STORE = 'gt-calendar-mode';

const monthName = (d: Date, withYear = true) => d.toLocaleDateString('de-DE', withYear ? { month: 'long', year: 'numeric' } : { month: 'long' });
const longDate = (key: string) => parseKey(key).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeOf = (ms: number) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

function loadMode(): Mode {
  try { const v = localStorage.getItem(STORE); if (v === 'day' || v === 'month' || v === 'year') return v; } catch { /* ignorieren */ }
  return 'month';
}

/** Beschriftung einer Zelle für Screenreader: Datum + Art des Tages. */
function cellLabel(key: string, info: DayInfo | undefined, today: string): string {
  const parts = [parseKey(key).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })];
  if (key === today) parts.push('heute');
  if (info?.full) parts.push(`Training: ${info.sessions.filter((s) => !isCheckin(s)).map((s) => s.dayName).join(', ')}`);
  if (info?.checkin) parts.push('im Gym gewesen');
  return parts.join(', ');
}

export async function renderCalendar({ root, isCurrent }: RouteContext): Promise<void> {
  setHeader({ title: 'Kalender', back: '/training', historyBack: true });
  const [sessions, withSetsRaw] = await Promise.all([db.sessions.toArray(), db.sets.orderBy('sessionId').uniqueKeys()]);
  if (!isCurrent()) return;
  const days = indexDays(sessions, new Set(withSetsRaw.map(Number)));
  const today = () => dayKey(Date.now());

  let mode = loadMode();
  let cursor = today();
  let dir: 'next' | 'prev' | 'none' = 'none';

  const seg = segmented<Mode>({ options: MODES, value: mode, label: 'Ansicht', testId: 'cal-mode', onChange: (m) => {
    mode = m;
    try { localStorage.setItem(STORE, m); } catch { /* ignorieren */ }
    dir = 'none';
    draw();
  } });
  const bar = h('div', { class: 'cal-bar' }, seg.el);
  const title = h('h2', { class: 'cal-title', 'data-testid': 'cal-title', 'aria-live': 'polite' });
  const prevBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Zurück', 'data-testid': 'cal-prev' }, svg(ICON.back));
  const nextBtn = h('button', { class: 'icon-btn icon-flip', type: 'button', 'aria-label': 'Weiter', 'data-testid': 'cal-next' }, svg(ICON.back));
  const todayBtn = h('button', { class: 'btn btn-ghost btn-sm cal-today', type: 'button', 'data-testid': 'cal-today' }, 'Heute');
  const nav = h('div', { class: 'cal-nav' }, prevBtn, title, nextBtn, todayBtn);
  const stage = h('div', { class: 'cal-stage' });
  const detail = h('section', { class: 'card cal-detail', 'data-testid': 'cal-detail', 'aria-live': 'polite' });
  const legend = h('p', { class: 'cal-legend muted small' },
    h('span', { class: 'cal-key cal-key-full' }), 'Training',
    h('span', { class: 'cal-key cal-key-checkin' }), 'Im Gym',
    h('span', { class: 'cal-key cal-key-today' }), 'Heute');
  root.append(bar, nav, stage, legend, detail);

  function step(n: number) {
    dir = n > 0 ? 'next' : 'prev';
    if (mode === 'day') cursor = addDaysKey(cursor, n);
    else if (mode === 'month') cursor = addMonthsKey(cursor, n);
    else cursor = addYearsKey(cursor, n);
    // Beim Springen in den aktuellen Monat/Jahr wieder auf heute stehen
    const t = today(); const c = parseKey(cursor); const tt = parseKey(t);
    if ((mode === 'month' && c.getFullYear() === tt.getFullYear() && c.getMonth() === tt.getMonth())
      || (mode === 'year' && c.getFullYear() === tt.getFullYear())) cursor = t;
    draw();
  }
  prevBtn.addEventListener('click', () => step(-1));
  nextBtn.addEventListener('click', () => step(1));
  todayBtn.addEventListener('click', () => {
    const was = cursor;
    cursor = today();
    dir = cursor === was ? 'none' : cursor > was ? 'next' : 'prev';
    draw();
  });

  // Wischen links/rechts blättert (nur deutlich waagerechte Gesten)
  let sx = 0; let sy = 0;
  stage.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx; const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  function dayCell(key: string, num: number, inMonth: boolean): HTMLElement {
    const info = days.get(key);
    const cls = ['cal-day'];
    if (!inMonth) cls.push('is-out');
    if (info?.full) cls.push('is-full');
    else if (info?.checkin) cls.push('is-checkin');
    if (key === today()) cls.push('is-today');
    if (key === cursor) cls.push('is-selected');
    return h('button', { class: cls.join(' '), type: 'button', 'data-key': key, 'data-testid': 'cal-day', 'aria-label': cellLabel(key, info, today()),
      'aria-pressed': String(key === cursor),
      onclick: () => {
        const d = parseKey(key); const c = parseKey(cursor);
        dir = key > cursor && !inMonth ? 'next' : key < cursor && !inMonth ? 'prev' : 'none';
        cursor = key;
        if (!inMonth && (d.getMonth() !== c.getMonth() || d.getFullYear() !== c.getFullYear())) draw(); else { paintSelection(); drawDetail(); }
      } }, h('span', { class: 'cal-num' }, String(num)));
  }

  function paintSelection() {
    stage.querySelectorAll<HTMLElement>('.cal-day').forEach((b) => {
      const on = b.dataset.key === cursor;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function monthView(): HTMLElement {
    const c = parseKey(cursor);
    const rows = monthGrid(c.getFullYear(), c.getMonth());
    return h('div', { class: 'cal-month', 'data-testid': 'cal-month' },
      h('div', { class: 'cal-weekdays', 'aria-hidden': 'true' }, WEEKDAYS.map((w) => h('span', null, w))),
      h('div', { class: 'cal-grid' }, rows.flat().map((cell) => dayCell(cell.key, cell.day, cell.inMonth))));
  }

  function yearView(): HTMLElement {
    const year = parseKey(cursor).getFullYear();
    const counts = monthCounts(days, year);
    const t = today();
    return h('div', { class: 'cal-year', 'data-testid': 'cal-year' }, counts.map((n, m) => {
      const first = new Date(year, m, 1);
      const rows = monthGrid(year, m);
      return h('button', { class: 'month-tile card', type: 'button', 'data-testid': 'cal-month-tile', 'data-month': String(m),
        'aria-label': `${monthName(first)}: ${n} Trainingstage`,
        onclick: () => {
          cursor = year === parseKey(t).getFullYear() && m === parseKey(t).getMonth() ? t : `${year}-${String(m + 1).padStart(2, '0')}-01`;
          mode = 'month'; seg.setValue('month'); dir = 'none'; draw();
        } },
      h('span', { class: 'month-tile-head' }, h('span', { class: 'month-tile-name' }, monthName(first, false)), h('span', { class: n ? 'month-tile-count' : 'month-tile-count muted' }, String(n))),
      h('span', { class: 'mini-grid', 'aria-hidden': 'true' }, rows.flat().map((cell) => {
        const info = days.get(cell.key);
        const cls = ['mini-dot'];
        if (!cell.inMonth) cls.push('is-out');
        else if (info?.full) cls.push('is-full');
        else if (info?.checkin) cls.push('is-checkin');
        if (cell.key === t) cls.push('is-today');
        return h('span', { class: cls.join(' ') });
      })));
    }));
  }

  function dayView(): HTMLElement {
    return h('div', { class: 'cal-dayview', 'data-testid': 'cal-dayview' },
      h('p', { class: 'cal-bigdate' }, h('span', { class: 'cal-bigdate-num' }, String(parseKey(cursor).getDate())),
        h('span', { class: 'muted' }, parseKey(cursor).toLocaleDateString('de-DE', { weekday: 'long', month: 'long', year: 'numeric' }))));
  }

  async function drawDetail() {
    const key = cursor;
    const info = days.get(key);
    const list = info?.sessions ?? [];
    const full = list.filter((s) => !isCheckin(s));
    const sets: SetLog[] = full.length ? await db.sets.where('sessionId').anyOf(full.map((s) => s.id!)).toArray() : [];
    if (!detail.isConnected || key !== cursor) return;
    detail.replaceChildren(h('h2', { class: 'cal-detail-title', 'data-testid': 'cal-detail-title' }, longDate(key), key === today() ? h('span', { class: 'chip chip-accent chip-inline' }, 'Heute') : null));
    if (!list.length) {
      detail.append(h('p', { class: 'muted', 'data-testid': 'cal-empty' }, key > today() ? 'Noch nichts geplant. Hier erscheint dein Training, sobald du im Gym warst.' : 'An diesem Tag warst du nicht im Gym.'));
      return;
    }
    for (const s of list) detail.append(sessionBlock(s, sets.filter((x) => x.sessionId === s.id)));
  }

  function sessionBlock(s: Session, sets: SetLog[]): HTMLElement {
    if (isCheckin(s)) {
      return h('div', { class: 'cal-session', 'data-testid': 'cal-checkin' },
        h('div', { class: 'cal-session-head' }, h('strong', null, 'Im Gym gewesen'), h('span', { class: 'muted small' }, timeOf(s.startedAt) + ' Uhr')),
        h('p', { class: 'muted small' }, s.dayName !== 'Im Gym' ? `Ohne Sätze, zählte als ${s.dayName}.` : 'Ohne Sätze.'));
    }
    const byEx = new Map<string, SetLog[]>();
    for (const x of [...sets].sort((a, b) => a.ts - b.ts || a.setIndex - b.setIndex)) byEx.set(x.exerciseName, [...(byEx.get(x.exerciseName) ?? []), x]);
    const volume = Math.round(sets.reduce((n, x) => n + x.kg * x.reps, 0));
    return h('div', { class: 'cal-session', 'data-testid': 'cal-session' },
      h('div', { class: 'cal-session-head' }, h('strong', null, s.dayName), h('span', { class: 'muted small' }, timeOf(s.startedAt) + ' Uhr')),
      h('p', { class: 'muted small' }, `${sets.length} Sätze · ${formatNumber(volume)} kg Volumen`),
      [...byEx].map(([name, list]) => h('div', { class: 'history-ex' }, h('div', { class: 'history-ex-name' }, name),
        h('div', { class: 'cal-sets muted small' }, list.map((x) => `${formatKg(x.kg)} kg × ${x.reps}`).join('  ·  ')))));
  }

  function draw() {
    const c = parseKey(cursor);
    title.textContent = mode === 'year' ? String(c.getFullYear()) : mode === 'month' ? monthName(c) : formatDayLong(c.getTime());
    const view = mode === 'month' ? monthView() : mode === 'year' ? yearView() : dayView();
    view.classList.add(dir === 'next' ? 'slide-next' : dir === 'prev' ? 'slide-prev' : 'slide-fade');
    stage.replaceChildren(view);
    legend.hidden = mode === 'day';
    dir = 'none';
    void drawDetail();
    detail.hidden = mode === 'year';
  }
  draw();
}
