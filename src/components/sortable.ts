export interface SortableOptions {
  /** Container, dessen direkte Kinder die sortierbaren Einträge sind */
  list: HTMLElement;
  /** Selektor des Drag-Handles innerhalb eines Eintrags */
  handle: string;
  /** Wird mit alter und neuer Position aufgerufen (nur bei echter Änderung) */
  onMove: (from: number, to: number) => void;
}

const GAP = 8;

/**
 * Drag-and-drop-Sortierung per Pointer Events (Maus und Touch). Der Handle braucht `touch-action: none`.
 * Tastatur: Pfeil hoch/runter auf dem fokussierten Handle verschiebt den Eintrag.
 * Während des Ziehens werden nur Transforms gesetzt; das DOM wird erst nach onMove vom Aufrufer neu gerendert.
 */
export function makeSortable({ list, handle, onMove }: SortableOptions): void {
  const items = () => Array.from(list.children) as HTMLElement[];

  list.addEventListener('keydown', (e) => {
    const h = (e.target as HTMLElement).closest(handle);
    if (!h || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    const row = items().find((i) => i.contains(h));
    if (!row) return;
    const from = items().indexOf(row);
    const to = from + (e.key === 'ArrowUp' ? -1 : 1);
    if (to < 0 || to >= items().length) return;
    e.preventDefault();
    onMove(from, to);
  });

  list.addEventListener('pointerdown', (e) => {
    const grip = (e.target as HTMLElement).closest(handle) as HTMLElement | null;
    if (!grip || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const all = items();
    const found = all.find((i) => i.contains(grip));
    if (!found) return;
    const row: HTMLElement = found;
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);

    const from = all.indexOf(row);
    const startY = e.clientY;
    const scroller = findScroller(list);
    const startScroll = scroller.scrollTop;
    let pointerY = e.clientY;
    let target = from;
    let raf = 0;
    row.classList.add('is-dragging');

    const step = row.offsetHeight + GAP;

    function apply() {
      const dy = pointerY - startY + (scroller.scrollTop - startScroll);
      row.style.transform = `translateY(${dy}px)`;
      // Zielposition anhand der Höhen der Nachbarn bestimmen
      let t = from;
      let acc = 0;
      if (dy > 0) {
        for (let j = from + 1; j < all.length; j++) {
          const hj = all[j].offsetHeight + GAP;
          if (dy > acc + hj / 2) { t = j; acc += hj; } else break;
        }
      } else {
        for (let j = from - 1; j >= 0; j--) {
          const hj = all[j].offsetHeight + GAP;
          if (-dy > acc + hj / 2) { t = j; acc += hj; } else break;
        }
      }
      target = t;
      all.forEach((it, i) => {
        if (it === row) return;
        let shift = 0;
        if (from < target && i > from && i <= target) shift = -step;
        if (from > target && i >= target && i < from) shift = step;
        it.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    }

    function autoscroll() {
      const r = scroller.getBoundingClientRect();
      const edge = 56;
      if (pointerY < r.top + edge) scroller.scrollTop -= 10;
      else if (pointerY > r.bottom - edge) scroller.scrollTop += 10;
      apply();
      raf = requestAnimationFrame(autoscroll);
    }
    raf = requestAnimationFrame(autoscroll);

    const move = (ev: PointerEvent) => { pointerY = ev.clientY; apply(); };
    const end = (ev: PointerEvent) => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', end);
      grip.removeEventListener('pointercancel', end);
      cancelAnimationFrame(raf);
      try { grip.releasePointerCapture(ev.pointerId); } catch { /* schon freigegeben */ }
      all.forEach((it) => { it.style.transform = ''; });
      row.classList.remove('is-dragging');
      if (ev.type !== 'pointercancel' && target !== from) onMove(from, target);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  });
}

function findScroller(el: HTMLElement): HTMLElement {
  let p: HTMLElement | null = el.parentElement;
  while (p) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === 'auto' || oy === 'scroll') return p;
    p = p.parentElement;
  }
  return document.documentElement;
}
