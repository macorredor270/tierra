// Hilo de cálculo: una instancia propia del motor WASM que propaga su porción de cuerpos pequeños.
import init, { Solar } from '../wasm/astro_wasm.js';

let solar: Solar | null = null;
let memory: WebAssembly.Memory;
let count = 0;

type Msg =
  | { type: 'init'; small: Float32Array }
  | { type: 'compute'; id: number; jd: number; anchor: [number, number, number]; out: Float32Array };

self.onmessage = async (e: MessageEvent<Msg>) => {
  const m = e.data;
  if (m.type === 'init') {
    memory = (await init()).memory;
    solar?.free();
    solar = new Solar(new Float64Array(0), new Uint32Array(0), new Float64Array(0), m.small);
    count = solar.small_count();
    self.postMessage({ type: 'ready' });
    return;
  }
  if (!solar) return;
  const t0 = performance.now();
  solar.set_time(m.jd);
  solar.update_small(m.anchor[0], m.anchor[1], m.anchor[2]);
  m.out.set(new Float32Array(memory.buffer, solar.small_ptr(), count * 3));
  const ms = performance.now() - t0;
  (self as unknown as Worker).postMessage({ type: 'done', id: m.id, out: m.out, ms }, [m.out.buffer]);
};
