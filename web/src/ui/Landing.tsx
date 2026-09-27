import { useEffect, useMemo, useRef, useState } from 'react';
import { installed, Installer, registerServiceWorker, sizeFor, uninstall, type InstallState, type Progress, type Quality } from '../installer';

const QUALITIES: { q: Quality; label: string; hint: string }[] = [
  { q: 2, label: 'Medio', hint: '2K · portátiles y móviles' },
  { q: 4, label: 'Alto', hint: '4K · la mayoría de GPUs' },
  { q: 8, label: 'Ultra', hint: '8K · GPU dedicada' },
];

const mb = (b: number) => `${(b / 2 ** 20).toFixed(b > 100 * 2 ** 20 ? 0 : 1)} MB`;
const eta = (s: number) => (s < 60 ? `${Math.ceil(s)} s` : `${Math.floor(s / 60)} min ${Math.ceil(s % 60)} s`);

function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    let raf = 0;
    const stars = Array.from({ length: 700 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random() ** 2, t: Math.random() * 6 }));
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draw = (now: number) => {
      const dpr = Math.min(devicePixelRatio, 2);
      if (c.width !== innerWidth * dpr) { c.width = innerWidth * dpr; c.height = innerHeight * dpr; }
      g.clearRect(0, 0, c.width, c.height);
      for (const s of stars) {
        const tw = reduce ? 1 : 0.75 + 0.25 * Math.sin(now / 900 + s.t * 7);
        const x = ((s.x + (reduce ? 0 : now * 0.0000035 * (0.3 + s.z))) % 1) * c.width;
        g.fillStyle = `rgba(220,230,255,${(0.25 + 0.75 * s.z) * tw})`;
        g.beginPath();
        g.arc(x, s.y * c.height, (0.4 + s.z * 1.4) * dpr, 0, Math.PI * 2);
        g.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 h-full w-full" aria-hidden />;
}

/** Globo terráqueo con CSS: textura NASA desplazándose dentro de un disco con sombreado. */
function Globe() {
  return (
    <div className="relative mx-auto aspect-square w-[min(78vw,460px)]" aria-hidden>
      <div className="absolute -inset-[9%] rounded-full bg-[radial-gradient(circle,rgba(111,180,255,0.35)_0%,rgba(111,180,255,0.08)_45%,transparent_70%)] blur-xl" />
      <div
        className="globe absolute inset-0 overflow-hidden rounded-full"
        style={{ backgroundImage: 'url(textures/earth/day-2k.jpg)' }}
      >
        <div className="globe-clouds absolute inset-0" style={{ backgroundImage: 'url(textures/earth/clouds-2k.jpg)' }} />
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_32%_30%,transparent_28%,rgba(2,3,10,0.55)_62%,rgba(2,3,10,0.97)_78%)]" />
        <div className="absolute inset-0 rounded-full shadow-[inset_10px_0_40px_rgba(140,200,255,0.55),inset_-40px_-10px_60px_rgba(0,0,0,0.9)]" />
      </div>
    </div>
  );
}

const FEATURES = [
  ['Efemérides de JPL', 'Planetas con los elementos de Standish, la Luna con la teoría de Meeus y 460 lunas de JPL, comparados en los tests con JPL Horizons.'],
  ['Rust → WebAssembly', 'El motor orbital está escrito en Rust y reparte el cálculo de 84.000 asteroides entre los núcleos de tu CPU.'],
  ['Eclipses reales', 'Umbra y penumbra calculadas con el tamaño real del Sol: la Luna roja en un eclipse lunar, la sombra de Ío sobre Júpiter.'],
  ['Texturas de misiones', 'Mosaicos de NASA y USGS: Cassini, Galileo, Voyager, New Horizons, MESSENGER, Viking, LRO. Hasta 8K.'],
  ['Escala real', 'Tamaños y distancias reales, del suelo de Fobos a la órbita de Eris, sin temblores gracias al origen flotante.'],
  ['Funciona sin conexión', 'Instala las texturas una vez y el simulador arranca al instante, incluso offline. Se puede instalar como app.'],
];

const STATS = [
  ['460', 'lunas'],
  ['83.867', 'asteroides y cometas'],
  ['15.598', 'estrellas reales'],
  ['< 0,02°', 'error frente a JPL'],
];

