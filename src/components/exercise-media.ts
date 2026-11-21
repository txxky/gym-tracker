import { h, svg } from '../lib/dom';
import { ICON } from '../lib/icons';
import { exerciseImageUrls } from '../lib/images';
import { muscleLabel } from '../lib/muscles';
import type { Exercise } from '../lib/types';

function placeholder(ex: Exercise, big: boolean): HTMLElement {
  return h(
    'div',
    { class: big ? 'media-ph media-ph-big' : 'media-ph', 'data-testid': 'img-placeholder', role: 'img', 'aria-label': 'Kein Bild vorhanden' },
    svg(ICON.dumbbell, 'icon icon-lg'),
    big ? h('span', null, muscleLabel(ex.primaryMuscles[0] ?? '')) : null,
  );
}

/** Eine <img> mit Lazy-Loading und CORS (nötig für den Offline-Cache); Fehler -> Platzhalter. */
function lazyImg(src: string, alt: string, ex: Exercise, big: boolean, revoke = false): HTMLElement {
  const img = h('img', { src, alt, loading: 'lazy', decoding: 'async', crossorigin: 'anonymous', class: 'media-img' });
  const wrap = h('div', { class: big ? 'media media-big' : 'media' }, img);
  img.addEventListener('error', () => wrap.replaceChildren(placeholder(ex, big)));
  if (revoke) img.addEventListener('load', () => URL.revokeObjectURL(src));
  return wrap;
}

function sources(ex: Exercise): { urls: string[]; blob: boolean } {
  if (ex.photo) return { urls: [URL.createObjectURL(ex.photo)], blob: true };
  return { urls: exerciseImageUrls(ex), blob: false };
}

/** Vorschaubild für Listen, Suche und Builder. */
export function exerciseThumb(ex: Exercise): HTMLElement {
  const { urls, blob } = sources(ex);
  const wrap = urls.length
    ? lazyImg(urls[0], '', ex, false, blob)
    : h('div', { class: 'media' }, placeholder(ex, false));
  wrap.classList.add('thumb');
  return wrap;
}

/** Großes Bild; bei zwei Bildern lassen sich Start und Ende durchschalten. */
export function exerciseGallery(ex: Exercise): HTMLElement {
  const { urls, blob } = sources(ex);
  const holder = h('div', { class: 'gallery-stage' });
  const root = h('div', { class: 'gallery', 'data-testid': 'gallery' }, holder);
  if (!urls.length) {
    holder.appendChild(h('div', { class: 'media media-big' }, placeholder(ex, true)));
    return root;
  }
  const show = (i: number) => {
    holder.replaceChildren(lazyImg(urls[i], ex.name, ex, true, blob));
    buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
  };
  const labels = ['Start', 'Ende'];
  const buttons = urls.length > 1
    ? urls.map((_, i) => h('button', { class: 'seg-btn', type: 'button', 'aria-pressed': 'false', onclick: () => show(i) }, labels[i] ?? String(i + 1)))
    : [];
  show(0);
  if (buttons.length) {
    holder.addEventListener('click', () => show(buttons.findIndex((b) => b.getAttribute('aria-pressed') === 'true') === 0 ? 1 : 0));
    root.appendChild(h('div', { class: 'segmented gallery-switch' }, buttons));
  }
  return root;
}
