// Editor: overlays with live preview, player and ranks, statistics. Everything is saved on the server.
import { LANGS, TEXTS, fill, guessLang } from './i18n.js';
import { SIZES, emblem, mount, tierName } from './render.js';

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const NAMES = { en: 'English', de: 'Deutsch', ru: 'Русский', fr: 'Français' };
const BAR_STATS = ['score', 'goals', 'assists', 'saves', 'shots', 'demos', 'touches'];
const CARD_STATS = ['goals', 'assists', 'saves', 'shots', 'shotpct', 'mvp', 'demos', 'score'];
const FEED_EVENTS = ['goal', 'assist', 'save', 'epicsave', 'shot', 'demolish', 'hattrick', 'mvp', 'win', 'loss'];
const PARTS = [['showStreak', 'partStreak'], ['showMmr', 'partMmr'], ['showStats', 'partStats'], ['showLast', 'partLast']];

let lang = guessLang();
let t = TEXTS[lang];
let me = { user: null, loginEnabled: false, demo: false };
let setup = null; // modes, tiers, ranks, playlists, player ...
let overlays = [];
let cur = null; // overlay being edited
let live = null, session = null;
let view = null;
let tab = 'overlay';
let statMode = '';

async function api(method, url, body) {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) { location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.hash)}`; throw new Error('login'); }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.error ?? String(res.status)), { code: data?.error });
  return data;
}

// ---------- texts ----------

function paintTexts() {
  t = TEXTS[lang];
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t[el.dataset.t]; });
  $('lang').setAttribute('aria-label', t.langLabel);
  ['Score', 'Goals', 'Assists', 'Saves', 'Shots'].forEach((k) => { $(`th${k}`).textContent = t.stat[k.toLowerCase()]; });
  paintStatus();
}

function paintStatus() {
  const el = $('status');
  if (!live) return;
  const [key, cls] = live.demo ? ['stDemo', 'demo'] : !live.connected ? ['stWait', ''] : live.inMatch ? ['stMatch', 'match'] : ['stLive', 'ok'];
  el.textContent = t[key];
  el.className = `status ${cls}`;
}

// ---------- overlay tab ----------

const checks = (box, list, labels, chosen, onChange) => {
  box.innerHTML = list.map((k) => `<label class="check"><input type="checkbox" value="${k}"${chosen.includes(k) ? ' checked' : ''} /><span>${esc(labels(k))}</span></label>`).join('');
  box.onchange = () => onChange([...box.querySelectorAll('input:checked')].map((i) => i.value));
};

function paintOverlayForm() {
  const o = cur, s = o.style;
  $('ovSel').innerHTML = overlays.map((x) => `<option value="${x.id}"${x.id === o.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
  $('ovName').value = o.name;
  $('layoutSeg').innerHTML = [['bar', 'layoutBar'], ['card', 'layoutCard'], ['feed', 'layoutFeed']]
    .map(([v, k]) => `<button type="button" data-v="${v}" aria-pressed="${o.layout === v}">${esc(t[k])}</button>`).join('');
  $('secBar').hidden = o.layout !== 'bar';
  $('secCard').hidden = o.layout !== 'card';
  $('secFeed').hidden = o.layout !== 'feed';
  const [w, h] = SIZES[o.layout];
  $('obsUrl').value = `${location.origin}/overlay/${o.id}`;
  $('obsHint').textContent = fill(t.obsHint, { w: Math.round((w * s.scale) / 100), h: Math.round((h * s.scale) / 100) });
  checks($('barStats'), BAR_STATS, (k) => t.stat[k], s.barStats, (v) => change({ barStats: BAR_STATS.filter((k) => v.includes(k)) }));
  $('showName').checked = s.showName;
  $('hideIdle').checked = s.hideIdle;
  $('modesSeg').innerHTML = setup.modes.map((m) => `<button type="button" data-v="${m.id}" aria-pressed="${s.modes.includes(m.id)}">${esc(m.name)}</button>`).join('');
  $('cycleSeconds').value = s.cycleSeconds; $('cycleOut').textContent = `${s.cycleSeconds} s`;
  $('followLive').checked = s.followLive;
  $('onlyPlayed').checked = s.onlyPlayed;
  $('symSeg').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === s.rankSymbols)));
  $('symNote').hidden = s.rankSymbols !== 'images';
  checks($('cardParts'), PARTS.map((p) => p[0]), (k) => t[PARTS.find((p) => p[0] === k)[1]], PARTS.map((p) => p[0]).filter((k) => s[k]),
    (v) => change(Object.fromEntries(PARTS.map(([k]) => [k, v.includes(k)]))));
  checks($('cardStats'), CARD_STATS, (k) => t.stat[k], s.cardStats, (v) => change({ cardStats: CARD_STATS.filter((k) => v.includes(k)) }));
  checks($('feedEvents'), FEED_EVENTS, (k) => t.ev[k], s.feedEvents, (v) => change({ feedEvents: v }));
  $('feedSeconds').value = s.feedSeconds; $('feedOut').textContent = `${s.feedSeconds} s`;
  $('showPoints').checked = s.showPoints;
  $('blue').value = s.blue; $('orange').value = s.orange;
  $('panel').value = s.panel; $('panelOut').textContent = s.panel;
  $('scale').value = s.scale; $('scaleOut').textContent = s.scale;
  $('ovLang').innerHTML = LANGS.map((l) => `<option value="${l}"${l === s.lang ? ' selected' : ''}>${NAMES[l]}</option>`).join('');
}

