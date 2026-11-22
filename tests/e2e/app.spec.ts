import { expect, test, type Page } from '@playwright/test';

/** Echte Touch-Geste über CDP: Finger setzt auf, zieht |yDistance| px (negativ = nach oben) und hebt ab. */
async function swipe(page: Page, selector: string, yDistance: number) {
  const box = (await page.locator(selector).boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  let y = box.y + box.height / 2 - Math.sign(yDistance) * 60;
  const steps = 10;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 0; i < steps; i++) {
    y += yDistance / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

// Bilder kommen von GitHub; im Test nicht nötig, Fehler -> Platzhalter ist ein erlaubter Pfad.
test.beforeEach(async ({ page }) => {
  await page.route('https://raw.githubusercontent.com/**', (r) => r.abort());
});

test('Start: vier Tabs, Training ist Standard, Touch-Ziele >= 44 px', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('tab-training')).toHaveAttribute('aria-current', 'page');
  for (const t of ['training', 'splits', 'progress', 'settings']) {
    const box = (await page.getByTestId(`tab-${t}`).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByRole('heading', { name: 'Noch kein aktiver Split' })).toBeVisible();
});

test('Theme: gespeicherte Wahl gilt schon vor dem ersten Paint, Umschalter wechselt', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('gt-theme', 'dark'));
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(0, 0, 0)');
  // meta theme-color zieht mit
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', /^#000(000)?$/);
  // Zyklus: dunkel -> system -> hell
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme-pref', 'system');
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f2f2f7');
});

test('Theme: Standard ist System und folgt der Systemeinstellung', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4173/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme-pref', 'system');
  await ctx.close();
});

test('Wheel per Touch: wischen ändert den Wert, rastet ein, wird gespeichert', async ({ page }) => {
  await page.goto('./#/settings');
  const wheel = page.getByRole('spinbutton', { name: 'Standard-Pause' });
  await expect(wheel).toHaveAttribute('aria-valuenow', '90');
  await expect(wheel.locator('.wheel-item.is-selected')).toHaveText('1:30');

  await swipe(page, '.wheel-scroll', -176); // ca. 4 Einträge nach oben
  await expect.poll(async () => Number(await wheel.getAttribute('aria-valuenow'))).toBeGreaterThan(90);

  // eingerastet: scrollTop ist ein Vielfaches der Item-Höhe
  await expect.poll(async () =>
    page.locator('.wheel-scroll').evaluate((el) => el.scrollTop % 44)).toBe(0);

  const value = await wheel.getAttribute('aria-valuenow');
  await page.reload();
  await expect(page.getByRole('spinbutton', { name: 'Standard-Pause' })).toHaveAttribute('aria-valuenow', value!);
  // Startposition stimmt auch visuell: ausgewähltes Item liegt im Auswahlband
  const sel = (await page.locator('.wheel-item.is-selected').boundingBox())!;
  const band = (await page.locator('.wheel-band').boundingBox())!;
  expect(Math.abs(sel.y + sel.height / 2 - (band.y + band.height / 2))).toBeLessThan(2);
});

test('Wheel: Tastatur funktioniert (Pfeile, Home)', async ({ page }) => {
  await page.goto('./#/settings');
  const wheel = page.getByRole('spinbutton', { name: 'Standard-Pause' });
  await wheel.focus();
  await page.keyboard.press('ArrowDown');
  await expect(wheel).toHaveAttribute('aria-valuenow', '105');
  await page.keyboard.press('Home');
  await expect(wheel).toHaveAttribute('aria-valuenow', '15');
});

test('Übungssuche: Filter, Platzhalter ohne Bild, eigene Übung', async ({ page }) => {
  await page.goto('./#/splits');
  await page.getByTestId('open-exercises').click();
  await expect(page.getByText('876 Übungen', { exact: true })).toBeVisible();

  await page.getByTestId('search').fill('kettlebell halo');
  await expect(page.getByTestId('exercise-row')).toHaveCount(2);
  await expect(page.getByTestId('exercise-row').first().getByTestId('img-placeholder')).toBeVisible();

  await page.getByTestId('search').fill('');
  await page.getByRole('button', { name: 'Brust', exact: true }).click();
  await expect(page.getByText('84 Übungen')).toBeVisible();
  await page.getByTestId('filter-equipment').selectOption('dumbbell');
  await expect(page.getByTestId('exercise-row').first()).toBeVisible();

  await page.getByTestId('add-custom').click();
  await page.getByTestId('custom-name').fill('Meine Testübung');
  await page.getByTestId('custom-muscle').selectOption('chest');
  await page.getByTestId('custom-save').click();
  // Filter sind zurückgesetzt, die neue Übung steht direkt in der Liste
  await expect(page.getByTestId('search')).toHaveValue('Meine Testübung');
  await expect(page.getByTestId('exercise-row')).toHaveCount(1);
  await expect(page.getByTestId('exercise-row')).toContainText('Eigen');
});

test('Übungsdetail zeigt Muskeln auf Deutsch', async ({ page }) => {
  await page.goto('./#/splits');
  await page.getByTestId('open-exercises').click();
  await page.getByTestId('search').fill('barbell bench press - medium grip');
  await expect(page.getByTestId('exercise-row')).toHaveCount(2);
  await page.getByTestId('exercise-row').first().click();
  const detail = page.getByRole('dialog').last();
  await expect(detail.getByRole('heading', { name: 'Barbell Bench Press - Medium Grip' })).toBeVisible();
  await expect(detail.locator('.chip-accent', { hasText: 'Brust' })).toBeVisible();
  await expect(detail.getByText('Langhantel')).toBeVisible();
  await expect(detail.getByTestId('gallery')).toBeVisible();
});

test('Offline: nach dem ersten Laden startet die App ohne Netz', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  // warten, bis der Service Worker die Seite kontrolliert
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('tab-splits')).toBeVisible();
  await page.getByTestId('tab-splits').click();
  await page.getByTestId('open-exercises').click();
  await expect(page.getByText('876 Übungen', { exact: true })).toBeVisible();
});
