import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { Storage } from './storage.ts';
import { Tracker } from './tracker.ts';

class Fake extends EventEmitter { connected = true; start() {} }

const state = (blue: number, orange: number, myGoals: number) => ({
  Event: 'UpdateState',
  Data: {
    MatchGuid: 'M1',
    Players: [{ Name: 'Me', TeamNum: 0, Score: 300, Goals: myGoals, Shots: 3, Assists: 1, Saves: 2, Touches: 9, Demos: 1 }, { Name: 'Them', TeamNum: 1, Score: 120, Goals: orange }],
    Game: { Teams: [{ TeamNum: 0, Score: blue }, { TeamNum: 1, Score: orange }], PlaylistId: 11, TimeSeconds: 0, bOvertime: false, bReplay: false, bHasTarget: true, Target: { Name: 'Me' } },
  },
});

test('saves a won ranked match with your stats and the MMR change you type in', () => {
  const storage = new Storage(':memory:');
  const src = new Fake();
  const tr = new Tracker(storage, src, false);
  tr.setRank('doubles', { tier: 16, div: 3, mmr: 1284 });
  const feed: string[] = [];
  tr.on('feed', (f) => feed.push(f.key));
  src.emit('event', { Event: 'MatchCreated', Data: { MatchGuid: 'M1' } });
  src.emit('event', state(2, 1, 2));
  src.emit('event', { Event: 'StatfeedEvent', Data: { EventName: 'Goal', Type: 'Goal', MainTarget: { Name: 'Me' } } });
  src.emit('event', { Event: 'StatfeedEvent', Data: { EventName: 'Save', Type: 'Save', MainTarget: { Name: 'Them' } } });
  src.emit('event', { Event: 'MatchEnded', Data: { WinnerTeamNum: 0 } });
  const [m] = storage.listMatches();
  assert.equal(m.mode, 'doubles');
  assert.deepEqual([m.win, m.teamGoals, m.oppGoals, m.goals, m.saves, m.mmrBefore, m.mvp], [true, 2, 1, 2, 2, 1284, true]);
  assert.deepEqual(feed, ['goal', 'win']); // only your own events
  tr.setMatchMmr(m.id, 1293);
  const s = tr.session().modes.doubles;
  assert.deepEqual([s.w, s.l, s.streak, s.last[0].delta, s.rank.mmr], [1, 0, 1, 9, 1293]);
});

test('an unknown playlist id is remembered and can be assigned', () => {
  const storage = new Storage(':memory:');
  const src = new Fake();
  const tr = new Tracker(storage, src, false);
  const ev = state(0, 0, 0);
  ev.Data.Game.PlaylistId = 34;
  src.emit('event', ev);
  assert.equal(tr.live.mode, null);
  assert.equal(tr.unknownPlaylist, 34);
  tr.setPlaylist(34, 'quads');
  assert.equal(tr.live.mode, 'quads');
});
