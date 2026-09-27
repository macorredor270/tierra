import { describe, expect, it } from 'vitest';
import { duration, formatDate, km, lightTime, speedLabel } from './format';

describe('format', () => {
  it('usa au a partir de 10 millones de km', () => {
    expect(km(384_400)).toMatch(/384.400 km/);
    expect(km(149_597_870.7)).toMatch(/^1 au$/);
  });

  it('expresa periodos en horas, días o años', () => {
    expect(duration(0.5)).toMatch(/12 h/);
    expect(duration(27.3)).toMatch(/27,3 días/);
    expect(duration(-243)).toMatch(/retrógrado/);
    expect(duration(365.25 * 11.86)).toMatch(/11,86 años/);
  });

  it('calcula el tiempo de luz', () => {
    expect(lightTime(149_597_870.7)).toBe('8 min 19 s');
    expect(lightTime(384_400)).toMatch(/1,28 s/);
  });

  it('formatea años antes de Cristo', () => {
    const ms = Date.UTC(-999, 2, 1); // año astronómico −999 = 1000 a.C.
    expect(formatDate(ms, true).date).toBe('01/03/1000 a.C.');
  });

  it('abrevia las velocidades', () => {
    expect(speedLabel(1)).toBe('×1');
    expect(speedLabel(10_000)).toBe('×10k');
    expect(speedLabel(1_000_000)).toBe('×1M');
  });
});
