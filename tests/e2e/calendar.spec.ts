import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://raw.githubusercontent.com/**', (r) => r.abort());
});

/** Trainings direkt in IndexedDB anlegen. day = Tag des aktuellen Monats (lokal). */
async function seed(page: Page, rows: Array<{ day: number; type: 'full' | 'checkin'; name: string }>) {
  await page.goto('./');
  await expect(page.getByTestId('tab-training')).toBeVisible();
  await page.evaluate(async (rows) => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('gym-tracker'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const add = (store: string, v: unknown): Promise<number> => new Promise((res, rej) => {
      const tx = db.transaction(store, 'readwrite'); const rq = tx.objectStore(store).add(v);
      tx.oncomplete = () => res(rq.result as number); tx.onerror = () => rej(tx.error);
    });
    const now = new Date();
    for (const r of rows) {
      const t = new Date(now.getFullYear(), now.getMonth(), r.day, 18, 30).getTime();
      const id = await add('sessions', { type: r.type, startedAt: t, endedAt: t + 3_600_000, splitId: null, dayId: null, dayName: r.name });
      if (r.type === 'full') {
        await add('sets', { sessionId: id, exerciseId: 'bench', exerciseName: 'Bankdrücken', setIndex: 1, kg: 60, reps: 8, rpe: null, ts: t });
        await add('sets', { sessionId: id, exerciseId: 'bench', exerciseName: 'Bankdrücken', setIndex: 2, kg: 62.5, reps: 6, rpe: null, ts: t + 1000 });
      }
    }
    db.close();
  }, rows);
}

const todayNum = () => new Date().getDate();
const cell = (page: Page, day: number) => page.locator('.cal-day:not(.is-out)').nth(day - 1);

