import { expect, test, type Page } from '@playwright/test';

// Hier laufen die Animationen wirklich (die übrigen Tests laufen mit reduzierter Bewegung).
test.use({ reducedMotion: 'no-preference' });

test.beforeEach(async ({ page }) => {
  await page.route('https://raw.githubusercontent.com/**', (r) => r.abort());
});

const css = (page: Page, sel: string, prop: string) => page.locator(sel).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

/** Wischgeste per CDP (echte Touch-Events). */
async function swipeDown(page: Page, x: number, y: number, dy: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dy * i) / 10 }] });
    await page.waitForTimeout(12);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('Segmented Control: der Daumen gleitet (transform), aria-pressed und Index stimmen', async ({ page }) => {
  await page.goto('./#/settings');
  const seg = page.locator('.segmented').first();
  await expect(seg).toHaveClass(/is-ready/);
  const thumb = seg.locator('.seg-thumb');
  // Start: "System" = dritter Eintrag, der Daumen sitzt schon dort (kein Gleiten beim Aufbau)
  await expect(seg).toHaveCSS('--seg-i', '2');
  expect(await thumb.evaluate((el) => el.getAnimations().length)).toBe(0);
  await page.getByTestId('theme-pref-dark').click();
  // Es läuft eine Transition auf dem Daumen (kein harter Sprung)
  expect(await thumb.evaluate((el) => el.getAnimations().length)).toBeGreaterThan(0);
  await expect(page.getByTestId('theme-pref-dark')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('theme-pref-light')).toHaveAttribute('aria-pressed', 'false');
  await expect(seg).toHaveCSS('--seg-i', '1');
  await expect.poll(async () => {
    const m = /matrix\(1, 0, 0, 1, ([\d.]+), 0\)/.exec(await thumb.evaluate((el) => getComputedStyle(el).transform));
    const w = (await seg.boundingBox())!.width;
    return m ? Math.abs(Number(m[1]) - (w - 4) / 3) < 1 : false;
  }).toBe(true);
  // Daumen und Knöpfe sind Touch-Ziele >= 44 px
  for (const b of await seg.locator('.seg-btn').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // Der Umschalter in der oberen Leiste zieht den Daumen mit
  await page.getByTestId('theme-toggle').click();
  await expect(seg).toHaveCSS('--seg-i', '2'); // dark -> system ist wieder Index 2
});

test('Schalter: iOS-Toggle gleitet, ganze Zeile ist Touch-Ziel, Wert bleibt', async ({ page }) => {
  await page.goto('./#/settings');
  const input = page.getByTestId('use-rpe');
  const knob = page.locator('.switch-row').filter({ hasText: 'RPE-Rad' }).locator('.switch-track');
  const row = page.locator('.switch-row').filter({ hasText: 'RPE-Rad' });
  expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(input).not.toBeChecked();
  await row.click(); // auf die Beschriftung tippen schaltet um
  await expect(input).toBeChecked();
  expect(await knob.evaluate((el) => getComputedStyle(el, '::after').transitionProperty)).toContain('transform');
  await page.reload();
  await expect(page.getByTestId('use-rpe')).toBeChecked();
  // Tastatur: Leertaste
  await page.getByTestId('use-rpe').focus();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('use-rpe')).not.toBeChecked();
});

test('Material: obere Leiste (eingeklappt), Tab-Leiste und Sheet haben backdrop-filter mit Blur', async ({ page }) => {
  await page.goto('./#/splits');
  expect(await css(page, '.tabbar', 'backdrop-filter')).toContain('blur(20px)');
  expect(await css(page, '.tabbar', 'backdrop-filter')).toMatch(/saturate\((180%|1\.8)\)/);
  expect(await css(page, '.app-header-bg', 'backdrop-filter')).toContain('blur(20px)');
  await page.getByTestId('open-exercises').click();
  expect(await css(page, '.sheet', 'backdrop-filter')).toContain('blur(20px)');
});

