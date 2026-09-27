import { useEffect, useState } from 'react';
import type { Engine, Stats } from '../engine/engine';

export function StatsOverlay({ engine }: { engine: Engine }) {
  const [s, setS] = useState<Stats>({ ...engine.stats });
  useEffect(() => {
    const id = setInterval(() => setS({ ...engine.stats }), 500);
    return () => clearInterval(id);
  }, [engine]);
  const color = s.fps >= 55 ? 'text-emerald-300' : s.fps >= 30 ? 'text-amber-300' : 'text-live';
  return (
    <div className="glass pointer-events-none fixed right-3.5 bottom-3 z-10 hidden gap-x-3 px-3 py-2 font-mono text-[11px] md:grid md:grid-cols-[auto_auto]">
      <span className="text-muted">FPS</span>
      <span className={`text-right ${color}`}>{s.fps >= 10 ? Math.round(s.fps) : s.fps.toFixed(1)}</span>
      <span className="text-muted">CPU/frame</span>
      <span className="text-right">{s.frameMs.toFixed(1)} ms</span>
      <span className="text-muted">Asteroides</span>
      <span className="text-right">
        {s.threads === 0 ? 'en la GPU' : `${s.smallMs.toFixed(1)} ms · ${s.threads} hilo${s.threads > 1 ? 's' : ''}`}
      </span>
      <span className="text-muted">Render</span>
      <span className="text-right">
        {s.width}×{s.height} ({s.scale.toFixed(2)}x)
      </span>
      <span className="text-muted">Draw calls</span>
      <span className="text-right">
        {s.drawCalls} · {(s.triangles / 1e6).toFixed(2)}M tri
      </span>
      <span className="col-span-2 max-w-56 truncate pt-0.5 text-muted" title={engine.hw.gpu}>
        {engine.hw.gpu}
      </span>
    </div>
  );
}
