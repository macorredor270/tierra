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
import { detectHardware, initialGraphics, saveGraphics, type Graphics, type HardwareInfo } from './graphics';
import { SmallPool } from './smallPool';
import { createStars } from './stars';
import { createSmallGpu, type SmallGpu } from './smallGpu';
import { MAX_OCCLUDERS, shadowUniforms } from './shadows';
import { pickLevel, texturePath } from './textures';
import { clampToMission, missionPath, missionState } from './spacecraft';

export const AU = 149_597_870.7;
const GM_SUN = 1.32712440018e11; // km³/s²
const ORBIT_POINTS_PLANET = 1024;
const ORBIT_POINTS_MOON = 180;

export interface Layers {
  planets: boolean;
  crafts: boolean;
  dwarfs: boolean;
  moons: boolean;
  orbits: boolean;
  labels: boolean;
  minorMoons: boolean;
  small: boolean[];
}

export interface Stats {
  fps: number;
  frameMs: number;
  smallMs: number;
  threads: number;
  width: number;
  height: number;
  scale: number;
  drawCalls: number;
  triangles: number;
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
  layers: Layers = { planets: true, crafts: true, dwarfs: true, moons: true, orbits: true, labels: true, minorMoons: true, small: [true, true, true, true, true, true] };
  focus = 0;
  readonly hw: HardwareInfo;
  graphics: Graphics;
  stats: Stats = { fps: 0, frameMs: 0, smallMs: 0, threads: 1, width: 0, height: 0, scale: 1, drawCalls: 0, triangles: 0 };

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
  private craftPaths: { body: Body; line: THREE.Line }[] = [];
  /** Velocidad heliocéntrica de cada nave (km/s); NaN si no está activa. */
  private craftSpeed = new Map<number, number>();
  private tmpP = new Float64Array(3);
  private tmpV = new Float64Array(3);
  private lastOrbitRefresh = -Infinity;
  private markers!: THREE.Points;
  private smallPoints!: THREE.Points;
  private labels = new Map<number, HTMLDivElement>();
  private listeners = new Set<(s: Snapshot) => void>();
  private lastEmit = 0;
  private pxPerRad = 1;
  private tmp = new THREE.Vector3();
  private disposed = false;
  private target: THREE.WebGLRenderTarget;
  private pool: SmallPool | null = null;
  private gpuSmall!: SmallGpu;
  private smallActive = 0;
  private stars: THREE.Points | null = null;
  private sky: THREE.Texture;
  private textures: THREE.Texture[] = [];
  /** Factor de la resolución dinámica (1 = sin reducir). */
  private dynScale = 1;
  private lastFrame = 0;
  private frameTimes: number[] = [];
  private statsTimer = 0;

