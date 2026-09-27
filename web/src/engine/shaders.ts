// Shaders GLSL. Todos incluyen los chunks de profundidad logarítmica de Three.js: sin ellos no se
// puede dibujar a la vez la superficie de Fobos (km) y la órbita de Eris (decenas de au).

const LOGDEPTH_VS_PARS = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
`;
import { shadowGLSL } from './shadows';

const LOGDEPTH_FS_PARS = /* glsl */ `#include <logdepthbuf_pars_fragment>`;

export const sunShader = {
  vertex: /* glsl */ `
    ${LOGDEPTH_VS_PARS}
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vView = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
      #include <logdepthbuf_vertex>
    }
  `,
  fragment: /* glsl */ `
    ${LOGDEPTH_FS_PARS}
    uniform sampler2D map;
    uniform float time;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vView;

    // Ruido de valor 3D para la granulación
    float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
    float noise(vec3 p) {
      vec3 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
    }

    void main() {
      #include <logdepthbuf_fragment>
      vec3 base = texture2D(map, vUv).rgb;
      vec3 p = vec3(vUv * vec2(80.0, 40.0), time * 0.15);
      float g = noise(p) * 0.6 + noise(p * 2.3) * 0.4;
      // Oscurecimiento de limbo (ley de Eddington: I ∝ 0.4 + 0.6 μ)
      float mu = max(dot(vNormal, vView), 0.0);
      float limb = 0.4 + 0.6 * mu;
      vec3 color = base * (0.8 + 0.4 * g) * vec3(1.6, 1.25, 0.85) * limb;
      color += vec3(1.0, 0.45, 0.1) * pow(1.0 - mu, 3.0) * 0.6;
      gl_FragColor = vec4(color * 1.5, 1.0);
      #include <colorspace_fragment>
    }
  `,
};

export const earthShader = {
  vertex: /* glsl */ `
    ${LOGDEPTH_VS_PARS}
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    void main() {
      vUv = uv;
      vNormal = normalize(mat3(modelMatrix) * normal);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
      #include <logdepthbuf_vertex>
    }
  `,
  fragment: /* glsl */ `
    ${LOGDEPTH_FS_PARS}
    uniform sampler2D dayMap;
    uniform sampler2D nightMap;
    uniform sampler2D waterMap;
    uniform sampler2D cloudsMap;
    uniform vec3 sunPos;
    uniform float cloudShift;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    ${shadowGLSL}

    void main() {
      #include <logdepthbuf_fragment>
      vec3 n = normalize(vNormal);
      vec3 l = normalize(sunPos - vWorldPos);
      vec3 v = normalize(cameraPosition - vWorldPos);
      float ndl = dot(n, l);
      float day = smoothstep(-0.08, 0.12, ndl);
      // Eclipse solar: la sombra de la Luna (umbra + penumbra) sobre la superficie
      vec3 refr;
      float sunVis = shSunVisibility(vWorldPos, refr);

      vec3 dayColor = texture2D(dayMap, vUv).rgb;
      vec3 nightColor = texture2D(nightMap, vUv).rgb;
      float water = texture2D(waterMap, vUv).r;
      // Sombra de las nubes sobre la superficie
      float cloud = texture2D(cloudsMap, vUv + vec2(cloudShift, 0.0)).r;

      vec3 lit = dayColor * 1.35 * max(ndl, 0.0) * (1.0 - cloud * 0.35) * sunVis;
      // Brillo especular solo en el agua
      vec3 h = normalize(l + v);
      lit += vec3(1.0, 0.95, 0.85) * pow(max(dot(n, h), 0.0), 180.0) * water * 0.55 * day * sunVis;

      vec3 night = nightColor * vec3(1.0, 0.8, 0.55) * 1.6 * (1.0 - cloud * 0.8);
      // En la umbra se ven las luces de las ciudades, como de noche
      vec3 color = mix(night, lit, day * mix(0.15, 1.0, sunVis));

      gl_FragColor = vec4(color, 1.0);
      #include <colorspace_fragment>
    }
  `,
};

export const cloudsShader = {
  vertex: earthShader.vertex,
  fragment: /* glsl */ `
    ${LOGDEPTH_FS_PARS}
    uniform sampler2D cloudsMap;
    uniform vec3 sunPos;
    uniform float cloudShift;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    ${shadowGLSL}
    void main() {
      #include <logdepthbuf_fragment>
      float c = texture2D(cloudsMap, vUv + vec2(cloudShift, 0.0)).r;
      float ndl = dot(normalize(vNormal), normalize(sunPos - vWorldPos));
      vec3 refr;
      float light = smoothstep(-0.15, 0.3, ndl) * shSunVisibility(vWorldPos, refr);
      gl_FragColor = vec4(vec3(1.0) * (0.04 + 0.96 * light), smoothstep(0.08, 0.95, c) * 0.92);
      #include <colorspace_fragment>
    }
  `,
};

