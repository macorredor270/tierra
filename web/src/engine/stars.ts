// Estrellas reales del catálogo HYG (posición ICRS, magnitud V e índice de color B−V).
// Se dibujan como puntos nítidos a cualquier resolución, en lugar de una textura de fondo.
import * as THREE from 'three';

const OBLIQUITY = THREE.MathUtils.degToRad(23.439279);
const SKY_RADIUS = 1e10; // km: muy lejos de todo, dentro del far plane logarítmico

/** Temperatura efectiva a partir de B−V (Ballesteros 2012). */
function temperature(bv: number): number {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

/** Color de cuerpo negro aproximado (Tanner Helland) para 1000–40000 K. */
function blackbody(t: number, out: THREE.Color): THREE.Color {
  const k = t / 100;
  let r: number, g: number, b: number;
  if (k <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(k) - 161.1195681661;
    b = k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(k - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(k - 60, -0.0755148492);
    b = 255;
  }
  const c = (v: number) => Math.min(Math.max(v, 0), 255) / 255;
  // Desaturar un poco: a simple vista los colores estelares son sutiles
  return out.setRGB(c(r), c(g), c(b), THREE.SRGBColorSpace).lerp(new THREE.Color(1, 1, 1), 0.35);
}

export const starShader = {
  vertex: /* glsl */ `
    #include <common>
    #include <logdepthbuf_pars_vertex>
    attribute float mag;
    attribute vec3 color;
    uniform float pixelRatio;
    uniform float limit;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vColor = color;
      // Brillo perceptivo: cada magnitud es un factor 2.512 en flujo; se comprime para pantalla
      float flux = pow(2.512, -mag);
      vAlpha = clamp(0.18 + 1.1 * pow(flux / pow(2.512, -1.0), 0.33), 0.0, 1.0);
      float size = 1.3 + 3.2 * clamp((4.0 - mag) / 5.5, 0.0, 1.0);
      gl_PointSize = mag > limit ? 0.0 : (size + 1.0) * pixelRatio;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      #include <logdepthbuf_vertex>
    }
  `,
  fragment: /* glsl */ `
    #include <logdepthbuf_pars_fragment>
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      #include <logdepthbuf_fragment>
      float r = length(gl_PointCoord - 0.5) * 2.0;
      // Núcleo nítido + halo suave (función de dispersión de punto)
      float core = 1.0 - smoothstep(0.2, 0.55, r);
      float halo = exp(-r * r * 6.0) * 0.35;
      float a = (core + halo) * vAlpha;
      if (a < 0.004) discard;
      gl_FragColor = vec4(vColor * a, a);
      #include <colorspace_fragment>
    }
  `,
};

export async function createStars(pixelRatio: number): Promise<THREE.Points> {
  const buf = await fetch('data/stars.bin').then((r) => r.arrayBuffer());
  const data = new Float32Array(buf);
  const n = data.length / 4;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const mag = new Float32Array(n);
  const c = new THREE.Color();
  const so = Math.sin(OBLIQUITY),
    co = Math.cos(OBLIQUITY);
  for (let i = 0; i < n; i++) {
    const ra = data[i * 4],
      dec = data[i * 4 + 1];
    // ICRS → eclíptica J2000 → escena (x, z, −y)
    const x = Math.cos(dec) * Math.cos(ra),
      y = Math.cos(dec) * Math.sin(ra),
      z = Math.sin(dec);
    const ey = co * y + so * z,
      ez = -so * y + co * z;
    pos.set([x * SKY_RADIUS, ez * SKY_RADIUS, -ey * SKY_RADIUS], i * 3);
    mag[i] = data[i * 4 + 2];
    blackbody(temperature(data[i * 4 + 3]), c).toArray(col, i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('mag', new THREE.BufferAttribute(mag, 1));
  const points = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms: { pixelRatio: { value: pixelRatio }, limit: { value: 7 } },
      vertexShader: starShader.vertex,
      fragmentShader: starShader.fragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  points.frustumCulled = false;
  points.renderOrder = -1;
  return points;
}
