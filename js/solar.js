import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ═══════════════════════════════════════════════════════════════
   Escala
   ───────────────────────────────────────────────────────────────
   · Tamaños de planetas y lunas: proporcionales a los radios REALES.
   · Distancias orbitales: comprimidas con una potencia (a escala
     real Neptuno quedaría fuera de la pantalla por kilómetros).
   · El Sol se muestra reducido (real: 109 radios terrestres).
   ═══════════════════════════════════════════════════════════════ */
const R_EARTH = 0.35;
const radiusOf = (earthRadii) => Math.max(earthRadii * R_EARTH, 0.04);
const distOf = (au) => 16 + Math.pow(au, 0.75) * 14;
const SUN_RADIUS = 7;

/* ═══════════ Renderer / escena / cámara ═══════════ */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 6000);
camera.position.set(0, 48, 105);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.rotateSpeed = 0.55;
controls.zoomSpeed = 0.8;
controls.minDistance = 0.3;
controls.maxDistance = 900;

/* ═══════════ Carga de texturas ═══════════ */
const loadingManager = new THREE.LoadingManager();
const texLoader = new THREE.TextureLoader(loadingManager);

const loaderEl = document.getElementById('loader');
const progressEl = document.getElementById('loader-progress');
const statusEl = document.getElementById('loader-status');
loadingManager.onProgress = (url, loaded, total) => {
  progressEl.style.width = `${(loaded / total) * 100}%`;
  statusEl.textContent = `${loaded} / ${total}`;
};
loadingManager.onLoad = () => {
  statusEl.textContent = 'listo';
  setTimeout(() => loaderEl.classList.add('hidden'), 350);
};

