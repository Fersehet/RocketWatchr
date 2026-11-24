import { randomUUID } from 'node:crypto';
import { MODE_IDS, isMode, type ModeId } from './modes.ts';

export type Layout = 'bar' | 'card' | 'feed';
export const LAYOUTS: Layout[] = ['bar', 'card', 'feed'];

export const BAR_STATS = ['score', 'goals', 'assists', 'saves', 'shots', 'demos', 'touches'] as const;
export const CARD_STATS = ['goals', 'assists', 'saves', 'shots', 'shotpct', 'mvp', 'demos', 'score'] as const;
/** Statfeed events the overlay can show (lower-case EventName from the Stats API, plus win/loss at the end) */
export const FEED_EVENTS = ['goal', 'assist', 'save', 'epicsave', 'shot', 'demolish', 'hattrick', 'mvp', 'win', 'loss'] as const;
export const LANGS = ['en', 'de', 'ru', 'fr'] as const;

export type Style = {
  lang: (typeof LANGS)[number];
  /** Size in percent */
  scale: number;
  blue: string;
  orange: string;
  /** Background opacity of the panel, 40-100 */
  panel: number;
  // live bar
  barStats: string[];
  showName: boolean;
  hideIdle: boolean;
  // session card
  modes: ModeId[];
  cycleSeconds: number;
  followLive: boolean;
  onlyPlayed: boolean;
  rankSymbols: 'own' | 'images';
  showStreak: boolean;
  showMmr: boolean;
  showStats: boolean;
  showLast: boolean;
  cardStats: string[];
  // statfeed
  feedEvents: string[];
  feedSeconds: number;
  showPoints: boolean;
};

export type Overlay = { id: string; name: string; layout: Layout; style: Style; updatedAt: string };

export function defaultStyle(): Style {
  return {
    lang: 'en', scale: 100, blue: '#1f8fff', orange: '#ff8a1f', panel: 95,
    barStats: ['score', 'goals', 'assists', 'saves', 'shots', 'demos'], showName: true, hideIdle: false,
    modes: ['duel', 'doubles', 'standard'], cycleSeconds: 6, followLive: true, onlyPlayed: false, rankSymbols: 'own',
    showStreak: true, showMmr: true, showStats: true, showLast: true, cardStats: ['goals', 'assists', 'saves', 'shots', 'shotpct', 'mvp'],
    feedEvents: ['goal', 'assist', 'save', 'epicsave', 'demolish', 'hattrick', 'mvp', 'win', 'loss'], feedSeconds: 2.4, showPoints: true,
  };
}

const NAMES: Record<Layout, string> = { bar: 'Live bar', card: 'Session card', feed: 'Statfeed' };

export function createOverlay(layout: Layout, name?: string): Overlay {
  return { id: randomUUID().slice(0, 8), name: name || NAMES[layout], layout, style: defaultStyle(), updatedAt: new Date().toISOString() };
}

/** Takes whatever came from the editor and keeps only valid values, the rest stays as it was */
export function cleanStyle(input: any, prev: Style = defaultStyle()): Style {
  const s = { ...defaultStyle(), ...prev };
  if (!input || typeof input !== 'object') return s;
  const hex = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : d);
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const list = (v: unknown, allowed: readonly string[], d: string[]) => (Array.isArray(v) ? [...new Set(v.filter((x) => allowed.includes(x)))] : d);
  s.lang = (LANGS as readonly string[]).includes(input.lang) ? input.lang : s.lang;
  s.scale = Math.round(num(input.scale, 50, 200, s.scale));
  s.blue = hex(input.blue, s.blue);
  s.orange = hex(input.orange, s.orange);
  s.panel = Math.round(num(input.panel, 40, 100, s.panel));
  s.barStats = list(input.barStats, BAR_STATS, s.barStats);
  s.showName = bool(input.showName, s.showName);
  s.hideIdle = bool(input.hideIdle, s.hideIdle);
  if (Array.isArray(input.modes)) {
    const modes = MODE_IDS.filter((m) => input.modes.includes(m));
    if (modes.length) s.modes = modes; // at least one mode stays
  }
  s.cycleSeconds = Math.round(num(input.cycleSeconds, 3, 30, s.cycleSeconds));
  s.followLive = bool(input.followLive, s.followLive);
  s.onlyPlayed = bool(input.onlyPlayed, s.onlyPlayed);
  s.rankSymbols = input.rankSymbols === 'images' || input.rankSymbols === 'own' ? input.rankSymbols : s.rankSymbols;
  s.showStreak = bool(input.showStreak, s.showStreak);
  s.showMmr = bool(input.showMmr, s.showMmr);
  s.showStats = bool(input.showStats, s.showStats);
  s.showLast = bool(input.showLast, s.showLast);
  s.cardStats = list(input.cardStats, CARD_STATS, s.cardStats);
  s.feedEvents = list(input.feedEvents, FEED_EVENTS, s.feedEvents);
  s.feedSeconds = Math.round(num(input.feedSeconds, 1, 8, s.feedSeconds) * 10) / 10;
  s.showPoints = bool(input.showPoints, s.showPoints);
  s.modes = s.modes.filter(isMode);
  return s;
}
