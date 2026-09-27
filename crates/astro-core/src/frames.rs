//! Cambios de marco entre ICRF (ecuatorial J2000) y eclíptica J2000.

/// Oblicuidad de la eclíptica en J2000 que usa JPL para esta conversión (23°26'21.406").
pub const OBLIQUITY_J2000_DEG: f64 = 23.439_279_444;

pub fn icrf_to_ecliptic(v: [f64; 3]) -> [f64; 3] {
    let (s, c) = OBLIQUITY_J2000_DEG.to_radians().sin_cos();
    [v[0], c * v[1] + s * v[2], -s * v[1] + c * v[2]]
}

pub fn ecliptic_to_icrf(v: [f64; 3]) -> [f64; 3] {
    let (s, c) = OBLIQUITY_J2000_DEG.to_radians().sin_cos();
    [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]]
}

/// Vector unitario ICRF para una ascensión recta y declinación en grados.
pub fn radec_unit(ra_deg: f64, dec_deg: f64) -> [f64; 3] {
    let (sa, ca) = ra_deg.to_radians().sin_cos();
    let (sd, cd) = dec_deg.to_radians().sin_cos();
    [cd * ca, cd * sa, sd]
}

pub fn cross(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

pub fn norm(v: [f64; 3]) -> f64 {
    (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt()
}

pub fn scale(v: [f64; 3], k: f64) -> [f64; 3] {
    [v[0] * k, v[1] * k, v[2] * k]
}

pub fn add(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

pub fn sub(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

/// Base ortonormal (x, y, z) de un plano cuyo polo está en (α, δ) ICRF, con el eje x en el nodo
/// ascendente de ese plano sobre el ecuador ICRF (en α + 90°), el convenio de IAU y de JPL.
pub fn plane_basis_icrf(pole_ra_deg: f64, pole_dec_deg: f64) -> [[f64; 3]; 3] {
    let z = radec_unit(pole_ra_deg, pole_dec_deg);
    let (sa, ca) = pole_ra_deg.to_radians().sin_cos();
    let x = [-sa, ca, 0.0];
    let y = cross(z, x);
    [x, y, z]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ida_y_vuelta() {
        let v = [0.3, -1.2, 0.7];
        let w = ecliptic_to_icrf(icrf_to_ecliptic(v));
        for k in 0..3 {
            assert!((v[k] - w[k]).abs() < 1e-14);
        }
    }

    #[test]
    fn polo_de_la_ecliptica() {
        // El polo norte de la eclíptica está en α = 270°, δ = 90° − ε.
        let p = icrf_to_ecliptic(radec_unit(270.0, 90.0 - OBLIQUITY_J2000_DEG));
        assert!((p[2] - 1.0).abs() < 1e-12);
    }
}
