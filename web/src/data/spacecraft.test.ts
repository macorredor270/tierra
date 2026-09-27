import { describe, expect, it } from 'vitest';
import { missionState, type Fleet, type Mission } from './spacecraft';

// Órbita circular sintética de 1 au: se muestrea cada 5 días con posición y velocidad
const AU = 149_597_870.7;
const T = 365.25; // días
const W = (2 * Math.PI) / (T * 86400); // rad/s

function fleet(step: number, count: number): { f: Fleet; m: Mission } {
  const data = new Float32Array(count * 6);
  for (let k = 0; k < count; k++) {
    const t = k * step * 86400;
    data.set([AU * Math.cos(W * t), AU * Math.sin(W * t), 0, -AU * W * Math.sin(W * t), AU * W * Math.cos(W * t), 0], k * 6);
  }
  const m: Mission = {
    id: 0,
    name: 'x',
    agency: '',
    color: '#fff',
    description: '',
    launch: '',
    jd0: 2451545,
    step,
    count,
    offset: 0,
  };
  return { f: { missions: [m], tracks: [], data, stride: 6 }, m };
}

describe('interpolación de Hermite', () => {
  it('reproduce una órbita circular entre muestras separadas 5 días', () => {
    const { f, m } = fleet(5, 80);
    const pos = new Float64Array(3);
    const vel = new Float64Array(3);
    for (const days of [2.5, 37.3, 100.9, 211.1]) {
      expect(missionState(f, m, 2451545 + days, pos, vel)).toBe(true);
      const ang = W * days * 86400;
      // escena = (x, z, −y) de la eclíptica
      const err = Math.hypot(pos[0] - AU * Math.cos(ang), pos[2] + AU * Math.sin(ang));
      expect(err).toBeLessThan(2000); // km, sobre 150 millones
      expect(Math.hypot(vel[0], vel[1], vel[2])).toBeCloseTo(AU * W, 1);
    }
  });

  it('no da posición fuera del intervalo de la misión', () => {
    const { f, m } = fleet(5, 10);
    expect(missionState(f, m, 2451544, new Float64Array(3), new Float64Array(3))).toBe(false);
    expect(missionState(f, m, 2451545 + 46, new Float64Array(3), new Float64Array(3))).toBe(false);
  });
});
