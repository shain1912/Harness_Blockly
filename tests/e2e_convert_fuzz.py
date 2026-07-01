#!/usr/bin/env python3
r"""
Fuzz-style desktop E2E for Python->Blockly Convert — mirrors human testing.

For each of a set of diverse, real-library Python programs it:
  1. Converts (Python -> blocks) in the packaged .exe,
  2. switches to the Visual Blocks tab, renders, and SCREENSHOTS the created blocks,
  3. render check: every model block is actually rendered (SVG present), no gray/broken/warned block,
  4. round-trip AST fidelity: ast.dump(original) == ast.dump(regenerated) (structural, no drift),
  5. TOOLBOX check: for every module-qualified call it deep-walks the built toolbox, OPENS the
     block's category, and confirms the block is in the flyout ("scroll the toolbox and check").

Only pure Python (requests + websocket-client via the blockpy-desktop-e2e CDP harness). No Playwright.

USAGE (run BOTH the built .exe exists first — `npm run dist`):
  python tests/e2e_convert_fuzz.py [REPS]
Env overrides:
  BLOCKPY_EXE   path to BlockPy.exe (default: %USERPROFILE%\blockpy-release\win-unpacked\BlockPy.exe)
  BLOCKPY_PORT  CDP port (default 9430)
Exit code 0 iff ALL program-runs pass. Screenshots land in test-results/e2e-shots/.
Add NEW programs to SNIPPETS (keep them novel + runnable on the stdlib) to widen coverage.
"""
import os, sys, time, subprocess, tempfile, json, ast

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, ".claude", "skills", "blockpy-desktop-e2e", "harness"))
from cdp import CDP
try: sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass

EXE = os.environ.get("BLOCKPY_EXE") or os.path.join(os.path.expanduser("~"), "blockpy-release", "win-unpacked", "BlockPy.exe")
PORT = int(os.environ.get("BLOCKPY_PORT", "9430"))
SHOTS = os.path.join(REPO, "test-results", "e2e-shots")
os.makedirs(SHOTS, exist_ok=True)

# Diverse, novel, runnable stdlib programs across many constructs: module fns, constants, classes +
# methods, from-imports, submodules, subscripts, comprehensions, control flow, None/True/False, the
# `if __name__ == '__main__'` guard with a return annotation.
SNIPPETS = [
  ("textwrap", "import textwrap\ns = textwrap.fill('the quick brown fox jumps', width=10)\nshort = textwrap.shorten('a b c d e f', width=7)\nprint(s, short)\n"),
  ("fractions", "import fractions\nf = fractions.Fraction(3, 4)\ntotal = f + fractions.Fraction(1, 4)\nprint(total.numerator, total.denominator)\n"),
  ("calendar", "import calendar\nleap = calendar.isleap(2024)\nname = calendar.month_name[3]\nprint(leap, name)\n"),
  ("string-const", "import string\nups = string.ascii_uppercase\ntitle = string.capwords('hello there world')\nprint(ups, title)\n"),
  ("hashlib", "import hashlib\nh = hashlib.sha256(b'payload')\ndigest = h.hexdigest()\nprint(digest[:8])\n"),
  ("collections", "import collections\nc = collections.Counter('abracadabra')\ntop = c.most_common(2)\nfor ch, n in top:\n    print(ch, n)\n"),
  ("itertools", "import itertools\npairs = list(itertools.combinations([1, 2, 3, 4], 2))\nrun = list(itertools.accumulate([1, 2, 3, 4]))\nprint(pairs, run)\n"),
  ("datetime-from", "from datetime import datetime, timedelta\nnow = datetime.now()\nlater = now + timedelta(days=7)\nprint(later.year, later.month)\n"),
  ("base64", "import base64\nenc = base64.b64encode(b'secret')\ndec = base64.b64decode(enc)\nprint(enc, dec)\n"),
  ("urllib-sub", "import urllib.parse\nq = urllib.parse.quote('a b&c')\np = urllib.parse.urlencode({'x': 1, 'y': 2})\nprint(q, p)\n"),
  ("statistics", "import statistics\nmed = statistics.median([5, 3, 1, 4, 2])\nsd = statistics.pstdev([1, 2, 3, 4, 5])\nprint(med, sd)\n"),
  ("decimal", "import decimal\nd = decimal.Decimal('2.25')\nr = d.sqrt()\nprint(r, d.as_tuple())\n"),
  ("random-fresh", "import random\npick = random.sample(range(50), 5)\nletter = random.choice(['a', 'b', 'c'])\nprint(pick, letter)\n"),
  ("ospath-sub", "import os.path\np = os.path.join('data', 'file.txt')\nstem, ext = os.path.splitext(p)\nprint(p, stem, ext)\n"),
  ("comprehension-mix", "import math\nangles = [30, 45, 60, 90]\nrads = [math.radians(a) for a in angles]\nfor r in rads:\n    print(round(math.cos(r), 3))\n"),
  ("main-guard", "def main() -> None:\n    x = True\n    y = None\n    print(x, y)\n\nif __name__ == '__main__':\n    main()\n"),
  ("bool-none-flags", "ok = True\nempty = None\nvals = [True, False, None]\nif ok and empty is None:\n    print(len(vals))\n"),
]

