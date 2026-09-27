//! Satélites con los elementos medios de JPL SSD ("Planetary Satellite Mean Elements").
//!
//! Cada satélite trae sus elementos en una época, en uno de tres planos de referencia
//! (eclíptica, ecuador del planeta o plano de Laplace), más los periodos de precesión del
//! argumento del periapsis y del nodo. JPL avisa de que son elementos descriptivos: sirven
//! para dibujar la órbita y situar la luna, no para efemérides de precisión.

use crate::frames::{icrf_to_ecliptic, plane_basis_icrf};
use crate::kepler::Elements;
use crate::time::DAYS_PER_YEAR;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum RefPlane {
    Ecliptic,
    /// Plano de Laplace o ecuador del planeta, dado por su polo (α, δ) en ICRF.
    Pole { ra_deg: f64, dec_deg: f64 },
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MoonElements {
    pub plane: RefPlane,
    pub epoch_jd: f64,
    pub a_km: f64,
    pub e: f64,
    pub peri_deg: f64,
    pub m_deg: f64,
    pub i_deg: f64,
    pub node_deg: f64,
    pub period_days: f64,
    /// Periodo de precesión de ω, en años (0 = sin dato).
    pub apsis_period_yr: f64,
    /// Periodo de regresión del nodo, en años (0 = sin dato).
    pub node_period_yr: f64,
}

impl MoonElements {
    fn plane_basis(&self) -> Option<[[f64; 3]; 3]> {
        match self.plane {
            RefPlane::Ecliptic => None,
            RefPlane::Pole { ra_deg, dec_deg } => Some(plane_basis_icrf(ra_deg, dec_deg)),
        }
    }

    /// Elementos propagados a `jd_tdb`, en el plano de referencia propio.
    pub fn elements_at(&self, jd_tdb: f64) -> Elements {
        let dt = jd_tdb - self.epoch_jd;
        let years = dt / DAYS_PER_YEAR;
        let rate = |p: f64| if p > 0.0 { 360.0 / p } else { 0.0 };
        // El achatamiento del planeta y el Sol hacen que el nodo regrese en órbitas directas y
        // avance en las retrógradas; el periapsis avanza.
        let node_sign = -self.i_deg.to_radians().cos().signum();
        let d_node = node_sign * rate(self.node_period_yr) * years;
        let d_peri = rate(self.apsis_period_yr) * years;
        // El periodo sideral fija la longitud media λ = Ω + ω + M.
        let d_m = 360.0 * dt / self.period_days - d_node - d_peri;
        Elements {
            a: self.a_km,
            e: self.e,
            i: self.i_deg.to_radians(),
            node: (self.node_deg + d_node).to_radians(),
            peri: (self.peri_deg + d_peri).to_radians(),
            m: (self.m_deg + d_m).to_radians(),
        }
    }

    fn to_ecliptic(&self, v: [f64; 3], basis: &Option<[[f64; 3]; 3]>) -> [f64; 3] {
        match basis {
            None => v,
            Some([x, y, z]) => icrf_to_ecliptic(std::array::from_fn(|k| {
                v[0] * x[k] + v[1] * y[k] + v[2] * z[k]
            })),
        }
    }

    /// Posición relativa al planeta (km, eclíptica J2000).
    pub fn position(&self, jd_tdb: f64) -> [f64; 3] {
        self.to_ecliptic(self.elements_at(jd_tdb).position(), &self.plane_basis())
    }

    /// Órbita en `jd_tdb`, relativa al planeta (km, eclíptica J2000).
    pub fn orbit(&self, jd_tdb: f64, n: usize) -> Vec<[f64; 3]> {
        let basis = self.plane_basis();
        self.elements_at(jd_tdb)
            .sample_orbit(n)
            .into_iter()
            .map(|p| self.to_ecliptic(p, &basis))
            .collect()
    }
}
