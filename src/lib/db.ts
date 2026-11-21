import Dexie, { type Table } from 'dexie';
import type { Exercise, Session, SetLog, SettingRow, Split } from './types';

export class GymDB extends Dexie {
  exercises!: Table<Exercise, string>;
  splits!: Table<Split, string>;
  sessions!: Table<Session, number>;
  sets!: Table<SetLog, number>;
  settings!: Table<SettingRow, string>;

  constructor(name = 'gym-tracker') {
    super(name);
    this.version(1).stores({
      exercises: 'id, name, equipment, custom',
      splits: 'id, templateId',
      sessions: '++id, startedAt',
      sets: '++id, sessionId, exerciseId, ts',
      settings: 'key',
    });
  }
}

export const db = new GymDB();

export async function getSetting<T>(key: string, fallback: T, d: GymDB = db): Promise<T> {
  const row = await d.settings.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setSetting(key: string, value: unknown, d: GymDB = db): Promise<void> {
  await d.settings.put({ key, value });
}
