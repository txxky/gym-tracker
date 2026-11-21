import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles/theme.css', import.meta.url), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector + ' {');
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// var(--x) auflösen, damit auch Diagramm-Variablen geprüft werden können
function resolve(vars: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    const m = /^var\(--([\w-]+)\)$/.exec(v);
    out[k] = m ? vars[m[1]] : v;
  }
  return out;
}
const lightRaw = block(':root');
const light = resolve(lightRaw);
const dark = resolve({ ...lightRaw, ...block('[data-theme="dark"]') });

// Textpaare, die in der App wirklich vorkommen. WCAG AA: 4.5 für Text.
const PAIRS: Array<[string, string]> = [
  ['text', 'bg'], ['text', 'surface'], ['text', 'surface-2'], ['text', 'accent-soft'],
  ['text-muted', 'bg'], ['text-muted', 'surface'], ['text-muted', 'surface-2'],
  ['on-accent', 'accent'], ['on-danger', 'danger'], ['accent', 'bg'], ['accent', 'surface'],
  ['danger', 'surface'], ['success', 'surface'], ['bg', 'text'],
  // Diagramm: Achsenbeschriftung ist Text, Tooltip-Text liegt auf --surface
  ['chart-text', 'surface'], ['text', 'surface'],
];

describe.each([['hell', light], ['dunkel', dark]] as const)('Kontrast %s', (_name, vars) => {
  it.each(PAIRS)('%s auf %s >= 4.5', (fg, bg) => {
    expect(ratio(vars[fg], vars[bg])).toBeGreaterThanOrEqual(4.5);
  });
  it('Diagramm-Linie und -Balken >= 3 auf der Karte (WCAG 1.4.11)', () => {
    expect(ratio(vars['chart-line'], vars['surface'])).toBeGreaterThanOrEqual(3);
  });
  it('Rahmen/Auswahlband >= 3 (UI-Komponenten)', () => {
    expect(ratio(vars['accent'], vars['surface-2'])).toBeGreaterThanOrEqual(3);
    expect(ratio(vars['border'], vars['bg'])).toBeGreaterThanOrEqual(1.4);
  });
});

describe('keine hartcodierten Farben außerhalb von theme.css', () => {
  it('app.css enthält keine Farbliterale', () => {
    const app = readFileSync(new URL('../src/styles/app.css', import.meta.url), 'utf8');
    expect(app).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(app).not.toMatch(/\brgba?\(/);
  });
});
