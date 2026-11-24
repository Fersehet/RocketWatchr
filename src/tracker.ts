import { EventEmitter } from 'node:events';
import { DEFAULT_PLAYLISTS, MODE_IDS, cleanRank, emptyRank, isMode, type ModeId, type Rank } from './modes.ts';
import type { RlEvent } from './rl/stream.ts';
import type { Match, Storage } from './storage.ts';

export type Source = EventEmitter & { connected: boolean; start(): void };

export type Me = { name: string; team: number; score: number; goals: number; assists: number; saves: number; shots: number; demos: number; touches: number };

export type Live = {
  connected: boolean;
  demo: boolean;
  inMatch: boolean;
  playlistId: number | null;
  mode: ModeId | null;
  time: number;
  overtime: boolean;
  teams: { name: string; score: number; color: string | null }[];
  me: Me | null;
  /** Name RocketWatchr thinks is you (set in the editor, or the player the game camera follows) */
  player: string;
};

export type Feed = { id: number; key: string; label: string; points: number | null };

export type ModeSummary = {
  matches: number; w: number; l: number; streak: number;
  goals: number; assists: number; saves: number; shots: number; demos: number; score: number; mvp: number;
  last: { id: string; teamGoals: number; oppGoals: number; win: boolean; delta: number | null }[];
  rank: Rank;
};

export type Session = { start: string; modes: Record<ModeId, ModeSummary> };

/** Points the game gives for statfeed events, where they are fixed */
const POINTS: Record<string, number> = { goal: 100, assist: 50, save: 50, epicsave: 75, shot: 20, demolish: 25, demolition: 25, aerialgoal: 100, backwardsgoal: 100, bicyclegoal: 100, longgoal: 100, turtlegoal: 100, poolshot: 100, overtimegoal: 100, hattrick: 100, playmaker: 100, savior: 100, clear: 20, centerball: 10, firsttouch: 10 };