/** Halo atmosférico: dispersión aproximada con Fresnel, más intensa en el lado iluminado. */

export const ringShader = {
  vertex: /* glsl */ `
    ${LOGDEPTH_VS_PARS}
    varying vec3 vLocal;
    varying vec3 vWorldPos;
    void main() {
      vLocal = position;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
      #include <logdepthbuf_vertex>
    }
  `,
  fragment: /* glsl */ `
    ${LOGDEPTH_FS_PARS}
    uniform sampler2D map;
    uniform float inner;
    uniform float outer;
    uniform vec3 sunPos;
    uniform vec3 planetPos;
    uniform float planetRadius;
    uniform vec3 ringDark;
    uniform vec3 ringLight;
    uniform float ringOpacity;
    varying vec3 vLocal;
    varying vec3 vWorldPos;
    ${shadowGLSL}
    void main() {
      #include <logdepthbuf_fragment>
      float r = length(vLocal.xy);
      float t = (r - inner) / (outer - inner);
      if (t < 0.0 || t > 1.0) discard;
      vec4 tex = texture2D(map, vec2(t, 0.5));
      // Sombra del planeta sobre los anillos, con penumbra
      vec3 refr;
      float shadow = mix(0.06, 1.0, shSunVisibility(vWorldPos, refr));
      vec3 color = mix(ringDark, ringLight, tex.r) * shadow;
      gl_FragColor = vec4(color, tex.a * ringOpacity);
      #include <colorspace_fragment>
    }
  `,
};

/** Puntos de tamaño fijo en pantalla: marcadores de cuerpos y cuerpos pequeños. */
export const pointsShader = {
  vertex: /* glsl */ `
    ${LOGDEPTH_VS_PARS}
    attribute float size;
    attribute vec3 color;
    uniform float pixelRatio;
    varying vec3 vColor;
    void main() {
      vColor = color;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = size * pixelRatio;
      #include <logdepthbuf_vertex>
    }
  `,
  fragment: /* glsl */ `
    ${LOGDEPTH_FS_PARS}
    varying vec3 vColor;
    void main() {
      #include <logdepthbuf_fragment>
      vec2 d = gl_PointCoord - 0.5;
      float r = length(d);
      if (r > 0.5) discard;
      float a = 1.0 - smoothstep(0.3, 0.5, r);
      gl_FragColor = vec4(vColor, a);
      #include <colorspace_fragment>
    }
  `,
};

/** Cuerpos pequeños: color por clase y máscara de visibilidad por clase. */
export const smallShader = {
  vertex: /* glsl */ `
    ${LOGDEPTH_VS_PARS}
    attribute float cls;
    uniform float visible[6];
    uniform vec3 colors[6];
    uniform float pixelRatio;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      int k = int(cls + 0.5);
      vColor = colors[k];
      vAlpha = visible[k];
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      // 1 px más de margen para el borde suavizado
      gl_PointSize = ((k == 5 ? 3.0 : 1.8) + 1.0) * pixelRatio * visible[k];
      #include <logdepthbuf_vertex>
    }
  `,
  fragment: /* glsl */ `
    ${LOGDEPTH_FS_PARS}
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
  `,
};

/**
 * Dispersión atmosférica de un solo rebote (Nishita 1993): se integra a lo largo del rayo de
 * visión la luz solar que dispersan las moléculas (Rayleigh, azul) y los aerosoles (Mie, blanco
 * hacia delante), atenuada por la profundidad óptica hacia el Sol y hacia la cámara.
 * Unidades: km. El cielo azul, el limbo y los atardeceres rojos salen solos de la física.
 */
