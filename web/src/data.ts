import init, { Solar } from './wasm/astro_wasm.js';
import { DWARFS, MOON_NAMES_ES, PARENT_INDEX, SUN_AND_PLANETS, type BodyInfo } from './catalog';
import { loadManifest } from './textures';
import { loadFleet, type Fleet, type Mission } from './spacecraft';

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
  /** Nave espacial (trayectoria de Horizons). */
  mission?: Mission;
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
  /** Registros de `smallbodies.bin` barajados: cualquier prefijo es una muestra representativa. */
  smallRecords: Float32Array;
  smallMeta: SmallBodiesMeta;
  fleet: Fleet;
  /** Índice del primer cuerpo que es una nave (las naves van al final de `bodies`). */
  firstCraft: number;
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
  const [wasm, , fleet] = await Promise.all([init(), loadManifest(), loadFleet()]);
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
  const small = shuffleRecords(new Float32Array(smallBuf), smallMeta.stride);
  const smallClass = new Uint8Array(smallMeta.count);
  for (let k = 0; k < smallMeta.count; k++) smallClass[k] = small[k * smallMeta.stride + 8];

  onProgress('Calculando efemérides');
  const solar = new Solar(moonFlat, moonParent, dwarfFlat, small.slice());

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
  const firstCraft = bodies.length;
  fleet.missions.forEach((m, k) => {
    bodies.push({
      index: firstCraft + k,
      parent: 0,
      semiMajorKm: 0,
      resolved: false,
      mission: m,
      info: { name: m.name, kind: 'craft', radius: 0.01, color: parseInt(m.color.slice(1), 16), description: m.description },
    });
  });
  return { solar, memory: wasm.memory, bodies, smallClass, smallRecords: small, smallMeta, fleet, firstCraft };
}

/** Fisher-Yates con semilla fija: el mismo orden en cada carga. */
function shuffleRecords(data: Float32Array, stride: number): Float32Array {
  const n = data.length / stride;
  const out = new Float32Array(data.length);
  const idx = Array.from({ length: n }, (_, i) => i);
  let seed = 0x9e3779b9;
  const rand = () => ((seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 4294967296);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  idx.forEach((src, dst) => out.set(data.subarray(src * stride, (src + 1) * stride), dst * stride));
  return out;
}

const EN = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'ceres', 'pluto', 'eris', 'makemake', 'haumea'];
export const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Busca un cuerpo por nombre en español o inglés, con o sin tildes ("Plutón", "pluto", "pluton"). */
export function findBody(world: World, name: string) {
  const n = norm(name);
  return world.bodies.find((b) => norm(b.info.name) === n || (b.jplName && norm(b.jplName) === n) || EN[b.index] === n);
}
