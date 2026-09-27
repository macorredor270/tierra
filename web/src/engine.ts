import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Solar } from './wasm/astro_wasm.js';
import type { Body, World } from './data';
import { createBodyView, createTextureLoader, type BodyView } from './bodies';
import { Clock } from './clock';
import { pointsShader, smallShader } from './shaders';
import { SMALL_CLASS_COLORS } from './catalog';

export const AU = 149_597_870.7;
const GM_SUN = 1.32712440018e11; // km³/s²
const ORBIT_POINTS_PLANET = 1024;
const ORBIT_POINTS_MOON = 180;

export interface Layers {
  planets: boolean;
  dwarfs: boolean;
  moons: boolean;
  orbits: boolean;
  labels: boolean;
  minorMoons: boolean;
  small: boolean[];
}

export interface Snapshot {
  ms: number;
  mode: 'real' | 'sim';
  speed: number;
  direction: 1 | -1;
  paused: boolean;
  focus: number;
  distSunKm: number;
  distEarthKm: number;
  speedKms: number;
}

type V3 = [number, number, number];

interface Flight {
  start: number;
  duration: number;
  from: V3;
  to: number;
  fromDist: number;
  toDist: number;
}

export class Engine {
  readonly clock = new Clock();
  readonly bodies: Body[];
  layers: Layers = { planets: true, dwarfs: true, moons: true, orbits: true, labels: true, minorMoons: true, small: [true, true, true, true, true, true] };
  focus = 0;

