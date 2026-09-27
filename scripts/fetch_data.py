#!/usr/bin/env python3
"""Descarga los datos oficiales de JPL y los deja listos para la app y los tests.

Salidas:
  web/public/data/moons.json        elementos medios de satélites (JPL SSD) + radios
  web/public/data/dwarfs.json       elementos osculantes de planetas enanos (SBDB)
  web/public/data/smallbodies.bin   asteroides H<15, TNOs y cometas periódicos (SBDB Query)
  web/public/data/smallbodies.json  cabecera: número de cuerpos y rangos por clase
  crates/astro-core/tests/fixtures/horizons.json  vectores de Horizons para validar

Uso: python3 scripts/fetch_data.py [--skip-small] [--skip-horizons]
"""
import html
import json
import re
import struct
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "web" / "public" / "data"
FIXTURES = ROOT / "crates" / "astro-core" / "tests" / "fixtures"
J2000 = 2451545.0


def get(url, tries=4):
    for n in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return r.read().decode("utf-8")
        except Exception as e:  # red inestable: reintento con backoff
            if n == tries - 1:
                raise
            print(f"  reintento ({e})", file=sys.stderr)
            time.sleep(2 ** (n + 1))


def html_rows(page):
    rows = []
    for r in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S):
        cells = re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", r, re.S)
        rows.append([" ".join(html.unescape(re.sub("<[^>]+>", " ", c)).split()) for c in cells])
    return rows


def num(s):
    m = re.match(r"-?[\d.]+(?:[eE][-+]?\d+)?", s or "")
    return float(m.group(0)) if m else None


def cal_to_jd(s):
    # "2000-01-01.5" (TDB)
    y, mo, d = s.split("-")
    y, mo, d = int(y), int(mo), float(d)
    if mo <= 2:
        y, mo = y - 1, mo + 12
    a = y // 100
    b = 2 - a + a // 4
    return int(365.25 * (y + 4716)) + int(30.6001 * (mo + 1)) + d + b - 1524.5


def fetch_moons():
    print("· lunas: elementos medios (ssd.jpl.nasa.gov/sats/elem)")
    rows = html_rows(get("https://ssd.jpl.nasa.gov/sats/elem/"))
    print("· lunas: parámetros físicos (ssd.jpl.nasa.gov/sats/phys_par)")
    phys = {}
    for r in html_rows(get("https://ssd.jpl.nasa.gov/sats/phys_par/")):
        if len(r) >= 5 and r[2].isdigit():
            phys[int(r[2])] = {"gm": num(r[3]), "radius": num(r[4])}
    moons = []
    for r in rows:
        if len(r) < 17 or not r[0].isdigit():
            continue
        code = int(r[3]) if r[3].isdigit() else None
        frame = r[5].lower()
        if frame not in ("ecliptic", "laplace", "equatorial"):
            continue
        p = phys.get(code, {})
        moons.append({
            "name": r[2], "parent": r[1], "code": code, "ephemeris": r[4],
            "frame": frame, "epoch": cal_to_jd(r[6]),
            "a": num(r[7]), "e": num(r[8]), "w": num(r[9]), "M": num(r[10]),
            "i": num(r[11]), "node": num(r[12]), "P": num(r[13]),
            "Papsis": num(r[14]) or 0.0, "Pnode": num(r[15]) or 0.0,
            "poleRa": num(r[16]), "poleDec": num(r[17]),
            "radius": p.get("radius"), "gm": p.get("gm"),
        })
    major = [m for m in moons if m["radius"] and m["code"] != 301]
    print(f"  {len(moons)} lunas; refinando {len(major)} principales con Horizons")
    for m in major:
        refine_major_moon(m)
        print(f"    {m['name']}: P={m['P']:.6f} d")
    return moons


SBDB = "https://ssd-api.jpl.nasa.gov/sbdb_query.api?"
FIELDS = "spkid,full_name,a,e,i,om,w,ma,epoch,H,diameter,class"


