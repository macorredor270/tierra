//! Asteroides, objetos transneptunianos y cometas: elementos osculantes de JPL SBDB propagados
//! como problema de dos cuerpos alrededor del Sol.

use crate::kepler::Elements;
use crate::time::J2000;
use crate::AU_KM;

/// Constante gravitacional de Gauss (rad/día, con a en au).
pub const GAUSS_K: f64 = 0.017_202_098_95;

/// Registro tal como viene en `smallbodies.bin`: a (au), e, i, Ω, ω, M (°),
/// época − J2000 (días), H, clase.
pub const STRIDE: usize = 9;

/// Elementos osculantes heliocéntricos (ángulos en grados, como en SBDB).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Orbit {
    pub a_au: f64,
    pub e: f64,
    pub i_deg: f64,
    pub node_deg: f64,
    pub peri_deg: f64,
    pub m_deg: f64,
    pub epoch_jd: f64,
}

impl Orbit {
    pub fn from_record(r: &[f32]) -> Self {
        Orbit {
            a_au: r[0] as f64,
            e: r[1] as f64,
            i_deg: r[2] as f64,
            node_deg: r[3] as f64,
            peri_deg: r[4] as f64,
            m_deg: r[5] as f64,
            epoch_jd: J2000 + r[6] as f64,
        }
    }

    pub fn period_days(&self) -> f64 {
        std::f64::consts::TAU / (GAUSS_K / self.a_au.powf(1.5))
    }

    /// Elementos en `jd_tdb`, con `a` en km.
    pub fn elements_at(&self, jd_tdb: f64) -> Elements {
        let n = GAUSS_K / self.a_au.powf(1.5);
        Elements {
            a: self.a_au * AU_KM,
            e: self.e,
            i: self.i_deg.to_radians(),
            node: self.node_deg.to_radians(),
            peri: self.peri_deg.to_radians(),
            m: self.m_deg.to_radians() + n * (jd_tdb - self.epoch_jd),
        }
    }

    pub fn position(&self, jd_tdb: f64) -> [f64; 3] {
        self.elements_at(jd_tdb).position()
    }
}
