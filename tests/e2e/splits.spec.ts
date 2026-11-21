import { expect, test, type Page } from '@playwright/test';

/** Echte Touch-Geste auf einem Element über CDP (negativ = nach oben). */
async function touchDrag(page: Page, selector: string, dy: number) {
  const box = (await page.locator(selector).first().boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  let y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    y += dy / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Wartet, bis ein Scroll-Container steht (zwei gleiche Messungen hintereinander, auf ganzen Einträgen). */
async function settled(page: Page, selector: string) {
  let last = -1;
  await expect.poll(async () => {
    const top = await page.locator(selector).evaluate((el) => el.scrollTop);
    const stable = top === last && top % 44 === 0;
    last = top;
    return stable;
  }, { intervals: [100] }).toBe(true);
}

// nur der Tagesname, ohne Chips wie "Als Nächstes"
const dayNames = (page: Page) =>
  page.getByTestId('day-row').locator('.list-item-title').evaluateAll((els) => els.map((e) => e.firstChild?.textContent ?? ''));

async function createSplit(page: Page, name: string, template = '') {
  await page.goto('./#/splits');
  await page.getByTestId('new-split').click();
  await page.getByTestId('new-split-name').fill(name);
  if (template) await page.getByTestId('new-split-from').selectOption(template);
  await page.getByTestId('new-split-create').click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.route('https://raw.githubusercontent.com/**', (r) => r.abort());
  await page.addInitScript(() => { (navigator as unknown as { canShare?: unknown }).canShare = undefined; });
});

test('Vorlagen: 23 Stück in 6 Gruppen, Tage ohne Übungen', async ({ page }) => {
  await page.goto('./#/splits');
  await expect(page.getByTestId('group')).toHaveCount(6);
  await expect(page.getByTestId('split-card')).toHaveCount(23);
  await page.getByTestId('group').first().locator('summary').click();
  await page.getByRole('link', { name: /Full Body 3x/ }).click();
  await expect(page.getByTestId('day-row')).toHaveCount(3);
  await expect(page.getByTestId('day-row').first()).toContainText('0 Übungen');
});

test('Neuer Split aus Vorlage: Tage per Tastatur und Touch umsortieren, Ruhetag, aktiv, bleibt nach Reload', async ({ page }) => {
  await createSplit(page, 'Mein PPL', 'ppl-3');
  await expect.poll(() => dayNames(page)).toEqual(['Push', 'Pull', 'Legs']);

  // Tastatur: Pfeil runter auf dem Handle
  await page.getByTestId('grip').first().focus();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => dayNames(page)).toEqual(['Pull', 'Push', 'Legs']);

  // Touch: erste Zeile (Pull) zwei Plätze nach unten ziehen
  await touchDrag(page, '[data-testid="grip"]', 150);
  await expect.poll(() => dayNames(page)).toEqual(['Push', 'Legs', 'Pull']);

  await page.getByTestId('add-rest').click();
  await expect(page.getByTestId('day-row')).toHaveCount(4);
  await expect(page.getByTestId('day-row').last()).toContainText('Ruhetag');

  await page.getByTestId('set-active').click();
  await expect(page.getByTestId('set-active')).toBeDisabled();

  await page.reload();
  await expect.poll(() => dayNames(page)).toEqual(['Push', 'Legs', 'Pull', 'Ruhetag']);
  await expect(page.getByTestId('set-active')).toBeDisabled();
});

test('Drag per Maus funktioniert ebenfalls', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 900 } });
  const page = await ctx.newPage();
  await page.route('https://raw.githubusercontent.com/**', (r) => r.abort());
  await createSplit(page, 'Maus', 'ppl-3');
  const grip = (await page.getByTestId('grip').first().boundingBox())!;
  await page.mouse.move(grip.x + 20, grip.y + 20);
  await page.mouse.down();
  await page.mouse.move(grip.x + 20, grip.y + 100, { steps: 8 });
  await page.mouse.up();
  // 80 px runter bei ca. 72 px Zeilenabstand: genau ein Platz
  await expect.poll(() => dayNames(page)).toEqual(['Pull', 'Push', 'Legs']);
  await ctx.close();
});

