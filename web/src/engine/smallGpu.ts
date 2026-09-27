// Cuerpos pequeños propagados en la GPU: cada vértice resuelve la ecuación de Kepler en el
// vertex shader. Los elementos orbitales se suben una vez; por frame solo cambian dos uniforms
// (el tiempo y el foco), así que la CPU no hace ningún trabajo por asteroide.
//
// Los cometas añaden una cola: un cuadrilátero orientado en dirección opuesta al Sol cuya
// longitud crece al acercarse al perihelio (la sublimación empieza hacia 3–5 au).
import * as THREE from 'three';
import { SMALL_CLASS_COLORS } from '../data/catalog';

const KEPLER_GLSL = /* glsl */ `
  const float GAUSS_K = 0.01720209895;
  const float AU_KM = 149597870.7;
  const float TAU = 6.28318530718;
  uniform float tHigh;   // días desde J2000 (parte gruesa, múltiplo de 1024)
  uniform float tLow;    // resto: tHigh + tLow = tiempo actual
  uniform vec3 focus;    // posición heliocéntrica del foco (km, escena)

  // el0 = (a[au], e, i, Ω) · el1 = (ω, M0, época − J2000 [días], clase), ángulos en grados
  vec3 keplerScene(vec4 el0, vec4 el1) {
    float a = el0.x, e = el0.y;
    float n = GAUSS_K / (a * sqrt(a));
    float dt = (tHigh - el1.z) + tLow;
    float M = mod(radians(el1.y) + n * dt, TAU);
    if (M > 3.14159265) M -= TAU;
    float E = e > 0.8 ? 3.14159265 * sign(M) : M + e * sin(M);
    for (int k = 0; k < 12; k++) {
      float d = (E - e * sin(E) - M) / (1.0 - e * cos(E));
      E -= d;
      if (abs(d) < 1e-6) break;
    }
    float x = a * (cos(E) - e), y = a * sqrt(1.0 - e * e) * sin(E);
    float i = radians(el0.z), O = radians(el0.w), w = radians(el1.x);
    float co = cos(w), so = sin(w), cO = cos(O), sO = sin(O), ci = cos(i), si = sin(i);
    vec3 ecl = vec3(
      (co * cO - so * sO * ci) * x + (-so * cO - co * sO * ci) * y,
      (co * sO + so * cO * ci) * x + (-so * sO + co * cO * ci) * y,
      (so * si) * x + (co * si) * y) * AU_KM;
    // eclíptica → escena (x, z, −y), relativa al foco
    return vec3(ecl.x, ecl.z, -ecl.y) - focus;
  }
`;

const pointsVS = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  ${KEPLER_GLSL}
  attribute vec4 el0;
  attribute vec4 el1;
  uniform float visible[6];
  uniform vec3 colors[6];
  uniform float pixelRatio;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    int k = int(el1.w + 0.5);
    vColor = colors[k];
    vAlpha = visible[k];
    vec4 mv = modelViewMatrix * vec4(keplerScene(el0, el1), 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = ((k == 5 ? 3.0 : 1.8) + 1.0) * pixelRatio * visible[k];
    #include <logdepthbuf_vertex>
  }
`;

const pointsFS = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    #include <logdepthbuf_fragment>
    if (vAlpha < 0.5) discard;
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = 1.0 - smoothstep(0.35, 1.0, r);
    if (a <= 0.01) discard;
    gl_FragColor = vec4(vColor, a * 0.55);
    #include <colorspace_fragment>
  }
`;

