import { h, svg } from '../lib/dom';
import { ICON } from '../lib/icons';
import { initials } from '../lib/profile';
import type { Profile } from '../lib/types';

/** Avatar-Inhalt: Foto, sonst Initialen, sonst Personen-Symbol. Gibt die Object-URL zurück (zum Freigeben). */
export function paintAvatar(el: HTMLElement, p: Profile, size: 'sm' | 'lg' = 'sm'): string | null {
  el.className = size === 'lg' ? 'avatar avatar-lg' : 'avatar';
  el.replaceChildren();
  if (p.photo) {
    const url = URL.createObjectURL(p.photo);
    el.appendChild(h('img', { src: url, alt: '' }));
    return url;
  }
  const ini = initials(p.username);
  if (ini) el.append(ini);
  else el.appendChild(svg(ICON.person));
  return null;
}
