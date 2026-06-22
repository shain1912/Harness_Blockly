import importlib, inspect, json, os, sys

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

def main():
    name = sys.argv[1]
    include_private = '--include-private' in sys.argv
    max_entries = 200
    for a in sys.argv[2:]:
        if a.startswith('--max='):
            max_entries = int(a.split('=', 1)[1])
    mod = importlib.import_module(name)
    root = name.split('.')[0]
    def public(n): return include_private or not n.startswith('_')
    entries = []
    for n, obj in inspect.getmembers(mod):
        if not public(n):
            continue
        if inspect.isfunction(obj) or inspect.isbuiltin(obj):
            p = _params(obj)
            if p is not None:
                entries.append({'kind': 'function', 'name': n, 'qualName': name + '.' + n,
                                'params': p, 'doc': _doc(obj), 'returns': _returns(obj)})
        elif inspect.isclass(obj) and (getattr(obj, '__module__', '') or '').startswith(root):
            cp = _params(obj.__init__) if hasattr(obj, '__init__') else []
            entries.append({'kind': 'class', 'name': n, 'qualName': name + '.' + n,
                            'params': cp or [], 'doc': _doc(obj), 'returns': True})
            for mn, mo in inspect.getmembers(obj, predicate=inspect.isfunction):
                if not public(mn):
                    continue
                mp = _params(mo)
                if mp is None:
                    continue
                entries.append({'kind': 'method', 'owner': n, 'name': mn, 'qualName': name + '.' + n + '.' + mn,
                                'params': mp, 'doc': _doc(mo), 'returns': _returns(mo)})
    print(json.dumps({'module': name, 'entries': entries[:max_entries]}))

main()
