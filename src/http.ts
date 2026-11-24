import { createReadStream, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

export type Req = IncomingMessage & { path: string; query: URLSearchParams; body?: any; ip: string; secure: boolean };
export type Res = ServerResponse;
export type Handler = (req: Req, res: Res, params: Record<string, string>) => void | Promise<void>;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** Tiny router: exact paths and :params, nothing else */
export class Router {
  private routes: { method: string; parts: string[]; handler: Handler }[] = [];

  on(method: string, path: string, handler: Handler) {
    this.routes.push({ method, parts: path.split('/'), handler });
  }

  match(method: string, path: string): { handler: Handler; params: Record<string, string> } | null {
    const parts = path.split('/');
    for (const r of this.routes) {
      if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) continue;
      if (r.parts.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < parts.length; i++) {
        const want = r.parts[i];
        if (want.startsWith(':')) {
          if (!/^[\w-]+$/.test(parts[i])) { ok = false; break; }
          params[want.slice(1)] = parts[i];
        } else if (want !== parts[i]) { ok = false; break; }
      }
      if (ok) return { handler: r.handler, params };
    }
    return null;
  }
}

export function json(res: Res, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

export function redirect(res: Res, to: string) {
  res.writeHead(302, { Location: to });
  res.end();
}

/** Reads a JSON body up to 1 MB */
export function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 1_000_000) { reject(Object.assign(new Error('Too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Object.assign(new Error('Bad JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

/** Serves a file from root, never outside of it. Returns false if there is no such file. */
export function sendStatic(req: Req, res: Res, root: string, rel: string, cache = 'no-cache'): boolean {
  let file: string;
  try { file = normalize(join(root, decodeURIComponent(rel))); } catch { return false; }
  if (file !== root && !file.startsWith(root.endsWith(sep) ? root : root + sep)) return false;
  let st;
  try { st = statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' });
  if (req.method === 'HEAD') { res.end(); return true; }
  createReadStream(file).pipe(res);
  return true;
}

export function readCookie(req: IncomingMessage, name: string) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k !== name) continue;
    try { return decodeURIComponent(v.join('=')); } catch { return null; }
  }
  return null;
}