function preview() {
  if (!cur || !session) return;
  if (!view) {
    view = mount($('preview'), cur, { live, session, modes: setup.modes });
    view.sample();
  } else view.setOverlay(cur);
}

let saveTimer = 0;
function change(patch, top = {}) {
  cur = { ...cur, ...top, style: { ...cur.style, ...patch } };
  overlays = overlays.map((x) => (x.id === cur.id ? cur : x));
  paintOverlayForm();
  preview();
  if (cur.layout === 'feed' && (patch.feedEvents || patch.feedSeconds || patch.showPoints !== undefined || top.layout)) view.sample();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 300);
}

async function save() {
  try {
    const saved = await api('PUT', `/api/overlays/${cur.id}`, { name: cur.name, layout: cur.layout, style: cur.style });
    $('saveErr').textContent = '';
    overlays = overlays.map((x) => (x.id === saved.id ? saved : x));
  } catch (e) {
    if (e.message !== 'login') $('saveErr').textContent = t.saveError;
  }
}

function select(id) {
  cur = overlays.find((x) => x.id === id) ?? overlays[0];
  try { localStorage.setItem('rw-overlay', cur.id); } catch { /* storage blocked */ }
  if (view) { view.destroy(); view = null; }
  paintOverlayForm();
  preview();
}

function wireOverlay() {
  $('ovSel').addEventListener('change', () => select($('ovSel').value));
  $('ovName').addEventListener('input', () => { cur = { ...cur, name: $('ovName').value }; overlays = overlays.map((x) => (x.id === cur.id ? cur : x)); clearTimeout(saveTimer); saveTimer = setTimeout(async () => { await save(); paintOverlayForm(); }, 500); });
  $('layoutSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && b.dataset.v !== cur.layout) { change({}, { layout: b.dataset.v }); view.destroy(); view = null; preview(); if (cur.layout === 'feed') view.sample(); } });
  $('modesSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const on = cur.style.modes.includes(b.dataset.v);
    if (on && cur.style.modes.length === 1) return; // at least one playlist stays
    const next = on ? cur.style.modes.filter((m) => m !== b.dataset.v) : [...cur.style.modes, b.dataset.v];
    change({ modes: setup.modes.map((m) => m.id).filter((m) => next.includes(m)) });
  });
  $('symSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) change({ rankSymbols: b.dataset.v }); });
  for (const id of ['showName', 'hideIdle', 'followLive', 'onlyPlayed', 'showPoints']) $(id).addEventListener('change', () => change({ [id]: $(id).checked }));
  for (const id of ['cycleSeconds', 'feedSeconds', 'panel', 'scale']) $(id).addEventListener('input', () => change({ [id]: Number($(id).value) }));
  for (const id of ['blue', 'orange']) $(id).addEventListener('input', () => change({ [id]: $(id).value }));
  $('ovLang').addEventListener('change', () => change({ lang: $('ovLang').value }));
  $('resetDesign').addEventListener('click', async () => { cur = await api('POST', `/api/overlays/${cur.id}/reset`); overlays = overlays.map((x) => (x.id === cur.id ? cur : x)); paintOverlayForm(); preview(); });
  $('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('obsUrl').value); } catch { $('obsUrl').select(); document.execCommand('copy'); }
    $('copy').textContent = t.copied; setTimeout(() => { $('copy').textContent = t.copy; }, 1400);
  });
  const add = async (body) => { try { const o = await api('POST', '/api/overlays', body); overlays.push(o); select(o.id); } catch (e) { if (e.message !== 'login') $('ovErr').textContent = t.saveError; } };
  $('ovNew').addEventListener('click', () => add({ layout: cur.layout }));
  $('ovDup').addEventListener('click', () => add({ copyFrom: cur.id }));
  $('ovDel').addEventListener('click', async () => {
    $('ovErr').textContent = '';
    if (overlays.length <= 1) { $('ovErr').textContent = t.lastOverlay; return; }
    if (!confirm(t.removeAsk)) return;
    await api('DELETE', `/api/overlays/${cur.id}`);
    overlays = overlays.filter((x) => x.id !== cur.id);
    select(overlays[0].id);
  });
}

