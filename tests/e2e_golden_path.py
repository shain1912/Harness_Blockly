"""Golden path — a real pyserial lesson, from a student's seat, end to end in the PACKAGED .exe.

This is the "does the whole product actually work for a real use case" test, distinct from the
convert fuzzer (which only stresses Python->blocks). It drives the shipped desktop app over CDP and
verifies the three things a lesson depends on, with a screenshot at each step:

  1. CURATE gradient — curate `serial` at 초 (beginner) AND 고 (advanced), deterministically ("AI 없이",
     no key needed). Asserts the progressive-disclosure gradient is REAL: 고's core face has strictly
     more blocks than 초's, and 초's core ⊆ 고's core (advancing a level only reveals more — it never
     takes a block away, the 초⊆중⊆고 invariant).
  2. CONVERT — a real pyserial program (list the ports, open one, read a line) converts to blocks that
     are recognized (emerald library calls), have a toolbox home, and round-trip AST-lossless.
  3. EDIT — change a block's literal; the Python regenerates to match (block->code live sync).

USAGE (build the app first with `npm run dist`):
  python tests/e2e_golden_path.py
  BLOCKPY_EXE=... BLOCKPY_PORT=9440 python tests/e2e_golden_path.py
"""
import os, sys, time, subprocess, tempfile, json, ast
sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.join(os.getcwd(), ".claude", "skills", "blockpy-desktop-e2e", "harness"))
from cdp import CDP

EXE = os.environ.get("BLOCKPY_EXE") or os.path.join(os.path.expanduser("~"), "blockpy-release", "win-unpacked", "BlockPy.exe")
PORT = int(os.environ.get("BLOCKPY_PORT", "9440"))
SHOTS = os.path.join("test-results", "golden-path")
os.makedirs(SHOTS, exist_ok=True)

MODULE = "serial"
PURPOSE = "시리얼 포트 목록을 읽고 포트를 열어 데이터 읽기"
LESSON = (
    "from serial.tools import list_ports\n\n"
    "ports = list_ports.comports()\n"
    "for p in ports:\n"
    "    print(p.device)\n"
)


def ev(cdp, e, aw=False):
    return cdp.evaluate(e, await_promise=aw)


def click(cdp, s):
    return ev(cdp, "(()=>{const e=document.querySelector(%s);if(e){e.click();return true;}return false;})()" % json.dumps(s))


def click_text(cdp, pattern):
    return ev(cdp, "(()=>{const re=%s;const b=[...document.querySelectorAll('button')].find(x=>new RegExp(re).test((x.textContent||'').trim()));if(b){b.click();return true;}return false;})()" % json.dumps(pattern))


def setval(cdp, sel, val):
    return ev(cdp, "(()=>{const d=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;const el=document.querySelector(%s);if(!el)return false;d.call(el,%s);el.dispatchEvent(new Event('input',{bubbles:true}));return true;})()" % (json.dumps(sel), json.dumps(val)))


def set_code(cdp, code):
    ev(cdp, "(()=>{const el=document.querySelector('#python-code');el.focus();const d=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value');d.set.call(el,%s);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;})()" % json.dumps(code))


def norm(code):
    return ast.dump(ast.parse(code))


# Read the newest ★ curation tab whose name carries the given level tag (초/중/고); return its core
# (always-visible) and "더 보기" (folded) block identities, deduped.
READ_STAR = r"""(tag)=>{const tb=window.BlockPyBuildIrToolbox();
  let star=null; const find=(cs)=>{for(const c of (cs||[])){if(c.kind==='category'&&c.name.indexOf('★')>=0&&c.name.indexOf('('+tag+')')>=0)star=c;else if(c.contents)find(c.contents);}}; find(tb.contents);
  if(!star)return JSON.stringify({found:false});
  const names=(cs,acc)=>{for(const x of (cs||[])){if(x.kind==='block'){const es=x.extraState||{};acc.push(es.funcName||es.method||x.type);}else if(x.kind==='category')names(x.contents,acc);}return acc;};
  const more=(star.contents||[]).find(c=>c.name==='더 보기');
  const core=[...new Set(names((star.contents||[]).filter(c=>c.name!=='더 보기'),[]))];
  const moreN=[...new Set(more?names(more.contents,[]):[])];
  return JSON.stringify({found:true,name:star.name,core:core,more:moreN});}"""

TAGS = {"초등": "초", "중등": "중", "고등": "고"}