test('Tag-Builder: Übung hinzufügen, Sätze per Touch, Rep-Range mit Regel, Fokus, Wochentag', async ({ page }) => {
  await createSplit(page, 'Builder', 'ppl-3');
  await page.getByRole('link', { name: /^Push/ }).click();
  await expect(page.getByRole('heading', { name: 'Push', level: 1 })).toBeVisible();

  await page.getByTestId('add-exercise').click();
  await page.getByTestId('search').fill('barbell bench press - medium grip');
  await expect(page.getByTestId('exercise-row')).toHaveCount(2);
  await page.getByTestId('exercise-row').first().click();
  const row = page.getByTestId('exercise-plan-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Barbell Bench Press - Medium Grip');
  await expect(row).toContainText('Brust');
  await expect(row.getByTestId('plan')).toHaveText('3 x 8 bis 12');

  // Plan-Editor: Sätze per Touch-Wischen ändern
  await row.locator('.row-btn').click();
  await expect(page.getByTestId('plan-summary')).toHaveText('3 x 8 bis 12');
  const setsWheel = page.getByRole('spinbutton', { name: 'Sätze' });
  await touchDrag(page, '[aria-label="Sätze"] .wheel-scroll', -88);
  await expect.poll(async () => Number(await setsWheel.getAttribute('aria-valuenow'))).toBeGreaterThan(3);
  await settled(page, '[aria-label="Sätze"] .wheel-scroll'); // Momentum ausgelaufen, Rad eingerastet

  // "bis" unter "von" ziehen -> "von" zieht mit
  const bis = page.getByRole('spinbutton', { name: 'Wdh. bis' });
  await bis.focus();
  await page.keyboard.press('Home');
  await expect(page.getByRole('spinbutton', { name: 'Wdh. von' })).toHaveAttribute('aria-valuenow', '1');
  await expect(page.getByTestId('plan-summary')).toContainText(' x 1');
  await bis.focus();
  await page.keyboard.press('PageDown');
  await expect(page.getByTestId('plan-summary')).toContainText('1 bis 6');
  const summary = await page.getByTestId('plan-summary').innerText();
  await page.getByTestId('plan-done').click();
  await expect(row.getByTestId('plan')).toHaveText(summary);

  // Erneutes Öffnen zeigt den aktuellen Stand, nicht den alten
  await row.locator('.row-btn').click();
  await expect(page.getByTestId('plan-summary')).toHaveText(summary);
  await page.getByTestId('plan-done').click();

  // Fokus ändern
  await page.getByTestId('edit-focus').click();
  await page.getByRole('button', { name: 'Bizeps' }).click();
  await page.getByTestId('focus-save').click();
  await expect(page.locator('.chip-accent', { hasText: 'Bizeps' })).toBeVisible();

  // Wochentag + Umbenennen
  await page.getByTestId('day-weekday').selectOption('0');
  await page.getByTestId('day-name').fill('Push schwer');
  await page.getByTestId('day-name').press('Tab');
  await expect(page.getByRole('heading', { name: 'Push schwer', level: 1 })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('exercise-plan-row').getByTestId('plan')).toHaveText(summary);
  await expect(page.getByTestId('day-weekday')).toHaveValue('0');
  await expect(page.locator('.chip-accent', { hasText: 'Bizeps' })).toBeVisible();

  // Entfernen
  await page.getByTestId('exercise-plan-row').locator('.row-btn').click();
  await page.getByRole('button', { name: 'Übung entfernen' }).click();
  await expect(page.getByTestId('exercise-plan-row')).toHaveCount(0);
});