  constructor(canvas: HTMLCanvasElement, private labelsEl: HTMLElement, world: World, manager: THREE.LoadingManager) {
    this.world = world;
    this.solar = world.solar;
    this.bodies = world.bodies;

    // "high-performance" pide al navegador la GPU dedicada en equipos con dos gráficas.
    // El antialiasing lo hace el render target multisample del postprocesado.
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, stencil: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance',
    });
    this.hw = detectHardware(this.renderer.getContext() as WebGL2RenderingContext);
    this.graphics = initialGraphics(this.hw);
    this.renderer.info.autoReset = false;
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.01, 1e12);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.zoomSpeed = 1.4;
    this.controls.rotateSpeed = 0.6;
    this.controls.maxDistance = 400 * AU;

    const load = createTextureLoader(manager, this.renderer);
    const tex = (file: string, srgb = true) => {
      const t = load(file, srgb);
      this.textures.push(t);
      return t;
    };
    // La Vía Láctea queda como brillo difuso; las estrellas son puntos reales del catálogo HYG
    this.sky = tex('2k_stars_milky_way.jpg');
    this.sky.mapping = THREE.EquirectangularReflectionMapping;
    this.scene.background = this.sky;
    this.scene.backgroundIntensity = 0.1;
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
    this.gpuSmall = createSmallGpu(world.smallRecords, world.smallMeta.stride);
    this.scene.add(this.gpuSmall.points, this.gpuSmall.tails);
    this.buildLabels();

    // Sin un render target multisample el postprocesado pierde el antialiasing del canvas
    this.target = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { samples: 4, type: THREE.HalfFloatType });
    this.composer = new EffectComposer(this.renderer, this.target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.6, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.setGraphics(this.graphics);
    createStars(this.renderer.getPixelRatio()).then((st) => {
      if (this.disposed) return;
      this.stars = st;
      this.scene.add(st);
      this.applyStars();
    });

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
    this.pool?.dispose();
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
    // Una nave fuera de su misión: se salta a la fecha válida más cercana
    if (b.mission && !this.craftActive(index)) {
      this.clock.jumpTo(clampToMission(b.mission, this.clock.ms));
      this.update(true);
    }
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

  /** Coloca la cámara en la dirección de otro cuerpo (por defecto el Sol: cara iluminada). */
  viewFrom(index = 0, exact = false): void {
    this.update(true);
    const sun = new THREE.Vector3(...this.p(index)).sub(new THREE.Vector3(...this.p(this.focus))).normalize();
    if (exact) {
      const d = this.flight ? this.flight.toDist : this.camera.position.length();
      this.camera.position.copy(sun.multiplyScalar(d));
      if (this.flight) this.flight.fromDist = d;
      return;
    }
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(sun, up).normalize();
    const dir = sun.multiplyScalar(0.94).addScaledVector(side, 0.25).addScaledVector(up, 0.2).normalize();
    const d = this.flight ? this.flight.toDist : this.camera.position.length();
    this.camera.position.copy(dir.multiplyScalar(d));
    if (this.flight) this.flight.fromDist = d;
  }

  overview(): void {
    this.focusOn(0, 4 * AU);
  }

  /** Aplica los ajustes gráficos en caliente y los guarda. */
  setGraphics(g: Graphics): void {
    const prev = this.graphics;
    this.graphics = g;
    saveGraphics(g);
    if (!g.dynamicResolution) this.dynScale = 1;
    this.applyResolution();
    this.target.samples = Math.min(g.msaa, this.hw.maxSamples);
    this.bloom.enabled = g.bloom;
    this.bloom.strength = g.bloomStrength;
    const aniso = g.anisotropy ? this.renderer.capabilities.getMaxAnisotropy() : 1;
    for (const t of this.textures) {
      if (t.anisotropy !== aniso) { t.anisotropy = aniso; if (t.image) t.needsUpdate = true; }
    }
    this.upgradeTextures(g.textures);
    this.applyStars();
    const active = Math.round(this.solar.small_count() * g.smallDensity);
    this.gpuSmall.setCount(active);
    const cpuMode = !g.smallGpu;
    if (active !== this.smallActive || g.workers !== prev.workers || g.smallGpu !== prev.smallGpu || (cpuMode && g.workers && !this.pool)) {
      this.smallActive = active;
      this.solar.set_small_limit(cpuMode ? active : 0);
      this.smallPoints.geometry.setDrawRange(0, active);
      this.pool?.dispose();
      this.pool = null;
      if (cpuMode && g.workers && this.hw.cores > 1) {
        const threads = Math.max(1, Math.min(this.hw.cores - 1, 8));
        const attr = this.smallPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
        const stride = this.world.smallMeta.stride;
        this.pool = new SmallPool(this.world.smallRecords.subarray(0, active * stride), stride, threads, attr.array as Float32Array);
      }
    }
  }

  private applyResolution(): void {
    const scale = Math.min(this.hw.pixelRatio * this.graphics.renderScale * this.dynScale, 3);
    this.renderer.setPixelRatio(scale);
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setPixelRatio(scale);
    this.composer.setSize(innerWidth, innerHeight);
    this.bloom.resolution.set(innerWidth * scale, innerHeight * scale);
    for (const m of [this.markers.material, this.smallPoints.material, this.stars?.material]) {
      if (m instanceof THREE.ShaderMaterial && m.uniforms.pixelRatio) m.uniforms.pixelRatio.value = scale;
    }
    this.stats.scale = scale;
  }

  private applyStars(): void {
    if (!this.stars) return;
    this.stars.visible = this.graphics.stars;
    (this.stars.material as THREE.ShaderMaterial).uniforms.limit.value = this.graphics.starLimit;
    (this.stars.material as THREE.ShaderMaterial).uniforms.pixelRatio.value = this.renderer.getPixelRatio();
    this.scene.backgroundIntensity = this.graphics.stars ? 0.1 : 0.3;
  }

  /**
   * Sube (o baja) cada cuerpo al nivel de textura pedido. Los cuerpos arrancan en 1K y cambian
   * al nivel alto cuando la imagen ya está descargada y decodificada, sin parones.
   */
  private upgradeTextures(q: number): void {
    const aniso = this.graphics.anisotropy ? this.renderer.capabilities.getMaxAnisotropy() : 1;
    const loader = new THREE.TextureLoader();
    const load = (path: string, srgb: boolean, apply: (t: THREE.Texture) => void, repeat = false) =>
      loader.load(path, (t) => {
        if (this.disposed) return t.dispose();
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        if (repeat) t.wrapS = THREE.RepeatWrapping;
        t.anisotropy = aniso;
        this.textures.push(t);
        apply(t);
      });
    for (const v of this.views.values()) {
      if (!v.texKey) continue;
      const target = pickLevel(v.texKey, q);
      if (target === v.texLevel) continue;
      v.texLevel = target;
      const swap = (old: THREE.Texture | null, t: THREE.Texture, set: (t: THREE.Texture) => void) => {
        if (v.texLevel !== target) return t.dispose();
        set(t);
        if (old) {
          this.textures = this.textures.filter((x) => x !== old);
          old.dispose();
        }
      };
      if (v.texKey === 'earth' && v.uniforms) {
        const u = v.uniforms;
        for (const [uniform, layer, srgb] of [['dayMap', 'day', true], ['nightMap', 'night', true], ['cloudsMap', 'clouds', false]] as const) {
          load(texturePath('earth', target, layer), srgb, (t) => swap(u[uniform].value, t, (x) => (u[uniform].value = x)), layer === 'clouds');
        }
      } else if (v.body.info.kind === 'star' && v.uniforms) {
        const u = v.uniforms;
        load(texturePath(v.texKey, target), true, (t) => swap(u.map.value, t, (x) => (u.map.value = x)));
      } else {
        const mat = v.mesh.material as THREE.MeshStandardMaterial;
        load(texturePath(v.texKey, target), true, (t) => swap(mat.map, t, (x) => { mat.map = x; mat.needsUpdate = true; }));
      }
    }
  }

  /** Filtro por tipo de cuerpo; el cuerpo enfocado siempre se ve. */
  private hidden(b: Body): boolean {
    if (b.index === this.focus) return false;
    const k = b.info.kind;
    if (k === 'planet') return !this.layers.planets;
    if (k === 'dwarf') return !this.layers.dwarfs;
    if (k === 'moon') return b.resolved ? !this.layers.moons : !this.layers.minorMoons;
    if (k === 'craft') return !this.layers.crafts;
    return false;
  }

  // ─────────────────────────── construcción ───────────────────────────

  private craftActive(i: number): boolean {
    return Number.isFinite(this.pos[i * 3]);
  }

  private defaultDistance(b: Body): number {
    if (b.mission) return 4e6;
    if (b.index === 0) return 4 * AU;
    return Math.max(b.info.radius * (b.info.kind === 'moon' ? 6 : 4.5), 30);
  }

  private buildOrbits(): void {
    for (const b of this.bodies) {
      if (b.index === 0) continue;
      if (b.mission) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(missionPath(this.world.fleet, b.mission), 3));
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: b.info.color, transparent: true, opacity: 0.35, depthWrite: false }));
        line.frustumCulled = false;
        this.scene.add(line);
        this.craftPaths.push({ body: b, line });
        continue;
      }
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

  private frame = (now: number): void => {
    if (this.disposed) return;
    const cap = this.graphics.fpsCap;
    if (cap && now - this.lastFrame < 1000 / cap - 1.5) return;
    const interval = now - this.lastFrame;
    this.lastFrame = now;
    const t0 = performance.now();
    this.clock.tick();
    this.update(false);
    this.controls.update();
    this.updateVisibility();
    if (this.stars) this.stars.position.copy(this.camera.position);
    this.renderer.info.reset();
    this.composer.render();
    this.emit(false);
    this.measure(interval, performance.now() - t0);
  };

  /** FPS, tiempo de CPU por frame y resolución dinámica. */
  private measure(interval: number, cpuMs: number): void {
    if (interval > 0 && interval < 10_000) this.frameTimes.push(interval);
    this.stats.frameMs = this.stats.frameMs * 0.9 + cpuMs * 0.1;
    if (performance.now() - this.statsTimer < 1000) return;
    this.statsTimer = performance.now();
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / Math.max(this.frameTimes.length, 1);
    this.frameTimes = [];
    this.stats.fps = avg > 0 ? Math.round((1000 / avg) * 10) / 10 : 0;
    this.stats.threads = this.graphics.smallGpu ? 0 : this.pool?.threads ?? 1;
    this.stats.width = this.renderer.domElement.width;
    this.stats.height = this.renderer.domElement.height;
    this.stats.drawCalls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
    if (this.graphics.dynamicResolution) {
      const goal = (this.graphics.fpsCap || 60) * 0.92;
      const before = this.dynScale;
      if (this.stats.fps < goal) this.dynScale = Math.max(0.7, this.dynScale * 0.9);
      else if (this.stats.fps > goal * 1.05 && this.dynScale < 1) this.dynScale = Math.min(1, this.dynScale * 1.1);
      if (before !== this.dynScale) this.applyResolution();
    }
  }

  private p(i: number): V3 {
    return [this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]];
  }

  private update(force: boolean): void {
    const ms = this.clock.ms;
    const jd = Solar.jd_from_unix_ms(ms);
    this.solar.update(jd);
    const wasmPos = this.solar.positions();
    if (this.pos.length !== this.bodies.length * 3) this.pos = new Float64Array(this.bodies.length * 3);
    this.pos.set(wasmPos);
    const jdTdb = jd + 69.184 / 86400;
    // Efemérides tabuladas (Plutón): se sustituye su posición y se desplazan sus lunas con él
    for (const tr of this.world.fleet.tracks) {
      if (!missionState(this.world.fleet, tr, jdTdb, this.tmpP, this.tmpV)) continue;
      const k = tr.body * 3;
      const dx = this.tmpP[0] - this.pos[k], dy = this.tmpP[1] - this.pos[k + 1], dz = this.tmpP[2] - this.pos[k + 2];
      for (const b of this.bodies) {
        if (b.index !== tr.body && b.parent !== tr.body) continue;
        this.pos[b.index * 3] += dx;
        this.pos[b.index * 3 + 1] += dy;
        this.pos[b.index * 3 + 2] += dz;
      }
    }
    for (let i = this.world.firstCraft; i < this.bodies.length; i++) {
      const m = this.bodies[i].mission!;
      if (missionState(this.world.fleet, m, jdTdb, this.tmpP, this.tmpV)) {
        this.pos.set(this.tmpP, i * 3);
        this.craftSpeed.set(i, Math.hypot(this.tmpV[0], this.tmpV[1], this.tmpV[2]));
      } else {
        this.pos.fill(NaN, i * 3, i * 3 + 3);
        this.craftSpeed.set(i, NaN);
      }
    }

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
      if (v.atmo) {
        const u = v.atmo.uniforms;
        (u.center.value as THREE.Vector3).copy(v.root.position);
        (u.sunPos.value as THREE.Vector3).set(...sun);
        // Desde dentro de la atmósfera se ven las caras interiores de la esfera
        const inside = this.camera.position.distanceTo(v.root.position) < u.atmoR.value;
        (v.atmo.mesh.material as THREE.Material).side = inside ? THREE.BackSide : THREE.FrontSide;
      }
      if (v.uniforms?.planetPos) (v.uniforms.planetPos.value as THREE.Vector3).copy(v.root.position);
      if (v.uniforms?.cloudShift) v.uniforms.cloudShift.value = ((ms / 86_400_000) * 0.02) % 1;
      if (v.uniforms?.time) v.uniforms.time.value = performance.now() / 1000;
    }

    this.updateShadows(sun);

    const now = performance.now();
    if (force || now - this.lastOrbitRefresh > 400) {
      this.lastOrbitRefresh = now;
      this.refreshOrbits();
    }
    for (const { body, line } of this.craftPaths) {
      line.position.set(-fw[0], -fw[1], -fw[2]);
      line.visible = this.layers.crafts && this.layers.orbits;
      (line.material as THREE.LineBasicMaterial).opacity = body.index === this.focus ? 0.8 : 0.3;
    }
    for (const { body, line } of this.orbitLines) {
      const par = body.parent;
      line.position.set(this.pos[par * 3] - fw[0], this.pos[par * 3 + 1] - fw[1], this.pos[par * 3 + 2] - fw[2]);
    }

    const mp = this.markers.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = mp.array as Float32Array;
    for (let i = 0; i < this.bodies.length; i++) {
      // Naves fuera de su misión: sin posición (el marcador ya tiene tamaño 0)
      const ok = Number.isFinite(this.pos[i * 3]);
      arr[i * 3] = ok ? this.pos[i * 3] - fw[0] : 0;
      arr[i * 3 + 1] = ok ? this.pos[i * 3 + 1] - fw[1] : 0;
      arr[i * 3 + 2] = ok ? this.pos[i * 3 + 2] - fw[2] : 0;
    }
    mp.needsUpdate = true;

    const tDays = jd + 69.184 / 86400 - 2451545;
    this.gpuSmall.update(tDays, fw, this.renderer.getPixelRatio(), this.layers.small, this.graphics.cometTails);
    if (this.graphics.smallGpu) {
      this.stats.smallMs = 0;
    } else if (this.layers.small.some(Boolean) && this.smallActive > 0) {
      const sp = this.smallPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
      if (this.pool) {
        // Varios núcleos: el resultado llega relativo a su ancla y se recoloca con una resta en f64
        this.pool.request(jd, [...fw] as V3);
        if (this.pool.fresh) {
          this.pool.fresh = false;
          sp.needsUpdate = true;
          this.stats.smallMs = this.pool.lastMs;
        }
        const a = this.pool.anchor;
        this.smallPoints.position.set(a[0] - fw[0], a[1] - fw[1], a[2] - fw[2]);
      } else {
        const t0 = performance.now();
        this.solar.update_small(fw[0], fw[1], fw[2]);
        const view = new Float32Array(this.world.memory.buffer, this.solar.small_ptr(), this.smallActive * 3);
        (sp.array as Float32Array).set(view);
        sp.needsUpdate = true;
        this.smallPoints.position.set(0, 0, 0);
        this.stats.smallMs = performance.now() - t0;
      }
    }
  }

  /**
   * Ocultadores para las sombras: el sistema del cuerpo enfocado (planeta + sus lunas grandes).
   * Fuera de él las sombras miden menos de un píxel, así que no se calculan.
   */
  private updateShadows(sun: V3): void {
    const u = shadowUniforms;
    u.shEnabled.value = this.graphics.shadows ? 1 : 0;
    u.shSunPos.value.set(...sun);
    const f = this.bodies[this.focus];
    const root = f.info.kind === 'moon' ? f.parent : f.mission ? 0 : f.index;
    const list: Body[] = [];
    if (root !== 0) {
      list.push(this.bodies[root]);
      const moons = this.bodies
        .filter((b) => b.parent === root && b.info.kind === 'moon' && b.resolved)
        .sort((a, b) => b.info.radius - a.info.radius);
      list.push(...moons.slice(0, MAX_OCCLUDERS - 1));
    }
    const fw = this.focusWorld;
    list.forEach((b, k) => {
      const i = b.index;
      u.shOcc.value[k].set(this.pos[i * 3] - fw[0], this.pos[i * 3 + 1] - fw[1], this.pos[i * 3 + 2] - fw[2], b.info.radius);
      u.shOccId.value[k] = i;
      // Luz refractada por la atmósfera: la Luna se ve roja dentro de la sombra de la Tierra
      u.shOccAtmo.value[k] = i === 3 ? 0.09 : b.jplName === 'Titan' ? 0.03 : 0;
    });
    u.shOccCount.value = list.length;

    const saturn = this.views.get(6);
    if (saturn?.ringShadow) {
      const r = saturn.ringShadow.uniforms;
      r.ringCenter.value.copy(saturn.root.position);
      // El plano de los anillos es el ecuador: su normal es el eje y local del planeta
      r.ringNormal.value.setFromMatrixColumn(saturn.spin.matrix, 1).normalize();
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
      show[i] = visible && Number.isFinite(d);
      const base = b.info.kind === 'star' ? 9 : b.info.kind === 'planet' ? 6 : b.info.kind === 'dwarf' || b.mission ? 5 : b.resolved ? 4 : 2.5;
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
    const anySmall = this.layers.small.some(Boolean);
    this.smallPoints.visible = anySmall && !this.graphics.smallGpu;
    this.gpuSmall.points.visible = anySmall && this.graphics.smallGpu;
  }

  // ─────────────────────────── estado para la UI ───────────────────────────

  private snapshot(): Snapshot {
    const i = this.focus;
    const p = this.pos.length ? this.p(i) : ([0, 0, 0] as V3);
    const e = this.pos.length ? this.p(3) : ([0, 0, 0] as V3);
    const r = Math.hypot(...p);
    const b = this.bodies[i];
    // Velocidad heliocéntrica por la ecuación vis-viva (planetas y enanos)
    const speedKms = b.mission
      ? this.craftSpeed.get(i) ?? NaN
      : b.parent === 0 && b.semiMajorKm > 0 ? Math.sqrt(GM_SUN * (2 / r - 1 / b.semiMajorKm)) : NaN;
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
    this.applyResolution();
  };
}
