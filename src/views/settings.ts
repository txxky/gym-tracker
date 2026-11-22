import { Wheel, formatSeconds } from '../components/wheel';
import { toast } from '../components/modal';
import { setHeader } from '../components/shell';
import { db, getSetting, setSetting } from '../lib/db';
import { backupFileName, buildBackup, parseBackup, restoreBackup } from '../lib/backup';
import { h } from '../lib/dom';
import { CHECKIN_ADVANCE_KEY } from '../lib/log';
import { allExercises, invalidateExercises } from '../lib/exercises';
import { pickTextFile, shareOrDownload } from '../lib/files';
import {
  AVG_IMAGE_BYTES, cachedImageCount, collectImageUrls, downloadImages, exerciseImageUrls, formatMB,
} from '../lib/images';
import type { RouteContext } from '../lib/router';
import { segmented, switchRow, type Segmented } from '../components/ui';
import { getThemePref, setThemePref, type ThemePref } from '../lib/theme';

export const DEFAULT_REST_KEY = 'defaultRestSec';
export const DEFAULT_REST_SEC = 90;

const THEMES: Array<[ThemePref, string]> = [['light', 'Hell'], ['dark', 'Dunkel'], ['system', 'System']];

function themeSection(): HTMLElement {
  const ctl: Segmented<ThemePref> = segmented({
    options: THEMES, value: getThemePref(), label: 'Darstellung', testId: 'theme-pref', onChange: (v) => setThemePref(v),
  });
  // Der Umschalter in der oberen Leiste ändert die Wahl ebenfalls
  const sync = () => {
    if (!ctl.el.isConnected) { window.removeEventListener('themechange', sync); return; }
    ctl.setValue(getThemePref());
  };
  window.addEventListener('themechange', sync);
  return h('section', { class: 'card' }, h('h2', null, 'Darstellung'), ctl.el);
}

async function toggleRow(id: string, label: string, key: string, fallback: boolean): Promise<HTMLElement> {
  const checked = await getSetting<boolean>(key, fallback);
  return switchRow({ id, label, checked, onChange: (c) => { void setSetting(key, c); } }).el;
}

async function trainingSection(): Promise<HTMLElement> {
  const rest = await getSetting<number>(DEFAULT_REST_KEY, DEFAULT_REST_SEC);
  const wheel = new Wheel({
    label: 'Standard-Pause', min: 15, max: 600, step: 15, value: rest, format: formatSeconds, unit: 'min',
    onChange: (v) => { void setSetting(DEFAULT_REST_KEY, v); },
  });
  const rpe = await toggleRow('use-rpe', 'RPE-Rad beim Loggen anzeigen', 'useRpe', false);
  const auto = await toggleRow('rest-auto', 'Pausentimer nach jedem Satz starten', 'restAuto', true);
  const checkin = await toggleRow('checkin-advance-default', 'Check-in ("Ich war im Gym") rückt den Zyklus standardmäßig weiter', CHECKIN_ADVANCE_KEY, true);
  const sound = await toggleRow('rest-sound', 'Ton am Pausenende (zusätzlich zur Vibration)', 'restSound', false);
  return h('section', { class: 'card' }, h('h2', null, 'Training'), rpe, auto, sound, checkin,
    h('p', { class: 'muted' }, 'Pausenzeit, die neue Übungen im Builder vorgeschlagen bekommen.'), wheel.el,
    h('p', { class: 'muted small' }, 'Der Timer läuft mit Zeitstempel und stimmt auch, wenn das Handy kurz sperrt. Vibration und Ton klappen nur bei geöffneter App; iPhones vibrieren nicht.'));
}

