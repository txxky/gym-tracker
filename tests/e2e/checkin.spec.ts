import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://raw.githubusercontent.com/**', (r) => r.abort());
});

async function activeSplit(page: Page) {
  await page.goto('./#/splits');
  await page.getByTestId('new-split').click();
  await page.getByTestId('new-split-name').fill('CI');
  await page.getByTestId('new-split-from').selectOption('ul-2');
  await page.getByTestId('new-split-create').click();
  await page.getByTestId('set-active').click();
  await page.goto('./#/training');
}

test('Ohne Split: "Ich war im Gym" trägt ein, Fortschritt bleibt leer, Verlauf zeigt den Eintrag und lässt löschen', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await page.goto('./#/training');
  await page.getByTestId('checkin').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByTestId('checkin-advance')).toHaveCount(0); // ohne Split gibt es keinen Zyklus
  await page.getByTestId('checkin-save').click();
  await expect(page.getByRole('status')).toContainText('im Gym gewesen');

  await page.goto('./#/progress');
  await expect(page.getByTestId('progress-empty')).toBeVisible(); // kein Diagramm, keine Rekorde

  await page.goto('./#/history');
  await expect(page.getByTestId('history-checkin')).toHaveCount(1);
  await expect(page.getByTestId('history-checkin')).toContainText('ohne Sätze');
  await page.getByTestId('delete-checkin').click();
  await expect(page.getByTestId('history-empty')).toBeVisible();
});

test('Mit Split: Check-in rückt den Zyklus standardmäßig weiter, per Schalter nicht', async ({ page }) => {
  await activeSplit(page);
  await expect(page.getByTestId('next-title')).toHaveText('Als Nächstes: Upper');
  await page.getByTestId('checkin').click();
  await expect(page.getByTestId('checkin-advance')).toBeChecked(); // Standard: ja
  await page.getByTestId('checkin-save').click();
  await expect(page.getByTestId('next-title')).toHaveText('Als Nächstes: Lower');

  await page.getByTestId('checkin').click();
  await page.getByTestId('checkin-advance').uncheck();
  await page.getByTestId('checkin-save').click();
  await expect(page.getByTestId('next-title')).toHaveText('Als Nächstes: Lower'); // blieb stehen

  await page.goto('./#/history');
  await expect(page.getByTestId('history-checkin')).toHaveCount(2);
  await expect(page.getByTestId('history-checkin').first()).toContainText('Im Gym gewesen');
});

test('Einstellung "Check-in rückt weiter" ist der Standard im Sheet und bleibt gespeichert', async ({ page }) => {
  await activeSplit(page);
  await page.goto('./#/settings');
  await expect(page.getByTestId('checkin-advance-default')).toBeChecked();
  await page.locator('.switch-row').filter({ hasText: 'Check-in' }).click();
  await expect(page.getByTestId('checkin-advance-default')).not.toBeChecked();
  await page.goto('./#/training');
  await page.getByTestId('checkin').click();
  await expect(page.getByTestId('checkin-advance')).not.toBeChecked();
  await page.getByTestId('checkin-save').click();
  await expect(page.getByTestId('next-title')).toHaveText('Als Nächstes: Upper');
});