// ---------- player & ranks ----------

function flash(el) { el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 1200); }

function paintRanks() {
  $('player').value = setup.player;
  $('detected').textContent = !setup.player && setup.detected ? fill(t.detected, { n: setup.detected }) : '';
  const tierOpts = (sel) => `<option value="-1"${sel === -1 ? ' selected' : ''}>${esc(t.unranked)}</option>`
    + setup.tiers.map((_, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${esc(tierName(i, t))}</option>`).join('');
  $('rankRows').innerHTML = setup.modes.map((m) => {
    const r = setup.ranks[m.id];
    const num = (k) => `<input type="number" min="0" max="5000" step="1" data-k="${k}" value="${r[k] ?? ''}" aria-label="${k}" style="width:92px;text-align:right" />`;
    return `<tr data-mode="${m.id}"><td class="emb">${emblem(r.tier)}</td><td>${esc(m.name)}</td><td><select data-k="tier">${tierOpts(r.tier)}</select></td>
      <td><select data-k="div"${r.tier < 0 || r.tier >= 21 ? ' disabled' : ''}>${[1, 2, 3, 4].map((d) => `<option${d === r.div ? ' selected' : ''}>${d}</option>`).join('')}</select></td>
      <td class="num">${num('mmr')}</td><td class="num">${num('divFrom')}</td><td class="num">${num('divTo')}</td><td><span class="saved">${esc(t.saved)}</span></td></tr>`;
  }).join('');
  // playlist ids: the known ones and the last unknown one
  const ids = Object.keys(setup.playlists).map(Number);
  if (setup.unknownPlaylist != null && !ids.includes(setup.unknownPlaylist)) ids.push(setup.unknownPlaylist);
  const modeOpts = (sel) => `<option value="">${esc(t.none)}</option>` + setup.modes.map((m) => `<option value="${m.id}"${m.id === sel ? ' selected' : ''}>${esc(m.name)}</option>`).join('');
  $('playlists').innerHTML = (setup.unknownPlaylist != null && !setup.playlists[setup.unknownPlaylist] ? `<p class="hint" style="color:var(--orange)">${esc(fill(t.unknown, { n: setup.unknownPlaylist }))}</p>` : '')
    + `<table style="max-width:460px"><thead><tr><th>ID</th><th>${esc(t.assign)}</th><th></th></tr></thead><tbody>${ids.sort((a, b) => a - b).map((id) => `<tr data-id="${id}"><td>${id}</td><td><select>${modeOpts(setup.playlists[id])}</select></td><td><span class="saved">${esc(t.saved)}</span></td></tr>`).join('')}</tbody></table>`;
  $('sessionSince').textContent = fill(t.sessionSince, { t: new Date(setup.sessionStart).toLocaleString(lang) });
}

function wireRanks() {
  let pt = 0;
  $('player').addEventListener('input', () => { clearTimeout(pt); pt = setTimeout(async () => { const r = await api('PUT', '/api/player', { name: $('player').value }); setup.player = r.player; setup.detected = r.detected; paintRanks(); }, 500); });
  $('rankRows').addEventListener('change', async (e) => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const body = {};
    tr.querySelectorAll('[data-k]').forEach((el) => { body[el.dataset.k] = el.value === '' ? null : Number(el.value); });
    setup.ranks[tr.dataset.mode] = await api('PUT', `/api/ranks/${tr.dataset.mode}`, body);
    const r = setup.ranks[tr.dataset.mode];
    tr.querySelector('.emb').innerHTML = emblem(r.tier);
    tr.querySelector('[data-k="div"]').disabled = r.tier < 0 || r.tier >= 21;
    flash(tr.querySelector('.saved'));
  });
  $('playlists').addEventListener('change', async (e) => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const r = await api('PUT', `/api/playlists/${tr.dataset.id}`, { mode: e.target.value || null });
    setup.playlists = r.playlists;
    flash(tr.querySelector('.saved'));
  });
  $('sessionNew').addEventListener('click', async () => { session = await api('POST', '/api/session/reset'); setup.sessionStart = session.start; paintRanks(); view?.update({ session }); });
}

// ---------- statistics ----------

async function paintStats() {
  const [stats, matches] = await Promise.all([api('GET', '/api/stats'), api('GET', `/api/matches?limit=200${statMode ? `&mode=${statMode}` : ''}`)]);
  const played = setup.modes.filter((m) => stats.modes[m.id]);
  $('statModes').innerHTML = `<button type="button" data-v="" aria-pressed="${!statMode}">${esc(t.stAll)}</button>`
    + played.map((m) => `<button type="button" data-v="${m.id}" aria-pressed="${statMode === m.id}">${esc(m.name)}</button>`).join('');
  const sum = (k) => (statMode ? stats.modes[statMode]?.[k] ?? 0 : Object.values(stats.modes).reduce((a, m) => a + m[k], 0));
  const n = sum('matches');
  const per = (k) => (n ? (sum(k) / n).toLocaleString(lang, { maximumFractionDigits: 2 }) : '–');
  $('tiles').innerHTML = [[t.stMatches, n.toLocaleString(lang)], [t.stWinRate, n ? `${Math.round((sum('w') / n) * 100)}%` : '–'], [t.stGoalsPer, per('goals')], [t.stSavesPer, per('saves')], [t.stMvp, sum('mvp').toLocaleString(lang), 'o']]
    .map(([l, v, c]) => `<div class="tile${c ? ` ${c}` : ''}"><div class="lbl">${esc(l)}</div><b>${esc(v)}</b></div>`).join('');
  chart(statMode ? stats.modes[statMode]?.mmr ?? [] : []);
  const nameOf = (id) => setup.modes.find((m) => m.id === id)?.name ?? t.stOther;
  $('noMatches').hidden = matches.length > 0;
  $('matchRows').innerHTML = matches.map((m) => {
    const delta = m.mmrAfter != null && m.mmrBefore != null ? m.mmrAfter - m.mmrBefore : null;
    return `<tr data-id="${esc(m.id)}"><td>${esc(new Date(m.endedAt).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' }))}</td><td>${esc(nameOf(m.mode))}</td>
      <td><span class="res ${m.win ? 'w' : 'l'}">${m.teamGoals}–${m.oppGoals}</span></td><td class="num">${m.score}</td><td class="num">${m.goals}</td><td class="num">${m.assists}</td><td class="num">${m.saves}</td><td class="num">${m.shots}</td><td class="num">${m.mvp ? '★' : ''}</td>
      <td class="num"><input type="number" min="0" max="5000" value="${m.mmrAfter ?? ''}" aria-label="${esc(t.stMmrAfter)}" /></td>
      <td class="num">${delta == null ? '' : `<span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲ ' : '▼ '}${Math.abs(delta)}</span>`}</td>
      <td><button type="button" class="x" title="${esc(t.stDelete)}" aria-label="${esc(t.stDelete)}">×</button></td></tr>`;
  }).join('');
}

function chart(points) {
  if (!statMode) { $('chart').innerHTML = `<p class="empty">${esc(t.stChartPick)}</p>`; return; }
  if (points.length < 2) { $('chart').innerHTML = `<p class="empty">${esc(t.stChartNone)}</p>`; return; }
  const W = 1000, H = 220, P = 34;
  const ys = points.map((p) => p.mmr), lo = Math.min(...ys) - 10, hi = Math.max(...ys) + 10;
  const x = (i) => P + (i / (points.length - 1)) * (W - P * 2), y = (v) => H - 24 - ((v - lo) / (hi - lo)) * (H - 48);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.mmr).toFixed(1)}`).join(' ');
  const grid = [lo + 10, Math.round((lo + hi) / 2), hi - 10].map((v) => `<line class="gl" x1="${P}" x2="${W - P}" y1="${y(v)}" y2="${y(v)}"/><text x="2" y="${y(v) + 4}">${Math.round(v)}</text>`).join('');
  $('chart').innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(t.stChart)}"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f8fff" stop-opacity=".35"/><stop offset="1" stop-color="#1f8fff" stop-opacity="0"/></linearGradient></defs>${grid}
    <path class="ar" d="${line} L${x(points.length - 1)} ${H - 24} L${x(0)} ${H - 24}Z"/><path class="ln" d="${line}"/>
    <circle cx="${x(points.length - 1)}" cy="${y(ys.at(-1))}" r="4.5" fill="#ff8a1f"/><text x="${x(points.length - 1) - 4}" y="${y(ys.at(-1)) - 10}" text-anchor="end" style="fill:#fff;font-size:13px">${ys.at(-1)}</text></svg>`;
}

function wireStats() {
  $('statModes').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { statMode = b.dataset.v; paintStats(); } });
  $('matchRows').addEventListener('change', async (e) => {
    const tr = e.target.closest('tr'); if (!tr || e.target.tagName !== 'INPUT') return;
    $('statErr').textContent = '';
    try { await api('PUT', `/api/matches/${encodeURIComponent(tr.dataset.id)}/mmr`, { mmr: e.target.value === '' ? null : Number(e.target.value) }); }
    catch (err) { if (err.message !== 'login') $('statErr').textContent = t.saveError; return; }
    setup = await api('GET', '/api/setup');
    paintStats();
  });
  $('matchRows').addEventListener('click', async (e) => {
    if (!e.target.closest('.x')) return;
    const tr = e.target.closest('tr');
    await api('DELETE', `/api/matches/${encodeURIComponent(tr.dataset.id)}`);
    paintStats();
  });
}

// ---------- tabs, language, live data ----------

function show(next) {
  tab = next;
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $('v-overlay').hidden = tab !== 'overlay';
  $('v-ranks').hidden = tab !== 'ranks';
  $('v-stats').hidden = tab !== 'stats';
  history.replaceState(null, '', tab === 'overlay' ? location.pathname + location.search : `#${tab}`);
  if (tab === 'ranks') paintRanks();
  if (tab === 'stats') paintStats();
}

async function start() {
  me = await api('GET', '/api/me');
  if (me.loginEnabled && !me.user) { location.href = '/login.html?next=/editor.html'; return; }
  $('logout').hidden = !me.loginEnabled;
  [setup, overlays, live, session] = await Promise.all([api('GET', '/api/setup'), api('GET', '/api/overlays'), api('GET', '/api/state'), api('GET', '/api/session')]);
  $('lang').innerHTML = LANGS.map((l) => `<option value="${l}">${NAMES[l]}</option>`).join('');
  $('lang').value = lang;
  paintTexts();
  let saved = null;
  try { saved = localStorage.getItem('rw-overlay'); } catch { /* storage blocked */ }
  wireOverlay(); wireRanks(); wireStats();
  select(overlays.some((o) => o.id === saved) ? saved : overlays[0].id);
  show(['ranks', 'stats'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overlay');

  $('lang').addEventListener('change', () => {
    lang = $('lang').value;
    try { localStorage.setItem('rw-lang', lang); } catch { /* storage blocked */ }
    paintTexts(); paintOverlayForm();
    if (tab === 'ranks') paintRanks();
    if (tab === 'stats') paintStats();
  });
  document.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.tab); });
  $('logout').addEventListener('click', async () => { await fetch('/api/logout', { method: 'POST' }); location.href = '/login.html'; });

  const events = new EventSource('/api/events');
  events.addEventListener('state', (e) => { live = JSON.parse(e.data); paintStatus(); view?.update({ live }); });
  events.addEventListener('session', (e) => { session = JSON.parse(e.data); view?.update({ session }); });
  events.addEventListener('feed', (e) => view?.feed(JSON.parse(e.data)));
  events.addEventListener('match', () => { if (tab === 'stats') paintStats(); });
}

start().catch((e) => { if (e.message !== 'login') console.error(e); });
