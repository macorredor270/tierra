// Catálogo de texturas generado por scripts/build_textures.py (web/public/textures/manifest.json).
import type { Body } from './data';

export interface TextureFile {
  path: string;
  body: string;
  level: number;
  bytes: number;
  sha256: string;
}

export interface TextureManifest {
  version: number;
  files: TextureFile[];
  sources: Record<string, { url: string; credit: string; processing: string }>;
}

let manifest: TextureManifest | null = null;
const levels = new Map<string, number[]>();

export async function loadManifest(): Promise<TextureManifest> {
  if (manifest) return manifest;
  manifest = (await fetch('textures/manifest.json').then((r) => r.json())) as TextureManifest;
  for (const f of manifest.files) {
    // La Tierra tiene varios mapas por nivel (día, noche, nubes): cuenta el de día
    if (f.body === 'earth' && !f.path.includes('/day-')) continue;
    const l = levels.get(f.body) ?? [];
    if (!l.includes(f.level)) l.push(f.level);
    levels.set(f.body, l.sort((a, b) => a - b));
  }
  return manifest;
}

export function getManifest(): TextureManifest | null {
  return manifest;
}

const PRIMARY_KEYS = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const DWARF_KEYS: Record<number, string> = { 10: 'pluto' };

/** Nombre de la carpeta de texturas del cuerpo, o null si no tiene (se dibuja procedural). */
export function textureKey(b: Body): string | null {
  const key = b.index < 9 ? PRIMARY_KEYS[b.index] : DWARF_KEYS[b.index] ?? b.jplName?.toLowerCase() ?? null;
  return key && levels.has(key) ? key : null;
}

/** Mejor nivel disponible (1, 2, 4 u 8K) que no supere la calidad pedida. */
export function pickLevel(key: string, quality: number): number {
  const l = levels.get(key) ?? [];
  const fit = l.filter((x) => x <= quality);
  return fit.length ? fit[fit.length - 1] : l[0] ?? 1;
}

export function texturePath(key: string, level: number, layer?: string): string {
  return key === 'earth' ? `textures/earth/${layer ?? 'day'}-${level}k.jpg` : `textures/${key}/${level}k.jpg`;
}

export function creditFor(key: string | null): string | undefined {
  return key ? manifest?.sources[key]?.credit : undefined;
}
