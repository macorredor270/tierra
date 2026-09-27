// Sombras analíticas entre cuerpos esféricos: eclipses con umbra y penumbra reales.
//
// Para cada fragmento se calcula qué fracción del disco solar (radio angular real) tapan los
// cuerpos cercanos, con el área exacta de solape de dos círculos. Así la penumbra tiene la
// anchura física correcta y no hay mapas de sombras que se pixelen a ninguna escala.
import * as THREE from 'three';

export const MAX_OCCLUDERS = 8;
export const SUN_RADIUS_KM = 695_700;

/** Uniforms compartidos por todos los materiales: se actualizan una vez por frame. */
export const shadowUniforms = {
  shSunPos: { value: new THREE.Vector3() },
  shSunRadius: { value: SUN_RADIUS_KM },
  /** xyz = centro (coordenadas de render), w = radio (km). */
  shOcc: { value: Array.from({ length: MAX_OCCLUDERS }, () => new THREE.Vector4()) },
  shOccId: { value: new Array<number>(MAX_OCCLUDERS).fill(-1) },
  /** Intensidad de la luz refractada por la atmósfera del ocultador (Luna roja en eclipse). */
  shOccAtmo: { value: new Array<number>(MAX_OCCLUDERS).fill(0) },
  shOccCount: { value: 0 },
  shEnabled: { value: 1 },
};

export const shadowGLSL = /* glsl */ `
  uniform vec3 shSunPos;
  uniform float shSunRadius;
  uniform vec4 shOcc[${MAX_OCCLUDERS}];
  uniform float shOccId[${MAX_OCCLUDERS}];
  uniform float shOccAtmo[${MAX_OCCLUDERS}];
  uniform int shOccCount;
  uniform float shEnabled;
  uniform float shSelfId;

  // Fracción del disco de radio angular a (Sol) tapada por un disco de radio b a separación d
  float shDiskCover(float a, float b, float d) {
    if (d >= a + b) return 0.0;
    if (d <= abs(a - b)) return min(1.0, (b * b) / (a * a));
    float a2 = a * a, b2 = b * b;
    float c1 = clamp((d * d + a2 - b2) / (2.0 * d * a), -1.0, 1.0);
    float c2 = clamp((d * d + b2 - a2) / (2.0 * d * b), -1.0, 1.0);
    float lens = a2 * acos(c1) + b2 * acos(c2)
               - 0.5 * sqrt(max((-d + a + b) * (d + a - b) * (d - a + b) * (d + a + b), 0.0));
    return clamp(lens / (3.14159265 * a2), 0.0, 1.0);
  }

  // Luz solar que llega a p (0 = umbra, 1 = pleno Sol). refracted: luz rojiza de atmósferas.
  float shSunVisibility(vec3 p, out vec3 refracted) {
    refracted = vec3(0.0);
    if (shEnabled < 0.5) return 1.0;
    vec3 toSun = shSunPos - p;
    float dSun = length(toSun);
    float aSun = asin(min(shSunRadius / dSun, 1.0));
    float vis = 1.0;
    for (int i = 0; i < ${MAX_OCCLUDERS}; i++) {
      if (i >= shOccCount) break;
      if (abs(shOccId[i] - shSelfId) < 0.5) continue;
      vec3 toOcc = shOcc[i].xyz - p;
      float dOcc = length(toOcc);
      if (dOcc <= shOcc[i].w || dOcc >= dSun) continue;
      float cosSep = dot(toOcc, toSun);
      if (cosSep <= 0.0) continue;
      float aOcc = asin(shOcc[i].w / dOcc);
      // atan2(|a×b|, a·b): exacto para separaciones de fracciones de grado en float32
      // (acos(dot) cerca de 1 pierde casi toda la precisión en la GPU)
      float sep = atan(length(cross(toOcc, toSun)), cosSep);
      float cover = shDiskCover(aSun, aOcc, sep);
      vis *= 1.0 - cover;
      // Eclipse lunar: la atmósfera terrestre refracta luz roja hacia la umbra
      refracted += vec3(0.62, 0.2, 0.07) * shOccAtmo[i] * cover;
    }
    return vis;
  }
`;

/** Añade las sombras a un MeshStandardMaterial sin tocar el resto de su iluminación. */
export function withShadows(mat: THREE.MeshStandardMaterial, selfId: number, extra?: { ring?: RingShadow }): void {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shadowUniforms, { shSelfId: { value: selfId } });
    if (extra?.ring) Object.assign(shader.uniforms, extra.ring.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vShWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvShWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vShWorld;\n${shadowGLSL}\n${extra?.ring ? ringShadowGLSL : ''}`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        vec3 shRefr;
        float shVis = shSunVisibility(vShWorld, shRefr);
        ${extra?.ring ? 'shVis *= ringTransmission(vShWorld);' : ''}
        reflectedLight.directDiffuse *= shVis;
        reflectedLight.directSpecular *= shVis;
        reflectedLight.indirectDiffuse += shRefr * diffuseColor.rgb;`,
      );
  };
  mat.customProgramCacheKey = () => `shadows-${extra?.ring ? 'ring' : 'plain'}`;
}

/** Sombra de los anillos sobre el planeta: el rayo hacia el Sol atraviesa el plano de anillos. */
export interface RingShadow {
  uniforms: {
    ringMap: { value: THREE.Texture };
    ringCenter: { value: THREE.Vector3 };
    ringNormal: { value: THREE.Vector3 };
    ringInner: { value: number };
    ringOuter: { value: number };
  };
}

export const ringShadowGLSL = /* glsl */ `
  uniform sampler2D ringMap;
  uniform vec3 ringCenter;
  uniform vec3 ringNormal;
  uniform float ringInner;
  uniform float ringOuter;
  float ringTransmission(vec3 p) {
    vec3 l = normalize(shSunPos - p);
    float denom = dot(l, ringNormal);
    if (abs(denom) < 1e-5) return 1.0;
    float t = dot(ringCenter - p, ringNormal) / denom;
    if (t <= 0.0) return 1.0;
    float r = length(p + l * t - ringCenter);
    float u = (r - ringInner) / (ringOuter - ringInner);
    if (u < 0.0 || u > 1.0) return 1.0;
    return 1.0 - texture2D(ringMap, vec2(u, 0.5)).a * 0.92;
  }
`;