const lower = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export class Tracker extends EventEmitter {
  live: Live;
  private match: { guid: string; mvp: boolean; players: any[] } | null = null;
  private feedId = 0;
  private detected = '';

  private storage: Storage;
  private source: Source;

  constructor(storage: Storage, source: Source, demo: boolean) {
    super();
    this.storage = storage;
    this.source = source;
    this.live = { connected: source.connected, demo, inMatch: false, playlistId: null, mode: null, time: 300, overtime: false, teams: [], me: null, player: '' };
    this.live.player = this.playerName;
    source.on('status', (v: boolean) => { this.live.connected = v; if (!v) this.live.inMatch = false; this.emitState(); });
    source.on('event', (e: RlEvent) => {
      // A broken message from the game must never stop the server
      try { this.handle(e); } catch (err) { console.warn('RocketWatchr: skipped a Stats API message:', (err as Error).message); }
    });
  }

  start() { this.source.start(); }

  // ---------- settings ----------

  get playerName(): string { return this.storage.get<string>('player', '') || this.detected; }
  setPlayer(name: string) { this.storage.set('player', name.trim().slice(0, 64)); this.live.player = this.playerName; this.emitState(); }

  get playlists(): Record<string, ModeId> { return { ...DEFAULT_PLAYLISTS, ...this.storage.get<Record<string, ModeId>>('playlists', {}) }; }
  setPlaylist(id: number, mode: ModeId | null) {
    const own = this.storage.get<Record<string, ModeId | null>>('playlists', {});
    if (mode) own[String(id)] = mode; else delete own[String(id)];
    this.storage.set('playlists', own);
    if (this.live.playlistId === id) this.live.mode = this.modeOf(id);
    this.emitState();
  }
  get unknownPlaylist(): number | null { return this.storage.get<number | null>('unknownPlaylist', null); }
  private modeOf(id: number | null): ModeId | null { return id === null ? null : this.playlists[String(id)] ?? null; }

  get ranks(): Record<ModeId, Rank> {
    const saved = this.storage.get<Record<string, Rank>>('ranks', {});
    const out = {} as Record<ModeId, Rank>;
    for (const m of MODE_IDS) out[m] = cleanRank(saved[m], emptyRank());
    return out;
  }
  setRank(mode: ModeId, input: unknown) {
    const all = this.ranks;
    all[mode] = cleanRank(input, all[mode]);
    this.storage.set('ranks', all);
    this.emitSession();
    return all[mode];
  }

  get sessionStart(): string { return this.storage.get<string>('sessionStart', '') || new Date(0).toISOString(); }
  resetSession() { this.storage.set('sessionStart', new Date().toISOString()); this.emitSession(); }

  // ---------- the event stream ----------

  private handle(e: RlEvent) {
    const d = e.Data ?? {};
    switch (e.Event) {
      case 'MatchCreated':
      case 'MatchInitialized':
        if (!this.match || (d.MatchGuid && d.MatchGuid !== this.match.guid)) this.newMatch(d.MatchGuid);
        break;
      case 'UpdateState':
        this.update(d);
        break;
      case 'StatfeedEvent':
        this.statfeed(d);
        break;
      case 'MatchEnded':
        this.ended(d.WinnerTeamNum === 0 || d.WinnerTeamNum === 1 ? d.WinnerTeamNum : Number.NaN);
        break;
      case 'MatchDestroyed':
        this.match = null;
        this.live.inMatch = false;
        this.emitState();
        break;
    }
  }

  private newMatch(guid?: unknown) {
    this.match = { guid: typeof guid === 'string' && guid ? guid.slice(0, 64) : `local-${Date.now()}`, mvp: false, players: [] };
    this.live.inMatch = true;
    this.live.me = null;
  }

  private update(d: any) {
    const g = d.Game ?? {};
    if (g.bReplay) return; // replays and goal replays are not your match
    if (!this.match || (typeof d.MatchGuid === 'string' && d.MatchGuid && d.MatchGuid !== this.match.guid)) this.newMatch(d.MatchGuid);
    const players: any[] = Array.isArray(d.Players) ? d.Players.filter((x: unknown) => x && typeof x === 'object') : [];
    this.match!.players = players;
    // Who are you? The name from the editor, else the player the game camera follows while you play
    if (!this.storage.get<string>('player', '') && g.bHasTarget && g.Target?.Name && g.Target.Name !== this.detected) {
      this.detected = String(g.Target.Name);
      this.live.player = this.playerName;
    }
    const name = this.playerName.toLowerCase();
    const p = name ? players.find((x) => String(x.Name ?? '').toLowerCase() === name) : null;
    const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    this.live.me = p ? { name: String(p.Name), team: num(p.TeamNum), score: num(p.Score), goals: num(p.Goals), assists: num(p.Assists), saves: num(p.Saves), shots: num(p.Shots), demos: num(p.Demos), touches: num(p.Touches) } : null;
    const teams = Array.isArray(g.Teams) ? g.Teams.filter((x: unknown) => x && typeof x === 'object') : [];
    this.live.teams = [0, 1].map((n) => {
      const t = teams.find((x: any) => num(x.TeamNum) === n) ?? {};
      return { name: String(t.Name ?? (n ? 'Orange' : 'Blue')), score: num(t.Score), color: typeof t.ColorPrimary === 'string' ? '#' + t.ColorPrimary.replace('#', '').slice(0, 6) : null };
    });
    this.live.time = Math.max(0, Math.round(num(g.TimeSeconds)));
    this.live.overtime = !!g.bOvertime;
    const pid = g.PlaylistId === undefined || g.PlaylistId === null ? null : num(g.PlaylistId);
    if (pid !== this.live.playlistId) {
      this.live.playlistId = pid;
      this.live.mode = this.modeOf(pid);
      if (pid !== null && !this.live.mode && this.unknownPlaylist !== pid) this.storage.set('unknownPlaylist', pid);
    }
    this.live.inMatch = true;
    this.emitState();
  }

  private statfeed(d: any) {
    const who = String(d.MainTarget?.Name ?? '').toLowerCase();
    if (!who || who !== this.playerName.toLowerCase()) return;
    const key = lower(d.EventName);
    if (!key) return;
    if (key === 'mvp' && this.match) this.match.mvp = true;
    const label = String(d.Type || d.EventName);
    this.emit('feed', { id: ++this.feedId, key, label, points: POINTS[key] ?? null } satisfies Feed);
  }

  private ended(winner: number) {
    const me = this.live.me;
    if (!this.match || !me || !Number.isFinite(winner)) { this.live.inMatch = false; this.emitState(); return; }
    const mode = this.live.mode;
    const win = winner === me.team;
    const top = Math.max(...this.match.players.map((x) => Number(x.Score) || 0), 0);
    const teamGoals = this.live.teams[me.team]?.score ?? 0;
    const oppGoals = this.live.teams[me.team ? 0 : 1]?.score ?? 0;
    const m: Match = {
      id: this.match.guid, endedAt: new Date().toISOString(), playlistId: this.live.playlistId, mode, win, teamGoals, oppGoals,
      score: me.score, goals: me.goals, assists: me.assists, saves: me.saves, shots: me.shots, demos: me.demos,
      mvp: this.match.mvp || (win && me.score > 0 && me.score >= top),
      mmrBefore: mode ? this.ranks[mode].mmr : null, mmrAfter: null,
    };
    this.storage.saveMatch(m);
    this.match = null;
    this.live.inMatch = false;
    this.emit('feed', { id: ++this.feedId, key: win ? 'win' : 'loss', label: `${teamGoals}-${oppGoals}`, points: null } satisfies Feed);
    this.emit('match', m);
    this.emitState();
    this.emitSession();
  }

  /** MMR after a match, typed in the editor. Updates the playlist's MMR if it is the latest match there. */
  setMatchMmr(id: string, mmr: number | null) {
    const m = this.storage.getMatch(id);
    if (!m) throw new Error('errMatchNotFound');
    m.mmrAfter = mmr;
    this.storage.saveMatch(m);
    if (m.mode && mmr !== null) {
      const latest = this.storage.listMatches({ mode: m.mode, limit: 1 })[0];
      if (latest?.id === m.id) this.setRank(m.mode, { mmr });
    }
    this.emitSession();
    return m;
  }

  deleteMatch(id: string) { this.storage.deleteMatch(id); this.emitSession(); }

  // ---------- summaries ----------

  session(): Session {
    const start = this.sessionStart;
    const ranks = this.ranks;
    const modes = {} as Record<ModeId, ModeSummary>;
    for (const id of MODE_IDS) modes[id] = { matches: 0, w: 0, l: 0, streak: 0, goals: 0, assists: 0, saves: 0, shots: 0, demos: 0, score: 0, mvp: 0, last: [], rank: ranks[id] };
    const list = this.storage.listMatches({ since: start, limit: 1000 }); // newest first
    const streakDone = new Set<ModeId>();
    for (const m of list) {
      if (!isMode(m.mode)) continue;
      const s = modes[m.mode];
      s.matches++;
      if (m.win) s.w++; else s.l++;
      if (!streakDone.has(m.mode)) {
        if (s.streak === 0) s.streak = m.win ? 1 : -1;
        else if ((s.streak > 0) === m.win) s.streak += m.win ? 1 : -1;
        else streakDone.add(m.mode);
      }
      s.goals += m.goals; s.assists += m.assists; s.saves += m.saves; s.shots += m.shots; s.demos += m.demos; s.score += m.score;
      if (m.mvp) s.mvp++;
      if (s.last.length < 5) s.last.unshift({ id: m.id, teamGoals: m.teamGoals, oppGoals: m.oppGoals, win: m.win, delta: m.mmrAfter !== null && m.mmrBefore !== null ? m.mmrAfter - m.mmrBefore : null });
    }
    return { start, modes };
  }

  /** All-time numbers per playlist and the MMR history for the statistics page */
  overview() {
    const all = this.storage.listMatches({ limit: 5000 });
    const per: Record<string, { matches: number; w: number; goals: number; assists: number; saves: number; shots: number; mvp: number; mmr: { at: string; mmr: number }[] }> = {};
    for (const m of all) {
      const k = m.mode ?? 'other';
      const s = (per[k] ??= { matches: 0, w: 0, goals: 0, assists: 0, saves: 0, shots: 0, mvp: 0, mmr: [] });
      s.matches++; if (m.win) s.w++;
      s.goals += m.goals; s.assists += m.assists; s.saves += m.saves; s.shots += m.shots; if (m.mvp) s.mvp++;
      if (m.mmrAfter !== null) s.mmr.unshift({ at: m.endedAt, mmr: m.mmrAfter });
    }
    return { modes: per, total: all.length, session: this.session() };
  }

  private emitState() { this.emit('state', this.live); }
  private emitSession() { this.emit('session', this.session()); }
}
