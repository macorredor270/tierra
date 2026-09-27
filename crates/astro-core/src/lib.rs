//! Efemérides del sistema solar.
//!
//! Todas las posiciones salen en el marco **eclíptica y equinoccio J2000** (el mismo que usa
//! JPL Horizons con `REF_PLANE=ECLIPTIC`), en kilómetros salvo que se indique lo contrario.
//!
//! Fuentes:
//! - Planetas: E.M. Standish, "Keplerian Elements for Approximate Positions of the Major
//!   Planets" (JPL SSD, <https://ssd.jpl.nasa.gov/planets/approx_pos.html>).
//! - Lunas: JPL SSD "Planetary Satellite Mean Elements" (<https://ssd.jpl.nasa.gov/sats/elem/>).
//! - Orientación: Archinal et al. 2018, "Report of the IAU WGCCRE: 2015" (CeMDA 130:22).
//! - Cuerpos pequeños: elementos osculantes de JPL SBDB, propagados como problema de dos cuerpos.

pub mod events;
pub mod frames;
pub mod kepler;
pub mod moon_meeus;
pub mod moons;
pub mod planets;
pub mod rotation;
pub mod smallbody;
pub mod time;

pub use kepler::Elements;

/// Unidad astronómica en km (IAU 2012, exacta).
pub const AU_KM: f64 = 149_597_870.7;
