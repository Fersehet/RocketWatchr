import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

// Look for .env in the project folder, no matter which folder the server was started from
const envCandidates = [...new Set([fileURLToPath(new URL('../.env', import.meta.url)), resolve(process.cwd(), '.env')])];
const envFile = envCandidates.find((f) => existsSync(f)) ?? null;
if (envFile) loadEnv(envFile);

/**
 * Like process.loadEnvFile, but also reads UTF-16 and a BOM (Windows editors and PowerShell write those).
 * Variables that are already set (for example from Docker) win.
 */
function loadEnv(file: string) {
  const raw = readFileSync(file);
  const text = (raw[0] === 0xff && raw[1] === 0xfe ? raw.toString('utf16le') : raw.toString('utf8')).replace(/^﻿/, '');
  for (const [key, value] of Object.entries(parseEnv(text))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const flag = (v: string | undefined) => /^(1|true|yes|on)$/i.test(v?.trim() ?? '');
const demo = process.argv.includes('--demo') || flag(process.env.DEMO);

export const config = {
  port: Number(process.env.PORT) || 3100,
  /** With a password 0.0.0.0 (home network, Docker), without one only this PC */
  host: process.env.HOST || (process.env.ADMIN_PASSWORD ? '0.0.0.0' : '127.0.0.1'),
  /** Where Rocket League's Stats API listens. The game only listens on the PC it runs on. */
  rlHost: process.env.RL_HOST?.trim() || '127.0.0.1',
  rlPort: Number(process.env.RL_PORT) || 49123,
  /** Demo mode: a simulated match stream and sample history, kept in memory only */
  demo,
  dbPath: demo ? ':memory:' : process.env.DB_PATH || './data/rocketwatchr.db',
  /** Folder for your own rank images (bronze-1.png ... supersonic-legend.png) */
  ranksDir: resolve(fileURLToPath(new URL('..', import.meta.url)), process.env.RANKS_DIR || 'data/ranks'),
  adminUser: process.env.ADMIN_USER?.trim() || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  /** Key for the login cookies. Empty = created once at random and saved next to the database. */
  sessionSecret: process.env.SESSION_SECRET?.trim() || '',
  secretDir: resolve(fileURLToPath(new URL('..', import.meta.url)), 'data'),
};
