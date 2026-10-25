import json
import pathlib
import re

root = pathlib.Path(r"C:\Users\Lenovo\Projects\yds-kelimeler")
words_js = (root / "data" / "words.js").read_text(encoding="utf-8")
existing = json.loads(words_js[words_js.index("[") : words_js.rindex("]") + 1])

def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")

def rows(path):
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        out.append(line.split("|"))
    return out

seen = {item["w"].lower() for item in existing}
pool = []
for item in existing:
    pool.append({
        "id": item["id"],
        "w": item["w"],
        "pos": item["pos"],
        "tr": item["tr"],
        "ex": item["ex"],
    })

skipped = []
for parts in rows(root / "data" / "extra_lex.txt"):
    if len(parts) != 4:
        raise SystemExit("bad word line: " + "|".join(parts))
    w, pos, tr, ex = [p.strip() for p in parts]
    if w.lower() in seen:
        skipped.append(w)
        continue
    seen.add(w.lower())
    pool.append({"id": slug(w), "w": w, "pos": pos, "tr": tr, "ex": ex})

if len(pool) < 700:
    raise SystemExit("only %s words, need 700. skipped %s" % (len(pool), len(skipped)))
pool = pool[:700]
for i, item in enumerate(pool):
    item["day"] = i // 100 + 1

phrasals = []
seen_p = set()
dups = []
for parts in rows(root / "data" / "extra_phrasals.txt"):
    if len(parts) != 3:
        raise SystemExit("bad phrasal line: " + "|".join(parts))
    w, tr, ex = [p.strip() for p in parts]
    key = w.lower()
    if key in seen_p:
        dups.append(w)
        continue
    seen_p.add(key)
    phrasals.append({"id": "pv-" + slug(w), "w": w, "pos": "pv", "tr": tr, "ex": ex})

if len(phrasals) < 350:
    raise SystemExit("only %s phrasals, need 350. dups %s" % (len(phrasals), dups))
phrasals = phrasals[:350]
for i, item in enumerate(phrasals):
    item["day"] = i // 50 + 1

days_w = {}
days_p = {}
for item in pool:
    days_w[item["day"]] = days_w.get(item["day"], 0) + 1
for item in phrasals:
    days_p[item["day"]] = days_p.get(item["day"], 0) + 1

out = root / "data" / "sprint.js"
payload = "var SPRINT_WORDS = " + json.dumps(pool, ensure_ascii=False, indent=2) + ";\n"
payload += "var SPRINT_PHRASALS = " + json.dumps(phrasals, ensure_ascii=False, indent=2) + ";\n"
out.write_text(payload, encoding="utf-8")
print("words", len(pool), days_w)
print("phrasals", len(phrasals), days_p)
print("skipped existing", len(skipped))
print("phrasal dups", dups)
