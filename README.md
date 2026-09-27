# Sistema Solar en tiempo real

> **Rama `COMPILED`**: lista para ejecutar. El motor de Rust ya viene compilado a WebAssembly, así que solo necesitas Node.
> El código fuente en Rust y los tests están en la rama [`DECOMPILED`](../../tree/DECOMPILED).

El sistema solar completo en el navegador, con las posiciones **reales** de cada cuerpo calculadas a partir de datos y métodos oficiales de NASA/JPL. El motor de efemérides está escrito en **Rust** y se compila a **WebAssembly**; el render usa **Three.js/WebGL** y la interfaz **React + Tailwind**.

- **Tiempo real**: por defecto el instante es el de tu reloj, así que ves dónde está cada planeta y cada luna ahora mismo (y el lado nocturno de la Tierra es el que está de noche).
- **Tiempo simulado**: ×1, ×5, ×20, ×100, ×1k… ×10M, marcha atrás, pausa y salto a cualquier fecha entre el 3000 a.C. y el 3000 d.C.
- **Contenido**: el Sol, 8 planetas, 5 planetas enanos, 460 lunas, 83.867 asteroides, troyanos, centauros, transneptunianos y cometas periódicos.
- **Filtros**: planetas, planetas enanos, lunas principales, lunas menores, órbitas, etiquetas y cada clase de cuerpo pequeño por separado.
- **Escala real**: los tamaños y las distancias son los reales. Con profundidad logarítmica y origen flotante se puede ir de la superficie de Fobos a la órbita de Eris sin cortes ni temblores.

## Fuentes de datos

| Qué | Fuente |
|---|---|
| Planetas | E.M. Standish, *Keplerian Elements for Approximate Positions of the Major Planets* (JPL SSD). Tabla 1 (1800–2050) y Tabla 2 (3000 a.C.–3000 d.C.) |
| Lunas | JPL SSD *Planetary Satellite Mean Elements*; las 45 principales, refinadas con elementos osculantes de **JPL Horizons** y el movimiento medio ajustado a 2 años de vectores |
| Planetas enanos | Elementos osculantes de JPL Horizons |
| Asteroides y cometas | JPL **SBDB Query API** (numerados con H < 15, todos los TNO y los cometas con e < 1) |
| Orientación de los ejes | IAU WGCCRE 2015 (Archinal et al. 2018) |
| Datos físicos | JPL *Planetary Physical Parameters* y *Satellite Physical Parameters* |

## Precisión (contra JPL Horizons / DE441)

En la rama `DECOMPILED`, `cargo test` compara las posiciones calculadas con los vectores de Horizons:

- Planetas, 1800–2050: menos de 0,02° en la mayoría de fechas; el peor caso es Saturno, con 0,17°.
- Planetas, 1000 a.C.–2500 d.C.: por debajo de 0,32°.
- Io, Titán y Tritón: por debajo de 0,2° entre 2024 y 2029. La Luna, con elementos medios: 2–3°.

## Estructura

```
web/src/wasm/        motor Rust ya compilado a WebAssembly (el fuente está en la rama DECOMPILED)
scripts/fetch_data.py  descarga los datos de JPL (SSD, SBDB, Horizons)
web/src/engine.ts    escena Three.js: origen flotante, vuelos de cámara, órbitas, marcadores
web/src/shaders.ts   GLSL: Sol, Tierra día/noche, atmósferas, anillos con sombra
web/src/ui/          React + Tailwind: barra de tiempo, filtros, ficha de cada cuerpo
web/public/data/     datos de JPL ya descargados
```

## Ramas

| Rama | Qué contiene | Necesitas |
|---|---|---|
| **`COMPILED`** (esta) | App lista, con el motor WebAssembly ya compilado | Node 20+ |
| [`DECOMPILED`](../../tree/DECOMPILED) | Todo el código fuente: Rust, tests contra Horizons, script de datos | Node 20+, Rust y wasm-pack |

## Ejecutar

Lo más fácil es usar el script de arranque. Detecta tu sistema (macOS, Linux o Windows), instala Node si falta (preguntándote antes) y abre la app en `http://localhost:5173`.

```bash
./dev.sh                                         # macOS y Linux (también WSL)
powershell -ExecutionPolicy Bypass -File dev.ps1 # Windows
```

A mano en esta rama (COMPILED) solo hace falta Node 20+:

```bash
npm install
npm run dev
```

Para tocar el motor en Rust o ejecutar los tests contra Horizons, usa la rama `DECOMPILED`.

Texturas planetarias: Solar System Scope (CC BY 4.0) y NASA Visible Earth. Este proyecto no está afiliado a NASA ni a JPL.

## Licencia

El código se publica bajo licencia [MIT](LICENSE). Las texturas planetarias no son parte del código: tienen su propia licencia (Solar System Scope, CC BY 4.0) y la de NASA Visible Earth. Los datos orbitales proceden de NASA/JPL.
