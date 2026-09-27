// Shaders GLSL. Todos incluyen los chunks de profundidad logarítmica de Three.js: sin ellos no se
// puede dibujar a la vez la superficie de Fobos (km) y la órbita de Eris (decenas de au).

const LOGDEPTH_VS_PARS = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
`;
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
      gl_FragColor = vec4(color * 2.2, 1.0);
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

    void main() {
      #include <logdepthbuf_fragment>
      vec3 n = normalize(vNormal);
      vec3 l = normalize(sunPos - vWorldPos);
      vec3 v = normalize(cameraPosition - vWorldPos);
      float ndl = dot(n, l);
      float day = smoothstep(-0.08, 0.12, ndl);

      vec3 dayColor = texture2D(dayMap, vUv).rgb;
      vec3 nightColor = texture2D(nightMap, vUv).rgb;
      float water = texture2D(waterMap, vUv).r;
      // Sombra de las nubes sobre la superficie
      float cloud = texture2D(cloudsMap, vUv + vec2(cloudShift, 0.0)).r;

      vec3 lit = dayColor * max(ndl, 0.0) * (1.0 - cloud * 0.35);
      // Brillo especular solo en el agua
      vec3 h = normalize(l + v);
      lit += vec3(1.0, 0.95, 0.85) * pow(max(dot(n, h), 0.0), 180.0) * water * 0.55 * day;

      vec3 night = nightColor * vec3(1.0, 0.8, 0.55) * 1.6 * (1.0 - cloud * 0.8);
      vec3 color = mix(night, lit, day);

      // Luz rasante rojiza en el terminador
      color += vec3(0.9, 0.35, 0.1) * exp(-pow(ndl / 0.05, 2.0)) * 0.025 * (1.0 - cloud);
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
    void main() {
      #include <logdepthbuf_fragment>
      float c = texture2D(cloudsMap, vUv + vec2(cloudShift, 0.0)).r;
      float ndl = dot(normalize(vNormal), normalize(sunPos - vWorldPos));
      float light = smoothstep(-0.15, 0.3, ndl);
      gl_FragColor = vec4(vec3(1.0) * (0.04 + 0.96 * light), smoothstep(0.08, 0.95, c) * 0.92);
      #include <colorspace_fragment>
    }
  `,
};

/** Halo atmosférico: dispersión aproximada con Fresnel, más intensa en el lado iluminado. */
export const atmosphereShader = {
  vertex: earthShader.vertex,
  fragment: /* glsl */ `
    ${LOGDEPTH_FS_PARS}
    uniform vec3 color;
    uniform vec3 sunPos;
    uniform float intensity;
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    void main() {
      #include <logdepthbuf_fragment>
      vec3 n = normalize(vNormal);
      vec3 v = normalize(cameraPosition - vWorldPos);
      vec3 l = normalize(sunPos - vWorldPos);
      float rim = pow(1.0 - abs(dot(n, v)), 4.0);
      float sun = smoothstep(-0.3, 0.4, dot(n, l));
      // Hacia el Sol la luz que atraviesa el limbo se enrojece (Rayleigh)
      float forward = pow(max(dot(-v, l), 0.0), 8.0);
      vec3 c = mix(color, vec3(1.0, 0.55, 0.3), forward * 0.6);
      gl_FragColor = vec4(c * intensity, rim * sun);
    }
  `,
};

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
    varying vec3 vLocal;
    varying vec3 vWorldPos;
    void main() {
      #include <logdepthbuf_fragment>
      float r = length(vLocal.xy);
      float t = (r - inner) / (outer - inner);
      if (t < 0.0 || t > 1.0) discard;
      vec4 tex = texture2D(map, vec2(t, 0.5));
      // Sombra del planeta sobre los anillos: ¿corta el rayo hacia el Sol la esfera?
      vec3 toSun = normalize(sunPos - vWorldPos);
      vec3 oc = vWorldPos - planetPos;
      float b = dot(oc, toSun);
      float c = dot(oc, oc) - planetRadius * planetRadius;
      float shadow = (b < 0.0 && b * b - c > 0.0) ? 0.08 : 1.0;
      vec3 color = mix(vec3(0.62, 0.55, 0.45), vec3(0.95, 0.88, 0.74), tex.r) * shadow;
      gl_FragColor = vec4(color, tex.a * 0.95);
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
