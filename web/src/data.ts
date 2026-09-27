import init, { Solar } from './wasm/astro_wasm.js';
import { DWARFS, MOON_NAMES_ES, PARENT_INDEX, SUN_AND_PLANETS, type BodyInfo } from './catalog';

export interface MoonRecord {
  name: string;
  parent: string;
  code: number;
  ephemeris: string;
  frame: 'ecliptic' | 'laplace' | 'equatorial';
  epoch: number;
  a: number; e: number; w: number; M: number; i: number; node: number;
  P: number; Papsis: number; Pnode: number;
  poleRa: number | null; poleDec: number | null;
  radius: number | null; gm: number | null;
}

export interface Body {
  index: number;
  info: BodyInfo;
  /** Nombre original de JPL (lunas). */
  jplName?: string;
  parent: number;
  moon?: MoonRecord;
  /** Semieje mayor en km (para decidir cuándo mostrar la órbita). */
  semiMajorKm: number;
  /** Tiene radio medido: se dibuja como esfera. */
  resolved: boolean;
}

export interface SmallBodiesMeta {
  count: number;
  stride: number;
  classes: Record<string, number>;
  counts: Record<string, number>;
}

export interface World {
  solar: Solar;
  memory: WebAssembly.Memory;
  bodies: Body[];
  smallClass: Uint8Array;
  smallMeta: SmallBodiesMeta;
}

const AU = 149_597_870.7;
const PLANET_A_AU = [0.387, 0.723, 1.0, 1.524, 5.203, 9.537, 19.19, 30.07];

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json() as Promise<T>;
}

export async function loadWorld(onProgress: (msg: string) => void): Promise<World> {
  onProgress('Iniciando motor WebAssembly');
  const wasm = await init();
  onProgress('Descargando elementos orbitales de JPL');
  const [moonsJson, dwarfsJson, smallMeta, smallBuf] = await Promise.all([
    fetchJson<{ moons: MoonRecord[] }>('data/moons.json'),
    fetchJson<{ bodies: { epoch: number; a: number; e: number; i: number; om: number; w: number; ma: number }[] }>('data/dwarfs.json'),
    fetchJson<SmallBodiesMeta>('data/smallbodies.json'),
    fetch('data/smallbodies.bin').then((r) => r.arrayBuffer()),
  ]);

  const moons = moonsJson.moons.filter((m) => PARENT_INDEX[m.parent] !== undefined);
  const moonFlat = new Float64Array(moons.length * 13);
  const moonParent = new Uint32Array(moons.length);
  moons.forEach((m, k) => {
    const pole = m.frame !== 'ecliptic';
    moonFlat.set([
      pole ? 1 : 0, m.poleRa ?? 0, m.poleDec ?? 90, m.epoch, m.a, m.e, m.w, m.M, m.i, m.node,
      m.P, m.Papsis, m.Pnode,
    ], k * 13);
    moonParent[k] = PARENT_INDEX[m.parent];
  });
  const dwarfFlat = new Float64Array(dwarfsJson.bodies.flatMap((d) => [d.epoch, d.a, d.e, d.i, d.om, d.w, d.ma]));
  const small = new Float32Array(smallBuf);
  const smallClass = new Uint8Array(smallMeta.count);
  for (let k = 0; k < smallMeta.count; k++) smallClass[k] = small[k * smallMeta.stride + 8];

  onProgress('Calculando efemérides');
  const solar = new Solar(moonFlat, moonParent, dwarfFlat, small);

  const bodies: Body[] = [];
  SUN_AND_PLANETS.forEach((info, k) =>
    bodies.push({ index: k, info, parent: 0, semiMajorKm: k === 0 ? 0 : PLANET_A_AU[k - 1] * AU, resolved: true }));
  DWARFS.forEach((info, k) =>
    bodies.push({ index: 9 + k, info, parent: 0, semiMajorKm: dwarfsJson.bodies[k].a * AU, resolved: true }));
  moons.forEach((m, k) => {
    const resolved = m.radius != null;
    bodies.push({
      index: 14 + k,
      jplName: m.name,
      parent: PARENT_INDEX[m.parent],
      moon: m,
      semiMajorKm: m.a,
      resolved,
      info: {
        name: MOON_NAMES_ES[m.name] ?? m.name,
        kind: 'moon',
        radius: m.radius ?? 5,
        massKg: m.gm ? (m.gm * 1e9) / 6.6743e-11 : undefined,
        color: 0xb8b2a8,
        description: '',
      },
    });
  });
  return { solar, memory: wasm.memory, bodies, smallClass, smallMeta };
}
