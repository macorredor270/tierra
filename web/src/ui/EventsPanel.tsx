import { useMemo, useState } from 'react';
import type { World } from '../data';
import type { Engine } from '../engine';
import { describe, eventView, findEvents, jdToMs, type AstroEvent } from '../events';
import { formatDate } from '../format';

const TYPES: [AstroEvent['type'], string][] = [
  ['solar', 'Eclipses de Sol'],
  ['lunar', 'Eclipses de Luna'],
  ['opposition', 'Oposiciones'],
  ['elongation', 'Elongaciones'],
];

export function EventsPanel({ engine, world, fromMs, onClose }: { engine: Engine; world: World; fromMs: number; onClose: () => void }) {
  const [years, setYears] = useState(2);
  const [types, setTypes] = useState<Set<AstroEvent['type']>>(new Set(['solar', 'lunar', 'opposition', 'elongation']));
  // Se calcula una vez al abrir (o al ampliar el rango): unos milisegundos por año en WASM
  const [start] = useState(() => fromMs - 30 * 86400000);
  const events = useMemo(() => findEvents(start, start + years * 365.25 * 86400000), [start, years]);
  const shown = events.filter((e) => types.has(e.type));

  return (
    <article className="glass fixed top-[84px] right-3.5 z-20 flex max-h-[calc(100vh-110px)] w-[360px] max-w-[calc(100vw-16px)] flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <span className="text-[10px] tracking-[0.16em] text-accent uppercase">Calculado por el motor</span>
          <h2 className="text-lg font-medium">Calendario astronómico</h2>
        </div>
        <button className="cursor-pointer text-xl text-muted hover:text-white" aria-label="Cerrar" onClick={onClose}>×</button>
      </header>
      <div className="flex flex-wrap gap-1.5 border-b border-white/10 px-4 py-2.5">
        {TYPES.map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTypes((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; })}
            className={`cursor-pointer rounded-full border px-2.5 py-0.5 text-[11px] transition ${types.has(t) ? 'border-accent bg-accent/15 text-white' : 'border-white/10 text-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <ol className="grid gap-1 overflow-y-auto px-2 py-2">
        {shown.map((ev) => {
          const d = describe(ev, world);
          const date = formatDate(jdToMs(ev.jd), true);
          return (
            <li key={`${ev.type}-${ev.jd}`}>
              <button
                onClick={() => { const v = eventView(ev, world); engine.goTo({ ms: v.ms, focus: v.focus, dist: v.dist, from: v.from }); }}
                className="grid w-full cursor-pointer grid-cols-[28px_1fr] gap-x-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/5"
              >
                <span className="row-span-2 pt-0.5 text-center text-lg text-accent">{d.icon}</span>
                <span className="flex justify-between gap-2 text-[13px]">
                  <span>{d.title}</span>
                  <span className="font-mono text-[11px] whitespace-nowrap text-muted">{date.date}</span>
                </span>
                <span className="text-[11px] text-muted">{d.detail} · {date.time} UTC</span>
              </button>
            </li>
          );
        })}
        {!shown.length && <li className="px-3 py-6 text-center text-[13px] text-muted">Ningún evento de ese tipo en el periodo.</li>}
      </ol>
      <footer className="flex items-center justify-between border-t border-white/10 px-4 py-2.5 text-[12px] text-muted">
        <span>{shown.length} eventos · {years} año{years > 1 ? 's' : ''}</span>
        {years < 10 && (
          <button className="cursor-pointer text-accent hover:underline" onClick={() => setYears((y) => Math.min(10, y + 2))}>
            Ver más años
          </button>
        )}
      </footer>
    </article>
  );
}
