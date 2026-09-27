// Descarga de texturas a Cache Storage con progreso, verificación sha256, pausa y reanudación.
import { loadManifest, type TextureFile } from './textures';

export const ASSET_CACHE = 'sistema-solar-assets-v1';
const KEY = 'sistema-solar/instalacion/v1';
const CONCURRENCY = 4;

export type Quality = 2 | 4 | 8;

export interface InstallState {
  quality: Quality;
  files: number;
  bytes: number;
  date: string;
}

export interface Progress {
  doneBytes: number;
  totalBytes: number;
  doneFiles: number;
  totalFiles: number;
  bytesPerSec: number;
  current: string;
}

/** Archivos necesarios para una calidad: el nivel elegido de cada cuerpo, más 1K para el arranque. */
export async function filesFor(q: Quality): Promise<TextureFile[]> {
  const m = await loadManifest();
  const byBody = new Map<string, number[]>();
  for (const f of m.files) byBody.set(f.body, [...new Set([...(byBody.get(f.body) ?? []), f.level])]);
  return m.files.filter((f) => {
    const avail = (byBody.get(f.body) ?? []).filter((l) => l <= q);
    const best = avail.length ? Math.max(...avail) : Math.min(...(byBody.get(f.body) ?? [1]));
    return f.level === best || f.level === 1 || f.path.includes('water-');
  });
}

export async function sizeFor(q: Quality): Promise<number> {
  return (await filesFor(q)).reduce((s, f) => s + f.bytes, 0);
}

export function installed(): InstallState | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}

async function sha256(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class Installer {
  private aborted = false;
  paused = false;
  private resume: (() => void) | null = null;

  constructor(private quality: Quality, private onProgress: (p: Progress) => void) {}

  pause(): void {
    this.paused = true;
  }

  play(): void {
    this.paused = false;
    this.resume?.();
    this.resume = null;
  }

  cancel(): void {
    this.aborted = true;
    this.play();
  }

  async run(): Promise<InstallState> {
    const files = await filesFor(this.quality);
    const cache = await caches.open(ASSET_CACHE);
    const total = files.reduce((s, f) => s + f.bytes, 0);
    const p: Progress = { doneBytes: 0, totalBytes: total, doneFiles: 0, totalFiles: files.length, bytesPerSec: 0, current: '' };
    const t0 = performance.now();
    const queue = [...files];

    const worker = async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        if (this.aborted) return;
        while (this.paused) await new Promise<void>((r) => (this.resume = r));
        // Ya instalado y válido: se salta (reanudar tras cerrar la pestaña)
        const hit = await cache.match(f.path);
        if (hit && Number(hit.headers.get('content-length') ?? f.bytes) === f.bytes) {
          p.doneBytes += f.bytes;
          p.doneFiles++;
          this.onProgress({ ...p });
          continue;
        }
        p.current = f.path.replace('textures/', '');
        const res = await fetch(f.path, { cache: 'no-store' });
        if (!res.ok || !res.body) throw new Error(`${f.path}: HTTP ${res.status}`);
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          p.doneBytes += value.byteLength;
          p.bytesPerSec = p.doneBytes / ((performance.now() - t0) / 1000);
          this.onProgress({ ...p });
        }
        const blob = new Blob(chunks as BlobPart[], { type: res.headers.get('content-type') ?? 'image/jpeg' });
        const buf = await blob.arrayBuffer();
        if ((await sha256(buf)) !== f.sha256) throw new Error(`${f.path}: la suma sha256 no coincide`);
        await cache.put(f.path, new Response(blob, { headers: { 'content-type': blob.type, 'content-length': String(blob.size) } }));
        p.doneFiles++;
        this.onProgress({ ...p });
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (this.aborted) throw new Error('cancelado');
    // Datos del motor (efemérides, estrellas, asteroides) también offline
    await cache.addAll(['data/moons.json', 'data/dwarfs.json', 'data/smallbodies.json', 'data/smallbodies.bin', 'data/stars.bin', 'data/stars.json', 'textures/manifest.json']);
    const state: InstallState = { quality: this.quality, files: files.length, bytes: total, date: new Date().toISOString() };
    localStorage.setItem(KEY, JSON.stringify(state));
    return state;
  }
}

export async function uninstall(): Promise<void> {
  await caches.delete(ASSET_CACHE);
  localStorage.removeItem(KEY);
}

export function registerServiceWorker(): void {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* sin SW (p. ej. http sin localhost): la app funciona igual, solo sin caché offline */
    });
  }
}