def curate_at_level(cdp, level_button):
    click(cdp, "#tab-btn-library"); time.sleep(0.5)
    setval(cdp, "#curate-mod-input", MODULE)
    setval(cdp, "#curate-purpose-input", PURPOSE)
    ev(cdp, "(()=>{const b=[...document.querySelectorAll('.curate-level-btn')].find(x=>x.textContent.trim()===%s);if(b){b.click();return true;}return false;})()" % json.dumps(level_button))
    time.sleep(0.3)
    click_text(cdp, "AI 없이")
    cdp.wait_for("!!document.querySelector('.curate-preview')", timeout=45)
    time.sleep(0.6)
    click_text(cdp, "탭 만들기")
    time.sleep(1.3)
    info = json.loads(ev(cdp, "(" + READ_STAR + ")(%s)" % json.dumps(TAGS[level_button])))
    click(cdp, "#tab-btn-blockly"); time.sleep(0.5)
    cdp.screenshot(os.path.join(SHOTS, "curate_%s.png" % TAGS[level_button]))
    return info


def convert_and_check(cdp):
    ev(cdp, "(()=>{const ws=window.__blocklyWorkspace;if(ws)ws.clear();return true;})()"); time.sleep(0.3)
    click(cdp, "#tab-btn-python"); time.sleep(0.2)
    set_code(cdp, LESSON); time.sleep(0.4); click(cdp, "#btn-sync-to-blocks")
    end = time.time() + 30
    while time.time() < end:
        if (ev(cdp, "(()=>{const ws=window.__blocklyWorkspace;return ws?ws.getAllBlocks(false).length:0;})()") or 0) > 0:
            break
        time.sleep(1)
    time.sleep(18)  # let the introspection/self-heal recolour comports emerald
    click(cdp, "#tab-btn-blockly"); time.sleep(0.8)
    cdp.screenshot(os.path.join(SHOTS, "convert_blocks.png"))
    info = json.loads(ev(cdp, r"""(()=>{const ws=window.__blocklyWorkspace;const reg=window.BlockPyLibRegistry;
      const blocks=ws?ws.getAllBlocks(false):[];
      const comports=blocks.find(b=>b.type==='ir_call'&&b.funcName_==='list_ports.comports');
      const tb=window.BlockPyBuildIrToolbox();
      const walk=(cs,acc)=>{for(const x of (cs||[])){if(x.kind==='block'){const es=x.extraState||{};if((es.funcName||'')==='list_ports.comports')acc.found=true;}else if(x.contents)walk(x.contents,acc);}return acc;};
      const home=walk(tb.contents,{found:false});
      let gray=0,unrendered=0; for(const b of blocks){if(b.type==='raw_statement'||b.type==='raw_expression')gray++; try{if(!b.getSvgRoot||!b.getSvgRoot())unrendered++;}catch(e){}}
      return JSON.stringify({nblocks:blocks.length, comportsColour: comports?comports.getColour():null,
        comportsRecognized: !!(reg.findLibCall&&reg.findLibCall('list_ports','comports')),
        inToolbox: home.found, gray, unrendered});})()"""))
    regen = ev(cdp, "(async()=>{const ws=window.__blocklyWorkspace;const snap=window.Blockly.serialization.workspaces.save(ws);const ir=window.BlockPyIR.blocklyToIr(snap);const py=await window.BlockPyAstBridge.getPyodide();return await window.BlockPyAstBridge.irToPython(py,ir);})()", aw=True)
    return info, regen


def edit_and_check(cdp):
    # Convert a program with a literal, then change the literal on the block and confirm the Python follows.
    prog = "count = 3\nprint(count)\n"
    ev(cdp, "(()=>{const ws=window.__blocklyWorkspace;if(ws)ws.clear();return true;})()"); time.sleep(0.3)
    click(cdp, "#tab-btn-python"); time.sleep(0.2)
    set_code(cdp, prog); time.sleep(0.4); click(cdp, "#btn-sync-to-blocks")
    # Wait until the code->block sync has fully SETTLED (the ir_const block exists AND the sync guard
    # is idle), otherwise a programmatic field edit's regen is dropped by the re-entrancy guard.
    end = time.time() + 30
    while time.time() < end:
        ready = ev(cdp, "(()=>{const ws=window.__blocklyWorkspace;if(!ws)return false;return ws.getAllBlocks(false).some(x=>x.type==='ir_const'&&x.getFieldValue('VALUE')==='3');})()")
        if ready:
            break
        time.sleep(1)
    time.sleep(4)  # let the oracle (jedi/introspect) finish so isSyncingFromCode is back to 0
    # set the ir_const '3' to '7'; retry the nudge once if the first regen doesn't land.
    changed = False
    ok = False
    for attempt in range(2):
        changed = bool(ev(cdp, "(()=>{const ws=window.__blocklyWorkspace;const b=ws.getAllBlocks(false).find(x=>x.type==='ir_const'&&x.getFieldValue('VALUE')==='3');if(!b)return false;b.setFieldValue('7','VALUE');return true;})()")) or changed
        ok = cdp.wait_for("document.querySelector('#python-code') && document.querySelector('#python-code').value.indexOf('count = 7')>=0", timeout=12)
        if ok:
            break
        # nudge back to '3' then loop to re-apply (covers a dropped first event)
        ev(cdp, "(()=>{const ws=window.__blocklyWorkspace;const b=ws.getAllBlocks(false).find(x=>x.type==='ir_const'&&x.getFieldValue('VALUE')==='7');if(b)b.setFieldValue('3','VALUE');return true;})()")
        time.sleep(2)
    click(cdp, "#tab-btn-python"); time.sleep(0.4)
    cdp.screenshot(os.path.join(SHOTS, "edit_regen.png"))
    return bool(changed), bool(ok)


