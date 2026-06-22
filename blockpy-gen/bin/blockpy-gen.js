#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { introspectModule } from '../src/introspect/introspect.js';
import { createBlockifyServer } from '../src/server/blockify.js';

function flag(args, name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; }

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'serve') {
    const port = Number(flag(rest, '--port')) || 7799;
    const allow = (flag(rest, '--allow') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const python = flag(rest, '--python') || 'python';
    createBlockifyServer({ allow: allow.length ? allow : null, python })
      .listen(port, () => console.log(`[blockpy-gen] serving /blockify on http://127.0.0.1:${port}` + (allow.length ? ` (allow: ${allow.join(', ')})` : ' (NO allowlist — trusted network only!)')));
    return;
  }
  const name = cmd;
  if (!name || name.startsWith('--')) { console.error('usage: blockpy-gen <module> [--out f] [--python p] [--max N] [--include-private]\n       blockpy-gen serve [--port N] [--allow a,b] [--python p]'); process.exit(2); }
  const spec = await introspectModule(name, {
    python: flag(rest, '--python') || 'python',
    maxEntries: Number(flag(rest, '--max')) || 200,
    includePrivate: rest.includes('--include-private'),
  });
  const out = flag(rest, '--out');
  const json = JSON.stringify(spec, null, 2);
  if (out) { writeFileSync(out, json); console.error(`[blockpy-gen] wrote ${spec.entries.length} entries -> ${out}`); }
  else process.stdout.write(json + '\n');
}
main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
