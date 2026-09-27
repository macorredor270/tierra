# Sistema Solar en tiempo real

> **Rama `DECOMPILED`**: el código fuente completo, con el motor en Rust y sus tests. El motor se compila a WebAssembly en tu máquina.
> Si solo quieres ejecutar la app sin instalar Rust, usa la rama [`COMPILED`](../../tree/COMPILED).

El sistema solar completo en el navegador, con las posiciones **reales** de cada cuerpo calculadas a partir de datos y métodos oficiales de NASA/JPL. El motor de efemérides está escrito en **Rust** y se compila a **WebAssembly**; el render usa **Three.js/WebGL** y la interfaz **React + Tailwind**.

- **Tiempo real**: por defecto el instante es el de tu reloj, así que ves dónde está cada planeta y cada luna ahora mismo (y el lado nocturno de la Tierra es el que está de noche).
- **Tiempo simulado**: ×1, ×5, ×20, ×100, ×1k… ×10M, marcha atrás, pausa y salto a cualquier fecha entre el 3000 a.C. y el 3000 d.C.
- **Contenido**: el Sol, 8 planetas, 5 planetas enanos, 460 lunas, 83.867 asteroides, troyanos, centauros, transneptunianos y cometas periódicos.
- **Filtros**: planetas, planetas enanos, lunas principales, lunas menores, órbitas, etiquetas y cada clase de cuerpo pequeño por separado.
- **Escala real**: los tamaños y las distancias son los reales. Con profundidad logarítmica y origen flotante se puede ir de la superficie de Fobos a la órbita de Eris sin cortes ni temblores.

## Portada e instalación de texturas

Al abrir la web aparece una portada con un botón **Instalar texturas**: descarga una vez los mosaicos de todos los planetas y lunas en la calidad elegida (Medio 2K, Alto 4K o Ultra 8K), verifica cada archivo con su sha256 y los guarda en el navegador (Cache Storage con un Service Worker). Después, el simulador arranca al instante y funciona sin conexión; también se puede instalar como app (PWA). Sin instalar, las texturas se descargan sobre la marcha: primero en 1K y luego en la calidad elegida.

## Texturas de todos los cuerpos

`scripts/build_textures.py` descarga los mosaicos globales oficiales y los corrige para que se vean como a simple vista: los mapas científicos en gris (Ío, Europa, Plutón…) se colorean con la paleta real de cada cuerpo, los de color ampliado (Mercurio, lunas de Saturno) se desaturan, y los casquetes que ninguna nave fotografió se rellenan con un degradado suave.

| Cuerpo | Fuente |
|---|---|
| Luna | NASA SVS · LRO LROC WAC |
| Mercurio | USGS · MESSENGER MDIS |
| Marte | USGS · Viking Orbiter en color |
| Júpiter | NASA/JPL · Cassini (PIA07782) |
| Ío, Europa, Ganímedes, Calisto | USGS · Galileo SSI + Voyager |
| Titán, Encélado | USGS · Cassini ISS |
| Dione, Rea, Tetis, Mimas, Jápeto | NASA/JPL · Cassini ISS (PIA18434–18439) |
| Tritón | USGS · Voyager 2 |
| Plutón, Caronte | USGS · New Horizons |
| Fobos | USGS · Viking / DLR |
| Tierra | NASA Visible Earth · Blue Marble, Black Marble |
| Sol, Venus, Saturno, Urano, Neptuno | Solar System Scope (CC BY 4.0) |

## Gráficos

El botón ⚙ (o la tecla **G**) abre el panel de ajustes gráficos:

- **Detección del hardware**: identifica tu GPU, los núcleos de la CPU y la memoria, y propone un preset (Bajo, Medio, Alto o Ultra). El navegador pide la **GPU dedicada** (`powerPreference: high-performance`).
- **Cálculo multinúcleo**: los 84k cuerpos pequeños se propagan en varios hilos de la CPU, cada uno con su propia instancia del motor Rust/WASM (Web Workers).
- **Resolución**: escala de renderizado del 50 al 200 % y resolución dinámica que se ajusta sola para mantener los FPS.
- **Calidad**: antialiasing MSAA (hasta 8x), texturas de la Tierra de la NASA en 2K, 4K u 8K, filtrado anisótropo, bloom, magnitud límite de las estrellas, densidad de asteroides y límite de FPS.
- **Rendimiento**: contador con FPS, tiempo de CPU por frame, tiempo de cálculo de los asteroides, resolución real y draw calls.

Los ajustes se guardan en el navegador.

### Realismo y rendimiento