function imagesSection(): HTMLElement {
  const status = h('p', { class: 'muted', 'aria-live': 'polite', 'data-testid': 'img-status' }, 'Lade Status …');
  const bar = h('progress', { class: 'bar', max: '100', value: '0', hidden: true });
  const cancelBtn = h('button', { class: 'btn btn-ghost', type: 'button', hidden: true }, 'Abbrechen');
  const allBtn = h('button', { class: 'btn btn-primary btn-block', type: 'button', 'data-testid': 'dl-all' }, 'Alle Bilder offline speichern');
  const mineBtn = h('button', { class: 'btn btn-ghost btn-block', type: 'button', 'data-testid': 'dl-mine' }, 'Nur Bilder meiner Splits speichern');
  let ctrl: AbortController | null = null;

  async function refreshStatus(total?: number) {
    const [n, all] = await Promise.all([cachedImageCount(), allExercises()]);
    const t = total ?? collectImageUrls(all).length;
    status.textContent = `${n} von ${t} Bildern offline gespeichert.`;
  }

  async function run(urls: string[]) {
    if (!urls.length) { toast('Keine Bilder zu laden'); return; }
    ctrl = new AbortController();
    [allBtn, mineBtn].forEach((b) => b.setAttribute('disabled', ''));
    bar.hidden = false; cancelBtn.hidden = false;
    const res = await downloadImages(urls, (p) => {
      bar.value = Math.round((p.done / p.total) * 100);
      status.textContent = `${p.done} von ${p.total} Bildern${p.failed ? ` (${p.failed} Fehler)` : ''} …`;
    }, ctrl.signal);
    bar.hidden = true; cancelBtn.hidden = true;
    [allBtn, mineBtn].forEach((b) => b.removeAttribute('disabled'));
    if (res.quotaExceeded) toast('Speicher voll. Bitte Platz schaffen und erneut versuchen.');
    else if (ctrl.signal.aborted) toast('Abgebrochen');
    else if (res.failed) toast(`${res.failed} Bilder fehlgeschlagen. Später erneut versuchen.`);
    else toast('Alle Bilder gespeichert');
    ctrl = null;
    await refreshStatus();
  }

  allBtn.addEventListener('click', async () => {
    const urls = collectImageUrls(await allExercises());
    const mb = formatMB(urls.length * AVG_IMAGE_BYTES);
    if (!confirm(`${urls.length} Bilder, ca. ${mb}. Am besten im WLAN. Fortfahren?`)) return;
    await run(urls);
  });
  mineBtn.addEventListener('click', async () => {
    const [splits, all] = await Promise.all([db.splits.toArray(), allExercises()]);
    const ids = new Set(splits.flatMap((s) => s.days.flatMap((d) => d.exercises.map((e) => e.exerciseId))));
    await run(all.filter((e) => ids.has(e.id) && !e.custom).flatMap(exerciseImageUrls));
  });
  cancelBtn.addEventListener('click', () => ctrl?.abort());
  void refreshStatus();

  return h('section', { class: 'card' }, h('h2', null, 'Offline-Bilder'),
    h('p', { class: 'muted' }, 'Bilder werden beim ersten Ansehen automatisch gespeichert. Hier kannst du sie vorab laden.'),
    status, bar, allBtn, mineBtn, cancelBtn);
}

function dataSection(): HTMLElement {
  const exportBtn = h('button', { class: 'btn btn-ghost btn-block', type: 'button', 'data-testid': 'export-all' }, 'Alle Daten exportieren');
  const importBtn = h('button', { class: 'btn btn-ghost btn-block', type: 'button', 'data-testid': 'import-all' }, 'Daten importieren');
  exportBtn.addEventListener('click', async () => {
    const text = JSON.stringify(await buildBackup());
    const r = await shareOrDownload(backupFileName(), text);
    if (r === 'downloaded') toast('Sicherung gespeichert');
  });
  importBtn.addEventListener('click', async () => {
    const text = await pickTextFile();
    if (text === null) return;
    const parsed = parseBackup(text);
    if (!parsed.ok) { toast(parsed.error); return; }
    const v = parsed.value;
    const msg = `Das ersetzt ALLE Daten auf diesem Gerät durch: ${v.sessions.length} Trainings, ${v.sets.length} Sätze, ${v.splits.length} Splits, ${v.customExercises.length} eigene Übungen.`
      + (parsed.dropped ? `\n${parsed.dropped} beschädigte Einträge werden übersprungen.` : '') + '\n\nTipp: Exportiere vorher eine Sicherung. Fortfahren?';
    if (!confirm(msg)) return;
    try {
      const res = await restoreBackup(v);
      invalidateExercises();
      toast(`Wiederhergestellt: ${res.sessions} Trainings, ${res.sets} Sätze`);
      setTimeout(() => { location.hash = '/training'; location.reload(); }, 900);
    } catch {
      toast('Import fehlgeschlagen. Deine bisherigen Daten sind unverändert.');
    }
  });
  return h('section', { class: 'card' }, h('h2', null, 'Daten'),
    h('p', { class: 'muted' }, 'Sicherung aller Splits, Trainings, Sätze, eigenen Übungen und Einstellungen als eine JSON-Datei. Nützlich als Backup oder zum Umzug aufs neue Handy.'),
    exportBtn, importBtn);
}

function aboutSection(): HTMLElement {
  return h('section', { class: 'card' }, h('h2', null, 'Info'),
    h('p', { class: 'muted' }, 'Alle Daten bleiben auf diesem Gerät (IndexedDB). Kein Account, keine Cloud.'),
    h('p', { class: 'muted small' }, 'Übungsdaten und Bilder: free-exercise-db (Unlicense). Weitere Lizenzen und Quellen stehen in der README im Repository.'));
}

export async function renderSettings({ root }: RouteContext): Promise<void> {
  setHeader({ title: 'Einstellungen' });
  root.append(themeSection(), await trainingSection(), imagesSection(), dataSection(), aboutSection());
}
