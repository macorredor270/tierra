import { describe, expect, it } from 'vitest';
import { fromPreset, PRESETS, type HardwareInfo } from './graphics';

const hw = (over: Partial<HardwareInfo> = {}): HardwareInfo => ({
  gpu: 'x',
  vendor: 'x',
  cores: 8,
  maxTexture: 16384,
  maxSamples: 8,
  pixelRatio: 1,
  mobile: false,
  software: false,
  tier: 'high',
  ...over,
});

describe('presets gráficos', () => {
  it('ultra usa texturas 8K y MSAA 8x cuando la GPU lo admite', () => {
    const g = fromPreset('ultra', hw());
    expect(g.textures).toBe(8);
    expect(g.msaa).toBe(8);
    expect(g.smallGpu).toBe(true);
  });
  it('se adapta a los límites de la GPU', () => {
    const g = fromPreset('ultra', hw({ maxTexture: 4096, maxSamples: 4 }));
    expect(g.textures).toBe(4);
    expect(g.msaa).toBe(4);
  });
  it('sin GPU (render por software) calcula los asteroides en la CPU', () => {
    expect(fromPreset('low', hw({ software: true })).smallGpu).toBe(false);
  });
  it('cada preset es más exigente que el anterior', () => {
    const order = ['low', 'medium', 'high', 'ultra'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(PRESETS[order[i]].textures).toBeGreaterThanOrEqual(PRESETS[order[i - 1]].textures);
      expect(PRESETS[order[i]].msaa).toBeGreaterThanOrEqual(PRESETS[order[i - 1]].msaa);
    }
  });
});
