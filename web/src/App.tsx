import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { loadWorld, type World } from './data';
import { Engine, type Layers, type Snapshot } from './engine';
import { Loader } from './ui/Loader';
import { TimeBar } from './ui/TimeBar';
import { Sidebar } from './ui/Sidebar';
import { InfoCard } from './ui/InfoCard';
import { GraphicsPanel } from './ui/GraphicsPanel';
import { StatsOverlay } from './ui/StatsOverlay';
import type { Graphics } from './graphics';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [world, setWorld] = useState<World | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState('Preparando');
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(true);
  const [layers, setLayers] = useState<Layers | null>(null);
  const [graphics, setGraphics] = useState<Graphics | null>(null);
  const [panel, setPanel] = useState<'info' | 'graphics'>('info');

  useEffect(() => {
    let eng: Engine | null = null;
    let cancelled = false;
    (async () => {
      try {
        const w = await loadWorld((msg) => { setStatus(msg); setProgress((p) => Math.max(p, 0.15)); });
        if (cancelled) return;
        setWorld(w);
        setStatus('Cargando texturas');
        const manager = new THREE.LoadingManager();
        manager.onProgress = (_u, loaded, total) => setProgress(0.2 + 0.8 * (loaded / total));
        manager.onLoad = () => setReady(true);
        eng = new Engine(canvasRef.current!, labelsRef.current!, w, manager);
        setEngine(eng);
        setLayers({ ...eng.layers });
        setGraphics({ ...eng.graphics });
        eng.subscribe(setSnap);
        applyUrl(eng, w);
      } catch (e) {
        setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
      eng?.dispose();
      if (labelsRef.current) labelsRef.current.innerHTML = '';
    };
  }, []);

  useEffect(() => {
    if (!engine) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.code === 'Space') { e.preventDefault(); engine.clock.togglePause(); }
      if (e.key === 'Escape') engine.overview();
      if (e.key === 'g' || e.key === 'G') setPanel((p) => (p === 'graphics' ? 'info' : 'graphics'));
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [engine]);

  const updateLayers = (l: Layers) => {
    if (!engine) return;
    engine.layers = l;
    setLayers({ ...l, small: [...l.small] });
  };

  const updateGraphics = (g: Graphics) => {
    if (!engine) return;
    engine.setGraphics(g);
    setGraphics({ ...g });
  };

  const focusBody = world && snap ? world.bodies[snap.focus] : null;

  return (
    <div className="relative h-full w-full select-none">
      <canvas ref={canvasRef} className="fixed inset-0 block h-full w-full touch-none" />
      <div ref={labelsRef} className="pointer-events-none fixed inset-0 z-[5] overflow-hidden" />

      {engine && snap && world && layers && (
        <>
          <header className="glass fixed top-3.5 left-3.5 z-10 hidden flex-col px-4 py-2.5 lg:flex">
            <strong className="text-xs font-semibold tracking-[0.32em]">SISTEMA SOLAR</strong>
            <span className="text-[11px] text-muted">Efemérides JPL · Rust/WASM · WebGL</span>
          </header>
          <TimeBar engine={engine} snap={snap} />
          <Sidebar
            engine={engine}
            world={world}
            focus={snap.focus}
            layers={layers}
            onLayers={updateLayers}
            onSelect={(i) => { engine.focusOn(i); setInfoOpen(true); setPanel('info'); }}
          />
          <button
            className={`glass fixed top-3.5 right-3.5 z-20 flex size-11 cursor-pointer items-center justify-center text-lg transition hover:border-accent/50 ${panel === 'graphics' ? 'border-accent/60 text-white' : 'text-slate-300'}`}
            title="Ajustes gráficos (G)"
            aria-label="Ajustes gráficos"
            onClick={() => setPanel((p) => (p === 'graphics' ? 'info' : 'graphics'))}
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
            </svg>
          </button>
          {panel === 'graphics' && graphics && (
            <GraphicsPanel engine={engine} graphics={graphics} onChange={updateGraphics} onClose={() => setPanel('info')} />
          )}
          {graphics?.showStats && <StatsOverlay engine={engine} />}
          {panel === 'info' && focusBody && infoOpen && (
            <InfoCard body={focusBody} world={world} snap={snap} onClose={() => setInfoOpen(false)} onSelect={(i) => engine.focusOn(i)} />
          )}
          <footer className="fixed bottom-3 left-1/2 z-[4] hidden -translate-x-1/2 text-[11px] whitespace-nowrap text-muted md:block">
            arrastra para girar · rueda o pellizco para acercar · clic en un cuerpo para viajar · espacio pausa · esc vista general · G gráficos
          </footer>
        </>
      )}

      <Loader status={error ?? status} progress={progress} done={ready && !error} error={!!error} />
    </div>
  );
}

/** Enlaces compartibles: ?t=2026-08-12T17:46Z&focus=Tierra&view=sol&speed=100 */
function applyUrl(engine: Engine, world: World): void {
  const q = new URLSearchParams(location.search);
  const t = q.get('t');
  if (t) {
    const ms = Date.parse(t);
    if (!Number.isNaN(ms)) {
      engine.clock.jumpTo(ms);
      const speed = Number(q.get('speed'));
      if (speed > 0) engine.clock.setSpeed(speed);
      else if (!engine.clock.paused) engine.clock.togglePause();
    }
  }
  const name = q.get('focus')?.toLowerCase();
  if (name) {
    const body = world.bodies.find((b) => b.info.name.toLowerCase() === name || b.jplName?.toLowerCase() === name);
    if (body) engine.focusOn(body.index, Number(q.get('dist')) || undefined, false);
  }
  const view = q.get('view')?.toLowerCase();
  if (view === 'sol') engine.viewFrom(0);
  else if (view) {
    const from = world.bodies.find((b) => b.info.name.toLowerCase() === view || b.jplName?.toLowerCase() === view);
    if (from) engine.viewFrom(from.index, true);
  }
}
