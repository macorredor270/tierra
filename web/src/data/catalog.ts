// Datos físicos: JPL SSD "Planetary Physical Parameters" (ssd.jpl.nasa.gov/planets/phys_par.html)
// y "Planetary Satellite Physical Parameters" (ssd.jpl.nasa.gov/sats/phys_par/). El Sol: IAU 2015
// (radio nominal) y NASA Sun Fact Sheet.

export type Kind = 'star' | 'planet' | 'dwarf' | 'moon' | 'craft';

export interface BodyInfo {
  name: string;
  kind: Kind;
  /** Radio ecuatorial y polar en km. */
  radius: number;
  polarRadius?: number;
  massKg?: number;
  density?: number;
  /** Periodo de rotación sideral en días (negativo = retrógrado). */
  rotationDays?: number;
  orbitYears?: number;
  gravity?: number;
  escape?: number;
  albedo?: number;
  color: number;
  description: string;
}

export const SUN_AND_PLANETS: BodyInfo[] = [
  {
    name: 'Sol',
    kind: 'star',
    radius: 695_700,
    massKg: 1.9885e30,
    density: 1.408,
    rotationDays: 25.38,
    gravity: 274,
    escape: 617.6,
    color: 0xffd27a,
    description:
      'Estrella de tipo G2V. Contiene el 99,86 % de la masa del sistema solar; su luz tarda 8 min 20 s en llegar a la Tierra.',
  },
  {
    name: 'Mercurio',
    kind: 'planet',
    radius: 2440.53,
    polarRadius: 2438.26,
    massKg: 0.330103e24,
    density: 5.4289,
    rotationDays: 58.6462,
    orbitYears: 0.2408467,
    gravity: 3.7,
    escape: 4.25,
    albedo: 0.106,
    color: 0xb5aca3,
    description: 'El planeta más cercano al Sol. Gira tres veces sobre sí mismo por cada dos vueltas al Sol (resonancia 3:2).',
  },
  {
    name: 'Venus',
    kind: 'planet',
    radius: 6051.8,
    massKg: 4.86731e24,
    density: 5.243,
    rotationDays: -243.018,
    orbitYears: 0.61519726,
    gravity: 8.87,
    escape: 10.36,
    albedo: 0.65,
    color: 0xe8cda2,
    description:
      'Gira al revés que casi todos los planetas y tan despacio que su día dura más que su año. Superficie a 465 °C bajo nubes de ácido sulfúrico.',
  },
  {
    name: 'Tierra',
    kind: 'planet',
    radius: 6378.1366,
    polarRadius: 6356.75,
    massKg: 5.97217e24,
    density: 5.5134,
    rotationDays: 0.99726968,
    orbitYears: 1.0000174,
    gravity: 9.8,
    escape: 11.19,
    albedo: 0.367,
    color: 0x6fa8ff,
    description:
      'El único mundo conocido con vida y con agua líquida estable en superficie. Mostrada con la hora real: el lado nocturno es el que está de noche ahora mismo.',
  },
  {
    name: 'Marte',
    kind: 'planet',
    radius: 3396.19,
    polarRadius: 3376.2,
    massKg: 0.641691e24,
    density: 3.934,
    rotationDays: 1.02595676,
    orbitYears: 1.8808476,
    gravity: 3.71,
    escape: 5.03,
    albedo: 0.15,
    color: 0xd7744a,
    description:
      'Olympus Mons, el mayor volcán del sistema solar, mide 22 km de altura. Tiene dos lunas pequeñas e irregulares: Fobos y Deimos.',
  },
  {
    name: 'Júpiter',
    kind: 'planet',
    radius: 71492,
    polarRadius: 66854,
    massKg: 1898.125e24,
    density: 1.3262,
    rotationDays: 0.41354,
    orbitYears: 11.862615,
    gravity: 24.79,
    escape: 60.2,
    albedo: 0.52,
    color: 0xd9b48f,
    description:
      'Más de dos veces la masa del resto de planetas juntos. La Gran Mancha Roja es una tormenta mayor que la Tierra que dura siglos.',
  },
  {
    name: 'Saturno',
    kind: 'planet',
    radius: 60268,
    polarRadius: 54364,
    massKg: 568.317e24,
    density: 0.6871,
    rotationDays: 0.44401,
    orbitYears: 29.447498,
    gravity: 10.44,
    escape: 36.09,
    albedo: 0.47,
    color: 0xe6d3a3,
    description:
      'Su densidad media es menor que la del agua. Los anillos se extienden 280 000 km pero tienen unas decenas de metros de grosor.',
  },
  {
    name: 'Urano',
    kind: 'planet',
    radius: 25559,
    polarRadius: 24973,
    massKg: 86.8099e24,
    density: 1.27,
    rotationDays: -0.71833,
    orbitYears: 84.016846,
    gravity: 8.87,
    escape: 21.38,
    albedo: 0.51,
    color: 0x9fd8e0,
    description: 'Gira tumbado, con el eje inclinado 98°: cada polo pasa 42 años seguidos de día y otros 42 de noche.',
  },
  {
    name: 'Neptuno',
    kind: 'planet',
    radius: 24764,
    polarRadius: 24341,
    massKg: 102.4092e24,
    density: 1.638,
    rotationDays: 0.67125,
    orbitYears: 164.79132,
    gravity: 11.15,
    escape: 23.56,
    albedo: 0.41,
    color: 0x5b7cff,
    description:
      'Sus vientos son los más rápidos medidos en el sistema solar, de hasta 2100 km/h. Se descubrió por matemáticas antes de verse por telescopio.',
  },
];

