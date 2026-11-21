import { expect, test, type Page } from '@playwright/test';

const DAY = 86_400_000;

/** Legt Trainings direkt in IndexedDB an (so wie die App sie speichert), damit der Test nicht Wochen klicken muss. */
async function seed(page: Page, rows: Array<{ daysAgo: number; dayName: string; sets: Array<[string, string, number, number]> }>) {
  await page.goto('./');
  await expect(page.getByTestId('tab-training')).toBeVisible();
  await page.evaluate(async ({ rows, DAY }) => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('gym-tracker');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const now = Date.now();
    for (const row of rows) {
      const startedAt = now - row.daysAgo * DAY;
      const sessionId: number = await new Promise((res, rej) => {
        const tx = db.transaction('sessions', 'readwrite');
        const rq = tx.objectStore('sessions').add({ startedAt, endedAt: startedAt + 3_600_000, splitId: null, dayId: null, dayName: row.dayName });
        rq.onsuccess = () => res(rq.result as number);
        rq.onerror = () => rej(rq.error);
      });
      let i = 0;
      for (const [exerciseId, exerciseName, kg, reps] of row.sets) {
        await new Promise<void>((res, rej) => {
          const tx = db.transaction('sets', 'readwrite');
          tx.objectStore('sets').add({ sessionId, exerciseId, exerciseName, setIndex: ++i, kg, reps, rpe: null, ts: startedAt + i * 1000 });
          tx.oncomplete = () => res();
          tx.onerror = () => rej(tx.error);
        });
      }
    }
    db.close();
  }, { rows, DAY });
}

const BENCH = 'Barbell_Bench_Press_-_Medium_Grip';

const DATA = [
  { daysAgo: 40, dayName: 'Push', sets: [[BENCH, 'Barbell Bench Press - Medium Grip', 80, 8], [BENCH, 'Barbell Bench Press - Medium Grip', 80, 8]] },
  { daysAgo: 26, dayName: 'Push', sets: [[BENCH, 'Barbell Bench Press - Medium Grip', 82.5, 8]] },
  { daysAgo: 12, dayName: 'Push', sets: [[BENCH, 'Barbell Bench Press - Medium Grip', 85, 6]] },
  { daysAgo: 3, dayName: 'Push', sets: [[BENCH, 'Barbell Bench Press - Medium Grip', 87.5, 5], ['squat', 'Squat', 120, 5]] },
] as Parameters<typeof seed>[1];

test.beforeEach(async ({ page }) => {
  await page.route('https://raw.githubusercontent.com/**', (r) => r.abort());
});