def sbdb_query(params):
    return json.loads(get(SBDB + urllib.parse.urlencode(params)))


def fetch_dwarfs():
    # SBDB redondea algunos (Plutón sale con a=39.6); Horizons da osculantes completos
    print("· planetas enanos (elementos osculantes de Horizons, época 2026-09-27)")
    out = []
    for cmd, name in [("1;", "Ceres"), ("9", "Pluto"), ("136199;", "Eris"),
                      ("136472;", "Makemake"), ("136108;", "Haumea")]:
        q = {"format": "json", "COMMAND": f"'{cmd}'", "EPHEM_TYPE": "ELEMENTS",
             "CENTER": "'500@10'", "START_TIME": "'2026-09-27'", "STOP_TIME": "'2026-09-27 00:01'",
             "STEP_SIZE": "'1'", "REF_PLANE": "'ECLIPTIC'", "OUT_UNITS": "'AU-D'",
             "CSV_FORMAT": "'YES'", "TIME_TYPE": "'TDB'"}
        res = json.loads(get("https://ssd.jpl.nasa.gov/api/horizons.api?" +
                             urllib.parse.urlencode(q)))["result"]
        p = [x.strip() for x in res.split("$$SOE")[1].strip().splitlines()[0].split(",")]
        # JDTDB, Cal, EC, QR, IN, OM, W, Tp, N, MA, TA, A, AD, PR
        out.append({"name": name, "epoch": float(p[0]), "a": float(p[11]), "e": float(p[2]),
                    "i": float(p[4]), "om": float(p[5]), "w": float(p[6]), "ma": float(p[9])})
        time.sleep(0.3)
    return out


CLASS_CODES = {"NEO": 0, "MBA": 1, "TROJAN": 2, "OUTER": 3, "TNO": 4, "COMET": 5}
NEO = {"ATE", "APO", "AMO", "IEO"}
OUTER = {"CEN", "OMB", "PAA", "HYA", "AST"}


def classify(kind, cls):
    if kind == "comet":
        return CLASS_CODES["COMET"]
    if cls in NEO:
        return CLASS_CODES["NEO"]
    if cls == "TJN":
        return CLASS_CODES["TROJAN"]
    if cls == "TNO":
        return CLASS_CODES["TNO"]
    if cls in OUTER:
        return CLASS_CODES["OUTER"]
    return CLASS_CODES["MBA"]


def fetch_small():
    queries = [
        ("asteroide", {"sb-kind": "a", "sb-ns": "n", "sb-cdata": json.dumps({"AND": ["H|LT|15"]})}),
        ("asteroide", {"sb-class": "TNO"}),
        ("comet", {"sb-kind": "c", "sb-cdata": json.dumps({"AND": ["e|LT|1"]})}),
    ]
    seen, bodies = set(), []
    for kind, q in queries:
        print(f"· SBDB {q}")
        d = sbdb_query({**q, "fields": FIELDS})
        f = d["fields"]
        for row in d.get("data", []):
            r = dict(zip(f, row))
            if r["spkid"] in seen or any(r[k] is None for k in ("a", "e", "i", "om", "w", "ma", "epoch")):
                continue
            e = float(r["e"])
            if e >= 1:
                continue
            seen.add(r["spkid"])
            bodies.append((
                float(r["a"]), e, float(r["i"]), float(r["om"]), float(r["w"]),
                float(r["ma"]), float(r["epoch"]) - J2000,
                float(r["H"]) if r["H"] else 99.0,
                float(classify(kind, r["class"])),
            ))
        print(f"  total acumulado {len(bodies)}")
    bodies.sort(key=lambda b: b[8])
    counts = {k: sum(1 for b in bodies if b[8] == v) for k, v in CLASS_CODES.items()}
    with open(DATA / "smallbodies.bin", "wb") as fh:
        for b in bodies:
            fh.write(struct.pack("<9f", *b))
    json.dump({"stride": 9, "count": len(bodies), "classes": CLASS_CODES, "counts": counts,
               "layout": ["a_au", "e", "i_deg", "node_deg", "peri_deg", "M_deg",
                          "epoch_minus_J2000_days", "H", "class"],
               "source": "JPL SBDB Query API", "fetched": time.strftime("%Y-%m-%d")},
              open(DATA / "smallbodies.json", "w"), indent=1)
    print(f"  {len(bodies)} cuerpos pequeños: {counts}")


