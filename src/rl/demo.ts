import { EventEmitter } from 'node:events';
import { MODE_IDS, type ModeId } from '../modes.ts';
import type { Storage, Match } from '../storage.ts';

/**
 * Demo mode: plays endless 2v2 matches with the same messages the Stats API sends,
 * so overlays, editor and statistics can be tried without the game.
 */
export class DemoStream extends EventEmitter {
  connected = true;
  private timer: NodeJS.Timeout | null = null;
  private n = 0;

  start() {
    setTimeout(() => this.emit('status', true), 50);
    this.match();
  }

  private match() {
    const guid = `DEMO${Date.now().toString(36).toUpperCase()}`;
    const players = [
      { Name: 'Fersehet', PrimaryId: 'Epic|demo1|0', Shortcut: 1, TeamNum: 0 },
      { Name: 'Kickoff Kid', PrimaryId: 'Epic|demo2|0', Shortcut: 2, TeamNum: 0 },
      { Name: 'Nova', PrimaryId: 'Steam|demo3|0', Shortcut: 3, TeamNum: 1 },
      { Name: 'Turbo Toast', PrimaryId: 'Steam|demo4|0', Shortcut: 4, TeamNum: 1 },
    ].map((p) => ({ ...p, Score: 0, Goals: 0, Shots: 0, Assists: 0, Saves: 0, Touches: 0, CarTouches: 0, Demos: 0 }));
    const score = [0, 0];
    let time = 300, overtime = false;
    const send = (Event: string, Data: object) => this.emit('event', { Event, Data });
    const state = () => send('UpdateState', {
      MatchGuid: guid, Players: players,
      Game: { Teams: [{ Name: 'Blue', TeamNum: 0, Score: score[0], ColorPrimary: '1f8fff' }, { Name: 'Orange', TeamNum: 1, Score: score[1], ColorPrimary: 'ff8a1f' }],
        PlaylistId: 11, TimeSeconds: time, bOvertime: overtime, bReplay: false, bHasWinner: false, Winner: '', Arena: 'Stadium_P', bHasTarget: true, Target: { Name: 'Fersehet', Shortcut: 1, TeamNum: 0 } },
    });
    const feed = (p: any, EventName: string, Type: string) => send('StatfeedEvent', { MatchGuid: guid, EventName, Type, MainTarget: { Name: p.Name, Shortcut: p.Shortcut, TeamNum: p.TeamNum } });
    const me = players[0];
    const pick = () => players[Math.floor(Math.random() * players.length)];
    send('MatchCreated', { MatchGuid: guid });
    send('MatchInitialized', { MatchGuid: guid });
    state();
    const EVENTS = [
      () => { const p = pick(); p.Shots++; p.Score += 20; feed(p, 'Shot', 'Shot on Goal'); },
      () => { const p = pick(); p.Saves++; p.Score += 50; feed(p, 'Save', 'Save'); },
      () => { const p = Math.random() < .45 ? me : pick(); p.Goals++; p.Shots++; p.Score += 100; score[p.TeamNum]++; feed(p, 'Goal', 'Goal');
        if (p.Goals === 3) setTimeout(() => feed(p, 'HatTrick', 'Hat Trick'), 1200);
        const mate = players.find((x) => x !== p && x.TeamNum === p.TeamNum);
        if (mate && Math.random() < .5) { mate.Assists++; mate.Score += 50; setTimeout(() => feed(mate, 'Assist', 'Assist'), 700); } },
      () => { const p = pick(); p.Demos++; p.Score += 25; feed(p, 'Demolish', 'Demolition'); },
      () => { const p = pick(); p.Saves++; p.Score += 75; feed(p, 'EpicSave', 'Epic Save'); },
      () => { me.Shots++; me.Score += 20; feed(me, 'Shot', 'Shot on Goal'); },
    ];
    for (const p of players) p.Touches = 0;
    const tick = () => {
      if (time <= 0 && !overtime) {
        if (score[0] === score[1]) { overtime = true; }
        else return end();
      }
      if (overtime && score[0] !== score[1]) return end();
      time = overtime ? time + 15 : Math.max(0, time - 15);
      for (const p of players) p.Touches += Math.random() < .5 ? 1 : 0;
      if (Math.random() < .7) EVENTS[Math.floor(Math.random() * EVENTS.length)]();
      state();
      this.timer = setTimeout(tick, 1600);
    };
    const end = () => {
      const win = score[0] > score[1] ? 0 : 1;
      const top = players.reduce((a, b) => (b.Score > a.Score ? b : a));
      if (top.TeamNum === win) feed(top, 'MVP', 'MVP');
      send('MatchEnded', { MatchGuid: guid, WinnerTeamNum: win });
      send('PodiumStart', { MatchGuid: guid });
      this.timer = setTimeout(() => { send('MatchDestroyed', { MatchGuid: guid }); this.n++; this.timer = setTimeout(() => this.match(), 4000); }, 5000);
    };
    this.timer = setTimeout(tick, 1600);
  }
}

