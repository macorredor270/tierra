import { SPEEDS } from '../engine/clock';
import type { Engine, Snapshot } from '../engine/engine';
import { formatDate, speedLabel } from '../lib/format';

const btn =
  'rounded-lg border border-white/10 px-2 py-1 text-xs transition hover:border-accent/40 hover:bg-accent/10 cursor-pointer';
const on = 'border-accent bg-accent/20 text-white';

export function TimeBar({ engine, snap }: { engine: Engine; snap: Snapshot }) {
  const clock = engine.clock;
  const real = snap.mode === 'real';
  const local = formatDate(snap.ms);
  const utc = formatDate(snap.ms, true);
  const iso = (() => {
    const d = new Date(snap.ms);
    const y = d.getUTCFullYear();
    return y >= 1 && y <= 9999 ? d.toISOString().slice(0, 10) : '';
  })();

  return (
    <section className="glass fixed top-3.5 left-1/2 z-10 flex max-w-[calc(100vw-28px)] -translate-x-1/2 flex-wrap items-center justify-center gap-3 px-3 py-2">
      <div className="flex min-w-[220px] items-center gap-2.5">
        {real ? (
          <span className="rounded-md bg-live/15 px-2 py-0.5 text-[10px] font-bold tracking-widest text-live">
            <span className="mr-1 animate-blink">●</span>EN VIVO
          </span>
        ) : (
          <span className="rounded-md bg-accent/15 px-2 py-0.5 text-[10px] font-bold tracking-widest text-accent">
            {snap.paused ? '❚❚ PAUSA' : `${snap.direction < 0 ? '◀ ' : ''}SIMULADO`}
          </span>
        )}
        <div className="font-mono leading-tight">
          <div className="text-[15px] font-semibold">
            {local.date} · {local.time}
          </div>
          <div className="text-[11px] text-muted">
            UTC {utc.date} {utc.time}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          className={`${btn} ${real ? 'border-live bg-live/15 text-white' : ''}`}
          title="Órbitas reales sincronizadas con tu reloj"
          onClick={() => clock.setReal()}
        >
          ● Tiempo real
        </button>
        <span className="mx-1 h-5 w-px bg-white/10" />
        <button
          className={`${btn} w-8 ${!real && snap.direction < 0 ? on : ''}`}
          title="Invertir el tiempo"
          onClick={() => clock.reverse()}
        >
          ⇆
        </button>
        <button className={`${btn} w-8 ${snap.paused ? on : ''}`} title="Pausa (espacio)" onClick={() => clock.togglePause()}>
          ❚❚
        </button>
        <div className="flex gap-0.5">
          {SPEEDS.map((s, k) => (
            <button
              key={s}
              className={`${btn} px-1.5 font-mono ${k > 5 ? 'hidden sm:block' : ''} ${!real && !snap.paused && snap.speed === s ? on : ''}`}
              title={`Simular a ${speedLabel(s)} la velocidad real`}
              onClick={() => clock.setSpeed(s)}
            >
              {speedLabel(s)}
            </button>
          ))}
        </div>
        <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
        <input
          type="date"
          className="hidden rounded-lg border border-white/10 bg-transparent px-2 py-0.5 text-xs sm:block"
          min="0001-01-01"
          max="2999-12-31"
          value={iso}
          title="Ir a una fecha"
          onChange={(e) => {
            const t = Date.parse(e.target.value + 'T12:00:00Z');
            if (!Number.isNaN(t)) {
              clock.jumpTo(t);
              if (!clock.paused) clock.setSpeed(clock.speed);
            }
          }}
        />
      </div>
    </section>
  );
}
