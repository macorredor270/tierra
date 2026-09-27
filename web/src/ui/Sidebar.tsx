import { useMemo, useState } from 'react';
import type { Body, World } from '../data/world';
import type { Engine, Layers } from '../engine/engine';
import { SMALL_CLASS_COLORS, SMALL_CLASS_NAMES } from '../data/catalog';
import { num } from '../lib/format';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

interface Props {
  engine: Engine;
  world: World;
  focus: number;
  layers: Layers;
  onLayers: (l: Layers) => void;
  onSelect: (i: number) => void;
}

export function Sidebar({ engine, world, focus, layers, onLayers, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const bodies = world.bodies;

  const moonsOf = useMemo(() => {
    const m = new Map<number, Body[]>();
    for (const b of bodies) if (b.info.kind === 'moon') m.set(b.parent, [...(m.get(b.parent) ?? []), b]);
    for (const list of m.values()) list.sort((a, b) => Number(b.resolved) - Number(a.resolved) || b.info.radius - a.info.radius);
    return m;
  }, [bodies]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return bodies.filter((b) => b.info.name.toLowerCase().includes(q) || b.jplName?.toLowerCase().includes(q)).slice(0, 14);
  }, [query, bodies]);

  const focusParent = bodies[focus].info.kind === 'moon' ? bodies[focus].parent : focus;

  const row = (b: Body, sub?: string) => (
    <button
      key={b.index}
      className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-left text-[13px] transition hover:bg-white/5 ${b.index === focus ? 'bg-accent/15 text-white' : ''}`}
      onClick={() => onSelect(b.index)}
    >
      <span className="size-2 flex-none rounded-full" style={{ background: hex(b.info.color) }} />
      <span className="flex-1 truncate">{b.info.name}</span>
      {sub && <small className="text-[11px] text-muted">{sub}</small>}
    </button>
  );

  const group = (title: string, list: Body[]) => (
    <div key={title}>
      <h3 className="mx-2 mt-3 mb-1 text-[10px] font-semibold tracking-[0.16em] text-muted">{title}</h3>
      {list.map((b) => {
        const moons = moonsOf.get(b.index) ?? [];
        const expanded = open === b.index || focusParent === b.index;
        return (
          <div key={b.index}>
            <div className="flex items-center">
              {row(b)}
              {moons.length > 0 && (
                <button
                  className="cursor-pointer px-1.5 text-[11px] whitespace-nowrap text-muted hover:text-white"
                  title="Lunas"
                  onClick={() => setOpen(expanded ? -1 : b.index)}
                >
                  {moons.length} {expanded ? '▾' : '▸'}
                </button>
              )}
            </div>
            {expanded && moons.length > 0 && (
              <div className="ml-4 max-h-56 overflow-auto border-l border-white/10 pl-1">
                {moons
                  .filter((m) => m.resolved || layers.minorMoons)
                  .map((m) => row(m, m.resolved ? `${num(m.info.radius, 0)} km` : undefined))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const toggle = (k: keyof Omit<Layers, 'small'>) => onLayers({ ...layers, [k]: !layers[k] });

  return (
    <aside className="glass fixed right-2 bottom-2 left-2 z-10 flex h-[38vh] flex-col gap-2.5 p-2.5 md:top-[84px] md:right-auto md:bottom-11 md:left-3.5 md:h-auto md:w-64">
      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar planeta o luna…"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        {results.length > 0 && (
          <div className="glass absolute inset-x-0 top-10 z-20 max-h-72 overflow-auto p-1">
            {results.map((b) =>
              row(
                b,
                b.info.kind === 'moon'
                  ? `luna de ${bodies[b.parent].info.name}`
                  : b.info.kind === 'dwarf'
                    ? 'planeta enano'
                    : b.mission
                      ? b.mission.agency
                      : '',
              ),
            )}
          </div>
        )}
      </div>

      <div className="-mx-1 flex-1 overflow-auto px-1">
        {group('ESTRELLA', [bodies[0]])}
        {group('PLANETAS', bodies.slice(1, 9))}
        {group('PLANETAS ENANOS', bodies.slice(9, 14))}
        {group('NAVES ESPACIALES', bodies.slice(world.firstCraft))}
      </div>

      <details className="max-h-[42vh] overflow-auto text-[13px]" open>
        <summary className="mb-1.5 cursor-pointer text-[10px] font-semibold tracking-[0.16em] text-muted">FILTROS</summary>
        {(
          [
            ['planets', 'Planetas'],
            ['crafts', 'Naves espaciales'],
            ['dwarfs', 'Planetas enanos'],
            ['moons', 'Lunas principales'],
            ['minorMoons', 'Lunas menores'],
            ['orbits', 'Órbitas'],
            ['labels', 'Etiquetas'],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="flex cursor-pointer items-center gap-2 py-0.5">
            <input type="checkbox" className="accent-sky-400" checked={layers[k]} onChange={() => toggle(k)} /> {label}
          </label>
        ))}
        <div className="mt-1.5 mb-0.5 flex items-center justify-between">
          <span className="text-[10px] font-semibold tracking-[0.16em] text-muted">ASTEROIDES Y COMETAS</span>
          <button
            className="cursor-pointer text-[11px] text-accent hover:underline"
            onClick={() => {
              const all = layers.small.every(Boolean);
              onLayers({ ...layers, small: layers.small.map(() => !all) });
            }}
          >
            {layers.small.every(Boolean) ? 'ninguno' : 'todos'}
          </button>
        </div>
        {SMALL_CLASS_NAMES.map((name, k) => {
          const key = Object.keys(world.smallMeta.classes).find((c) => world.smallMeta.classes[c] === k)!;
          return (
            <label key={name} className="flex cursor-pointer items-center gap-2 py-0.5">
              <input
                type="checkbox"
                className="accent-sky-400"
                checked={layers.small[k]}
                onChange={() => {
                  const s = [...layers.small];
                  s[k] = !s[k];
                  onLayers({ ...layers, small: s });
                }}
              />
              <span className="size-2 rounded-full" style={{ background: hex(SMALL_CLASS_COLORS[k]) }} />
              {name}
              <small className="ml-auto font-mono text-[11px] text-muted">{num(world.smallMeta.counts[key] ?? 0, 0)}</small>
            </label>
          );
        })}
      </details>

      <button
        className="w-full cursor-pointer rounded-lg border border-white/10 bg-accent/10 py-2 text-sm transition hover:border-accent/50"
        onClick={() => engine.overview()}
      >
        Vista general
      </button>
    </aside>
  );
}
