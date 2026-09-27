import type { Body, World } from '../data';
import type { Snapshot } from '../engine';
import { MOON_NOTES } from '../catalog';
import { duration, km, lightTime, mass, num } from '../format';
import { creditFor, textureKey } from '../textures';

const KIND: Record<string, string> = { star: 'Estrella', planet: 'Planeta', dwarf: 'Planeta enano', moon: 'Luna', craft: 'Nave espacial' };

function Rows({ rows, live }: { rows: [string, string | undefined][]; live?: boolean }) {
  const shown = rows.filter(([, v]) => v !== undefined);
  if (!shown.length) return null;
  return (
    <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-white/10 pt-2.5 text-[13px]">
      {shown.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className={`text-right font-mono text-xs ${live ? 'text-white' : ''}`}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

interface Props { body: Body; world: World; snap: Snapshot; onClose: () => void; onSelect: (i: number) => void }

export function InfoCard({ body, world, snap, onClose, onSelect }: Props) {
  const i = body.info;
  const m = body.moon;
  const parent = world.bodies[body.parent];
  const desc = m ? MOON_NOTES[body.jplName!] ?? `Luna de ${parent.info.name}.` : i.description;

  const live: [string, string | undefined][] = [
    ['Distancia al Sol', body.index ? km(snap.distSunKm) : undefined],
    ['Distancia a la Tierra', body.index !== 3 ? km(snap.distEarthKm) : undefined],
    ['Luz desde la Tierra', body.index !== 3 ? lightTime(snap.distEarthKm) : undefined],
    ['Velocidad orbital', Number.isFinite(snap.speedKms) ? `${num(snap.speedKms, 2)} km/s` : undefined],
  ];
  const mi = body.mission;
  const endDate = mi ? new Date((mi.jd0 + mi.step * (mi.count - 1) - 2440587.5) * 86400000).toISOString().slice(0, 10) : '';
  const data: [string, string | undefined][] = mi ? [
    ['Agencia', mi.agency],
    ['Lanzamiento', mi.launch],
    ['Trayectoria hasta', endDate],
  ] : [
    ['Radio', `${num(i.radius, i.radius < 100 ? 1 : 0)} km`],
    ['Radio polar', i.polarRadius ? `${num(i.polarRadius, 0)} km` : undefined],
    ['Masa', i.massKg ? mass(i.massKg) : undefined],
    ['Densidad', i.density ? `${num(i.density, 3)} g/cm³` : undefined],
    ['Gravedad', i.gravity ? `${num(i.gravity, 2)} m/s²` : undefined],
    ['Vel. de escape', i.escape ? `${num(i.escape, 2)} km/s` : undefined],
    ['Día sideral', i.rotationDays ? duration(i.rotationDays) : undefined],
    ['Año', i.orbitYears ? duration(i.orbitYears * 365.25) : undefined],
    ['Albedo', i.albedo ? num(i.albedo, 3) : undefined],
    ['Semieje mayor', m ? km(m.a) : undefined],
    ['Excentricidad', m ? num(m.e, 4) : undefined],
    ['Inclinación', m ? `${num(m.i, 2)}°` : undefined],
    ['Periodo', m ? duration(m.P * (m.i > 90 ? -1 : 1)) : undefined],
  ];

  return (
    <article className="glass fixed right-2 bottom-[calc(38vh+16px)] left-2 z-10 max-h-[34vh] overflow-auto px-4 pt-4 pb-3 md:top-[84px] md:bottom-auto md:left-auto md:max-h-[calc(100vh-128px)] md:w-80 md:right-3.5">
      <button className="absolute top-1.5 right-2.5 cursor-pointer text-xl text-muted hover:text-white" aria-label="Cerrar" onClick={onClose}>×</button>
      <span className="text-[10px] tracking-[0.16em] text-accent uppercase">
        {KIND[i.kind]}
        {m && (
          <> de <button className="cursor-pointer underline decoration-dotted" onClick={() => onSelect(parent.index)}>{parent.info.name}</button></>
        )}
      </span>
      <h2 className="mt-0.5 mb-2 text-2xl font-medium">{i.name}</h2>
      <p className="mb-3 text-[13px] text-slate-300">{desc}</p>
      <Rows rows={live} live />
      <Rows rows={data} />
      <p className="text-[11px] text-muted">
        {mi
          ? 'Trayectoria: JPL Horizons (vectores de estado interpolados con splines de Hermite).'
          : body.jplName === 'Moon'
          ? 'Posición: teoría lunar de Meeus (ELP-2000/82), a pocos km de JPL Horizons. Radio: JPL Satellite Physical Parameters.'
          : m
          ? `Órbita: ${m.ephemeris} (JPL SSD). Radio: JPL Satellite Physical Parameters.`
          : body.index === 0
            ? 'Datos: IAU 2015 / NASA Sun Fact Sheet.'
            : body.index <= 8
              ? 'Órbita: elementos keplerianos de JPL (Standish). Datos físicos: JPL Planetary Physical Parameters.'
              : 'Órbita: elementos osculantes de JPL Horizons. Datos físicos: JPL Planetary Physical Parameters.'}
        {' '}
        {mi ? '' : creditFor(textureKey(body)) ? `Imagen: ${creditFor(textureKey(body))}.` : 'Superficie procedural (sin mosaico global publicado).'}
      </p>
    </article>
  );
}