export const DWARFS: BodyInfo[] = [
  {
    name: 'Ceres',
    kind: 'dwarf',
    radius: 482.1,
    polarRadius: 445.9,
    massKg: 938.416e18,
    density: 2.162,
    rotationDays: 0.37809042,
    orbitYears: 4.61,
    gravity: 0.27,
    escape: 0.51,
    albedo: 0.09,
    color: 0xa39e98,
    description:
      'El objeto más grande del cinturón de asteroides. La sonda Dawn encontró depósitos brillantes de sales en el cráter Occator.',
  },
  {
    name: 'Plutón',
    kind: 'dwarf',
    radius: 1188.3,
    massKg: 13024.6e18,
    density: 1.853,
    rotationDays: -6.3872,
    orbitYears: 247.92065,
    gravity: 0.62,
    escape: 1.21,
    albedo: 0.3,
    color: 0xd8bfa4,
    description:
      'New Horizons lo visitó en 2015 y descubrió Sputnik Planitia, una llanura de hielo de nitrógeno con forma de corazón.',
  },
  {
    name: 'Eris',
    kind: 'dwarf',
    radius: 1200,
    massKg: 16600e18,
    density: 2.3,
    rotationDays: 1.079,
    orbitYears: 557.56,
    gravity: 0.77,
    escape: 1.36,
    albedo: 0.84,
    color: 0xe8e8ea,
    description:
      'Casi del tamaño de Plutón y algo más masivo. Su descubrimiento en 2005 llevó a la IAU a definir "planeta enano".',
  },
  {
    name: 'Makemake',
    kind: 'dwarf',
    radius: 717,
    massKg: 3100e18,
    density: 2.1,
    rotationDays: 0.937,
    orbitYears: 307.54,
    gravity: 0.4,
    escape: 0.76,
    albedo: 0.81,
    color: 0xd9a58a,
    description: 'Objeto del cinturón de Kuiper cubierto de metano helado, uno de los más brillantes tras Plutón.',
  },
  {
    name: 'Haumea',
    kind: 'dwarf',
    radius: 870,
    massKg: 4006e18,
    density: 2.6,
    rotationDays: 0.1631,
    orbitYears: 284.81,
    gravity: 0.35,
    escape: 0.78,
    albedo: 0.72,
    color: 0xeeeeee,
    description: 'Gira en menos de 4 horas, tan rápido que tiene forma de balón de rugby. Tiene un anillo y dos lunas.',
  },
];

/** Nombres en español de las lunas con nombre distinto en inglés. */
export const MOON_NAMES_ES: Record<string, string> = {
  Moon: 'Luna',
  Phobos: 'Fobos',
  Ganymede: 'Ganímedes',
  Callisto: 'Calisto',
  Amalthea: 'Amaltea',
  Thebe: 'Tebe',
  Himalia: 'Himalia',
  Enceladus: 'Encélado',
  Tethys: 'Tetis',
  Rhea: 'Rea',
  Titan: 'Titán',
  Hyperion: 'Hiperión',
  Iapetus: 'Jápeto',
  Phoebe: 'Febe',
  Janus: 'Jano',
  Epimetheus: 'Epimeteo',
  Triton: 'Tritón',
  Nereid: 'Nereida',
  Charon: 'Caronte',
  Proteus: 'Proteo',
  Larissa: 'Larisa',
  Oberon: 'Oberón',
  Pandora: 'Pandora',
  Prometheus: 'Prometeo',
  Kerberos: 'Cerbero',
  Hydra: 'Hidra',
  Pasiphae: 'Pasífae',
  Ananke: 'Ananké',
  Lysithea: 'Lisitea',
  Sinope: 'Sinope',
};

export const MOON_NOTES: Record<string, string> = {
  Moon: 'Siempre nos muestra la misma cara. Se aleja de la Tierra 3,8 cm al año.',
  Io: 'El cuerpo con más actividad volcánica del sistema solar, calentado por las mareas de Júpiter.',
  Europa: 'Bajo su corteza de hielo hay un océano global de agua salada: uno de los mejores candidatos para buscar vida.',
  Ganymede: 'La luna más grande del sistema solar, mayor que Mercurio, y la única con campo magnético propio.',
  Callisto: 'La superficie más craterizada conocida: apenas ha cambiado en 4000 millones de años.',
  Titan: 'Tiene una atmósfera más densa que la de la Tierra y lagos de metano y etano líquidos.',
  Enceladus: 'Expulsa géiseres de agua desde su polo sur que alimentan el anillo E de Saturno.',
  Iapetus: 'Una cara es oscura como el carbón y la otra blanca como la nieve.',
  Mimas: 'El cráter Herschel le da un parecido famoso con la Estrella de la Muerte.',
  Triton: 'Orbita al revés que la rotación de Neptuno: probablemente es un objeto de Kuiper capturado.',
  Charon: 'Es tan grande respecto a Plutón que ambos giran alrededor de un punto que está fuera de Plutón.',
  Phobos: 'Se acerca a Marte 1,8 m cada siglo; en unos 50 millones de años se romperá o chocará.',
  Miranda: 'Tiene Verona Rupes, el acantilado más alto conocido: unos 20 km.',
};

/** Índice del cuerpo principal (en el orden de la simulación) para cada planeta padre. */
export const PARENT_INDEX: Record<string, number> = {
  Earth: 3,
  Mars: 4,
  Jupiter: 5,
  Saturn: 6,
  Uranus: 7,
  Neptune: 8,
  Pluto: 10,
};

export const SMALL_CLASS_NAMES = [
  'NEO',
  'Cinturón principal',
  'Troyanos',
  'Centauros y exteriores',
  'Transneptunianos',
  'Cometas',
];
export const SMALL_CLASS_COLORS = [0xff8a5c, 0x9c8f80, 0x7fb069, 0x8aa0c8, 0x6f8fd6, 0x9ee6ff];
