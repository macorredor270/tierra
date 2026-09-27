// Naves espaciales: trayectorias de JPL Horizons interpoladas con splines de Hermite cúbicos.
//
// Cada muestra trae posición (km) y velocidad (km/s). Con la derivada, el polinomio de Hermite
// reproduce las curvas de los sobrevuelos aunque las muestras estén separadas horas o días.

export interface Mission {
  id: number;
  name: string;
  agency: string;
  color: string;
  description: string;
  launch: string;
  jd0: number;
  step: number;
  count: number;
  offset: number;
}

/** Efeméride tabulada que sustituye a la kepleriana de un cuerpo (p. ej. Plutón). */
export interface Track {
  id: string;
  body: number;
  jd0: number;
  step: number;
  count: number;
  offset: number;
}

export interface Fleet {
  missions: Mission[];
  tracks: Track[];
  data: Float32Array;
  stride: number;
}

const J2000 = 2451545.0;

export async function loadFleet(): Promise<Fleet> {
  const [meta, buf] = await Promise.all([
    fetch('data/spacecraft.json').then((r) => r.json()),
    fetch('data/spacecraft.bin').then((r) => r.arrayBuffer()),
  ]);
  return { missions: meta.missions, tracks: meta.tracks ?? [], data: new Float32Array(buf), stride: meta.stride };
}

export function missionRange(m: Mission): [number, number] {
  return [m.jd0, m.jd0 + m.step * (m.count - 1)];
}

/**
 * Estado heliocéntrico en coordenadas de escena (x, z, −y de la eclíptica): posición en km y
 * velocidad en km/s. Devuelve false si la nave no existía (o no hay datos) en ese instante.
 */
export function missionState(f: Fleet, m: Mission | Track, jdTdb: number, pos: Float64Array, vel: Float64Array): boolean {
  const u = (jdTdb - m.jd0) / m.step;
  if (!(u >= 0 && u <= m.count - 1)) return false;
  const k = Math.min(Math.floor(u), m.count - 2);
  const t = u - k;
  const s = f.stride;
  const a = (m.offset + k * s), b = a + s;
  const d = f.data;
  const h = m.step * 86400; // segundos entre muestras
  const t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  // derivadas de las bases (para la velocidad)
  const d00 = (6 * t2 - 6 * t) / h, d10 = 3 * t2 - 4 * t + 1, d01 = (-6 * t2 + 6 * t) / h, d11 = 3 * t2 - 2 * t;
  const e = [0, 0, 0], v = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const p0 = d[a + c], p1 = d[b + c], m0 = d[a + 3 + c], m1 = d[b + 3 + c];
    e[c] = h00 * p0 + h10 * h * m0 + h01 * p1 + h11 * h * m1;
    v[c] = d00 * p0 + d10 * m0 + d01 * p1 + d11 * m1;
  }
  pos[0] = e[0]; pos[1] = e[2]; pos[2] = -e[1];
  vel[0] = v[0]; vel[1] = v[2]; vel[2] = -v[1];
  return true;
}

/** Trayectoria completa en coordenadas de escena (km, float32), submuestreada. */
export function missionPath(f: Fleet, m: Mission, maxPoints = 4000): Float32Array {
  const every = Math.max(1, Math.ceil(m.count / maxPoints));
  const n = Math.floor((m.count - 1) / every) + 1;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = m.offset + i * every * f.stride;
    out[i * 3] = f.data[a];
    out[i * 3 + 1] = f.data[a + 2];
    out[i * 3 + 2] = -f.data[a + 1];
  }
  return out;
}

/** Fecha (ms Unix) más cercana dentro de la misión, para saltar ahí si se elige fuera de rango. */
export function clampToMission(m: Mission, ms: number): number {
  const [a, b] = missionRange(m);
  const toMs = (jd: number) => (jd - 2440587.5) * 86400000 - 69184;
  return Math.min(Math.max(ms, toMs(a) + 86400000), toMs(b) - 86400000);
}

export const jdTdbFromMs = (ms: number) => ms / 86400000 + 2440587.5 + 69.184 / 86400;
export const daysSinceJ2000 = (jdTdb: number) => jdTdb - J2000;