test('Übungen im Tag per Handle umsortieren', async ({ page }) => {
  await createSplit(page, 'Reihenfolge', 'ppl-3');
  await page.getByRole('link', { name: /^Push/ }).click();
  for (const q of ['barbell bench press - medium grip', 'dumbbell flyes']) {
    await page.getByTestId('add-exercise').click();
    await page.getByTestId('search').fill(q);
    await page.getByTestId('exercise-row').first().click();
  }
  const names = () => page.getByTestId('exercise-plan-row').locator('.list-item-title').allInnerTexts();
  const before = await names();
  expect(before).toHaveLength(2);
  await page.getByTestId('grip').first().focus();
  await page.keyboard.press('ArrowDown');
  await expect.poll(names).toEqual([before[1], before[0]]);
});

test('Verwalten: umbenennen, duplizieren, löschen, Vorlage zurücksetzen', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await createSplit(page, 'Original', 'ul-2');

  await page.getByTestId('rename').click();
  await page.getByTestId('ask-input').fill('Umbenannt');
  await page.getByTestId('ask-ok').click();
  await expect(page.getByRole('heading', { name: 'Umbenannt', level: 1 })).toBeVisible();

  await page.getByTestId('duplicate').click();
  await page.getByTestId('ask-input').fill('Die Kopie');
  await page.getByTestId('ask-ok').click();
  await expect(page.getByRole('heading', { name: 'Die Kopie', level: 1 })).toBeVisible();
  await page.getByTestId('delete').click();
  await expect(page.getByRole('heading', { name: 'Splits', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /Die Kopie/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Umbenannt/ })).toBeVisible();

  // Mitgelieferte Vorlage ändern und zurücksetzen. Vorlagen lassen sich nicht löschen.
  await page.getByTestId('group').first().locator('summary').click();
  await page.getByRole('link', { name: /Full Body 2x/ }).click();
  await expect(page.getByTestId('delete')).toHaveCount(0);
  await page.getByTestId('add-day').click();
  await expect(page.getByTestId('day-row')).toHaveCount(3);
  await page.getByTestId('reset').click();
  await expect(page.getByTestId('day-row')).toHaveCount(2);
});

test('Export und Import: Runde über eine Datei, kaputte Datei gibt eine Meldung', async ({ page }) => {
  await createSplit(page, 'Teilen', 'ul-2');
  await page.getByRole('link', { name: /^Upper/ }).click();
  await page.getByTestId('add-exercise').click();
  await page.getByTestId('search').fill('barbell bench press - medium grip');
  await page.getByTestId('exercise-row').first().click();
  await page.goBack();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()]);
  expect(download.suggestedFilename()).toBe('gym-split-teilen.json');
  const path = await download.path();
  const fs = await import('node:fs');
  const text = fs.readFileSync(path!, 'utf8');
  const json = JSON.parse(text);
  expect(json.format).toBe('gym-tracker-split');
  expect(json.split.days[0].exercises).toHaveLength(1);

  await page.goto('./#/splits');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('import-split').click()]);
  await chooser.setFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.getByRole('heading', { name: 'Teilen (2)', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: /^Upper/ }).click();
  await expect(page.getByTestId('exercise-plan-row')).toHaveCount(1);

  await page.goto('./#/splits');
  const [bad] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('import-split').click()]);
  await bad.setFiles({ name: 'kaputt.json', mimeType: 'application/json', buffer: Buffer.from('{nope') });
  await expect(page.getByRole('status')).toContainText('kein gültiges JSON');
});

test('FBEOD ist als rotierend gekennzeichnet', async ({ page }) => {
  await page.goto('./#/splits');
  await page.getByTestId('group').first().locator('summary').click();
  await page.getByRole('link', { name: /FBEOD/ }).click();
  await expect(page.getByText('Rotierend, keine festen Wochentage')).toBeVisible();
  await expect(page.getByTestId('day-row')).toHaveCount(3);
});