test('Kalender per Shortcut in der Leiste; ohne Daten: Monatsgitter, Wochenstart Montag, heute hervorgehoben, freundlicher Leerzustand', async ({ page }) => {
  await page.goto('./#/training');
  await page.getByTestId('open-calendar').click();
  await expect(page).toHaveURL(/#\/calendar$/);
  await expect(page.getByRole('heading', { name: 'Kalender', level: 1 })).toBeVisible();
  await expect(page.getByTestId('cal-month')).toBeVisible();
  // Wochenkopf beginnt mit Mo und das Gitter mit einem Montag
  await expect(page.locator('.cal-weekdays span').first()).toHaveText('Mo');
  await expect(page.locator('.cal-weekdays span').last()).toHaveText('So');
  const firstIsMonday = await page.locator('.cal-day').first().evaluate((el) => {
    const [y, m, d] = (el as HTMLElement).dataset.key!.split('-').map(Number);
    return new Date(y, m - 1, d).getDay();
  });
  expect(firstIsMonday).toBe(1);
  const n = await page.locator('.cal-day').count();
  expect(n % 7).toBe(0);
  await expect(page.locator('.cal-day.is-today')).toHaveCount(1);
  await expect(page.locator('.cal-day.is-today .cal-num')).toHaveText(String(todayNum()));
  // Heute ist deutlich hervorgehoben (farbiger Ring)
  expect(await page.locator('.cal-day.is-today .cal-num').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  await expect(page.getByTestId('cal-empty')).toBeVisible();
  await expect(page.getByTestId('cal-empty')).toContainText('nicht im Gym');
  // Die Kalender-Verknüpfung steht nicht mehr da, wenn man schon im Kalender ist (Zurück-Pfeil statt Avatar)
  await expect(page.getByTestId('open-calendar')).toHaveCount(0);
  await page.getByTestId('back').click();
  await expect(page).toHaveURL(/#\/training$/);
});

test('Trainingstage und Check-ins sind markiert, Antippen zeigt Details, Check-in und Training bleiben getrennt', async ({ page }) => {
  const d = todayNum();
  const other = d === 1 ? 2 : 1;
  await seed(page, [{ day: d, type: 'full', name: 'Push' }, { day: other, type: 'checkin', name: 'Im Gym' }]);
  await page.goto('./#/calendar');
  await expect(cell(page, d)).toHaveClass(/is-full/);
  await expect(cell(page, d)).toHaveClass(/is-today/);
  await expect(cell(page, other)).toHaveClass(/is-checkin/);
  await expect(cell(page, other)).not.toHaveClass(/is-full/);
  // Heute ist vorausgewählt: Details mit Übung und Sätzen
  await expect(page.getByTestId('cal-session')).toContainText('Push');
  await expect(page.getByTestId('cal-session')).toContainText('Bankdrücken');
  await expect(page.getByTestId('cal-session')).toContainText('60 kg × 8');
  await expect(page.getByTestId('cal-session')).toContainText('2 Sätze');
  // Check-in antippen
  await cell(page, other).click();
  await expect(cell(page, other)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('cal-checkin')).toContainText('Im Gym gewesen');
  await expect(page.getByTestId('cal-session')).toHaveCount(0);
  await expect(cell(page, other)).toHaveAttribute('aria-label', /im Gym gewesen/);
  // Leerer Tag
  const empty = [1, 2, 3, 4, 5, 6, 7, 8].find((x) => x !== d && x !== other)!;
  await cell(page, empty).click();
  await expect(page.getByTestId('cal-empty')).toBeVisible();
  // Check-ins zählen nirgends als Training im Fortschritt
  await page.goto('./#/progress');
  await expect(page.getByTestId('progress-empty')).not.toBeVisible(); // das volle Training zählt
  await expect(page.getByTestId('summary')).toContainText('1 Trainingstage');
});

test('Navigation: Vor/Zurück mit Animation, Heute-Button, Monatsnamen', async ({ page }) => {
  await page.goto('./#/calendar');
  const title = page.getByTestId('cal-title');
  const now = new Date();
  const name = (d: Date) => d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  await expect(title).toHaveText(name(now));
  await page.getByTestId('cal-next').click();
  await expect(title).toHaveText(name(new Date(now.getFullYear(), now.getMonth() + 1, 1)));
  await expect(page.locator('.cal-day.is-today')).toHaveCount(0);
  await page.getByTestId('cal-prev').click();
  await page.getByTestId('cal-prev').click();
  await expect(title).toHaveText(name(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
  await page.getByTestId('cal-today').click();
  await expect(title).toHaveText(name(now));
  await expect(page.locator('.cal-day.is-today')).toHaveCount(1);
  // Tag in einem Nachbarmonat antippen springt dorthin
  await page.locator('.cal-day.is-out').last().click();
  await expect(title).toHaveText(name(new Date(now.getFullYear(), now.getMonth() + 1, 1)));
});

test('Monatswechsel gleitet (transform/opacity-Animation läuft)', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'no-preference', viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.route('https://raw.githubusercontent.com/**', (r) => r.abort());
  await page.goto('http://localhost:4173/#/calendar');
  await page.getByTestId('cal-next').click();
  const view = page.locator('.cal-stage > *').first();
  await expect(view).toHaveClass(/slide-next/);
  const props = await view.evaluate((el) => el.getAnimations().flatMap((a) => (a as CSSAnimation).animationName));
  expect(props).toContain('cal-next');
  await ctx.close();
});

test('Ansichten Tag, Monat, Jahr über die Leiste; Jahr zeigt 12 Monate, Antippen öffnet den Monat; Ansicht bleibt gemerkt', async ({ page }) => {
  const d = todayNum();
  await seed(page, [{ day: d, type: 'full', name: 'Push' }]);
  await page.goto('./#/calendar');
  const seg = page.locator('.segmented');
  await page.getByTestId('cal-mode-year').click();
  await expect(seg).toHaveCSS('--seg-i', '2');
  await expect(page.getByTestId('cal-year')).toBeVisible();
  await expect(page.getByTestId('cal-month-tile')).toHaveCount(12);
  await expect(page.getByTestId('cal-title')).toHaveText(String(new Date().getFullYear()));
  const m = new Date().getMonth();
  await expect(page.getByTestId('cal-month-tile').nth(m)).toHaveAttribute('aria-label', /1 Trainingstage/);
  await expect(page.getByTestId('cal-month-tile').nth(m).locator('.mini-dot.is-full')).toHaveCount(1);
  await expect(page.getByTestId('cal-month-tile').nth(m).locator('.mini-dot.is-today')).toHaveCount(1);
  await page.getByTestId('cal-month-tile').nth((m + 1) % 12 === 0 ? 0 : m).click();
  await expect(page.getByTestId('cal-month')).toBeVisible();
  await expect(seg).toHaveCSS('--seg-i', '1');

  await page.getByTestId('cal-mode-day').click();
  await expect(page.getByTestId('cal-dayview')).toBeVisible();
  await expect(page.getByTestId('cal-detail-title')).toBeVisible();
  const before = await page.getByTestId('cal-title').innerText();
  await page.getByTestId('cal-prev').click();
  await expect(page.getByTestId('cal-title')).not.toHaveText(before);
  await page.getByTestId('cal-today').click();
  await expect(page.getByTestId('cal-title')).toHaveText(before);
  await expect(page.getByTestId('cal-session')).toContainText('Push');
  await page.reload();
  await expect(page.getByTestId('cal-dayview')).toBeVisible(); // Ansicht gemerkt
});

test('Touch-Ziele >= 44 px und kein Überlauf auf 320 px, Wischen blättert', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('./#/calendar');
  for (const id of ['cal-prev', 'cal-next', 'cal-today']) expect((await page.getByTestId(id).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  for (const id of ['cal-prev', 'cal-next']) expect((await page.getByTestId(id).boundingBox())!.width).toBeGreaterThanOrEqual(44);
  const c = (await page.locator('.cal-day').first().boundingBox())!;
  expect(c.height).toBeGreaterThanOrEqual(44);
  expect(c.width).toBeGreaterThanOrEqual(36);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const title0 = await page.getByTestId('cal-title').innerText();
  const box = (await page.locator('.cal-grid').boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width - 20, y }] });
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width - 20 - i * 25, y }] }); await page.waitForTimeout(12); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByTestId('cal-title')).not.toHaveText(title0);
});