test('Ohne Daten: freundliche Leer-Ansicht', async ({ page }) => {
  await page.goto('./#/progress');
  await expect(page.getByTestId('progress-empty')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Noch keine Daten' })).toBeVisible();
});

test('Diagramm: Filter frei kombinierbar, Tabelle zeigt die Werte, Rekorde', async ({ page }) => {
  await seed(page, DATA);
  await page.goto('./#/progress');
  await expect(page.getByTestId('chart')).toBeVisible();

  // Gesamt / 3 Monate / 1RM = Index (alle 4 Trainingstage liegen im Zeitraum)
  await expect(page.getByTestId('summary')).toContainText('4 Trainingstage');
  await expect(page.getByTestId('values').locator('tbody tr')).toHaveCount(4);

  // Einzelne Übung: Top-Set in kg
  await page.getByTestId('view-exercise').click();
  await page.getByTestId('sub-filter').selectOption({ label: 'Barbell Bench Press - Medium Grip' });
  await page.getByTestId('metric-top').click();
  await page.getByTestId('range-all').click();
  const rows = page.getByTestId('values').locator('tbody tr');
  await expect(rows).toHaveCount(4);
  // neueste zuerst
  await expect(rows.nth(0).locator('td').last()).toHaveText('87,5');
  await expect(rows.nth(3).locator('td').last()).toHaveText('80');

  // Zeitraum 4 Wochen schneidet den ältesten Tag (vor 40 Tagen) ab
  await page.getByTestId('range-4w').click();
  await expect(rows).toHaveCount(3);

  // Volumen
  await page.getByTestId('metric-volume').click();
  await expect(rows.nth(0).locator('td').last()).toHaveText('438'); // 87,5 x 5 = 437,5 -> 438
  // 1RM (Epley) für 87,5 x 5
  await page.getByTestId('metric-e1rm').click();
  await expect(rows.nth(0).locator('td').last()).toHaveText('102,1');

  // Sätze pro Woche (Balken)
  await page.getByTestId('metric-sets').click();
  await expect(page.getByRole('heading', { name: 'Sätze pro Woche' })).toBeVisible();
  await expect(page.getByTestId('chart')).toBeVisible();

  // Muskelgruppe: Brust gibt es nur über die Übungs-DB, daher mit Daten für "Brust"
  await page.getByTestId('view-muscle').click();
  await expect(page.getByTestId('sub-filter')).toContainText('Brust');

  // Rekorde folgen der Ansicht, nicht dem Zeitraum
  await page.getByTestId('view-total').click();
  const pr = page.getByTestId('pr-row');
  await expect(pr).toHaveCount(2);
  await expect(pr.filter({ hasText: 'Squat' })).toContainText('120 kg x 5');
  await expect(pr.filter({ hasText: 'Squat' })).toContainText('Neu');
  const bench = pr.filter({ hasText: 'Barbell Bench Press' });
  await expect(bench).toContainText('87,5 kg x 5'); // schwerster Satz
  // bestes geschätztes 1RM ist 82,5 x 8 (= 104,5), nicht der schwerste Satz (87,5 x 5 = 102,1)
  await expect(bench).toContainText('104,5 kg');
});

test('Split-Tag-Ansicht und leere Auswahl', async ({ page }) => {
  await seed(page, DATA);
  await page.goto('./#/progress');
  await page.getByTestId('view-day').click();
  await expect(page.getByTestId('sub-filter')).toHaveValue('Push');
  await page.getByTestId('range-4w').click();
  await page.getByTestId('metric-volume').click();
  await expect(page.getByTestId('chart')).toBeVisible();
});

test('Zeitraum ohne Daten zeigt Hinweis statt leerem Diagramm', async ({ page }) => {
  await seed(page, [{ daysAgo: 200, dayName: 'Push', sets: [['a', 'A', 50, 5]] }]);
  await page.goto('./#/progress');
  await page.getByTestId('range-4w').click();
  await expect(page.getByTestId('chart-empty')).toBeVisible();
  await page.getByTestId('range-all').click();
  await expect(page.getByTestId('chart')).toBeVisible();
});

test('Filter werden gemerkt', async ({ page }) => {
  await seed(page, DATA);
  await page.goto('./#/progress');
  await page.getByTestId('metric-volume').click();
  await page.getByTestId('range-1y').click();
  await page.reload();
  await expect(page.getByTestId('metric-volume')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('range-1y')).toHaveAttribute('aria-pressed', 'true');
});

test('Tippen auf das Diagramm zeigt den Wert (Touch)', async ({ page }) => {
  await seed(page, DATA);
  await page.goto('./#/progress');
  await page.getByTestId('view-exercise').click();
  await page.getByTestId('sub-filter').selectOption({ label: 'Barbell Bench Press - Medium Grip' });
  await page.getByTestId('metric-top').click();
  await page.getByTestId('range-all').click();
  const canvas = page.getByTestId('chart');
  const box = (await canvas.boundingBox())!;
  const before = await canvas.screenshot();
  // rechts im Diagramm tippen: der letzte Messpunkt (87,5 kg) bekommt einen Tooltip
  await page.touchscreen.tap(box.x + box.width - 30, box.y + box.height / 2);
  await page.waitForTimeout(600);
  const after = await canvas.screenshot();
  expect(Buffer.compare(before, after)).not.toBe(0);
});

test('Diagramm wird bei Theme-Wechsel neu gezeichnet und bleibt sichtbar', async ({ page }) => {
  await seed(page, DATA);
  await page.goto('./#/progress');
  await page.evaluate(() => localStorage.setItem('gt-theme', 'light'));
  await page.reload();
  await expect(page.getByTestId('chart')).toBeVisible();
  const light = await page.getByTestId('chart').screenshot();
  await page.getByTestId('theme-toggle').click(); // light -> dark
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.waitForTimeout(500);
  const dark = await page.getByTestId('chart').screenshot();
  expect(Buffer.compare(light, dark)).not.toBe(0);
});
