import { expect, test, type Page } from '@playwright/test';

async function touchDrag(page: Page, selector: string, dy: number) {
  const box = (await page.locator(selector).first().boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  let y = box.y + box.height / 2 - Math.sign(dy) * 60;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 0; i < 10; i++) {
    y += dy / 10;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const wheel = (page: Page, name: string) => page.getByRole('spinbutton', { name, exact: true });
const val = async (page: Page, name: string) => Number(await wheel(page, name).getAttribute('aria-valuenow'));

/** Split "Log" aus Upper/Lower: Upper mit Bankdrücken (2 Sätze) und Fliegenden (3 Sätze), aktiv gesetzt. */
async function prepare(page: Page) {
  await page.goto('./#/splits');
  await page.getByTestId('new-split').click();
  await page.getByTestId('new-split-name').fill('Log');
  await page.getByTestId('new-split-from').selectOption('ul-2');
  await page.getByTestId('new-split-create').click();
  await page.getByTestId('set-active').click();
  await page.getByRole('link', { name: /^Upper/ }).click();
  for (const q of ['barbell bench press - medium grip', 'dumbbell flyes']) {
    await page.getByTestId('add-exercise').click();
    await page.getByTestId('search').fill(q);
    await expect(page.getByTestId('exercise-row').first()).toContainText(q.split(' ')[0], { ignoreCase: true });
    await page.getByTestId('exercise-row').first().click();
  }
  await page.getByTestId('exercise-plan-row').first().locator('.row-btn').click();
  await wheel(page, 'Sätze').focus();
  await page.keyboard.press('ArrowUp'); // 3 -> 2
  await expect(page.getByTestId('plan-summary')).toContainText('2 x');
  await page.getByTestId('plan-done').click();
}

test.beforeEach(async ({ page }) => {
  await page.route('https://raw.githubusercontent.com/**', (r) => r.abort());
});

test('Training-Tab zeigt "Als Nächstes", Fokus-Modus ohne Tab-Leiste', async ({ page }) => {
  await prepare(page);
  await page.goto('./#/training');
  await expect(page.getByTestId('next-title')).toHaveText('Als Nächstes: Upper');
  await expect(page.getByTestId('next-day')).toContainText('2 x 8 bis 12'.replace('2', '2'));
  await page.getByTestId('start').click();
  await expect(page.getByTestId('tab-training')).toBeHidden();
  await expect(page.getByTestId('save-set')).toHaveText('Satz speichern');
});

test('Logging: Sätze speichern, Startwerte, Auto-Weiter, Ändern, Löschen, Beenden und "Letztes Mal"', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await prepare(page);
  await page.goto('./#/training');
  await page.getByTestId('start').click();

  // Erster Satz: keine Historie, Standardwerte 20 kg x Rep-Min 8
  await expect(page.getByTestId('ex-name')).toContainText('Barbell Bench Press');
  await expect(page.getByTestId('set-line')).toHaveText('Satz 1 von 2');
  await expect(page.getByTestId('last-time')).toHaveText('Noch keine Daten');
  await expect.poll(() => val(page, 'Gewicht')).toBe(20);
  await expect.poll(() => val(page, 'Wiederholungen')).toBe(8);

  // Gewicht per Tastatur (+5 kg), Wiederholungen per Touch
  await wheel(page, 'Gewicht').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => val(page, 'Gewicht')).toBe(25);
  await touchDrag(page, '[aria-label="Wiederholungen"] .wheel-scroll', -88);
  await expect.poll(() => val(page, 'Wiederholungen')).toBeGreaterThan(8);
  const reps1 = await val(page, 'Wiederholungen');

  await page.getByTestId('save-set').click();
  await expect(page.getByTestId('set-line')).toHaveText('Satz 2 von 2');
  await expect(page.getByTestId('set-row')).toHaveCount(1);
  await expect(page.getByTestId('set-row').first()).toContainText(`25 kg x ${reps1}`);
  // Zweiter Satz startet bei den Werten des ersten (keine Historie)
  await expect.poll(() => val(page, 'Gewicht')).toBe(25);
  await page.getByTestId('save-set').click();

  // Übung fertig -> automatisch zur nächsten
  await expect(page.getByTestId('ex-name')).toContainText('Flyes', { ignoreCase: true });
  await expect(page.getByTestId('set-line')).toHaveText('Satz 1 von 3');

  // Zurück zur ersten: alles erledigt, Zusatzsatz möglich
  await page.getByTestId('prev-ex').click();
  await expect(page.getByTestId('ex-done')).toBeVisible();
  await expect(page.getByTestId('save-set')).toHaveText('Zusatzsatz speichern');
  await expect(page.getByTestId('set-row')).toHaveCount(2);

  // Satz 1 ändern
  await page.getByTestId('set-row').first().locator('.set-main').click();
  await expect(page.getByTestId('set-line')).toHaveText('Satz 1 ändern');
  await wheel(page, 'Gewicht').focus();
  await page.keyboard.press('ArrowDown'); // 25 -> 27,5
  await page.getByTestId('save-set').click();
  await expect(page.getByTestId('set-row').first()).toContainText('27,5 kg');

  // Satz 2 löschen -> wieder "Satz 2 von 2", dann neu speichern
  await page.getByTestId('delete-set').nth(1).click();
  await expect(page.getByTestId('set-row')).toHaveCount(1);
  await expect(page.getByTestId('set-line')).toHaveText('Satz 2 von 2');
  await page.getByTestId('save-set').click();
  await expect(page.getByTestId('ex-name')).toContainText('Flyes', { ignoreCase: true });

  // Beenden (Fliegende noch offen -> Rückfrage wird bestätigt)
  await page.getByTestId('finish').click();
  await expect(page.getByRole('heading', { name: 'Training', level: 1 })).toBeVisible();
  // Zyklus ist weitergerückt: nach Upper kommt Lower
  await expect(page.getByTestId('next-title')).toHaveText('Als Nächstes: Lower');

  // Zweites Training: "Letztes Mal" und Räder starten bei den Werten von damals
  await page.getByTestId('other-day').click();
  await page.getByTestId('choose-day').first().click();
  await expect(page.getByTestId('ex-name')).toContainText('Barbell Bench Press');
  await expect(page.getByTestId('last-time')).toHaveText(`Letztes Mal: 27,5 kg x ${reps1}`);
  await expect.poll(() => val(page, 'Gewicht')).toBe(27.5);
  await expect.poll(() => val(page, 'Wiederholungen')).toBe(reps1);
});

