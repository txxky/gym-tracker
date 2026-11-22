import { h } from '../lib/dom';

/** Wiederverwendbare Bausteine mit Logik. Das Aussehen steht in styles/components.css. */

export interface SegmentedOptions<T extends string> {
  options: Array<[T, string]>;
  value: T;
  onChange?: (v: T) => void;
  /** Barrierefreier Name der Gruppe */
  label?: string;
  small?: boolean;
  /** Präfix für data-testid der Knöpfe: "<prefix>-<wert>" */
  testId?: string;
}

export interface Segmented<T extends string> {
  el: HTMLElement;
  readonly value: T;
  /** Setzt den Wert ohne onChange (der Daumen gleitet trotzdem) */
  setValue(v: T): void;
}

/**
 * Segmented Control mit gleitendem Daumen. Der Daumen wird nur per transform bewegt (CSS-Variable --seg-i).
 * Die Knöpfe behalten aria-pressed, damit Tests und Screenreader den aktiven Eintrag kennen.
 */
export function segmented<T extends string>(o: SegmentedOptions<T>): Segmented<T> {
  let current = o.value;
  const buttons = o.options.map(([v, text]) =>
    h('button', {
      class: 'seg-btn', type: 'button', 'data-value': v, 'aria-pressed': String(v === current),
      'data-testid': o.testId ? `${o.testId}-${v}` : undefined,
    }, text));
  const el = h('div', { class: o.small ? 'segmented segmented-sm' : 'segmented', role: 'group', 'aria-label': o.label },
    h('span', { class: 'seg-thumb', 'aria-hidden': 'true' }), buttons);
  el.style.setProperty('--seg-n', String(o.options.length));

  const paint = () => {
    el.style.setProperty('--seg-i', String(Math.max(0, o.options.findIndex(([v]) => v === current))));
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === current)));
  };
  paint();
  // Erst nach dem ersten Frame animieren, sonst gleitet der Daumen beim Aufbau von Index 0 zum Startwert.
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-ready')));

  buttons.forEach((b, i) => b.addEventListener('click', () => {
    const v = o.options[i][0];
    if (v === current) return;
    current = v;
    paint();
    o.onChange?.(v);
  }));
  return { el, get value() { return current; }, setValue(v) { current = v; paint(); } };
}

export interface SwitchOptions {
  id: string;
  label: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
}

/** iOS-Schalter in einer ganzen Zeile (die ganze Zeile ist das Touch-Ziel). Das <input> trägt id und data-testid. */
export function switchRow(o: SwitchOptions): { el: HTMLLabelElement; input: HTMLInputElement } {
  const input = h('input', { type: 'checkbox', role: 'switch', class: 'switch-input', id: o.id, 'data-testid': o.id });
  input.checked = o.checked;
  input.addEventListener('change', () => o.onChange?.(input.checked));
  const el = h('label', { class: 'switch-row', for: o.id },
    h('span', { class: 'switch-label' }, o.label),
    h('span', { class: 'switch' }, input, h('span', { class: 'switch-track', 'aria-hidden': 'true' })));
  return { el, input };
}
