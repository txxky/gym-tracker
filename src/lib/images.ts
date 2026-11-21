import type { Exercise } from './types';

export const IMAGE_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
export const IMAGE_CACHE = 'exercise-images';
/** Grobe Durchschnittsgröße aus einer Stichprobe, nur für die Anzeige der Warnung. */
export const AVG_IMAGE_BYTES = 53_000;

export function imageUrl(path: string): string {
  return IMAGE_BASE + path.split('/').map(encodeURIComponent).join('/');
}

export function exerciseImageUrls(ex: Exercise): string[] {
  return ex.images.map(imageUrl);
}

export function collectImageUrls(exercises: Exercise[]): string[] {
  return exercises.filter((e) => !e.custom).flatMap(exerciseImageUrls);
}

export function formatMB(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

export async function cachedImageCount(): Promise<number> {
  if (!('caches' in window)) return 0;
  const cache = await caches.open(IMAGE_CACHE);
  return (await cache.keys()).length;
}

export interface DownloadProgress {
  done: number;
  total: number;
  failed: number;
}

/**
 * Lädt Bilder in den Cache (CORS-Request, damit keine opaken Antworten entstehen).
 * Bereits gecachte werden übersprungen. Bricht bei Quota-Fehler ab.
 */
export async function downloadImages(
  urls: string[],
  onProgress: (p: DownloadProgress) => void,
  signal: AbortSignal,
  concurrency = 6,
): Promise<DownloadProgress & { quotaExceeded: boolean }> {
  const cache = await caches.open(IMAGE_CACHE);
  const have = new Set((await cache.keys()).map((r) => r.url));
  const todo = urls.filter((u) => !have.has(u));
  const p = { done: urls.length - todo.length, total: urls.length, failed: 0 };
  let quotaExceeded = false;
  let i = 0;
  onProgress({ ...p });

  async function worker() {
    while (i < todo.length && !signal.aborted && !quotaExceeded) {
      const url = todo[i++];
      try {
        const res = await fetch(url, { mode: 'cors', signal });
        if (!res.ok) throw new Error(String(res.status));
        await cache.put(url, res);
        p.done++;
      } catch (err) {
        if (signal.aborted) return;
        if (err instanceof DOMException && err.name === 'QuotaExceededError') quotaExceeded = true;
        else p.failed++;
      }
      onProgress({ ...p });
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return { ...p, quotaExceeded };
}
