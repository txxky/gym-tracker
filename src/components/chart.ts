import {
  BarController, BarElement, CategoryScale, Chart, Filler, LinearScale, LineController, LineElement, PointElement, Tooltip,
  type ChartConfiguration,
} from 'chart.js';
import { cssVar } from '../lib/theme';
import type { Series } from '../lib/progress';

// Nur, was gebraucht wird: hält das Bundle klein (tree-shaking).
Chart.register(LineController, BarController, LineElement, PointElement, BarElement, LinearScale, CategoryScale, Tooltip, Filler);

const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
export const formatNumber = (n: number): string => nf.format(n);
export const formatDay = (ms: number): string => new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
export const formatDayLong = (ms: number): string =>
  new Date(ms).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

/** Liest die Theme-Farben zur Laufzeit aus den CSS-Variablen (Canvas kennt kein var()). */
export function chartColors() {
  return {
    line: cssVar('--chart-line'), fill: cssVar('--chart-fill'), grid: cssVar('--chart-grid'), text: cssVar('--chart-text'),
    surface: cssVar('--surface'), fg: cssVar('--text'), border: cssVar('--border'),
  };
}

export function drawChart(canvas: HTMLCanvasElement, series: Series, title: string): Chart {
  const c = chartColors();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isBar = series.kind === 'bar';
  const unit = series.unit;
  const font = { family: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', size: 12 };

  const common = {
    responsive: true,
    maintainAspectRatio: false,
    animation: reduce ? (false as const) : { duration: 250 },
    // Tippen (oder Hovern) zeigt den nächsten Wert, auch wenn man den Punkt nicht exakt trifft.
    interaction: { mode: 'nearest' as const, axis: 'x' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: c.surface, titleColor: c.fg, bodyColor: c.fg, borderColor: c.border, borderWidth: 1,
        padding: 10, displayColors: false, titleFont: { ...font, weight: 'bold' as const }, bodyFont: { ...font, size: 14 },
        callbacks: {
          title: (items: Array<{ dataIndex: number }>) => {
            const x = series.points[items[0].dataIndex]?.x;
            if (x === undefined) return '';
            return isBar ? `Woche ab ${formatDayLong(x)}` : formatDayLong(x);
          },
          label: (item: { parsed: { y: number | null } }) => `${formatNumber(item.parsed.y ?? 0)} ${unit}`,
        },
      },
    },
  };

  const yScale = {
    beginAtZero: isBar || title.includes('Volumen'),
    grid: { color: c.grid }, border: { display: false },
    ticks: { color: c.text, font, precision: isBar ? 0 : undefined },
    title: { display: true, text: series.index ? 'Index (Start = 100)' : unit, color: c.text, font },
  };

  const config = isBar
    ? ({
      type: 'bar',
      data: {
        labels: series.points.map((p) => formatDay(p.x)),
        datasets: [{ data: series.points.map((p) => p.y), backgroundColor: c.line, borderRadius: 4, maxBarThickness: 28 }],
      },
      options: { ...common, scales: { x: { grid: { display: false }, ticks: { color: c.text, font, maxTicksLimit: 8 } }, y: yScale } },
    } satisfies ChartConfiguration<'bar'>)
    : ({
      type: 'line',
      data: {
        datasets: [{
          data: series.points.map((p) => ({ x: p.x, y: p.y })),
          borderColor: c.line, backgroundColor: c.fill, fill: true, tension: 0.25, borderWidth: 3,
          pointRadius: 4, pointHoverRadius: 7, pointBackgroundColor: c.line, pointBorderColor: c.surface, pointBorderWidth: 2,
          pointHitRadius: 24,
        }],
      },
      options: {
        ...common,
        parsing: false,
        scales: {
          x: {
            type: 'linear', grid: { color: c.grid }, border: { display: false },
            ticks: { color: c.text, font, maxTicksLimit: 5, callback: (v) => formatDay(Number(v)) },
            // Platz am Rand, damit der erste und letzte Punkt nicht abgeschnitten werden
            min: series.points[0] ? series.points[0].x - 43_200_000 : undefined,
            max: series.points.length ? series.points[series.points.length - 1].x + 43_200_000 : undefined,
          },
          y: yScale,
        },
      },
    } satisfies ChartConfiguration<'line'>);

  return new Chart(canvas, config as ChartConfiguration);
}
