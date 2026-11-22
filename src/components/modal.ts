import { h, svg } from '../lib/dom';
import { ICON } from '../lib/icons';

export interface Sheet {
  el: HTMLElement;
  body: HTMLElement;
  close(): void;
}

export interface SheetOptions {
  onClose?: () => void;
  /** Fast volle Höhe (für lange Listen wie die Übungssuche) */
  tall?: boolean;
}

const stack: Sheet[] = [];
const CLOSE_DRAG_PX = 110;
const CLOSE_VELOCITY = 0.6; // px pro ms

/**
 * Sheet von unten: Material, Griff oben, Backdrop. Schließt per Schließen-Knopf, Escape, Tippen auf den Backdrop
 * oder Wischen nach unten (am Kopf mit dem Griff). Escape schließt das oberste.
 */
export function openSheet(title: string, onClose?: (() => void) | SheetOptions, opts: SheetOptions = {}): Sheet {
  const o: SheetOptions = typeof onClose === 'function' ? { ...opts, onClose } : { ...opts, ...(onClose ?? {}) };
  const body = h('div', { class: 'sheet-body' });
  const closeBtn = h('button', { class: 'icon-btn sheet-close', 'aria-label': 'Schließen', type: 'button' }, svg(ICON.close));
  const header = h('header', { class: 'sheet-header' }, h('h2', null, title), closeBtn);
  const backdrop = h('div', { class: 'sheet-backdrop', 'aria-hidden': 'true' });
  const panel = h('div', { class: o.tall ? 'sheet sheet-tall' : 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, header, body);
  const el = h('div', { class: 'sheet-root' }, backdrop, panel);

  let closing = false;
  const sheet: Sheet = {
    el,
    body,
    close() {
      const i = stack.indexOf(sheet);
      if (i < 0 || closing) return;
      closing = true;
      stack.splice(i, 1);
      if (!stack.length) document.body.classList.remove('sheet-open');
      el.classList.add('is-closing');
      el.classList.remove('is-dragging');
      el.setAttribute('aria-hidden', 'true');
      // Das ausblendende Sheet ist nur noch Optik: Test-IDs weg, damit es keine Suche nach dem neuen Sheet stört.
      el.querySelectorAll('[data-testid]').forEach((n) => n.removeAttribute('data-testid'));
      // Bei "weniger Bewegung" gibt es nichts zu animieren: sofort entfernen.
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.remove(); o.onClose?.(); return; }
      // Nach der Animation entfernen; der Timer ist der Fallback, falls kein transitionend kommt (z. B. weniger Bewegung).
      let removed = false;
      const remove = () => { if (!removed) { removed = true; el.remove(); } };
      panel.addEventListener('transitionend', (e) => { if (e.target === panel && e.propertyName === 'transform') remove(); });
      window.setTimeout(remove, 450);
      o.onClose?.();
    },
  };

  closeBtn.addEventListener('click', () => sheet.close());
  backdrop.addEventListener('click', () => sheet.close());

  // Wischen nach unten am Kopf: Sheet folgt dem Finger, bei genug Weg oder Tempo schließt es, sonst federt es zurück.
  let startY = 0; let lastY = 0; let lastT = 0; let velocity = 0; let dragging = false;
  header.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragging = true; startY = lastY = e.clientY; lastT = e.timeStamp; velocity = 0;
    header.setPointerCapture(e.pointerId);
    el.classList.add('is-dragging');
  });
  header.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dt = e.timeStamp - lastT;
    if (dt > 0) velocity = (e.clientY - lastY) / dt;
    lastY = e.clientY; lastT = e.timeStamp;
    el.style.setProperty('--drag', `${Math.max(0, e.clientY - startY)}px`);
  });
  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    try { header.releasePointerCapture(e.pointerId); } catch { /* schon freigegeben */ }
    const dy = Math.max(0, e.clientY - startY);
    el.classList.remove('is-dragging');
    if (e.type !== 'pointercancel' && (dy > CLOSE_DRAG_PX || velocity > CLOSE_VELOCITY)) {
      el.style.removeProperty('--drag');
      sheet.close();
    } else {
      el.style.removeProperty('--drag'); // Transition ist wieder an: federt zurück
    }
  };
  header.addEventListener('pointerup', endDrag);
  header.addEventListener('pointercancel', endDrag);

  stack.push(sheet);
  document.body.appendChild(el);
  document.body.classList.add('sheet-open');
  // Erst im nächsten Frame öffnen, damit die Einblend-Animation von unten läuft
  void el.offsetHeight;
  requestAnimationFrame(() => el.classList.add('is-open'));
  closeBtn.focus({ preventScroll: true });
  return sheet;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close();
});

/** Kleines Eingabe-Sheet für einen Text (Name). Gibt null zurück, wenn abgebrochen wurde. */
export function askText(title: string, value = '', okLabel = 'Speichern'): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: string | null) => { if (!done) { done = true; resolve(v); } };
    const sheet = openSheet(title, () => finish(null));
    const input = h('input', { class: 'input', type: 'text', maxlength: '80', 'aria-label': title, 'data-testid': 'ask-input' });
    input.value = value;
    const ok = h('button', { class: 'btn btn-primary btn-block', type: 'button', 'data-testid': 'ask-ok' }, okLabel);
    const submit = () => {
      const v = input.value.trim();
      if (!v) return;
      finish(v);
      sheet.close();
    };
    ok.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    sheet.body.append(input, ok);
    input.focus();
    input.select();
  });
}

let toastTimer = 0;
export function toast(message: string): void {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status' }, message);
  document.body.appendChild(t);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.remove(), 2800);
}
