import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { loadWorld, type World } from './data';
import { Engine, type Layers, type Snapshot } from './engine';
import { Loader } from './ui/Loader';
import { TimeBar } from './ui/TimeBar';
import { Sidebar } from './ui/Sidebar';
import { InfoCard } from './ui/InfoCard';

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
        eng.subscribe(setSnap);
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
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [engine]);

  const updateLayers = (l: Layers) => {
    if (!engine) return;
    engine.layers = l;
    setLayers({ ...l, small: [...l.small] });
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
            onSelect={(i) => { engine.focusOn(i); setInfoOpen(true); }}
          />
          {focusBody && infoOpen && (
            <InfoCard body={focusBody} world={world} snap={snap} onClose={() => setInfoOpen(false)} onSelect={(i) => engine.focusOn(i)} />
          )}
          <footer className="fixed bottom-3 left-1/2 z-[4] hidden -translate-x-1/2 text-[11px] whitespace-nowrap text-muted md:block">
            arrastra para girar · rueda o pellizco para acercar · clic en un cuerpo para viajar · espacio pausa · esc vista general
          </footer>
        </>
      )}

      <Loader status={error ?? status} progress={progress} done={ready && !error} error={!!error} />
    </div>
  );
}
