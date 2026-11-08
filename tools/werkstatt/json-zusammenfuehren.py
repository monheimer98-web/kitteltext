# Löst Konflikte beim Zusammenführen in Katalogdateien feldweise:
#   python3 tools/werkstatt/json-zusammenfuehren.py <zweig> <datei> [...]
# Vorlagen und Bausteine werden über ihre id gepaart. Geändert nur auf einer Seite: diese Seite.
# Auf beiden Seiten: Felder einzeln; Textlisten werden vereinigt; echte Widersprüche brechen ab.
import json, subprocess, sys
zweig = sys.argv[1]
basis = subprocess.run(["git", "merge-base", "HEAD", zweig], capture_output=True, text=True).stdout.strip()
def lade(rev, f):
    r = subprocess.run(["git", "show", f"{rev}:{f}"], capture_output=True, text=True)
    return json.loads(r.stdout) if r.returncode == 0 else None
def misch(b, o, t, pfad):
    if o == t: return o
    if o == b: return t
    if t == b: return o
    if isinstance(o, dict) and isinstance(t, dict):
        b = b if isinstance(b, dict) else {}
        out = {}
        for k in list(o) + [k for k in t if k not in o]:
            r = misch(b.get(k), o.get(k), t.get(k), f"{pfad}/{k}")
            if r is not None: out[k] = r
        return out
    if isinstance(o, list) and isinstance(t, list):
        if all(isinstance(x, str) for x in o + t):
            print("  Liste vereinigt:", pfad); return o + [x for x in t if x not in o]
        if all(isinstance(x, dict) and "id" in x for x in o + t):
            return mische_liste(b or [], o, t, pfad)
    raise SystemExit(f"Widerspruch, bitte von Hand: {pfad}")
def mische_liste(b, o, t, pfad):
    B = {x["id"]: x for x in b}; O = {x["id"]: x for x in o}; T = {x["id"]: x for x in t}
    ids = [x["id"] for x in o]
    for i, x in enumerate(t):  # neue Einträge der anderen Seite hinter ihren Vorgänger setzen
        if x["id"] not in O and x["id"] not in B:
            vor = t[i - 1]["id"] if i else None
            ids.insert(ids.index(vor) + 1 if vor in ids else len(ids), x["id"])
    out = []
    for i in ids:
        if i in B and (i not in O or i not in T):  # auf einer Seite gelöscht
            if (O.get(i) or T.get(i)) == B[i]: continue
        r = misch(B.get(i), O.get(i), T.get(i), f"{pfad}/{i}")
        if r is not None: out.append(r)
    return out
for f in sys.argv[2:]:
    print(f)
    b, o, t = lade(basis, f), lade("HEAD", f), lade(zweig, f)
    if "vorlagen" in o:
        neu = dict(o); neu["vorlagen"] = mische_liste(b["vorlagen"], o["vorlagen"], t["vorlagen"], "vorlagen")
    else:
        neu = dict(o); neu["regionen"] = mische_liste(b["regionen"], o["regionen"], t["regionen"], "regionen")
    roh = subprocess.run(["git", "show", f"HEAD:{f}"], capture_output=True, text=True).stdout
    open(f, "w", encoding="utf-8").write(json.dumps(neu, ensure_ascii=False, indent=2) + ("\n" if roh.endswith("\n") else ""))
