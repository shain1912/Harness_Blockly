# Trigger-accuracy evaluation

20 realistic queries (10 should-trigger, 10 should-not — the should-not set is deliberately
near-miss: "fix the /blockify 500 bug", "write unit tests for codegen.js", "make a toolbox
category for my hand-written sprite blocks", "import cv2 in pyodide and run it", etc.).

Measured directly against the **real installed skill** with `trigger_probe.py` (runs each query
through `claude -p`, detects the streamed `Skill` tool_use early, kills before the task runs;
Windows-safe — threads + line iteration, no `select()`).

> Note: the official skill-creator `run_loop.py` mis-measures here because it registers a *temp*
> command with a random name and checks for that name, while this skill is already installed —
> so Claude triggers the real skill and the harness never matches. `trigger_probe.py` measures
> the real skill by its real name instead.

## Result (model: claude-opus-4-8)

| metric | before | after |
|---|---|---|
| accuracy | 95% (19/20) | 100% (20/20) |
| precision | 100% | 100% |
| recall | 90% | 100% |

The one miss before tuning was a local `./mylib.py` custom-module request; the description was
broadened to explicitly cover "a local .py module / their own module/.py file", which fixed
recall with no precision regression (the near-miss should-not queries still correctly stay off).

Re-run: `PYTHONUTF8=1 python .claude/skills/blockify-python-library/evals/trigger_probe.py .claude/skills/blockify-python-library/evals/trigger-eval.json`
