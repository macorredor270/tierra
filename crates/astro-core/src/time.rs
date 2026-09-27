/// Época J2000.0 (2000-01-01 12:00 TT) en día juliano.
pub const J2000: f64 = 2_451_545.0;
pub const DAYS_PER_CENTURY: f64 = 36_525.0;
pub const DAYS_PER_YEAR: f64 = 365.25;

/// TDB − UTC = 32.184 s (TT − TAI) + 37 s de segundos intercalares vigentes desde 2017.
const TDB_MINUS_UTC_S: f64 = 69.184;

/// Día juliano (UTC) a partir de milisegundos Unix, como los da `Date.now()`.
pub fn jd_from_unix_ms(ms: f64) -> f64 {
    ms / 86_400_000.0 + 2_440_587.5
}

/// Aproximación TDB ≈ UTC + 69.184 s. El error (< 2 ms de TDB−TT, y los segundos intercalares
/// fuera de la era actual) queda muy por debajo de la precisión de los elementos keplerianos.
pub fn tdb_from_utc(jd_utc: f64) -> f64 {
    jd_utc + TDB_MINUS_UTC_S / 86_400.0
}

/// Siglos julianos desde J2000.
pub fn centuries(jd_tdb: f64) -> f64 {
    (jd_tdb - J2000) / DAYS_PER_CENTURY
}
