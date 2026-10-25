import json
import pathlib

root = pathlib.Path(__file__).parent
near = {}
for name in ("near_src.txt", "near_pv.txt"):
    for line in (root / name).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        key, value = line.split("\t", 1)
        if key in near:
            raise SystemExit("duplicate " + key)
        near[key] = value.strip()

missing = []
extra = set(near)
for line in (root / "_heads.txt").read_text(encoding="utf-8").splitlines():
    key = line.split("\t", 2)[1]
    extra.discard(key)
    if key not in near:
        missing.append(key)
if missing or extra:
    raise SystemExit("missing %s extra %s" % (missing[:20], sorted(extra)[:20]))

out = "var NEAR = " + json.dumps(near, ensure_ascii=False, indent=2) + ";\n"
(root / "near.js").write_text(out, encoding="utf-8")
print(len(near))
