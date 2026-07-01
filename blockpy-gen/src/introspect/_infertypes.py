import ast, json, sys

# Tier-2 receiver-type oracle (product side; the paper stays separate). Reads Python on stdin and, for
# each variable used as an attribute receiver (`x` in `x.attr`), asks Jedi for its inferred instance
# type + the module that defines it. Output: {available, vars:{name:{type,module}}}. Jedi is a static
# analyser — NO code executes. Degrades to {available:false} if Jedi isn't installed. This only feeds
# the DISPLAY layer (colour/toolbox); lowering never consults it, so a wrong inference is harmless.
try:
    import jedi
except Exception:
    print(json.dumps({"available": False, "vars": {}})); sys.exit(0)

code = sys.stdin.read()
try:
    tree = ast.parse(code)
except Exception:
    print(json.dumps({"available": True, "vars": {}})); sys.exit(0)

# variable name -> (line, col) of its FIRST use as an attribute receiver (Name.<attr>)
recv = {}
for node in ast.walk(tree):
    if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
        recv.setdefault(node.value.id, (node.value.lineno, node.value.col_offset))
        if len(recv) >= 200:
            break

out = {}
try:
    script = jedi.Script(code)
except Exception:
    print(json.dumps({"available": True, "vars": {}})); sys.exit(0)

for name, (line, col) in recv.items():
    try:
        for d in script.infer(line, col):        # jedi: line 1-based, column 0-based == ast col_offset
            if d.type == 'instance' and isinstance(d.name, str) and d.name.isidentifier():
                out[name] = {"type": d.name, "module": d.module_name or ""}
                break
    except Exception:
        continue

print(json.dumps({"available": True, "vars": out}))
