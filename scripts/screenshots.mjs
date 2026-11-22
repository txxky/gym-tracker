// Screenshots für die Design-Prüfung (hell/dunkel, 390 und 320 px Breite).
// Nutzung: npm run build && npx vite preview --port 4174 &  dann
//   PW_CHROMIUM=<pfad> node scripts/screenshots.mjs <ausgabeordner> [szene,szene,...]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'screenshots';
const only = process.argv[3]?.split(',');
const BASE = process.env.BASE_URL ?? 'http://localhost:4174/';
mkdirSync(OUT, { recursive: true });

const DAY = 86_400_000;
const BENCH = ['Barbell_Bench_Press_-_Medium_Grip', 'Barbell Bench Press - Medium Grip'];
const SQUAT = ['Barbell_Squat', 'Barbell Squat'];
const ROW = ['Seated_Cable_Rows', 'Seated Cable Rows'];

/** Legt Split, Trainings, Check-ins und Profil direkt in IndexedDB an (so wie die App speichert). */
async function seed(page) {
  await page.evaluate(async ({ DAY, BENCH, SQUAT, ROW }) => {
    const open = () => new Promise((res, rej) => { const r = indexedDB.open('gym-tracker'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const db = await open();
    const run = (store, fn) => new Promise((res, rej) => {
      const tx = db.transaction(store, 'readwrite'); const rq = fn(tx.objectStore(store));
      tx.oncomplete = () => res(rq?.result); tx.onerror = () => rej(tx.error);
    });
    let split;
    for (let i = 0; i < 50 && !split; i++) { split = await run('splits', (s) => s.get('tpl-ul-2')); if (!split) await new Promise((r) => setTimeout(r, 100)); }
    split.days[0].exercises = [BENCH, ROW].map((e) => ({ exerciseId: e[0], sets: 3, repMin: 6, repMax: 10, restSec: 90 }));
    split.days[1].exercises = [SQUAT].map((e) => ({ exerciseId: e[0], sets: 3, repMin: 5, repMax: 8, restSec: 120 }));
    await run('splits', (s) => s.put(split));
    await run('settings', (s) => s.put({ key: 'activeSplitId', value: 'tpl-ul-2' }));
    const now = Date.now();
    const rows = [];
    for (let i = 1; i <= 70; i += 2) rows.push({ ago: i + (i % 3), name: i % 4 === 1 ? 'Lower' : 'Upper' });
    rows.sort((a, b) => b.ago - a.ago);
    let n = 0;
    for (const r of rows) {
      const startedAt = now - r.ago * DAY; n++;
      const lower = r.name === 'Lower';
      const sid = await run('sessions', (s) => s.add({ startedAt, endedAt: startedAt + 3_600_000, splitId: 'tpl-ul-2', dayId: split.days[lower ? 1 : 0].id, dayName: r.name, type: 'full' }));
      const ex = lower ? [SQUAT] : [BENCH, ROW];
      let k = 0;
      for (const e of ex) for (let s = 0; s < 3; s++) {
        await run('sets', (st) => st.add({ sessionId: sid, exerciseId: e[0], exerciseName: e[1], setIndex: s + 1, kg: (lower ? 90 : 60) + n * 1.25 + s * 2.5, reps: 8 - s, rpe: null, ts: startedAt + ++k * 1000 }));
      }
    }
    // Check-ins (nur im Gym gewesen)
    if (db.objectStoreNames.contains('sessions')) {
      for (const ago of [0, 2, 9, 17, 30]) {
        const t = now - ago * DAY;
        await run('sessions', (s) => s.add({ startedAt: t, endedAt: t, splitId: null, dayId: null, dayName: 'Im Gym', type: 'checkin' }));
      }
    }
    if (db.objectStoreNames.contains('profile')) {
      await run('profile', (s) => s.put({ id: 'me', username: 'Tom', heightCm: 182, weightKg: 82.5, birthYear: 1994, gender: 'male', goal: 'Muskelaufbau', updatedAt: now }));
    }
    db.close();
  }, { DAY, BENCH, SQUAT, ROW });
}

const SCENES = {
  training: { path: '#/training' },
  splits: { path: '#/splits' },
  'splits-scrolled': { path: '#/splits', scroll: 220 },
  progress: { path: '#/progress' },
  settings: { path: '#/settings' },
  history: { path: '#/history' },
  calendar: { path: '#/calendar' },
  profile: { path: '#/profile' },
  log: { path: '#/training', act: async (p) => { await p.getByTestId('start').click(); await p.waitForTimeout(600); } },
  'sheet-picker': { path: '#/splits', act: async (p) => { await p.getByTestId('open-exercises').click(); await p.waitForTimeout(700); } },
  'sheet-checkin': { path: '#/training', act: async (p) => { await p.getByTestId('checkin').click(); await p.waitForTimeout(700); } },
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
for (const theme of ['light', 'dark']) {
  for (const width of [390, 320]) {
    const ctx = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce',
      timezoneId: 'Europe/Berlin', locale: 'de-DE',
    });
    await ctx.addInitScript((t) => localStorage.setItem('gt-theme', t), theme);
    const page = await ctx.newPage();
    await page.route('https://raw.githubusercontent.com/**', (r) => r.abort());
    await page.goto(BASE);
    await page.getByTestId('tab-training').waitFor();
    await seed(page);
    for (const [name, sc] of Object.entries(SCENES)) {
      if (only && !only.includes(name)) continue;
      await page.goto(BASE + sc.path);
      await page.reload();
      await page.getByTestId('tab-training').waitFor();
      await page.waitForTimeout(500);
      try { await sc.act?.(page); } catch (e) { console.log(`skip ${name}: ${String(e).split('\n')[0]}`); continue; }
      if (sc.scroll) { await page.getByTestId('scroller').evaluate((el, y) => { el.scrollTop = y; }, sc.scroll); await page.waitForTimeout(400); }
      await page.screenshot({ path: `${OUT}/${name}-${theme}-${width}.png` });
    }
    await ctx.close();
  }
}
await browser.close();
console.log('fertig:', OUT);
