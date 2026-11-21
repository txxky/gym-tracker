# Gym Tracker Implementation Plan

> Ausführung: nativ, Phase für Phase, ein Commit pro Phase. Spec: `docs/superpowers/specs/2026-11-21-gym-tracker-design.md`

**Stack:** Vite, TypeScript, Dexie, vite-plugin-pwa, Chart.js, Vitest, Playwright.

## Dateistruktur
- `src/lib/`: `db.ts` (Dexie-Schema), `theme.ts`, `muscles.ts` (DE-Labels), `images.ts` (Bild-URLs, Offline-Cache), `dom.ts` (h()-Helper), `router.ts`
- `src/components/`: `wheel.ts`, `exercise-picker.ts`, `exercise-thumb.ts`, `modal.ts`
- `src/views/`: `training.ts`, `splits.ts`, `progress.ts`, `settings.ts`
- `src/data/`: `exercises.json`, `splits.json`
- `tests/`: Vitest (Logik), `e2e/` Playwright (Wheel, Kernabläufe)

## Phasen
1. Setup, DB-Schema, Theme, Übungs-DB + Bilder, Wheel, Pages-Workflow
2. Splits-Tab (Vorlagen, Builder, Duplizieren, Export/Import)
3. Logging (Fokus-Modus)
4. Fortschritt (Chart.js, Filter, PRs)
5. Extras (Pausentimer, Gesamt-Export/-Import, Satzliste). Deload gestrichen.

## Review Focus
- Leere DB / erster Start ohne Netz
- Import von kaputtem oder fremdem JSON
- Split mit 0 Tagen oder 0 Übungen im Tag
- Übung ohne Bild, Übung gelöscht die in Sessions vorkommt
- Sehr kleine Displays (320 px), Dark Mode ohne JS-Flackern
