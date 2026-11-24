export const FLAME = '<svg viewBox="0 0 16 20" aria-hidden="true"><defs><linearGradient id="flg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff3d00"/><stop offset=".55" stop-color="#ff8a1f"/><stop offset="1" stop-color="#ffd84a"/></linearGradient><linearGradient id="flc" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#fff6d6"/></linearGradient></defs><g class="fl"><path d="M8 0.5C9.2 4 13.5 6.2 14.6 10.6 15.7 15.3 12.4 19.5 8 19.5S0.3 15.6 1.3 11.4C2 8.4 4.3 7.3 4.9 4.3 6.4 5.6 6.7 7.2 6.6 8.6 8.4 6.6 8.9 3.6 8 0.5Z" fill="url(#flg)"/><path d="M8.2 9.2C9 11 11.2 12.4 11.2 15 11.2 17.2 9.8 18.6 8 18.6S4.8 17.3 4.8 15.4C4.8 13.6 6.3 12.9 6.6 11.3 7.5 12 7.6 12.9 7.6 13.6 8.4 12.4 8.6 10.8 8.2 9.2Z" fill="url(#flc)"/></g></svg>';
export const ICE = '<svg viewBox="0 0 16 20" aria-hidden="true"><g fill="none" stroke="#9fd0ff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5l5 4.5 5-4.5"/><path d="M3 11l5 4.5 5-4.5" stroke="#5fb0ff"/></g></svg>';

// Draws the three layouts. The editor preview and OBS use the same code.
import { TEXTS } from './i18n.js';

/** Size of each layout in OBS (width, height) */
export const SIZES = { bar: [1000, 80], card: [600, 420], feed: [600, 90] };

/** Rank names in English, for the image file names (champion-2.png) */
const TIER_EN = ['Bronze I', 'Bronze II', 'Bronze III', 'Silver I', 'Silver II', 'Silver III', 'Gold I', 'Gold II', 'Gold III', 'Platinum I', 'Platinum II', 'Platinum III',
  'Diamond I', 'Diamond II', 'Diamond III', 'Champion I', 'Champion II', 'Champion III', 'Grand Champion I', 'Grand Champion II', 'Grand Champion III', 'Supersonic Legend'];
const GROUPS = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'champion', 'grand', 'supersonic'];
const COLORS = { bronze: ['#c07a45', '#6b3d1e'], silver: ['#c9d3df', '#6c7a8c'], gold: ['#f2c14e', '#8a6410'], platinum: ['#7fe0ee', '#1f7a8c'],
  diamond: ['#5aa8ff', '#1a4fae'], champion: ['#b77bff', '#5b2aa8'], grand: ['#ff4d5e', '#8a1020'], supersonic: ['#ffffff', '#6a7a96'], none: ['#55627a', '#2b3446'] };
const GLOW = { bronze: 'rgba(224,150,90,.5)', silver: 'rgba(200,214,230,.5)', gold: 'rgba(242,193,78,.55)', platinum: 'rgba(127,216,232,.55)', diamond: 'rgba(59,140,255,.6)',
  champion: 'rgba(178,107,255,.6)', grand: 'rgba(255,59,78,.6)', supersonic: 'rgba(255,255,255,.55)', none: 'transparent' };
