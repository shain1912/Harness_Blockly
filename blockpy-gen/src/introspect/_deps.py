import importlib.metadata as _md, json, re, sys

# List the INSTALLED, importable DIRECT dependencies of a distribution, mapped to their real
# import names (pyserial->serial). No hardcoded table; metadata only. Optional ("extra ==")
# and platform-excluded (not installed) requirements are skipped. Used by /api/deps so a
# `pip install <pkg>` can also blockify what it pulled in.

def _dist_name(req):
    m = re.match(r'\s*([A-Za-z0-9][A-Za-z0-9._-]*)', req or '')
    return m.group(1) if m else None

def _clean(line):
    line = (line or '').strip()
    if not line or line.startswith('_'):
        return None
    if '__mypyc' in line or re.fullmatch(r'[0-9a-f]{12,}.*', line):   # mypyc/hash build artifact
        return None
    return line

def _top_import(dist):
    norm = dist.replace('-', '_').lower()
    cands = []
    try:
        txt = _md.distribution(dist).read_text('top_level.txt')
        if txt:
            cands = [c for c in (_clean(l) for l in txt.splitlines()) if c]
    except Exception:
        pass
    for c in cands:                          # prefer the import that matches the dist name
        if c.lower() == norm:
            return c
    if cands:
        return cands[0]
    try:                                     # fallback: reverse the import -> [dists] map
        want = {dist, dist.replace('-', '_'), dist.replace('_', '-')}
        for mod, dists in _md.packages_distributions().items():
            if want & set(dists) and _clean(mod):
                return mod
    except Exception:
        pass
    return None

def main():
    name = sys.argv[1]
    try:
        reqs = _md.requires(name) or []
    except Exception:
        reqs = []
    out, seen = [], set()
    for req in reqs:
        if 'extra ==' in req or '; extra' in req:      # optional dependency (an extra) -> skip
            continue
        dist = _dist_name(req)
        if not dist or dist.lower() == name.lower():
            continue
        try:
            _md.distribution(dist)                      # installed? (platform/markers excluded -> not installed)
        except Exception:
            continue
        imp = _top_import(dist)
        if not imp or imp in seen:
            continue
        seen.add(imp)
        out.append({'dist': dist, 'import': imp})
    print(json.dumps({'package': name, 'deps': out}))

main()