def norm(code): return ast.dump(ast.parse(code))
def ev(cdp, e, aw=False): return cdp.evaluate(e, await_promise=aw)
def click(cdp, s): return ev(cdp, "(()=>{const e=document.querySelector(%s);if(!e)return false;e.click();return true;})()" % json.dumps(s))
def set_code(cdp, code):
    ev(cdp, "(()=>{const el=document.querySelector('#python-code');el.focus();const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value');set.set.call(el,%s);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;})()" % json.dumps(code))

# Deep-walk the built toolbox to find the block's category, OPEN it, and read the flyout (real UI).
TOOLBOX_CHECK = r"""
(fn, leaf)=>{const tj=window.BlockPyBuildIrToolbox();let topCat=null;
  for(const cat of (tj.contents||[])){ if(cat.kind!=='category')continue; let hit=false;
    (function walk(n){ if(!n||!n.contents)return; for(const c of n.contents){
      if(c.kind==='block'){ const es=c.extraState||{}; const f=es.funcName||es.dotted||''; const m=es.method||'';
        if(f===fn||(f&&f.split('.').pop()===leaf)||(m&&m===leaf)) hit=true; } walk(c);}})(cat);
    if(hit){ topCat=cat.name; break; } }
  if(topCat===null) return {found:false};
  const ws=window.__blocklyWorkspace; const tb=ws&&ws.getToolbox&&ws.getToolbox(); let opened=false, flyout=[];
  if(tb){ let target=null;(function w(items){for(const it of (items||[])){try{if(it.getName&&it.getName()===topCat){target=it;return;}}catch(e){} if(it.getChildToolboxItems)w(it.getChildToolboxItems());}})(tb.getToolboxItems());
    if(target){ try{ tb.setSelectedItem(target); opened=true; const fw=ws.getFlyout&&ws.getFlyout()&&ws.getFlyout().getWorkspace(); if(fw) flyout=fw.getAllBlocks(false).map(b=>b.funcName_||(b.method_?('.'+b.method_):(b.dotted_||b.type))); }catch(e){} } }
  return {found:true, category:topCat, opened, flyout};}
"""