export function Landing({ onEnter }: { onEnter: () => void }) {
  const [quality, setQuality] = useState<Quality>(() => installed()?.quality ?? 4);
  const [sizes, setSizes] = useState<Record<number, number>>({});
  const [state, setState] = useState<InstallState | null>(installed);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const inst = useRef<Installer | null>(null);

  useEffect(() => {
    registerServiceWorker();
    Promise.all(QUALITIES.map(async ({ q }) => [q, await sizeFor(q)] as const))
      .then((r) => setSizes(Object.fromEntries(r)))
      .catch(() => setError('No se pudo leer el catálogo de texturas'));
  }, []);

  const install = async () => {
    setError(null);
    setPaused(false);
    const i = new Installer(quality, setProgress);
    inst.current = i;
    try {
      const st = await i.run();
      setState(st);
      // El simulador usará por defecto la calidad instalada
      try {
        const k = 'sistema-solar/graficos/v1';
        const g = JSON.parse(localStorage.getItem(k) ?? '{}');
        localStorage.setItem(k, JSON.stringify({ ...g, textures: quality }));
      } catch { /* sin almacenamiento */ }
    } catch (e) {
      if (String(e).includes('cancelado')) setProgress(null);
      else setError(String(e instanceof Error ? e.message : e));
    } finally {
      inst.current = null;
    }
  };

  const pct = progress ? (progress.doneBytes / Math.max(progress.totalBytes, 1)) * 100 : 0;
  const installing = !!inst.current && !!progress && progress.doneFiles < progress.totalFiles;
  const remaining = progress && progress.bytesPerSec > 0 ? (progress.totalBytes - progress.doneBytes) / progress.bytesPerSec : 0;
  const upToDate = state && state.quality >= quality;

  const heroCta = useMemo(
    () => (upToDate ? 'Entrar al simulador' : 'Entrar sin instalar'),
    [upToDate],
  );

  return (
    <div className="relative h-full overflow-y-auto overflow-x-hidden bg-[radial-gradient(ellipse_at_top,#0b1330_0%,#02030a_60%)] select-text">
      <Starfield />

      <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <span className="text-xs font-semibold tracking-[0.32em]">SISTEMA SOLAR</span>
        <div className="flex items-center gap-5 text-[13px] text-slate-300">
          <a href="#caracteristicas" className="hover:text-white">Características</a>
          <a href="#texturas" className="hover:text-white">Texturas</a>
          <a href="https://github.com/macorredor270/tierra" className="hover:text-white" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </nav>

      <header className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 px-5 pt-6 pb-16 md:grid-cols-[1.1fr_1fr] md:pt-14">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-live/30 bg-live/10 px-3 py-1 text-[11px] font-semibold tracking-widest text-live">
            <span className="animate-blink">●</span> POSICIONES REALES, AHORA MISMO
          </span>
          <h1 className="mt-5 text-4xl leading-[1.05] font-semibold tracking-tight md:text-6xl">
            El sistema solar,<br />
            <span className="bg-gradient-to-r from-sky-300 via-indigo-200 to-amber-200 bg-clip-text text-transparent">en tiempo real.</span>
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-slate-300">
            Cada planeta, luna, asteroide y cometa está exactamente donde está ahora, calculado con datos
            y métodos oficiales de NASA/JPL por un motor en Rust que corre en tu navegador. Viaja a cualquier
            fecha entre el 3000 a.C. y el 3000 d.C., mira un eclipse o sigue a las lunas de Júpiter.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              onClick={onEnter}
              className="cursor-pointer rounded-xl bg-gradient-to-r from-sky-400 to-indigo-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-sky-500/25 transition hover:brightness-110"
            >
              {heroCta} →
            </button>
            <a href="#texturas" className="rounded-xl border border-white/15 px-6 py-3 text-sm font-medium transition hover:border-accent/60 hover:bg-white/5">
              {upToDate ? 'Texturas instaladas ✓' : 'Instalar texturas HD'}
            </a>
          </div>
          <dl className="mt-10 grid max-w-lg grid-cols-2 gap-4 sm:grid-cols-4">
            {STATS.map(([n, l]) => (
              <div key={l}>
                <dt className="font-mono text-xl font-semibold text-white">{n}</dt>
                <dd className="text-[11px] leading-tight text-muted">{l}</dd>
              </div>
            ))}
          </dl>
        </div>
        <Globe />
      </header>

      <section id="texturas" className="relative z-10 mx-auto max-w-6xl scroll-mt-6 px-5 pb-16">
        <div className="glass grid gap-8 p-6 md:grid-cols-[1fr_1.2fr] md:p-8">
          <div>
            <span className="text-[10px] tracking-[0.16em] text-accent uppercase">Paso opcional</span>
            <h2 className="mt-1 text-2xl font-medium">Instalar texturas</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Descarga una vez los mosaicos de las misiones de la NASA para todos los planetas y lunas. Quedan
              guardados en tu navegador: el simulador arranca al instante, a máxima nitidez y también sin conexión.
              Sin instalar, se descargan sobre la marcha.
            </p>
            {state && (
              <p className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[13px] text-emerald-200">
                Instaladas: calidad {QUALITIES.find((x) => x.q === state.quality)?.label} · {state.files} archivos · {mb(state.bytes)}
              </p>
            )}
          </div>

          <div className="grid gap-4">
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Calidad de las texturas">
              {QUALITIES.map(({ q, label, hint }) => (
                <button
                  key={q}
                  role="radio"
                  aria-checked={quality === q}
                  disabled={installing}
                  onClick={() => setQuality(q)}
                  className={`cursor-pointer rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${quality === q ? 'border-accent bg-accent/15' : 'border-white/10 hover:border-white/25'}`}
                >
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="font-mono text-xs text-accent">{sizes[q] ? mb(sizes[q]) : '…'}</div>
                  <div className="mt-1 text-[11px] leading-tight text-muted">{hint}</div>
                </button>
              ))}
            </div>

            {progress && (
              <div className="grid gap-1.5">
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-indigo-400 transition-[width] duration-200" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between font-mono text-[11px] text-muted">
                  <span>{mb(progress.doneBytes)} / {mb(progress.totalBytes)} · {progress.doneFiles}/{progress.totalFiles} archivos</span>
                  <span>{installing ? `${mb(progress.bytesPerSec)}/s · ${eta(remaining)}` : 'completado'}</span>
                </div>
                {installing && <div className="truncate font-mono text-[11px] text-slate-400">{progress.current}</div>}
              </div>
            )}
            {error && <p className="text-[13px] text-live">{error}</p>}

            <div className="flex flex-wrap gap-2">
              {!installing ? (
                <button
                  onClick={install}
                  disabled={!sizes[quality]}
                  className="cursor-pointer rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-100 disabled:opacity-50"
                >
                  {upToDate ? 'Reinstalar / verificar' : `Instalar texturas (${sizes[quality] ? mb(sizes[quality]) : '…'})`}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => { if (paused) inst.current?.play(); else inst.current?.pause(); setPaused(!paused); }}
                    className="cursor-pointer rounded-xl border border-white/20 px-5 py-2.5 text-sm transition hover:bg-white/5"
                  >
                    {paused ? 'Reanudar' : 'Pausar'}
                  </button>
                  <button onClick={() => inst.current?.cancel()} className="cursor-pointer rounded-xl px-4 py-2.5 text-sm text-muted hover:text-white">
                    Cancelar
                  </button>
                </>
              )}
              <button
                onClick={onEnter}
                className="cursor-pointer rounded-xl bg-gradient-to-r from-sky-400 to-indigo-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110"
              >
                Entrar al simulador →
              </button>
              {state && !installing && (
                <button
                  onClick={async () => { await uninstall(); setState(null); setProgress(null); }}
                  className="cursor-pointer px-3 py-2.5 text-[13px] text-muted hover:text-live"
                >
                  Borrar texturas instaladas
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section id="caracteristicas" className="relative z-10 mx-auto max-w-6xl scroll-mt-6 px-5 pb-20">
        <h2 className="mb-6 text-2xl font-medium">Hecho con datos de verdad</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([t, d]) => (
            <article key={t} className="glass p-5">
              <h3 className="text-[15px] font-semibold">{t}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-300">{d}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/10 px-5 py-8 text-center text-[12px] leading-relaxed text-muted">
        Datos: NASA/JPL (Horizons, SSD, SBDB), IAU WGCCRE, USGS Astrogeology, catálogo HYG. Texturas: NASA, USGS,
        Solar System Scope. Código bajo licencia MIT. Sin afiliación con NASA ni JPL.
      </footer>
    </div>
  );
}
