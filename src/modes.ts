/** The ranked playlists RocketWatchr keeps apart. Each has its own rank and MMR in the game. */
export const MODES = [
  { id: 'duel', name: '1v1 Duel' },
  { id: 'doubles', name: '2v2 Doubles' },
  { id: 'standard', name: '3v3 Standard' },
  { id: 'quads', name: '4v4 Quads' },
  { id: 'heatseeker', name: '2v2 Heatseeker' },
  { id: 'hoops', name: '2v2 Hoops' },
  { id: 'rumble', name: '3v3 Rumble' },
  { id: 'snowday', name: '3v3 Snow Day' },
  { id: 'dropshot', name: '3v3 Dropshot' },
] as const;

export type ModeId = (typeof MODES)[number]['id'];
export const MODE_IDS = MODES.map((m) => m.id) as ModeId[];
export const isMode = (v: unknown): v is ModeId => typeof v === 'string' && (MODE_IDS as string[]).includes(v);

/**
 * The Stats API only sends a number (Game.PlaylistId). These are the ids the ranked playlists use as far as
 * we know. Psyonix does not publish the list, so the editor shows the last unknown id and lets you assign it.
 */
export const DEFAULT_PLAYLISTS: Record<string, ModeId> = {
  '10': 'duel',
  '11': 'doubles',
  '13': 'standard',
  '27': 'hoops',
  '28': 'rumble',
  '29': 'dropshot',
  '30': 'snowday',
};

/** Bronze I ... Grand Champion III, then Supersonic Legend (index 0-21). Unranked = -1. */
export const TIERS = [
  'Bronze I', 'Bronze II', 'Bronze III', 'Silver I', 'Silver II', 'Silver III', 'Gold I', 'Gold II', 'Gold III',
  'Platinum I', 'Platinum II', 'Platinum III', 'Diamond I', 'Diamond II', 'Diamond III', 'Champion I', 'Champion II', 'Champion III',
  'Grand Champion I', 'Grand Champion II', 'Grand Champion III', 'Supersonic Legend',
];

export type Rank = {
  /** Index in TIERS, -1 = unranked */
  tier: number;
  /** Division 1-4 (Supersonic Legend has none) */
  div: number;
  mmr: number | null;
  /** Optional: MMR where this division starts and where the next one starts, for the progress bar */
  divFrom: number | null;
  divTo: number | null;
};

export const emptyRank = (): Rank => ({ tier: -1, div: 1, mmr: null, divFrom: null, divTo: null });

export function cleanRank(v: any, prev: Rank = emptyRank()): Rank {
  const int = (x: unknown, lo: number, hi: number) => {
    if (x === null || x === '' || x === undefined) return null;
    const n = Number(x);
    return Number.isInteger(n) && n >= lo && n <= hi ? n : undefined;
  };
  const tier = int(v?.tier, -1, TIERS.length - 1);
  const div = int(v?.div, 1, 4);
  const mmr = int(v?.mmr, 0, 5000);
  const from = int(v?.divFrom, 0, 5000);
  const to = int(v?.divTo, 0, 5000);
  return {
    tier: tier ?? prev.tier,
    div: div ?? prev.div,
    mmr: mmr === undefined ? prev.mmr : mmr,
    divFrom: from === undefined ? prev.divFrom : from,
    divTo: to === undefined ? prev.divTo : to,
  };
}