- **Asteroides en la GPU**: la ecuación de Kepler de los 84.000 cuerpos pequeños se resuelve en el vertex shader. Los elementos orbitales se suben una sola vez y por frame solo cambian dos números (tiempo y foco), así que la CPU queda libre. El motor Rust multinúcleo queda como alternativa, y un test visual comprueba que los dos dan la misma distribución.
- **Colas de cometas**: cola de iones y de polvo orientadas en sentido contrario al Sol, cuya longitud crece al acercarse al perihelio.
- **Atmósferas con dispersión física** (Rayleigh + Mie de un rebote, modelo de Nishita) para la Tierra, Venus, Marte y Titán: el limbo azul, la neblina naranja de Titán y la luz rojiza del terminador salen de la física, no de un color pintado.
- **Anillos**: los de Saturno proyectan sombra sobre el planeta y el planeta sobre ellos; Urano y Neptuno tienen sus anillos reales, estrechos y oscuros, con los radios de JPL.
- **Sol** con granulación animada, oscurecimiento del limbo y corona con serpentinas.
- **WebAssembly con SIMD de 128 bits** y optimizado con `wasm-opt -O3` (46 KB).

## Sombras y eclipses

Las sombras se calculan en los shaders de forma analítica: el Sol es un disco de 695.700 km, y para cada píxel se mide qué fracción de ese disco tapan los cuerpos cercanos (área exacta de solape de dos círculos). Así salen la **umbra y la penumbra con su tamaño real**, sin mapas de sombras que se pixelen:

- **Eclipses solares**: la sombra de la Luna sobre la Tierra, con las luces de las ciudades encendidas bajo la umbra.
- **Eclipses lunares**: la Luna se vuelve rojiza dentro de la sombra de la Tierra, por la luz que refracta la atmósfera.
- **Lunas sobre planetas**: las sombras de Ío, Europa o Ganímedes sobre Júpiter y las de las lunas de Saturno.
- **Saturno**: el planeta proyecta sombra sobre los anillos y los anillos sobre el planeta.

Para que los eclipses caigan en su sitio, la Luna se calcula con la teoría lunar de Meeus (ELP-2000/82 truncada): está a 3–10 km de su posición en Horizons, y el eclipse del 12 de agosto de 2026 sale con γ = 0,8977, el mismo valor que publica la NASA.

## Naves espaciales

Once misiones con su trayectoria real de JPL Horizons durante toda su vida útil: **Voyager 1 y 2, New Horizons, Parker Solar Probe, Juno, James Webb, Europa Clipper, Psyche, Lucy, BepiColombo y Cassini**. Los vectores de estado (posición y velocidad) se interpolan con splines de Hermite cúbicos: el perihelio de Parker de diciembre de 2024 sale a 6,863 millones de km del Sol, el valor oficial. Si eliges una nave fuera de las fechas de su misión, el reloj salta a la fecha válida más cercana.

Plutón usa también una tabla de Horizons (1950–2100) en lugar de su órbita kepleriana, para que el sobrevuelo de New Horizons del 14 de julio de 2015 salga en su sitio: `?t=2015-07-14T11:30Z&focus=New%20Horizons&dist=60000`.

Datos: `scripts/fetch_spacecraft.py` → `web/public/data/spacecraft.bin`.

## Calendario astronómico y tours

- **Calendario** (tecla **C**): el motor en Rust busca eclipses de Sol y de Luna, oposiciones de los planetas exteriores y máximas elongaciones de Mercurio y Venus. Un clic salta a ese instante con la cámara bien colocada (el eclipse solar se ve desde la Luna, el lunar desde el Sol). Los tests lo comparan con el catálogo de la NASA: los 8 eclipses solares de 2024 a 2027 salen con la hora a menos de 2,5 minutos y γ a menos de 0,0014; los 4 lunares de 2025–2026, a menos de 1 minuto.
- **Tours guiados** (tecla **T**): *Gran Tour del sistema solar*, *El viaje de la Voyager 2* (1977–1989), *Los eclipses de 2026* y *Parker: tocando el Sol*. Avanzan solos o paso a paso. Se pueden enlazar con `?tour=voyager`.

## Enlaces compartibles

La URL admite parámetros para abrir un momento concreto:

| Parámetro | Ejemplo | Qué hace |
|---|---|---|
| `t` | `2026-08-12T17:46Z` | Salta a esa fecha y hora (UTC) en pausa |
| `speed` | `100` | En lugar de pausar, arranca a esa velocidad |
| `focus` | `Tierra`, `Io`, `Titan` | Enfoca ese cuerpo |
| `dist` | `20000` | Distancia de la cámara en km |
| `view` | `sol`, `luna` | Mira el cuerpo desde el Sol o desde otro cuerpo |
| `tour` | `gran-tour`, `voyager`, `eclipses-2026`, `parker` | Arranca un tour guiado |

