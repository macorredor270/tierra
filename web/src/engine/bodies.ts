import * as THREE from 'three';
import type { Body } from '../data/world';
import { cloudsShader, coronaShader, earthShader, ringShader, scatteringShader, sunShader } from './shaders';
import { shadowUniforms, withShadows, type RingShadow } from './shadows';
import { textureKey, texturePath } from '../data/textures';

export interface BodyView {
  body: Body;
  /** Posicionado cada frame en (posición − foco). */
  root: THREE.Group;
  /** Orientación IAU del cuerpo (polo y meridiano). */
  spin: THREE.Group;
  mesh: THREE.Mesh;
  /** Índice en el buffer de orientaciones de WASM, o −1 si no tiene datos IAU. */
  orientSlot: number;
  uniforms?: Record<string, THREE.IUniform>;
  ringShadow?: RingShadow;
  /** Carpeta de texturas y nivel cargado (0 = ninguno). */
  texKey: string | null;
  texLevel: number;
  /** Atmósfera con dispersión física, si el cuerpo tiene. */
  atmo?: { mesh: THREE.Mesh; uniforms: Record<string, THREE.IUniform> };
}

const sphere = new THREE.SphereGeometry(1, 96, 64);
const lowSphere = new THREE.SphereGeometry(1, 32, 20);

export function createTextureLoader(manager: THREE.LoadingManager, renderer: THREE.WebGLRenderer) {
  const loader = new THREE.TextureLoader(manager);
  const aniso = renderer.capabilities.getMaxAnisotropy();
  return (file: string, srgb = true) => {
    const t = loader.load('textures/' + file);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    return t;
  };
}

type Tex = ReturnType<typeof createTextureLoader>;

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,240,210,1)');
  grad.addColorStop(0.12, 'rgba(255,200,120,0.55)');
  grad.addColorStop(0.35, 'rgba(255,140,50,0.12)');
  grad.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Orden de las orientaciones que devuelve WASM: Sol, 8 planetas, Ceres, Plutón, Luna. */
function orientSlot(b: Body): number {
  if (b.index <= 8) return b.index;
  if (b.index === 9) return 9;
  if (b.index === 10) return 10;
  if (b.jplName === 'Moon') return 11;
  return -1;
}

