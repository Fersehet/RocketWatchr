import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ModeId } from './modes.ts';
import type { Overlay } from './overlays.ts';

/** One finished match, as RocketWatchr saw it */
export type Match = {
  id: string;
  endedAt: string;
  playlistId: number | null;
  mode: ModeId | null;
  win: boolean;
  /** Goals of your team and of the other team */
  teamGoals: number;
  oppGoals: number;
  score: number;
  goals: number;
  assists: number;
  saves: number;
  shots: number;
  demos: number;
  mvp: boolean;
  /** MMR before the match (from the editor) and after it (typed in after the match). Both optional. */
  mmrBefore: number | null;
  mmrAfter: number | null;
};

export class Storage {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, ended_at TEXT NOT NULL, mode TEXT, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_matches_ended ON matches (ended_at);
      CREATE TABLE IF NOT EXISTS overlays (id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL);
    `);
  }

  get<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) return fallback;
    try { return JSON.parse(row.value) as T; } catch { return fallback; }
  }

  set(key: string, value: unknown) {
    this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
  }

  saveMatch(m: Match) {
    this.db
      .prepare('INSERT INTO matches (id, ended_at, mode, data) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET ended_at = excluded.ended_at, mode = excluded.mode, data = excluded.data')
      .run(m.id, m.endedAt, m.mode, JSON.stringify(m));
  }

  getMatch(id: string): Match | null {
    const row = this.db.prepare('SELECT data FROM matches WHERE id = ?').get(id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as Match) : null;
  }

  deleteMatch(id: string) {
    this.db.prepare('DELETE FROM matches WHERE id = ?').run(id);
  }

  /** Newest first */
  listMatches(opts: { since?: string; mode?: string; limit?: number } = {}): Match[] {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (opts.since) { where.push('ended_at >= ?'); args.push(opts.since); }
    if (opts.mode) { where.push('mode = ?'); args.push(opts.mode); }
    const sql = `SELECT data FROM matches ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ended_at DESC LIMIT ?`;
    args.push(opts.limit ?? 500);
    return (this.db.prepare(sql).all(...args) as { data: string }[]).map((r) => JSON.parse(r.data) as Match);
  }

  listOverlays(): Overlay[] {
    return (this.db.prepare('SELECT data FROM overlays ORDER BY rowid').all() as { data: string }[]).map((r) => JSON.parse(r.data) as Overlay);
  }

  getOverlay(id: string): Overlay | null {
    const row = this.db.prepare('SELECT data FROM overlays WHERE id = ?').get(id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as Overlay) : null;
  }

  saveOverlay(o: Overlay) {
    this.db
      .prepare('INSERT INTO overlays (id, name, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at')
      .run(o.id, o.name, JSON.stringify(o), o.updatedAt);
  }

  deleteOverlay(id: string) {
    this.db.prepare('DELETE FROM overlays WHERE id = ?').run(id);
  }
}
