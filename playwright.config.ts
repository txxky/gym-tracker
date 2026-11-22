import { defineConfig, devices } from '@playwright/test';

// PW_CHROMIUM: optionaler Pfad zu einem vorinstallierten Chromium (z. B. in Cloud-Umgebungen).
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4173/',
    ...devices['Pixel 7'],
    // Bedienungstests laufen mit "weniger Bewegung": Boxen bleiben stabil, Sheets verschwinden sofort.
    // Die Animationen selbst prüft tests/e2e/design.spec.ts mit reducedMotion: 'no-preference'.
    reducedMotion: 'reduce',
    launchOptions: { executablePath, args: ['--no-sandbox'] },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
