import * as THREE from 'three';
import type { Body } from './data';
import { MOON_TEXTURES } from './catalog';
import { atmosphereShader, cloudsShader, earthShader, ringShader, sunShader } from './shaders';

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

export function createBodyView(b: Body, tex: Tex): BodyView {
  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin);
  const info = b.info;
  let mesh: THREE.Mesh;
  let uniforms: Record<string, THREE.IUniform> | undefined;

  if (info.kind === 'star') {
    uniforms = { map: { value: tex(info.texture!) }, time: { value: 0 } };
    mesh = new THREE.Mesh(sphere, new THREE.ShaderMaterial({
      uniforms, vertexShader: sunShader.vertex, fragmentShader: sunShader.fragment,
    }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    glow.scale.setScalar(info.radius * 9);
    root.add(glow);
  } else if (info.name === 'Tierra') {
    const clouds = tex('clouds-4k.png', false);
    clouds.wrapS = THREE.RepeatWrapping;
    uniforms = {
      dayMap: { value: tex('earth-day-4k.jpg') },
      nightMap: { value: tex('earth-night.png') },
      waterMap: { value: tex('earth-water.png', false) },
      cloudsMap: { value: clouds },
      sunPos: { value: new THREE.Vector3() },
      cloudShift: { value: 0 },
    };
    mesh = new THREE.Mesh(sphere, new THREE.ShaderMaterial({
      uniforms, vertexShader: earthShader.vertex, fragmentShader: earthShader.fragment,
    }));
    const cloudMesh = new THREE.Mesh(sphere, new THREE.ShaderMaterial({
      uniforms, vertexShader: cloudsShader.vertex, fragmentShader: cloudsShader.fragment,
      transparent: true, depthWrite: false,
    }));
    cloudMesh.scale.setScalar(1.004);
    mesh.add(cloudMesh);
    mesh.add(atmosphere(uniforms.sunPos, 0x6fb4ff, 1.035, 1.4));
  } else {
    const file = info.texture ?? (b.jplName ? MOON_TEXTURES[b.jplName] : undefined);
    const shade = new THREE.Color(info.color);
    if (b.info.kind === 'moon' && !file) shade.offsetHSL(0, 0, ((b.index * 37) % 11 - 5) / 60);
    const mat = new THREE.MeshStandardMaterial({
      map: file ? tex(file) : null,
      color: file ? 0xffffff : shade,
      roughness: 1,
      metalness: 0,
    });
    mesh = new THREE.Mesh(b.info.kind === 'moon' && !file ? lowSphere : sphere, mat);
    if (info.name === 'Venus' || info.name === 'Marte') {
      uniforms = { sunPos: { value: new THREE.Vector3() } };
      mesh.add(info.name === 'Venus'
        ? atmosphere(uniforms.sunPos, 0xffe2b0, 1.03, 1.2)
        : atmosphere(uniforms.sunPos, 0xe8a27a, 1.02, 0.5));
    }
  }

  const polar = info.polarRadius ?? info.radius;
  mesh.scale.set(info.radius, polar, info.radius);
  spin.add(mesh);

  if (info.name === 'Saturno') {
    uniforms = { sunPos: { value: new THREE.Vector3() }, planetPos: { value: new THREE.Vector3() } };
    spin.add(saturnRings(tex, uniforms));
  }
  return { body: b, root, spin, mesh, orientSlot: orientSlot(b), uniforms };
}

function atmosphere(sunPos: THREE.IUniform, color: number, scale: number, intensity: number) {
  const m = new THREE.Mesh(sphere, new THREE.ShaderMaterial({
    uniforms: { sunPos, color: { value: new THREE.Color(color) }, intensity: { value: intensity } },
    vertexShader: atmosphereShader.vertex,
    fragmentShader: atmosphereShader.fragment,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  m.scale.setScalar(scale);
  return m;
}

// Radios de los anillos de Saturno (km): borde interior del anillo C a borde exterior del A.
const RING_INNER = 74_658;
const RING_OUTER = 136_775;

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
