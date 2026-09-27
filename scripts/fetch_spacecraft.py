#!/usr/bin/env python3
"""Trayectorias de naves de la NASA/ESA desde JPL Horizons.

Descarga vectores de estado heliocéntricos (posición y velocidad, eclíptica J2000) de toda la
vida útil de cada misión y los guarda en web/public/data/spacecraft.bin (float32, 6 por
muestra) + spacecraft.json (cabecera y fichas). El cliente interpola con splines de Hermite
cúbicos usando la velocidad, así que el paso puede ser grueso sin perder las curvas.

Uso: python3 scripts/fetch_spacecraft.py
"""
import json
import re
import struct
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "web" / "public" / "data"

# id Horizons, nombre, inicio, fin, paso en días, color, agencia, ficha
MISSIONS = [
    (-31, "Voyager 1", "1977-09-06", "2035-01-01", 3, "#ffd479", "NASA/JPL",
     "Lanzada en 1977, sobrevoló Júpiter (1979) y Saturno (1980). En 2012 cruzó la heliopausa: "
     "es el objeto humano más lejano y el primero en el espacio interestelar."),
    (-32, "Voyager 2", "1977-08-21", "2035-01-01", 3, "#ffb36b", "NASA/JPL",
     "La única nave que ha visitado Urano (1986) y Neptuno (1989). Entró en el espacio interestelar en 2018."),
    (-98, "New Horizons", "2006-01-20", "2035-01-01", 2, "#9ad0ff", "NASA/APL",
     "Primera visita a Plutón (julio de 2015) y a Arrokoth (enero de 2019), el objeto más lejano explorado de cerca."),
    (-96, "Parker Solar Probe", "2018-08-13", "2030-01-01", 0.1, "#ff7b5c", "NASA/APL",
     "Atraviesa la corona solar: en su perihelio pasa a 6,9 millones de km del Sol a 190 km/s, el objeto más rápido construido."),
    (-61, "Juno", "2011-08-06", "2026-01-01", 1, "#c7a2ff", "NASA/JPL",
     "En órbita polar de Júpiter desde 2016: estudia su interior, su campo magnético y sus auroras."),
    (-170, "James Webb", "2021-12-26", "2035-01-01", 1, "#f4d35e", "NASA/ESA/CSA",
     "Telescopio infrarrojo de 6,5 m en el punto L2 Sol-Tierra, a 1,5 millones de km de la Tierra."),
    (-159, "Europa Clipper", "2024-10-15", "2034-01-01", 1, "#7ee0c3", "NASA/JPL",
     "Rumbo a Júpiter (llegada en 2030) para estudiar si el océano bajo el hielo de Europa podría albergar vida."),
    (-255, "Psyche", "2023-10-14", "2031-01-01", 1, "#b9c4d6", "NASA/JPL",
     "Viaja hacia (16) Psyche, un asteroide metálico que podría ser el núcleo de un protoplaneta. Llegada en 2029."),
    (-49, "Lucy", "2021-10-17", "2034-01-01", 1, "#ff9ecf", "NASA/SwRI",
     "Primera misión a los asteroides troyanos de Júpiter, restos de la formación de los planetas."),
    (-121, "BepiColombo", "2018-10-21", "2028-01-01", 0.5, "#8fd3ff", "ESA/JAXA",
     "Misión conjunta a Mercurio: entra en órbita a finales de 2026 tras seis sobrevuelos del planeta."),
    (-82, "Cassini", "1997-10-16", "2017-09-15", 1, "#e8c07a", "NASA/ESA/ASI",
     "Estudió Saturno, sus anillos y sus lunas durante 13 años; terminó sumergiéndose en su atmósfera en 2017."),
]

# Efemérides tabuladas de cuerpos cuya propagación kepleriana no basta para los sobrevuelos:
# (id Horizons, índice del cuerpo en la app, inicio, fin, paso en días)
TRACKS = [
    ("9", 10, "1950-01-01", "2100-01-01", 5),   # Plutón (baricentro): sobrevuelo de New Horizons
]

