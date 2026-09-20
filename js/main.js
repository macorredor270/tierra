import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  earthVertex, earthFragment,
  atmosphereVertex, atmosphereFragment,
  cloudsVertex, cloudsFragment,
} from './shaders.js';

// ============ Configuración ============
const TEX_BASE = 'textures/';
const EARTH_RADIUS = 1;
const CLOUDS_RADIUS = 1.006;
const ATMOSPHERE_RADIUS = 1.045;

const settings = {
  rotationSpeed: 1.0,   // multiplicador
  cloudsSpeed: 1.3,
  sunAuto: true,
  sunAngle: 0,          // grados, usado cuando sunAuto = false
  atmosphereIntensity: 0.7,
  bloomStrength: 0.15,
  cloudsVisible: true,
  starsVisible: true,
  atmosphereVisible: true,
};

// ============ Renderer ============
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0.6, 3.2);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.rotateSpeed = 0.5;
controls.minDistance = 1.35;
controls.maxDistance = 12;
controls.enablePan = false;

// ============ Carga de texturas ============
const loadingManager = new THREE.LoadingManager();
const texLoader = new THREE.TextureLoader(loadingManager);
texLoader.setCrossOrigin('anonymous');

const loaderEl = document.getElementById('loader');
const progressEl = document.getElementById('loader-progress');
const statusEl = document.getElementById('loader-status');

loadingManager.onProgress = (url, loaded, total) => {
  progressEl.style.width = `${(loaded / total) * 100}%`;
  statusEl.textContent = `Cargando texturas… ${loaded}/${total}`;
};
loadingManager.onLoad = () => {
  statusEl.textContent = 'Listo';
  setTimeout(() => loaderEl.classList.add('hidden'), 400);
};
loadingManager.onError = (url) => {
  statusEl.textContent = `Error cargando: ${url.split('/').pop()}`;
};

function loadColorTexture(file) {
  const tex = texLoader.load(TEX_BASE + file);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}
function loadDataTexture(file) {
  const tex = texLoader.load(TEX_BASE + file);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

const dayMap = loadColorTexture('earth-day-4k.jpg');
const nightMap = loadColorTexture('earth-night.png');
const waterMap = loadDataTexture('earth-water.png');
const bumpMap = loadDataTexture('earth-topology.png');
const cloudsMap = loadDataTexture('clouds-4k.png');

// ============ Sol (dirección de luz compartida) ============
const sunDirection = new THREE.Vector3(1, 0.25, 0.5).normalize();

// ============ Tierra ============
const earthGeometry = new THREE.SphereGeometry(EARTH_RADIUS, 96, 96);

const earthMaterial = new THREE.ShaderMaterial({
  vertexShader: earthVertex,
  fragmentShader: earthFragment,
  uniforms: {
    dayMap: { value: dayMap },
    nightMap: { value: nightMap },
    waterMap: { value: waterMap },
    bumpMap: { value: bumpMap },
    sunDirection: { value: sunDirection },
    cameraPos: { value: camera.position },
    atmosphereIntensity: { value: settings.atmosphereIntensity },
  },
});

const earth = new THREE.Mesh(earthGeometry, earthMaterial);
scene.add(earth);

// ============ Nubes ============
const cloudsMaterial = new THREE.ShaderMaterial({
  vertexShader: cloudsVertex,
  fragmentShader: cloudsFragment,
  uniforms: {
    cloudsMap: { value: cloudsMap },
    sunDirection: { value: sunDirection },
    opacity: { value: 0.85 },
  },
  transparent: true,
  depthWrite: false,
});

const clouds = new THREE.Mesh(new THREE.SphereGeometry(CLOUDS_RADIUS, 96, 96), cloudsMaterial);
scene.add(clouds);

// ============ Atmósfera (halo exterior) ============
const atmosphereMaterial = new THREE.ShaderMaterial({
  vertexShader: atmosphereVertex,
  fragmentShader: atmosphereFragment,
  uniforms: {
    sunDirection: { value: sunDirection },
    cameraPos: { value: camera.position },
    intensity: { value: settings.atmosphereIntensity },
  },
  side: THREE.BackSide,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(ATMOSPHERE_RADIUS, 64, 64), atmosphereMaterial);
scene.add(atmosphere);

// ============ Estrellas ============
function createStars(count = 4000) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    // Distribución uniforme en esfera lejana
    const r = 40 + Math.random() * 30;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    // Variación sutil de color: blancas, azuladas, amarillentas
    const t = Math.random();
    if (t < 0.7) color.setHSL(0.6, 0.1, 0.7 + Math.random() * 0.3);
    else if (t < 0.9) color.setHSL(0.58, 0.5, 0.75);
    else color.setHSL(0.12, 0.4, 0.8);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;

    sizes[i] = 0.5 + Math.random() * 1.5;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.PointsMaterial({
    size: 0.12,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: true,
    depthWrite: false,
  });

  return new THREE.Points(geometry, material);
}

const stars = createStars();
scene.add(stars);

// ============ Post-procesado ============
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  settings.bloomStrength, // strength
  0.5,                    // radius
  0.92                    // threshold alto: solo brilla lo más luminoso
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// ============ UI ============
const $ = (id) => document.getElementById(id);

function bindSlider(id, valueId, format, onChange) {
  const input = $(id);
  const label = $(valueId);
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    label.textContent = format(v);
    onChange(v);
  });
}