  private solar: Solar;
  private world: World;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private views = new Map<number, BodyView>();
  private sunLight = new THREE.PointLight(0xfff4e8, 3.2, 0, 0);
  private focusWorld: V3 = [0, 0, 0];
  private pos: Float64Array = new Float64Array(0);
  private flight: Flight | null = null;
  private orbitLines: { body: Body; line: THREE.LineLoop }[] = [];
  private lastOrbitRefresh = -Infinity;
  private markers!: THREE.Points;
  private smallPoints!: THREE.Points;
  private labels = new Map<number, HTMLDivElement>();
  private listeners = new Set<(s: Snapshot) => void>();
  private lastEmit = 0;
  private pxPerRad = 1;
  private tmp = new THREE.Vector3();
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, private labelsEl: HTMLElement, world: World, manager: THREE.LoadingManager) {
    this.world = world;
    this.solar = world.solar;
    this.bodies = world.bodies;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.01, 1e12);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.zoomSpeed = 1.4;
    this.controls.rotateSpeed = 0.6;
    this.controls.maxDistance = 400 * AU;

    const tex = createTextureLoader(manager, this.renderer);
    const sky = tex('2k_stars_milky_way.jpg');
    sky.mapping = THREE.EquirectangularReflectionMapping;
    this.scene.background = sky;
    this.scene.backgroundIntensity = 0.28;
    // El mapa estelar está en coordenadas ecuatoriales; la escena, en la eclíptica
    this.scene.backgroundRotation.set(THREE.MathUtils.degToRad(23.4393), 0, 0);
    this.scene.add(new THREE.AmbientLight(0x223047, 0.18));
    this.scene.add(this.sunLight);

    for (const b of this.bodies) {
      if (!b.resolved) continue;
      const v = createBodyView(b, tex);
      v.spin.matrixAutoUpdate = false;
      this.views.set(b.index, v);
      this.scene.add(v.root);
    }
    this.buildOrbits();
    this.buildMarkers();
    this.buildSmallBodies();
    this.buildLabels();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.6, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.update(true);
    this.camera.position.set(0, 1.4 * AU, 3.2 * AU);
    this.focusOn(0, 3.5 * AU, false);

    addEventListener('resize', this.onResize);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    this.renderer.setAnimationLoop(this.frame);
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }

  subscribe(fn: (s: Snapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  /** Viaja al cuerpo y lo sigue. */
  focusOn(index: number, distance?: number, animate = true): void {
    const b = this.bodies[index];
    const target = distance ?? this.defaultDistance(b);
    const fromDist = this.camera.position.length();
    this.flight = {
      start: performance.now(),
      duration: animate ? 2400 : 0,
      from: [...this.focusWorld] as V3,
      to: index,
      fromDist,
      toDist: target,
    };
    this.focus = index;
    this.controls.minDistance = b.info.radius * 1.08;
    this.emit(true);
  }

  overview(): void {
    this.focusOn(0, 4 * AU);
  }

  /** Filtro por tipo de cuerpo; el cuerpo enfocado siempre se ve. */
  private hidden(b: Body): boolean {
    if (b.index === this.focus) return false;
    const k = b.info.kind;
    if (k === 'planet') return !this.layers.planets;
    if (k === 'dwarf') return !this.layers.dwarfs;
    if (k === 'moon') return b.resolved ? !this.layers.moons : !this.layers.minorMoons;
    return false;
  }

  // ─────────────────────────── construcción ───────────────────────────

  private defaultDistance(b: Body): number {
    if (b.index === 0) return 4 * AU;
    return Math.max(b.info.radius * (b.info.kind === 'moon' ? 6 : 4.5), 30);
  }

  private buildOrbits(): void {
    for (const b of this.bodies) {
      if (b.index === 0) continue;
      const n = b.info.kind === 'moon' ? ORBIT_POINTS_MOON : ORBIT_POINTS_PLANET;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const color = new THREE.Color(b.info.kind === 'moon' ? 0x8fa3c8 : b.info.color).lerp(new THREE.Color(0x9fb4e6), 0.35);
      const line = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false }));
      line.frustumCulled = false;
      this.scene.add(line);
      this.orbitLines.push({ body: b, line });
    }
  }

  private refreshOrbits(): void {
    for (const { body, line } of this.orbitLines) {
      if (!line.visible) continue;
      const n = body.info.kind === 'moon' ? ORBIT_POINTS_MOON : ORBIT_POINTS_PLANET;
      const pts = this.solar.orbit(body.index, n);
      const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
      (attr.array as Float32Array).set(pts);
      attr.needsUpdate = true;
      line.geometry.computeBoundingSphere();
    }
  }

  private buildMarkers(): void {
    const n = this.bodies.length;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n), 1));
    const colors = new Float32Array(n * 3);
    this.bodies.forEach((b, i) => new THREE.Color(b.info.color).toArray(colors, i * 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.markers = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: { pixelRatio: { value: this.renderer.getPixelRatio() } },
      vertexShader: pointsShader.vertex,
      fragmentShader: pointsShader.fragment,
      transparent: true,
      depthWrite: false,
    }));
    this.markers.frustumCulled = false;
    this.scene.add(this.markers);
  }

  private buildSmallBodies(): void {
    const count = this.solar.small_count();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('cls', new THREE.BufferAttribute(Float32Array.from(this.world.smallClass), 1));
    this.smallPoints = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: {
        pixelRatio: { value: this.renderer.getPixelRatio() },
        visible: { value: this.layers.small.map(Number) },
        colors: { value: SMALL_CLASS_COLORS.map((c) => new THREE.Color(c)) },
      },
      vertexShader: smallShader.vertex,
      fragmentShader: smallShader.fragment,
      transparent: true,
      depthWrite: false,
    }));
    this.smallPoints.frustumCulled = false;
    this.scene.add(this.smallPoints);
  }

  private buildLabels(): void {
    for (const b of this.bodies) {
      if (b.info.kind === 'moon' && !b.resolved && !b.jplName) continue;
      const el = document.createElement('div');
      el.className = `label ${b.info.kind}${b.resolved ? '' : ' minor'}`;
      el.textContent = b.info.name;
      el.style.setProperty('--c', '#' + new THREE.Color(b.info.color).getHexString());
      el.addEventListener('click', () => this.focusOn(b.index));
      this.labelsEl.appendChild(el);
      this.labels.set(b.index, el);
    }
  }

  // ─────────────────────────── bucle ───────────────────────────

  private frame = (): void => {
    if (this.disposed) return;
    this.clock.tick();
    this.update(false);
    this.controls.update();
    this.updateVisibility();
    this.composer.render();
    this.emit(false);
  };

  private p(i: number): V3 {
    return [this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]];
  }

  private update(force: boolean): void {
    const ms = this.clock.ms;
    const jd = Solar.jd_from_unix_ms(ms);
    this.solar.update(jd);
    this.pos = this.solar.positions();

    // Vuelo: el foco se desliza del punto de partida al cuerpo (que sigue moviéndose) y la
    // distancia se interpola en escala logarítmica.
    const f = this.flight;
    const target = this.p(this.focus);
    if (f) {
      const t = f.duration ? Math.min((performance.now() - f.start) / f.duration, 1) : 1;
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.focusWorld = [0, 1, 2].map((k) => f.from[k] + (target[k] - f.from[k]) * e) as V3;
      const d = Math.exp(Math.log(f.fromDist) + (Math.log(f.toDist) - Math.log(f.fromDist)) * e);
      this.camera.position.setLength(d);
      if (t >= 1) this.flight = null;
    } else {
      this.focusWorld = target;
    }

    const fw = this.focusWorld;
    const sun: V3 = [-fw[0], -fw[1], -fw[2]];
    this.sunLight.position.set(...sun);
    const orient = this.solar.orientations();
    const m4 = new THREE.Matrix4();
    for (const v of this.views.values()) {
      const i = v.body.index;
      v.root.position.set(this.pos[i * 3] - fw[0], this.pos[i * 3 + 1] - fw[1], this.pos[i * 3 + 2] - fw[2]);
      if (v.orientSlot >= 0) {
        const o = v.orientSlot * 9;
        m4.set(orient[o], orient[o + 3], orient[o + 6], 0, orient[o + 1], orient[o + 4], orient[o + 7], 0, orient[o + 2], orient[o + 5], orient[o + 8], 0, 0, 0, 0, 1);
        v.spin.matrix.copy(m4);
      } else if (v.body.parent) {
        // Lunas sin datos IAU: acoplamiento de marea, la misma cara mira siempre al planeta
        const par = v.body.parent;
        this.tmp.set(this.pos[par * 3] - this.pos[i * 3], this.pos[par * 3 + 1] - this.pos[i * 3 + 1], this.pos[par * 3 + 2] - this.pos[i * 3 + 2]).normalize();
        const x = this.tmp.clone();
        const z = new THREE.Vector3(0, 1, 0).cross(x).normalize();
        const y = x.clone().cross(z);
        v.spin.matrix.makeBasis(x, y, z.negate());
      }
      if (v.uniforms?.sunPos) (v.uniforms.sunPos.value as THREE.Vector3).set(...sun);
      if (v.uniforms?.planetPos) (v.uniforms.planetPos.value as THREE.Vector3).copy(v.root.position);
      if (v.uniforms?.cloudShift) v.uniforms.cloudShift.value = ((ms / 86_400_000) * 0.02) % 1;
      if (v.uniforms?.time) v.uniforms.time.value = performance.now() / 1000;
    }

    const now = performance.now();
    if (force || now - this.lastOrbitRefresh > 400) {
      this.lastOrbitRefresh = now;
      this.refreshOrbits();
    }
    for (const { body, line } of this.orbitLines) {
      const par = body.parent;
      line.position.set(this.pos[par * 3] - fw[0], this.pos[par * 3 + 1] - fw[1], this.pos[par * 3 + 2] - fw[2]);
    }

    const mp = this.markers.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = mp.array as Float32Array;
    for (let i = 0; i < this.bodies.length; i++) {
      arr[i * 3] = this.pos[i * 3] - fw[0];
      arr[i * 3 + 1] = this.pos[i * 3 + 1] - fw[1];
      arr[i * 3 + 2] = this.pos[i * 3 + 2] - fw[2];
    }
    mp.needsUpdate = true;

    if (this.layers.small.some(Boolean)) {
      this.solar.update_small(fw[0], fw[1], fw[2]);
      const view = new Float32Array(this.world.memory.buffer, this.solar.small_ptr(), this.solar.small_count() * 3);
      const sp = this.smallPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
      (sp.array as Float32Array).set(view);
      sp.needsUpdate = true;
    }
  }

  /** Decide qué se ve según el tamaño aparente en pantalla: nada de listas fijas por escala. */
  private updateVisibility(): void {
    const cam = this.camera.position;
    this.pxPerRad = innerHeight / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const fw = this.focusWorld;
    const dist = (i: number) => Math.hypot(this.pos[i * 3] - fw[0] - cam.x, this.pos[i * 3 + 1] - fw[1] - cam.y, this.pos[i * 3 + 2] - fw[2] - cam.z);
    const sep = (i: number, j: number) => Math.hypot(this.pos[i * 3] - this.pos[j * 3], this.pos[i * 3 + 1] - this.pos[j * 3 + 1], this.pos[i * 3 + 2] - this.pos[j * 3 + 2]);

    const sizes = this.markers.geometry.getAttribute('size') as THREE.BufferAttribute;
    const show: boolean[] = [];
    for (const b of this.bodies) {
      const i = b.index;
      const d = dist(i);
      const apparent = (b.info.radius / d) * this.pxPerRad;
      // Una luna se distingue de su planeta si su separación en pantalla supera unos píxeles
      const parentSep = b.parent || b.info.kind === 'moon' ? (sep(i, b.parent) / dist(b.parent)) * this.pxPerRad : Infinity;
      const minorHidden = this.hidden(b);
      const visible = !minorHidden && (parentSep > 10 || i === this.focus);
      show[i] = visible;
      const base = b.info.kind === 'star' ? 9 : b.info.kind === 'planet' ? 6 : b.info.kind === 'dwarf' ? 5 : b.resolved ? 4 : 2.5;
      sizes.setX(i, visible && apparent < 2.5 ? base : 0);
      const v = this.views.get(i);
      if (v) v.root.visible = !minorHidden && apparent > 0.3;
    }
    sizes.needsUpdate = true;

    for (const { body, line } of this.orbitLines) {
      const orbitPx = (body.semiMajorKm / dist(body.parent)) * this.pxPerRad;
      // Las lunas menores (cientos de irregulares) solo muestran órbita si están enfocadas
      const minorHidden = this.hidden(body) || (body.info.kind === 'moon' && !body.resolved && body.index !== this.focus);
      const fadeIn = THREE.MathUtils.smoothstep(orbitPx, 14, 60);
      // Cerca de una órbita enorme solo se ve un tramo casi recto: mejor ocultarla
      const fadeOut = 1 - THREE.MathUtils.smoothstep(orbitPx, 6e3, 2.5e4);
      const base = body.info.kind === 'moon' ? (body.resolved ? 0.4 : 0.16) : 0.55;
      const op = base * fadeIn * fadeOut * (body.index === this.focus ? 1.4 : 1);
      line.visible = this.layers.orbits && !minorHidden && op > 0.01;
      (line.material as THREE.LineBasicMaterial).opacity = op;
    }

    // Etiquetas: proyección a pantalla
    const w = innerWidth, h = innerHeight;
    for (const [i, el] of this.labels) {
      const b = this.bodies[i];
      let visible = this.layers.labels && show[i];
      if (visible && b.info.kind === 'moon') {
        const parentSepPx = (sep(i, b.parent) / dist(b.parent)) * this.pxPerRad;
        // Las lunas menores (cientos) solo se etiquetan al enfocarlas
        visible = i === this.focus || (b.resolved && parentSepPx > 28);
      }
      if (visible) {
        this.tmp.set(this.pos[i * 3] - fw[0], this.pos[i * 3 + 1] - fw[1], this.pos[i * 3 + 2] - fw[2]).project(this.camera);
        if (this.tmp.z > 1 || Math.abs(this.tmp.x) > 1.1 || Math.abs(this.tmp.y) > 1.1) visible = false;
        else {
          const apparent = (b.info.radius / dist(i)) * this.pxPerRad;
          const x = (this.tmp.x * 0.5 + 0.5) * w + Math.max(apparent * 0.7, 4);
          const y = (-this.tmp.y * 0.5 + 0.5) * h - 8;
          el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        }
      }
      el.style.visibility = visible ? 'visible' : 'hidden';
    }

    (this.smallPoints.material as THREE.ShaderMaterial).uniforms.visible.value = this.layers.small.map(Number);
    this.smallPoints.visible = this.layers.small.some(Boolean);
  }

  // ─────────────────────────── estado para la UI ───────────────────────────

  private snapshot(): Snapshot {
    const i = this.focus;
    const p = this.pos.length ? this.p(i) : ([0, 0, 0] as V3);
    const e = this.pos.length ? this.p(3) : ([0, 0, 0] as V3);
    const r = Math.hypot(...p);
    const b = this.bodies[i];
    // Velocidad heliocéntrica por la ecuación vis-viva (planetas y enanos)
    const speedKms = b.parent === 0 && b.semiMajorKm > 0 ? Math.sqrt(GM_SUN * (2 / r - 1 / b.semiMajorKm)) : NaN;
    return {
      ms: this.clock.ms,
      mode: this.clock.mode,
      speed: this.clock.speed,
      direction: this.clock.direction,
      paused: this.clock.paused,
      focus: i,
      distSunKm: r,
      distEarthKm: Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2]),
      speedKms,
    };
  }

  private emit(force: boolean): void {
    const now = performance.now();
    if (!force && now - this.lastEmit < 100) return;
    this.lastEmit = now;
    const s = this.snapshot();
    for (const fn of this.listeners) fn(s);
  }

  // ─────────────────────────── entrada ───────────────────────────

  private down = { x: 0, y: 0 };

  private onPointerDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY };
  };

  /** Clic sin arrastrar: el cuerpo visible más cercano al puntero (≤ 16 px) o su esfera. */
  private onPointerUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5) return;
    const fw = this.focusWorld;
    let best = -1, bestD = 16;
    for (const b of this.bodies) {
      const i = b.index;
      const sizes = this.markers.geometry.getAttribute('size') as THREE.BufferAttribute;
      const v = this.views.get(i);
      if (sizes.getX(i) === 0 && !(v && v.root.visible)) continue;
      this.tmp.set(this.pos[i * 3] - fw[0], this.pos[i * 3 + 1] - fw[1], this.pos[i * 3 + 2] - fw[2]);
      const dist = this.tmp.distanceTo(this.camera.position);
      this.tmp.project(this.camera);
      if (this.tmp.z > 1) continue;
      const x = (this.tmp.x * 0.5 + 0.5) * innerWidth, y = (-this.tmp.y * 0.5 + 0.5) * innerHeight;
      const apparent = (b.info.radius / dist) * this.pxPerRad;
      const d = Math.hypot(x - e.clientX, y - e.clientY) - apparent;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0 && best !== this.focus) this.focusOn(best);
  };

  private onResize = () => {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
    this.bloom.resolution.set(innerWidth, innerHeight);
  };
}