export const scatteringShader = {
  vertex: /* glsl */ `
    ${LOGDEPTH_VS_PARS}
    varying vec3 vWorldPos;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
      #include <logdepthbuf_vertex>
    }
  `,
  fragment: /* glsl */ `
    ${LOGDEPTH_FS_PARS}
    uniform vec3 center;
    uniform vec3 sunPos;
    uniform float planetR;
    uniform float atmoR;
    uniform vec3 betaR;
    uniform vec3 betaM;
    uniform float hR;
    uniform float hM;
    uniform float g;
    uniform float sunI;
    varying vec3 vWorldPos;

    vec2 sphere(vec3 ro, vec3 rd, float r) {
      float b = dot(ro, rd), c = dot(ro, ro) - r * r, d = b * b - c;
      if (d < 0.0) return vec2(1e30, -1e30);
      d = sqrt(d);
      return vec2(-b - d, -b + d);
    }

    void main() {
      #include <logdepthbuf_fragment>
      vec3 ro = cameraPosition - center;
      vec3 rd = normalize(vWorldPos - cameraPosition);
      vec2 ta = sphere(ro, rd, atmoR);
      if (ta.x > ta.y) discard;
      vec2 tp = sphere(ro, rd, planetR);
      float t0 = max(ta.x, 0.0);
      float t1 = tp.x > 0.0 ? min(ta.y, tp.x) : ta.y;
      if (t1 <= t0) discard;
      vec3 sd = normalize(sunPos - center);
      const int N = 16;
      const int L = 6;
      float ds = (t1 - t0) / float(N);
      vec3 sumR = vec3(0.0), sumM = vec3(0.0);
      float odR = 0.0, odM = 0.0;
      for (int i = 0; i < N; i++) {
        vec3 p = ro + rd * (t0 + ds * (float(i) + 0.5));
        // max(0): lejos del planeta la precisión de float32 puede dar alturas negativas enormes
        // y exp(-h/H) desbordaría a infinito
        float h = max(length(p) - planetR, 0.0);
        float dR = exp(-h / hR) * ds, dM = exp(-h / hM) * ds;
        odR += dR; odM += dM;
        // Hacia el Sol: si la Tierra lo tapa, este punto está en la sombra del planeta
        vec2 tl = sphere(p, sd, atmoR);
        vec2 tlp = sphere(p, sd, planetR);
        if (tlp.x > 0.0) continue;
        float dl = tl.y / float(L);
        float lR = 0.0, lM = 0.0;
        for (int j = 0; j < L; j++) {
          float hl = max(length(p + sd * dl * (float(j) + 0.5)) - planetR, 0.0);
          lR += exp(-hl / hR) * dl;
          lM += exp(-hl / hM) * dl;
        }
        vec3 att = exp(-(betaR * (odR + lR) + betaM * 1.1 * (odM + lM)));
        sumR += dR * att;
        sumM += dM * att;
      }
      float mu = dot(rd, sd);
      float pR = 3.0 / (16.0 * 3.14159265) * (1.0 + mu * mu);
      float gg = g * g;
      float pM = 3.0 / (8.0 * 3.14159265) * ((1.0 - gg) * (1.0 + mu * mu)) / ((2.0 + gg) * pow(1.0 + gg - 2.0 * g * mu, 1.5));
      vec3 col = sunI * (sumR * betaR * pR + sumM * betaM * pM);
      // Transmitancia: cuánto de lo que hay detrás (superficie o estrellas) se ve a través
      vec3 trans = exp(-(betaR * odR + betaM * 1.1 * odM));
      float a = clamp(1.0 - dot(trans, vec3(0.333)), 0.0, 1.0);
      gl_FragColor = vec4(col, a);
      #include <colorspace_fragment>
    }
  `,
};

/** Corona solar: plano orientado a la cámara, brillo ∝ r^-2.5 con serpentinas animadas. */
export const coronaShader = {
  vertex: /* glsl */ `
    ${LOGDEPTH_VS_PARS}
    uniform float size;
    varying vec2 vUv;
    void main() {
      vUv = position.xy;
      vec4 center = viewMatrix * modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      gl_Position = projectionMatrix * (center + vec4(position.xy * size, 0.0, 0.0));
      #include <logdepthbuf_vertex>
    }
  `,
  fragment: /* glsl */ `
    ${LOGDEPTH_FS_PARS}
    uniform float time;
    uniform float extent;
    varying vec2 vUv;
    float hash(float n) { return fract(sin(n) * 43758.5453); }
    float noise1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash(i), hash(i + 1.0), f); }
    void main() {
      #include <logdepthbuf_fragment>
      float r = length(vUv) * extent;            // en radios solares
      if (r < 0.98) discard;
      float ang = atan(vUv.y, vUv.x);
      float streamers = 0.55 + 0.45 * noise1(ang * 9.0 + time * 0.02) * noise1(ang * 23.0 - time * 0.015 + 4.0);
      float k = pow(max(r, 1.0), -2.6) * mix(1.0, streamers, smoothstep(1.02, 1.8, r));
      k *= smoothstep(extent, extent * 0.55, r);
      vec3 c = mix(vec3(1.0, 0.86, 0.62), vec3(1.0, 0.97, 0.9), smoothstep(1.0, 2.5, r));
      gl_FragColor = vec4(c * k * 0.32, 1.0);
    }
  `,
};

/**
 * Filtro de seguridad antes del bloom: un solo píxel NaN o infinito se difuminaría por toda la
 * pantalla y la dejaría negra. Se sustituye por negro y se acota el HDR al rango de half float.
 */
export const sanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      bool bad = any(isnan(c)) || any(isinf(c));
      gl_FragColor = bad ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(min(c.rgb, vec3(6.0e4)), c.a);
    }
  `,
};