/** Ranks and a few days of matches, so the card and the statistics have something to show */
export function seedDemo(storage: Storage) {
  const ranks: Record<ModeId, { tier: number; div: number; mmr: number; divFrom: number; divTo: number }> = {
    duel: { tier: 14, div: 2, mmr: 1105, divFrom: 1093, divTo: 1113 },
    doubles: { tier: 16, div: 3, mmr: 1284, divFrom: 1268, divTo: 1301 },
    standard: { tier: 15, div: 1, mmr: 1232, divFrom: 1225, divTo: 1253 },
    quads: { tier: 13, div: 4, mmr: 1046, divFrom: 1031, divTo: 1052 },
    heatseeker: { tier: 15, div: 4, mmr: 1203, divFrom: 1180, divTo: 1211 },
    hoops: { tier: 13, div: 1, mmr: 1031, divFrom: 1021, divTo: 1047 },
    rumble: { tier: 11, div: 2, mmr: 912, divFrom: 904, divTo: 926 },
    snowday: { tier: 12, div: 3, mmr: 965, divFrom: 952, divTo: 979 },
    dropshot: { tier: 10, div: 4, mmr: 872, divFrom: 866, divTo: 890 },
  };
  storage.set('ranks', ranks);
  storage.set('player', 'Fersehet');
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const now = Date.now();
  const sessionStart = new Date(now - 3 * 3600_000).toISOString();
  storage.set('sessionStart', sessionStart);
  for (const mode of MODE_IDS) {
    let mmr = ranks[mode].mmr - 60;
    const count = mode === 'doubles' ? 46 : mode === 'standard' || mode === 'duel' ? 24 : 8;
    for (let i = 0; i < count; i++) {
      const at = now - (count - i) * (mode === 'doubles' ? 2.4 : 5) * 3600_000 * (i > count - 6 ? 0.05 : 1);
      const win = rnd() < .56;
      const a = 1 + Math.floor(rnd() * 4), b = Math.max(0, a - 1 - Math.floor(rnd() * 3));
      const teamGoals = win ? a : b, oppGoals = win ? b : a;
      const before = mmr;
      mmr += win ? 7 + Math.floor(rnd() * 5) : -(7 + Math.floor(rnd() * 5));
      if (i === count - 1) mmr = ranks[mode].mmr;
      const goals = Math.min(teamGoals, Math.floor(rnd() * 3));
      const m: Match = {
        id: `seed-${mode}-${i}`, endedAt: new Date(at).toISOString(), playlistId: null, mode, win, teamGoals, oppGoals,
        score: 180 + Math.floor(rnd() * 400), goals, assists: Math.floor(rnd() * 2), saves: Math.floor(rnd() * 3), shots: goals + Math.floor(rnd() * 4), demos: Math.floor(rnd() * 2),
        mvp: win && rnd() < .35, mmrBefore: before, mmrAfter: mmr,
      };
      storage.saveMatch(m);
    }
  }
}
