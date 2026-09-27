//! Puente WebAssembly: calcula el estado de todo el sistema solar para un instante y lo deja en
//! buffers que JavaScript lee directamente.
//!
//! Coordenadas de escena (las de Three.js, Y arriba): `(x, y, z)_escena = (x, z, −y)_eclíptica`,
//! en kilómetros, heliocéntricas.

use astro_core::events::{find_events, EventKind};
use astro_core::frames::add;
use astro_core::moon_meeus;
use astro_core::moons::{MoonElements, RefPlane};
use astro_core::planets::{earth_heliocentric_km, elements, Planet};
use astro_core::rotation::{body_axes, Body};
use astro_core::smallbody::{Orbit, STRIDE};
use astro_core::time::{jd_from_unix_ms, tdb_from_utc};
use wasm_bindgen::prelude::*;

/// Índices fijos: 0 Sol, 1–8 planetas, 9–13 enanos (Ceres, Plutón, Eris, Makemake, Haumea),
/// y a partir de 14 las lunas en el orden en que llegan.
pub const EARTH: usize = 3;
pub const FIRST_DWARF: usize = 9;
pub const FIRST_MOON: usize = 14;
const ORIENTED: [Body; 11] = [
    Body::Sun,
    Body::Mercury,
    Body::Venus,
    Body::Earth,
    Body::Mars,
    Body::Jupiter,
    Body::Saturn,
    Body::Uranus,
    Body::Neptune,
    Body::Ceres,
    Body::Pluto,
];
pub const MOON_RECORD: usize = 13;
pub const DWARF_RECORD: usize = 7;

fn to_scene(v: [f64; 3]) -> [f64; 3] {
    [v[0], v[2], -v[1]]
}

#[wasm_bindgen]
pub struct Solar {
    moons: Vec<MoonElements>,
    moon_parent: Vec<usize>,
    earth_moon: Option<usize>,
    dwarfs: Vec<Orbit>,
    small: Vec<f32>,
    small_out: Vec<f32>,
    /// Cuántos cuerpos pequeños se propagan (los primeros del buffer).
    small_limit: usize,
    /// Posiciones heliocéntricas en eclíptica (km), antes de pasar a escena.
    ecl: Vec<[f64; 3]>,
    positions: Vec<f64>,
    orientations: Vec<f32>,
    jd_tdb: f64,
}

#[wasm_bindgen]
impl Solar {
    /// `moons`: registros de 13 f64 `[plano(0 eclíptica, 1 polo), α, δ, época, a(km), e, ω, M,
    /// i, Ω, P(d), P_ω(años), P_Ω(años)]`; `moon_parent`: índice del cuerpo principal de cada
    /// luna; `dwarfs`: 7 f64 `[época, a(au), e, i, Ω, ω, M]`; `small`: `smallbodies.bin`.
    #[wasm_bindgen(constructor)]
    pub fn new(moons: &[f64], moon_parent: &[u32], dwarfs: &[f64], small: Vec<f32>) -> Solar {
        let moons: Vec<MoonElements> = moons
            .chunks_exact(MOON_RECORD)
            .map(|r| MoonElements {
                plane: if r[0] == 0.0 {
                    RefPlane::Ecliptic
                } else {
                    RefPlane::Pole { ra_deg: r[1], dec_deg: r[2] }
                },
                epoch_jd: r[3],
                a_km: r[4],
                e: r[5],
                peri_deg: r[6],
                m_deg: r[7],
                i_deg: r[8],
                node_deg: r[9],
                period_days: r[10],
                apsis_period_yr: r[11],
                node_period_yr: r[12],
            })
            .collect();
        let moon_parent: Vec<usize> = moon_parent.iter().map(|&p| p as usize).collect();
        let earth_moon = moon_parent.iter().position(|&p| p == EARTH);
        let dwarfs = dwarfs
            .chunks_exact(DWARF_RECORD)
            .map(|r| Orbit {
                epoch_jd: r[0],
                a_au: r[1],
                e: r[2],
                i_deg: r[3],
                node_deg: r[4],
                peri_deg: r[5],
                m_deg: r[6],
            })
            .collect();
        let n = FIRST_MOON + moons.len();
        Solar {
            moons,
            moon_parent,
            earth_moon,
            dwarfs,
            small_out: vec![0.0; small.len() / STRIDE * 3],
            small_limit: small.len() / STRIDE,
            small,
            ecl: vec![[0.0; 3]; n],
            positions: vec![0.0; n * 3],
            orientations: vec![0.0; (ORIENTED.len() + 1) * 9],
            jd_tdb: 0.0,
        }
    }

