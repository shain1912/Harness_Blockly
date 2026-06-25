#!/usr/bin/env python3
"""Launch the BlockPy desktop app (Electron .exe) and inspect its UI one element at a
time over CDP — taking a real screenshot of each step and asserting it is present /
visible / has the expected text. Emits an annotate-compatible shots/manifest.json plus
a pass/fail report.html and exits non-zero if any check fails.

Usage:
  python run_e2e.py --dev                       # launch ./node_modules/electron with the repo
  python run_e2e.py --exe "C:/.../BlockPy.exe"   # launch the packaged app
  python run_e2e.py --dev --checklist checklist.json --out shots/ --keep-open

The app is launched with --remote-debugging-port; Python attaches to that page over the
Chrome DevTools Protocol (see cdp.py). A temp workspace (BLOCKPY_WORKSPACE) is used so the
file tree is deterministic (seeded main.py + sample.jpg) unless --workspace is given.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from cdp import CDP, CDPError  # noqa: E402

REPO_DEFAULT = HERE.parents[3]  # .claude/skills/blockpy-desktop-e2e/harness -> repo root


# ── JS snippets evaluated in the page ────────────────────────────────────────────
def _inspect_js(selector):
    s = json.dumps(selector)
    return ("(() => { const sel = " + s + ";"
            "const els=[...document.querySelectorAll(sel)]; const el=els[0];"
            "if(!el) return {count:0,visible:false,text:null,rect:null};"
            "const r=el.getBoundingClientRect(); const cs=getComputedStyle(el);"
            "const visible=!!(r.width&&r.height)&&cs.visibility!=='hidden'&&cs.display!=='none'&&parseFloat(cs.opacity||'1')>0.01;"
            "return {count:els.length,visible,text:((el.innerText||el.value||'')+'').slice(0,200),"
            "rect:{x:r.x,y:r.y,width:r.width,height:r.height}};})()")


def _click_js(selector):
    s = json.dumps(selector)
    return ("(() => { const el=document.querySelector(" + s + ");"
            "if(!el) return false; el.scrollIntoView({block:'center'}); el.click(); return true;})()")


def _click_text_js(selector, text):
    s = json.dumps(selector); t = json.dumps(text)
    return ("(() => { const t=" + t + ";"
            "const el=[...document.querySelectorAll(" + s + ")].find(e=>((e.innerText||'')+'').includes(t));"
            "if(!el) return false; el.scrollIntoView({block:'center'}); el.click(); return true;})()")


def _type_js(selector, text):
    s = json.dumps(selector); t = json.dumps(text)
    return ("(() => { const el=document.querySelector(" + s + ");"
            "if(!el) return false; el.focus();"
            "const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')"
            "||Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value');"
            "if(set&&set.set){set.set.call(el," + t + ");}else{el.value=" + t + ";}"
            "el.dispatchEvent(new Event('input',{bubbles:true}));"
            "el.dispatchEvent(new Event('change',{bubbles:true})); return true;})()")


def _highlight_js(selector, on=True):
    s = json.dumps(selector)
    if on:
        return ("(() => { const el=document.querySelector(" + s + "); if(!el) return false;"
                "el.dataset._oldOutline=el.style.outline||''; el.dataset._oldOffset=el.style.outlineOffset||'';"
                "el.style.outline='3px solid #E8483C'; el.style.outlineOffset='2px';"
                "el.scrollIntoView({block:'center'}); return true;})()")
    return ("(() => { const el=document.querySelector(" + s + "); if(!el) return false;"
            "el.style.outline=el.dataset._oldOutline||''; el.style.outlineOffset=el.dataset._oldOffset||''; return true;})()")


# ── app launch ───────────────────────────────────────────────────────────────────
def launch_app(args, port, workspace):
    env = dict(os.environ)
    env["BLOCKPY_WORKSPACE"] = workspace
    env["PYTHONIOENCODING"] = "utf-8"
    # Chromium 111+ rejects CDP websocket connects unless the origin is allow-listed.
    dbg = [f"--remote-debugging-port={port}", "--remote-allow-origins=*"]
    if args.exe:
        exe = Path(args.exe)
        if not exe.exists():
            sys.exit(f"--exe not found: {exe}")
        cmd = [str(exe), *dbg]
        cwd = str(exe.parent)
    else:
        electron = REPO_DEFAULT / "node_modules" / "electron" / "dist" / "electron.exe"
        if not electron.exists():
            sys.exit(f"dev electron not found at {electron} — run npm install, or pass --exe")
        cmd = [str(electron), str(REPO_DEFAULT), *dbg]
        cwd = str(REPO_DEFAULT)
    print(f"[launch] {' '.join(cmd)}")
    return subprocess.Popen(cmd, cwd=cwd, env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


# ── checklist execution ───────────────────────────────────────────────────────────
def do_action(cdp, action):
    if "click" in action:
        if not cdp.evaluate(_click_js(action["click"])):
            raise CDPError(f"click target not found: {action['click']}")
    elif "clickText" in action:
        sel, txt = action["clickText"]
        if not cdp.evaluate(_click_text_js(sel, txt)):
            raise CDPError(f"clickText not found: {sel} ~ {txt}")
    elif "type" in action:
        sel, txt = action["type"]
        if not cdp.evaluate(_type_js(sel, txt)):
            raise CDPError(f"type target not found: {sel}")
    elif "waitFor" in action:
        if not cdp.wait_for(f"document.querySelector({json.dumps(action['waitFor'])})",
                            timeout=action.get("timeout", 15)):
            raise CDPError(f"waitFor timed out: {action['waitFor']}")
    elif "evaluate" in action:
        cdp.evaluate(action["evaluate"], await_promise=action.get("await", False))
    elif "sleep" in action:
        time.sleep(action["sleep"] / 1000)
    else:
        raise CDPError(f"unknown action: {action}")


def run_check(cdp, check):
    """Return (passed: bool, info: dict, reasons: list[str])."""
    info = cdp.evaluate(_inspect_js(check["selector"]))
    reasons = []
    expect_exists = check.get("exists", True)
    if not expect_exists:
        # Negative assertion: the element must be ABSENT (e.g. the removed sprite canvas).
        if info["count"] >= 1:
            reasons.append("element should be absent but exists")
        return (len(reasons) == 0, info, reasons)
    if info["count"] < 1:
        reasons.append("element not found")
    if check.get("visible", True) and info["count"] >= 1 and not info["visible"]:
        reasons.append("element not visible")
    if "minCount" in check and info["count"] < check["minCount"]:
        reasons.append(f"count {info['count']} < minCount {check['minCount']}")
    if "textIncludes" in check:
        txt = info.get("text") or ""
        if check["textIncludes"] not in txt:
            reasons.append(f"text {txt!r} missing {check['textIncludes']!r}")
    return (len(reasons) == 0, info, reasons)


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--dev", action="store_true", help="launch ./node_modules electron with the repo")
    g.add_argument("--exe", help="path to the packaged BlockPy.exe")
    ap.add_argument("--port", type=int, default=9222)
    ap.add_argument("--checklist", default=str(HERE / "checklist.json"))
    ap.add_argument("--out", default=str(HERE.parent / "shots"))
    ap.add_argument("--workspace", default=None, help="workspace dir (default: a temp dir)")
    ap.add_argument("--keep-open", action="store_true", help="don't kill the app at the end")
    args = ap.parse_args()
    if not args.dev and not args.exe:
        args.dev = True  # default to dev launch

    checklist = json.loads(Path(args.checklist).read_text(encoding="utf-8"))
    out_dir = Path(args.out); out_dir.mkdir(parents=True, exist_ok=True)
    workspace = args.workspace or tempfile.mkdtemp(prefix="blockpy_e2e_ws_")

    proc = launch_app(args, args.port, workspace)
    cdp = None
    shots, results = [], []
    try:
        cdp = CDP(port=args.port, page_url_prefix="http://127.0.0.1", connect_timeout=50)
        # App ready: React mounted + Blockly global + a block workspace exists.
        ready = cdp.wait_for(
            "window.Blockly && document.querySelector('#root') && "
            "document.querySelector('#root').children.length>0", timeout=40)
        if not ready:
            raise CDPError("app did not become ready (React/Blockly) within 40s")
        time.sleep(checklist.get("settle", 800) / 1000)
        dsf = cdp.device_pixel_ratio()

        for step in checklist["steps"]:
            sid = step["id"]
            ok, info, reasons = True, None, []
            try:
                for action in step.get("do", []):
                    do_action(cdp, action)
                time.sleep(step.get("settle", checklist.get("settle", 500)) / 1000)
                if "check" in step:
                    ok, info, reasons = run_check(cdp, step["check"])
            except CDPError as e:
                ok, reasons = False, [str(e)]

            # Highlight the inspected element, screenshot, un-highlight.
            hl_sel = step.get("highlight") or (step.get("check") or {}).get("selector")
            if hl_sel:
                try: cdp.evaluate(_highlight_js(hl_sel, True))
                except CDPError: pass
            img_name = f"{sid}.png"
            cdp.screenshot(out_dir / img_name)
            if hl_sel:
                try: cdp.evaluate(_highlight_js(hl_sel, False))
                except CDPError: pass

            ann = []
            if info and info.get("rect") and info["rect"]["width"]:
                ann.append({"type": "box", "box": info["rect"], "label": sid,
                            "color": "#2BA24C" if ok else "#E8483C"})
            shots.append({"step_id": sid, "title": step.get("title", ""),
                          "caption": step.get("caption", ""), "image": img_name,
                          "annotated": f"{sid}.annotated.png", "annotate": ann})
            results.append({"id": sid, "title": step.get("title", ""), "ok": ok,
                            "reasons": reasons, "info": info})
            status = "PASS" if ok else "FAIL"
            print(f"  [{status}] {sid}  {step.get('title','')}"
                  + ("" if ok else f"   -> {'; '.join(reasons)}"))

        manifest = {"tutorial": checklist.get("title", "BlockPy desktop E2E"),
                    "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "device_scale_factor": dsf, "shots": shots}
        (out_dir / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        write_report(out_dir, checklist, results, dsf, workspace)
    finally:
        if cdp:
            cdp.close()
        if not args.keep_open:
            try: proc.terminate()
            except Exception: pass

    n_fail = sum(1 for r in results if not r["ok"])
    print(f"\n{len(results)-n_fail}/{len(results)} checks passed. "
          f"Shots + report in {out_dir}")
    sys.exit(1 if n_fail else 0)


def write_report(out_dir, checklist, results, dsf, workspace):
    rows = []
    for r in results:
        info = r.get("info") or {}
        badge = "✅" if r["ok"] else "❌"
        reasons = "" if r["ok"] else "<br><span style='color:#c0392b'>" + "; ".join(r["reasons"]) + "</span>"
        text = (info.get("text") or "").replace("<", "&lt;")[:80]
        rows.append(
            f"<tr><td>{badge}</td><td>{r['id']}</td><td>{r['title']}{reasons}</td>"
            f"<td><code>{info.get('count','-')}</code></td><td><code>{text}</code></td>"
            f"<td><img src='{r['id']}.png' width='320'></td></tr>")
    n_fail = sum(1 for r in results if not r["ok"])
    html = (
        "<!doctype html><meta charset='utf-8'><title>BlockPy desktop E2E</title>"
        "<style>body{font:14px system-ui;margin:24px;background:#faf9f5;color:#141413}"
        "table{border-collapse:collapse;width:100%}td,th{border:1px solid #e6dfd8;padding:8px;vertical-align:top}"
        "img{border:1px solid #ddd;border-radius:6px}h1{font-weight:600}</style>"
        f"<h1>{checklist.get('title','BlockPy desktop E2E')}</h1>"
        f"<p>{len(results)-n_fail}/{len(results)} passed · dsf={dsf} · workspace=<code>{workspace}</code> · {time.strftime('%Y-%m-%d %H:%M:%S')}</p>"
        "<table><tr><th></th><th>id</th><th>step</th><th>count</th><th>text</th><th>screenshot</th></tr>"
        + "".join(rows) + "</table>")
    (out_dir / "report.html").write_text(html, encoding="utf-8")
    (out_dir / "report.json").write_text(
        json.dumps({"passed": len(results) - n_fail, "total": len(results),
                    "results": results}, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
