import templates from '../data/splits.json';
import { db, getSetting, setSetting, type GymDB } from './db';
import { splitFromTemplate, type SplitTemplate } from './split-logic';
import type { Split } from './types';

export const TEMPLATES = templates as SplitTemplate[];
const ACTIVE_KEY = 'activeSplitId';

/** Kopiert fehlende mitgelieferte Vorlagen in die DB. Bereits vorhandene (auch bearbeitete) bleiben unberührt. */
export async function ensureSplitsSeeded(d: GymDB = db): Promise<void> {
  const have = new Set((await d.splits.toCollection().primaryKeys()) as string[]);
  const missing = TEMPLATES.filter((t) => !have.has(`tpl-${t.id}`));
  if (missing.length) await d.splits.bulkPut(missing.map((t) => splitFromTemplate(t)));
}

export async function listSplits(d: GymDB = db): Promise<Split[]> {
  return d.splits.toArray();
}

export async function getSplit(id: string, d: GymDB = db): Promise<Split | undefined> {
  return d.splits.get(id);
}

export async function saveSplit(s: Split, d: GymDB = db): Promise<void> {
  await d.splits.put(s);
}

/** Mitgelieferte Vorlagen lassen sich nicht löschen, nur zurücksetzen. */
export async function deleteSplit(id: string, d: GymDB = db): Promise<boolean> {
  const s = await d.splits.get(id);
  if (!s || s.builtin) return false;
  await d.splits.delete(id);
  if ((await getActiveSplitId(d)) === id) await setSetting(ACTIVE_KEY, null, d);
  return true;
}

export async function getActiveSplitId(d: GymDB = db): Promise<string | null> {
  return getSetting<string | null>(ACTIVE_KEY, null, d);
}

export async function getActiveSplit(d: GymDB = db): Promise<Split | undefined> {
  const id = await getActiveSplitId(d);
  return id ? d.splits.get(id) : undefined;
}

export async function setActiveSplit(id: string, d: GymDB = db): Promise<void> {
  await setSetting(ACTIVE_KEY, id, d);
}

/** Setzt eine mitgelieferte Vorlage auf den Originalzustand zurück (Tage, Fokus, Name; Übungen entfallen). */
export async function resetBuiltin(id: string, d: GymDB = db): Promise<Split | undefined> {
  const cur = await d.splits.get(id);
  const tpl = cur?.templateId ? TEMPLATES.find((t) => t.id === cur.templateId) : undefined;
  if (!cur || !cur.builtin || !tpl) return undefined;
  const fresh = { ...splitFromTemplate(tpl), createdAt: cur.createdAt };
  await d.splits.put(fresh);
  return fresh;
}