/** Crea el cuerpo con su textura de 1K (arranque rápido); el motor sube luego de nivel. */
export function createBodyView(b: Body, tex: Tex): BodyView {
  const key = textureKey(b);
  const level = 1;
  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin);
  const info = b.info;
  let mesh: THREE.Mesh;
  let uniforms: Record<string, THREE.IUniform> | undefined;
  let ringShadow: RingShadow | undefined;
  let atmo: BodyView['atmo'];

  if (info.kind === 'star') {
    uniforms = { map: { value: tex(texturePath('sun', level)) }, time: { value: 0 } };
    mesh = new THREE.Mesh(
      sphere,
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: sunShader.vertex,
        fragmentShader: sunShader.fragment,
      }),
    );
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.35,
      }),
    );
    glow.scale.setScalar(info.radius * 9);
    root.add(glow);
    const CORONA = 7; // radios solares
    const corona = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: { size: { value: info.radius * CORONA }, extent: { value: CORONA }, time: uniforms.time },
        vertexShader: coronaShader.vertex,
        fragmentShader: coronaShader.fragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    corona.frustumCulled = false;
    root.add(corona);
  } else if (info.name === 'Tierra') {
    const clouds = tex(texturePath('earth', level, 'clouds'), false);
    clouds.wrapS = THREE.RepeatWrapping;
    uniforms = {
      dayMap: { value: tex(texturePath('earth', level, 'day')) },
      nightMap: { value: tex(texturePath('earth', level, 'night')) },
      waterMap: { value: tex('earth/water-4k.png', false) },
      cloudsMap: { value: clouds },
      sunPos: { value: new THREE.Vector3() },
      cloudShift: { value: 0 },
    };
    Object.assign(uniforms, shadowUniforms, { shSelfId: { value: b.index } });
    mesh = new THREE.Mesh(
      sphere,
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: earthShader.vertex,
        fragmentShader: earthShader.fragment,
      }),
    );
    const cloudMesh = new THREE.Mesh(
      sphere,
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: cloudsShader.vertex,
        fragmentShader: cloudsShader.fragment,
        transparent: true,
        depthWrite: false,
      }),
    );
    cloudMesh.scale.setScalar(1.004);
    mesh.add(cloudMesh);
    atmo = atmosphere('earth', 6378.1);
  } else {
    const shade = new THREE.Color(info.color);
    if (b.info.kind === 'moon' && !key) shade.offsetHSL(0, 0, (((b.index * 37) % 11) - 5) / 60);
    const mat = new THREE.MeshStandardMaterial({
      map: key ? tex(texturePath(key, level)) : null,
      color: key ? 0xffffff : shade,
      roughness: 1,
      metalness: 0,
    });
    mesh = new THREE.Mesh(b.info.kind === 'moon' && !key ? lowSphere : sphere, mat);
    if (info.name === 'Saturno') {
      ringShadow = {
        uniforms: {
          ringMap: { value: tex('2k_saturn_ring_alpha.png') },
          ringCenter: { value: new THREE.Vector3() },
          ringNormal: { value: new THREE.Vector3(0, 1, 0) },
          ringInner: { value: RING_INNER },
          ringOuter: { value: RING_OUTER },
        },
      };
    }
    withShadows(mat, b.index, { ring: ringShadow });
    if (info.name === 'Venus') atmo = atmosphere('venus', 6051.8);
    if (info.name === 'Marte') atmo = atmosphere('mars', 3396.2);
    if (b.jplName === 'Titan') atmo = atmosphere('titan', 2574.7);
  }

  const polar = info.polarRadius ?? info.radius;
  mesh.scale.set(info.radius, polar, info.radius);
  spin.add(mesh);

  if (info.name === 'Saturno') {
    uniforms = { sunPos: { value: new THREE.Vector3() }, planetPos: { value: new THREE.Vector3() } };
    spin.add(saturnRings(tex, uniforms));
  }
  // Anillos de Urano y Neptuno: estrechos, oscuros (albedo ~2 %) y apenas visibles
  if (info.name === 'Urano' || info.name === 'Neptuno') {
    uniforms = { sunPos: { value: new THREE.Vector3() }, planetPos: { value: new THREE.Vector3() } };
    spin.add(thinRings(info.name === 'Urano' ? URANUS_RINGS : NEPTUNE_RINGS, uniforms, info.radius));
  }
  if (atmo) root.add(atmo.mesh);
  return {
    body: b,
    root,
    spin,
    mesh,
    orientSlot: orientSlot(b),
    uniforms,
    ringShadow,
    texKey: key,
    texLevel: key ? level : 0,
    atmo,
  };
}

/** Parámetros físicos de cada atmósfera (coeficientes por km, alturas de escala en km). */
const ATMOSPHERES = {
  earth: { top: 100, betaR: [5.5e-3, 13.0e-3, 22.4e-3], betaM: [2.1e-3, 2.1e-3, 2.1e-3], hR: 8, hM: 1.2, g: 0.76, sunI: 4 },
  venus: { top: 220, betaR: [1.8e-3, 2.2e-3, 2.6e-3], betaM: [6e-3, 5.4e-3, 3.8e-3], hR: 16, hM: 15, g: 0.7, sunI: 14 },
  mars: { top: 90, betaR: [0.2e-3, 0.45e-3, 1.0e-3], betaM: [3.4e-3, 2.6e-3, 1.8e-3], hR: 11, hM: 11, g: 0.65, sunI: 9 },
  titan: { top: 600, betaR: [0.5e-3, 0.6e-3, 0.9e-3], betaM: [5.5e-3, 3.6e-3, 1.4e-3], hR: 40, hM: 60, g: 0.6, sunI: 6 },
} as const;
export type AtmosphereKind = keyof typeof ATMOSPHERES;

