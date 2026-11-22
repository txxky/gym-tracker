import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildBackup, parseBackup, restoreBackup } from '../src/lib/backup';
import { GymDB } from '../src/lib/db';
import { cleanProfile, getProfile, initials, saveProfile } from '../src/lib/profile';

let d: GymDB;
beforeEach(() => { d = new GymDB(`profile-${Math.random()}`); });

describe('Profil: Bereinigen', () => {
  it('begrenzt Werte und verwirft Unsinn', () => {
    const p = cleanProfile({ username: '  Tom  ', heightCm: 181.6, weightKg: 82.3, birthYear: 1994, gender: 'male', goal: 'Kraft' });
    expect(p).toMatchObject({ username: 'Tom', heightCm: 182, weightKg: 82.5, birthYear: 1994, gender: 'male', goal: 'Kraft' });
    const bad = cleanProfile({ username: 5, heightCm: 5, weightKg: 'x', birthYear: 3000, gender: 'alien', goal: 'x'.repeat(500) });
    expect(bad).toMatchObject({ username: '', heightCm: null, weightKg: null, birthYear: null, gender: null });
    expect(bad.goal).toHaveLength(60);
  });
  it('Initialen: ein oder zwei Wörter, Umlaute, leer', () => {
    expect(initials('tom')).toBe('T');
    expect(initials('  anna  lena meyer')).toBe('AL');
    expect(initials('Özlem')).toBe('Ö');
    expect(initials('   ')).toBe('');
  });
});

describe('Profil: Speichern', () => {
  it('Leeres Profil, Felder einzeln ändern, Foto setzen und entfernen', async () => {
    expect(await getProfile(d)).toMatchObject({ username: '', heightCm: null });
    await saveProfile({ username: 'Tom' }, d);
    await saveProfile({ heightCm: 180 }, d);
    const photo = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
    await saveProfile({ photo }, d);
    let p = await getProfile(d);
    expect(p).toMatchObject({ username: 'Tom', heightCm: 180 });
    expect(p.photo).toBeInstanceOf(Blob);
    await saveProfile({ weightKg: null, photo: undefined }, d);
    p = await getProfile(d);
    expect(p.photo).toBeUndefined();
    expect(p.username).toBe('Tom');
  });
  it('schnelle Änderungen hintereinander überholen sich nicht', async () => {
    await Promise.all([saveProfile({ username: 'A' }, d), saveProfile({ goal: 'Kraft' }, d), saveProfile({ username: 'AB' }, d)]);
    expect(await getProfile(d)).toMatchObject({ username: 'AB', goal: 'Kraft' });
  });
});

describe('Backup Version 2: Profil und Check-ins', () => {
  it('Profil samt Foto geht durch Export und Import', async () => {
    await saveProfile({ username: 'Tom', weightKg: 80, photo: new Blob([new Uint8Array([9, 8, 7, 250])], { type: 'image/jpeg' }) }, d);
    const text = JSON.stringify(await buildBackup(d));
    const parsed = parseBackup(text);
    expect(parsed.ok && parsed.value.version).toBe(2);
    if (!parsed.ok) return;
    const fresh = new GymDB(`p2-${Math.random()}`);
    await restoreBackup(parsed.value, fresh);
    const p = (await fresh.profile.get('me'))!;
    expect(p).toMatchObject({ username: 'Tom', weightKg: 80 });
    expect(new Uint8Array(await p.photo!.arrayBuffer())).toEqual(new Uint8Array([9, 8, 7, 250]));
  });
  it('Version 1 ohne Profil bleibt lesbar und lässt das vorhandene Profil in Ruhe', async () => {
    await saveProfile({ username: 'Bleibt' }, d);
    const parsed = parseBackup('{"format":"gym-tracker-backup","version":1,"sessions":[{"id":1,"startedAt":5,"endedAt":6,"splitId":null,"dayId":null,"dayName":"Push"}]}');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.profile).toBeUndefined();
    expect(parsed.value.sessions[0].type).toBe('full'); // Standardwert für alte Daten
    await restoreBackup(parsed.value, d);
    expect((await getProfile(d)).username).toBe('Bleibt');
    expect(await d.sessions.count()).toBe(1);
  });
  it('profile: null ersetzt (löscht) das Profil', async () => {
    await saveProfile({ username: 'Weg' }, d);
    const parsed = parseBackup('{"format":"gym-tracker-backup","version":2,"profile":null}');
    if (!parsed.ok) throw new Error('parse');
    await restoreBackup(parsed.value, d);
    expect((await getProfile(d)).username).toBe('');
  });
  it('defensiv: Unsinn im Profil, kaputtes Foto, riesiges Foto, falscher Typ', () => {
    const mk = (profile: unknown) => parseBackup(JSON.stringify({ format: 'gym-tracker-backup', version: 2, profile }));
    const a = mk({ username: 123, heightCm: 'x', weightKg: 9999, photo: { type: 'text/html', base64: 'AAAA' } });
    expect(a.ok && a.value.profile).toMatchObject({ username: '', heightCm: null, weightKg: null });
    expect(a.ok && a.value.profile && 'photo' in a.value.profile).toBe(false);
    const b = mk({ username: 'x', photo: { type: 'image/jpeg', base64: '!!!nicht base64!!!' } });
    expect(b.ok && b.value.profile && 'photo' in b.value.profile).toBe(false);
    const c = mk({ username: 'x', photo: { type: 'image/jpeg', base64: 'A'.repeat(3_000_004) } });
    expect(c.ok && c.value.profile && 'photo' in c.value.profile).toBe(false);
    const e = mk('kein objekt');
    expect(e.ok && e.value.profile).toBeNull();
    expect(e.ok && e.dropped).toBe(1);
  });
  it('Check-in-Trainings bleiben erhalten; Sätze an Check-ins werden verworfen', () => {
    const r = parseBackup(JSON.stringify({
      format: 'gym-tracker-backup', version: 2,
      sessions: [{ id: 1, type: 'checkin', startedAt: 1, endedAt: 1, dayName: 'Im Gym' }, { id: 2, type: 'full', startedAt: 2, endedAt: 3, dayName: 'Push' }, { id: 3, type: 'quatsch', startedAt: 4, endedAt: 5, dayName: 'X' }],
      sets: [{ id: 1, sessionId: 1, exerciseId: 'a', kg: 10, reps: 5 }, { id: 2, sessionId: 2, exerciseId: 'a', kg: 10, reps: 5 }],
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sessions.map((s) => s.type)).toEqual(['checkin', 'full', 'full']);
    expect(r.value.sets).toHaveLength(1);
    expect(r.dropped).toBe(1);
  });
});