bindSlider('ctl-rotation', 'val-rotation', (v) => `${v.toFixed(1)}×`, (v) => {
  settings.rotationSpeed = v;
});
bindSlider('ctl-clouds-speed', 'val-clouds-speed', (v) => `${v.toFixed(1)}×`, (v) => {
  settings.cloudsSpeed = v;
});
bindSlider('ctl-atmo', 'val-atmo', (v) => v.toFixed(2), (v) => {
  settings.atmosphereIntensity = v;
  earthMaterial.uniforms.atmosphereIntensity.value = v;
  atmosphereMaterial.uniforms.intensity.value = v;
});
bindSlider('ctl-bloom', 'val-bloom', (v) => v.toFixed(2), (v) => {
  bloomPass.strength = v;
});
bindSlider('ctl-sun', 'val-sun', (v) => `${v.toFixed(0)}°`, (v) => {
  settings.sunAngle = v;
  settings.sunAuto = false;
  $('ctl-sun-auto').checked = false;
});

$('ctl-sun-auto').addEventListener('change', (e) => {
  settings.sunAuto = e.target.checked;
  $('val-sun').textContent = settings.sunAuto ? 'auto' : `${settings.sunAngle.toFixed(0)}°`;
});

$('ctl-clouds').addEventListener('change', (e) => { clouds.visible = e.target.checked; });
$('ctl-stars').addEventListener('change', (e) => { stars.visible = e.target.checked; });
$('ctl-atmosphere').addEventListener('change', (e) => { atmosphere.visible = e.target.checked; });

$('btn-reset').addEventListener('click', () => {
  camera.position.set(0, 0.6, 3.2);
  controls.target.set(0, 0, 0);
});

$('panel-toggle').addEventListener('click', () => {
  $('panel').classList.toggle('open');
});

// ============ FPS ============
const fpsEl = $('fps');
let frameCount = 0;
let fpsTime = 0;

// ============ Resize ============
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ============ Bucle de render ============
const clock = new THREE.Clock();
let sunAutoAngle = 0;

// Velocidad base: una vuelta de la Tierra cada ~120 s a 1×
const EARTH_ROT_SPEED = (Math.PI * 2) / 120;
const SUN_ORBIT_SPEED = (Math.PI * 2) / 300; // órbita solar completa cada 5 min

function animate() {
  const dt = Math.min(clock.getDelta(), 0.1);

  earth.rotation.y += EARTH_ROT_SPEED * settings.rotationSpeed * dt;
  clouds.rotation.y += EARTH_ROT_SPEED * settings.cloudsSpeed * dt;

  if (settings.sunAuto) {
    sunAutoAngle += SUN_ORBIT_SPEED * dt;
    sunDirection.set(Math.cos(sunAutoAngle), 0.25, Math.sin(sunAutoAngle)).normalize();
  } else {
    const rad = THREE.MathUtils.degToRad(settings.sunAngle);
    sunDirection.set(Math.cos(rad), 0.25, Math.sin(rad)).normalize();
  }

  controls.update();
  composer.render();

  // FPS (actualizado cada 0.5 s)
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
