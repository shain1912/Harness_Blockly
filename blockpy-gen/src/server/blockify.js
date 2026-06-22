import http from 'node:http';
import { introspectModule as defaultIntrospect } from '../introspect/introspect.js';

// Live "Add Library" endpoint. Wraps introspection over HTTP with caching + an allowlist.
// `opts.introspect` is injectable for tests; defaults to the real python introspection.
export function blockifyMiddleware(opts = {}) {
  const { allow = null, cache = true, introspect = defaultIntrospect } = opts;
  const store = new Map();
  if (!allow) console.warn('[blockpy-gen] no allowlist set — /blockify will import ANY requested module (code execution). Use { allow: [...] } and a trusted network.');
  return async function (req, res, next) {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/blockify') { if (typeof next === 'function') return next(); res.statusCode = 404; return res.end('not found'); }
    let mod = url.searchParams.get('module');
    let includePrivate = url.searchParams.get('includePrivate') === '1';
    if (!mod && req.method === 'POST') {
      const body = await readBody(req);
      try { const j = JSON.parse(body || '{}'); mod = j.module; includePrivate = !!j.includePrivate; } catch (_) {}
    }
    const send = (code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };
    if (!mod) return send(400, { error: 'missing ?module' });
    if (allow && !allow.includes(mod)) return send(403, { error: `module '${mod}' not in allowlist` });
    const key = mod + (includePrivate ? '|p' : '');
    if (cache && url.searchParams.get('refresh') !== '1' && store.has(key)) return send(200, store.get(key));
    try {
      const spec = await introspect(mod, { ...opts, includePrivate });
      if (cache) store.set(key, spec);
      send(200, spec);
    } catch (e) { send(500, { error: String(e.message || e) }); }
  };
}

function readBody(req) {
  return new Promise((resolve) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => resolve(b)); });
}

export function createBlockifyServer(opts = {}) {
  const mw = blockifyMiddleware(opts);
  return http.createServer((req, res) => mw(req, res, null));
}
