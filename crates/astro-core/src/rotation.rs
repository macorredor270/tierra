//! Orientación de los cuerpos según el informe IAU WGCCRE 2015 (Archinal et al. 2018).
//!
//! Cada cuerpo tiene su polo norte en (α0, δ0) ICRF y su meridiano principal a un ángulo W
//! medido desde el nodo Q (el nodo ascendente de su ecuador sobre el ecuador ICRF). Se omiten
//! los términos periódicos pequeños (libraciones, nutación de Neptuno): mueven el polo menos
//! de un grado, que no se aprecia en pantalla.

use crate::frames::{add, cross, icrf_to_ecliptic, plane_basis_icrf, scale};
use crate::time::{centuries, J2000};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Body {
    Sun,
    Mercury,
    Venus,
    Earth,
    Moon,
    Mars,
    Jupiter,
    Saturn,
    Uranus,
    Neptune,
    Pluto,
    Ceres,
}

/// (α0, δ0, W) en grados.
pub fn pole_and_meridian(body: Body, jd_tdb: f64) -> (f64, f64, f64) {
    let d = jd_tdb - J2000;
    let t = centuries(jd_tdb);
    match body {
        Body::Sun => (286.13, 63.87, 84.176 + 14.184_400_0 * d),
        Body::Mercury => (
            281.0103 - 0.0328 * t,
            61.4155 - 0.0049 * t,
            329.5988 + 6.138_510_8 * d,
        ),
        Body::Venus => (272.76, 67.16, 160.20 - 1.481_368_8 * d),
        Body::Earth => (
            0.00 - 0.641 * t,
            90.00 - 0.557 * t,
            190.147 + 360.985_623_5 * d,
        ),
        Body::Moon => (
            269.9949 + 0.0031 * t,
            66.5392 + 0.0130 * t,
            38.3213 + 13.176_358_15 * d,
        ),
        Body::Mars => (
            317.269202 - 0.10927547 * t,
            54.432516 - 0.05827105 * t,
            176.049863 + 350.891_982_443_297 * d,
        ),
        Body::Jupiter => (
            268.056595 - 0.006499 * t,
            64.495303 + 0.002413 * t,
            284.95 + 870.536 * d,
        ),
        Body::Saturn => (
            40.589 - 0.036 * t,
            83.537 - 0.004 * t,
            38.90 + 810.793_902_4 * d,
        ),
        Body::Uranus => (257.311, -15.175, 203.81 - 501.160_092_8 * d),
        Body::Neptune => (299.36, 43.46, 249.978 + 541.139_775_7 * d),
        Body::Pluto => (132.993, -6.163, 302.695 + 56.362_522_5 * d),
        Body::Ceres => (291.418, 66.764, 170.650 + 952.153_2 * d),
    }
}

/// Ejes del cuerpo en la eclíptica J2000: `[meridiano 0°, polo norte, longitud 90° E]`.
pub fn body_axes(body: Body, jd_tdb: f64) -> [[f64; 3]; 3] {
    let (ra, dec, w) = pole_and_meridian(body, jd_tdb);
    let [q, y, pole] = plane_basis_icrf(ra, dec);
    let (sw, cw) = w.to_radians().sin_cos();
    let meridian = add(scale(q, cw), scale(y, sw));
    let east = cross(pole, meridian);
    [
        icrf_to_ecliptic(meridian),
        icrf_to_ecliptic(pole),
        icrf_to_ecliptic(east),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::frames::radec_unit;

    #[test]
    fn oblicuidad_de_la_tierra() {
        let [_, pole, _] = body_axes(Body::Earth, J2000);
        let tilt = pole[2].acos().to_degrees();
        assert!((tilt - 23.44).abs() < 0.01, "{tilt}");
    }

    #[test]
    fn urano_esta_tumbado() {
        let [_, pole, _] = body_axes(Body::Uranus, J2000);
        let tilt = pole[2].acos().to_degrees();
        // El polo "norte" IAU es el del lado norte del plano invariable (~82° de la eclíptica)
        // y el giro es retrógrado (W decrece): equivale a la oblicuidad de 97.8° habitual.
        assert!((tilt - 82.2).abs() < 1.0, "{tilt}");
        let (_, _, w0) = pole_and_meridian(Body::Uranus, J2000);
        let (_, _, w1) = pole_and_meridian(Body::Uranus, J2000 + 1.0);
        assert!(w1 < w0);
    }

    #[test]
    fn ejes_ortonormales() {
        let [m, p, e] = body_axes(Body::Mars, J2000 + 1234.5);
        let dot = |a: [f64; 3], b: [f64; 3]| a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        assert!(dot(m, p).abs() < 1e-12 && dot(m, e).abs() < 1e-12 && dot(p, e).abs() < 1e-12);
        let p_expected = icrf_to_ecliptic(radec_unit(
            317.269202 - 0.10927547 * centuries(J2000 + 1234.5),
            54.432516 - 0.05827105 * centuries(J2000 + 1234.5),
        ));
        assert!(dot(p, p_expected) > 1.0 - 1e-12);
    }
}