    /// Día juliano UTC para un instante `Date.now()`.
    pub fn jd_from_unix_ms(ms: f64) -> f64 {
        jd_from_unix_ms(ms)
    }

    pub fn body_count(&self) -> usize {
        self.ecl.len()
    }

    pub fn small_count(&self) -> usize {
        self.small.len() / STRIDE
    }

    /// Limita la propagación a los primeros `n` cuerpos pequeños (densidad gráfica).
    pub fn set_small_limit(&mut self, n: usize) {
        self.small_limit = n.min(self.small_count());
    }

    /// Fija el instante sin recalcular los cuerpos principales (lo usan los workers que solo
    /// propagan cuerpos pequeños).
    pub fn set_time(&mut self, jd_utc: f64) {
        self.jd_tdb = tdb_from_utc(jd_utc);
    }

    /// Calcula posiciones y orientaciones de todos los cuerpos principales y lunas.
    pub fn update(&mut self, jd_utc: f64) {
        let jd = tdb_from_utc(jd_utc);
        self.jd_tdb = jd;
        self.ecl[0] = [0.0; 3];
        for (k, p) in Planet::ALL.iter().enumerate() {
            self.ecl[1 + k] = elements(*p, jd).position();
        }
        // La Luna con la teoría de Meeus (ELP-2000/82 truncada): precisión de eclipse
        let moon_geo = moon_meeus::geocentric_km(jd);
        if self.earth_moon.is_some() {
            self.ecl[EARTH] = earth_heliocentric_km(self.ecl[EARTH], moon_geo);
        }
        for (k, d) in self.dwarfs.iter().enumerate() {
            self.ecl[FIRST_DWARF + k] = d.position(jd);
        }
        for (k, m) in self.moons.iter().enumerate() {
            let parent = self.ecl[self.moon_parent[k]];
            let rel = if Some(k) == self.earth_moon { moon_geo } else { m.position(jd) };
            self.ecl[FIRST_MOON + k] = add(parent, rel);
        }
        for (k, v) in self.ecl.iter().enumerate() {
            let s = to_scene(*v);
            self.positions[k * 3..k * 3 + 3].copy_from_slice(&s);
        }
        for (k, b) in ORIENTED.iter().chain([Body::Moon].iter()).enumerate() {
            // La rotación terrestre sigue el tiempo universal (UT1 ≈ UTC), no el dinámico
            let t = if *b == Body::Earth { jd_utc } else { jd };
            self.write_axes(k, body_axes(*b, t));
        }
    }

    /// Posiciones heliocéntricas de escena (km), 3 por cuerpo.
    pub fn positions(&self) -> Vec<f64> {
        self.positions.clone()
    }

    /// Matriz de rotación (columnas, 9 f32) de Sol, planetas, Ceres, Plutón y la Luna (en ese
    /// orden). Pasa de ejes locales de `SphereGeometry` (x meridiano 0°, y polo, z = −90° E) a
    /// escena.
    pub fn orientations(&self) -> Vec<f32> {
        self.orientations.clone()
    }

    /// Órbita del cuerpo `index` en el instante actual, relativa a su primario (km escena).
    pub fn orbit(&self, index: usize, n: usize) -> Vec<f64> {
        let jd = self.jd_tdb;
        let pts: Vec<[f64; 3]> = if (1..=8).contains(&index) {
            elements(Planet::ALL[index - 1], jd).sample_orbit(n)
        } else if (FIRST_DWARF..FIRST_MOON).contains(&index) {
            self.dwarfs[index - FIRST_DWARF].elements_at(jd).sample_orbit(n)
        } else if index >= FIRST_MOON {
            self.moons[index - FIRST_MOON].orbit(jd, n)
        } else {
            Vec::new()
        };
        pts.into_iter().flat_map(to_scene).collect()
    }

    /// Índice del primario de un cuerpo (el Sol devuelve 0).
    pub fn parent_of(&self, index: usize) -> usize {
        if index >= FIRST_MOON {
            self.moon_parent[index - FIRST_MOON]
        } else {
            0
        }
    }

