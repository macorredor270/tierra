//! Búsqueda de eventos astronómicos: eclipses de Sol y de Luna, oposiciones de los planetas
//! exteriores y máximas elongaciones de Mercurio y Venus.
//!
//! Todo se calcula con las mismas efemérides del motor (Standish + Meeus), buscando raíces y
//! mínimos por bisección y sección áurea. Los eclipses se caracterizan con γ (distancia mínima
//! del eje de la sombra lunar al centro de la Tierra, en radios terrestres), igual que los
//! catálogos de la NASA (Espenak).

use crate::frames::{norm, scale, sub};
use crate::moon_meeus;
use crate::planets::{earth_heliocentric_km, heliocentric_km, Planet};

const R_EARTH: f64 = 6378.137;
const R_SUN: f64 = 695_700.0;
const R_MOON: f64 = 1_737.4;

#[derive(Clone, Debug, PartialEq)]
pub enum EventKind {
    SolarEclipse { kind: &'static str, gamma: f64 },
    LunarEclipse { kind: &'static str, umbral_magnitude: f64 },
    Opposition { planet: Planet },
    GreatestElongation { planet: Planet, degrees: f64, east: bool },
}

#[derive(Clone, Debug)]
pub struct Event {
    pub jd_tdb: f64,
    pub kind: EventKind,
}

/// Geometría geocéntrica en un instante: Sol y Luna vistos desde la Tierra (km, eclíptica).
struct Geo {
    sun: [f64; 3],
    moon: [f64; 3],
}

fn geo(jd: f64) -> Geo {
    let moon = moon_meeus::geocentric_km(jd);
    let earth = earth_heliocentric_km(heliocentric_km(Planet::EarthMoonBary, jd), moon);
    Geo { sun: scale(earth, -1.0), moon }
}

fn lon(v: [f64; 3]) -> f64 {
    v[1].atan2(v[0])
}

fn wrap(a: f64) -> f64 {
    let t = std::f64::consts::TAU;
    let r = a.rem_euclid(t);
    if r > std::f64::consts::PI {
        r - t
    } else {
        r
    }
}

/// Raíz de f en [a, b] por bisección (f cambia de signo), con precisión de ~1 s.
fn bisect(mut a: f64, mut b: f64, f: impl Fn(f64) -> f64) -> f64 {
    let mut fa = f(a);
    for _ in 0..60 {
        let m = 0.5 * (a + b);
        let fm = f(m);
        if (fa < 0.0) == (fm < 0.0) {
            a = m;
            fa = fm;
        } else {
            b = m;
        }
        if b - a < 1e-5 {
            break;
        }
    }
    0.5 * (a + b)
}

/// Mínimo de f en [a, b] por sección áurea.
fn golden(mut a: f64, mut b: f64, f: impl Fn(f64) -> f64) -> f64 {
    let g = 0.618_033_988_75;
    let (mut c, mut d) = (b - g * (b - a), a + g * (b - a));
    for _ in 0..80 {
        if f(c) < f(d) {
            b = d;
        } else {
            a = c;
        }
        c = b - g * (b - a);
        d = a + g * (b - a);
        if b - a < 1e-5 {
            break;
        }
    }
    0.5 * (a + b)
}

/// Busca los cruces de `phase(t)` por cero muestreando cada `step` días.
fn crossings(start: f64, end: f64, step: f64, phase: &dyn Fn(f64) -> f64) -> Vec<f64> {
    let mut out = Vec::new();
    let mut t = start;
    let mut prev = phase(t);
    while t < end {
        let next_t = t + step;
        let next = phase(next_t);
        // Cruces reales en cualquier sentido (no el salto de +π a −π)
        if (prev < 0.0) != (next < 0.0) && (next - prev).abs() < 1.0 {
            out.push(bisect(t, next_t, phase));
        }
        t = next_t;
        prev = next;
    }
    out
}

/// Distancia del eje Sol→Luna al centro de la Tierra, con signo (positivo si pasa al norte).
fn shadow_axis_distance(jd: f64) -> f64 {
    let g = geo(jd);
    let axis = sub(g.moon, g.sun);
    let dir = scale(axis, 1.0 / norm(axis));
    let t = -(g.moon[0] * dir[0] + g.moon[1] * dir[1] + g.moon[2] * dir[2]);
    let p = [g.moon[0] + dir[0] * t, g.moon[1] + dir[1] * t, g.moon[2] + dir[2] * t];
    norm(p).copysign(p[2])
}

fn solar_eclipses(start: f64, end: f64, out: &mut Vec<Event>) {
    // Luna nueva: longitud geocéntrica de la Luna − la del Sol pasa por 0
    let phase = |t: f64| {
        let g = geo(t);
        wrap(lon(g.moon) - lon(g.sun))
    };
    for nm in crossings(start, end, 1.0, &phase) {
        let t = golden(nm - 0.4, nm + 0.4, |t| shadow_axis_distance(t).abs());
        let gamma = shadow_axis_distance(t) / R_EARTH;
        if gamma.abs() > 1.57 {
            continue;
        }
        let g = geo(t);
        // Umbra/antumbra en la superficie: comparamos diámetros aparentes desde el punto
        // de la Tierra más cercano al eje (aprox. desde el centro, corregido por la distancia)
        let d_moon = norm(g.moon) - R_EARTH * (1.0 - gamma * gamma).max(0.0).sqrt();
        let moon_ang = (R_MOON / d_moon).asin();
        let sun_ang = (R_SUN / norm(g.sun)).asin();
        let kind = if gamma.abs() < 0.997 {
            if moon_ang > sun_ang { "total" } else { "anular" }
        } else {
            "parcial"
        };
        out.push(Event { jd_tdb: t, kind: EventKind::SolarEclipse { kind, gamma } });
    }
}

fn lunar_eclipses(start: f64, end: f64, out: &mut Vec<Event>) {
    // Luna llena: diferencia de longitudes pasa por π
    let phase = |t: f64| {
        let g = geo(t);
        wrap(lon(g.moon) - lon(g.sun) - std::f64::consts::PI)
    };
    for fm in crossings(start, end, 1.0, &phase) {
        // Distancia de la Luna al eje de la sombra terrestre (dirección antisolar)
        let sep = |t: f64| {
            let g = geo(t);
            let anti = scale(g.sun, -1.0 / norm(g.sun));
            let along = g.moon[0] * anti[0] + g.moon[1] * anti[1] + g.moon[2] * anti[2];
            norm(sub(g.moon, scale(anti, along)))
        };
        let t = golden(fm - 0.4, fm + 0.4, sep);
        let g = geo(t);
        let d = norm(g.moon);
        let ds = norm(g.sun);
        // Conos de sombra a la distancia de la Luna, con el 2 % de ampliación por la atmósfera
        let umbra = 1.02 * (R_EARTH - d * (R_SUN - R_EARTH) / ds);
        let penumbra = 1.02 * (R_EARTH + d * (R_SUN + R_EARTH) / ds);
        let s = sep(t);
        let umag = (umbra + R_MOON - s) / (2.0 * R_MOON);
        let kind = if s + R_MOON < umbra {
            "total"
        } else if s - R_MOON < umbra {
            "parcial"
        } else if s - R_MOON < penumbra {
            "penumbral"
        } else {
            continue;
        };
        out.push(Event { jd_tdb: t, kind: EventKind::LunarEclipse { kind, umbral_magnitude: umag } });
    }
}

fn geocentric_planet(p: Planet, jd: f64) -> ([f64; 3], [f64; 3]) {
    let moon = moon_meeus::geocentric_km(jd);
    let earth = earth_heliocentric_km(heliocentric_km(Planet::EarthMoonBary, jd), moon);
    (sub(heliocentric_km(p, jd), earth), scale(earth, -1.0))
}

fn oppositions(start: f64, end: f64, out: &mut Vec<Event>) {
    for p in [Planet::Mars, Planet::Jupiter, Planet::Saturn, Planet::Uranus, Planet::Neptune] {
        let phase = |t: f64| {
            let (pl, sun) = geocentric_planet(p, t);
            wrap(lon(pl) - lon(sun) - std::f64::consts::PI)
        };
        for t in crossings(start, end, 2.0, &phase) {
            out.push(Event { jd_tdb: t, kind: EventKind::Opposition { planet: p } });
        }
    }
}

fn elongations(start: f64, end: f64, out: &mut Vec<Event>) {
    for p in [Planet::Mercury, Planet::Venus] {
        let elong = |t: f64| {
            let (pl, sun) = geocentric_planet(p, t);
            wrap(lon(pl) - lon(sun))
        };
        // Máximos de |elongación|: donde su derivada cambia de signo
        let deriv = |t: f64| elong(t + 0.01).abs() - elong(t - 0.01).abs();
        let mut t = start;
        let mut prev = deriv(t);
        while t < end {
            let nt = t + 1.0;
            let d = deriv(nt);
            if prev > 0.0 && d <= 0.0 {
                let tm = bisect(t, nt, |x| -deriv(x));
                let e = elong(tm);
                // Evita confundir los mínimos de las conjunciones con máximos
                if e.abs().to_degrees() > 15.0 {
                    out.push(Event {
                        jd_tdb: tm,
                        kind: EventKind::GreatestElongation { planet: p, degrees: e.abs().to_degrees(), east: e > 0.0 },
                    });
                }
            }
            t = nt;
            prev = d;
        }
    }
}

/// Todos los eventos entre dos fechas (días julianos TDB), ordenados.
pub fn find_events(start: f64, end: f64) -> Vec<Event> {
    let mut out = Vec::new();
    solar_eclipses(start, end, &mut out);
    lunar_eclipses(start, end, &mut out);
    oppositions(start, end, &mut out);
    elongations(start, end, &mut out);
    out.sort_by(|a, b| a.jd_tdb.total_cmp(&b.jd_tdb));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn jd(y: i32, m: u32, d: u32, h: f64) -> f64 {
        let (y, m) = if m <= 2 { (y - 1, m + 12) } else { (y, m) };
        let a = (y as f64 / 100.0).floor();
        let b = 2.0 - a + (a / 4.0).floor();
        (365.25 * (y as f64 + 4716.0)).floor() + (30.6001 * (m as f64 + 1.0)).floor() + d as f64 + b - 1524.5 + h / 24.0
    }

    #[test]
    fn eclipses_solares_2024_2027_como_nasa() {
        // Catálogo NASA (Espenak): máximo en TD, γ
        let nasa = [
            (jd(2024, 4, 8, 18.0 + 17.0 / 60.0), 0.3431, "total"),
            (jd(2024, 10, 2, 18.0 + 46.0 / 60.0), -0.3509, "anular"),
            (jd(2025, 3, 29, 10.0 + 48.0 / 60.0), 1.0405, "parcial"),
            (jd(2025, 9, 21, 19.0 + 43.0 / 60.0), -1.0651, "parcial"),
            (jd(2026, 2, 17, 12.0 + 13.0 / 60.0), -0.9743, "anular"),
            (jd(2026, 8, 12, 17.0 + 47.0 / 60.0), 0.8977, "total"),
            (jd(2027, 2, 6, 16.0 + 0.0 / 60.0), -0.2952, "anular"),
            (jd(2027, 8, 2, 10.0 + 8.0 / 60.0), 0.1421, "total"),
        ];
        let found = find_events(jd(2024, 1, 1, 0.0), jd(2027, 12, 31, 0.0));
        let solar: Vec<_> = found.iter().filter_map(|e| match e.kind {
            EventKind::SolarEclipse { kind, gamma } => Some((e.jd_tdb, gamma, kind)),
            _ => None,
        }).collect();
        assert_eq!(solar.len(), nasa.len(), "{solar:?}");
        for ((t, g, k), (nt, ng, nk)) in solar.iter().zip(nasa.iter()) {
            println!("{k} {t:.4} γ={g:.4}  (NASA {nk} {nt:.4} γ={ng})");
            assert!((t - nt).abs() * 1440.0 < 10.0, "hora: {} min", (t - nt) * 1440.0);
            assert!((g - ng).abs() < 0.01, "γ {g} vs {ng}");
            assert_eq!(k, nk);
        }
    }

    #[test]
    fn eclipses_lunares_2025_2026_como_nasa() {
        let found = find_events(jd(2025, 1, 1, 0.0), jd(2026, 12, 31, 0.0));
        let lunar: Vec<_> = found.iter().filter_map(|e| match e.kind {
            EventKind::LunarEclipse { kind, .. } => Some((e.jd_tdb, kind)),
            _ => None,
        }).collect();
        // NASA: 2025-03-14 total, 2025-09-07 total, 2026-03-03 total, 2026-08-28 parcial
        let nasa = [
            (jd(2025, 3, 14, 6.0 + 60.0 / 60.0), "total"),
            (jd(2025, 9, 7, 18.0 + 13.0 / 60.0), "total"),
            (jd(2026, 3, 3, 11.0 + 35.0 / 60.0), "total"),
            (jd(2026, 8, 28, 4.0 + 14.0 / 60.0), "parcial"),
        ];
        assert_eq!(lunar.len(), nasa.len(), "{lunar:?}");
        for ((t, k), (nt, nk)) in lunar.iter().zip(nasa.iter()) {
            println!("{k} {t:.4} (NASA {nk} {nt:.4})");
            assert!((t - nt).abs() * 1440.0 < 15.0);
            assert_eq!(k, nk);
        }
    }

    #[test]
    fn oposicion_de_marte_2025() {
        // 16 de enero de 2025, 02:32 UT
        let ev = find_events(jd(2025, 1, 1, 0.0), jd(2025, 2, 1, 0.0));
        let t = ev.iter().find(|e| e.kind == EventKind::Opposition { planet: Planet::Mars }).unwrap().jd_tdb;
        assert!((t - jd(2025, 1, 16, 2.5)).abs() < 0.2, "{t}");
    }
}
