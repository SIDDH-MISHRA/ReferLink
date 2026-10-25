// Local dev server: serves public/ like Vercel does and answers Supabase-style
// RPC calls from a local database. Run: npm start  →  http://localhost:3000
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, rpc } from './db.js';

const ROOT = fileURLToPath(new URL('../public/', import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const db = await openDb(fileURLToPath(new URL('./.pgdata', import.meta.url)));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain', '.mp4': 'video/mp4', '.jpg': 'image/jpeg',
};

// "/r/:slug" -> /^\/r\/[^/]+$/
const rewrites = (vercel.rewrites || []).map((r) => ({
  re: new RegExp('^' + r.source.replace(/:[a-z]+/gi, '[^/]+') + '$'),
  dest: r.destination,
}));
const globalHeaders = (vercel.headers || []).find((h) => h.source === '/(.*)')?.headers || [];

const DEV_CONFIG = `window.REFERLINK_CONFIG = {
  supabaseUrl: location.origin,
  supabaseKey: 'local-dev-key',
  posthogKey: '',
  posthogHost: 'https://us.i.posthog.com',
  dev: true
};`;

async function fileExists(p) {
  try { return (await stat(p)).isFile(); } catch { return false; }
}

async function serveStatic(req, res, path) {
  // LIVE=1 tries the pages against the real Supabase in config.js (analytics stays off).
  if (path === '/js/config.js' && process.env.LIVE) {
    const live = (await readFile(join(ROOT, 'js/config.js'), 'utf8')).replace(/posthogKey: '[^']*'/, "posthogKey: ''");
    return send(res, 200, live, TYPES['.js']);
  }
  if (path === '/js/config.js') return send(res, 200, DEV_CONFIG, TYPES['.js']);

  // Like Vercel's cleanUrls: "/x.html" redirects to "/x", and a rewrite to a ".html" path finds nothing.
  if (vercel.cleanUrls && path.endsWith('.html')) {
    res.writeHead(308, { Location: (path.slice(0, -5) || '/') + new URL(req.url, 'http://local').search });
    return res.end();
  }
  for (const r of rewrites) if (r.re.test(path)) { path = r.dest; break; }
  if (vercel.cleanUrls && path.endsWith('.html')) return send(res, 404, await readFile(join(ROOT, '404.html')), TYPES['.html']);
  if (path.endsWith('/')) path += 'index.html';

  let file = normalize(join(ROOT, decodeURIComponent(path)));
  if (!file.startsWith(normalize(ROOT))) return send(res, 403, 'Forbidden', 'text/plain');
  if (!extname(file) && (await fileExists(file + '.html'))) file += '.html';

  if (await fileExists(file)) {
    const body = await readFile(file);
    const type = TYPES[extname(file)] || 'application/octet-stream';
    // Videos need byte ranges, like Vercel serves them.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && type.startsWith('video/')) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
      res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + body.length);
      res.setHeader('Accept-Ranges', 'bytes');
      return send(res, 206, body.subarray(start, end + 1), type);
    }
    return send(res, 200, body, type);
  }
  return send(res, 404, await readFile(join(ROOT, '404.html')), TYPES['.html']);
}

async function handleRpc(req, res, fn) {
  let body = '';
  for await (const chunk of req) body += chunk;
  try {
    const result = await rpc(db, fn, body ? JSON.parse(body) : {});
    send(res, 200, JSON.stringify(result), 'application/json');
  } catch (e) {
    // Same shape as Supabase errors: { code, message }
    const status = e.code === 'P0001' ? 400 : e.code === '42883' ? 404 : e.code === '42501' ? 401 : 400;
    send(res, status, JSON.stringify({ code: e.code || 'error', message: e.message }), 'application/json');
  }
}

function send(res, status, body, type) {
  for (const h of globalHeaders) res.setHeader(h.key, h.value);
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const m = pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
  if (m && req.method === 'POST') return handleRpc(req, res, m[1]);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
  return serveStatic(req, res, pathname);
}).listen(PORT, () => console.log(`ReferLink dev server: http://localhost:${PORT}`));
