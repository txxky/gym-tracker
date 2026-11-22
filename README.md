# Zero Lift

Lokaler Trainingstracker für mich und Kollegen. Läuft im Browser, mobile first, als PWA installierbar, Oberfläche auf Deutsch.
Keine Accounts, keine Cloud, kein Backend, kein Ernährungs-Tracking. Alle Daten bleiben auf dem Gerät (IndexedDB).

## Was die App kann

- **Training**: zeigt den nächsten Tag im Zyklus ("Als Nächstes: Pull"). Logging im Fokus-Modus: ein Satz pro Bildschirm, Übungsbild, "Letztes Mal", Wheels für Gewicht (2,5 kg) und Wiederholungen, optional RPE, Pausentimer. Alternativ **"Ich war im Gym"**: ein Eintrag ohne Sätze (Check-in), der im Kalender als Trainingstag zählt, aber nie in Diagramme, Rekorde, Volumen oder Sätze pro Woche einfließt. Optional rückt er den Zyklus weiter (Schalter im Sheet, Standard in den Einstellungen: ja; auf Ruhetagen nie).
- **Kalender** (Symbol oben rechts): Ansichten Tag, Monat (Wochenstart Montag) und Jahr (12 Mini-Monate). Trainingstage sind schwarz gefüllt, Check-ins grau mit Ring, heute hat einen roten Ring. Tippen zeigt Details (Übungen und Sätze), Vor/Zurück, "Heute", Wischen blättert.
- **Profil** (Avatar oben links): Benutzername, Foto (aus Kamera oder Galerie, auf 384 px verkleinert), Größe, Gewicht, Geburtsjahr (per Wheel), Geschlecht (optional), Ziel. Nur lokal, Teil der Sicherung. Ein Körpergewicht-Verlauf ist bewusst nicht enthalten.
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
src/lib/         Datenmodell (Dexie), Logik ohne UI (Splits, Logging, Check-in, Kalender, Profil, Fortschritt, Backup, Pausentimer)
src/components/  Wheel (die eine Zahlen-Komponente), ui.ts (Segmented Control, Schalter), Sheets, Shell (Leiste, Tabs), Avatar, Sortierung, Diagramm
src/views/       Training, Splits, Split-Detail, Tag-Builder, Log, Fortschritt, Verlauf, Kalender, Profil, Einstellungen
src/data/        exercises.json (Übungs-DB), splits.json (Vorlagen)
src/styles/      theme.css (ALLE Farben), tokens.css (Typo, Raster, Radien, Bewegung), components.css (Bausteine), app.css (Screens)
scripts/         screenshots.mjs (Design-Prüfung hell/dunkel, 390 und 320 px), gen-splits.mjs
tests/           Vitest und e2e/ (Playwright)
```

Die Vorlagen stehen in `src/data/splits.json`. Sie werden beim ersten Start in die Datenbank kopiert, danach lebt alles in der App.
`scripts/gen-splits.mjs` erzeugt die JSON und die lesbare Übersicht `docs/vorlagen.md` aus einer kompakten Schreibweise.

## Design

Monochrom, an Apples Human Interface Guidelines orientiert, nur mit Systemschrift (`-apple-system, "SF Pro Text", system-ui`), eigenen SVG-Icons (1,75 px Strich) und CSS, ohne Apple-Assets.

- **Farben**: Schwarz, Weiß, Graustufen. Hell: "grouped background" (`--bg`) mit weißen Karten. Dunkel: echtes Schwarz mit sehr dunklen Karten. Primäre Knöpfe sind schwarz auf weiß bzw. weiß auf schwarz. Funktionale Ausnahmen: `--today` (heute im Kalender), `--danger`, `--success`.
- **Typo**: Large Title 34/Bold, Title 28, Headline 17/Semibold, Body 17, Subheadline 15, Footnote 13, Caption 12 (dazu Title 2 mit 22 px). Ziffern tabellarisch.
- **Form**: 8-Punkte-Raster, Karten 20 px, Gruppen 16 px, Knöpfe 14 px, Felder 12 px, Pillen rund, haarfeine Trennlinien (`--hairline`), Listen als "Inset Grouped". Mit `corner-shape: squircle`, wo der Browser es kann.
- **Material**: obere Leiste, Tab-Leiste und Sheets sind halbtransparent mit `backdrop-filter: blur(20px) saturate(180%)`. Ohne Unterstützung: volle Deckkraft (`--material-solid`). Der Kontrasttest prüft Text auf dem Material über Worst-Case-Untergründen.
- **Bewegung**: Federkurve als CSS `linear()` (Fallback `cubic-bezier(0.2, 0.8, 0.2, 1)`), 200 bis 400 ms, animiert werden nur `transform` und `opacity`. Press-Zustand (scale + Abdunkeln) überall, Hover nur bei Maus (`hover: hover` und `pointer: fine`). `prefers-reduced-motion`: kein Schieben und Federn, nur kurzes Überblenden.
- **Bausteine** (`components.css`, `components/ui.ts`): `.btn`, `.card`, `.list`/`.list-item` (Inset Grouped), `segmented()` mit gleitendem Daumen, `switchRow()` (iOS-Schalter), `openSheet()` (von unten, Griff, Wischen zum Schließen), Wheel im Picker-Stil.
- **Obere Leiste**: links Profil-Avatar (auf Unterseiten stattdessen Zurück), rechts Kalender und Theme-Umschalter. Der Titel steht groß im Inhalt und geht beim Scrollen in einen kleinen, mittigen Titel über, die Leiste bekommt dann das Material.

## Theme

Alle Farben (auch Transparenzen und Schatten) sind CSS-Variablen in `src/styles/theme.css` (`:root` und `[data-theme="dark"]`). Ein Inline-Script im `<head>` setzt das Theme vor dem ersten Paint. Ein Test prüft Kontrast nach WCAG AA (auch halbtransparente Flächen auf ihrem Untergrund) und dass in keinem anderen Stylesheet Farbwerte stehen.
Ausnahmen, die technisch keine CSS-Variablen können: das Web-App-Manifest (`theme_color`) und die Icon-Grafiken.

## Deploy auf GitHub Pages

Der Workflow `.github/workflows/pages.yml` baut bei jedem Push auf `main` und veröffentlicht `dist/`.
Der Vite-Basispfad ist relativ (`./`), die App läuft deshalb unter jedem Repo-Namen.

Einmalig in GitHub einstellen: **Settings > Pages > Build and deployment > Source = "GitHub Actions"**.

## Hinweise

- **Bilder** liegen nicht im Repo, sondern kommen von `raw.githubusercontent.com` und werden beim ersten Ansehen im Service-Worker-Cache gespeichert. Alle ca. 93 MB vorab zu laden ist optional.
- **Pausentimer**: rechnet mit Zeitstempeln und stimmt auch nach kurzer Sperre. Vibration und Ton funktionieren nur bei geöffneter App, iPhones vibrieren nicht (Browser-Einschränkung).
- **Daten**: Trainings haben ein Feld `type` (`full` oder `checkin`); alte Daten ohne das Feld gelten als `full` (Dexie-Upgrade auf Version 2). Das Backup hat Version 2 (mit Profil); Version-1-Dateien lassen sich weiter einlesen und lassen ein vorhandenes Profil unangetastet.
- **Screenshots** zur Design-Prüfung: `npm run build && npx vite preview --port 4174 &`, dann `PW_CHROMIUM=<pfad> node scripts/screenshots.mjs <ordner>`.
- **Daten sichern**: Einstellungen > Daten > "Alle Daten exportieren". Browserdaten können gelöscht werden (z. B. "Website-Daten löschen"), eine Sicherung schützt davor.

## Lizenzen und Quellen

Zero Lift ist ein privates, nicht kommerzielles Projekt für den Eigengebrauch. Das ist keine Rechtsberatung.

- **Übungsdaten und Bilder**: [free-exercise-db](https://github.com/yuhonas/free-exercise-db) von yuhonas, veröffentlicht unter der [Unlicense](https://unlicense.org/) (gemeinfrei). Die Daten (`src/data/exercises.json`) liegen im Repo, die Bilder werden zur Laufzeit direkt von `raw.githubusercontent.com` geladen und nicht von dieser App ausgeliefert. Die ursprüngliche Herkunft der Bilder innerhalb dieses Projekts konnte nicht geprüft werden.
- **Bibliotheken** (jeweils mit eigener Lizenz im jeweiligen Paket): Chart.js (MIT), Dexie (Apache-2.0), Vite und vite-plugin-pwa (MIT). Zum Entwickeln: TypeScript, Vitest, Playwright, fake-indexeddb (MIT bzw. Apache-2.0).
- **Schrift**: es wird keine Schriftdatei ausgeliefert. Die App nutzt die Systemschrift des Geräts (auf iPhones SF Pro, die Apple dort bereitstellt).
- **Logo und App-Icon**: eigene Zeichnung (einfache Hantel aus Rechtecken, `public/icon.svg`), keine fremden Assets.
- **Name "Zero Lift"**: es wurde nicht auf Markenrechte Dritter geprüft. Vor einer öffentlichen Bewerbung oder Veröffentlichung in einem App Store bitte bei DPMA, EUIPO und TMview recherchieren.
- **Datenschutz**: kein Account, kein Tracking, keine Cloud. Alle Daten liegen lokal im Browser (IndexedDB). Beim Aufruf der Seite und beim Laden der Übungsbilder sieht GitHub die IP-Adresse, wie bei jeder Webseite.
