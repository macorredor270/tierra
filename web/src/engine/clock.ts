// Reloj de la simulación. En modo "real" el instante es exactamente Date.now(): las posiciones
// son las de ahora mismo. En modo "simulado" el tiempo avanza a la velocidad elegida.

export const SPEEDS = [1, 5, 20, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000];

export type ClockMode = 'real' | 'sim';

export class Clock {
  mode: ClockMode = 'real';
  speed = 1;
  direction: 1 | -1 = 1;
  paused = false;
  private simMs = Date.now();
  private lastReal = performance.now();

  /** Instante actual de la simulación en milisegundos Unix. */
  get ms(): number {
    return this.mode === 'real' ? Date.now() : this.simMs;
  }

  tick(): void {
    const now = performance.now();
    const dt = now - this.lastReal;
    this.lastReal = now;
    if (this.mode === 'sim' && !this.paused) {
      this.simMs += dt * this.speed * this.direction;
      // Rango de la Tabla 2 de JPL: 3000 a.C. – 3000 d.C.
      this.simMs = Math.min(Math.max(this.simMs, -156_000_000_000_000), 32_500_000_000_000);
    }
  }

  setReal(): void {
    this.mode = 'real';
    this.paused = false;
    this.speed = 1;
    this.direction = 1;
  }

  setSpeed(speed: number): void {
    if (this.mode === 'real') this.simMs = Date.now();
    this.mode = 'sim';
    this.speed = speed;
    this.paused = false;
  }

  pause(): void {
    if (this.mode === 'real') {
      this.simMs = Date.now();
      this.mode = 'sim';
      this.speed = 1;
    }
    this.paused = true;
  }

  togglePause(): void {
    if (this.mode === 'real') {
      this.simMs = Date.now();
      this.mode = 'sim';
      this.speed = 1;
      this.paused = true;
    } else {
      this.paused = !this.paused;
    }
  }

  reverse(): void {
    if (this.mode === 'real') this.setSpeed(1);
    this.direction = this.direction === 1 ? -1 : 1;
  }

  jumpTo(ms: number): void {
    this.simMs = ms;
    this.mode = 'sim';
  }
}