MONTHS = {m: i + 1 for i, m in enumerate(["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"])}


def horizons(params):
    q = {"format": "json", "EPHEM_TYPE": "VECTORS", "CENTER": "'500@10'", "VEC_TABLE": "'2'",
         "REF_PLANE": "'ECLIPTIC'", "OUT_UNITS": "'KM-S'", "CSV_FORMAT": "'YES'", "TIME_TYPE": "'TDB'", **params}
    url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(q)
    for n in range(4):
        try:
            with urllib.request.urlopen(url, timeout=300) as r:
                return json.loads(r.read())["result"]
        except Exception:
            time.sleep(2 ** (n + 1))
    raise RuntimeError("Horizons no responde")


def clamp_dates(res, start, stop):
    """Horizons avisa de los límites del archivo de trayectoria: se recortan y se reintenta."""
    m = re.search(r"prior to A\.D\. (\d{4})-([A-Z]{3})-(\d{2}) (\d{2}:\d{2})", res)
    if m:
        start = f"{m.group(1)}-{MONTHS[m.group(2)]:02d}-{m.group(3)} {m.group(4)}"
        start = start[:-5] + f"{(int(start[-5:-3]) + 1) % 24:02d}" + start[-3:]
    m = re.search(r"after A\.D\. (\d{4})-([A-Z]{3})-(\d{2}) (\d{2}:\d{2})", res)
    if m:
        stop = f"{m.group(1)}-{MONTHS[m.group(2)]:02d}-{m.group(3)} 00:00"
    return start, stop


def fetch(mid, start, stop, step):
    for _ in range(3):
        res = horizons({"COMMAND": f"'{mid}'", "START_TIME": f"'{start}'", "STOP_TIME": f"'{stop}'",
                        "STEP_SIZE": f"'{int(round(step * 1440))} min'"})
        if "$$SOE" in res:
            rows = res.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()
            return [[float(x) for x in (p.strip() for p in r.split(",")) if re.match(r"^-?[\d.]+(E[-+]\d+)?$", x)] for r in rows]
        start, stop = clamp_dates(res, start, stop)
    raise RuntimeError(f"{mid}: sin datos\n{res[-600:]}")


def main():
    header, blob = [], bytearray()
    for mid, name, start, stop, step, color, agency, desc in MISSIONS:
        print(f"· {name}")
        rows = fetch(mid, start, stop, step)
        # fila: JDTDB, X, Y, Z, VX, VY, VZ (la fecha en texto se ha filtrado)
        jd0 = rows[0][0]
        real_step = rows[1][0] - rows[0][0]
        offset = len(blob) // 4
        for r in rows:
            blob += struct.pack("<6f", r[1], r[2], r[3], r[4], r[5], r[6])
        header.append({"id": mid, "name": name, "agency": agency, "color": color, "description": desc,
                       "launch": start, "jd0": jd0, "step": real_step, "count": len(rows), "offset": offset})
        print(f"  {len(rows)} muestras cada {real_step * 24:.1f} h, desde JD {jd0}")
        time.sleep(0.5)
    tracks = []
    for hid, body, start, stop, step in TRACKS:
        print(f"· tabla de efemérides {hid}")
        rows = fetch(hid, start, stop, step)
        offset = len(blob) // 4
        for r in rows:
            blob += struct.pack("<6f", r[1], r[2], r[3], r[4], r[5], r[6])
        tracks.append({"id": hid, "body": body, "jd0": rows[0][0], "step": rows[1][0] - rows[0][0],
                       "count": len(rows), "offset": offset})
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / "spacecraft.bin").write_bytes(bytes(blob))
    json.dump({"source": "JPL Horizons (VECTORS, eclíptica J2000, heliocéntrico, km y km/s)",
               "fetched": time.strftime("%Y-%m-%d"), "stride": 6, "missions": header, "tracks": tracks},
              open(DATA / "spacecraft.json", "w"), indent=1, ensure_ascii=False)
    print(f"{len(blob) / 2**20:.1f} MB")


if __name__ == "__main__":
    main()
