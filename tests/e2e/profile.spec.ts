import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://raw.githubusercontent.com/**', (r) => r.abort());
});

// 1x1-PNG (rot), als Testfoto
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('Obere Leiste: Avatar links (Touch-Ziel), Theme rechts, öffnet das Profil, Zurück kehrt zurück', async ({ page }) => {
  await page.goto('./#/progress');
  const avatar = page.getByTestId('open-profile');
  const box = (await avatar.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  const theme = (await page.getByTestId('theme-toggle').boundingBox())!;
  expect(box.x).toBeLessThan(theme.x);
  await expect(avatar.locator('svg')).toBeVisible(); // ohne Namen: Personen-Symbol
  await avatar.click();
  await expect(page).toHaveURL(/#\/profile$/);
  await expect(page.getByRole('heading', { name: 'Profil', level: 1 })).toBeVisible();
  await page.getByTestId('back').click();
  await expect(page).toHaveURL(/#\/progress$/); // zurück dorthin, woher man kam
});

test('Profil: Name, Größe/Gewicht/Geburtsjahr über Wheels, Geschlecht, Ziel; bleibt nach Reload; Initialen im Avatar', async ({ page }) => {
  await page.goto('./#/profile');
  await page.getByTestId('profile-name').fill('tom müller');
  await page.getByTestId('goal-chip').first().click();
  await page.getByTestId('profile-gender').selectOption('male');

  await expect(page.getByTestId('value-height')).toHaveText('Nicht angegeben');
  await page.getByTestId('row-height').click();
  const wheel = page.getByRole('spinbutton', { name: 'Größe', exact: true });
  await wheel.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(wheel).toHaveAttribute('aria-valuenow', '177');
  await page.getByTestId('value-save').click();
  await expect(page.getByTestId('value-height')).toHaveText('177 cm');

  await page.getByTestId('row-weight').click();
  const ww = page.getByRole('spinbutton', { name: 'Gewicht', exact: true });
  await ww.focus();
  await page.keyboard.press('ArrowDown'); // 75 -> 75,5
  await page.getByTestId('value-save').click();
  await expect(page.getByTestId('value-weight')).toHaveText('75,5 kg');

  await page.getByTestId('row-birth').click();
  await page.getByTestId('value-save').click();
  await expect(page.getByTestId('value-birth')).toHaveText('1995');
  // Angabe wieder entfernen
  await page.getByTestId('row-birth').click();
  await page.getByTestId('value-clear').click();
  await expect(page.getByTestId('value-birth')).toHaveText('Nicht angegeben');

  await page.reload();
  await expect(page.getByTestId('profile-name')).toHaveValue('tom müller');
  await expect(page.getByTestId('profile-goal')).toHaveValue('Muskelaufbau');
  await expect(page.getByTestId('profile-gender')).toHaveValue('male');
  await expect(page.getByTestId('value-height')).toHaveText('177 cm');
  await page.goto('./#/training');
  await expect(page.getByTestId('open-profile')).toContainText('TM');
});

test('Profil: Foto wählen, erscheint im Avatar der Leiste, lässt sich entfernen', async ({ page }) => {
  await page.goto('./#/profile');
  await page.getByTestId('profile-photo').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByTestId('profile-avatar').locator('img')).toBeVisible();
  await expect(page.getByTestId('profile-photo-remove')).toBeVisible();
  await page.getByTestId('back').click();
  await page.goto('./#/training');
  await expect(page.getByTestId('open-profile').locator('img')).toBeVisible();
  await page.getByTestId('open-profile').click();
  await page.getByTestId('profile-photo-remove').click();
  await expect(page.getByTestId('profile-avatar').locator('img')).toHaveCount(0);
});

test('Header passt auf 320 px Breite ohne Überlauf (Fortschritt hat die meisten Symbole)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('./#/progress');
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.querySelector('.app-header-bar')!.scrollWidth]);
  expect(w[0]).toBeLessThanOrEqual(320);
  expect(w[1]).toBeLessThanOrEqual(320);
});