def horizons_vectors(target, center, dates):
    out = []
    for date in dates:
        q = {"format": "json", "COMMAND": f"'{target}'", "EPHEM_TYPE": "VECTORS",
             "CENTER": f"'{center}'", "START_TIME": f"'{date}'", "STOP_TIME": f"'{date} 00:01'",
             "STEP_SIZE": "'1'", "VEC_TABLE": "'1'", "REF_PLANE": "'ECLIPTIC'",
             "REF_SYSTEM": "'ICRF'", "OUT_UNITS": "'KM-S'", "CSV_FORMAT": "'YES'",
             "TIME_TYPE": "'TDB'"}
        res = json.loads(get("https://ssd.jpl.nasa.gov/api/horizons.api?" +
                             urllib.parse.urlencode(q)))["result"]
        line = res.split("$$SOE")[1].strip().splitlines()[0]
        parts = [p.strip() for p in line.split(",")]
        out.append({"jd_tdb": float(parts[0]), "date": date,
                    "xyz_km": [float(parts[2]), float(parts[3]), float(parts[4])]})
        time.sleep(0.3)
    return out


def fetch_horizons():
    print("· Horizons: vectores de referencia")
    dates_t1 = ["1850-01-01", "1950-06-15", "2000-01-01", "2026-09-27", "2049-12-31"]
    dates_t2 = ["BC 1000-03-01", "1200-01-01", "2500-01-01"]
    fx = {"frame": "ecliptic J2000, km, TDB", "source": "JPL Horizons API", "planets": {},
          "planets_long_range": {}, "moons": {}}
    for idx, target in enumerate(["1", "2", "3", "4", "5", "6", "7", "8"]):
        fx["planets"][str(idx)] = horizons_vectors(target, "500@10", dates_t1)
        fx["planets_long_range"][str(idx)] = horizons_vectors(target, "500@10", dates_t2)
        print(f"  planeta {target}")
    for code, parent in [("301", "399"), ("501", "599"), ("606", "699"), ("801", "899"),
                         ("401", "499")]:
        fx["moons"][code] = horizons_vectors(code, "500@" + parent,
                                             ["2024-01-01", "2026-09-27", "2029-06-01"])
        print(f"  luna {code}")
    FIXTURES.mkdir(parents=True, exist_ok=True)
    json.dump(fx, open(FIXTURES / "horizons.json", "w"), indent=1)


MOON_EPOCH = "2026-09-27"


def horizons_csv(params):
    q = {"format": "json", "CSV_FORMAT": "'YES'", "TIME_TYPE": "'TDB'", **params}
    res = json.loads(get("https://ssd.jpl.nasa.gov/api/horizons.api?" +
                         urllib.parse.urlencode(q)))["result"]
    body = res.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()
    return [[x.strip() for x in line.split(",")] for line in body]


