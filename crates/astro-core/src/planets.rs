//! Planetas mayores con los elementos keplerianos de E.M. Standish (JPL SSD).
//!
//! Tabla 1: válida 1800–2050. Tabla 2: 3000 a.C.–3000 d.C., con términos extra (b, c, s, f)
//! en la anomalía media de Júpiter a Neptuno. Salen posiciones heliocéntricas en la eclíptica
//! J2000. Para la Tierra la tabla da el baricentro Tierra-Luna; el centro de la Tierra se
//! obtiene restando la parte de la órbita lunar que le corresponde (ver [`earth_heliocentric_km`]).

use crate::kepler::Elements;
use crate::time::centuries;
use crate::AU_KM;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Planet {
    Mercury = 0,
    Venus = 1,
    /// Baricentro Tierra-Luna.
    EarthMoonBary = 2,
    Mars = 3,
    Jupiter = 4,
    Saturn = 5,
    Uranus = 6,
    Neptune = 7,
}

impl Planet {
    pub const ALL: [Planet; 8] = [
        Planet::Mercury,
        Planet::Venus,
        Planet::EarthMoonBary,
        Planet::Mars,
        Planet::Jupiter,
        Planet::Saturn,
        Planet::Uranus,
        Planet::Neptune,
    ];
}

/// a (au), e, I (°), L (°), ϖ (°), Ω (°) y sus tasas por siglo juliano.
type Row = [[f64; 6]; 2];

#[rustfmt::skip]
const TABLE1: [Row; 8] = [
    [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
     [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
    [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
     [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
    [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
     [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
    [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
     [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
    [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
     [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
    [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
     [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
    [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
     [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
    [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
     [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
];

#[rustfmt::skip]
const TABLE2: [Row; 8] = [
    [[0.38709843, 0.20563661, 7.00559432, 252.25166724, 77.45771895, 48.33961819],
     [0.00000000, 0.00002123, -0.00590158, 149472.67486623, 0.15940013, -0.12214182]],
    [[0.72332102, 0.00676399, 3.39777545, 181.97970850, 131.76755713, 76.67261496],
     [-0.00000026, -0.00005107, 0.00043494, 58517.81560260, 0.05679648, -0.27274174]],
    [[1.00000018, 0.01673163, -0.00054346, 100.46691572, 102.93005885, -5.11260389],
     [-0.00000003, -0.00003661, -0.01337178, 35999.37306329, 0.31795260, -0.24123856]],
    [[1.52371243, 0.09336511, 1.85181869, -4.56813164, -23.91744784, 49.71320984],
     [0.00000097, 0.00009149, -0.00724757, 19140.29934243, 0.45223625, -0.26852431]],
    [[5.20248019, 0.04853590, 1.29861416, 34.33479152, 14.27495244, 100.29282654],
     [-0.00002864, 0.00018026, -0.00322699, 3034.90371757, 0.18199196, 0.13024619]],
    [[9.54149883, 0.05550825, 2.49424102, 50.07571329, 92.86136063, 113.63998702],
     [-0.00003065, -0.00032044, 0.00451969, 1222.11494724, 0.54179478, -0.25015002]],
    [[19.18797948, 0.04685740, 0.77298127, 314.20276625, 172.43404441, 73.96250215],
     [-0.00020455, -0.00001550, -0.00180155, 428.49512595, 0.09266985, 0.05739699]],
    [[30.06952752, 0.00895439, 1.77005520, 304.22289287, 46.68158724, 131.78635853],
     [0.00006447, 0.00000818, 0.00022400, 218.46515314, 0.01009938, -0.00606302]],
];

/// Términos b, c, s, f de la Tabla 2 (Júpiter, Saturno, Urano, Neptuno).
#[rustfmt::skip]
const TABLE2_EXTRA: [[f64; 4]; 4] = [
    [-0.00012452, 0.06064060, -0.35635438, 38.35125000],
    [0.00025899, -0.13434469, 0.87320147, 38.35125000],
    [0.00058331, -0.97731848, 0.17689245, 7.67025000],
    [-0.00041348, 0.68346318, -0.10162547, 7.67025000],
];

/// Rango de validez de la Tabla 1, en días julianos (1800-01-01 a 2050-12-31).
const TABLE1_RANGE: (f64, f64) = (2_378_496.5, 2_470_171.5);

/// Elementos del planeta en `jd_tdb`, con `a` en km.
pub fn elements(p: Planet, jd_tdb: f64) -> Elements {
    let t = centuries(jd_tdb);
    let idx = p as usize;
    let use_t1 = (TABLE1_RANGE.0..=TABLE1_RANGE.1).contains(&jd_tdb);
    let [base, rate] = if use_t1 { TABLE1[idx] } else { TABLE2[idx] };
    let el: [f64; 6] = std::array::from_fn(|k| base[k] + rate[k] * t);
    let [a, e, inc, l, varpi, node] = el;

    let mut m = l - varpi;
    if !use_t1 && idx >= 4 {
        let [b, c, s, f] = TABLE2_EXTRA[idx - 4];
        let ft = (f * t).to_radians();
        m += b * t * t + c * ft.cos() + s * ft.sin();
    }
    Elements {
        a: a * AU_KM,
        e,
        i: inc.to_radians(),
        node: node.to_radians(),
        peri: (varpi - node).to_radians(),
        m: m.to_radians(),
    }
}

/// Posición heliocéntrica (km, eclíptica J2000).
pub fn heliocentric_km(p: Planet, jd_tdb: f64) -> [f64; 3] {
    elements(p, jd_tdb).position()
}

/// Masa Luna / (Tierra + Luna), a partir de GM de DE440.
pub const MOON_MASS_FRACTION: f64 = 4_902.800 / (398_600.435 + 4_902.800);

/// Centro de la Tierra a partir del baricentro y de la posición geocéntrica de la Luna.
pub fn earth_heliocentric_km(emb: [f64; 3], moon_geocentric: [f64; 3]) -> [f64; 3] {
    std::array::from_fn(|k| emb[k] - MOON_MASS_FRACTION * moon_geocentric[k])
}