/* own emblems in the Watchr style (not the game's artwork): a hexagon like the goal net, a mark per tier and one bar per level (I-III) */
const MARK = {
  bronze: '<circle cx="32" cy="30" r="7"/>',
  silver: '<path d="M32 21l8 9-8 9-8-9z"/>',
  gold: '<path d="M32 19l3.2 6.6 7.3 1-5.3 5.1 1.3 7.2L32 35.5l-6.5 3.4 1.3-7.2-5.3-5.1 7.3-1z"/>',
  platinum: '<path d="M24 24h16l4 6-12 12-12-12z"/>',
  diamond: '<path d="M32 17l11 13-11 13-11-13z"/><path d="M32 17v26M21 30h22" stroke="rgba(0,0,0,.25)" stroke-width="1.5" fill="none"/>',
  champion: '<path d="M21 37l-2-14 7 5 6-9 6 9 7-5-2 14z"/>',
  grand: '<path d="M21 37l-2-14 7 5 6-9 6 9 7-5-2 14z"/><circle cx="32" cy="16" r="2.6"/>',
  supersonic: '<circle cx="32" cy="30" r="10" fill="none" stroke-width="3.4"/><path d="M14 26h8M12 31h9M14 36h8" stroke-width="3" stroke-linecap="round" fill="none"/>',
  none: '<path d="M26 30h12" stroke-width="3" stroke-linecap="round" fill="none"/>',
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const group = (tier) => (tier < 0 ? 'none' : GROUPS[Math.min(7, Math.floor(tier / 3))]);
const level = (tier) => (tier < 0 || tier >= 21 ? 0 : (tier % 3) + 1);

export function emblem(tier) {
  const key = group(tier), c = COLORS[key], n = level(tier);
  let bars = '';
  if (key !== 'supersonic' && key !== 'none') for (let k = 0; k < 3; k++) bars += `<path d="M${21 + k * 8} 56h6l-2 4h-6z" fill="${k < n ? c[0] : 'rgba(255,255,255,.18)'}"/>`;
  const id = `rwg-${key}`;
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient></defs>`
    + `<path d="M32 3l23 13v28L32 57 9 44V16z" fill="url(#${id})"/><path d="M32 9l18 10.5v22L32 52 14 41.5v-22z" fill="#0b1426" fill-opacity=".72"/>`
    + `<path d="M32 3l23 13" stroke="#fff" stroke-opacity=".5" stroke-width="1.2" fill="none"/><g fill="${c[0]}" stroke="${c[0]}">${MARK[key]}</g>${bars}</svg>`;
}

/** Rank name in the overlay language: "Champion II", "Supersonic Legend" */
export function tierName(tier, t) {
  if (tier < 0) return t.unranked;
  if (tier >= 21) return t.tiers[7];
  return `${t.tiers[Math.floor(tier / 3)]} ${'I'.repeat(level(tier))}`;
}
const fileOf = (tier) => TIER_EN[tier].toLowerCase().replace(/\s+(i{1,3})$/, (_, r) => `-${r.length}`).replace(/\s+/g, '-');

const clock = (s, ot) => `${ot ? '+' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function applyStyle(el, o) {
  const s = o.style;
  el.style.setProperty('--blue', s.blue);
  el.style.setProperty('--orange', s.orange);
  el.style.setProperty('--panel-a', String(s.panel / 100));
  // zoom instead of transform: the browser redraws text and shapes at the new size, so they stay sharp
  el.style.zoom = String(s.scale / 100);
}

/**
 * Builds one overlay into root and keeps it up to date.
 * data = { live, session, modes }  (modes = [{ id, name }] in display order)
 */
export function mount(root, overlay, data) {
  let o = overlay, d = data, t = TEXTS[o.style.lang] ?? TEXTS.en;
  let cycleIdx = 0, cycleTimer = 0, shownMode = null;
  const queue = [];
  let feedBusy = false;
  root.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'rw';
  root.appendChild(el);

  const modeName = (id) => d.modes.find((m) => m.id === id)?.name ?? '';

  function bar() {
    const s = o.style, live = d.live ?? {};
    const me = live.me;
    const inMatch = !!live.inMatch && !!me;
    const teams = live.teams?.length === 2 ? live.teams : [{ score: 0 }, { score: 0 }];
    const playlist = live.mode ? modeName(live.mode) : live.playlistId != null ? `Playlist ${live.playlistId}` : '';
    const stats = s.barStats.map((k) => `<div class="rw-stat" data-k="${k}"><em>${esc(t.stat[k])}</em><b>${inMatch ? me[k] ?? 0 : '–'}</b></div>`).join('');
    const who = s.showName ? `<div class="who"><b>${esc(me?.name || live.player || '')}</b><span>${esc(playlist)}</span></div>` : '';
    el.innerHTML = `<div class="rw-bar disp${!inMatch && s.hideIdle ? ' idle-hidden' : ''}">
      <div class="rw-score"><span class="b">${inMatch ? teams[0].score : '–'}</span><span class="clk${live.overtime ? ' ot' : ''}">${inMatch ? clock(live.time ?? 0, live.overtime) : '5:00'}</span><span class="o">${inMatch ? teams[1].score : '–'}</span></div>
      ${inMatch ? `<div class="rw-me">${who}${stats}</div>` : `<div class="wait">${esc(t.waiting)}</div>`}
    </div>`;
  }

  /** Playlists the card switches through right now */
  function cycleList() {
    const s = o.style, ses = d.session?.modes ?? {};
    let list = s.modes.filter((m) => ses[m]);
    if (s.onlyPlayed) { const played = list.filter((m) => ses[m].matches > 0); if (played.length) list = played; }
    return list;
  }

  function card(anim) {
    const s = o.style, live = d.live ?? {}, list = cycleList();
    if (!list.length) { el.innerHTML = ''; return; }
    const pinned = s.followLive && live.inMatch && live.mode && d.session?.modes?.[live.mode] ? live.mode : null;
    const id = pinned ?? list[cycleIdx % list.length];
    const m = d.session.modes[id], r = m.rank;
    const key = group(r.tier);
    const pips = r.tier >= 0 && r.tier < 21 ? `<span class="pips">${[1, 2, 3, 4].map((k) => `<i class="${k <= r.div ? 'on' : ''}"></i>`).join('')}</span><span class="dv">${t.div} ${r.div}</span>` : '';
    // MMR row: the bar only with the range of the division
    let mmr = '';
    if (s.showMmr && r.mmr != null) {
      const range = r.divFrom != null && r.divTo != null && r.divTo > r.divFrom;
      let nx = '';
      if (range && r.tier < 21) {
        const next = r.tier < 0 ? '' : r.div < 4 ? `${t.div} ${r.div + 1}` : tierName(r.tier + 1, t);
        if (next) nx = `<span class="nx">${t.toNext(Math.max(1, r.divTo - r.mmr), esc(next))}</span>`;
      }
      const pct = range ? Math.max(0, Math.min(1, (r.mmr - r.divFrom) / (r.divTo - r.divFrom))) : 0;
      mmr = `<div class="rw-mmr"><b>${r.mmr.toLocaleString(s.lang)}</b><em>${t.mmr}</em>${range ? `<span class="mbar"><i style="width:${(pct * 100).toFixed(1)}%"></i></span>` : '<span style="flex:1"></span>'}${nx}</div>`;
    }
    const streak = s.showStreak && m.streak ? `<span class="rw-tag${m.streak < 0 ? ' cold' : ''}"><span class="ic">${m.streak < 0 ? ICE : FLAME}</span><span class="tx">${esc(t.streak(m.streak))}</span></span>` : '';
    const val = (k) => (k === 'shotpct' ? `${Math.round((m.goals / Math.max(1, m.shots)) * 100)}%` : k === 'mvp' ? m.mvp : m[k] ?? 0);
    const grid = s.showStats && s.cardStats.length ? `<div class="rw-grid" style="--cols:${s.cardStats.length}">${s.cardStats.map((k) => `<div class="rw-stat${k === 'shotpct' ? ' hot' : ''}"><em>${esc(t.stat[k])}</em><b>${val(k)}</b></div>`).join('')}</div>` : '';
    let last = '';
    if (s.showLast) {
      const cells = m.last.map((g) => {
        const sc = `${g.teamGoals}–${g.oppGoals}`;
        const badge = g.delta == null ? '' : `<i><svg viewBox="0 0 10 8" aria-hidden="true"><path d="${g.delta >= 0 ? 'M5 0 10 8H0z' : 'M0 0h10L5 8z'}" fill="currentColor"/></svg>${Math.abs(g.delta)}</i>`;
        return `<span class="${g.win ? 'w' : 'l'}"><b>${sc}</b>${badge}</span>`;
      });
      while (cells.length < 5) cells.push('<span class="empty"><b>–</b></span>');
      last = `<div class="rw-last">${cells.join('')}</div>`;
    }
    const body = m.matches ? `${streak}${mmr}${grid}${last}` : `${mmr}<p class="none">${esc(t.noGames)}</p>`;
    const img = s.rankSymbols === 'images' && r.tier >= 0 ? `<img class="rw-emb-img" src="/ranks/${fileOf(r.tier)}.png" alt="">` : '';
    const dots = !pinned && list.length > 1 ? `<div class="rw-cyc" style="--cd:${s.cycleSeconds}s">${list.map((x, k) => `<i class="${k < cycleIdx % list.length ? 'done' : k === cycleIdx % list.length ? 'on' : ''}"></i>`).join('')}</div>` : '';
    el.innerHTML = `<div class="rw-card disp" style="--tier:${COLORS[key][0]};--tier-glow:${GLOW[key]}">
      <div class="rw-top">${img}<span class="rw-emb${key === 'none' ? ' unranked' : ''}"${img ? ' hidden' : ''}>${emblem(r.tier)}</span>
        <div class="nm${anim ? ' out' : ''}"><b>${esc(modeName(id))}</b><span class="rk"><span class="tier">${esc(tierName(r.tier, t))}</span>${pips}</span></div>
        <div class="rw-rec"><div class="wl"><span class="w">${m.w}</span> - <span class="l">${m.l}</span></div><small>${esc(t.winsLosses)}</small></div></div>
      <div class="rw-body${anim ? ' out' : ''}">${body}</div>${dots}</div>`;
    const im = el.querySelector('.rw-emb-img');
    if (im) im.onerror = () => { im.remove(); el.querySelector('.rw-emb').hidden = false; };
    if (anim) requestAnimationFrame(() => requestAnimationFrame(() => el.querySelectorAll('.out').forEach((x) => x.classList.remove('out'))));
    shownMode = id;
  }

  function startCycle() {
    clearTimeout(cycleTimer);
    if (o.layout !== 'card') return;
    cycleTimer = setTimeout(() => { cycleIdx++; card(true); startCycle(); }, o.style.cycleSeconds * 1000);
  }

  function feedEl() {
    el.innerHTML = '<div class="rw-feed"><div class="rw-toast disp"><span class="ev"></span><span class="pts"></span></div></div>';
  }
  function nextToast() {
    const f = queue.shift();
    if (!f) { feedBusy = false; return; }
    feedBusy = true;
    const s = o.style, toast = el.querySelector('.rw-toast');
    if (!toast) { feedBusy = false; return; }
    const label = f.key === 'win' || f.key === 'loss' ? `${t.ev[f.key]} ${f.label}` : t.ev[f.key] ?? f.label;
    toast.querySelector('.ev').textContent = label;
    toast.querySelector('.pts').textContent = s.showPoints && f.points != null ? `+${f.points}` : '';
    toast.className = `rw-toast disp${f.key === 'demolish' || f.key === 'loss' ? ' orange' : ''}${f.key === 'win' ? ' win' : f.key === 'loss' ? ' loss' : ''}`;
    toast.style.setProperty('--fd', `${s.feedSeconds}s`);
    void toast.offsetWidth;
    toast.classList.add('show');
    setTimeout(nextToast, s.feedSeconds * 1000 + 150);
  }

  function draw(anim) {
    t = TEXTS[o.style.lang] ?? TEXTS.en;
    applyStyle(el, o);
    if (o.layout === 'bar') bar();
    else if (o.layout === 'card') card(anim);
    else if (!el.querySelector('.rw-feed')) feedEl();
  }

  draw(false);
  startCycle();

  return {
    update(next) {
      const before = shownMode;
      d = { ...d, ...next };
      if (o.layout === 'bar' && next.live) {
        // only the values that changed get the small bump
        const old = [...el.querySelectorAll('.rw-me .rw-stat b')].map((b) => b.textContent);
        bar();
        el.querySelectorAll('.rw-me .rw-stat b').forEach((b, k) => { if (old.length && old[k] !== b.textContent) b.classList.add('bump'); });
      } else if (o.layout === 'card') { card(false); if (shownMode !== before) startCycle(); }
    },
    setOverlay(next) {
      const layoutChanged = next.layout !== o.layout;
      o = next;
      if (layoutChanged) el.innerHTML = '';
      draw(false);
      startCycle();
    },
    feed(f) {
      if (o.layout !== 'feed' || !o.style.feedEvents.includes(f.key)) return;
      queue.push(f);
      if (queue.length > 6) queue.shift();
      if (!feedBusy) nextToast();
    },
    /** A sample event so the statfeed is not empty in the editor */
    sample() { this.feed({ key: 'epicsave', label: 'Epic Save', points: 75 }); },
    destroy() { clearTimeout(cycleTimer); root.innerHTML = ''; },
  };
}
