#!/usr/bin/env python3
"""Genera las texturas de todos los cuerpos a partir de mosaicos oficiales de NASA/USGS.

Para cada cuerpo:
  1. descarga el mosaico global (cilíndrico, 2:1, meridiano 0° en el centro),
  2. corrige el color para que se parezca a lo que vería el ojo humano (los mosaicos
     científicos vienen en gris o en color ampliado),
  3. rellena las zonas sin datos (casquetes polares no fotografiados),
  4. guarda niveles de 1K, 2K, 4K y 8K (hasta la resolución de la fuente) en
     web/public/textures/<cuerpo>/<N>k.jpg.

Al final escribe web/public/textures/manifest.json con tamaño y sha256 de cada archivo, que usa
la página de instalación para descargar y cachear las texturas.

Uso: python3 scripts/build_textures.py [--src DIR] [--only mars,io]
Requiere: pip install pillow numpy
"""
import argparse
import hashlib
import json
import os
import shutil
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "public" / "textures"
USGS = "https://planetarymaps.usgs.gov/mosaic/"
PJ = "https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/"

# modo de color: "keep" (color real), "desat" (color ampliado → casi gris), "tint" (gris →
# degradado entre dos colores reales), "haze" (Titán: la atmósfera tapa casi toda la superficie)
BODIES = {
    "moon": (
        "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_8k.tif",
        "NASA SVS · LRO LROC WAC", {"mode": "keep"}),
    "mercury": (
        USGS + "Mercury_MESSENGER_MDIS_Basemap_EnhancedColor_Mosaic_Global_665m.tif",
        "USGS · MESSENGER MDIS", {"mode": "desat", "keep": 0.08, "dark": (38, 36, 34), "light": (214, 206, 196)}),
    "mars": (
        USGS + "Mars_Viking_ClrMosaic_global_925m.tif",
        "USGS · Viking Orbiter color", {"mode": "keep"}),
    "jupiter": (
        PJ + "pia07/pia07782/PIA07782.tif",
        "NASA/JPL · Cassini ISS (PIA07782)", {"mode": "keep"}),
    "io": (
        USGS + "Io_GalileoSSI-Voyager_Global_Mosaic_1km.tif",
        "USGS · Galileo SSI + Voyager", {"mode": "tint", "dark": (88, 70, 30), "light": (250, 234, 150)}),
    "europa": (
        USGS + "Europa_Voyager_GalileoSSI_global_mosaic_500m.tif",
        "USGS · Galileo SSI + Voyager", {"mode": "tint", "dark": (120, 100, 82), "light": (246, 238, 224)}),
    "ganymede": (
        USGS + "Ganymede_Voyager_GalileoSSI_global_mosaic_1km.tif",
        "USGS · Galileo SSI + Voyager", {"mode": "tint", "dark": (62, 56, 50), "light": (226, 216, 200)}),
    "callisto": (
        USGS + "Callisto_Voyager_GalileoSSI_global_mosaic_1km.tif",
        "USGS · Galileo SSI + Voyager", {"mode": "tint", "dark": (44, 38, 32), "light": (206, 190, 168)}),
    "enceladus": (
        USGS + "Enceladus_Cassini_mosaic_global_110m.tif",
        "USGS · Cassini ISS", {"mode": "tint", "dark": (150, 158, 166), "light": (255, 255, 255)}),
    "titan": (
        USGS + "Titan_ISS_P19658_Mosaic_Global_4km.tif",
        "USGS · Cassini ISS 938 nm", {"mode": "haze", "dark": (150, 96, 42), "light": (226, 164, 84)}),
    "dione": (PJ + "pia18/pia18434/PIA18434.tif", "NASA/JPL · Cassini ISS (PIA18434)",
              {"mode": "desat", "keep": 0.2, "dark": (70, 70, 72), "light": (232, 230, 228)}),
    "rhea": (PJ + "pia18/pia18438/PIA18438.tif", "NASA/JPL · Cassini ISS (PIA18438)",
             {"mode": "desat", "keep": 0.2, "dark": (70, 68, 66), "light": (232, 228, 222)}),
    "tethys": (PJ + "pia18/pia18439/PIA18439.tif", "NASA/JPL · Cassini ISS (PIA18439)",
               {"mode": "desat", "keep": 0.2, "dark": (80, 80, 80), "light": (240, 238, 234)}),
    "mimas": (PJ + "pia18/pia18437/PIA18437.tif", "NASA/JPL · Cassini ISS (PIA18437)",
              {"mode": "desat", "keep": 0.2, "dark": (70, 70, 70), "light": (225, 222, 218)}),
    "iapetus": (PJ + "pia18/pia18436/PIA18436.tif", "NASA/JPL · Cassini ISS (PIA18436)",
                {"mode": "desat", "keep": 0.5, "dark": (30, 22, 16), "light": (232, 226, 214)}),
    "triton": (
        USGS + "Triton_Voyager2_ClrMosaic_GlobalFill_600m.tif",
        "USGS · Voyager 2", {"mode": "desat", "keep": 0.45, "dark": (110, 96, 90), "light": (236, 226, 216)}),
    "pluto": (
        USGS + "Pluto_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif",
        "USGS · New Horizons LORRI/MVIC", {"mode": "tint", "dark": (70, 38, 26), "light": (250, 234, 210)}),
    "charon": (
        USGS + "Charon_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif",
        "USGS · New Horizons LORRI", {"mode": "tint", "dark": (58, 54, 54), "light": (214, 208, 202)}),
    "phobos": (
        USGS + "Phobos_Viking_Mosaic_40ppd_DLRcontrol.tif",
        "USGS · Viking / DLR", {"mode": "tint", "dark": (34, 31, 29), "light": (150, 138, 124)}),
}

