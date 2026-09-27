# Cambios

## 2.0.0 — 2026-09-27

### Añadido
- Portada con instalación de texturas offline (Cache Storage + Service Worker, verificación sha256, PWA).
- Texturas oficiales de NASA/USGS para 19 cuerpos (Luna, Mercurio, Marte, Júpiter, lunas galileanas, Titán, Encélado, lunas de Saturno, Tritón, Plutón, Caronte, Fobos), en 1K–8K y con color natural.
- Asteroides y cometas propagados en la GPU; colas de cometas.
- Atmósferas con dispersión física (Tierra, Venus, Marte, Titán), anillos de Urano y Neptuno, corona solar.
- Once naves de la NASA/ESA con trayectorias de Horizons (Voyager, New Horizons, Parker, Juno, JWST…), y Plutón con efeméride tabulada.
- Calendario astronómico calculado en Rust (eclipses, oposiciones, elongaciones) validado contra la NASA.
- Tours guiados y enlaces `?tour=`.
- WASM con SIMD y `wasm-opt -O3`.
- ESLint, Prettier, Vitest, Playwright, clippy, CI en tres fases, Dependabot y CodeQL.

### Cambiado
- Código organizado en `engine/`, `data/`, `lib/` y `ui/`.
- TypeScript 6 (typescript-eslint aún no soporta TypeScript 7).

## 1.1.0

- Panel de gráficos, texturas 8K de la Tierra, estrellas HYG, cálculo multinúcleo.
- Sombras analíticas y eclipses; la Luna con la teoría de Meeus.

## 1.0.0

- Reescritura completa: motor de efemérides en Rust/WASM validado contra JPL Horizons, escena en Three.js, interfaz en React + Tailwind, tiempo real y simulado, 460 lunas y 84k cuerpos pequeños.
