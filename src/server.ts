import { readdirSync } from 'node:fs';
import { createServer, STATUS_CODES } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Auth, type LoginError } from './auth.ts';
import { config } from './config.ts';
import { json, readBody, redirect, Router, sendStatic, type Req, type Res } from './http.ts';
import { MODES, TIERS, isMode } from './modes.ts';
import { cleanStyle, createOverlay, defaultStyle, LAYOUTS, type Layout, type Overlay } from './overlays.ts';
import { DemoStream, seedDemo } from './rl/demo.ts';
import { RlStream } from './rl/stream.ts';
import { Storage } from './storage.ts';
import { Tracker } from './tracker.ts';

const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));

const storage = new Storage(config.dbPath);
if (config.demo) seedDemo(storage);
const source = config.demo ? new DemoStream() : new RlStream(config.rlHost, config.rlPort);
const tracker = new Tracker(storage, source, config.demo);
const auth = new Auth(join(config.secretDir, 'session-secret'), config.sessionSecret, { name: config.adminUser, password: config.adminPassword });

// One overlay per layout to start with
if (storage.listOverlays().length === 0) for (const l of LAYOUTS) storage.saveOverlay(createOverlay(l));

// Live updates as Server-Sent Events (works in the OBS browser source without anything extra)
const clients = new Set<Res>();
function broadcast(event: string, data: unknown) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
tracker.on('state', (s) => broadcast('state', s));
tracker.on('session', (s) => broadcast('session', s));
tracker.on('feed', (f) => broadcast('feed', f));
tracker.on('match', (m) => broadcast('match', m));
// Demo: type in an MMR after each match, like you would after a real one
if (config.demo) tracker.on('match', (m) => setTimeout(() => { if (m.mode && m.mmrBefore !== null) tracker.setMatchMmr(m.id, m.mmrBefore + (m.win ? 1 : -1) * (7 + Math.floor(Math.random() * 5))); }, 1500));

/** Readable without login: overlays and their data (for OBS), static files and the login itself */
function isPublic(req: Req) {
  if (['/api/login', '/api/logout', '/api/me'].includes(req.path)) return true;
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  return (
    req.path.startsWith('/fonts/') ||
    req.path.startsWith('/ranks/') ||
    /^\/overlay\/[\w-]+$/.test(req.path) ||
    /^\/api\/overlays\/[\w-]+$/.test(req.path) ||
    ['/api/state', '/api/session', '/api/modes', '/api/events', '/login.html', '/overlay.html', '/css/rw.css', '/css/editor.css', '/js/render.js', '/js/i18n.js', '/js/overlay.js',
      '/favicon.svg', '/logo.svg', '/logo-wordmark.svg', '/logo-animated.svg'].includes(req.path)
  );
}

const r = new Router();

r.on('GET', '/', (_q, res) => redirect(res, '/editor.html'));
r.on('GET', '/editor', (_q, res) => redirect(res, '/editor.html'));
r.on('GET', '/overlay/:id', (req, res) => void sendStatic(req, res, PUBLIC, 'overlay.html'));

r.on('GET', '/api/me', (req, res) => json(res, 200, { user: auth.user(req), loginEnabled: auth.enabled, demo: config.demo }));

const LOGIN_ERRORS: Record<LoginError, number> = { disabled: 503, locked: 429, wrong: 401 };
r.on('POST', '/api/login', (req, res) => {
  const error = auth.login(req, res, String(req.body?.user ?? ''), String(req.body?.password ?? ''));
  if (error) return json(res, LOGIN_ERRORS[error], { error });
  json(res, 200, { ok: true });
});
r.on('POST', '/api/logout', (_req, res) => { auth.logout(res); res.writeHead(204).end(); });

r.on('GET', '/api/events', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`event: state\ndata: ${JSON.stringify(tracker.live)}\n\n`);
  res.write(`event: session\ndata: ${JSON.stringify(tracker.session())}\n\n`);
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
});

