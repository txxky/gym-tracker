import { h, svg } from '../lib/dom';
import { ICON } from '../lib/icons';

export interface Sheet {
  el: HTMLElement;
  body: HTMLElement;
  close(): void;
}

const stack: Sheet[] = [];

/** Vollbild-Sheet (mobile first). Escape schließt das oberste. */
export function openSheet(title: string, onClose?: () => void): Sheet {
  const body = h('div', { class: 'sheet-body' });
  const closeBtn = h('button', { class: 'icon-btn', 'aria-label': 'Schließen', type: 'button' }, svg(ICON.close));
  const el = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('header', { class: 'sheet-header' }, h('h2', null, title), closeBtn),
    body,
  );
  const sheet: Sheet = {
    el,
    body,
    close() {
      const i = stack.indexOf(sheet);
      if (i < 0) return;
      stack.splice(i, 1);
      el.remove();
      if (!stack.length) document.body.classList.remove('sheet-open');
      onClose?.();
    },
  };
  closeBtn.addEventListener('click', () => sheet.close());
  stack.push(sheet);
  document.body.appendChild(el);
  document.body.classList.add('sheet-open');
  closeBtn.focus();
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
