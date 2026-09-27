import { describe, expect, it } from 'vitest';
import { findBody, norm, type Body, type World } from './world';

const body = (index: number, name: string, jplName?: string): Body =>
  ({
    index,
    parent: 0,
    semiMajorKm: 0,
    resolved: true,
    jplName,
    info: { name, kind: 'planet', radius: 1, color: 0, description: '' },
  }) as Body;

const world = { bodies: [body(0, 'Sol'), body(4, 'Marte'), body(10, 'Plutón'), body(20, 'Ío', 'Io')] } as unknown as World;
world.bodies[1].index = 4;

describe('findBody', () => {
  it('ignora mayúsculas y tildes', () => {
    expect(norm('  Plutón ')).toBe('pluton');
    expect(findBody(world, 'PLUTON')?.info.name).toBe('Plutón');
  });
  it('acepta nombres en inglés', () => {
    expect(findBody(world, 'mars')?.info.name).toBe('Marte');
    expect(findBody(world, 'io')?.info.name).toBe('Ío');
  });
  it('devuelve undefined si no existe', () => {
    expect(findBody(world, 'Vulcano')).toBeUndefined();
  });
});
