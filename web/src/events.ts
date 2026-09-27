// Eventos astronómicos calculados por el motor Rust (eclipses, oposiciones, elongaciones).
import { Solar } from './wasm/astro_wasm.js';
import type { World } from './data';

export interface AstroEvent {
  jd: number;
  type: 'solar' | 'lunar' | 'opposition' | 'elongation';
  kind?: string;
  gamma?: number;
  magnitude?: number;
  body?: number;
  degrees?: number;
  east?: boolean;
}

const MS_PER_DAY = 86_400_000;
export const jdToMs = (jd: number) => (jd - 2440587.5) * MS_PER_DAY;
export const msToJd = (ms: number) => ms / MS_PER_DAY + 2440587.5;

export function findEvents(fromMs: number, toMs: number): AstroEvent[] {
  return JSON.parse(Solar.events_json(msToJd(fromMs), msToJd(toMs))) as AstroEvent[];
}

const MOON = (w: World) => w.bodies.findIndex((b) => b.jplName === 'Moon');

export function describe(ev: AstroEvent, world: World): { title: string; detail: string; icon: string } {
  const name = ev.body != null ? world.bodies[ev.body].info.name : '';
  switch (ev.type) {
    case 'solar':
      return {
        icon: '◐',
        title: `Eclipse solar ${ev.kind}`,
        detail: `γ = ${ev.gamma?.toFixed(3)} · la sombra de la Luna ${Math.abs(ev.gamma ?? 0) < 1 ? 'cruza la Tierra' : 'roza la Tierra'}`,
      };
    case 'lunar':
      return {
        icon: '◑',
        title: `Eclipse lunar ${ev.kind}`,
        detail: `magnitud umbral ${ev.magnitude?.toFixed(2)}`,
      };
    case 'opposition':
      return { icon: '☍', title: `Oposición de ${name}`, detail: 'Mejor momento para observarlo: toda la noche visible' };
    case 'elongation':
      return {
        icon: '∠',
        title: `Máxima elongación de ${name}`,
        detail: `${ev.degrees?.toFixed(1)}° al ${ev.east ? 'este (al anochecer)' : 'oeste (al amanecer)'}`,
      };
  }
}

/** Cómo mostrar cada evento: a qué cuerpo ir, a qué distancia y desde dónde mirar. */
export function eventView(ev: AstroEvent, world: World): { ms: number; focus: number; dist?: number; from?: number } {
  const ms = jdToMs(ev.jd);
  switch (ev.type) {
    case 'solar':
      return { ms, focus: 3, dist: 26000, from: MOON(world) };
    case 'lunar':
      return { ms, focus: MOON(world), dist: 9000, from: 0 };
    case 'opposition':
      return { ms, focus: ev.body!, from: 3 };
    case 'elongation':
      return { ms, focus: 3, dist: 2.2e8, from: undefined };
  }
}
