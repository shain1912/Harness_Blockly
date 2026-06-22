import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateSpec } from '../spec.js';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '_inspect.py');

// Introspect an importable Python module via a real `python` subprocess -> LibrarySpec.
export function introspectModule(name, opts = {}) {
  const { python = 'python', maxEntries = 200, includePrivate = false, cwd } = opts;
  const args = [SCRIPT, name, `--max=${maxEntries}`];
  if (includePrivate) args.push('--include-private');
  return new Promise((resolve, reject) => {
    let proc;
    try { proc = spawn(python, args, { cwd }); }
    catch (e) { return reject(new Error(`blockpy-gen: failed to spawn '${python}': ${e.message}`)); }
    let out = '', err = '';
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { err += d; });
    proc.on('error', (e) => reject(new Error(`blockpy-gen: failed to run '${python}': ${e.message}`)));
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`blockpy-gen: introspection of '${name}' failed:\n${err.trim() || 'exit ' + code}`));
      let spec;
      try { spec = JSON.parse(out); }
      catch (e) { return reject(new Error(`blockpy-gen: bad introspection output: ${e.message}\n${out.slice(0, 200)}`)); }
      const bad = validateSpec(spec);
      if (bad) return reject(new Error('blockpy-gen: introspection produced an invalid spec — ' + bad));
      resolve(spec);
    });
  });
}
