import { h, svg } from '../lib/dom';
import { ICON } from '../lib/icons';
import { exerciseImageUrls } from '../lib/images';
import { muscleLabel } from '../lib/muscles';
import type { Exercise } from '../lib/types';
import { segmented, type Segmented } from './ui';

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
  let shownIndex = 0;
  const labels = ['Start', 'Ende'];
  const seg: Segmented<string> | null = urls.length > 1
    ? segmented({ options: urls.map((_, i): [string, string] => [String(i), labels[i] ?? String(i + 1)]), value: '0', label: 'Bild', onChange: (v) => show(Number(v)) })
    : null;
  function show(i: number) {
    shownIndex = i;
    holder.replaceChildren(lazyImg(urls[i], ex.name, ex, true, blob));
    seg?.setValue(String(i));
  }
  show(0);
  if (seg) {
    holder.addEventListener('click', () => show(shownIndex === 0 ? 1 : 0));
    seg.el.classList.add('gallery-switch');
    root.appendChild(seg.el);
  }
  return root;
}
