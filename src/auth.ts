import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { readCookie, type Req, type Res } from './http.ts';

const COOKIE = 'rw_session';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const MAX_FAILS = 10;
const FAIL_WINDOW_MS = 15 * 60 * 1000;

export type LoginError = 'disabled' | 'locked' | 'wrong';

type User = { name: string; salt: Buffer; hash: Buffer };

/**
 * Login for the editor, the same way as FaceitWatchr: one account from the .env,
 * the session sits signed in a cookie, so a restart logs nobody out.
 */
export class Auth {
  private users = new Map<string, User>();
  private key: Buffer;
  private fails = new Map<string, { count: number; until: number }>();
  private adminName: string;

  constructor(secretFile: string, secretFromEnv: string, admin: { name: string; password: string }) {
    this.adminName = admin.name;
    if (admin.password) this.users.set(admin.name.toLowerCase(), hashUser(admin.name, admin.password));
    // The password is part of the key: a new password logs out every session
    const secret = secretFromEnv || loadOrCreateSecret(secretFile);
    this.key = createHmac('sha256', secret).update(admin.password).digest();
  }

  get enabled() {
    return this.users.size > 0;
  }

  /** Logged-in user or null. Without ADMIN_PASSWORD there is no login and everyone counts as logged in. */
  user(req: Req): string | null {
    if (!this.enabled) return this.adminName;
    const raw = readCookie(req, COOKIE);
    if (!raw) return null;
    const [payload, sig] = raw.split('.');
    if (!payload || !sig || !safeEqual(Buffer.from(sig), Buffer.from(this.sign(payload)))) return null;
    try {
      const { u, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (typeof u !== 'string' || typeof exp !== 'number' || exp < Date.now() / 1000) return null;
      return this.users.has(u.toLowerCase()) ? u : null;
    } catch {
      return null;
    }
  }

  login(req: Req, res: Res, name: string, password: string): LoginError | null {
    if (!this.enabled) return 'disabled';
    const now = Date.now();
    const entry = this.fails.get(req.ip);
    if (entry && entry.until > now && entry.count >= MAX_FAILS) return 'locked';

    const user = this.users.get(name.trim().toLowerCase());
    // Hash even for unknown names so the response time gives nothing away
    const hash = scryptSync(password, user?.salt ?? Buffer.alloc(16), 32);
    if (!user || !safeEqual(hash, user.hash)) {
      const fresh = !entry || entry.until <= now;
      this.fails.set(req.ip, { count: fresh ? 1 : entry.count + 1, until: fresh ? now + FAIL_WINDOW_MS : entry.until });
      return 'wrong';
    }
    this.fails.delete(req.ip);

    const payload = Buffer.from(JSON.stringify({ u: user.name, exp: Math.floor(now / 1000) + MAX_AGE_SECONDS })).toString('base64url');
    const flags = ['HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${MAX_AGE_SECONDS}`];
    if (req.secure) flags.push('Secure');
    res.setHeader('Set-Cookie', `${COOKIE}=${payload}.${this.sign(payload)}; ${flags.join('; ')}`);
    return null;
  }

  logout(res: Res) {
    res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  }

  private sign(payload: string) {
    return createHmac('sha256', this.key).update(payload).digest('base64url');
  }
}

function hashUser(name: string, password: string): User {
  const salt = randomBytes(16);
  return { name, salt, hash: scryptSync(password, salt, 32) };
}

function safeEqual(a: Buffer, b: Buffer) {
  return a.length === b.length && timingSafeEqual(a, b);
}

function loadOrCreateSecret(file: string) {
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const secret = randomBytes(32).toString('hex');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}
