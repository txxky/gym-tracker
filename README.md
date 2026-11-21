# Gym Tracker

Lokaler Trainingstracker für mich und Kollegen. Läuft im Browser, mobile first, als PWA installierbar, Oberfläche auf Deutsch.
Keine Accounts, keine Cloud, kein Backend, kein Ernährungs-Tracking. Alle Daten bleiben auf dem Gerät (IndexedDB).

## Was die App kann

- **Training**: zeigt den nächsten Tag im Zyklus ("Als Nächstes: Pull"). Logging im Fokus-Modus: ein Satz pro Bildschirm, Übungsbild, "Letztes Mal", Wheels für Gewicht (2,5 kg) und Wiederholungen, optional RPE, Pausentimer.
- **Splits**: 23 mitgelieferte Vorlagen (nur Tage und Muskel-Fokus, siehe [docs/vorlagen.md](docs/vorlagen.md)). Eigene Splits bauen, Vorlagen kopieren und ändern, Tage sortieren (Drag-and-drop oder Tastatur), Ruhetage, Duplizieren, Zurücksetzen, aktiver Split, Export und Import als JSON.
- **Fortschritt**: Diagramm mit frei kombinierbaren Filtern (Ansicht, Zeitraum, Kennzahl), Rekorde, Verlauf aller Sätze mit Korrektur.
- **Übungen**: 876 Übungen aus [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense) lokal eingebunden, Suche mit Muskel- und Equipment-Filter, eigene Übungen mit Foto.
- **Einstellungen**: Hell, Dunkel, System. Pausentimer. Alle Bilder offline speichern. Alle Daten exportieren und importieren.

## Entwickeln

```bash
npm install
npm run dev          # lokaler Dev-Server
npm run build        # Produktions-Build nach dist/
npm run preview      # Build lokal ansehen
npm test             # Unit-Tests (Vitest)
npm run e2e          # Browser-Tests mit Touch-Emulation (Playwright)
```

Die E2E-Tests brauchen einen Chromium. Ist keiner installiert: `npx playwright install chromium`.
Mit eigenem Chromium: `PW_CHROMIUM=/pfad/zu/chromium npm run e2e`.

## Aufbau

```
src/lib/         Datenmodell (Dexie), Logik ohne UI (Splits, Logging, Fortschritt, Backup, Pausentimer)
src/components/  Wheel (die eine Zahlen-Komponente), Sortierung, Diagramm, Sheets
src/views/       Training, Splits, Split-Detail, Tag-Builder, Log, Fortschritt, Verlauf, Einstellungen
src/data/        exercises.json (Übungs-DB), splits.json (Vorlagen)
src/styles/      theme.css (ALLE Farben), app.css (nur var(--...))
tests/           Vitest und e2e/ (Playwright)
```

Die Vorlagen stehen in `src/data/splits.json`. Sie werden beim ersten Start in die Datenbank kopiert, danach lebt alles in der App.
`scripts/gen-splits.mjs` erzeugt die JSON und die lesbare Übersicht `docs/vorlagen.md` aus einer kompakten Schreibweise.

## Theme

Alle Farben sind CSS-Variablen in `src/styles/theme.css` (`:root` und `[data-theme="dark"]`). Ein Inline-Script im `<head>` setzt das Theme vor dem ersten Paint. Ein Test prüft Kontrast nach WCAG AA und dass außerhalb von `theme.css` keine Farbwerte stehen.
Ausnahmen, die technisch keine CSS-Variablen können: das Web-App-Manifest (`theme_color`) und die Icon-Grafiken.

## Deploy auf GitHub Pages

Der Workflow `.github/workflows/pages.yml` baut bei jedem Push auf `main` und veröffentlicht `dist/`.
Der Vite-Basispfad ist relativ (`./`), die App läuft deshalb unter jedem Repo-Namen.

Einmalig in GitHub einstellen: **Settings > Pages > Build and deployment > Source = "GitHub Actions"**.

## Hinweise

- **Bilder** liegen nicht im Repo, sondern kommen von `raw.githubusercontent.com` und werden beim ersten Ansehen im Service-Worker-Cache gespeichert. Alle ca. 93 MB vorab zu laden ist optional.
- **Pausentimer**: rechnet mit Zeitstempeln und stimmt auch nach kurzer Sperre. Vibration und Ton funktionieren nur bei geöffneter App, iPhones vibrieren nicht (Browser-Einschränkung).
- **Daten sichern**: Einstellungen > Daten > "Alle Daten exportieren". Browserdaten können gelöscht werden (z. B. "Website-Daten löschen"), eine Sicherung schützt davor.
