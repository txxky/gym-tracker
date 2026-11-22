import { registerSW } from 'virtual:pwa-register';
import './styles/theme.css';
import './styles/tokens.css';
import './styles/components.css';
import './styles/app.css';
import { mountShell, resetScroll, setActiveTab } from './components/shell';
import { ensureExercisesSeeded } from './lib/exercises';
import { startRouter, type Routes } from './lib/router';
import { initTheme } from './lib/theme';
import { renderHistory } from './views/history';
import { renderLog } from './views/log';
import { renderProgress } from './views/progress';
import { ensureSplitsSeeded } from './lib/split-store';
import { renderDayBuilder } from './views/day-builder';
import { renderSettings } from './views/settings';
import { renderSplitDetail } from './views/split-detail';
import { renderSplits } from './views/splits';
import { renderTraining } from './views/training';

initTheme();
registerSW({ immediate: true });

const routes: Routes = [
  [/^\/training$/, renderTraining],
  [/^\/splits$/, renderSplits],
  [/^\/splits\/([^/]+)$/, renderSplitDetail],
  [/^\/splits\/([^/]+)\/day\/([^/]+)$/, renderDayBuilder],
  [/^\/log\/(\d+)$/, renderLog],
  [/^\/progress$/, renderProgress],
  [/^\/history$/, renderHistory],
  [/^\/settings$/, renderSettings],
];

async function boot() {
  const root = mountShell(document.getElementById('app')!);
  await ensureExercisesSeeded();
  await ensureSplitsSeeded();
  startRouter(root, routes, (path) => {
    setActiveTab(path);
    resetScroll();
    // Fokus-Modus beim Loggen: Tab-Leiste ausblenden
    document.body.classList.toggle('focus-mode', path.startsWith('/log'));
  });
}

void boot();
