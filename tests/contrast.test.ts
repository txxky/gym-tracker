import { readdirSync, readFileSync } from 'node:fs';
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
  ['text-muted', 'bg'], ['text-muted', 'surface'], ['text-muted', 'surface-2'], ['text-muted', 'thumb'], ['text', 'thumb'],
  ['text', 'fill-mid'], ['danger', 'surface-2'], ['text', 'accent-soft'],
  ['on-accent', 'accent'], ['on-danger', 'danger'], ['accent', 'bg'], ['accent', 'surface'],
  ['danger', 'surface'], ['success', 'surface'], ['bg', 'text'],
  // Diagramm: Achsenbeschriftung ist Text, Tooltip-Text liegt auf --surface
  ['chart-text', 'surface'], ['text', 'surface'],
];

// Halbtransparente Flächen (Material): Farbe #rrggbbaa über einen Hintergrund legen
function over(top: string, under: string): string {
  const a = top.length === 9 ? parseInt(top.slice(7, 9), 16) / 255 : 1;
  const mix = (i: number) => Math.round(parseInt(top.slice(i, i + 2), 16) * a + parseInt(under.slice(i, i + 2), 16) * (1 - a));
  return '#' + [1, 3, 5].map((i) => mix(i).toString(16).padStart(2, '0')).join('');
}

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
  it('Tinte (Primärknopf, Training im Kalender) und heutiger Tag heben sich ab (>= 3)', () => {
    expect(ratio(vars['accent'], vars['surface'])).toBeGreaterThanOrEqual(3);
    expect(ratio(vars['today'], vars['surface'])).toBeGreaterThanOrEqual(3);
    expect(ratio(vars['today'], vars['bg'])).toBeGreaterThanOrEqual(3);
  });
  // Material liegt über beliebigem Inhalt. Worst Case: darunter liegt die Textfarbe selbst (Text auf Text), dazu die Ebenen.
  // Dazu kommt bei Sheets der abdunkelnde Backdrop; der macht den Untergrund nur dunkler bzw. heller in Richtung Rand und ist im Worst Case enthalten.
  it.each(['bg', 'surface', 'surface-2', 'text'])('Material über %s: Text und gedämpfter Text >= 4.5', (under) => {
    const mat = over(vars['material'], vars[under]);
    expect(ratio(vars['text'], mat)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(vars['text-muted'], mat)).toBeGreaterThanOrEqual(4.5);
  });
  it('Material-Fallback (volle Deckkraft) ist lesbar', () => {
    expect(ratio(vars['text'], vars['material-solid'])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(vars['text-muted'], vars['material-solid'])).toBeGreaterThanOrEqual(4.5);
  });
  it('Schaltergriff und Daumen sind sichtbar gegen ihre Fläche', () => {
    expect(ratio(vars['knob'], vars['toggle-off'])).toBeGreaterThanOrEqual(1.4);
    expect(ratio(vars['on-accent'], vars['accent'])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('keine hartcodierten Farben außerhalb von theme.css', () => {
  const dir = new URL('../src/styles/', import.meta.url);
  const others = readdirSync(dir).filter((f) => f.endsWith('.css') && f !== 'theme.css');
  it('es gibt weitere Stylesheets (Prüfung läuft nicht ins Leere)', () => expect(others).toEqual(expect.arrayContaining(['app.css', 'components.css', 'tokens.css'])));
  it.each(others)('%s enthält keine Farbliterale', (file) => {
    const css = readFileSync(new URL(file, dir), 'utf8');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(rgba?|hsla?|hwb|oklch|oklab|lab|lch)\(/);
    expect(css).not.toMatch(/color-mix\(/);
    // Farbnamen als Werte (z. B. "color: red", "background: white") sind ebenfalls verboten
    expect(css).not.toMatch(/:\s*(black|white|red|green|blue|gray|grey|orange|yellow|purple|pink|silver)\b/i);
  });
});