# Cuerpos sin mosaico global oficial descargable: se reutilizan las texturas de 2K existentes
# (Solar System Scope, CC BY 4.0), basadas en imágenes de misiones.
LEGACY = {
    "sun": "2k_sun.jpg",
    "venus": "2k_venus_atmosphere.jpg",
    "saturn": "2k_saturn.jpg",
    "uranus": "2k_uranus.jpg",
    "neptune": "2k_neptune.jpg",
}

LEVELS = [1, 2, 4, 8]


def download(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        return
    print(f"  descargando {url}")
    tmp = dest.with_suffix(".part")
    with urllib.request.urlopen(url, timeout=600) as r, open(tmp, "wb") as fh:
        shutil.copyfileobj(r, fh, 1 << 20)
    tmp.rename(dest)


def load(path: Path, target_w: int) -> Image.Image:
    im = Image.open(path)
    # Reducir en la lectura cuando se puede (mucho menos memoria con mosaicos de 23k píxeles)
    if im.width > target_w * 2:
        im.draft(im.mode, (target_w, target_w // 2))
    im = im.convert("RGB")
    if im.width > target_w:
        factor = max(1, im.width // target_w)
        if factor > 1:
            im = im.reduce(factor)
        im = im.resize((target_w, target_w // 2), Image.LANCZOS)
    return im


def fill_nodata(a: np.ndarray) -> np.ndarray:
    """Rellena las zonas sin datos (casquetes no fotografiados, en negro).

    Cada columna continúa la media de su última franja fotografiada hacia el polo, y el
    resultado se difumina: parece terreno visto a muy baja resolución, sin bandas ni bloques.
    """
    lum = a.mean(axis=2)
    mask = lum > 3
    if mask.all():
        return a
    h, w, _ = a.shape
    out = a.copy()
    band = max(4, h // 40)
    rows_valid = mask.any(axis=1)
    known_rows = np.where(rows_valid)[0]
    for col_block in range(0, w, max(1, w // 512)):
        sl = slice(col_block, min(w, col_block + max(1, w // 512)))
        colmask = mask[:, sl].any(axis=1)
        idx = np.where(colmask)[0]
        if idx.size == 0:
            continue
        top, bot = idx[0], idx[-1]
        top_color = a[top:top + band, sl].reshape(-1, 3)[mask[top:top + band, sl].reshape(-1)].mean(axis=0)
        bot_color = a[max(0, bot - band):bot + 1, sl].reshape(-1, 3)[mask[max(0, bot - band):bot + 1, sl].reshape(-1)].mean(axis=0)
        out[:top, sl] = top_color
        out[bot + 1:, sl] = bot_color
        # huecos interiores de la columna: interpolación lineal vertical
        gaps = ~colmask[top:bot + 1]
        if gaps.any():
            for c in range(sl.start, sl.stop):
                col = out[top:bot + 1, c]
                good = mask[top:bot + 1, c]
                if good.sum() >= 2 and (~good).any():
                    ys = np.arange(col.shape[0])
                    for ch in range(3):
                        col[~good, ch] = np.interp(ys[~good], ys[good], col[good, ch])
    del known_rows
    blur = lambda x, r: np.asarray(Image.fromarray(np.clip(x, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32)
    # Desenfoque horizontal amplio (con vuelta al meridiano) para borrar las rayas por columna
    k = max(3, w // 24)
    for _ in range(3):
        c = np.cumsum(np.concatenate([out[:, -k:], out, out[:, :k]], axis=1), axis=1)
        out = (c[:, 2 * k:2 * k + w] - c[:, k:k + w]) / k
    # Ruido fractal: relieve suave en lugar de un color plano
    rng = np.random.default_rng(7)
    noise = np.zeros((h, w), np.float32)
    for octave in range(2, 9):
        gh, gw = 2 ** (octave - 1), 2 ** octave
        g = Image.fromarray((rng.random((gh, gw)) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        noise += (np.asarray(g, np.float32) / 127.5 - 1) / (1.6 ** octave)
    noise /= np.abs(noise).max() + 1e-6
    out = out * (1 + 0.16 * noise[..., None])
    soft = blur(out, w / 700)
    feather = blur(mask.astype(np.float32) * 255, w / 500) / 255.0
    weight = (np.clip(feather * 1.5 - 0.25, 0, 1) * mask)[..., None]
    return out * 0 + a * weight + soft * (1 - weight)


def grade(im: Image.Image, cfg: dict) -> Image.Image:
    a = np.asarray(im).astype(np.float32)
    a = fill_nodata(a)
    mode = cfg["mode"]
    if mode == "keep":
        return Image.fromarray(a.astype(np.uint8))
    lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) / 255.0
    dark, light = np.array(cfg["dark"], np.float32), np.array(cfg["light"], np.float32)
    ramp = dark + (light - dark) * lum[..., None]
    if mode == "tint":
        out = ramp
    elif mode == "desat":
        k = cfg.get("keep", 0.2)
        out = ramp * (1 - k) + a * k
    elif mode == "haze":
        # Titán en luz visible es una bola de neblina naranja: la superficie apenas se intuye
        soft = np.asarray(Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.GaussianBlur(a.shape[1] / 400))).astype(np.float32)
        slum = soft.mean(axis=2)[..., None] / 255.0
        out = dark + (light - dark) * (0.55 + 0.25 * (slum - 0.5))
    else:
        raise ValueError(mode)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def save_levels(body: str, im: Image.Image, max_w: int) -> None:
    folder = OUT / body
    folder.mkdir(parents=True, exist_ok=True)
    for lv in LEVELS:
        w = lv * 1024
        if w > max_w * 1.15 and lv != 1:
            continue
        lvl = im if im.width == w else im.resize((w, w // 2), Image.LANCZOS)
        p = folder / f"{lv}k.jpg"
        lvl.save(p, quality=86 if lv >= 8 else 88, optimize=True, progressive=True)
        print(f"    {p.relative_to(ROOT)}  {p.stat().st_size // 1024} KB")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def write_manifest(sources: dict) -> None:
    files = []
    for p in sorted(OUT.rglob("*")):
        if p.is_file() and p.suffix in (".jpg", ".png") and p.name != "manifest.json":
            rel = p.relative_to(OUT).as_posix()
            body = rel.split("/")[0] if "/" in rel else "misc"
            level = next((lv for lv in LEVELS if f"{lv}k" in p.stem), 2)
            files.append({"path": "textures/" + rel, "body": body, "level": level,
                          "bytes": p.stat().st_size, "sha256": sha256(p)})
    manifest = {"version": 1, "files": files, "sources": sources}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    total = sum(f["bytes"] for f in files)
    print(f"manifest: {len(files)} archivos, {total / 2**20:.1f} MB")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(ROOT / ".texture-cache"), help="carpeta para los mosaicos descargados")
    ap.add_argument("--only", default="", help="lista de cuerpos separada por comas")
    args = ap.parse_args()
    src = Path(args.src)
    src.mkdir(parents=True, exist_ok=True)
    only = set(filter(None, args.only.split(",")))
    sources = {}

    for body, (url, credit, cfg) in BODIES.items():
        sources[body] = {"url": url, "credit": credit, "processing": cfg["mode"]}
        if only and body not in only:
            continue
        print(f"· {body}")
        raw = src / f"{body}.src"
        download(url, raw)
        with Image.open(raw) as probe:
            native = probe.width
        target = 8192 if native >= 7000 else 4096
        im = grade(load(raw, target), cfg)
        save_levels(body, im, native)

    legacy_dir = OUT
    for body, file in LEGACY.items():
        sources[body] = {"url": "https://www.solarsystemscope.com/textures/", "credit": "Solar System Scope (CC BY 4.0)", "processing": "keep"}
        f = legacy_dir / file
        if not f.exists():
            continue
        folder = OUT / body
        folder.mkdir(exist_ok=True)
        im = Image.open(f).convert("RGB")
        im.save(folder / "2k.jpg", quality=90, optimize=True, progressive=True)
        im.resize((1024, 512), Image.LANCZOS).save(folder / "1k.jpg", quality=88, optimize=True, progressive=True)
    # Tierra: 1K para el arranque rápido a partir de los mapas de 2K de NASA
    for layer in ("day", "night", "clouds"):
        src2k = OUT / "earth" / f"{layer}-2k.jpg"
        if src2k.exists():
            Image.open(src2k).resize((1024, 512), Image.LANCZOS).save(OUT / "earth" / f"{layer}-1k.jpg", quality=88, optimize=True, progressive=True)
    sources["earth"] = {"url": "https://visibleearth.nasa.gov/", "credit": "NASA Visible Earth: Blue Marble, Black Marble", "processing": "keep"}
    write_manifest(sources)


if __name__ == "__main__":
    sys.exit(main())
