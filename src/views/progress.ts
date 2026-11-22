import type { Chart } from 'chart.js';
import { drawChart, formatDay, formatDayLong, formatNumber } from '../components/chart';
import { setHeader } from '../components/shell';
import { db } from '../lib/db';
import { h, svg } from '../lib/dom';
import { allExercises } from '../lib/exercises';
import { ICON } from '../lib/icons';
import { muscleLabel } from '../lib/muscles';
import {
  buildRecords, buildSeries, DEFAULT_FILTERS, filterByView, filterOptions, personalRecords, summarize,
  filterByRange, type Filters, type Metric, type Range, type View,
} from '../lib/progress';
import type { RouteContext } from '../lib/router';
import { segmented, type Segmented } from '../components/ui';

const VIEWS: Array<[View, string]> = [['total', 'Gesamt'], ['exercise', 'Übung'], ['muscle', 'Muskel'], ['day', 'Split-Tag']];
const RANGES: Array<[Range, string]> = [['4w', '4 Wochen'], ['3m', '3 Monate'], ['1y', '1 Jahr'], ['all', 'Alles']];
const METRICS: Array<[Metric, string]> = [['e1rm', '1RM'], ['volume', 'Volumen'], ['top', 'Top-Set'], ['sets', 'Sätze/\u200bWoche']];
const METRIC_TITLE: Record<Metric, string> = {
  e1rm: 'Geschätztes 1RM (Epley)', volume: 'Volumen (kg x Wdh.)', top: 'Top-Set-Gewicht', sets: 'Sätze pro Woche',
};
const STORE = 'gt-progress';
const NEW_PR_DAYS = 7;

function loadFilters(): Filters {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    if (raw && VIEWS.some(([v]) => v === raw.view) && RANGES.some(([v]) => v === raw.range) && METRICS.some(([v]) => v === raw.metric)) {
      return { ...DEFAULT_FILTERS, ...raw };
    }
  } catch { /* kaputter oder fehlender Speicher: Standard */ }
  return { ...DEFAULT_FILTERS };
}
function saveFilters(f: Filters): void {
  try { localStorage.setItem(STORE, JSON.stringify(f)); } catch { /* ignorieren */ }
}

function segmentGroup<T extends string>(label: string, ctl: Segmented<T>): HTMLElement {
  return h('div', { class: 'filter-group' }, h('span', { class: 'filter-label' }, label), ctl.el);
}

