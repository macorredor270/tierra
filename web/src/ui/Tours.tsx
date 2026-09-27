import { useCallback, useEffect, useRef, useState } from 'react';
import { findBody, type World } from '../data';
import type { Engine } from '../engine';
import { TOURS, type Tour } from '../tours';

export function ToursPanel({ onStart, onClose }: { onStart: (t: Tour) => void; onClose: () => void }) {
  return (
    <article className="glass fixed top-[84px] right-3.5 z-20 w-[340px] max-w-[calc(100vw-16px)] overflow-hidden">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <span className="text-[10px] tracking-[0.16em] text-accent uppercase">Guiado</span>
          <h2 className="text-lg font-medium">Tours</h2>
        </div>
        <button className="cursor-pointer text-xl text-muted hover:text-white" aria-label="Cerrar" onClick={onClose}>×</button>
      </header>
      <ul className="grid gap-1 p-2">
        {TOURS.map((t) => (
          <li key={t.id}>
            <button onClick={() => onStart(t)} className="w-full cursor-pointer rounded-lg px-3 py-2.5 text-left transition hover:bg-white/5">
              <div className="flex justify-between text-sm font-medium">
                {t.title}
                <span className="font-mono text-[11px] text-muted">{t.steps.length} pasos</span>
              </div>
              <div className="text-[12px] text-muted">{t.summary}</div>
            </button>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function TourPlayer({ tour, engine, world, onEnd }: { tour: Tour; engine: Engine; world: World; onEnd: () => void }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  const s = tour.steps[step];

  const apply = useCallback((i: number) => {
    const st = tour.steps[i];
    const body = findBody(world, st.focus);
    if (!body) return;
    const from = st.view ? (st.view === 'sol' ? 0 : findBody(world, st.view)?.index) : undefined;
    engine.goTo({ ms: st.t ? Date.parse(st.t) : undefined, focus: body.index, dist: st.dist, from, speed: st.speed });
    if (!st.t && st.speed != null) {
      if (st.speed > 0) engine.clock.setSpeed(st.speed);
      else engine.clock.paused = true;
    }
  }, [engine, world, tour]);

  useEffect(() => { apply(step); }, [step, apply]);
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (!playing) return;
    timer.current = window.setTimeout(() => {
      if (step < tour.steps.length - 1) setStep(step + 1);
      else setPlaying(false);
    }, s.seconds * 1000);
    return () => window.clearTimeout(timer.current);
  }, [step, playing, s.seconds, tour.steps.length]);

  return (
    <div className="glass fixed bottom-6 left-1/2 z-30 w-[min(640px,calc(100vw-24px))] -translate-x-1/2 px-5 py-4" role="dialog" aria-label={tour.title}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] tracking-[0.16em] text-accent uppercase">{tour.title} · {step + 1}/{tour.steps.length}</span>
        <button className="cursor-pointer text-lg text-muted hover:text-white" aria-label="Salir del tour" onClick={onEnd}>×</button>
      </div>
      <p className="mt-2 min-h-[3em] text-[15px] leading-relaxed">{s.text}</p>
      <div className="mt-3 flex items-center gap-2">
        <button disabled={step === 0} onClick={() => setStep(step - 1)} className="cursor-pointer rounded-lg border border-white/10 px-3 py-1 text-sm disabled:opacity-40">←</button>
        <button onClick={() => setPlaying(!playing)} className="cursor-pointer rounded-lg border border-white/10 px-3 py-1 text-sm">{playing ? '❚❚' : '▶'}</button>
        <button disabled={step === tour.steps.length - 1} onClick={() => setStep(step + 1)} className="cursor-pointer rounded-lg border border-white/10 px-3 py-1 text-sm disabled:opacity-40">→</button>
        <div className="ml-2 flex flex-1 gap-1">
          {tour.steps.map((_, i) => (
            <button key={i} aria-label={`Paso ${i + 1}`} onClick={() => setStep(i)} className={`h-1.5 flex-1 cursor-pointer rounded-full ${i <= step ? 'bg-accent' : 'bg-white/15'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