Por ejemplo, `?t=2026-03-03T11:33Z&focus=Luna&view=sol` abre el eclipse lunar total del 3 de marzo de 2026.

## Fuentes de datos

| Qué | Fuente |
|---|---|
| Planetas | E.M. Standish, *Keplerian Elements for Approximate Positions of the Major Planets* (JPL SSD). Tabla 1 (1800–2050) y Tabla 2 (3000 a.C.–3000 d.C.) |
| La Luna | J. Meeus, *Astronomical Algorithms*, cap. 47 (ELP-2000/82 truncada); coeficientes de [soniakeys/meeus](https://github.com/soniakeys/meeus) (MIT) |
| Resto de lunas | JPL SSD *Planetary Satellite Mean Elements*; las 45 principales, refinadas con elementos osculantes de **JPL Horizons** y el movimiento medio ajustado a 2 años de vectores |
| Planetas enanos | Elementos osculantes de JPL Horizons |
| Asteroides y cometas | JPL **SBDB Query API** (numerados con H < 15, todos los TNO y los cometas con e < 1) |
| Orientación de los ejes | IAU WGCCRE 2015 (Archinal et al. 2018) |
| Datos físicos | JPL *Planetary Physical Parameters* y *Satellite Physical Parameters* |
| Estrellas | [HYG Database v4.1](https://github.com/astronexus/HYG-Database) (15.598 estrellas hasta magnitud 7, CC BY-SA 4.0) |
| Tierra | NASA Visible Earth: Blue Marble Next Generation (relieve y batimetría), Black Marble 2016 (luces nocturnas) y nubes |

## Precisión (contra JPL Horizons / DE441)

`cargo test` compara las posiciones calculadas con los vectores de Horizons:

- Planetas, 1800–2050: menos de 0,02° en la mayoría de fechas; el peor caso es Saturno, con 0,17°.
- Planetas, 1000 a.C.–2500 d.C.: por debajo de 0,32°.
- La Luna (teoría de Meeus): 3–10 km entre 2024 y 2029.
- Io, Titán y Tritón: por debajo de 0,2° entre 2024 y 2029.

## Estructura

```
crates/astro-core/     Rust: tiempo, Kepler, Standish, Meeus, rotación IAU, lunas, eventos
crates/astro-wasm/     puente wasm-bindgen (SIMD + wasm-opt)
web/src/engine/        escena Three.js: cuerpos, sombras, atmósferas, estrellas, asteroides en GPU/workers
web/src/data/          catálogos, texturas por niveles, naves, eventos, tours, instalador offline
web/src/ui/            React + Tailwind: portada, paneles, calendario, tours
scripts/               descarga de datos de JPL y texturas de NASA/USGS
tests/e2e/             Playwright
```

La arquitectura completa, con el flujo de datos y las decisiones de diseño, está en [ARCHITECTURE.md](ARCHITECTURE.md); los cambios, en [CHANGELOG.md](CHANGELOG.md).

## Desarrollo

```bash
cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings
npm run lint && npm run typecheck
npm test                      # Vitest
npm run build && npm run test:e2e
```

La CI ejecuta todo esto en cada push (Rust, web y E2E con Playwright), además de CodeQL y Dependabot.

## Ramas

| Rama | Qué contiene | Necesitas |
|---|---|---|
| [`COMPILED`](../../tree/COMPILED) | App lista, con el motor WebAssembly ya compilado | Node 20+ |
| **`DECOMPILED`** (esta) | Todo el código fuente: Rust, tests contra Horizons, script de datos | Node 20+, Rust y wasm-pack |

## Ejecutar

Lo más fácil es usar el script de arranque. Detecta tu sistema (macOS, Linux o Windows), instala lo que falte (Node, Rust, el target WASM y wasm-pack) preguntándote antes, compila el motor y abre la app en `http://localhost:5173`.

```bash
./dev.sh                                         # macOS y Linux (también WSL)
powershell -ExecutionPolicy Bypass -File dev.ps1 # Windows
```

A mano: Rust con el target `wasm32-unknown-unknown`, `wasm-pack` y Node 20+.

```bash
npm install
npm run dev        # compila el WASM y abre Vite
cargo test         # valida las efemérides contra Horizons
npm run data       # vuelve a descargar los datos de JPL (opcional)
```

Este proyecto no está afiliado a NASA ni a JPL.

## Licencia

El código se publica bajo licencia [MIT](LICENSE). Las texturas y catálogos no son parte del código y conservan su licencia: texturas de la Tierra de NASA Visible Earth (dominio público), resto de planetas de Solar System Scope (CC BY 4.0) y catálogo de estrellas HYG (CC BY-SA 4.0). Los datos orbitales proceden de NASA/JPL.
