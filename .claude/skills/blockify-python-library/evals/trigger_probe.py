"""Direct trigger-accuracy probe for the REAL installed blockify-python-library skill.

The skill-creator harness writes a temp command with a random name and checks for that name,
but our skill is already installed in .claude/skills/, so Claude triggers the real skill
(name never matches the random temp name). This probe instead runs each query through
`claude -p` in the repo (where the real skill is available) and detects whether Claude invokes
the `blockify-python-library` skill via the Skill tool, using the streamed tool_use event so we
can kill early (before the triggered task actually runs). Windows-safe: threads + line iteration,
no select().
"""
import json, os, subprocess, sys, threading
from concurrent.futures import ThreadPoolExecutor

SKILL = "blockify-python-library"
MODEL = "claude-opus-4-8"
TIMEOUT = 60
EVAL = sys.argv[1] if len(sys.argv) > 1 else "trigger-eval.json"

def probe(query):
    cmd = ["claude", "-p", query, "--output-format", "stream-json", "--verbose",
           "--include-partial-messages", "--model", MODEL]
    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env)
    wd = threading.Timer(TIMEOUT, lambda: (p.poll() is None) and p.kill())
    wd.start()
    pending = None
    acc = ""
    try:
        for raw in p.stdout:
            line = raw.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue
            if e.get("type") == "stream_event":
                se = e.get("event", {})
                t = se.get("type", "")
                if t == "content_block_start":
                    cb = se.get("content_block", {})
                    if cb.get("type") == "tool_use":
                        if cb.get("name") in ("Skill", "Read"):
                            pending = cb.get("name"); acc = ""
                        else:
                            return False   # went straight to a different tool
                elif t == "content_block_delta" and pending:
                    d = se.get("delta", {})
                    if d.get("type") == "input_json_delta":
                        acc += d.get("partial_json", "")
                        if SKILL in acc:
                            return True
                elif t in ("content_block_stop", "message_stop"):
                    if pending:
                        return SKILL in acc
                    if t == "message_stop":
                        return False
            elif e.get("type") == "assistant":
                for c in e.get("message", {}).get("content", []):
                    if c.get("type") != "tool_use":
                        continue
                    if c.get("name") == "Skill" and SKILL in c.get("input", {}).get("skill", ""):
                        return True
                    if c.get("name") == "Read" and SKILL in c.get("input", {}).get("file_path", ""):
                        return True
                    return False
            elif e.get("type") == "result":
                return False
    finally:
        wd.cancel()
        if p.poll() is None:
            p.kill(); p.wait()
    return False

evals = json.loads(open(EVAL, encoding="utf-8").read())
results = [None] * len(evals)
def run(i):
    results[i] = probe(evals[i]["query"])
with ThreadPoolExecutor(max_workers=5) as ex:
    list(ex.map(run, range(len(evals))))

tp = fp = tn = fn = 0
print(f"{'exp':>5} {'got':>5}  query")
for ev, got in zip(evals, results):
    exp = ev["should_trigger"]
    ok = (exp == got)
    if exp and got: tp += 1
    elif exp and not got: fn += 1
    elif not exp and got: fp += 1
    else: tn += 1
    print(f"{str(exp):>5} {str(got):>5}  {'OK ' if ok else 'XX '}{ev['query'][:64]}")
total = len(evals)
acc = (tp + tn) / total if total else 0
prec = tp / (tp + fp) if (tp + fp) else 1.0
rec = tp / (tp + fn) if (tp + fn) else 1.0
print(f"\naccuracy={acc:.0%} ({tp+tn}/{total})  precision={prec:.0%}  recall={rec:.0%}")
print(f"TP={tp} FN={fn}  TN={tn} FP={fp}")