test('Press-Zustand: leicht skaliert beim Drücken, federt zurück; Hover nur mit Maus', async ({ page }) => {
  await page.goto('./#/splits');
  const btn = page.getByTestId('new-split');
  const box = (await btn.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => btn.evaluate((el) => getComputedStyle(el).transform)).toMatch(/^matrix\(0\.9[0-9.]*, 0, 0, 0\.9[0-9.]*,/);
  await page.mouse.move(2, 2); // wegziehen, damit beim Loslassen nichts ausgelöst wird
  await page.mouse.up();
  await expect.poll(() => btn.evaluate((el) => getComputedStyle(el).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  // Touch-Gerät: kein Hover-Effekt
  expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(false);
  // Federkurve ist gesetzt (linear() oder cubic-bezier-Fallback)
  expect(await css(page, 'html', '--ease-spring')).toMatch(/linear\(|cubic-bezier\(/);
});

test('Hover: mit Maus hebt sich ein Button minimal an (nur bei hover: hover und pointer: fine)', async ({ browser }) => {
  // Desktop-Kontext mit Maus (die Standard-Konfiguration emuliert ein Handy mit Touch)
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, hasTouch: false, isMobile: false, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route('https://raw.githubusercontent.com/**', (r) => r.abort());
  await page.goto('http://localhost:4173/#/splits');
  expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(true);
  await page.getByTestId('new-split').hover();
  await expect.poll(() => page.getByTestId('new-split').evaluate((el) => getComputedStyle(el).transform)).toBe('matrix(1, 0, 0, 1, 0, -1)');
  await ctx.close();
});

test('Sheet: von unten, Griff, schließt per Backdrop, Escape und Wischen nach unten', async ({ page }) => {
  await page.goto('./#/splits');
  await page.getByTestId('new-split').click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toBeVisible();
  await expect(page.locator('.sheet-root')).toHaveClass(/is-open/);
  expect(await dlg.evaluate((el) => getComputedStyle(el, '::before').content)).toBe('none'); // Griff sitzt am Kopf
  expect(await page.locator('.sheet-header').evaluate((el) => getComputedStyle(el, '::before').width)).toBe('36px');
  await expect(page.locator('body')).toHaveClass(/sheet-open/);
  // Backdrop dunkelt ab
  await expect.poll(() => css(page, '.sheet-backdrop', 'opacity')).toBe('1');
  // Escape
  await page.keyboard.press('Escape');
  await expect(page.locator('.sheet-root')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveClass(/sheet-open/);
  // Backdrop-Tipp
  await page.getByTestId('new-split').click();
  await expect(page.locator('.sheet-root.is-open')).toBeVisible();
  await page.locator('.sheet-backdrop').click({ position: { x: 20, y: 20 } });
  await expect(page.locator('.sheet-root')).toHaveCount(0);
  // Kurzes Wischen reicht nicht: federt zurück
  await page.getByTestId('new-split').click();
  await expect(page.locator('.sheet-root.is-open')).toBeVisible();
  await page.waitForTimeout(500);
  const hb = (await page.locator('.sheet-header').boundingBox())!;
  await swipeDown(page, hb.x + hb.width / 2, hb.y + 20, 40);
  await page.waitForTimeout(600);
  await expect(page.locator('.sheet-root')).toHaveCount(1);
  expect((await page.getByRole('dialog').boundingBox())!.y).toBeLessThan(hb.y + 1);
  // Weites Wischen schließt
  const hb2 = (await page.locator('.sheet-header').boundingBox())!;
  await swipeDown(page, hb2.x + hb2.width / 2, hb2.y + 20, 220);
  await expect(page.locator('.sheet-root')).toHaveCount(0, { timeout: 3000 });
});

test('Obere Leiste: großer Titel klappt beim Scrollen ein, Leiste bekommt Material', async ({ page }) => {
  await page.goto('./#/splits');
  const header = page.locator('.app-header');
  await expect(page.getByTestId('large-title')).toHaveText('Splits');
  await expect(header).not.toHaveClass(/is-collapsed/);
  expect(Number(await css(page, '.app-header-bg', 'opacity'))).toBe(0);
  await page.getByTestId('scroller').evaluate((el) => { el.scrollTop = 400; });
  await expect(header).toHaveClass(/is-collapsed/);
  await expect.poll(async () => Number(await css(page, '.app-header-bg', 'opacity'))).toBe(1);
  await page.getByTestId('scroller').evaluate((el) => { el.scrollTop = 0; });
  await expect(header).not.toHaveClass(/is-collapsed/);
});

test('Unterseite: der Titel wird beim Scrollen klein, mittig und sichtbar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 420 });
  await page.goto('./#/calendar');
  await expect(page.getByTestId('cal-month')).toBeVisible(); // erst wenn der Inhalt da ist, lässt sich scrollen
  expect(Number(await css(page, '.app-header-title', 'opacity'))).toBe(0);
  await page.getByTestId('scroller').evaluate((el) => { el.scrollTop = 400; });
  await expect(page.locator('.app-header')).toHaveClass(/is-collapsed/);
  await expect.poll(async () => Number(await css(page, '.app-header-title', 'opacity'))).toBe(1);
  await expect(page.getByTestId('small-title')).toHaveText('Kalender');
});

test('Typografie: Systemschrift, Large Title 34/Bold, Body 17, tabellarische Ziffern', async ({ page }) => {
  await page.goto('./#/training');
  const font = await css(page, 'body', 'font-family');
  expect(font).toContain('-apple-system');
  expect(font).toContain('system-ui');
  expect(await css(page, '[data-testid="large-title"]', 'font-size')).toBe('34px');
  expect(await css(page, '[data-testid="large-title"]', 'font-weight')).toBe('700');
  expect(await css(page, '[data-testid="large-title"]', 'letter-spacing')).not.toBe('normal');
  expect(await css(page, 'body', 'font-size')).toBe('17px');
  expect(await css(page, 'body', 'font-variant-numeric')).toContain('tabular-nums');
});

test('Weniger Bewegung: Sheet verschwindet sofort, kein Skalieren beim Drücken', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.route('https://raw.githubusercontent.com/**', (r) => r.abort());
  await page.goto('http://localhost:4173/#/splits');
  await page.getByTestId('new-split').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await css(page, '.sheet', 'transform')).toBe('none');
  await page.keyboard.press('Escape');
  await expect(page.locator('.sheet-root')).toHaveCount(0);
  const btn = page.getByTestId('new-split');
  const box = (await btn.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.waitForTimeout(100);
  expect(await btn.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  await page.mouse.move(2, 2);
  await page.mouse.up();
  await ctx.close();
});
