/* tslint:disable */
/* eslint-disable */

export class Solar {
    free(): void;
    [Symbol.dispose](): void;
    body_count(): number;
    /**
     * Día juliano UTC para un instante `Date.now()`.
     */
    static jd_from_unix_ms(ms: number): number;
    /**
     * `moons`: registros de 13 f64 `[plano(0 eclíptica, 1 polo), α, δ, época, a(km), e, ω, M,
     * i, Ω, P(d), P_ω(años), P_Ω(años)]`; `moon_parent`: índice del cuerpo principal de cada
     * luna; `dwarfs`: 7 f64 `[época, a(au), e, i, Ω, ω, M]`; `small`: `smallbodies.bin`.
     */
    constructor(moons: Float64Array, moon_parent: Uint32Array, dwarfs: Float64Array, small: Float32Array);
    /**
     * Órbita del cuerpo `index` en el instante actual, relativa a su primario (km escena).
     */
    orbit(index: number, n: number): Float64Array;
    /**
     * Matriz de rotación (columnas, 9 f32) de Sol, planetas, Ceres, Plutón y la Luna (en ese
     * orden). Pasa de ejes locales de `SphereGeometry` (x meridiano 0°, y polo, z = −90° E) a
     * escena.
     */
    orientations(): Float32Array;
    /**
     * Índice del primario de un cuerpo (el Sol devuelve 0).
     */
    parent_of(index: number): number;
    /**
     * Posiciones heliocéntricas de escena (km), 3 por cuerpo.
     */
    positions(): Float64Array;
    /**
     * Limita la propagación a los primeros `n` cuerpos pequeños (densidad gráfica).
     */
    set_small_limit(n: number): void;
    /**
     * Fija el instante sin recalcular los cuerpos principales (lo usan los workers que solo
     * propagan cuerpos pequeños).
     */
    set_time(jd_utc: number): void;
    small_count(): number;
    small_ptr(): number;
    /**
     * Calcula posiciones y orientaciones de todos los cuerpos principales y lunas.
     */
    update(jd_utc: number): void;
    /**
     * Propaga todos los cuerpos pequeños y escribe posiciones relativas a la cámara (km, f32)
     * en un buffer que JS lee sin copia vía [`Solar::small_ptr`]. La resta se hace en f64,
     * así que no hay temblor aunque la cámara esté a 50 au del Sol.
     */
    update_small(cam_x: number, cam_y: number, cam_z: number): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_solar_free: (a: number, b: number) => void;
    readonly solar_body_count: (a: number) => number;
    readonly solar_jd_from_unix_ms: (a: number) => number;
    readonly solar_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
    readonly solar_orbit: (a: number, b: number, c: number) => [number, number];
    readonly solar_orientations: (a: number) => [number, number];
    readonly solar_parent_of: (a: number, b: number) => number;
    readonly solar_positions: (a: number) => [number, number];
    readonly solar_set_small_limit: (a: number, b: number) => void;
    readonly solar_set_time: (a: number, b: number) => void;
    readonly solar_small_count: (a: number) => number;
    readonly solar_small_ptr: (a: number) => number;
    readonly solar_update: (a: number, b: number) => void;
    readonly solar_update_small: (a: number, b: number, c: number, d: number) => void;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
