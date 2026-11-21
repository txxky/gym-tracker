import { expect, test, type Page } from '@playwright/test';

const wheel = (page: Page, name: string) => page.getByRole('spinbutton', { name, exact: true });

async function prepareTraining(page: Page) {
  await page.goto('./#/splits');
  await page.getByTestId('new-split').click();
  await page.getByTestId('new-split-name').fill('Extras');
  await page.getByTestId('new-split-from').selectOption('ul-2');
  await page.getByTestId('new-split-create').click();
  await page.getByTestId('set-active').click();
  await page.getByRole('link', { name: /^Upper/ }).click();
  await page.getByTestId('add-exercise').click();
  await page.getByTestId('search').fill('barbell bench press - medium grip');
  await expect(page.getByTestId('exercise-row')).toHaveCount(2);
  await page.getByTestId('exercise-row').first().click();
  await expect(page.getByTestId('exercise-plan-row')).toHaveCount(1);
  // Pause 0:30 statt 1:30, damit der Test kurz bleibt
  await page.getByTestId('exercise-plan-row').locator('.row-btn').click();
  await wheel(page, 'Pause').focus();
  await page.keyboard.press('Home'); // 0:15
  await page.keyboard.press('ArrowDown'); // 0:30
  await expect(wheel(page, 'Pause')).toHaveAttribute('aria-valuenow', '30');
  await page.getByTestId('plan-done').click();
}

test.beforeEach(async ({ page }) => {
  await page.route('https://raw.githubusercontent.com/**', (r) => r.abort());
});

test('Pausentimer: startet nach dem Satz, läuft per Zeitstempel, -15/+15, Ende, Überspringen', async ({ page }) => {
  await page.clock.install();
  await prepareTraining(page);
  await page.goto('./#/training');
  await page.getByTestId('start').click();
  await expect(page.getByTestId('rest-bar')).toBeHidden();

  await page.getByTestId('save-set').click();
  await expect(page.getByTestId('rest-bar')).toBeVisible();
  await expect(page.getByTestId('rest-time')).toHaveText('0:30');

  await page.clock.fastForward(10_000);
  await expect(page.getByTestId('rest-time')).toHaveText('0:20');
  await page.getByTestId('rest-plus').click();
  await expect(page.getByTestId('rest-time')).toHaveText('0:35');
  await page.getByTestId('rest-minus').click();
  await expect(page.getByTestId('rest-time')).toHaveText('0:20');

  // Ende: "Pause vorbei", verschwindet danach von selbst
  await page.clock.fastForward(21_000);
  await expect(page.getByTestId('rest-bar')).toContainText('Pause vorbei');
  await page.clock.fastForward(6_000);
  await expect(page.getByTestId('rest-bar')).toBeHidden();

  // Überspringen
  await page.getByTestId('save-set').click();
  await expect(page.getByTestId('rest-bar')).toBeVisible();
  await page.getByTestId('rest-skip').click();
  await expect(page.getByTestId('rest-bar')).toBeHidden();
});

test('Pausentimer lässt sich in den Einstellungen abschalten', async ({ page }) => {
  await prepareTraining(page);
  await page.goto('./#/settings');
  await page.getByTestId('rest-auto').uncheck();
  await page.goto('./#/training');
  await page.getByTestId('start').click();
  await page.getByTestId('save-set').click();
  await expect(page.getByTestId('set-row')).toHaveCount(1);
  await expect(page.getByTestId('rest-bar')).toBeHidden();
});

test('Nach dem letzten geplanten Satz startet keine Pause', async ({ page }) => {
  await prepareTraining(page);
  await page.goto('./#/training');
  await page.getByTestId('start').click();
  for (let i = 0; i < 3; i++) await page.getByTestId('save-set').click(); // 3 geplante Sätze
  await expect(page.getByTestId('set-row')).toHaveCount(3);
  await expect(page.getByTestId('rest-bar')).toBeHidden();
});