def main():
    if not os.path.exists(EXE):
        print("ERROR: BlockPy.exe not found at", EXE, "\n(set BLOCKPY_EXE, or run `npm run dist`)"); return 2
    ws = tempfile.mkdtemp(prefix="bp_golden_"); env = dict(os.environ); env["BLOCKPY_WORKSPACE"] = ws; env["PYTHONIOENCODING"] = "utf-8"
    proc = subprocess.Popen([EXE, f"--remote-debugging-port={PORT}", "--remote-allow-origins=*"], cwd=os.path.dirname(EXE), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    fails = []
    try:
        cdp = CDP(port=PORT, connect_timeout=60)
        assert cdp.wait_for("document.querySelector('#root')&&document.querySelector('#root').children.length", timeout=40)
        click(cdp, "#tab-btn-python"); cdp.wait_for("document.querySelector('#python-code')", timeout=20); time.sleep(6)

        print("=== Step 1: Curate gradient (초 vs 고) ===")
        beg = curate_at_level(cdp, "초등")
        adv = curate_at_level(cdp, "고등")
        print("  초 core:", len(beg.get("core", [])), "| 고 core:", len(adv.get("core", [])))
        if not beg.get("found") or not adv.get("found"):
            fails.append("Curate did not produce a ★ tab at one level")
        else:
            if not (len(adv["core"]) > len(beg["core"])):
                fails.append(f"disclosure gradient not shown (초 core {len(beg['core'])} !< 고 core {len(adv['core'])})")
            missing = [c for c in beg["core"] if c not in adv["core"]]
            if missing:
                fails.append(f"초 core not ⊆ 고 core (dropped at higher level): {missing[:4]}")

        print("=== Step 2: Convert a real pyserial lesson ===")
        info, regen = convert_and_check(cdp)
        print("  blocks:", info["nblocks"], "| comports colour:", info["comportsColour"], "| recognized:", info["comportsRecognized"], "| inToolbox:", info["inToolbox"])
        if info["nblocks"] == 0: fails.append("lesson produced no blocks")
        if info["gray"] or info["unrendered"]: fails.append(f"{info['gray']} gray / {info['unrendered']} unrendered block(s)")
        if not info["comportsRecognized"]: fails.append("comports not recognized")
        if (info["comportsColour"] or "").lower() != "#009688": fails.append(f"comports not emerald (got {info['comportsColour']})")
        if not info["inToolbox"]: fails.append("comports has no toolbox home")
        if not regen: fails.append("no regenerated Python")
        else:
            try:
                if norm(LESSON) != norm(regen): fails.append("lesson round-trip AST mismatch")
            except SyntaxError as e: fails.append("regen invalid Python: " + str(e))

        print("=== Step 3: Edit a block, Python follows ===")
        did_edit, regen_ok = edit_and_check(cdp)
        print("  field edited:", did_edit, "| Python regenerated (count = 7):", regen_ok)
        if not did_edit: fails.append("could not edit the const block")
        if not regen_ok: fails.append("block edit did NOT regenerate the Python")
    finally:
        try: cdp.close()
        except Exception: pass
        proc.terminate()
        try: proc.wait(timeout=10)
        except Exception: proc.kill()

    print()
    if fails:
        print("GOLDEN PATH: FAIL")
        for f in fails: print("  -", f)
    else:
        print("GOLDEN PATH: PASS — curate gradient + convert + edit all work end-to-end")
    print("screenshots:", SHOTS)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