function tex(file, srgb = true) {
  const t = texLoader.load('textures/' + file);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

/* ═══════════ Entorno: Vía Láctea + luz solar ═══════════ */
const milkyWay = tex('2k_stars_milky_way.jpg');
milkyWay.mapping = THREE.EquirectangularReflectionMapping;
scene.background = milkyWay;
scene.backgroundIntensity = 0.2;

// El espacio es oscuro: ambiente mínimo, solo para no perder el lado nocturno
scene.add(new THREE.AmbientLight(0x1c2433, 0.5));
// decay 0: iluminación pareja en todo el sistema (visibilidad > física aquí)
const sunLight = new THREE.PointLight(0xfff1dc, 2.4, 0, 0);
scene.add(sunLight);

/* ═══════════ Shaders ═══════════ */
// Sol con oscurecimiento de limbo (los bordes de una estrella se ven
// más tenues y cálidos que su centro)
const sunMaterial = new THREE.ShaderMaterial({
  uniforms: { map: { value: tex('2k_sun.jpg') }, time: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vView = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D map;
    uniform float time;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      // Deriva lenta de la "granulación" solar
      vec3 c = texture2D(map, vUv + vec2(time * 0.0015, 0.0)).rgb;
      float limb = pow(max(dot(vNormal, vView), 0.0), 0.55);
      vec3 color = c * vec3(1.25, 1.05, 0.8) * (0.45 + 0.55 * limb);
      color += vec3(0.9, 0.45, 0.1) * (1.0 - limb) * 0.25; // borde cálido
      gl_FragColor = vec4(color, 1.0);
      #include <colorspace_fragment>
    }
  `,
});

// Halo atmosférico fino (fresnel aditivo) para Tierra, Venus y Titán
function atmosphereMaterial(color, intensity) {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      intensity: { value: intensity },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float intensity;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 3.0);
        gl_FragColor = vec4(color, rim * intensity);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

/* ═══════════ Sol ═══════════ */
const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_RADIUS, 64, 64), sunMaterial);
scene.add(sun);

const glowTexture = (() => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,235,190,0.35)');
  g.addColorStop(1, 'rgba(255,190,90,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
})();

for (const [color, scale, opacity] of [[0xffc878, SUN_RADIUS * 3.6, 0.28], [0xfff0d0, SUN_RADIUS * 2.2, 0.45]]) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  s.scale.setScalar(scale);
  sun.add(s);
}

/* ═══════════════════════════════════════════════════════════════
   Datos reales
   radius: radios terrestres · au: distancia media al Sol
   orbitDays: año · rotHours: día sideral (negativo = retrógrado)
   Lunas: km de diámetro real · periodo real en días ·
          vdist: distancia visual en radios del planeta (comprimida)
   ═══════════════════════════════════════════════════════════════ */
const SUN_DATA = {
  name: 'Sol', type: 'Estrella',
  desc: 'La estrella que contiene el 99,86 % de toda la masa del sistema solar.',
  data: {
    'Diámetro': '1.392.700 km',
    'Masa': '333.000 Tierras',
    'Temperatura núcleo': '15.000.000 °C',
    'Temperatura superficie': '5.500 °C',
    'Edad': '4.600 millones de años',
  },
  facts: [
    'Dentro del Sol cabrían 1,3 millones de Tierras.',
    'La luz que ves ahora tardó 8 minutos y 20 segundos en llegar.',
    'Cada segundo fusiona 600 millones de toneladas de hidrógeno.',
  ],
};

const PLANETS = [
  {
    name: 'Mercurio', texture: '2k_mercury.jpg', radius: 0.38, au: 0.39,
    orbitDays: 88, rotHours: 1408, tilt: 0.03, incl: 7,
    desc: 'El planeta más pequeño y veloz, achicharrado de día y helado de noche.',
    data: { 'Diámetro': '4.879 km', 'Gravedad': '3,7 m/s²', 'Día': '59 días terrestres', 'Año': '88 días', 'Temperatura': '−173 a 427 °C', 'Lunas': '0' },
    facts: [
      'Su año dura 88 días, pero de amanecer a amanecer pasan 176.',
      'Tiene hielo de agua en cráteres polares que nunca ven el Sol.',
      'Se encoge: su núcleo de hierro se enfría y el planeta mengua.',
    ],
  },
  {
    name: 'Venus', texture: '2k_venus_atmosphere.jpg', radius: 0.95, au: 0.72,
    orbitDays: 225, rotHours: -5832, tilt: 177, incl: 3.4,
    atmosphere: { color: 0xd8b566, intensity: 0.5 },
    desc: 'Gemelo infernal de la Tierra: nubes de ácido sulfúrico y 464 °C constantes.',
    data: { 'Diámetro': '12.104 km', 'Gravedad': '8,9 m/s²', 'Día': '243 días (retrógrado)', 'Año': '225 días', 'Temperatura': '464 °C', 'Lunas': '0' },
    facts: [
      'Su día es más largo que su año, y el Sol sale por el oeste.',
      'La presión en superficie equivale a estar a 900 m bajo el mar.',
      'Es el objeto más brillante del cielo tras el Sol y la Luna.',
    ],
  },
  {
    name: 'Tierra', texture: 'earth-day-4k.jpg', radius: 1, au: 1,
    orbitDays: 365.25, rotHours: 23.93, tilt: 23.4, incl: 0,
    hasClouds: true, atmosphere: { color: 0x5588ff, intensity: 0.55 },
    desc: 'El único lugar del universo donde sabemos que hay vida.',
    data: { 'Diámetro': '12.742 km', 'Gravedad': '9,8 m/s²', 'Día': '23 h 56 min', 'Año': '365,25 días', 'Temperatura media': '15 °C', 'Lunas': '1' },
    facts: [
      'El 71 % de la superficie es océano, pero el agua es solo el 0,02 % de su masa.',
      'Gira a 1.670 km/h en el ecuador y nadie lo nota.',
      'Es el planeta más denso del sistema solar.',
    ],
    moons: [
      { name: 'Luna', texture: '2k_moon.jpg', km: 3474, periodDays: 27.3, vdist: 4.5,
        desc: 'El único satélite natural de la Tierra.', facts: ['Se aleja de nosotros 3,8 cm cada año.'] },
    ],
  },
  {
    name: 'Marte', texture: '2k_mars.jpg', radius: 0.53, au: 1.52,
    orbitDays: 687, rotHours: 24.6, tilt: 25.2, incl: 1.9,
    desc: 'El planeta rojo: desiertos de óxido de hierro y el volcán más alto conocido.',
    data: { 'Diámetro': '6.779 km', 'Gravedad': '3,7 m/s²', 'Día': '24 h 37 min', 'Año': '687 días', 'Temperatura media': '−63 °C', 'Lunas': '2' },
    facts: [
      'El monte Olimpo mide 22 km: dos veces y media el Everest.',
      'Sus puestas de sol son azules.',
      'Tuvo ríos, lagos y probablemente un océano hace 3.500 millones de años.',
    ],
    moons: [
      { name: 'Fobos', km: 22, periodDays: 0.32, vdist: 2.4, color: 0x9a8d7f,
        desc: 'Orbita tan cerca que Marte lo destrozará en ~50 millones de años.' },
      { name: 'Deimos', km: 12, periodDays: 1.26, vdist: 3.6, color: 0xa89a8a,
        desc: 'Una de las lunas más pequeñas conocidas del sistema solar.' },
    ],
  },
  {
    name: 'Júpiter', texture: '2k_jupiter.jpg', radius: 10.97, au: 5.2,
    orbitDays: 4333, rotHours: 9.9, tilt: 3.1, incl: 1.3,
    desc: 'El gigante: pesa más del doble que todos los demás planetas juntos.',
    data: { 'Diámetro': '139.820 km (11 Tierras)', 'Gravedad': '24,8 m/s²', 'Día': '9 h 56 min', 'Año': '11,9 años', 'Temperatura': '−108 °C', 'Lunas': '95 conocidas' },
    facts: [
      'La Gran Mancha Roja es una tormenta más grande que la Tierra activa desde hace siglos.',
      'Su campo magnético es 20.000 veces más fuerte que el terrestre.',
      'Actúa de escudo: desvía cometas y asteroides que irían hacia los planetas interiores.',
    ],
    moons: [
      { name: 'Ío', km: 3643, periodDays: 1.77, vdist: 1.7, color: 0xd8c266,
        desc: 'El cuerpo con más volcanes activos del sistema solar: más de 400.' },
      { name: 'Europa', km: 3122, periodDays: 3.55, vdist: 2.1, color: 0xc9b8a3,
        desc: 'Bajo su corteza de hielo hay un océano con el doble de agua que la Tierra.' },
      { name: 'Ganímedes', km: 5268, periodDays: 7.15, vdist: 2.6, color: 0x9d9486,
        desc: 'La luna más grande del sistema solar: mayor que Mercurio.' },
      { name: 'Calisto', km: 4821, periodDays: 16.7, vdist: 3.2, color: 0x77705f,
        desc: 'La superficie con más cráteres del sistema solar.' },
      { name: 'Amaltea', km: 167, periodDays: 0.5, vdist: 1.45, color: 0xb05c4a },
      { name: 'Tebe', km: 99, periodDays: 0.67, vdist: 1.55, color: 0x9a8a78 },
      { name: 'Metis', km: 43, periodDays: 0.3, vdist: 1.32, color: 0x8d8275 },
      { name: 'Adrastea', km: 16, periodDays: 0.3, vdist: 1.38, color: 0x8d8275 },
      { name: 'Himalia', km: 140, periodDays: 251, vdist: 4.2, color: 0x8a8070 },
      { name: 'Elara', km: 80, periodDays: 260, vdist: 4.6, color: 0x857b6c },
      { name: 'Lisitea', km: 42, periodDays: 259, vdist: 4.9, color: 0x857b6c },
      { name: 'Leda', km: 22, periodDays: 241, vdist: 5.2, color: 0x807666 },
      { name: 'Ananké', km: 28, periodDays: -630, vdist: 5.6, color: 0x7a7062 },
      { name: 'Carme', km: 47, periodDays: -702, vdist: 6.0, color: 0x7a7062 },
      { name: 'Pasífae', km: 58, periodDays: -744, vdist: 6.4, color: 0x756b5e },
      { name: 'Sinope', km: 35, periodDays: -759, vdist: 6.8, color: 0x756b5e },
    ],
    minorMoons: 79,
  },
  {
    name: 'Saturno', texture: '2k_saturn.jpg', radius: 9.14, au: 9.58,
    orbitDays: 10759, rotHours: 10.7, tilt: 26.7, incl: 2.5,
    ring: { inner: 1.24, outer: 2.27, texture: '2k_saturn_ring_alpha.png' },
    desc: 'El señor de los anillos: miles de bandas de hielo y roca de solo ~10 m de grosor.',
    data: { 'Diámetro': '116.460 km (9 Tierras)', 'Gravedad': '10,4 m/s²', 'Día': '10 h 42 min', 'Año': '29,4 años', 'Temperatura': '−139 °C', 'Lunas': '146 conocidas' },
    facts: [
      'Es menos denso que el agua: flotaría en un océano lo bastante grande.',
      'Sus anillos abarcan 282.000 km pero tienen unos 10 metros de espesor.',
      'En su polo norte hay una tormenta hexagonal perfecta de 30.000 km.',
    ],
    moons: [
      { name: 'Titán', km: 5150, periodDays: 15.9, vdist: 3.4, color: 0xd9a45b,
        atmosphere: { color: 0xcc8844, intensity: 0.45 },
        desc: 'Tiene lagos y ríos de metano líquido y una atmósfera más densa que la terrestre.' },
      { name: 'Rea', km: 1527, periodDays: 4.5, vdist: 2.85, color: 0xb8b0a4 },
      { name: 'Jápeto', km: 1469, periodDays: 79, vdist: 4.2, color: 0x9a9288,
        desc: 'Una cara negra como el carbón y la otra blanca como la nieve.' },
      { name: 'Dione', km: 1123, periodDays: 2.7, vdist: 2.65, color: 0xc0b8ac },
      { name: 'Tetis', km: 1062, periodDays: 1.9, vdist: 2.5, color: 0xc4bcb0 },
      { name: 'Encélado', km: 504, periodDays: 1.37, vdist: 2.38, color: 0xe8eef2,
        desc: 'Expulsa géiseres de agua de su océano interno: candidato a albergar vida.' },
      { name: 'Mimas', km: 396, periodDays: 0.94, vdist: 2.28, color: 0xb4aca0,
        desc: 'Su cráter gigante Herschel lo hace idéntico a la Estrella de la Muerte.' },
      { name: 'Hiperión', km: 270, periodDays: 21.3, vdist: 3.8, color: 0xa89a85 },
      { name: 'Febe', km: 213, periodDays: -550, vdist: 5.2, color: 0x6e665c },
      { name: 'Jano', km: 179, periodDays: 0.69, vdist: 2.2, color: 0xa39b8e },
      { name: 'Epimeteo', km: 116, periodDays: 0.69, vdist: 2.14, color: 0xa39b8e },
    ],
    minorMoons: 135,
  },
  {
    name: 'Urano', texture: '2k_uranus.jpg', radius: 3.98, au: 19.2,
    orbitDays: 30687, rotHours: -17.2, tilt: 97.8, incl: 0.8,
    ring: { inner: 1.6, outer: 1.95, color: 0x8899aa },
    desc: 'El gigante de hielo que rueda tumbado: su eje apunta casi al Sol.',
    data: { 'Diámetro': '50.724 km (4 Tierras)', 'Gravedad': '8,9 m/s²', 'Día': '17 h 14 min (retrógrado)', 'Año': '84 años', 'Temperatura': '−197 °C', 'Lunas': '28' },
    facts: [
      'Cada polo pasa 42 años seguidos de día y 42 de noche.',
      'Es el planeta más frío pese a no ser el más lejano.',
      'Sus lunas llevan nombres de personajes de Shakespeare.',
    ],
    moons: [
      { name: 'Titania', km: 1577, periodDays: 8.7, vdist: 2.9, color: 0x9aa0a8 },
      { name: 'Oberón', km: 1523, periodDays: 13.5, vdist: 3.5, color: 0x8a9098 },
      { name: 'Umbriel', km: 1169, periodDays: 4.1, vdist: 2.45, color: 0x6e747c },
      { name: 'Ariel', km: 1158, periodDays: 2.5, vdist: 2.1, color: 0xa8aeb6 },
      { name: 'Miranda', km: 472, periodDays: 1.4, vdist: 1.8, color: 0xb0b8c0,
        desc: 'Tiene el acantilado más alto del sistema solar: Verona Rupes, 20 km de caída.' },
      { name: 'Puck', km: 162, periodDays: 0.76, vdist: 1.55, color: 0x8a9098 },
    ],
    minorMoons: 22,
  },
  {
    name: 'Neptuno', texture: '2k_neptune.jpg', radius: 3.86, au: 30.05,
    orbitDays: 60190, rotHours: 16.1, tilt: 28.3, incl: 1.8,
    desc: 'El planeta más ventoso: rachas supersónicas de 2.100 km/h.',
    data: { 'Diámetro': '49.244 km (3,9 Tierras)', 'Gravedad': '11,2 m/s²', 'Día': '16 h 7 min', 'Año': '165 años', 'Temperatura': '−201 °C', 'Lunas': '16' },
    facts: [
      'Fue descubierto con matemáticas antes que con telescopios.',
      'Desde su descubrimiento en 1846 solo ha completado una órbita.',
      'Es posible que en su interior lluevan diamantes.',
    ],
    moons: [
      { name: 'Tritón', km: 2707, periodDays: -5.88, vdist: 2.6, color: 0xc8c4bc,
        desc: 'Orbita al revés: es un objeto del cinturón de Kuiper capturado.' },
      { name: 'Proteo', km: 420, periodDays: 1.12, vdist: 1.9, color: 0x8a857c },
      { name: 'Nereida', km: 357, periodDays: 360, vdist: 4.5, color: 0x95908a },
      { name: 'Larisa', km: 195, periodDays: 0.55, vdist: 1.6, color: 0x8a857c },
    ],
    minorMoons: 12,
  },
  {
    name: 'Plutón', texture: 'plutomap1k.jpg', radius: 0.19, au: 39.5,
    orbitDays: 90560, rotHours: -153.3, tilt: 122.5, incl: 17.2,
    desc: 'El planeta enano más famoso, con un corazón de hielo de nitrógeno.',
    data: { 'Diámetro': '2.377 km', 'Gravedad': '0,62 m/s²', 'Día': '6,4 días (retrógrado)', 'Año': '248 años', 'Temperatura': '−232 °C', 'Lunas': '5' },
    facts: [
      'Es más pequeño que nuestra Luna.',
      'Su corazón helado, Sputnik Planitia, late: el hielo circula como lava lenta.',
      'Caronte es tan grande que ambos orbitan un punto en el espacio entre los dos.',
    ],
    moons: [
      { name: 'Caronte', km: 1212, periodDays: 6.4, vdist: 3.5, color: 0x9d9890 },
      { name: 'Estigia', km: 16, periodDays: 20.2, vdist: 5.0, color: 0x8a857c },
      { name: 'Nix', km: 50, periodDays: 24.9, vdist: 5.8, color: 0x95908a },
      { name: 'Cerbero', km: 19, periodDays: 32.2, vdist: 6.6, color: 0x8a857c },
      { name: 'Hidra', km: 51, periodDays: 38.2, vdist: 7.4, color: 0x95908a },
    ],
  },
];

/* ═══════════ Construcción de la escena ═══════════ */
const bodies = [];        // todo lo etiquetable / buscable / clicable
const planetSystems = [];
const clickMeshes = [];

function makeLabel(text, isMoon = false) {
  const el = document.createElement('div');
  el.className = 'planet-label' + (isMoon ? ' moon-label' : '');
  el.textContent = text;
  document.getElementById('labels').appendChild(el);
  return el;
}

function makeOrbitLine(radius, opacity, segments = 256) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity })
  );
  line.matrixAutoUpdate = false;
  return line;
}

// El Sol como cuerpo consultable
const sunBody = {
  ...SUN_DATA, isSun: true, visualRadius: SUN_RADIUS,
  label: makeLabel('Sol'), mesh: sun,
  getPos: (v) => v.set(0, 0, 0),
};
bodies.push(sunBody);
clickMeshes.push(sun);
sun.userData.body = sunBody;

for (const data of PLANETS) {
  const d = distOf(data.au);
  const r = radiusOf(data.radius);

  const system = new THREE.Group();
  scene.add(system);
  const tiltGroup = new THREE.Group();
  tiltGroup.rotation.z = THREE.MathUtils.degToRad(data.tilt);
  system.add(tiltGroup);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(r, 64, 64),
    new THREE.MeshPhongMaterial({ map: tex(data.texture), shininess: 4, specular: 0x222222 })
  );
  tiltGroup.add(mesh);
  clickMeshes.push(mesh);

  if (data.hasClouds) {
    mesh.add(new THREE.Mesh(
      new THREE.SphereGeometry(r * 1.012, 48, 48),
      new THREE.MeshLambertMaterial({
        map: tex('clouds-4k.png'), transparent: true, opacity: 0.8, depthWrite: false,
      })
    ));
  }

  if (data.atmosphere) {
    tiltGroup.add(new THREE.Mesh(
      new THREE.SphereGeometry(r * 1.035, 48, 48),
      atmosphereMaterial(data.atmosphere.color, data.atmosphere.intensity)
    ));
  }

  // Anillos (UVs remapeados radialmente para texturas en franja)
  if (data.ring) {
    const inner = r * data.ring.inner;
    const outer = r * data.ring.outer;
    const geo = new THREE.RingGeometry(inner, outer, 160, 1);
    const pos = geo.attributes.position;
    const uvAttr = geo.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      uvAttr.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
    }
    const ringMat = data.ring.texture
      ? new THREE.MeshLambertMaterial({
          map: tex(data.ring.texture), transparent: true,
          side: THREE.DoubleSide, depthWrite: false,
        })
      : new THREE.MeshLambertMaterial({
          color: data.ring.color, transparent: true, opacity: 0.12,
          side: THREE.DoubleSide, depthWrite: false,
        });
    const ring = new THREE.Mesh(geo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    tiltGroup.add(ring);
  }

  // Lunas con nombre — tamaño real relativo (km → unidades de escena)
  const moons = [];
  for (const m of data.moons || []) {
    const mr = Math.max((m.km / 12742) * R_EARTH, 0.018);
    const mMat = m.texture
      ? new THREE.MeshPhongMaterial({ map: tex(m.texture), shininess: 2 })
      : new THREE.MeshPhongMaterial({ color: m.color || 0x9a958c, shininess: 2 });
    const mMesh = new THREE.Mesh(new THREE.SphereGeometry(mr, 24, 24), mMat);
    tiltGroup.add(mMesh);
    clickMeshes.push(mMesh);

    if (m.atmosphere) {
      mMesh.add(new THREE.Mesh(
        new THREE.SphereGeometry(mr * 1.08, 24, 24),
        atmosphereMaterial(m.atmosphere.color, m.atmosphere.intensity)
      ));
    }

    // Órbita de la luna: visible solo al acercarse al planeta
    const mOrbit = makeOrbitLine(r * m.vdist, 0.07, 128);
    mOrbit.visible = false;
    tiltGroup.add(mOrbit);

    const moon = {
      name: m.name, isMoon: true, parentName: data.name,
      mesh: mMesh, visualRadius: mr, orbitLine: mOrbit,
      dist: r * m.vdist, periodDays: m.periodDays,
      angle: Math.random() * Math.PI * 2,
      label: makeLabel(m.name, true), parentSystem: system,
      desc: m.desc || `Luna de ${data.name}.`,
      data: {
        'Diámetro': `${m.km.toLocaleString('es')} km`,
        'Periodo orbital': `${Math.abs(m.periodDays)} días${m.periodDays < 0 ? ' (retrógrado)' : ''}`,
      },
      facts: m.facts || [],
      getPos(v) { return this.mesh.getWorldPosition(v); },
    };
    mMesh.userData.body = moon;
    moons.push(moon);
    bodies.push(moon);
  }

  // Lunas menores sin nombre, hasta el total real del planeta.
  // Solo se actualizan cuando la cámara está cerca (ahorro de CPU).
  let minor = null;
  if (data.minorMoons) {
    const count = data.minorMoons;
    const im = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.014),
      new THREE.MeshPhongMaterial({ color: 0x7d7868 }),
      count
    );
    tiltGroup.add(im);
    const orbits = [];
    for (let i = 0; i < count; i++) {
      orbits.push({
        radius: r * (5 + Math.random() * 4),
        speed: (0.15 + Math.random() * 0.6) * (Math.random() < 0.4 ? -1 : 1),
        incl: (Math.random() - 0.5) * 1.4,
        phase: Math.random() * Math.PI * 2,
        scale: 0.5 + Math.random() * 1.6,
      });
    }
    minor = { mesh: im, orbits };
  }

  const orbitLine = makeOrbitLine(d, 0.1);
  orbitLine.rotation.x = THREE.MathUtils.degToRad(data.incl);
  orbitLine.updateMatrix();
  scene.add(orbitLine);

  const body = {
    ...data, type: data.name === 'Plutón' ? 'Planeta enano' : 'Planeta',
    system, tiltGroup, mesh, moons, minor, orbitLine,
    dist: d, visualRadius: r,
    angle: Math.random() * Math.PI * 2,
    inclRad: THREE.MathUtils.degToRad(data.incl),
    label: makeLabel(data.name),
    getPos(v) { return v.copy(this.system.position); },
  };
  mesh.userData.body = body;
  planetSystems.push(body);
  bodies.push(body);
}

/* ═══════════ Cinturón de asteroides ═══════════
   4 bandas instanciadas con rotación kepleriana diferencial
   (las interiores giran más rápido), color y forma irregulares
   por instancia, y CERO actualizaciones de matrices por frame:
   solo rota cada banda como conjunto. */
const beltGroup = new THREE.Group();
scene.add(beltGroup);
const beltBands = [];
{
  const BANDS = 4;
  const PER_BAND = 800;
  const beltInner = distOf(2.1);
  const beltOuter = distOf(3.3);
  const bandWidth = (beltOuter - beltInner) / BANDS;

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const c = new THREE.Color();

  for (let b = 0; b < BANDS; b++) {
    const rIn = beltInner + b * bandWidth;
    const rOut = rIn + bandWidth;
    const rMid = (rIn + rOut) / 2;

    const im = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.05),
      new THREE.MeshPhongMaterial({ shininess: 2 }),
      PER_BAND
    );
    for (let i = 0; i < PER_BAND; i++) {
      const radius = rIn + Math.random() * bandWidth;
      const a = Math.random() * Math.PI * 2;
      // Más dispersión vertical hacia el centro del cinturón
      const y = (Math.random() - 0.5) * 2.4 * (1 - Math.abs(radius - (beltInner + beltOuter) / 2) / (beltOuter - beltInner));
      q.setFromEuler(eul.set(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3));
      // Escala no uniforme: rocas irregulares, no esferas perfectas
      s.set(0.3 + Math.random() * 1.6, 0.3 + Math.random() * 1.2, 0.3 + Math.random() * 1.6);
      m4.compose(p.set(Math.cos(a) * radius, y, Math.sin(a) * radius), q, s);
      im.setMatrixAt(i, m4);
      // Variación de color: carbonáceos oscuros, silíceos, metálicos
      c.setHSL(0.07 + Math.random() * 0.05, 0.1 + Math.random() * 0.2, 0.25 + Math.random() * 0.3);
      im.setColorAt(i, c);
    }
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor.needsUpdate = true;
    beltGroup.add(im);
    // Velocidad kepleriana: ω ∝ r^(−3/2)
    beltBands.push({ mesh: im, speed: Math.pow(beltInner / rMid, 1.5) });
  }
}

/* ═══════════ Cinturón de Kuiper ═══════════ */
const kuiperGroup = new THREE.Group();
scene.add(kuiperGroup);
{
  const COUNT = 4000;
  const inner = distOf(36);
  const outer = distOf(55);
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const c = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    const radius = inner + Math.random() * (outer - inner);
    const a = Math.random() * Math.PI * 2;
    positions[i * 3] = Math.cos(a) * radius;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 8;
    positions[i * 3 + 2] = Math.sin(a) * radius;
    c.setHSL(0.58 + Math.random() * 0.08, 0.2 + Math.random() * 0.2, 0.35 + Math.random() * 0.3);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  kuiperGroup.add(new THREE.Points(g, new THREE.PointsMaterial({
    vertexColors: true, size: 0.22, transparent: true, opacity: 0.45, depthWrite: false,
  })));
}

/* ═══════════ Post-procesado ═══════════ */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// Bloom contenido: solo el Sol y sus halos superan el umbral
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.25, 0.4, 0.9);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

/* ═══════════ UI ═══════════ */
const $ = (id) => document.getElementById(id);
const settings = { daysPerSec: 0.5, labels: true };

// Control de tiempo segmentado
const SPEEDS = [
  { label: '⏸', value: 0, title: 'Pausa' },
  { label: '0,5×', value: 0.5, title: 'Medio día por segundo' },
  { label: '2×', value: 2, title: '2 días por segundo' },
  { label: '10×', value: 10, title: '10 días por segundo' },
  { label: '60×', value: 60, title: '2 meses por segundo' },
];
{
  const wrap = $('speed-control');
  for (const s of SPEEDS) {
    const btn = document.createElement('button');
    btn.textContent = s.label;
    btn.title = s.title;
    if (s.value === settings.daysPerSec) btn.classList.add('active');
    btn.addEventListener('click', () => {
      settings.daysPerSec = s.value;
      wrap.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    });
    wrap.appendChild(btn);
  }
}

$('ctl-orbits').addEventListener('change', (e) => {
  planetSystems.forEach((p) => { p.orbitLine.visible = e.target.checked; });
});
$('ctl-labels').addEventListener('change', (e) => { settings.labels = e.target.checked; });
$('ctl-belt').addEventListener('change', (e) => { beltGroup.visible = e.target.checked; });
$('ctl-kuiper').addEventListener('change', (e) => { kuiperGroup.visible = e.target.checked; });
$('ctl-minor-moons').addEventListener('change', (e) => {
  planetSystems.forEach((p) => { if (p.minor) p.minor.mesh.visible = e.target.checked; });
});

/* ── Foco y seguimiento ── */
let followed = null;
const _followPrev = new THREE.Vector3();
const _pos = new THREE.Vector3();

function showInfo(body) {
  $('info-card').hidden = false;
  $('info-type').textContent = body.isMoon ? `Luna de ${body.parentName}` : (body.type || 'Estrella');
  $('info-name').textContent = body.name;
  $('info-desc').textContent = body.desc || '';
  const dl = $('info-data');
  dl.innerHTML = '';
  for (const [k, val] of Object.entries(body.data || {})) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = val;
    dl.append(dt, dd);
  }
  const ul = $('info-facts');
  ul.innerHTML = '';
  for (const f of body.facts || []) {
    const li = document.createElement('li');
    li.textContent = f;
    ul.appendChild(li);
  }
  ul.style.display = (body.facts || []).length ? '' : 'none';
}

function focusBody(body) {
  followed = body;
  body.getPos(_followPrev);
  const r = body.visualRadius || 1;
  camera.position.copy(_followPrev).add(new THREE.Vector3(r * 3.4, r * 1.6, r * 3.4));
  controls.target.copy(_followPrev);
  showInfo(body);
  document.querySelectorAll('#planet-list button').forEach((b) => {
    b.classList.toggle('active', b.dataset.name === body.name);
  });
}

function clearFocus() {
  followed = null;
  $('info-card').hidden = true;
  document.querySelectorAll('#planet-list button').forEach((b) => b.classList.remove('active'));
}

$('info-close').addEventListener('click', () => { $('info-card').hidden = true; });

const listEl = $('planet-list');
for (const b of [sunBody, ...planetSystems]) {
  const btn = document.createElement('button');
  btn.textContent = b.name;
  btn.dataset.name = b.name;
  btn.addEventListener('click', () => focusBody(b));
  listEl.appendChild(btn);
}

$('btn-overview').addEventListener('click', () => {
  clearFocus();
  camera.position.set(0, 48, 105);
  controls.target.set(0, 0, 0);
});

/* ── Buscador ── */
const searchInput = $('search');
const resultsEl = $('search-results');
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function runSearch() {
  const q = norm(searchInput.value.trim());
  resultsEl.innerHTML = '';
  if (!q) { resultsEl.hidden = true; return; }
  const matches = bodies.filter((b) => norm(b.name).includes(q)).slice(0, 10);
  if (!matches.length) { resultsEl.hidden = true; return; }
  for (const b of matches) {
    const item = document.createElement('div');
    item.className = 'search-item';
    const name = document.createElement('span');
    name.textContent = b.name;
    const kind = document.createElement('small');
    kind.textContent = b.isMoon ? `luna · ${b.parentName}` : (b.isSun ? 'estrella' : (b.type || 'planeta').toLowerCase());
    item.append(name, kind);
    item.addEventListener('click', () => {
      focusBody(b);
      resultsEl.hidden = true;
      searchInput.value = b.name;
    });
    resultsEl.appendChild(item);
  }
  resultsEl.hidden = false;
}
searchInput.addEventListener('input', runSearch);
searchInput.addEventListener('focus', runSearch);
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrap')) resultsEl.hidden = true;
});

/* ── Click sobre cuerpos ── */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(clickMeshes, false);
  if (hits.length && hits[0].object.userData.body) focusBody(hits[0].object.userData.body);
});

for (const b of bodies) {
  b.label.addEventListener('click', () => focusBody(b));
}

/* ═══════════ Etiquetas proyectadas ═══════════
   Se actualizan en frames alternos: a 60 fps las etiquetas
   se mueven a 30 fps, imperceptible y a mitad de coste. */
const _proj = new THREE.Vector3();
function updateLabels() {
  for (const b of bodies) {
    let visible = settings.labels;
    if (visible && b.isMoon) {
      // Lunas: etiqueta y órbita solo con la cámara cerca del planeta
      const planetDist = camera.position.distanceTo(b.parentSystem.position);
      visible = planetDist < Math.max(b.dist * 6, 10);
      b.orbitLine.visible = visible;
    }
    if (!visible) { b.label.style.display = 'none'; continue; }

    b.getPos(_proj);
    _proj.project(camera);
    if (_proj.z > 1 || Math.abs(_proj.x) > 1.05 || Math.abs(_proj.y) > 1.05) {
      b.label.style.display = 'none';
      continue;
    }
    b.label.style.display = 'block';
    b.label.style.transform = `translate(-50%, -150%) translate(${(_proj.x * 0.5 + 0.5) * window.innerWidth}px, ${(-_proj.y * 0.5 + 0.5) * window.innerHeight}px)`;
  }
}

/* ═══════════ Resize ═══════════ */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

/* ═══════════ Bucle principal ═══════════ */
const clock = new THREE.Clock();
const fpsEl = $('fps');
let frameCount = 0, fpsTime = 0, frameParity = 0;

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _axis = new THREE.Vector3(1, 0, 0);
const _delta = new THREE.Vector3();

// Umbral al cuadrado para actualizar lunas menores (evita sqrt)
const MINOR_UPDATE_DIST_SQ = 80 * 80;

function animate() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const simDays = settings.daysPerSec * dt;

  sunMaterial.uniforms.time.value = clock.elapsedTime;
  sun.rotation.y += 0.008 * dt;

  for (const p of planetSystems) {
    p.angle += (Math.PI * 2 / p.orbitDays) * simDays;
    const x = Math.cos(p.angle) * p.dist;
    const z = Math.sin(p.angle) * p.dist;
    p.system.position.set(x, -Math.sin(p.inclRad) * z, Math.cos(p.inclRad) * z);

    p.mesh.rotation.y += (Math.PI * 2 / (Math.abs(p.rotHours) / 24)) * simDays * Math.sign(p.rotHours);

    for (const m of p.moons) {
      m.angle += (Math.PI * 2 / Math.abs(m.periodDays)) * simDays * Math.sign(m.periodDays);
      m.mesh.position.set(Math.cos(m.angle) * m.dist, 0, Math.sin(m.angle) * m.dist);
      m.mesh.rotation.y += 0.3 * dt;
    }

    // Lunas menores: solo si están visibles Y la cámara anda cerca
    if (p.minor && p.minor.mesh.visible &&
        camera.position.distanceToSquared(p.system.position) < MINOR_UPDATE_DIST_SQ) {
      const { mesh, orbits } = p.minor;
      for (let i = 0; i < orbits.length; i++) {
        const o = orbits[i];
        o.phase += o.speed * simDays * 0.4;
        _q.setFromAxisAngle(_axis, o.incl);
        _delta.set(
          Math.cos(o.phase) * o.radius,
          Math.sin(o.phase) * o.radius * Math.sin(o.incl) * 0.4,
          Math.sin(o.phase) * o.radius
        );
        _s.setScalar(o.scale);
        _m4.compose(_delta, _q, _s);
        mesh.setMatrixAt(i, _m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // Cinturones: rotación kepleriana diferencial por banda
  for (const band of beltBands) {
    band.mesh.rotation.y += 0.012 * band.speed * simDays;
  }
  kuiperGroup.rotation.y += 0.0008 * simDays;

  if (followed) {
    followed.getPos(_pos);
    _delta.copy(_pos).sub(_followPrev);
    camera.position.add(_delta);
    controls.target.copy(_pos);
    _followPrev.copy(_pos);
  }

  controls.update();
  composer.render();

  frameParity ^= 1;
  if (frameParity) updateLabels();

  frameCount++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fpsEl.textContent = `${Math.round(frameCount / fpsTime)} fps`;
    frameCount = 0;
    fpsTime = 0;
  }

  requestAnimationFrame(animate);
}

animate();