r.on('GET', '/api/state', (_req, res) => json(res, 200, tracker.live));
r.on('GET', '/api/modes', (_req, res) => json(res, 200, MODES));
r.on('GET', '/api/session', (_req, res) => json(res, 200, tracker.session()));

// Editor data: modes, tiers, ranks, playlist ids, player
r.on('GET', '/api/setup', (_req, res) => json(res, 200, {
  modes: MODES, tiers: TIERS, ranks: tracker.ranks, playlists: tracker.playlists, unknownPlaylist: tracker.unknownPlaylist,
  player: storage.get<string>('player', ''), detected: tracker.live.player, sessionStart: tracker.sessionStart, rankImages: rankImages(),
}));

r.on('PUT', '/api/player', (req, res) => { tracker.setPlayer(String(req.body?.name ?? '')); json(res, 200, { player: storage.get<string>('player', ''), detected: tracker.live.player }); });

r.on('PUT', '/api/ranks/:mode', (req, res, p) => {
  if (!isMode(p.mode)) return json(res, 404, { error: 'errMode' });
  json(res, 200, tracker.setRank(p.mode, req.body));
});
r.on('PUT', '/api/playlists/:id', (req, res, p) => {
  const id = Number(p.id);
  const mode = req.body?.mode === null || req.body?.mode === '' ? null : req.body?.mode;
  if (!Number.isInteger(id) || id < 0 || (mode !== null && !isMode(mode))) return json(res, 400, { error: 'errInput' });
  tracker.setPlaylist(id, mode);
  json(res, 200, { playlists: tracker.playlists });
});

r.on('POST', '/api/session/reset', (_req, res) => { tracker.resetSession(); json(res, 200, tracker.session()); });

r.on('GET', '/api/matches', (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.get('limit')) || 50));
  const mode = req.query.get('mode') || undefined;
  json(res, 200, storage.listMatches({ limit, mode: mode === 'other' ? undefined : mode }));
});
r.on('PUT', '/api/matches/:id/mmr', (req, res, p) => {
  const raw = req.body?.mmr;
  const mmr = raw === null || raw === '' || raw === undefined ? null : Number(raw);
  if (mmr !== null && (!Number.isInteger(mmr) || mmr < 0 || mmr > 5000)) return json(res, 400, { error: 'errMmr' });
  try { json(res, 200, tracker.setMatchMmr(p.id, mmr)); } catch { json(res, 404, { error: 'errMatchNotFound' }); }
});
r.on('DELETE', '/api/matches/:id', (_req, res, p) => { tracker.deleteMatch(p.id); res.writeHead(204).end(); });
r.on('GET', '/api/stats', (_req, res) => json(res, 200, tracker.overview()));

r.on('GET', '/api/overlays', (_req, res) => json(res, 200, storage.listOverlays()));
r.on('GET', '/api/overlays/:id', (_req, res, p) => {
  const o = storage.getOverlay(p.id);
  if (!o) return json(res, 404, { error: 'errOverlayNotFound' });
  json(res, 200, { ...o, style: cleanStyle(o.style) });
});
r.on('POST', '/api/overlays', (req, res) => {
  const base = req.body?.copyFrom ? storage.getOverlay(String(req.body.copyFrom)) : null;
  const layout: Layout = LAYOUTS.includes(req.body?.layout) ? req.body.layout : base?.layout ?? 'card';
  const o = createOverlay(layout, String(req.body?.name || '').slice(0, 60) || undefined);
  if (base) { o.style = cleanStyle(base.style); o.name = `${base.name} 2`.slice(0, 60); }
  storage.saveOverlay(o);
  json(res, 201, o);
});
r.on('PUT', '/api/overlays/:id', (req, res, p) => {
  const old = storage.getOverlay(p.id);
  if (!old) return json(res, 404, { error: 'errOverlayNotFound' });
  const o: Overlay = {
    ...old,
    name: typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name.trim().slice(0, 60) : old.name,
    layout: LAYOUTS.includes(req.body?.layout) ? req.body.layout : old.layout,
    style: cleanStyle(req.body?.style, cleanStyle(old.style)),
    updatedAt: new Date().toISOString(),
  };
  storage.saveOverlay(o);
  broadcast('overlay', o);
  json(res, 200, o);
});
r.on('POST', '/api/overlays/:id/reset', (_req, res, p) => {
  const old = storage.getOverlay(p.id);
  if (!old) return json(res, 404, { error: 'errOverlayNotFound' });
  const o: Overlay = { ...old, style: defaultStyle(), updatedAt: new Date().toISOString() };
  storage.saveOverlay(o);
  broadcast('overlay', o);
  json(res, 200, o);
});
r.on('DELETE', '/api/overlays/:id', (_req, res, p) => {
  if (storage.listOverlays().length <= 1) return json(res, 400, { error: 'errLastOverlay' });
  storage.deleteOverlay(p.id);
  res.writeHead(204).end();
});

