// Tours guiados: secuencias de pasos que mueven el tiempo y la cámara, con texto.

export interface TourStep {
  text: string;
  /** Cuerpo a enfocar (nombre en español o inglés). */
  focus: string;
  dist?: number;
  /** Fecha UTC a la que saltar; si falta, se mantiene la actual. */
  t?: string;
  /** Velocidad del tiempo durante el paso (0 = pausa). */
  speed?: number;
  /** Mirar desde el Sol ("sol") o desde otro cuerpo. */
  view?: string;
  /** Segundos que dura el paso en reproducción automática. */
  seconds: number;
}

export interface Tour {
  id: string;
  title: string;
  summary: string;
  steps: TourStep[];
}

export const TOURS: Tour[] = [
  {
    id: 'gran-tour',
    title: 'Gran Tour del sistema solar',
    summary: 'Del Sol a Plutón, con las posiciones de hoy.',
    steps: [
      { focus: 'Sol', dist: 4 * 1.496e8, seconds: 8, text: 'El Sol concentra el 99,86 % de la masa del sistema solar. Todo lo que ves gira a su alrededor.' },
      { focus: 'Mercurio', seconds: 7, text: 'Mercurio, el más cercano: su año dura 88 días y su día solar, 176.' },
      { focus: 'Venus', view: 'sol', seconds: 7, text: 'Venus, cubierto de nubes de ácido sulfúrico. Gira al revés y muy despacio.' },
      { focus: 'Tierra', view: 'sol', seconds: 9, text: 'La Tierra, con la hora real: el lado nocturno es el que ahora está de noche, con las luces de las ciudades.' },
      { focus: 'Luna', view: 'sol', seconds: 7, text: 'La Luna, calculada con la teoría de Meeus a pocos km de su posición real.' },
      { focus: 'Marte', view: 'sol', seconds: 7, text: 'Marte: Olympus Mons, Valles Marineris y los casquetes de hielo, con el mosaico de las sondas Viking.' },
      { focus: 'Júpiter', view: 'sol', seconds: 8, text: 'Júpiter, con el mapa de Cassini. Mira sus cuatro grandes lunas girar a su alrededor.' },
      { focus: 'Io', view: 'sol', seconds: 7, text: 'Ío, el mundo con más volcanes activos, calentado por las mareas de Júpiter.' },
      { focus: 'Saturno', view: 'sol', dist: 450000, seconds: 9, text: 'Saturno: sus anillos proyectan sombra sobre el planeta, y el planeta sobre los anillos.' },
      { focus: 'Titán', view: 'sol', seconds: 7, text: 'Titán: una atmósfera más densa que la terrestre y lagos de metano bajo su neblina naranja.' },
      { focus: 'Urano', view: 'sol', seconds: 7, text: 'Urano gira tumbado: sus anillos oscuros y sus lunas orbitan casi de cara al Sol.' },
      { focus: 'Neptuno', view: 'sol', seconds: 7, text: 'Neptuno, descubierto por cálculo matemático antes de verse con un telescopio.' },
      { focus: 'Plutón', view: 'sol', seconds: 8, text: 'Plutón, con el mosaico de New Horizons y su corazón de hielo de nitrógeno.' },
    ],
  },
  {
    id: 'voyager',
    title: 'El viaje de la Voyager 2',
    summary: 'La única nave que ha visitado los cuatro planetas gigantes.',
    steps: [
      { focus: 'Voyager 2', t: '1977-08-25T00:00Z', dist: 3e7, speed: 0, seconds: 7, text: '20 de agosto de 1977: despega la Voyager 2, aprovechando una alineación de los planetas que ocurre cada 175 años.' },
      { focus: 'Voyager 2', t: '1979-07-09T22:00Z', dist: 2.5e6, speed: 2000, seconds: 9, text: '9 de julio de 1979: sobrevuelo de Júpiter, a 570.000 km de las nubes. Descubre anillos y volcanes en Ío.' },
      { focus: 'Voyager 2', t: '1981-08-26T03:00Z', dist: 2e6, speed: 2000, seconds: 9, text: '26 de agosto de 1981: Saturno. La gravedad de cada planeta la acelera y la desvía hacia el siguiente.' },
      { focus: 'Voyager 2', t: '1986-01-24T17:00Z', dist: 1e6, speed: 2000, seconds: 9, text: '24 de enero de 1986: primer (y único) sobrevuelo de Urano. Descubre 10 lunas nuevas.' },
      { focus: 'Voyager 2', t: '1989-08-25T03:00Z', dist: 8e5, speed: 2000, seconds: 9, text: '25 de agosto de 1989: Neptuno y Tritón. Después, rumbo al espacio interestelar, al que llega en 2018.' },
      { focus: 'Voyager 2', dist: 8e9, speed: 0, seconds: 8, text: 'Hoy está a más de 140 au del Sol. Su señal tarda casi 20 horas en llegar a la Tierra.' },
    ],
  },
  {
    id: 'eclipses-2026',
    title: 'Los eclipses de 2026',
    summary: 'Dos eclipses de Luna y uno total de Sol visible desde España.',
    steps: [
      { focus: 'Luna', t: '2026-03-03T11:33Z', view: 'sol', dist: 9000, speed: 0, seconds: 9, text: '3 de marzo de 2026: eclipse total de Luna. La luz que refracta la atmósfera terrestre la tiñe de rojo.' },
      { focus: 'Tierra', t: '2026-08-12T17:46Z', view: 'luna', dist: 26000, speed: 0, seconds: 10, text: '12 de agosto de 2026: eclipse total de Sol. La umbra cruza Groenlandia, Islandia y el norte de España al atardecer.' },
      { focus: 'Tierra', t: '2026-08-12T17:10Z', view: 'luna', dist: 26000, speed: 300, seconds: 10, text: 'A velocidad ×300 se ve la sombra de la Luna barriendo el Atlántico Norte.' },
      { focus: 'Luna', t: '2026-08-28T04:13Z', view: 'sol', dist: 9000, speed: 0, seconds: 9, text: '28 de agosto de 2026: eclipse parcial de Luna; solo una parte entra en la umbra.' },
    ],
  },
  {
    id: 'parker',
    title: 'Parker: tocando el Sol',
    summary: 'La nave más rápida construida, en su perihelio récord.',
    steps: [
      { focus: 'Parker Solar Probe', t: '2024-12-20T00:00Z', dist: 3e7, speed: 20000, seconds: 10, text: 'Parker Solar Probe cae hacia el Sol en una órbita muy alargada, moldeada con siete sobrevuelos de Venus.' },
      { focus: 'Parker Solar Probe', t: '2024-12-24T11:40Z', dist: 1.5e7, speed: 300, seconds: 10, text: '24 de diciembre de 2024: pasa a 6,1 millones de km de la superficie solar a 192 km/s, el objeto más rápido construido.' },
    ],
  },
];
