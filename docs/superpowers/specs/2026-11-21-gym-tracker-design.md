# Gym Tracker: Design

## Ziel
Lokale, mobile-first PWA (Deutsch) als reines Trainingstool. Keine Accounts, kein Backend, keine Cloud, kein Ernährungs-Feature. Alles statisch, hostbar per GitHub Pages oder Raspberry Pi.

## Entscheidungen
- Vite + TypeScript, Vanilla (kein UI-Framework), Dexie (IndexedDB), vite-plugin-pwa.
- Chart.js (nur Line/Bar + Tooltip, tree-shaken): Tap-Tooltips eingebaut, Farben aus CSS-Variablen. uPlot verworfen, weil Touch-Tooltips und Theme-Anbindung Eigenbau wären.
- `base: './'` für Pages unabhängig vom Repo-Namen.
- Wheel: eine Komponente, CSS scroll-snap, überall für Zahleneingaben.
- Nur kg. Zyklus statt Kalender (Zeiger "nächster Tag"), Wochentage optional.
- Übungs-DB: free-exercise-db lokal eingebunden (876 Übungen, 3 ohne Bild). Bilder per Service Worker (CORS, CacheFirst). "Alle Bilder offline" ca. 93 MB, mit Warnung; zusätzlich "nur Übungen aus meinen Splits".
- Deload: gestrichen (Nutzerentscheidung).

## Phasen
1 Fundament, Theme, Übungs-DB, Wheel, Pages-Deploy. 2 Splits. 3 Logging. 4 Fortschritt. 5 Extras (Pausentimer, Gesamt-Export/-Import, Satzliste).

## Tests
Vitest für Logik, Playwright (Touch-Emulation) für Wheel und Kernabläufe.
