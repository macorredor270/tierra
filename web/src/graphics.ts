// Ajustes gráficos: presets, detección del hardware y persistencia.

export type Preset = 'low' | 'medium' | 'high' | 'ultra' | 'custom';
export type TextureQuality = 2 | 4 | 8;

export interface Graphics {
  preset: Preset;
  /** Multiplicador sobre la densidad de píxeles de la pantalla. */
  renderScale: number;
  /** Ajusta la resolución sola para mantener los FPS objetivo. */
  dynamicResolution: boolean;
  msaa: 0 | 2 | 4 | 8;
  bloom: boolean;
  bloomStrength: number;
  textures: TextureQuality;
  anisotropy: boolean;
  /** Eclipses y sombras entre cuerpos (umbra y penumbra analíticas). */
  shadows: boolean;
  stars: boolean;
  /** Magnitud límite del catálogo de estrellas (6 = a simple vista). */
  starLimit: number;
  /** Fracción de cuerpos pequeños dibujados. */
  smallDensity: number;
  /** Resuelve Kepler de los cuerpos pequeños en la GPU (vertex shader). */
  smallGpu: boolean;
  /** Si no se usa la GPU: propaga los cuerpos pequeños en varios hilos (Web Workers + WASM). */
  workers: boolean;
  /** Colas de los cometas (iones y polvo). */
  cometTails: boolean;
  /** 0 = sin límite (sincronizado con la pantalla). */
  fpsCap: 0 | 30 | 60 | 120;
  showStats: boolean;
}

export const PRESETS: Record<Exclude<Preset, 'custom'>, Omit<Graphics, 'preset' | 'showStats' | 'workers' | 'smallGpu' | 'cometTails'>> = {
  low: {
    renderScale: 0.85, dynamicResolution: true, msaa: 2, bloom: false, bloomStrength: 0.5, textures: 2,
    anisotropy: false, shadows: true, stars: true, starLimit: 5.5, smallDensity: 0.25, fpsCap: 30,
  },
  medium: {
    renderScale: 1, dynamicResolution: true, msaa: 2, bloom: true, bloomStrength: 0.6, textures: 4,
    anisotropy: true, shadows: true, stars: true, starLimit: 6.5, smallDensity: 0.5, fpsCap: 60,
  },
  high: {
    renderScale: 1, dynamicResolution: false, msaa: 4, bloom: true, bloomStrength: 0.7, textures: 4,
    anisotropy: true, shadows: true, stars: true, starLimit: 7, smallDensity: 1, fpsCap: 0,
  },
  ultra: {
    renderScale: 1.5, dynamicResolution: false, msaa: 8, bloom: true, bloomStrength: 0.75, textures: 8,
    anisotropy: true, shadows: true, stars: true, starLimit: 7, smallDensity: 1, fpsCap: 0,
  },
};

export interface HardwareInfo {
  gpu: string;
  vendor: string;
  cores: number;
  memoryGb?: number;
  maxTexture: number;
  maxSamples: number;
  pixelRatio: number;
  mobile: boolean;
  software: boolean;
  tier: Exclude<Preset, 'custom'>;
}

/** Identifica la GPU con WEBGL_debug_renderer_info y propone un preset. */
export function detectHardware(gl: WebGL2RenderingContext): HardwareInfo {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  const vendor = String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR));
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const software = /SwiftShader|llvmpipe|Software|Microsoft Basic/i.test(gpu);
  const g = gpu.toLowerCase();
  let tier: HardwareInfo['tier'] = 'high';
  if (software) tier = 'low';
  else if (mobile) tier = /apple gpu|adreno \(tm\) (7|8)/.test(g) ? 'medium' : 'low';
  else if (/rtx|radeon rx [5-9]|radeon pro|apple m\d (pro|max|ultra)|arc a[57]/.test(g)) tier = 'ultra';
  else if (/intel.*(uhd|hd graphics)|mali|adreno/.test(g)) tier = 'medium';
  return {
    gpu: gpu.replace(/^ANGLE \((.*)\)$/, '$1'),
    vendor,
    cores: navigator.hardwareConcurrency || 4,
    memoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxSamples: gl.getParameter(gl.MAX_SAMPLES),
    pixelRatio: devicePixelRatio,
    mobile,
    software,
    tier,
  };
}

const KEY = 'sistema-solar/graficos/v1';

export function initialGraphics(hw: HardwareInfo): Graphics {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved && typeof saved === 'object') return { ...fromPreset(hw.tier, hw), ...saved };
  } catch {
    /* sin almacenamiento: se usan los valores detectados */
  }
  return fromPreset(hw.tier, hw);
}

export function fromPreset(p: Exclude<Preset, 'custom'>, hw: HardwareInfo): Graphics {
  const base = PRESETS[p];
  return {
    ...base,
    preset: p,
    // Texturas 8K solo si la GPU las admite
    textures: base.textures === 8 && hw.maxTexture < 8192 ? 4 : base.textures,
    msaa: Math.min(base.msaa, hw.maxSamples) as Graphics['msaa'],
    workers: hw.cores > 2,
    smallGpu: !hw.software,
    cometTails: true,
    showStats: false,
  };
}

export function saveGraphics(g: Graphics): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(g));
  } catch {
    /* ignorar */
  }
}
