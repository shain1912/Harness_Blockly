import importlib, inspect, json, os, re, sys, enum
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

_SIMPLE_TYPES = (int, float, complex, bool, str, bytes)

def _short_repr(v):
    try:
        r = repr(v)
    except Exception:
        return ''
    return r if len(r) <= 60 else r[:57] + '...'

def _const_type(v):
    """Python type NAME if v is a surfaceable module constant (simple scalar, small tuple/frozenset of
    scalars, or enum member); else None. EXACT-type checks (not isinstance) reject numpy/pandas scalars
    that subclass int/float — we never lower a wrapper object as if it were a plain literal. Enum first
    (IntEnum is also an int)."""
    if isinstance(v, enum.Enum):
        return type(v).__name__
    t = type(v)
    if t in _SIMPLE_TYPES:
        return t.__name__
    if t in (tuple, frozenset):
        try:
            items = list(v)
        except Exception:
            return None
        if len(items) <= 12 and all(type(x) in _SIMPLE_TYPES for x in items):
            return t.__name__
    return None

def _prefix_hint(name):
    """The UPPERCASE token before the first underscore (IMREAD for IMREAD_COLOR) so the UI can group an
    enum-like family; '' means a singleton constant (math.pi)."""
    head = name.split('_', 1)[0] if '_' in name else ''
    return head if (head and head.isupper()) else ''

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

# Any callable that isn't a class or module = something we can build a call block for. Critically
# this includes C-level routines (builtin_function_or_method, method_descriptor) and callable
# objects (e.g. numpy ufuncs like np.add) that `inspect.isfunction` does NOT match — the reason a
# C-extension library used to expose almost none of its real API as blocks.
def _is_call(obj):
    return callable(obj) and not inspect.isclass(obj) and not inspect.ismodule(obj)

def _method_names(cls):
    """Public callable attributes of a class, INCLUDING C methods. dir()+getattr sees C methods
    (method_descriptor) that inspect.getmembers(predicate=isfunction) misses; a property returns its
    descriptor object (not callable) so it's naturally skipped."""
    out = []
    for mn in dir(cls):
        try:
            mo = getattr(cls, mn)
        except Exception:
            continue
        if _is_call(mo):
            out.append((mn, mo))
    return out

# Walk ONE module object's public members into `entries`, each tagged with its own dotted `module`
# (so a submodule function lowers to <submodule-leaf>.func, matching the code's receiver). `strict`
# (submodule walks) drops re-exported callables from OTHER packages by __module__ so `serial.tools`
# re-importing `sys`/`os` names doesn't pollute the palette; the top module keeps its old behavior.
# A callable whose signature can't be read (many C routines) is still emitted with 0 fixed args
# (the block's [+] button grows them) rather than dropped — coverage over precision.
def _walk(mod, modname, root, public, entries, seen, cap, strict):
    for n, obj in inspect.getmembers(mod):
        if len(entries) >= cap:
            return
        if not public(n):
            continue
        if inspect.isclass(obj) and (getattr(obj, '__module__', '') or '').startswith(root):
            key = (modname, 'class', n)
            if key in seen:
                continue
            seen.add(key)
            cp = _params(obj)                          # signature() on the class reads __init__/__new__/__text_signature__
            entries.append({'kind': 'class', 'name': n, 'module': modname, 'qualName': modname + '.' + n,
                            'params': cp or [], 'doc': _doc(obj), 'returns': True})
            for mn, mo in _method_names(obj):
                if len(entries) >= cap:
                    return
                if not public(mn):
                    continue
                mk = (modname, 'method', n, mn)
                if mk in seen:
                    continue
                seen.add(mk)
                entries.append({'kind': 'method', 'owner': n, 'name': mn, 'module': modname,
                                'qualName': modname + '.' + n + '.' + mn,
                                'params': _params(mo) or [], 'doc': _doc(mo), 'returns': _returns(mo)})
        elif _is_call(obj):
            if strict and not (getattr(obj, '__module__', '') or '').startswith(root):
                continue
            key = (modname, 'function', n)
            if key in seen:
                continue
            seen.add(key)
            entries.append({'kind': 'function', 'name': n, 'module': modname, 'qualName': modname + '.' + n,
                            'params': _params(obj) or [], 'doc': _doc(obj), 'returns': _returns(obj)})
        elif not inspect.ismodule(obj):
            # A module-level VALUE (cv2.IMREAD_COLOR, math.pi). Surfaced as a reporter that lowers to the
            # dotted name — never the literal — so it round-trips. getmembers already fetched obj (no new
            # attribute access / import side effect).
            vt = _const_type(obj)
            if vt is None:
                continue
            key = (modname, 'constant', n)
            if key in seen:
                continue
            seen.add(key)
            entries.append({'kind': 'constant', 'name': n, 'module': modname, 'qualName': modname + '.' + n,
                            'valueType': vt, 'valueRepr': _short_repr(obj), 'prefix': _prefix_hint(n),
                            'params': [], 'returns': True})

def main():
    name = sys.argv[1]
    include_private = '--include-private' in sys.argv
    max_entries = 1000
    for a in sys.argv[2:]:
        if a.startswith('--max='):
            max_entries = int(a.split('=', 1)[1])
    mod, name = _import(name)
    root = name.split('.')[0]
    def public(n): return include_private or not n.startswith('_')
    # Walk up to a hard ceiling ABOVE max_entries so we can report the TRUE size (`total`) instead of
    # silently truncating — the UI tells the user "showing N of M, use Curate to trim" rather than
    # pretending a 3000-method library only has 200 blocks. The ceiling just bounds a pathological lib.
    HARD_CEIL = max(max_entries, 8000)
    entries = []
    seen = set()
    _walk(mod, name, root, public, entries, seen, HARD_CEIL, strict=False)
    total = len(entries)
    return {'module': name, 'entries': _select(entries, max_entries), 'total': total, 'truncated': total > max_entries}

def _select(entries, cap):
    """Keep ALL module functions + class constructors (the headline API, usually modest), then
    FAIR-SHARE the remaining budget across methods/constants/properties round-robin so no kind is
    starved — e.g. cv2 keeps BOTH its methods AND its IMREAD_*/COLOR_* constants, instead of the 2500
    constants (or 800 methods) crowding the other out. Order within a kind stays as discovered."""
    head = [e for e in entries if e['kind'] in ('function', 'class')]
    if len(head) >= cap:
        return head[:cap]
    buckets = {}
    for e in entries:
        if e['kind'] in ('function', 'class'):
            continue
        buckets.setdefault(e['kind'], []).append(e)
    kinds = [k for k in ('method', 'constant', 'property') if buckets.get(k)]
    idx = {k: 0 for k in kinds}
    chosen = []
    budget = cap - len(head)
    while budget > 0 and kinds:
        for k in list(kinds):
            if budget <= 0:
                break
            i = idx[k]
            chosen.append(buckets[k][i])
            idx[k] = i + 1
            budget -= 1
            if idx[k] >= len(buckets[k]):
                kinds.remove(k)
    return head + chosen

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