const tailVS = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  ${KEPLER_GLSL}
  attribute vec4 el0;
  attribute vec4 el1;
  attribute vec2 corner;     // x: 0 (cabeza) → 1 (punta) · y: −1..1 (ancho)
  uniform float enabled;
  varying vec2 vUv;
  varying float vFade;
  void main() {
    vec3 p = keplerScene(el0, el1);
    vec3 helio = p + focus;
    float r = length(helio) / AU_KM;
    // Longitud aproximada de la cola de iones: decenas de millones de km cerca del Sol
    float activity = clamp(1.0 - (r - 0.3) / 4.5, 0.0, 1.0);
    float len = 2.5e7 * activity * activity / max(r, 0.25);
    vec3 dir = normalize(helio);
    vec3 view = normalize(p - cameraPosition);
    vec3 side = normalize(cross(dir, view));
    float width = len * 0.045 * (0.25 + corner.x);
    vec3 pos = p + dir * len * corner.x + side * width * corner.y;
    vUv = corner;
    vFade = activity * enabled;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(pos, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const tailFS = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  varying vec2 vUv;
  varying float vFade;
  void main() {
    #include <logdepthbuf_fragment>
    if (vFade <= 0.001) discard;
    float along = pow(1.0 - vUv.x, 1.6);
    float across = 1.0 - smoothstep(0.0, 1.0, abs(vUv.y));
    vec3 ion = vec3(0.45, 0.7, 1.0);
    vec3 dust = vec3(1.0, 0.92, 0.75);
    vec3 c = mix(dust, ion, smoothstep(0.0, 0.6, vUv.x));
    float a = along * across * vFade * 0.55;
    gl_FragColor = vec4(c * a, a);
  }
`;

export interface SmallGpu {
  points: THREE.Points;
  tails: THREE.Mesh;
  update(tDays: number, focus: [number, number, number], pixelRatio: number, visible: boolean[], cometsTails: boolean): void;
  setCount(n: number): void;
}

export function createSmallGpu(records: Float32Array, stride: number): SmallGpu {
  const n = records.length / stride;
  const el0 = new Float32Array(n * 4);
  const el1 = new Float32Array(n * 4);
  const comets: number[] = [];
  for (let k = 0; k < n; k++) {
    const r = records.subarray(k * stride, k * stride + stride);
    el0.set([r[0], r[1], r[2], r[3]], k * 4);
    el1.set([r[4], r[5], r[6], r[8]], k * 4);
    if (r[8] === 5) comets.push(k);
  }
  const uniforms = {
    tHigh: { value: 0 },
    tLow: { value: 0 },
    focus: { value: new THREE.Vector3() },
    pixelRatio: { value: 1 },
    visible: { value: [1, 1, 1, 1, 1, 1] },
    colors: { value: SMALL_CLASS_COLORS.map((c) => new THREE.Color(c)) },
    enabled: { value: 1 },
  };

  const geo = new THREE.BufferGeometry();
  // "position" solo para el recuento; la posición real sale del shader
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('el0', new THREE.BufferAttribute(el0, 4));
  geo.setAttribute('el1', new THREE.BufferAttribute(el1, 4));
  const points = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: pointsVS,
      fragmentShader: pointsFS,
      transparent: true,
      depthWrite: false,
    }),
  );
  points.frustumCulled = false;

  // Colas: un cuadrilátero instanciado por cometa
  const tailGeo = new THREE.InstancedBufferGeometry();
  tailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  tailGeo.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([0, -1, 1, -1, 1, 1, 0, 1]), 2));
  tailGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const c0 = new Float32Array(comets.length * 4),
    c1 = new Float32Array(comets.length * 4);
  comets.forEach((k, j) => {
    c0.set(el0.subarray(k * 4, k * 4 + 4), j * 4);
    c1.set(el1.subarray(k * 4, k * 4 + 4), j * 4);
  });
  tailGeo.setAttribute('el0', new THREE.InstancedBufferAttribute(c0, 4));
  tailGeo.setAttribute('el1', new THREE.InstancedBufferAttribute(c1, 4));
  tailGeo.instanceCount = comets.length;
  const tails = new THREE.Mesh(
    tailGeo,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: tailVS,
      fragmentShader: tailFS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  tails.frustumCulled = false;

  return {
    points,
    tails,
    setCount(count) {
      geo.setDrawRange(0, count);
    },
    update(tDays, focus, pixelRatio, visible, cometsTails) {
      const high = Math.floor(tDays / 1024) * 1024;
      uniforms.tHigh.value = high;
      uniforms.tLow.value = tDays - high;
      uniforms.focus.value.set(...focus);
      uniforms.pixelRatio.value = pixelRatio;
      uniforms.visible.value = visible.map(Number);
      uniforms.enabled.value = cometsTails && visible[5] ? 1 : 0;
      tails.visible = cometsTails && visible[5];
    },
  };
}
