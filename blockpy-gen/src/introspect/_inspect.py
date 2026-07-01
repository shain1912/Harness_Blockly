import importlib, inspect, json, os, re, sys
import importlib.metadata as _md

# Running this script by absolute path makes sys.path[0] the script's own dir, not the spawn
# cwd. Put cwd first so a module living in the caller's working directory is importable.
sys.path.insert(0, os.getcwd())

def _kind(p):
    P = inspect.Parameter
    return {P.POSITIONAL_ONLY: 'positional', P.POSITIONAL_OR_KEYWORD: 'positional',
            P.VAR_POSITIONAL: 'vararg', P.KEYWORD_ONLY: 'keyword', P.VAR_KEYWORD: 'kwarg'}[p.kind]

def _params(fn):
    try:
        sig = inspect.signature(fn)
    except (ValueError, TypeError):
        return None
    out = []
    for p in sig.parameters.values():
        if p.name in ('self', 'cls'):
            continue
        out.append({'name': p.name, 'kind': _kind(p), 'hasDefault': p.default is not inspect._empty})
    return out

def _returns(fn):
    try:
        ra = inspect.signature(fn).return_annotation
    except (ValueError, TypeError):
        return True
    if ra is inspect.Signature.empty:
        return True                       # unknown -> assume it returns a value (output block)
    return ra is not None and ra is not type(None)   # '-> None' -> statement block

def _doc(o):
    d = inspect.getdoc(o) or ''
    return (d.strip().split('\n')[0] if d else '')[:200]

def _clean_import(line):
    line = (line or '').strip()
    if not line or line.startswith('_'):
        return None
    if '__mypyc' in line or re.fullmatch(r'[0-9a-f]{12,}.*', line):   # mypyc/hash build artifact
        return None
    return line

def _dist_to_import(dist):
    """Map a pip DISTRIBUTION name (pyserial, pillow, opencv-python) to its real import name
    (serial, PIL, cv2) from installed package metadata — no hardcoded table."""
    norm = dist.replace('-', '_').lower()
    # top_level.txt lists the import packages a distribution installs (skip build artifacts).
    cands = []
    try:
        txt = _md.distribution(dist).read_text('top_level.txt')
        if txt:
            cands = [c for c in (_clean_import(l) for l in txt.splitlines()) if c]
    except Exception:
        pass
    for c in cands:                       # prefer the import that matches the dist name
        if c.lower() == norm:
            return c
    if cands:
        return cands[0]
    # Fallback: reverse the import-name -> [distribution names] map.
    try:
        want = {dist, dist.replace('-', '_'), dist.replace('_', '-')}
        for mod_name, dists in _md.packages_distributions().items():
            if want & set(dists) and _clean_import(mod_name):
                return mod_name
    except Exception:
        pass
    return None

def _import(name):
    """Import by module name; if that fails (or the name is a pip distribution name like
    pyserial/opencv-python), resolve it to the real import name and import that.
    Returns (module, import_name)."""
    try:
        return importlib.import_module(name), name
    except ModuleNotFoundError:
        alt = _dist_to_import(name)
        if alt and alt != name:
            return importlib.import_module(alt), alt
        raise

# Walk ONE module object's public members into `entries`, each tagged with its own dotted `module`
# (so a submodule function lowers to <submodule-leaf>.func, matching the code's receiver). `strict`
# (submodule walks) drops re-exported functions from OTHER packages by __module__ so `serial.tools`
# re-importing `sys`/`os` names doesn't pollute the palette; the top module keeps its old behavior.
def _walk(mod, modname, root, public, entries, seen, cap, strict):
    for n, obj in inspect.getmembers(mod):
        if len(entries) >= cap:
            return
        if not public(n):
            continue
        if inspect.isfunction(obj) or inspect.isbuiltin(obj):
            if strict and not (getattr(obj, '__module__', '') or '').startswith(root):
                continue
            key = (modname, 'function', n)
            if key in seen:
                continue
            p = _params(obj)
            if p is not None:
                seen.add(key)
                entries.append({'kind': 'function', 'name': n, 'module': modname, 'qualName': modname + '.' + n,
                                'params': p, 'doc': _doc(obj), 'returns': _returns(obj)})
        elif inspect.isclass(obj) and (getattr(obj, '__module__', '') or '').startswith(root):
            key = (modname, 'class', n)
            if key in seen:
                continue
            seen.add(key)
            cp = _params(obj.__init__) if hasattr(obj, '__init__') else []
            entries.append({'kind': 'class', 'name': n, 'module': modname, 'qualName': modname + '.' + n,
                            'params': cp or [], 'doc': _doc(obj), 'returns': True})
            for mn, mo in inspect.getmembers(obj, predicate=inspect.isfunction):
                if len(entries) >= cap:
                    return
                if not public(mn):
                    continue
                mp = _params(mo)
                if mp is None:
                    continue
                mk = (modname, 'method', n, mn)
                if mk in seen:
                    continue
                seen.add(mk)
                entries.append({'kind': 'method', 'owner': n, 'name': mn, 'module': modname,
                                'qualName': modname + '.' + n + '.' + mn,
                                'params': mp, 'doc': _doc(mo), 'returns': _returns(mo)})

def main():
    name = sys.argv[1]
    include_private = '--include-private' in sys.argv
    max_entries = 200
    for a in sys.argv[2:]:
        if a.startswith('--max='):
            max_entries = int(a.split('=', 1)[1])
    mod, name = _import(name)
    root = name.split('.')[0]
    def public(n): return include_private or not n.startswith('_')
    entries = []
    seen = set()
    _walk(mod, name, root, public, entries, seen, max_entries, strict=False)
    return {'module': name, 'entries': entries[:max_entries]}

# A library can print a banner/log to stdout when imported (e.g. pygame's "Hello from the
# pygame community"). That text would land in front of our JSON and break JSON.parse on the
# Node side. So point fd 1 at stderr for the whole import+introspection, then restore the real
# stdout only to emit the final JSON — nothing else ever reaches it.
_real_stdout = os.dup(1)
os.dup2(2, 1)
try:
    result = main()
finally:
    try:
        sys.stdout.flush()
    except Exception:
        pass
    os.dup2(_real_stdout, 1)
    os.close(_real_stdout)
sys.stdout.write(json.dumps(result) + '\n')
sys.stdout.flush()
