import type { Engine } from '../engine';
import { fromPreset, type Graphics, type Preset } from '../graphics';

const PRESET_LABEL: Record<Exclude<Preset, 'custom'>, string> = { low: 'Bajo', medium: 'Medio', high: 'Alto', ultra: 'Ultra' };

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-0.5 rounded-lg bg-white/5 p-0.5">
      {options.map(([v, label]) => (
        <button
          key={String(v)}
          onClick={() => onChange(v)}
          className={`flex-1 cursor-pointer rounded-md px-2 py-1 text-xs transition ${value === v ? 'bg-accent/25 text-white shadow-inner' : 'text-slate-300 hover:bg-white/5'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px]">{label}</span>
        {hint && <span className="font-mono text-[11px] text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-0.5">
      <span className="text-[13px]">
        {label}
        {hint && <span className="block text-[11px] text-muted">{hint}</span>}
      </span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 flex-none cursor-pointer rounded-full transition ${checked ? 'bg-accent/70' : 'bg-white/15'}`}
      >
        <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </label>
  );
}

export function GraphicsPanel({ engine, graphics, onChange, onClose }: { engine: Engine; graphics: Graphics; onChange: (g: Graphics) => void; onClose: () => void }) {
  const hw = engine.hw;
  const set = (patch: Partial<Graphics>) => onChange({ ...graphics, ...patch, preset: 'custom' });
  const samples = ([0, 2, 4, 8] as const).filter((s) => s <= hw.maxSamples);

  return (
    <article className="glass fixed top-[84px] right-3.5 z-20 flex max-h-[calc(100vh-110px)] w-[340px] max-w-[calc(100vw-16px)] flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <span className="text-[10px] tracking-[0.16em] text-accent uppercase">Ajustes</span>
          <h2 className="text-lg font-medium">Gráficos</h2>
        </div>
        <button className="cursor-pointer text-xl text-muted hover:text-white" aria-label="Cerrar" onClick={onClose}>×</button>
      </header>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 overflow-x-hidden overflow-y-auto px-4 py-3">
        <section className="grid gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
          <div className="flex min-w-0 justify-between gap-3"><span className="flex-none text-muted">GPU</span><span className="min-w-0 truncate text-right font-mono" title={hw.gpu}>{hw.gpu}</span></div>
          <div className="flex justify-between"><span className="text-muted">Núcleos CPU</span><span className="font-mono">{hw.cores}</span></div>
          {hw.memoryGb && <div className="flex justify-between"><span className="text-muted">Memoria</span><span className="font-mono">≥ {hw.memoryGb} GB</span></div>}
          <div className="flex justify-between"><span className="text-muted">Textura máx. · MSAA máx.</span><span className="font-mono">{hw.maxTexture}px · {hw.maxSamples}x</span></div>
          <div className="flex justify-between"><span className="text-muted">Recomendado</span><span className="font-mono text-accent">{PRESET_LABEL[hw.tier]}</span></div>
          {hw.software && (
            <p className="mt-1 text-amber-300">
              El navegador está dibujando sin GPU. Activa la aceleración por hardware en su configuración.
            </p>
          )}
        </section>

        <Row label="Calidad" hint={graphics.preset === 'custom' ? 'personalizada' : undefined}>
          <Seg<Preset>
            value={graphics.preset}
            options={(['low', 'medium', 'high', 'ultra'] as const).map((p) => [p, PRESET_LABEL[p]])}
            onChange={(p) => p !== 'custom' && onChange({ ...fromPreset(p, hw), showStats: graphics.showStats, workers: graphics.workers })}
          />
          <button
            className="cursor-pointer justify-self-start text-[11px] text-accent hover:underline"
            onClick={() => onChange({ ...fromPreset(hw.tier, hw), showStats: graphics.showStats })}
          >
            Detectar automáticamente
          </button>
        </Row>

        <Row label="Resolución" hint={`${Math.round(graphics.renderScale * 100)} % · ${engine.stats.width}×${engine.stats.height}`}>
          <input
            type="range" min={0.5} max={2} step={0.05} value={graphics.renderScale}
            onChange={(e) => set({ renderScale: +e.target.value })}
            className="accent-sky-400"
          />
        </Row>
        <Toggle
          label="Resolución dinámica"
          hint="Baja la resolución si caen los FPS"
          checked={graphics.dynamicResolution}
          onChange={(v) => set({ dynamicResolution: v })}
        />

        <Row label="Antialiasing (MSAA)">
          <Seg value={graphics.msaa} options={samples.map((s) => [s, s ? `${s}x` : 'No'] as [Graphics['msaa'], string])} onChange={(v) => set({ msaa: v })} />
        </Row>

        <Row label="Texturas de la Tierra (NASA)">
          <Seg
            value={graphics.textures}
            options={([2, 4, 8] as const).filter((q) => q * 1024 <= hw.maxTexture).map((q) => [q, `${q}K`] as [Graphics['textures'], string])}
            onChange={(v) => set({ textures: v })}
          />
        </Row>
        <Toggle label="Filtrado anisótropo" hint="Texturas nítidas vistas de lado" checked={graphics.anisotropy} onChange={(v) => set({ anisotropy: v })} />

        <Toggle label="Resplandor (bloom)" checked={graphics.bloom} onChange={(v) => set({ bloom: v })} />
        {graphics.bloom && (
          <Row label="Intensidad del resplandor" hint={graphics.bloomStrength.toFixed(2)}>
            <input type="range" min={0.1} max={1.5} step={0.05} value={graphics.bloomStrength} onChange={(e) => set({ bloomStrength: +e.target.value })} className="accent-sky-400" />
          </Row>
        )}

        <Toggle label="Estrellas reales (catálogo HYG)" checked={graphics.stars} onChange={(v) => set({ stars: v })} />
        {graphics.stars && (
          <Row label="Magnitud límite" hint={`${graphics.starLimit.toFixed(1)} ${graphics.starLimit <= 6 ? '· a simple vista' : '· prismáticos'}`}>
            <input type="range" min={3} max={7} step={0.5} value={graphics.starLimit} onChange={(e) => set({ starLimit: +e.target.value })} className="accent-sky-400" />
          </Row>
        )}

        <Row label="Densidad de asteroides" hint={`${Math.round(graphics.smallDensity * 100)} %`}>
          <Seg value={graphics.smallDensity} options={[[0.25, '25 %'], [0.5, '50 %'], [1, '100 %']]} onChange={(v) => set({ smallDensity: v })} />
        </Row>
        <Toggle
          label="Cálculo multinúcleo"
          hint={`Reparte los asteroides entre ${Math.max(1, Math.min(hw.cores - 1, 8))} hilos de la CPU (Web Workers + WASM)`}
          checked={graphics.workers}
          onChange={(v) => set({ workers: v })}
        />

        <Row label="Límite de FPS">
          <Seg value={graphics.fpsCap} options={[[30, '30'], [60, '60'], [120, '120'], [0, 'Pantalla']]} onChange={(v) => set({ fpsCap: v })} />
        </Row>
        <Toggle label="Mostrar rendimiento" checked={graphics.showStats} onChange={(v) => onChange({ ...graphics, showStats: v })} />
      </div>
    </article>
  );
}
