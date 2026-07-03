import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateSpec } from '../spec.js';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '_inspect.py');

// Kill a spawned python AND anything it spawned. On win32 proc.kill() only signals the direct
// process (children survive), so take down the whole tree with taskkill; elsewhere SIGKILL.
function killTree(proc) {
  if (!proc || proc.killed || proc.pid == null) return;
  try {
    if (process.platform === 'win32') {
      // no-op 'error' handler: an unhandled ChildProcess 'error' would itself crash the process
      spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
        .on('error', () => { try { proc.kill(); } catch (_) {} });
    } else {
      proc.kill('SIGKILL');
    }
  } catch (_) {
    try { proc.kill(); } catch (_) {}
  }
}

// Introspect an importable Python module via a real `python` subprocess -> LibrarySpec.
export function introspectModule(name, opts = {}) {
  const { python = 'python', maxEntries = 1000, includePrivate = false, cwd, timeoutMs = 60000 } = opts;
  const args = [SCRIPT, name, `--max=${maxEntries}`];
  if (includePrivate) args.push('--include-private');
  return new Promise((resolve, reject) => {
    let proc;
    // stdin 'ignore': _inspect.py never reads stdin, and a module that calls input() at top level
    // then gets an immediate EOFError instead of blocking forever on an open pipe. The UTF-8 env
    // keeps non-ASCII docstrings intact on cp949 (Korean Windows) consoles.
    try {
      proc = spawn(python, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      });
    }
    catch (e) { return reject(new Error(`blockpy-gen: failed to spawn '${python}': ${e.message}`)); }
    // Settle exactly once: spawn of a missing command fires BOTH 'error' and 'close', and the
    // timeout races with 'close' — only the first outcome wins.
    let settled = false;
    let timer = null;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    // A module that blocks on import (input(), network wait, GUI loop) would leak a python
    // process forever — kill the tree and reject with a clear error instead.
    timer = setTimeout(() => {
      killTree(proc);
      settle(reject, new Error(`blockpy-gen: introspection of '${name}' timed out after ${timeoutMs}ms — the module blocks on import`));
    }, timeoutMs);
    let out = '', err = '';
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { err += d; });
    proc.on('error', (e) => settle(reject, new Error(`blockpy-gen: failed to run '${python}': ${e.message}`)));
    proc.on('close', (code) => {
      if (code !== 0) return settle(reject, new Error(`blockpy-gen: introspection of '${name}' failed:\n${err.trim() || 'exit ' + code}`));
      let spec;
      try { spec = JSON.parse(out); }
      catch (e) { return settle(reject, new Error(`blockpy-gen: bad introspection output: ${e.message}\n${out.slice(0, 200)}`)); }
      const bad = validateSpec(spec);
      if (bad) return settle(reject, new Error('blockpy-gen: introspection produced an invalid spec — ' + bad));
      settle(resolve, spec);
    });
  });
}
