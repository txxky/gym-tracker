import { h } from '../lib/dom';

export const WHEEL_ITEM_PX = 44;

export interface WheelOptions {
  /** Barrierefreier Name, wird auch als Beschriftung über dem Rad gezeigt */
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** Einheit, rechts im Auswahlband (z. B. "kg") */
  unit?: string;
  format?: (v: number) => string;
  onChange?: (v: number) => void;
  hideLabel?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Die EINE Zahlen-Wheel-Komponente der App (iOS-Stil, CSS scroll-snap).
 * Der Wert unter dem Auswahlband ist der aktuelle Wert. Läuft per Touch, Mausrad und Tastatur.
 */
export class Wheel {
  readonly el: HTMLDivElement;
  private scroller: HTMLDivElement;
  private items: HTMLElement[] = [];
  private count: number;
  private idx = 0;
  private raf = 0;
  private ready = false;
  /** true, solange eine programmatische Scroll-Animation läuft: Zwischenwerte werden ignoriert. */
  private animating = false;
  private animTimer = 0;

  constructor(private opts: WheelOptions) {
    this.count = Math.round((opts.max - opts.min) / opts.step) + 1;
    const fmt = opts.format ?? ((v: number) => String(v).replace('.', ','));
    this.items = Array.from({ length: this.count }, (_, i) => {
      const item = h('div', { class: 'wheel-item' }, fmt(this.valueAt(i)));
      item.addEventListener('click', () => this.scrollToIndex(i, true));
      return item;
    });
    this.scroller = h('div', { class: 'wheel-scroll' }, this.items);
    this.el = h(
      'div',
      { class: 'wheel', role: 'spinbutton', tabindex: '0', 'aria-label': opts.label },
      opts.hideLabel ? null : h('div', { class: 'wheel-label', 'aria-hidden': 'true' }, opts.label),
      h(
        'div',
        { class: 'wheel-frame' },
        h('div', { class: 'wheel-band', 'aria-hidden': 'true' }, opts.unit ? h('span', { class: 'wheel-unit' }, opts.unit) : null),
        this.scroller,
      ),
    );
    this.idx = this.indexOf(opts.value);
    this.paint();

    this.scroller.addEventListener('scroll', () => {
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        this.onScroll();
      });
    });
    // Fasst der Nutzer das Rad an, gilt wieder der echte Scroll-Stand.
    this.scroller.addEventListener('pointerdown', () => this.stopAnimating());
    this.scroller.addEventListener('wheel', () => this.stopAnimating(), { passive: true });
    this.el.addEventListener('keydown', (e) => this.onKey(e));
    // Startposition erst setzen, wenn das Element Layout hat (nach dem Einhängen ins DOM).
    new ResizeObserver(() => {
      if (!this.ready && this.scroller.clientHeight > 0) {
        this.ready = true;
        this.applyScroll(false);
      }
    }).observe(this.scroller);
  }

  get value(): number {
    return this.valueAt(this.idx);
  }

  /** Setzt den Wert programmatisch (löst onChange nicht aus). */
  setValue(v: number): void {
    this.idx = this.indexOf(v);
    this.paint();
    this.applyScroll(false);
  }

  private valueAt(i: number): number {
    return round2(this.opts.min + i * this.opts.step);
  }

  private indexOf(v: number): number {
    const i = Math.round((v - this.opts.min) / this.opts.step);
    return Math.min(this.count - 1, Math.max(0, i));
  }

  private applyScroll(smooth: boolean): void {
    if (this.scroller.clientHeight === 0) return;
    this.scroller.scrollTo({ top: this.idx * WHEEL_ITEM_PX, behavior: smooth ? 'smooth' : 'instant' });
  }

  private scrollToIndex(i: number, smooth: boolean): void {
    const next = Math.min(this.count - 1, Math.max(0, i));
    if (next === this.idx && !this.animating) return;
    this.idx = next;
    if (smooth) {
      this.animating = true;
      window.clearTimeout(this.animTimer);
      // Sicherheitsnetz, falls das Ziel nie erreicht wird (z. B. Rad ausgeblendet)
      this.animTimer = window.setTimeout(() => { this.animating = false; }, 1500);
    }
    this.applyScroll(smooth);
    this.commit();
  }

  private stopAnimating(): void {
    this.animating = false;
    window.clearTimeout(this.animTimer);
  }

  private onScroll(): void {
    if (this.animating) {
      // Programmatische Animation (Tastatur, Antippen): Zwischenstände ignorieren, bis das Ziel erreicht ist.
      // Nicht auf 'scrollend' oder Timer verlassen: bei schnell wiederholten Tasten würde die erste Animation
      // die Sperre der zweiten aufheben und das Rad auf einen Zwischenwert springen lassen.
      if (Math.abs(this.scroller.scrollTop - this.idx * WHEEL_ITEM_PX) <= 1) this.stopAnimating();
      return;
    }
    const i = Math.min(this.count - 1, Math.max(0, Math.round(this.scroller.scrollTop / WHEEL_ITEM_PX)));
    if (i !== this.idx) {
      this.idx = i;
      this.commit();
    }
  }

  private commit(): void {
    this.paint();
    this.opts.onChange?.(this.value);
  }

  private paint(): void {
    this.items.forEach((it, i) => it.classList.toggle('is-selected', i === this.idx));
    this.el.setAttribute('aria-valuenow', String(this.value));
    this.el.setAttribute('aria-valuetext', this.items[this.idx].textContent + (this.opts.unit ? ` ${this.opts.unit}` : ''));
    this.el.setAttribute('aria-valuemin', String(this.opts.min));
    this.el.setAttribute('aria-valuemax', String(this.opts.max));
  }

  private onKey(e: KeyboardEvent): void {
    const jump: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 };
    if (e.key in jump) this.scrollToIndex(this.idx + jump[e.key], true);
    else if (e.key === 'Home') this.scrollToIndex(0, true);
    else if (e.key === 'End') this.scrollToIndex(this.count - 1, true);
    else return;
    e.preventDefault();
  }
}

/** Sekunden als m:ss, z. B. 90 -> "1:30". */
export function formatSeconds(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
