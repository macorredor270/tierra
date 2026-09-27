import { afterEach, describe, expect, it, vi } from 'vitest';
import { Clock } from './clock';

describe('Clock', () => {
  afterEach(() => vi.restoreAllMocks());

  it('en modo real devuelve la hora del sistema', () => {
    const c = new Clock();
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    expect(c.ms).toBe(1_700_000_000_000);
  });

  it('en modo simulado avanza a la velocidad elegida, también hacia atrás', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const c = new Clock();
    c.jumpTo(0);
    c.setSpeed(1000);
    now = 1000; // 1 s real
    c.tick();
    expect(c.ms).toBe(1_000_000);
    c.reverse();
    now = 2000;
    c.tick();
    expect(c.ms).toBe(0);
  });

  it('la pausa congela el tiempo', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const c = new Clock();
    c.jumpTo(5000);
    c.pause();
    now = 10_000;
    c.tick();
    expect(c.ms).toBe(5000);
  });
});