def refine_major_moon(m):
    """Los elementos medios de la tabla sirven para dibujar pero derivan rápido (el P de Io es
    anomalístico, su periapsis retrocede por la resonancia de Laplace, Fobos viene con 4 cifras).
    Para las lunas con radio medido: forma de la órbita osculante de Horizons en la época y
    movimiento medio ajustado con dos años de vectores. Se guardan en eclíptica J2000."""
    code, parent = m["code"], m["code"] // 100 * 100 + 99
    center = f"'500@{parent}'"
    el = horizons_csv({"COMMAND": f"'{code}'", "EPHEM_TYPE": "ELEMENTS", "CENTER": center,
                       "START_TIME": f"'{MOON_EPOCH}'", "STOP_TIME": f"'{MOON_EPOCH} 00:01'",
                       "STEP_SIZE": "'1'", "REF_PLANE": "'ECLIPTIC'", "OUT_UNITS": "'KM-D'"})[0]
    # JDTDB, Cal, EC, QR, IN, OM, W, Tp, N, MA, TA, A, AD, PR
    jd0, e, inc, node, peri, ma, a = (float(el[0]), float(el[2]), float(el[4]), float(el[5]),
                                     float(el[6]), float(el[9]), float(el[11]))
    if m["P"] > 60:
        # Irregulares lejanas: el ajuste con 2 años no cubre suficientes órbitas; el movimiento
        # medio osculante (perturbado sobre todo por el Sol) es mejor estimación.
        m.update({"frame": "ecliptic", "epoch": jd0, "a": a, "e": e, "i": inc, "node": node,
                  "w": peri, "M": ma, "P": 360.0 / float(el[8]), "Papsis": 0.0, "Pnode": 0.0,
                  "ephemeris": "Horizons osculante " + MOON_EPOCH})
        return
    step_h = max(1, int(m["P"] * 24 / 8))
    vec = horizons_csv({"COMMAND": f"'{code}'", "EPHEM_TYPE": "VECTORS", "CENTER": center,
                        "START_TIME": "'2025-09-27'", "STOP_TIME": "'2027-09-27'",
                        "STEP_SIZE": f"'{step_h} h'", "VEC_TABLE": "'1'",
                        "REF_PLANE": "'ECLIPTIC'", "OUT_UNITS": "'KM-D'"})
    # Ángulo en el plano orbital, desenrollado, y ajuste lineal → movimiento medio
    import math
    ci, si = math.cos(math.radians(inc)), math.sin(math.radians(inc))
    cn, sn = math.cos(math.radians(node)), math.sin(math.radians(node))
    h = (si * sn, -si * cn, ci)  # normal de la órbita
    xax = (cn, sn, 0.0)
    yax = (h[1] * xax[2] - h[2] * xax[1], h[2] * xax[0] - h[0] * xax[2], h[0] * xax[1] - h[1] * xax[0])
    ts, angs, prev, turns = [], [], None, 0.0
    for row in vec:
        t, p = float(row[0]), (float(row[2]), float(row[3]), float(row[4]))
        ang = math.atan2(sum(p[k] * yax[k] for k in range(3)), sum(p[k] * xax[k] for k in range(3)))
        if prev is not None:
            d = ang - prev
            if d > math.pi:
                turns -= 2 * math.pi
            elif d < -math.pi:
                turns += 2 * math.pi
        prev = ang
        ts.append(t - jd0)
        angs.append(ang + turns)
    n = len(ts)
    mt, ma_ = sum(ts) / n, sum(angs) / n
    slope = sum((ts[k] - mt) * (angs[k] - ma_) for k in range(n)) / sum((t - mt) ** 2 for t in ts)
    period = abs(2 * math.pi / slope)
    m.update({"frame": "ecliptic", "epoch": jd0, "a": a, "e": e, "i": inc, "node": node,
              "w": peri, "M": ma, "P": period, "Papsis": 0.0, "Pnode": 0.0,
              "ephemeris": "Horizons osculante " + MOON_EPOCH + " + n ajustado"})
    time.sleep(0.3)


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    json.dump({"source": "JPL SSD Planetary Satellite Mean Elements + Physical Parameters",
               "fetched": time.strftime("%Y-%m-%d"), "moons": fetch_moons()},
              open(DATA / "moons.json", "w"), indent=0, ensure_ascii=False)
    json.dump({"source": "JPL Horizons (elementos osculantes)", "fetched": time.strftime("%Y-%m-%d"),
               "bodies": fetch_dwarfs()}, open(DATA / "dwarfs.json", "w"), indent=1,
              ensure_ascii=False)
    if "--skip-small" not in sys.argv:
        fetch_small()
    if "--skip-horizons" not in sys.argv:
        fetch_horizons()


if __name__ == "__main__":
    main()