/** Your own rank images in data/ranks (bronze-1.png ... supersonic-legend.png) */
function rankImages(): string[] {
  try { return readdirSync(config.ranksDir).filter((f) => /^[a-z0-9-]+\.(png|webp|svg)$/.test(f)); } catch { return []; }
}

const hostOf = (url: string) => URL.parse(url)?.host ?? null;

const server = createServer(async (raw, res) => {
  const url = new URL(raw.url ?? '/', 'http://x');
  const req = Object.assign(raw, {
    path: url.pathname,
    query: url.searchParams,
    ip: raw.socket.remoteAddress ?? '',
    // https behind a reverse proxy on this machine or in the home network
    secure: raw.headers['x-forwarded-proto'] === 'https' && /^(::1|127\.|::ffff:127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(raw.socket.remoteAddress ?? ''),
  }) as Req;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Without a password only this PC may use the server: also refuse other host names (DNS rebinding)
  if (!auth.enabled && !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(raw.headers.host ?? '')) return json(res, 403, { error: 'host' });
  try {
    if (!isPublic(req)) {
      if (!auth.user(req)) {
        if (req.path.startsWith('/api/')) return json(res, 401, { error: 'login' });
        if (req.method === 'GET') {
          const lang = req.query.get('lang');
          return redirect(res, `/login.html?next=${encodeURIComponent(req.path + url.search)}${lang ? `&lang=${encodeURIComponent(lang)}` : ''}`);
        }
        return json(res, 404, { error: 'Not found' });
      }
      // Changes only from this site, not from other pages in the same browser
      const origin = req.headers.origin;
      if (req.method !== 'GET' && req.method !== 'HEAD' && origin && hostOf(origin) !== req.headers.host) return json(res, 403, { error: 'origin' });
    }
    const hit = r.match(req.method ?? 'GET', req.path);
    if (hit) {
      if (req.method === 'POST' || req.method === 'PUT') req.body = await readBody(req);
      return void (await hit.handler(req, res, hit.params));
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (req.path.startsWith('/ranks/') && sendStatic(req, res, config.ranksDir, req.path.slice(7), 'public, max-age=3600')) return;
      if (sendStatic(req, res, PUBLIC, req.path.slice(1))) return;
    }
    json(res, 404, { error: 'Not found' });
  } catch (err: any) {
    // No stack traces to the outside, they would show folder names of the server
    const status = Number(err?.status) >= 400 ? Number(err.status) : 500;
    if (status >= 500) console.error(err);
    if (!res.headersSent) json(res, status, { error: STATUS_CODES[status] ?? 'Error' });
    else res.end();
  }
});

server.listen(config.port, config.host, () => {
  console.log(`RocketWatchr is running: http://localhost:${config.port}`);
  if (config.demo) console.log('Demo mode: a simulated match stream and sample data, nothing is saved.');
  else console.log(`Waiting for Rocket League on ${config.rlHost}:${config.rlPort} (Stats API, see README).`);
  if (!auth.enabled) console.log('Local mode: no ADMIN_PASSWORD in .env, so the editor has no login and only this PC can reach it.');
  tracker.start();
});
