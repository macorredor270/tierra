//! Validación contra JPL Horizons (DE441). Los vectores de referencia están en
//! `tests/fixtures/horizons.json`, generados con `scripts/fetch_data.py`.

use astro_core::frames::{norm, sub};
use astro_core::moons::{MoonElements, RefPlane};
use astro_core::planets::{earth_heliocentric_km, heliocentric_km, Planet};
use serde_json::Value;

fn load(path: &str) -> Value {
    let full = concat!(env!("CARGO_MANIFEST_DIR"), "/");
    serde_json::from_str(&std::fs::read_to_string(format!("{full}{path}")).unwrap()).unwrap()
}

fn xyz(v: &Value) -> [f64; 3] {
    let a = v["xyz_km"].as_array().unwrap();
    std::array::from_fn(|k| a[k].as_f64().unwrap())
}

/// Error angular visto desde el centro (grados) y error relativo de distancia.
fn errors(ours: [f64; 3], truth: [f64; 3]) -> (f64, f64) {
    let dot = (ours[0] * truth[0] + ours[1] * truth[1] + ours[2] * truth[2]) / (norm(ours) * norm(truth));
    (dot.clamp(-1.0, 1.0).acos().to_degrees(), (norm(ours) - norm(truth)).abs() / norm(truth))
}

fn moon_by_code(code: u64) -> MoonElements {
    let data = load("../../web/public/data/moons.json");
    let m = data["moons"]
        .as_array()
        .unwrap()
        .iter()
        .find(|m| m["code"].as_u64() == Some(code))
        .unwrap();
    let f = |k: &str| m[k].as_f64().unwrap_or(0.0);
    MoonElements {
        plane: if m["frame"] == "ecliptic" {
            RefPlane::Ecliptic
        } else {
            RefPlane::Pole { ra_deg: f("poleRa"), dec_deg: f("poleDec") }
        },
        epoch_jd: f("epoch"),
        a_km: f("a"),
        e: f("e"),
        peri_deg: f("w"),
        m_deg: f("M"),
        i_deg: f("i"),
        node_deg: f("node"),
        period_days: f("P"),
        apsis_period_yr: f("Papsis"),
        node_period_yr: f("Pnode"),
    }
}

fn check_planets(key: &str, max_deg: &[f64; 8], max_rel: f64) {
    let fx = load("tests/fixtures/horizons.json");
    let moon = moon_by_code(301);
    for (idx, p) in Planet::ALL.iter().enumerate() {
        for s in fx[key][idx.to_string()].as_array().unwrap() {
            let jd = s["jd_tdb"].as_f64().unwrap();
            // Horizons "3" es el baricentro Tierra-Luna, igual que la tabla
            let ours = heliocentric_km(*p, jd);
            let (ang, rel) = errors(ours, xyz(s));
            println!("{key} {p:?} {} → {ang:.4}° {:.4}%", s["date"], rel * 100.0);
            assert!(ang < max_deg[idx], "{p:?} {}: {ang}°", s["date"]);
            assert!(rel < max_rel, "{p:?} {}: {rel}", s["date"]);
        }
    }
    // El centro de la Tierra se separa del baricentro ~4700 km; comprobamos el signo
    let jd = 2_451_545.0;
    let emb = heliocentric_km(Planet::EarthMoonBary, jd);
    let earth = earth_heliocentric_km(emb, moon.position(jd));
    let d = norm(sub(earth, emb));
    assert!((4000.0..5200.0).contains(&d), "{d}");
}

#[test]
fn planetas_tabla1_1800_2050() {
    // Errores documentados por JPL para 1800–2050: < 0.1° en todos los planetas
    check_planets("planets", &[0.02, 0.02, 0.02, 0.03, 0.12, 0.2, 0.1, 0.1], 0.005);
}

#[test]
fn planetas_tabla2_3000ac_3000dc() {
    check_planets("planets_long_range", &[0.1, 0.1, 0.1, 0.2, 0.5, 1.0, 1.5, 1.0], 0.02);
}

#[test]
fn lunas_con_elementos_medios() {
    let fx = load("tests/fixtures/horizons.json");
    // Elementos medios (JPL avisa de que son descriptivos): toleramos unos grados
    for (code, max_deg) in [(301, 6.0), (401, 5.0), (501, 5.0), (606, 5.0), (801, 5.0)] {
        let moon = moon_by_code(code);
        for s in fx["moons"][code.to_string()].as_array().unwrap() {
            let jd = s["jd_tdb"].as_f64().unwrap();
            let (ang, rel) = errors(moon.position(jd), xyz(s));
            println!("luna {code} {} → {ang:.3}° {:.3}%", s["date"], rel * 100.0);
            assert!(ang < max_deg, "luna {code} {}: {ang}°", s["date"]);
            assert!(rel < 0.1, "luna {code} {}: {rel}", s["date"]);
        }
    }
}
