export interface RouteContext {
  params: string[];
  /** Eigener Container dieser Ansicht. Späte (asynchrone) Renders einer verlassenen Ansicht landen hier und sind harmlos. */
  root: HTMLElement;
  /** false, sobald der Nutzer woanders hin navigiert ist (nach jedem await prüfen, bevor Globales verändert wird). */
  isCurrent: () => boolean;
}
export type RouteHandler = (ctx: RouteContext) => void | Promise<void>;
export type Routes = Array<[RegExp, RouteHandler]>;

/** Anzahl der Ansichten seit dem App-Start; > 1 heißt: "Zurück" bleibt in der App. */
export let navCount = 0;

export function currentPath(): string {
  return location.hash.slice(1) || '/training';
}

export function navigate(path: string): void {
  location.hash = path;
}

/** Hash-Router: funktioniert auf statischem Hosting ohne Server-Konfiguration. */
export function startRouter(main: HTMLElement, routes: Routes, onChange: (path: string) => void): void {
  let navId = 0;

  async function run() {
    const path = currentPath();
    for (const [re, handler] of routes) {
      const m = re.exec(path);
      if (!m) continue;
      const id = ++navId;
      navCount++;
      const view = document.createElement('div');
      view.className = 'view';
      main.replaceChildren(view);
      main.scrollTop = 0;
      onChange(path);
      await handler({ params: m.slice(1).map(decodeURIComponent), root: view, isCurrent: () => id === navId });
      return;
    }
    navigate('/training');
  }
  window.addEventListener('hashchange', run);
  void run();
}