function atmosphere(kind: AtmosphereKind, radius: number): { mesh: THREE.Mesh; uniforms: Record<string, THREE.IUniform> } {
  const a = ATMOSPHERES[kind];
  const uniforms = {
    center: { value: new THREE.Vector3() },
    sunPos: { value: new THREE.Vector3() },
    planetR: { value: radius },
    atmoR: { value: radius + a.top },
    betaR: { value: new THREE.Vector3(...a.betaR) },
    betaM: { value: new THREE.Vector3(...a.betaM) },
    hR: { value: a.hR },
    hM: { value: a.hM },
    g: { value: a.g },
    sunI: { value: a.sunI },
  };
  const m = new THREE.Mesh(
    sphere,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: scatteringShader.vertex,
      fragmentShader: scatteringShader.fragment,
      transparent: true,
      depthWrite: false,
      // Composición física: luz dispersada + fondo × transmitancia (alfa premultiplicado)
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    }),
  );
  // La esfera de la atmósfera cuelga de la raíz (sin la escala achatada del planeta)
  m.scale.setScalar(radius + a.top);
  m.userData.atmosphere = true;
  return { mesh: m, uniforms };
}

// Radios de los anillos de Saturno (km): borde interior del anillo C a borde exterior del A.
const RING_INNER = 74_658;
const RING_OUTER = 136_775;

// Radio (km), anchura (km) y opacidad relativa de los anillos principales (NASA/JPL)
const URANUS_RINGS: [number, number, number][] = [
  [41837, 1.5, 0.5],
  [42234, 2, 0.5],
  [42571, 2, 0.5],
  [44718, 2.5, 0.6],
  [45661, 3, 0.6],
  [47176, 4, 0.7],
  [47627, 2, 0.6],
  [48300, 3, 0.7],
  [51149, 40, 1.0],
  [67300, 3000, 0.04],
];
const NEPTUNE_RINGS: [number, number, number][] = [
  [41900, 2000, 0.06],
  [53200, 110, 0.6],
  [57200, 4000, 0.04],
  [62930, 50, 1.0],
];

function ringTexture(rings: [number, number, number][], inner: number, outer: number): THREE.Texture {
  const W = 2048;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = 1;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, 1);
  for (let x = 0; x < W; x++) {
    const r = inner + ((outer - inner) * x) / (W - 1);
    let a = 0;
    for (const [rr, w, op] of rings) {
      const sigma = Math.max(w, (outer - inner) / W) / 2;
      a = Math.max(a, op * Math.exp(-0.5 * ((r - rr) / sigma) ** 2));
    }
    img.data.set([180, 180, 180, Math.round(a * 255)], x * 4);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  return t;
}

function thinRings(rings: [number, number, number][], u: Record<string, THREE.IUniform>, planetRadius: number) {
  const inner = rings[0][0] - 3000,
    outer = rings[rings.length - 1][0] + 3000;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: ringTexture(rings, inner, outer) },
      inner: { value: inner },
      outer: { value: outer },
      sunPos: u.sunPos,
      planetPos: u.planetPos,
      planetRadius: { value: planetRadius },
      ringDark: { value: new THREE.Color(0.18, 0.17, 0.16) },
      ringLight: { value: new THREE.Color(0.32, 0.3, 0.28) },
      ringOpacity: { value: 0.4 },
      ...shadowUniforms,
      shSelfId: { value: -2 },
    },
    vertexShader: ringShader.vertex,
    fragmentShader: ringShader.fragment,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 256, 1), mat);
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

function saturnRings(tex: Tex, u: Record<string, THREE.IUniform>) {
  const geo = new THREE.RingGeometry(RING_INNER, RING_OUTER, 256, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex('2k_saturn_ring_alpha.png') },
      inner: { value: RING_INNER },
      outer: { value: RING_OUTER },
      sunPos: u.sunPos,
      planetPos: u.planetPos,
      planetRadius: { value: 58_232 },
      ringDark: { value: new THREE.Color(0.62, 0.55, 0.45) },
      ringLight: { value: new THREE.Color(0.95, 0.88, 0.74) },
      ringOpacity: { value: 0.95 },
      ...shadowUniforms,
      // Los anillos no son una esfera: ningún ocultador se descarta como "propio"
      shSelfId: { value: -2 },
    },
    vertexShader: ringShader.vertex,
    fragmentShader: ringShader.fragment,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  return ring;
}
