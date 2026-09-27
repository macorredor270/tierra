use std::f64::consts::{PI, TAU};

/// Elementos orbitales keplerianos. Ángulos en radianes; `a` en la unidad que se quiera
/// (las posiciones salen en esa misma unidad).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Elements {
    pub a: f64,
    pub e: f64,
    pub i: f64,
    /// Longitud del nodo ascendente Ω.
    pub node: f64,
    /// Argumento del periapsis ω.
    pub peri: f64,
    /// Anomalía media M.
    pub m: f64,
}

/// Resuelve la ecuación de Kepler `M = E − e·sin E` por Newton-Raphson.
pub fn solve_kepler(m: f64, e: f64) -> f64 {
    let m = wrap_pi(m);
    let mut ea = if e > 0.8 { PI.copysign(m) } else { m + e * m.sin() };
    for _ in 0..50 {
        let f = ea - e * ea.sin() - m;
        let d = f / (1.0 - e * ea.cos());
        ea -= d;
        if d.abs() < 1e-13 {
            break;
        }
    }
    ea
}

/// Lleva un ángulo a (−π, π].
pub fn wrap_pi(x: f64) -> f64 {
    let r = x.rem_euclid(TAU);
    if r > PI {
        r - TAU
    } else {
        r
    }
}

impl Elements {
    /// Coordenadas en el plano orbital (x hacia el periapsis) para una anomalía excéntrica.
    fn plane(&self, ea: f64) -> (f64, f64) {
        (self.a * (ea.cos() - self.e), self.a * (1.0 - self.e * self.e).sqrt() * ea.sin())
    }

    /// Rota de plano orbital al marco de referencia con Rz(Ω)·Rx(I)·Rz(ω).
    fn to_reference(&self, x: f64, y: f64) -> [f64; 3] {
        let (so, co) = self.peri.sin_cos();
        let (sn, cn) = self.node.sin_cos();
        let (si, ci) = self.i.sin_cos();
        [
            (co * cn - so * sn * ci) * x + (-so * cn - co * sn * ci) * y,
            (co * sn + so * cn * ci) * x + (-so * sn + co * cn * ci) * y,
            (so * si) * x + (co * si) * y,
        ]
    }

    /// Posición en el marco de referencia de los elementos.
    pub fn position(&self) -> [f64; 3] {
        let (x, y) = self.plane(solve_kepler(self.m, self.e));
        self.to_reference(x, y)
    }

    /// `n` puntos de la elipse orbital, espaciados en anomalía excéntrica (más densos donde
    /// la curvatura es mayor que un reparto uniforme en tiempo).
    pub fn sample_orbit(&self, n: usize) -> Vec<[f64; 3]> {
        (0..n)
            .map(|k| {
                let (x, y) = self.plane(TAU * k as f64 / n as f64);
                self.to_reference(x, y)
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kepler_satisface_la_ecuacion() {
        for &e in &[0.0, 0.1, 0.5, 0.9, 0.99] {
            for k in 0..64 {
                let m = -PI + TAU * k as f64 / 64.0;
                let ea = solve_kepler(m, e);
                assert!((wrap_pi(ea - e * ea.sin()) - wrap_pi(m)).abs() < 1e-10, "e={e} M={m}");
            }
        }
    }

    #[test]
    fn orbita_circular_tiene_radio_constante() {
        let el = Elements { a: 2.0, e: 0.0, i: 0.3, node: 1.0, peri: 0.5, m: 0.0 };
        for p in el.sample_orbit(32) {
            let r = (p[0] * p[0] + p[1] * p[1] + p[2] * p[2]).sqrt();
            assert!((r - 2.0).abs() < 1e-12);
        }
    }
}