def check(cdp, name, code):
    ev(cdp, "(()=>{const ws=window.__blocklyWorkspace;if(ws)ws.clear();return true;})()"); time.sleep(0.3)
    click(cdp, "#tab-btn-python"); time.sleep(0.2)
    set_code(cdp, code); time.sleep(0.4); click(cdp, "#btn-sync-to-blocks")
    end = time.time() + 30; nb = 0; reclicked = False
    while time.time() < end:
        nb = ev(cdp, "(()=>{const ws=window.__blocklyWorkspace;return ws?ws.getAllBlocks(false).length:0;})()") or 0
        if nb > 0: break
        if not reclicked and time.time() > end - 18:
            reclicked = True; set_code(cdp, code); time.sleep(0.3); click(cdp, "#btn-sync-to-blocks")
        time.sleep(1)
    click(cdp, "#tab-btn-blockly"); time.sleep(0.6)
    ev(cdp, "(()=>{const ws=window.__blocklyWorkspace;if(ws){try{ws.getToolbox&&ws.getToolbox()&&ws.getToolbox().clearSelection&&ws.getToolbox().clearSelection();}catch(e){}window.Blockly.svgResize(ws);if(ws.scrollCenter)ws.scrollCenter();}return true;})()")
    time.sleep(0.8)
    cdp.screenshot(os.path.join(SHOTS, name + ".png"))
    info = json.loads(ev(cdp, """(()=>{const ws=window.__blocklyWorkspace;const reg=window.BlockPyLibRegistry;
      const blocks=ws?ws.getAllBlocks(false):[]; const gray=blocks.filter(b=>b.type==='raw_statement'||b.type==='raw_expression').length;
      let unrendered=0, warned=0;
      for(const b of blocks){ try{ if(!b.getSvgRoot||!b.getSvgRoot())unrendered++; if(b.warning||(b.getWarningText&&b.getWarningText()))warned++; }catch(e){} }
      const calls=[]; for(const b of blocks){ if(b.type==='ir_call'){const fn=b.funcName_;
        if(fn&&String(fn).indexOf('.')>=0) calls.push(String(fn)); } }
      return JSON.stringify({nblocks:blocks.length,gray,unrendered,warned,calls});})()"""))
    regen = ev(cdp, """(async()=>{const ws=window.__blocklyWorkspace;if(!ws||ws.getAllBlocks(false).length===0)return null;
      const snap=window.Blockly.serialization.workspaces.save(ws);const ir=window.BlockPyIR.blocklyToIr(snap);
      const py=await window.BlockPyAstBridge.getPyodide();return await window.BlockPyAstBridge.irToPython(py, ir);})()""", aw=True)
    fails = []
    if info["nblocks"] == 0: fails.append("convert produced NO blocks")
    if info["gray"] > 0: fails.append(f"{info['gray']} gray/broken block(s)")
    if info["unrendered"] > 0: fails.append(f"{info['unrendered']} block(s) NOT rendered")
    if info["warned"] > 0: fails.append(f"{info['warned']} block(s) with a warning")
    if not regen: fails.append("no regenerated Python")
    else:
        try:
            if norm(code) != norm(regen): fails.append("round-trip AST mismatch")
        except SyntaxError as e: fails.append("regen invalid Python: " + str(e))
    for fn in info["calls"]:
        leaf = fn.split(".")[-1]
        tb = ev(cdp, "(" + TOOLBOX_CHECK + ")(%s, %s)" % (json.dumps(fn), json.dumps(leaf)))
        if isinstance(tb, str):
            try: tb = json.loads(tb)
            except Exception: tb = None
        if not (tb and tb.get("found")): fails.append("NOT in toolbox: " + fn)
    return fails

def main():
    reps = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    if not os.path.exists(EXE):
        print("ERROR: BlockPy.exe not found at", EXE, "\n(set BLOCKPY_EXE, or run `npm run dist` first)"); return 2
    ws = tempfile.mkdtemp(prefix="bp_e2e_"); env = dict(os.environ); env["BLOCKPY_WORKSPACE"] = ws; env["PYTHONIOENCODING"] = "utf-8"
    proc = subprocess.Popen([EXE, f"--remote-debugging-port={PORT}", "--remote-allow-origins=*"], cwd=os.path.dirname(EXE), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    res = []
    try:
        cdp = CDP(port=PORT, connect_timeout=60)
        assert cdp.wait_for("document.querySelector('#root')&&document.querySelector('#root').children.length", timeout=40)
        click(cdp, "#tab-btn-python"); cdp.wait_for("document.querySelector('#python-code')", timeout=20); time.sleep(5)
        for rep in range(reps):
            print(f"===== REP {rep+1}/{reps} =====")
            for name, code in SNIPPETS:
                fails = check(cdp, name, code); ok = not fails
                res.append(ok)
                print(("[PASS] " if ok else "[FAIL] ") + name + ("" if ok else " :: " + " | ".join(fails)))
    finally:
        try: cdp.close()
        except Exception: pass
        proc.terminate()
        try: proc.wait(timeout=10)
        except Exception: proc.kill()
    p = sum(1 for ok in res if ok)
    print(f"\n{p}/{len(res)} program-runs passed  (shots: {SHOTS})")
    return 0 if res and p == len(res) else 1

if __name__ == "__main__":
    sys.exit(main())
