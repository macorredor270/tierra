// Reparte la propagación de los cuerpos pequeños entre varios núcleos de la CPU.
//
// Cada worker calcula posiciones relativas a un "ancla" (el foco de la cámara cuando se pidió el
// cálculo). El hilo principal coloca la nube de puntos en (ancla − foco actual), una resta en
// f64 que es exacta aunque el resultado llegue un frame tarde.

import SmallWorker from './smallWorker.ts?worker';

type V3 = [number, number, number];

interface Slot {
  worker: Worker;
  offset: number;
  count: number;
  out: Float32Array | null;
  ready: boolean;
}

export class SmallPool {
  private slots: Slot[] = [];
  private pending = 0;
  private requestId = 0;
  private requestAnchor: V3 = [0, 0, 0];
  /** Ancla del último resultado completo copiado en `target`. */
  anchor: V3 = [0, 0, 0];
  /** Tiempo del worker más lento en el último ciclo completo (ms). */
  lastMs = 0;
  private cycleMs = 0;
  fresh = false;

  constructor(
    records: Float32Array,
    stride: number,
    threads: number,
    private target: Float32Array,
  ) {
    const n = records.length / stride;
    const per = Math.ceil(n / threads);
    for (let t = 0; t < threads; t++) {
      const offset = t * per;
      const count = Math.max(0, Math.min(per, n - offset));
      if (!count) break;
      const worker = new SmallWorker();
      const slot: Slot = { worker, offset, count, out: new Float32Array(count * 3), ready: false };
      worker.onmessage = (e) => this.onMessage(slot, e.data);
      worker.postMessage({ type: 'init', small: records.slice(offset * stride, (offset + count) * stride) });
      this.slots.push(slot);
    }
  }

  get threads(): number {
    return this.slots.length;
  }

  /** Lanza un nuevo cálculo si el anterior ya terminó. */
  request(jd: number, anchor: V3): void {
    if (this.pending > 0 || !this.slots.every((s) => s.ready && s.out)) return;
    this.requestId++;
    this.requestAnchor = anchor;
    this.pending = this.slots.length;
    this.cycleMs = 0;
    for (const s of this.slots) {
      const out = s.out!;
      s.out = null;
      s.worker.postMessage({ type: 'compute', id: this.requestId, jd, anchor, out }, [out.buffer]);
    }
  }

  private staged: { slot: Slot; out: Float32Array }[] = [];

  private onMessage(slot: Slot, m: { type: string; id?: number; out?: Float32Array; ms?: number }): void {
    if (m.type === 'ready') {
      slot.ready = true;
      return;
    }
    if (m.type !== 'done' || m.id !== this.requestId) return;
    this.staged.push({ slot, out: m.out! });
    this.cycleMs = Math.max(this.cycleMs, m.ms ?? 0);
    if (--this.pending === 0) {
      // Todos los hilos han terminado: se publica el conjunto entero de golpe
      for (const { slot: s, out } of this.staged) {
        this.target.set(out, s.offset * 3);
        s.out = out;
      }
      this.staged = [];
      this.anchor = this.requestAnchor;
      this.lastMs = this.cycleMs;
      this.fresh = true;
    }
  }

  dispose(): void {
    for (const s of this.slots) s.worker.terminate();
    this.slots = [];
  }
}