test('Laufendes Training bleibt beim Verlassen erhalten, Verwerfen räumt auf', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await prepare(page);
  await page.goto('./#/training');
  await page.getByTestId('start').click();
  await page.getByTestId('save-set').click();
  await page.goto('./#/training');
  await expect(page.getByTestId('open-session')).toBeVisible();
  await page.reload();
  await page.getByTestId('resume').click();
  await expect(page.getByTestId('set-row')).toHaveCount(1);
  await page.goto('./#/training');
  await page.getByTestId('discard').click();
  await expect(page.getByTestId('next-title')).toHaveText('Als Nächstes: Upper');
});

test('Ruhetag im Zyklus lässt sich abhaken', async ({ page }) => {
  await prepare(page);
  await page.goto('./#/splits');
  await page.getByRole('link', { name: /^Log/ }).first().click();
  await page.getByTestId('add-rest').click();
  // Ruhetag zum nächsten Tag machen
  await page.getByRole('link', { name: /^Ruhetag/ }).click();
  await page.getByTestId('set-next').click();
  await page.goto('./#/training');
  await expect(page.getByTestId('next-title')).toHaveText('Als Nächstes: Ruhetag');
  await page.getByTestId('skip-rest').click();
  await expect(page.getByTestId('next-title')).toHaveText('Als Nächstes: Upper');
});

test('RPE-Rad ist optional und wird mit dem Satz gespeichert', async ({ page }) => {
  await prepare(page);
  await page.goto('./#/settings');
  await page.getByTestId('use-rpe').check();
  await page.goto('./#/training');
  await page.getByTestId('start').click();
  await expect(wheel(page, 'RPE')).toBeVisible();
  await expect.poll(() => val(page, 'RPE')).toBe(8);
  await wheel(page, 'RPE').focus();
  await page.keyboard.press('ArrowDown');
  await page.getByTestId('save-set').click();
  await expect(page.getByTestId('set-row').first()).toContainText('RPE 8,5');
});

test('Ohne aktiven Split: freundliche Leer-Ansicht', async ({ page }) => {
  await page.goto('./#/training');
  await expect(page.getByRole('heading', { name: 'Noch kein aktiver Split' })).toBeVisible();
});

test('Tag ohne Übungen: Training lässt sich nicht starten, Link zum Eintragen', async ({ page }) => {
  await page.goto('./#/splits');
  await page.getByTestId('group').first().locator('summary').click();
  await page.getByRole('link', { name: /Full Body 2x/ }).click();
  await page.getByTestId('set-active').click();
  await page.goto('./#/training');
  await expect(page.getByTestId('start')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Übungen eintragen' })).toBeVisible();
});