export async function renderProgress({ root, isCurrent }: RouteContext): Promise<void> {
  setHeader({ title: 'Fortschritt', actions: [h('a', { class: 'icon-btn', href: '#/history', 'aria-label': 'Verlauf: alle Sätze', 'data-testid': 'open-history' }, svg(ICON.splits))] });
  const [sets, sessions, exercises] = await Promise.all([db.sets.toArray(), db.sessions.toArray(), allExercises()]);
  if (!isCurrent()) return;
  const recs = buildRecords(sets, sessions, exercises);

  if (!recs.length) {
    root.append(h('div', { class: 'empty', 'data-testid': 'progress-empty' }, svg(ICON.progress, 'icon icon-xl muted'),
      h('h2', null, 'Noch keine Daten'),
      h('p', { class: 'muted' }, 'Sobald du Sätze loggst, siehst du hier deinen Verlauf und deine Rekorde.'),
      h('a', { class: 'btn btn-primary', href: '#/training' }, 'Zum Training')));
    return;
  }

  const options = filterOptions(recs);
  const f = loadFilters();
  const now = Date.now();
  let chart: Chart | null = null;

  /** Auswahl der Unterfilter (Übung/Muskel/Tag) gültig halten. */
  function normalize() {
    if (f.view === 'exercise' && !options.exercises.some((e) => e.id === f.exerciseId)) f.exerciseId = options.exercises[0]?.id ?? null;
    if (f.view === 'muscle' && !(f.muscle && options.muscles.includes(f.muscle))) f.muscle = options.muscles[0] ?? null;
    if (f.view === 'day' && !(f.dayName && options.days.includes(f.dayName))) f.dayName = options.days[0] ?? null;
  }

  const filtersEl = h('section', { class: 'card filters' });
  const chartCard = h('section', { class: 'card' });
  const prEl = h('section', null);
  root.append(filtersEl, chartCard, prEl,
    h('a', { class: 'btn btn-ghost btn-block', href: '#/history', 'data-testid': 'history-link' }, 'Alle Sätze ansehen'));

  function subFilter(): HTMLElement | null {
    if (f.view === 'total') return null;
    const sel = h('select', { class: 'input', 'data-testid': 'sub-filter' });
    let items: Array<[string, string]> = [];
    let label = '';
    let current = '';
    if (f.view === 'exercise') { label = 'Übung'; items = options.exercises.map((e) => [e.id, e.name]); current = f.exerciseId ?? ''; }
    if (f.view === 'muscle') { label = 'Muskelgruppe'; items = options.muscles.map((m) => [m, muscleLabel(m)]); current = f.muscle ?? ''; }
    if (f.view === 'day') { label = 'Split-Tag'; items = options.days.map((d) => [d, d]); current = f.dayName ?? ''; }
    if (!items.length) return h('p', { class: 'muted' }, 'Dafür gibt es noch keine Daten.');
    sel.append(...items.map(([v, t]) => h('option', { value: v }, t)));
    sel.value = current;
    sel.addEventListener('change', () => {
      if (f.view === 'exercise') f.exerciseId = sel.value;
      if (f.view === 'muscle') f.muscle = sel.value;
      if (f.view === 'day') f.dayName = sel.value;
      saveFilters(f);
      drawData();
    });
    return h('label', { class: 'field filter-sub' }, h('span', null, label), sel);
  }

  // Die drei Umschalter werden nur einmal gebaut, damit der Daumen gleiten kann. Nur die Unterauswahl wird neu gezeichnet.
  const viewCtl: Segmented<View> = segmented({ options: VIEWS, value: f.view, label: 'Ansicht', small: true, testId: 'view',
    onChange: (v) => { f.view = v; saveFilters(f); drawFilters(); drawData(); } });
  const rangeCtl: Segmented<Range> = segmented({ options: RANGES, value: f.range, label: 'Zeitraum', small: true, testId: 'range',
    onChange: (v) => { f.range = v; saveFilters(f); drawData(); } });
  const metricCtl: Segmented<Metric> = segmented({ options: METRICS, value: f.metric, label: 'Kennzahl', small: true, testId: 'metric',
    onChange: (v) => { f.metric = v; saveFilters(f); drawData(); } });
  const subSlot = h('div', { class: 'filter-slot' });
  filtersEl.append(segmentGroup('Ansicht', viewCtl), subSlot, segmentGroup('Zeitraum', rangeCtl), segmentGroup('Kennzahl', metricCtl));

  function drawFilters() {
    normalize();
    const sub = subFilter();
    subSlot.replaceChildren(...(sub ? [sub] : []));
    subSlot.hidden = !sub;
  }

  function drawData() {
    chart?.destroy();
    chart = null;
    const series = buildSeries(recs, f, now);
    const inView = filterByView(recs, f);
    const inRange = filterByRange(inView, f.range, now);
    const sum = summarize(inRange);
    chartCard.replaceChildren(h('h2', null, METRIC_TITLE[f.metric]));

    if (!series.points.length) {
      chartCard.append(h('div', { class: 'empty', 'data-testid': 'chart-empty' },
        h('p', null, 'Keine Daten für diese Auswahl.'),
        h('p', { class: 'muted' }, 'Wähle einen längeren Zeitraum oder eine andere Ansicht.')));
    } else {
      const canvas = h('canvas', { role: 'img', 'data-testid': 'chart',
        'aria-label': `${METRIC_TITLE[f.metric]}: ${series.points.length} Messpunkte, zuletzt ${formatNumber(series.points[series.points.length - 1].y)} ${series.unit}` });
      chartCard.append(h('div', { class: 'chart-wrap' }, canvas));
      chart = drawChart(canvas, series, METRIC_TITLE[f.metric]);
      if (series.index) {
        chartCard.append(h('p', { class: 'muted small' }, 'Mehrere Übungen zusammen: Durchschnitt aller Übungen im Vergleich zu ihrem ersten Wert im Zeitraum (100 = Start).'));
      }
      const first = series.points[0].y;
      const last = series.points[series.points.length - 1].y;
      const delta = series.kind === 'line' && series.points.length > 1 && first !== 0 ? ((last - first) / first) * 100 : null;
      chartCard.append(h('p', { class: 'stat-line', 'data-testid': 'summary' },
        `${sum.days} Trainingstage · ${sum.sets} Sätze · ${formatNumber(sum.volume)} kg Volumen`,
        delta !== null ? h('strong', { class: delta >= 0 ? 'delta-up' : 'delta-down' }, ` · ${delta >= 0 ? '+' : ''}${formatNumber(delta)} %`) : null));
      chartCard.append(h('details', { class: 'values' }, h('summary', null, 'Werte als Tabelle'),
        h('table', { 'data-testid': 'values' },
          h('thead', null, h('tr', null, h('th', null, series.kind === 'bar' ? 'Woche ab' : 'Datum'), h('th', null, series.index ? 'Index' : series.unit))),
          h('tbody', null, [...series.points].reverse().map((p) => h('tr', null, h('td', null, formatDayLong(p.x)), h('td', null, formatNumber(p.y))))))));
    }

    // Rekorde: über alle Zeit, folgen aber der gewählten Ansicht
    const prs = personalRecords(inView);
    prEl.replaceChildren(h('h2', null, 'Rekorde'),
      prs.length
        ? h('div', { class: 'stack', 'data-testid': 'pr-list' }, prs.slice(0, 50).map((p) => {
          const fresh = now - p.latest <= NEW_PR_DAYS * 86_400_000;
          return h('div', { class: 'pr-row', 'data-testid': 'pr-row' },
            h('div', { class: 'pr-head' }, h('strong', null, p.name), fresh ? h('span', { class: 'chip chip-accent chip-inline' }, 'Neu') : null),
            h('div', { class: 'pr-line' }, h('span', { class: 'muted' }, 'Schwerstes'), h('span', null, `${formatNumber(p.weight.kg)} kg x ${p.weight.reps}`), h('span', { class: 'muted small' }, formatDay(p.weight.date))),
            h('div', { class: 'pr-line' }, h('span', { class: 'muted' }, '1RM geschätzt'), h('span', null, `${formatNumber(p.e1rm.value)} kg`), h('span', { class: 'muted small' }, formatDay(p.e1rm.date))));
        }))
        : h('p', { class: 'muted' }, 'Noch keine Rekorde in dieser Ansicht. Rekorde brauchen Sätze mit Gewicht.'));
  }

  // Theme-Wechsel: Canvas kennt keine CSS-Variablen, also neu zeichnen.
  const onTheme = () => {
    if (!filtersEl.isConnected) { window.removeEventListener('themechange', onTheme); chart?.destroy(); return; }
    drawData();
  };
  window.addEventListener('themechange', onTheme);

  drawFilters();
  drawData();
}
