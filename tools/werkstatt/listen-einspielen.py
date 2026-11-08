# Spielt die Blöcke „Empfehlung für die Listen" aus Prüfberichten in die Vorlagen ein.
#   python3 tools/werkstatt/listen-einspielen.py <bericht.md> [...]
# `entscheiden` und `ohne` ersetzen die Liste der Vorlage; `an` und `aus` ergänzen die Vorgaben.
import glob, json, re, sys

dateien = {}
for pfad in glob.glob("src/data/vorlagen/*.json"):
    roh = open(pfad, encoding="utf-8").read()
    dateien[pfad] = (json.loads(roh), roh.endswith("\n"))

def finde(vid):
    for pfad, (d, _) in dateien.items():
        for v in d["vorlagen"]:
            if v["id"] == vid:
                return v
    return None

def liste(text):
    text = text.strip()
    assert text.startswith("[") and text.endswith("]"), text
    return [x.strip() for x in text[1:-1].split(",") if x.strip()]

n = 0
for bericht in sys.argv[1:]:
    s = open(bericht, encoding="utf-8").read()
    for m in re.finditer(r"```\n(vorlage:.*?)```", s, re.S):
        felder = dict(z.split(":", 1) for z in m.group(1).strip().split("\n"))
        vid = felder["vorlage"].strip()
        v = finde(vid)
        if v is None:
            print("FEHLT:", vid)
            continue
        ent, ohne, an, aus = (liste(felder[k]) for k in ("entscheiden", "ohne", "an", "aus"))
        alt_ent, alt_ohne = v.get("entscheiden", []), v.get("ohne", [])
        entfallen = [k for k in alt_ent if k not in ent]
        v["entscheiden"] = ent
        if ohne or "ohne" in v:
            v["ohne"] = ohne
            if not ohne:
                del v["ohne"]
        g = v.setdefault("vorgaben", {})
        for k in an:
            if k not in g.setdefault("an", []):
                g["an"].append(k)
            if k in g.get("aus", []):
                g["aus"].remove(k)
        for k in aus:
            if k not in g.setdefault("aus", []):
                g["aus"].append(k)
            if k in g.get("an", []):
                g["an"].remove(k)
        for k in ("an", "aus"):
            if k in g and not g[k]:
                del g[k]
        if not g:
            del v["vorgaben"]
        n += 1
        print(f"{vid}: entscheiden {len(alt_ent)}→{len(ent)}, ohne {len(alt_ohne)}→{len(ohne)}, an +{len(an)}, aus +{len(aus)}" + (f"  ENTFÄLLT aus entscheiden: {entfallen}" if entfallen else ""))

for pfad, (d, nl) in dateien.items():
    open(pfad, "w", encoding="utf-8").write(json.dumps(d, ensure_ascii=False, indent=2) + ("\n" if nl else ""))
print(n, "Vorlagen geändert")
