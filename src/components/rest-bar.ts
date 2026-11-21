import { h } from '../lib/dom';
import { adjustRest, restStatus, stopRest, subscribeRest } from '../lib/rest-timer';
import { formatSeconds } from './wheel';

/** Leiste mit Restzeit, +/-15 s und Überspringen. Verschwindet von selbst, wenn keine Pause läuft. */
export function restBar(): HTMLElement {
  const time = h('strong', { class: 'rest-time', 'data-testid': 'rest-time' });
  const bar = h('progress', { class: 'bar rest-progress', max: '100', value: '0', 'aria-hidden': 'true' });
  const label = h('span', { class: 'rest-label' }, 'Pause');
  const root = h('div', { class: 'rest-bar', hidden: true, role: 'timer', 'aria-live': 'off', 'data-testid': 'rest-bar' },
    h('div', { class: 'rest-main' }, label, time),
    bar,
    h('div', { class: 'rest-actions' },
      h('button', { class: 'btn btn-ghost', type: 'button', 'data-testid': 'rest-minus', onclick: () => adjustRest(-15) }, '−15 s'),
      h('button', { class: 'btn btn-ghost', type: 'button', 'data-testid': 'rest-plus', onclick: () => adjustRest(15) }, '+15 s'),
      h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': 'rest-skip', onclick: () => stopRest() }, 'Überspringen')));

  const paint = () => {
    if (!root.isConnected) { unsubscribe(); return; }
    const s = restStatus();
    root.hidden = s.phase === 'idle';
    root.classList.toggle('is-done', s.phase === 'done');
    if (s.phase === 'running') {
      label.textContent = 'Pause';
      time.textContent = formatSeconds(s.remainingSec);
      bar.value = Math.round(((s.totalSec - s.remainingSec) / s.totalSec) * 100);
      root.setAttribute('aria-label', `Pause, noch ${formatSeconds(s.remainingSec)}`);
    } else if (s.phase === 'done') {
      label.textContent = 'Pause vorbei';
      time.textContent = 'Weiter!';
      bar.value = 100;
    }
  };
  const unsubscribe = subscribeRest(paint);
  // Direkt nach dem Einhängen einmal zeichnen (isConnected ist erst dann true).
  queueMicrotask(paint);
  return root;
}
