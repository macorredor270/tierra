const AU = 149_597_870.7;
const nf = (d: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: d });

export const km = (v: number) => (v >= 1e7 ? `${nf(3).format(v / AU)} au` : `${nf(0).format(v)} km`);
export const num = (v: number, d = 2) => nf(d).format(v);

export function duration(days: number): string {
  const a = Math.abs(days);
  const sign = days < 0 ? ' (retrógrado)' : '';
  if (a < 1) return `${nf(2).format(a * 24)} h${sign}`;
  if (a < 400) return `${nf(2).format(a)} días${sign}`;
  return `${nf(2).format(a / 365.25)} años${sign}`;
}

export function lightTime(kmDist: number): string {
  const s = kmDist / 299_792.458;
  if (s < 60) return `${nf(2).format(s)} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
  return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;
}

export const mass = (kg: number) => {
  const e = Math.floor(Math.log10(kg));
  return `${nf(3).format(kg / 10 ** e)} × 10${sup(e)} kg`;
};

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n: number) => String(n).split('').map((c) => (c === '-' ? '⁻' : SUP[+c])).join('');

/** Fecha que admite años negativos (hasta 3000 a.C.). */
export function formatDate(ms: number, utc = false): { date: string; time: string } {
  const d = new Date(ms);
  const y = utc ? d.getUTCFullYear() : d.getFullYear();
  const pad = (n: number) => String(n).padStart(2, '0');
  const mo = (utc ? d.getUTCMonth() : d.getMonth()) + 1;
  const da = utc ? d.getUTCDate() : d.getDate();
  const year = y <= 0 ? `${1 - y} a.C.` : String(y);
  const h = utc ? d.getUTCHours() : d.getHours();
  const mi = utc ? d.getUTCMinutes() : d.getMinutes();
  const s = utc ? d.getUTCSeconds() : d.getSeconds();
  return { date: `${pad(da)}/${pad(mo)}/${year}`, time: `${pad(h)}:${pad(mi)}:${pad(s)}` };
}

export const speedLabel = (s: number) =>
  s >= 1e6 ? `×${s / 1e6}M` : s >= 1e3 ? `×${s / 1e3}k` : `×${s}`;