test('Verlauf: Sätze als Liste, nachträglich ändern, löschen, Training löschen', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await prepareTraining(page);
  await page.goto('./#/training');
  await page.getByTestId('start').click();
  await page.getByTestId('save-set').click();
  await expect(page.getByTestId('set-row')).toHaveCount(1);
  await page.getByTestId('save-set').click();
  await expect(page.getByTestId('set-row')).toHaveCount(2);
  await page.getByTestId('finish').click();
  await expect(page.getByTestId('next-title')).toBeVisible(); // Beenden ist fertig, App ist zurück im Training

  await page.goto('./#/progress');
  await page.getByTestId('history-link').click();
  await expect(page.getByRole('heading', { name: 'Verlauf', level: 1 })).toBeVisible();
  await expect(page.getByTestId('history-session')).toHaveCount(1);
  await expect(page.getByTestId('history-session')).toContainText('Upper');
  await expect(page.getByTestId('history-set')).toHaveCount(2);

  // Satz 1 ändern: +2,5 kg
  await page.getByTestId('history-set').first().click();
  await wheel(page, 'Gewicht').focus();
  await page.keyboard.press('ArrowDown');
  await page.getByTestId('edit-save').click();
  await expect(page.getByTestId('history-set').first()).toContainText('22,5 kg');

  // Satz 2 löschen
  await page.getByTestId('history-set').nth(1).click();
  await page.getByTestId('edit-delete').click();
  await expect(page.getByTestId('history-set')).toHaveCount(1);

  // Filter auf eine Übung
  await page.getByTestId('history-filter').selectOption({ index: 1 });
  await expect(page.getByTestId('history-set')).toHaveCount(1);

  // ganzes Training löschen -> Leer-Ansicht
  await page.getByTestId('delete-session').click();
  await expect(page.getByTestId('history-empty')).toBeVisible();
});

test('Verlauf ohne Daten zeigt die Leer-Ansicht', async ({ page }) => {
  await page.goto('./#/history');
  await expect(page.getByTestId('history-empty')).toBeVisible();
});

test('Alle Daten: exportieren, löschen, wieder importieren', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await page.addInitScript(() => { (navigator as unknown as { canShare?: unknown }).canShare = undefined; });
  await prepareTraining(page);
  await page.goto('./#/training');
  await page.getByTestId('start').click();
  await page.getByTestId('save-set').click();
  await expect(page.getByTestId('set-row')).toHaveCount(1);
  await page.getByTestId('finish').click();
  await expect(page.getByTestId('next-title')).toBeVisible();
  await page.goto('./#/settings');
  await page.getByTestId('use-rpe').check();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-all').click()]);
  expect(download.suggestedFilename()).toMatch(/^gym-tracker-sicherung-\d{4}-\d{2}-\d{2}\.json$/);
  const fs = await import('node:fs');
  const text = fs.readFileSync((await download.path())!, 'utf8');
  const json = JSON.parse(text);
  expect(json.format).toBe('gym-tracker-backup');
  expect(json.sets).toHaveLength(1);
  expect(json.settings.useRpe).toBe(true);

  // Daten kaputt machen: neuer, leerer Browser-Kontext simuliert das neue Handy
  const ctx2 = await page.context().browser()!.newContext({ ...test.info().project.use, serviceWorkers: 'block' });
  const p2 = await ctx2.newPage();
  p2.on('dialog', (d) => void d.accept());
  await p2.route('https://raw.githubusercontent.com/**', (r) => r.abort());
  await p2.goto('http://localhost:4173/#/progress');
  await expect(p2.getByTestId('progress-empty')).toBeVisible();
  await p2.goto('http://localhost:4173/#/settings');
  const [chooser] = await Promise.all([p2.waitForEvent('filechooser'), p2.getByTestId('import-all').click()]);
  await chooser.setFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  // App lädt nach dem Import neu und landet im Training; der Split ist da und aktiv
  await expect(p2.getByTestId('next-title')).toHaveText('Als Nächstes: Lower', { timeout: 10_000 });
  await p2.goto('http://localhost:4173/#/history');
  await expect(p2.getByTestId('history-set')).toHaveCount(1);
  await p2.goto('http://localhost:4173/#/settings');
  await expect(p2.getByTestId('use-rpe')).toBeChecked();

  // kaputte Datei: Meldung, nichts passiert
  const [bad] = await Promise.all([p2.waitForEvent('filechooser'), p2.getByTestId('import-all').click()]);
  await bad.setFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"anderes"}') });
  await expect(p2.getByRole('status')).toContainText('keine Gym-Tracker-Sicherung');
  await ctx2.close();
});