    /// Propaga todos los cuerpos pequeños y escribe posiciones relativas a la cámara (km, f32)
    /// en un buffer que JS lee sin copia vía [`Solar::small_ptr`]. La resta se hace en f64,
    /// así que no hay temblor aunque la cámara esté a 50 au del Sol.
    pub fn update_small(&mut self, cam_x: f64, cam_y: f64, cam_z: f64) {
        let jd = self.jd_tdb;
        for (k, rec) in self.small.chunks_exact(STRIDE).take(self.small_limit).enumerate() {
            let p = to_scene(Orbit::from_record(rec).position(jd));
            let o = &mut self.small_out[k * 3..k * 3 + 3];
            o[0] = (p[0] - cam_x) as f32;
            o[1] = (p[1] - cam_y) as f32;
            o[2] = (p[2] - cam_z) as f32;
        }
    }

    pub fn small_ptr(&self) -> *const f32 {
        self.small_out.as_ptr()
    }

    /// Eventos astronómicos entre dos fechas (días julianos UTC) como JSON:
    /// `[{"jd": día juliano UTC, "type": ..., ...}]`. Los planetas van con su índice de cuerpo.
    pub fn events_json(jd_start_utc: f64, jd_end_utc: f64) -> String {
        let events = find_events(tdb_from_utc(jd_start_utc), tdb_from_utc(jd_end_utc));
        let body = |p: Planet| p as usize + 1;
        let items: Vec<String> = events
            .iter()
            .map(|e| {
                let jd = e.jd_tdb - (tdb_from_utc(0.0) - 0.0);
                match &e.kind {
                    EventKind::SolarEclipse { kind, gamma } => {
                        format!(r#"{{"jd":{jd:.6},"type":"solar","kind":"{kind}","gamma":{gamma:.4}}}"#)
                    }
                    EventKind::LunarEclipse { kind, umbral_magnitude } => {
                        format!(r#"{{"jd":{jd:.6},"type":"lunar","kind":"{kind}","magnitude":{umbral_magnitude:.3}}}"#)
                    }
                    EventKind::Opposition { planet } => {
                        format!(r#"{{"jd":{jd:.6},"type":"opposition","body":{}}}"#, body(*planet))
                    }
                    EventKind::GreatestElongation { planet, degrees, east } => format!(
                        r#"{{"jd":{jd:.6},"type":"elongation","body":{},"degrees":{degrees:.1},"east":{east}}}"#,
                        body(*planet)
                    ),
                }
            })
            .collect();
        format!("[{}]", items.join(","))
    }
}

impl Solar {
    fn write_axes(&mut self, slot: usize, axes: [[f64; 3]; 3]) {
        let [meridian, pole, east] = axes.map(to_scene);
        // SphereGeometry: +x = longitud 0°, +y = polo norte, −z = longitud 90° E
        let cols = [meridian, pole, [-east[0], -east[1], -east[2]]];
        for (c, col) in cols.iter().enumerate() {
            for r in 0..3 {
                self.orientations[slot * 9 + c * 3 + r] = col[r] as f32;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn estado_basico() {
        let moon = [0.0, 0.0, 0.0, 2451545.0, 384400.0, 0.0554, 318.15, 135.27, 5.16, 125.08, 27.322, 5.997, 18.6];
        let dwarf = [2461310.5, 39.34, 0.248, 17.17, 110.3, 113.06, 54.35];
        let small = vec![2.77, 0.08, 10.6, 80.2, 73.2, 298.0, 9765.5, 3.3, 1.0];
        let mut s = Solar::new(&moon, &[EARTH as u32], &dwarf, small);
        s.update(2461310.5);
        let p = s.positions();
        let d = |i: usize| (p[i * 3].powi(2) + p[i * 3 + 1].powi(2) + p[i * 3 + 2].powi(2)).sqrt() / 1.495978707e8;
        assert!((d(EARTH) - 1.0).abs() < 0.02);
        assert!((d(FIRST_DWARF) - 35.0).abs() < 10.0);
        s.update_small(0.0, 0.0, 0.0);
        assert_eq!(s.small_count(), 1);
        assert_eq!(s.orbit(EARTH, 16).len(), 48);
    }
}
