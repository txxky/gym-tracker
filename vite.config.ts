import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// base './' : die App läuft unter jedem Pfad, also auch unter https://<name>.github.io/<repo>/
export default defineConfig({
  base: './',
  // Der Übungs-Chunk (~800 kB) ist die mitgelieferte Datenbank, kein Code.
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'Gym Tracker',
        short_name: 'Gym',
        description: 'Lokaler Trainingstracker ohne Account und Cloud',
        lang: 'de',
        start_url: './',
        scope: './',
        display: 'standalone',
        // Das Manifest kennt keine CSS-Variablen, daher feste Werte (entsprechen --bg hell).
        background_color: '#f4f5f7',
        theme_color: '#f4f5f7',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            // Übungsbilder: einmal geladen, danach offline da.
            urlPattern: ({ url }: { url: URL }) =>
              url.origin === 'https://raw.githubusercontent.com' &&
              url.pathname.includes('/free-exercise-db/main/exercises/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'exercise-images',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 2500 },
            },
          },
        ],
      },
    }),
  ],
});
