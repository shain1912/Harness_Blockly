import importlib, importlib.metadata as _md, json, os, pkgutil, sys

# List the importable SUBMODULES of a package (serial -> serial, serial.tools.list_ports,
# serial.threaded, ...) so the app can OPT IN to blockifying a whole package tree, not just the
# one module the code references. Enumeration only NAMES leaf modules (it does not import them);
# the frontend introspects each separately and skips any that fail (e.g. platform-specific ones).
# Dist name -> import name resolves from metadata (pyserial -> serial), no hardcoded table.

sys.path.insert(0, os.getcwd())


def _clean_import(line):
    line = (line or '').strip()
    if not line or line.startswith('_'):
        return None
    return line


def _dist_to_import(dist):
    norm = dist.replace('-', '_').lower()
    cands = []
    try:
        txt = _md.distribution(dist).read_text('top_level.txt')
        if txt:
            cands = [c for c in (_clean_import(l) for l in txt.splitlines()) if c]
    except Exception:
        pass
    for c in cands:
        if c.lower() == norm:
            return c
    if cands:
        return cands[0]
    try:
        want = {dist, dist.replace('-', '_'), dist.replace('_', '-')}
        for mod_name, dists in _md.packages_distributions().items():
            if want & set(dists) and _clean_import(mod_name):
                return mod_name
    except Exception:
        pass
    return None


def _import(name):
    try:
        return importlib.import_module(name), name
    except ModuleNotFoundError:
        alt = _dist_to_import(name)
        if alt and alt != name:
            return importlib.import_module(alt), alt
        raise


def _skip(modname):
    # Private / test segments are noise in a block palette — drop them.
    for seg in modname.split('.'):
        if seg.startswith('_') or seg in ('test', 'tests'):
            return True
    return False


def main():
    name = sys.argv[1]
    cap = 60
    for a in sys.argv[2:]:
        if a.startswith('--max='):
            cap = int(a.split('=', 1)[1])
    pkg, name = _import(name)
    mods = [name]                      # the top package's own API is always included first
    path = getattr(pkg, '__path__', None)
    if path:
        def onerror(_n):               # a submodule that errors mid-walk must not abort enumeration
            pass
        for info in pkgutil.walk_packages(list(path), prefix=name + '.', onerror=onerror):
            if not _skip(info.name):
                mods.append(info.name)
    seen, ordered = set(), []
    for m in mods:
        if m not in seen:
            seen.add(m)
            ordered.append(m)
    total = len(ordered)
    print(json.dumps({'package': name, 'submodules': ordered[:cap], 'total': total, 'truncated': total > cap}))


main()
