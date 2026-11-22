import { paintAvatar } from '../components/avatar';
import { openSheet, toast } from '../components/modal';
import { setHeader } from '../components/shell';
import { Wheel } from '../components/wheel';
import { h, svg } from '../lib/dom';
import { ICON } from '../lib/icons';
import { shrinkPhoto } from '../lib/photo';
import { getProfile, GENDERS, GOAL_SUGGESTIONS, PROFILE_LIMITS, saveProfile } from '../lib/profile';
import type { RouteContext } from '../lib/router';
import type { Gender, Profile } from '../lib/types';

const fmt = (n: number) => String(n).replace('.', ',');

interface NumberField {
  key: 'heightCm' | 'weightKg' | 'birthYear';
  testId: string;
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  start: number;
  format?: (n: number) => string;
  show: (n: number) => string;
}

const FIELDS: NumberField[] = [
  { key: 'heightCm', testId: 'height', label: 'Größe', unit: 'cm', min: PROFILE_LIMITS.height[0], max: PROFILE_LIMITS.height[1], step: 1, start: 175, show: (n) => `${n} cm` },
  { key: 'weightKg', testId: 'weight', label: 'Gewicht', unit: 'kg', min: PROFILE_LIMITS.weight[0], max: PROFILE_LIMITS.weight[1], step: PROFILE_LIMITS.weightStep, start: 75, show: (n) => `${fmt(n)} kg` },
  { key: 'birthYear', testId: 'birth', label: 'Geburtsjahr', min: PROFILE_LIMITS.birthYear[0], max: PROFILE_LIMITS.birthYear[1], step: 1, start: 1995, format: String, show: String },
];

/** Zahlen nur über das Wheel: Tippen auf die Zeile öffnet ein Sheet mit Rad, Speichern und Entfernen. */
function openNumberSheet(f: NumberField, current: number | null, onSaved: () => void): void {
  const sheet = openSheet(f.label);
  const wheel = new Wheel({ label: f.label, min: f.min, max: f.max, step: f.step, value: current ?? f.start, unit: f.unit, format: f.format });
  sheet.body.append(
    h('div', { class: 'wheel-single' }, wheel.el),
    h('button', { class: 'btn btn-primary btn-block', type: 'button', 'data-testid': 'value-save',
      onclick: async () => { await saveProfile({ [f.key]: wheel.value }); sheet.close(); onSaved(); } }, 'Speichern'),
    ...(current !== null
      ? [h('button', { class: 'btn btn-ghost btn-block', type: 'button', 'data-testid': 'value-clear',
        onclick: async () => { await saveProfile({ [f.key]: null }); sheet.close(); onSaved(); } }, 'Angabe entfernen')]
      : []));
}

export async function renderProfile({ root, isCurrent }: RouteContext): Promise<void> {
  setHeader({ title: 'Profil', back: '/training', historyBack: true });
  let p: Profile = await getProfile();
  if (!isCurrent()) return;

  const avatar = h('span', { class: 'avatar avatar-lg', 'data-testid': 'profile-avatar' });
  let avatarUrl: string | null = null;
  const photoInput = h('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: 'profile-photo', 'data-testid': 'profile-photo' });
  const removePhoto = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-testid': 'profile-photo-remove' }, 'Foto entfernen');
  const paintPhoto = () => {
    if (avatarUrl) URL.revokeObjectURL(avatarUrl);
    avatarUrl = paintAvatar(avatar, p, 'lg');
    removePhoto.hidden = !p.photo;
  };
  photoInput.addEventListener('change', async () => {
    const f = photoInput.files?.[0];
    if (!f) return;
    try {
      p = await saveProfile({ photo: await shrinkPhoto(f, 384) });
      paintPhoto();
      toast('Foto gespeichert');
    } catch { toast('Foto konnte nicht gelesen werden'); }
    photoInput.value = '';
  });
  removePhoto.addEventListener('click', async () => { p = await saveProfile({ photo: undefined }); paintPhoto(); });
  paintPhoto();

  const name = h('input', { class: 'input', type: 'text', maxlength: String(PROFILE_LIMITS.usernameMax), placeholder: 'Dein Name', 'aria-label': 'Benutzername', 'data-testid': 'profile-name', autocomplete: 'off' });
  name.value = p.username;
  name.addEventListener('input', () => { void saveProfile({ username: name.value }).then((n) => { p = n; if (!p.photo) paintPhoto(); }); });

  const gender = h('select', { class: 'input', 'aria-label': 'Geschlecht', 'data-testid': 'profile-gender' },
    GENDERS.map(([v, t]) => h('option', { value: v }, t)));
  gender.value = p.gender ?? '';
  gender.addEventListener('change', () => { void saveProfile({ gender: (gender.value || null) as Gender | null }); });

  const goal = h('input', { class: 'input', type: 'text', maxlength: String(PROFILE_LIMITS.goalMax), placeholder: 'z. B. Muskelaufbau', 'aria-label': 'Ziel', 'data-testid': 'profile-goal', autocomplete: 'off' });
  goal.value = p.goal;
  goal.addEventListener('input', () => { void saveProfile({ goal: goal.value }); });
  const chips = GOAL_SUGGESTIONS.map((g) => h('button', { class: 'chip chip-btn', type: 'button', 'data-testid': 'goal-chip',
    onclick: () => { goal.value = g; void saveProfile({ goal: g }); } }, g));

  const rowsEl = h('div', { class: 'list-group' });
  const drawRows = () => {
    rowsEl.replaceChildren(...FIELDS.map((f) => {
      const v = p[f.key];
      return h('button', { class: 'list-row', type: 'button', 'data-testid': `row-${f.testId}`,
        onclick: () => openNumberSheet(f, v, () => { void getProfile().then((n) => { p = n; drawRows(); }); }) },
      h('span', { class: 'list-item-title' }, f.label),
      h('span', { class: v === null ? 'muted profile-value' : 'profile-value', 'data-testid': `value-${f.testId}` }, v === null ? 'Nicht angegeben' : f.show(v)),
      svg(ICON.chevron, 'icon muted'));
    }));
  };
  drawRows();

  root.append(
    h('section', { class: 'profile-head' }, avatar,
      h('div', { class: 'btn-row profile-photo-actions' },
        h('label', { class: 'btn btn-ghost btn-sm', for: 'profile-photo' }, svg(ICON.camera), 'Foto wählen'), removePhoto),
      photoInput),
    h('section', null, h('h2', null, 'Name'), h('div', { class: 'card' }, name)),
    h('section', null, h('h2', null, 'Körper'), rowsEl,
      h('div', { class: 'card profile-gender' }, h('label', { class: 'field', style: 'margin:0' }, h('span', null, 'Geschlecht (optional)'), gender))),
    h('section', null, h('h2', null, 'Ziel'), h('div', { class: 'card' }, goal, h('div', { class: 'chip-row' }, chips))),
    h('p', { class: 'muted small profile-note' }, 'Das Profil bleibt auf diesem Gerät. Es ist nur zum Anpassen da und landet höchstens in deiner Sicherung.'),
  );
}
