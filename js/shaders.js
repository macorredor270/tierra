// Shaders GLSL para la Tierra, la atmósfera y las nubes.
// Look objetivo: Google Earth — iluminación suave y uniforme,
// nubes vaporosas, atmósfera fina, sin brillos quemados.

export const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const earthFragment = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D waterMap;
  uniform sampler2D bumpMap;
  uniform vec3 sunDirection;
  uniform vec3 cameraPos;
  uniform float atmosphereIntensity;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  // Perturba la normal con el mapa de elevación (relieve sutil del terreno)
  vec3 bumpNormal(vec3 n, vec2 uv) {
    const float scale = 0.035;
    vec2 texel = vec2(1.0 / 2048.0, 1.0 / 1024.0);
    float h0 = texture2D(bumpMap, uv).r;
    float hx = texture2D(bumpMap, uv + vec2(texel.x, 0.0)).r;
    float hy = texture2D(bumpMap, uv + vec2(0.0, texel.y)).r;
    // Tangente y bitangente analíticas de la esfera (en mundo)
    vec3 tangent = normalize(vec3(-n.z, 0.0, n.x));
    vec3 bitangent = cross(n, tangent);
    return normalize(n - ((hx - h0) * tangent - (hy - h0) * bitangent) * scale / texel.x * 0.01);
  }

  void main() {
    vec3 geoNormal = normalize(vNormal);
    vec3 normal = bumpNormal(geoNormal, vUv);
    vec3 viewDir = normalize(cameraPos - vWorldPos);

    // Iluminación: -1 (noche) a 1 (mediodía). El terminador usa la
    // normal geométrica para que el relieve no lo deforme.
    float sunDot = dot(geoNormal, sunDirection);
    float dayFactor = smoothstep(-0.1, 0.18, sunDot);

    vec3 dayColor = texture2D(dayMap, vUv).rgb;
    vec3 nightColor = texture2D(nightMap, vUv).rgb;

    // Lado diurno: iluminación envolvente (wrap) para un look uniforme
    // tipo Google Earth, con relieve sutil del bump
    float wrap = 0.35;
    float diffuse = max((dot(normal, sunDirection) + wrap) / (1.0 + wrap), 0.0);
    vec3 litDay = dayColor * (0.25 + 0.85 * diffuse);

    // Luces de ciudad tenues y cálidas, solo en plena noche
    vec3 cityLights = nightColor * vec3(1.0, 0.82, 0.55) * 1.1 * (1.0 - dayFactor);

    vec3 color = mix(cityLights, litDay, dayFactor);

    // Glint solar en el agua: muy contenido, nunca quemado
    float water = texture2D(waterMap, vUv).r;
    vec3 halfVec = normalize(sunDirection + viewDir);
    float spec = pow(max(dot(normal, halfVec), 0.0), 180.0);
    color += vec3(1.0, 0.95, 0.85) * spec * water * dayFactor * 0.18;

    // Tinte cálido muy leve en el terminador
    float twilight = smoothstep(-0.15, 0.0, sunDot) * (1.0 - smoothstep(0.0, 0.2, sunDot));
    color += vec3(0.18, 0.07, 0.02) * twilight * dayColor;

    // Dispersión atmosférica fina en el limbo (fresnel contenido)
    float fresnel = pow(1.0 - max(dot(geoNormal, viewDir), 0.0), 4.0);
    float atmoLight = smoothstep(-0.3, 0.25, sunDot);
    color = mix(color, vec3(0.55, 0.72, 1.0), fresnel * atmoLight * atmosphereIntensity * 0.5);

    // Oscurecimiento suave hacia el limbo (como las fotos orbitales)
    float limb = max(dot(geoNormal, viewDir), 0.0);
    color *= 0.55 + 0.45 * pow(limb, 0.35);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

export const atmosphereVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const atmosphereFragment = /* glsl */ `
  uniform vec3 sunDirection;
  uniform vec3 cameraPos;
  uniform float intensity;

  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(cameraPos - vWorldPos);

    // Halo fino pegado al limbo, con caída rápida hacia fuera
    float rim = pow(0.65 - dot(normal, viewDir), 5.0);
    rim = clamp(rim, 0.0, 1.0);

    float sunDot = dot(normal, sunDirection);
    float lit = smoothstep(-0.4, 0.3, sunDot);

    vec3 color = mix(vec3(0.12, 0.3, 0.8), vec3(0.5, 0.72, 1.0), lit);

    gl_FragColor = vec4(color, rim * lit * intensity * 0.7);
    #include <colorspace_fragment>
  }
`;

export const cloudsVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const cloudsFragment = /* glsl */ `
  uniform sampler2D cloudsMap;
  uniform vec3 sunDirection;
  uniform float opacity;

  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vec4 c = texture2D(cloudsMap, vUv);
    // Cobertura: funciona tanto con PNG con alfa como en escala de grises
    float cloud = c.r * c.a;
    // Bordes vaporosos: atenúa lo tenue, conserva los núcleos densos
    cloud = smoothstep(0.05, 0.85, cloud) * 0.92;

    vec3 normal = normalize(vNormal);
    float sunDot = dot(normal, sunDirection);
    float dayFactor = smoothstep(-0.12, 0.2, sunDot);

    // Nubes blancas neutras de día, invisibles de noche
    float brightness = 0.85 + 0.15 * max(sunDot, 0.0);
    float twilight = smoothstep(-0.15, 0.0, sunDot) * (1.0 - smoothstep(0.0, 0.2, sunDot));
    vec3 color = vec3(brightness) * dayFactor + vec3(0.35, 0.15, 0.05) * twilight;

    gl_FragColor = vec4(color, cloud * opacity * dayFactor);
    #include <colorspace_fragment>
  }
`;
