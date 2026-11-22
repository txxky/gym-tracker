// Einmalig: erzeugt die PNG-Icons aus public/icon.svg. Aufruf: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();

async function render(file, size, scale = 1) {
  // scale < 1: Motiv verkleinern (Safe-Zone für maskable), Hintergrund füllt trotzdem alles
  const inner = Math.round(size * scale);
  const pad = Math.round((size - inner) / 2);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;background:#000000"><div style="padding:${pad}px">` +
      `<img style="width:${inner}px;height:${inner}px;display:block" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></div></body>`,
  );
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname });
}

await render('pwa-192.png', 192);
await render('pwa-512.png', 512);
await render('pwa-maskable-512.png', 512, 0.8);
await render('apple-touch-icon.png', 180);
await browser.close();
console.log('Icons fertig');
