import { beforeAll, describe, expect, it, vi } from 'vitest';

const file = (body: string, level: number, bytes = 100) => ({
  path: `textures/${body}/${level}k.jpg`,
  body,
  level,
  bytes,
  sha256: 'x',
});
const manifest = {
  version: 1,
  sources: {},
  files: [
    ...[1, 2, 4, 8].map((l) => file('mars', l, l * 100)),
    ...[1, 2].map((l) => file('venus', l, l * 100)),
    { path: 'textures/earth/water-4k.png', body: 'earth', level: 4, bytes: 50, sha256: 'x' },
  ],
};

beforeAll(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ json: async () => manifest })),
  );
});

describe('selección de archivos a instalar', () => {
  it('elige el mejor nivel de cada cuerpo que no supere la calidad, más el de 1K', async () => {
    const { filesFor } = await import('./installer');
    const paths = (await filesFor(4)).map((f) => f.path).sort();
    expect(paths).toEqual([
      'textures/earth/water-4k.png',
      'textures/mars/1k.jpg',
      'textures/mars/4k.jpg',
      'textures/venus/1k.jpg',
      'textures/venus/2k.jpg',
    ]);
  });
  it('suma el tamaño total', async () => {
    const { sizeFor } = await import('./installer');
    expect(await sizeFor(8)).toBe(100 + 800 + 100 + 200 + 50);
  });
});
