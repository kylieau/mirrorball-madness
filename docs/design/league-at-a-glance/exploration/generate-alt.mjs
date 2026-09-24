/**
 * Mirrorball Madness — League at a Glance ALT patterns
 * 1) Inline section expand  2) Card swap
 * Alongside existing sheet mocks; does not delete them.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import pkg from '/tmp/node_modules/playwright-core/index.js';
const { chromium } = pkg;

const DIR = '/workspace/mirrorball-league-expand';
const BASE_CSS = fs.readFileSync(path.join(DIR, '_shared.css'), 'utf8');

const EXTRA_CSS = `
/* —— Live Picks chrome —— */
.back-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 2px 16px 0;
}
.back-link {
  display: flex; align-items: center; gap: 6px;
  color: #C9B7C6; font-size: 14px; font-weight: 500;
}
.back-link .disco { font-size: 15px; line-height: 1; }
.picks-title-block { padding: 6px 16px 4px; }
.picks-title-block h1 {
  font-family: 'Playfair Display', Georgia, serif;
  font-weight: 600; font-size: 36px; color: #F3EAF2;
  letter-spacing: 0.2px; line-height: 1.05;
}
.picks-title-block .gold-underline {
  width: 28px; height: 3px; background: var(--gold);
  border-radius: 2px; margin-top: 6px;
}
.league-under {
  padding: 6px 16px 8px;
  display: flex; align-items: center; gap: 4px;
  color: #C9B7C6; font-size: 14px; font-weight: 500;
}
.league-under .chev { font-size: 10px; opacity: 0.85; color: var(--gold-dim); }

.section-block { margin-bottom: 4px; }
.section-head {
  display: flex; align-items: center; gap: 8px;
  margin: 10px 2px 10px;
}
.section-head .ico { font-size: 18px; line-height: 1; }
.section-head h2 {
  font-family: 'Playfair Display', Georgia, serif;
  font-weight: 600; font-size: 22px; color: var(--gold);
  letter-spacing: 0.2px;
}
.gold-rule {
  height: 1px; margin: 14px 0 10px;
  background: linear-gradient(90deg, transparent, rgba(212,175,55,0.55), transparent);
}

/* Dance Card roster */
.roster-card .roster-title {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 20px; font-weight: 600; color: #fff; line-height: 1.2;
}
.roster-card .roster-pts {
  font-size: 13px; color: var(--muted); margin: 4px 0 12px;
}
.week-pager {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 2px 12px;
  font-size: 13px; font-weight: 600; color: #fff;
}
.week-pager .chev { color: var(--gold); font-size: 16px; padding: 0 6px; }
.roster-slot {
  background: rgba(0,0,0,0.28);
  border: 1px solid rgba(212,175,55,0.12);
  border-radius: 12px; padding: 12px; margin-bottom: 8px;
  display: flex; align-items: center; gap: 10px;
}
.roster-slot .slot-left { flex: 1; min-width: 0; }
.roster-slot .slot-name {
  font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 6px;
}
.pill-safe {
  display: inline-block; background: var(--safe); color: #fff;
  border-radius: 999px; padding: 2px 10px;
  font-size: 11px; font-weight: 600;
}
.roster-slot .slot-right { text-align: right; flex-shrink: 0; }
.roster-slot .week-pts { font-size: 15px; font-weight: 700; color: var(--gold); }
.roster-slot .tot-pts { font-size: 11px; color: var(--muted); margin-top: 2px; }
.survival-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 4px 10px;
  border-top: 1px solid var(--row-line);
  margin-top: 2px;
}
.survival-row .s-label {
  font-size: 11px; font-weight: 600; color: var(--muted);
}
.survival-row .s-pts {
  font-size: 13px; font-weight: 700; color: var(--gold);
  font-variant-numeric: tabular-nums;
}
.see-all-link {
  display: block; text-align: center;
  color: var(--gold); font-size: 13px; font-weight: 600;
  padding: 10px 4px 4px; text-decoration: none;
}
.pill-locked {
  background: var(--gold); color: #1A121E;
  border: 1px solid rgba(212,175,55,0.6);
  border-radius: 999px; padding: 3px 10px;
  font-size: 11px; font-weight: 600;
}

/* Curtain Call */
.cc-card {
  background: var(--card);
  border: 1px solid rgba(212,175,55,0.16);
  border-radius: 14px; padding: 14px 14px 12px; margin-bottom: 12px;
}
.cc-card .cc-title {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 20px; font-weight: 600; color: #F3EAF2; line-height: 1.2;
}
.cc-card .cc-blurb {
  font-size: 13px; color: var(--muted); line-height: 1.4; margin: 4px 0 8px;
}
.cc-lock-line {
  font-size: 11px; color: var(--gold-dim);
  margin: 0 0 10px; font-weight: 500;
}
.cc-field { margin-bottom: 12px; }
.cc-field .helper {
  font-size: 11px; color: var(--muted); line-height: 1.35; margin-bottom: 6px;
}
.cc-field .label {
  font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 8px;
}
.cc-dd {
  background: rgba(0,0,0,0.28);
  border: 1px solid rgba(212,175,55,0.28);
  border-radius: 12px; padding: 13px 14px;
  color: var(--muted); font-size: 14px;
  display: flex; justify-content: space-between; align-items: center;
}
.cc-dd.filled { color: #fff; font-weight: 600; }
.cc-dd .chev { color: var(--gold); font-size: 12px; }
.cc-dd.locked-field {
  border-color: rgba(212,175,55,0.18);
  background: rgba(0,0,0,0.18);
}
.cc-dd.locked-field .chev { display: none; }
.cc-card .card-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
}

/* Fade peek */
.dc-peek { margin-top: 2px; padding-bottom: 8px; }
.dc-peek .section-head { margin-bottom: 0; }
.dc-peek .fade {
  height: 28px; margin-top: 8px; border-radius: 10px;
  background: linear-gradient(180deg, rgba(45,30,45,0.9), transparent);
  border: 1px solid rgba(212,175,55,0.1); border-bottom: none; opacity: 0.7;
}

/* ========== SHARED hop ========== */
.league-hop {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
  padding: 12px;
  background: rgba(0,0,0,0.28);
  border: 1px solid rgba(212,175,55,0.28);
  border-radius: 12px;
  min-height: 48px;
}
.league-hop .hop-left {
  display: flex; align-items: center; gap: 10px; min-width: 0;
}
.league-hop .hop-ico {
  width: 28px; height: 28px; border-radius: 50%;
  background: rgba(212,175,55,0.14);
  border: 1px solid rgba(212,175,55,0.35);
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; flex-shrink: 0;
}
.league-hop .hop-label {
  font-size: 13px; font-weight: 600; color: #fff; line-height: 1.25;
}
.league-hop .hop-chev {
  color: var(--gold); font-size: 16px; font-weight: 600;
  flex-shrink: 0; padding-left: 4px;
}

/* Inline expand: hop becomes collapse control */
.league-hop.open {
  background: rgba(212,175,55,0.10);
  border-color: rgba(212,175,55,0.45);
  border-radius: 12px 12px 0 0;
  margin-bottom: 0;
}
.league-hop.open .hop-chev { /* collapse affordance */ }
.inline-league {
  background: rgba(0,0,0,0.22);
  border: 1px solid rgba(212,175,55,0.28);
  border-top: none;
  border-radius: 0 0 12px 12px;
  padding: 4px 8px 8px;
  margin-bottom: 2px;
}

/* Card swap: in-card league body */
.swap-back {
  display: flex; align-items: center; gap: 4px;
  font-size: 12px; font-weight: 600; color: var(--gold);
  margin-bottom: 8px; padding: 2px 0;
}
.swap-back .bchev { font-size: 14px; line-height: 1; }
.swap-title-row {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 8px; margin-bottom: 4px;
}
.swap-title-row h3 {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 18px; font-weight: 600; color: #fff; line-height: 1.2;
}
.module-chip {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 700;
  letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--gold);
  background: rgba(212,175,55,0.12);
  border: 1px solid rgba(212,175,55,0.32);
  border-radius: 999px;
  padding: 4px 10px;
  margin: 2px 0 10px;
  flex-shrink: 0; align-self: flex-start;
}
.module-chip .chip-ico {
  font-size: 12px; font-weight: 400; text-transform: none; letter-spacing: 0;
}
.swap-league-body { padding-bottom: 4px; }

/* ========== SHARED peer row ========== */
.peer-row {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 11px 4px;
  border-top: 1px solid var(--row-line);
}
.peer-row:first-child { border-top: none; }
.peer-row.open {
  background: rgba(212,175,55,0.07);
  border: 1px solid rgba(212,175,55,0.28);
  border-radius: 12px;
  margin: 4px 0;
  padding: 12px 10px;
  border-top-color: rgba(212,175,55,0.28);
}
.peer-av {
  width: 28px; height: 28px; border-radius: 50%;
  background: #3a283a; color: var(--gold);
  font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid rgba(212,175,55,0.3);
  flex-shrink: 0; margin-top: 1px;
}
.peer-av.me { background: var(--gold); color: #1A121E; }
.peer-meta { flex: 1; min-width: 0; }
.peer-name { font-size: 13px; font-weight: 600; color: #fff; }
.peer-summary {
  font-size: 11.5px; color: var(--muted); margin-top: 2px; line-height: 1.35;
}
.peer-summary strong { color: #EDE3EC; font-weight: 600; }
.peer-chev {
  color: var(--muted-dim); font-size: 14px; flex-shrink: 0; padding-top: 2px;
}
.peer-row.open .peer-chev { color: var(--gold); }

.peer-detail {
  margin-top: 8px; padding-top: 8px;
  border-top: 1px dashed rgba(212,175,55,0.22);
}
.peer-detail .d-row {
  display: flex; justify-content: space-between; align-items: baseline;
  gap: 8px; font-size: 12px; padding: 4px 0; color: #EDE3EC;
}
.peer-detail .d-row .d-k { color: var(--muted); font-size: 11px; }
.peer-detail .d-row .d-v { font-weight: 600; color: #fff; text-align: right; }
.peer-detail .d-row.survival .d-k,
.peer-detail .d-row.survival .d-v {
  font-size: 11px; color: var(--gold-dim); font-weight: 600;
}

.mini-bracket { margin-top: 4px; }
.mini-bracket .mb-row {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 0; font-size: 12px; color: #EDE3EC;
  border-top: 1px solid rgba(243,234,242,0.06);
}
.mini-bracket .mb-row:first-child { border-top: none; }
.mini-bracket .mb-num {
  width: 22px; font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums;
}
.mini-bracket .mb-couple { flex: 1; min-width: 0; }
.mini-bracket .mb-couple .celeb { font-weight: 600; color: #fff; }
.mini-bracket .mb-status { font-size: 10px; color: var(--muted); }
.mini-bracket .mb-row.next {
  background: var(--next-bg);
  border: 1px solid var(--next-border);
  border-radius: 8px;
  margin: 4px -4px; padding: 8px 6px;
  position: relative;
}
.mini-bracket .mb-row.next .next-tag {
  position: absolute; top: -8px; left: 8px;
  font-size: 9px; font-weight: 700; letter-spacing: 0.03em;
  text-transform: uppercase; color: var(--gold);
  background: #2D1E2D; padding: 0 4px;
}
.mini-bracket .mb-row.elim { opacity: 0.5; }
.mini-bracket .mb-row.elim .mb-couple,
.mini-bracket .mb-row.elim .mb-status { color: var(--muted-dim); }

.gf-tap-hint {
  font-size: 11px; color: var(--muted-dim); text-align: center;
  padding: 6px 0 2px;
}
.card-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
  margin-bottom: 8px;
}
.card-title {
  font-size: 16px; font-weight: 700; color: #fff; line-height: 1.25;
}
.gf-own .summary {
  font-size: 13px; color: var(--muted); line-height: 1.45; margin-bottom: 10px;
}
.gf-own .summary strong { color: #fff; }
.gf-own .row.next-elim {
  background: var(--next-bg);
  border: 1px solid var(--next-border);
  border-radius: 10px;
  margin: 4px 0;
  padding: 10px 8px;
  position: relative;
  display: flex; align-items: center; gap: 8px;
  flex-wrap: wrap;
}
.gf-own .row.next-elim .next-tag {
  position: absolute; top: -8px; left: 10px;
  font-size: 9px; font-weight: 700; letter-spacing: 0.03em;
  text-transform: uppercase; color: var(--gold);
  background: var(--card); padding: 0 4px;
}
.gf-own .row .num { font-size: 12px; color: var(--muted); width: 22px; }
.gf-own .row .couple { flex: 1; font-size: 13px; color: #fff; font-weight: 600; }
.gf-own .row .couple .celeb { color: #fff; }
.gf-own .row .pts {
  font-size: 11px; font-weight: 600; color: var(--gold);
  background: rgba(212,175,55,0.12);
  border: 1px solid rgba(212,175,55,0.3);
  border-radius: 999px; padding: 2px 8px;
}
.gf-own .row .status { font-size: 11px; color: var(--safe); font-weight: 600; }

body.phone-page { align-items: flex-start; height: auto; }
.phone { height: auto; align-self: flex-start; }

/* Compare strip */
body.compare-page {
  background: #0d0a10; padding: 28px 20px 40px; min-height: 100vh; display: block;
}
.compare-board { max-width: 920px; margin: 0 auto; }
.compare-title {
  font-family: 'Playfair Display', serif;
  color: var(--gold); font-size: 22px; text-align: center; margin-bottom: 4px;
}
.compare-intro {
  text-align: center; color: var(--muted); font-size: 12px;
  margin-bottom: 18px; line-height: 1.45;
}
.compare-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 16px; align-items: start;
}
.compare-panel {
  background: #141018;
  border: 1px solid rgba(212,175,55,0.25);
  border-radius: 16px; padding: 12px 10px 14px;
}
.compare-panel .panel-kicker {
  font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--gold);
  text-align: center; margin-bottom: 4px;
}
.compare-panel .panel-title {
  font-family: 'Playfair Display', serif;
  font-size: 15px; color: #fff; text-align: center; margin-bottom: 10px;
}
.compare-panel .phone {
  width: 100%; min-height: 0;
  box-shadow: 0 8px 28px rgba(0,0,0,0.45);
  border-radius: 22px;
}
.compare-panel .phone .scroll { padding-bottom: 16px; }
.compare-panel .bottom-nav { display: none; }
.compare-panel .status-bar { height: 36px; font-size: 12px; }
.compare-panel .picks-title-block h1 { font-size: 28px; }
`;

const CSS = BASE_CSS + '\n' + EXTRA_CSS;

const NAV = `
<nav class="bottom-nav">
  <div class="nav-item">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z"/></svg>
    Home
  </div>
  <div class="nav-item">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01" stroke-linecap="round"/></svg>
    Results
  </div>
  <div class="nav-item active">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20l4.5-1.2L19 8.3a2.1 2.1 0 0 0-3-3L5.5 15.8 4 20z"/><path d="M13.5 6.5l3 3"/></svg>
    Picks
  </div>
  <div class="nav-item">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 20h8M12 16v4M7 4h10v3a5 5 0 0 1-10 0V4z"/><path d="M7 7H5a2 2 0 0 0 2 3M17 7h2a2 2 0 0 1-2 3"/></svg>
    Standings
  </div>
</nav>`;

function leagueHop({ count = 6, open = false } = {}) {
  return `<div class="league-hop${open ? ' open' : ''}">
  <div class="hop-left">
    <div class="hop-ico">👥</div>
    <div class="hop-label">League at a Glance · ${count} managers</div>
  </div>
  <span class="hop-chev">${open ? '▴' : '›'}</span>
</div>`;
}

function peerRow({ initials, name, summary, open = false, detail = '', me = false }) {
  return `<div class="peer-row${open ? ' open' : ''}">
  <div class="peer-av${me ? ' me' : ''}">${initials}</div>
  <div class="peer-meta">
    <div class="peer-name">${name}</div>
    <div class="peer-summary">${summary}</div>
    ${open && detail ? `<div class="peer-detail">${detail}</div>` : ''}
  </div>
  <span class="peer-chev">${open ? '▴' : '▾'}</span>
</div>`;
}

const DC_PEERS = [
  {
    initials: 'L', name: 'Lauren Au',
    couples: 'Maura &amp; Mark · Ciara &amp; Brandon',
    detail: `<div class="d-row"><span>Maura &amp; Mark</span><span>+5.40</span></div>
      <div class="d-row"><span>Ciara &amp; Brandon</span><span>+4.10</span></div>
      <div class="d-row survival"><span class="d-k">Survival &amp; Bonuses</span><span class="d-v">+3.20</span></div>`,
  },
  { initials: 'JS', name: 'JSAK', couples: 'Harry &amp; Jenna · Amber &amp; Pasha' },
  { initials: 'Ke', name: 'Kellie Au', couples: 'Julia &amp; Ezra · Guillermo &amp; Witney' },
  { initials: 'W', name: 'Wlee13', couples: 'Jenna &amp; Val · Giada &amp; Alan <span style="opacity:0.7">(elim)</span>' },
  { initials: 'J', name: 'Jonathan Au', couples: 'Jackson &amp; Emma · Taylor &amp; Britt' },
  { initials: 'C', name: 'Colin', couples: 'Ezra &amp; Daniella · Tatyana &amp; Jan' },
];

const CC_PEERS = [
  { initials: 'K', name: 'You', me: true, home: 'Connor W. &amp; Rylee', high: 'Ezra &amp; Daniella' },
  { initials: 'Ke', name: 'Kellie Au', home: 'Jackson &amp; Emma', high: 'Harry &amp; Jenna' },
  { initials: 'W', name: 'Wlee13', home: 'Tyler &amp; Sharna', high: 'Jenna &amp; Val' },
  { initials: 'J', name: 'Jonathan Au', home: 'Guillermo &amp; Witney', high: 'Amber &amp; Pasha' },
  { initials: 'L', name: 'Lauren Au', home: 'Ciara &amp; Brandon', high: 'Julia &amp; Ezra' },
  { initials: 'JS', name: 'JSAK', home: 'Taylor &amp; Britt', high: 'Maura &amp; Mark' },
];

const GF_PEERS = [
  { initials: 'K', name: 'You', me: true, next: 'Tatyana &amp; Jan' },
  { initials: 'Ke', name: 'Kellie Au', next: 'Ciara &amp; Brandon' },
  { initials: 'W', name: 'Wlee13', next: 'Guillermo &amp; Witney' },
  { initials: 'J', name: 'Jonathan Au', next: 'Jackson &amp; Emma' },
  { initials: 'L', name: 'Lauren Au', next: 'Taylor &amp; Britt' },
  { initials: 'JS', name: 'JSAK', next: 'Connor W. &amp; Rylee' },
];

const KELLIE_MINI = [
  { n: 1, celeb: 'Maura', pro: 'Mark' },
  { n: 2, celeb: 'Harry', pro: 'Jenna' },
  { n: 3, celeb: 'Amber', pro: 'Pasha' },
  { n: 4, celeb: 'Ezra', pro: 'Daniella' },
  { n: 5, celeb: 'Jenna', pro: 'Val' },
  { n: 12, celeb: 'Tatyana', pro: 'Jan' },
  { n: 13, celeb: 'Ciara', pro: 'Brandon', next: true },
  { n: 14, celeb: 'Giada', pro: 'Alan', elim: true, status: 'Elim — Wk 2' },
  { n: 15, celeb: 'Sarah Jane', pro: 'Hailey', elim: true, status: 'Elim — Wk 1' },
  { n: 16, celeb: 'Conner L.', pro: 'Adele', elim: true, status: 'Elim — Wk 1' },
];

function kellieBracketDetail() {
  const rows = KELLIE_MINI.map((c) => {
    const cls = ['mb-row', c.next ? 'next' : '', c.elim ? 'elim' : ''].filter(Boolean).join(' ');
    const tag = c.next ? `<span class="next-tag">Next predicted elimination</span>` : '';
    return `<div class="${cls}">${tag}
      <span class="mb-num">${c.n}.</span>
      <span class="mb-couple"><span class="celeb">${c.celeb}</span> &amp; ${c.pro}</span>
      <span class="mb-status">${c.status || 'Active'}</span>
    </div>`;
  }).join('');
  return `<div class="mini-bracket">${rows}</div>`;
}

function phoneShell(inner, { time = '3:54' } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Mirrorball Madness</title>
<style>${CSS}</style>
</head>
<body class="phone-page">
  <div class="phone" id="phone">
    <div class="status-bar">
      <span>${time}</span>
      <span class="right">●●●● &nbsp;▲ &nbsp;72</span>
    </div>
    <div class="back-row">
      <div class="back-link"><span class="disco">🪩</span> Mirrorball Madness</div>
      <div class="avatar">K</div>
    </div>
    <div class="picks-title-block">
      <h1>Picks</h1>
      <div class="gold-underline"></div>
    </div>
    <div class="league-under">#supportSWEKylie <span class="chev">▾</span></div>
    <div class="scroll">
${inner}
    </div>
    ${NAV}
  </div>
</body>
</html>`;
}

function dcPeersBody({ expandIdx = 0 } = {}) {
  return DC_PEERS.map((p, i) => {
    const fallback = `<div class="d-row"><span>${(p.couples || '').split(' · ')[0] || ''}</span><span>—</span></div>
      <div class="d-row survival"><span class="d-k">Survival &amp; Bonuses</span><span class="d-v">+2.40</span></div>`;
    return peerRow({
      initials: p.initials,
      name: p.name,
      summary: p.couples,
      open: i === expandIdx,
      detail: p.detail || fallback,
    });
  }).join('');
}

function ccPeersBody({ expandIdx = 1 } = {}) {
  return CC_PEERS.map((p, i) => {
    const summary = `Home: <strong>${p.home}</strong> · High: <strong>${p.high}</strong>`;
    const detail = `<div class="d-row"><span class="d-k">Who goes home?</span><span class="d-v">${p.home}</span></div>
      <div class="d-row"><span class="d-k">Who scores highest?</span><span class="d-v">${p.high}</span></div>`;
    return peerRow({
      initials: p.initials,
      name: p.name,
      summary,
      me: !!p.me,
      open: i === expandIdx,
      detail,
    });
  }).join('');
}

function gfPeersBody({ expandIdx = 1 } = {}) {
  return GF_PEERS.map((p, i) => {
    const summary = `Next elim: <strong>${p.next}</strong>`;
    const detail = i === expandIdx ? kellieBracketDetail() : '';
    return peerRow({
      initials: p.initials,
      name: p.name,
      summary,
      me: !!p.me,
      open: i === expandIdx,
      detail,
    });
  }).join('');
}

function dcRosterSlots() {
  return `
    <div class="roster-pts">18.62 pts this season</div>
    <div class="week-pager">
      <span class="chev">‹</span>
      <span>Week 2 — Viral Hits Night</span>
      <span class="chev">›</span>
    </div>
    <div class="roster-slot">
      <div class="slot-left">
        <div class="slot-name">Ezra &amp; Daniella</div>
        <span class="pill-safe">Safe</span>
      </div>
      <div class="slot-right">
        <div class="week-pts">+6.80</div>
        <div class="tot-pts">6.80 total</div>
      </div>
    </div>
    <div class="roster-slot">
      <div class="slot-left">
        <div class="slot-name">Tatyana &amp; Jan</div>
        <span class="pill-safe">Safe</span>
      </div>
      <div class="slot-right">
        <div class="week-pts">+5.82</div>
        <div class="tot-pts">5.82 total</div>
      </div>
    </div>
    <div class="survival-row">
      <span class="s-label">Survival &amp; Bonuses</span>
      <span class="s-pts">+6.00</span>
    </div>`;
}

function gfPeekBelow() {
  return `<div class="gold-rule"></div>
   <div class="section-head"><span class="ico">🏆</span><h2>Grand Finale</h2></div>
   <div class="card"><div class="card-head"><div class="card-title">Your Season Bracket</div><span class="pill-locked">Locked</span></div></div>`;
}

function dcPeekBelow() {
  return `<div class="gold-rule"></div>
<div class="dc-peek section-block">
  <div class="section-head">
    <span class="ico">🪩</span>
    <h2>Dance Card</h2>
  </div>
  <div class="fade"></div>
</div>`;
}

/* ========== INLINE: own content + open hop + peers below on same scroll ========== */

function dcInlineOpen() {
  return `<div class="section-block">
  <div class="section-head">
    <span class="ico">🪩</span>
    <h2>Dance Card</h2>
  </div>
  <div class="card roster-card">
    <div class="roster-title">Your Fantasy Roster</div>
    ${dcRosterSlots()}
    ${leagueHop({ count: 6, open: true })}
    <div class="inline-league">${dcPeersBody({ expandIdx: 0 })}</div>
  </div>
  <a class="see-all-link" href="#">See Everyone’s Dance Cards →</a>
</div>
${gfPeekBelow()}`;
}

function ccInlineOpen() {
  return `<div class="section-block">
  <div class="section-head">
    <span class="ico">🔮</span>
    <h2>Curtain Call</h2>
  </div>
  <div class="cc-card">
    <div class="card-head" style="margin-bottom:4px">
      <div class="cc-title">Your Weekly Pick ’Em</div>
      <span class="pill-locked">Locked</span>
    </div>
    <p class="cc-blurb">Who’s taking their final bow, and who’s stealing the show? Make your call before the curtain rises.</p>
    <div class="week-pager">
      <span class="chev">‹</span>
      <span>Week 3 — Yacht Rock Night</span>
      <span class="chev">›</span>
    </div>
    <div class="cc-lock-line">Locked 9/29/2026, 5 PM PDT</div>
    <div class="cc-field">
      <div class="helper">Correct elimination: 2 pts · 0 pts if In Jeopardy · 13 couples left</div>
      <div class="label">Who goes home?</div>
      <div class="cc-dd filled locked-field">
        <span>Connor W. &amp; Rylee</span>
        <span class="chev">▾</span>
      </div>
    </div>
    <div class="cc-field">
      <div class="helper">Correct top scorer: 2 pts · 0 pts if within 1 of the high · 13 couples left</div>
      <div class="label">Who scores highest?</div>
      <div class="cc-dd filled locked-field">
        <span>Ezra &amp; Daniella</span>
        <span class="chev">▾</span>
      </div>
    </div>
    ${leagueHop({ count: 6, open: true })}
    <div class="inline-league">${ccPeersBody({ expandIdx: 1 })}</div>
  </div>
</div>
${dcPeekBelow()}`;
}

function gfInlineOpen() {
  return `<div class="section-block" style="opacity:0.45;pointer-events:none">
    <div class="section-head"><span class="ico">🪩</span><h2>Dance Card</h2></div>
    <div class="fade" style="height:20px;margin:0 0 8px;border-radius:10px;background:linear-gradient(180deg,rgba(45,30,45,0.5),transparent);border:1px solid rgba(212,175,55,0.08);border-bottom:none"></div>
  </div>
  <div class="gold-rule"></div>
  <div class="section-block">
  <div class="section-head">
    <span class="ico">🏆</span>
    <h2>Grand Finale</h2>
  </div>
  <div class="card gf-own">
    <div class="card-head">
      <div class="card-title">Your Season Bracket</div>
      <span class="pill-locked">Locked</span>
    </div>
    <p class="summary"><strong>Harry</strong> &amp; Jenna to take the mirrorball. Predictions are locked.</p>
    <div class="row next-elim">
      <span class="next-tag">Next predicted elimination</span>
      <span class="num">13.</span>
      <span class="couple"><span class="celeb">Tatyana</span> &amp; Jan</span>
      <span class="pts">207 pts</span>
      <span class="status">Active</span>
    </div>
    <p class="gf-tap-hint">Tap to view full bracket ▾</p>
    ${leagueHop({ count: 6, open: true })}
    <div class="inline-league">${gfPeersBody({ expandIdx: 1 })}</div>
  </div>
</div>`;
}

/* ========== CARD SWAP: body replaces own picks; same card chrome ========== */

function swapHeader({ backLabel, moduleLabel, moduleIco }) {
  return `<div class="swap-back"><span class="bchev">‹</span> ${backLabel}</div>
    <div class="swap-title-row"><h3>League at a Glance</h3></div>
    <div class="module-chip"><span class="chip-ico">${moduleIco}</span> ${moduleLabel}</div>`;
}

function dcSwapOwn() {
  return `<div class="section-block">
  <div class="section-head">
    <span class="ico">🪩</span>
    <h2>Dance Card</h2>
  </div>
  <div class="card roster-card">
    <div class="roster-title">Your Fantasy Roster</div>
    ${dcRosterSlots()}
    ${leagueHop({ count: 6, open: false })}
  </div>
  <a class="see-all-link" href="#">See Everyone’s Dance Cards →</a>
</div>
${gfPeekBelow()}`;
}

function dcSwapLeague() {
  return `<div class="section-block">
  <div class="section-head">
    <span class="ico">🪩</span>
    <h2>Dance Card</h2>
  </div>
  <div class="card roster-card">
    ${swapHeader({ backLabel: 'Your Fantasy Roster', moduleLabel: 'Dance Card', moduleIco: '🪩' })}
    <div class="swap-league-body">${dcPeersBody({ expandIdx: 0 })}</div>
  </div>
  <a class="see-all-link" href="#">See Everyone’s Dance Cards →</a>
</div>
${gfPeekBelow()}`;
}

function ccSwapLeague() {
  return `<div class="section-block">
  <div class="section-head">
    <span class="ico">🔮</span>
    <h2>Curtain Call</h2>
  </div>
  <div class="cc-card">
    ${swapHeader({ backLabel: 'Curtain Call', moduleLabel: 'Curtain Call', moduleIco: '🔮' })}
    <div class="swap-league-body">${ccPeersBody({ expandIdx: 1 })}</div>
  </div>
</div>
${dcPeekBelow()}`;
}

function gfSwapLeague() {
  return `<div class="section-block" style="opacity:0.45;pointer-events:none">
    <div class="section-head"><span class="ico">🪩</span><h2>Dance Card</h2></div>
    <div class="fade" style="height:20px;margin:0 0 8px;border-radius:10px;background:linear-gradient(180deg,rgba(45,30,45,0.5),transparent);border:1px solid rgba(212,175,55,0.08);border-bottom:none"></div>
  </div>
  <div class="gold-rule"></div>
  <div class="section-block">
  <div class="section-head">
    <span class="ico">🏆</span>
    <h2>Grand Finale</h2>
  </div>
  <div class="card gf-own">
    ${swapHeader({ backLabel: 'Grand Finale', moduleLabel: 'Grand Finale', moduleIco: '🏆' })}
    <div class="swap-league-body">${gfPeersBody({ expandIdx: 1 })}</div>
  </div>
</div>`;
}

function stripPhone(kicker, title, innerHtml) {
  return `<div class="compare-panel">
  <div class="panel-kicker">${kicker}</div>
  <div class="panel-title">${title}</div>
  <div class="phone">
    <div class="status-bar"><span>3:54</span><span class="right">●●●● ▲ 72</span></div>
    <div class="back-row">
      <div class="back-link"><span class="disco">🪩</span> Mirrorball Madness</div>
      <div class="avatar">K</div>
    </div>
    <div class="picks-title-block"><h1>Picks</h1><div class="gold-underline"></div></div>
    <div class="league-under">#supportSWEKylie <span class="chev">▾</span></div>
    <div class="scroll">${innerHtml}</div>
  </div>
</div>`;
}

const frames = {};

frames['dc-inline-open.html'] = phoneShell(dcInlineOpen(), { time: '3:54' });
frames['cc-inline-open.html'] = phoneShell(ccInlineOpen(), { time: '3:55' });
frames['gf-inline-open.html'] = phoneShell(gfInlineOpen(), { time: '3:56' });

frames['dc-swap-own.html'] = phoneShell(dcSwapOwn(), { time: '3:54' });
frames['dc-swap-league.html'] = phoneShell(dcSwapLeague(), { time: '3:54' });
frames['cc-swap-league.html'] = phoneShell(ccSwapLeague(), { time: '3:55' });
frames['gf-swap-league.html'] = phoneShell(gfSwapLeague(), { time: '3:56' });

frames['compare-inline-vs-swap.html'] = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Inline vs Card swap</title>
<style>${CSS}</style>
</head>
<body class="compare-page">
  <div class="compare-board">
    <div class="compare-title">Inline expand vs Card swap</div>
    <p class="compare-intro">Left: own roster stays; league grows under the hop on the Picks scroll. Right: same card chrome; body swaps to league with back control. Neither uses a sheet, scrim, or dismiss ×.</p>
    <div class="compare-grid">
      ${stripPhone('Inline · open', 'Dance Card', dcInlineOpen().replace(gfPeekBelow(), ''))}
      ${stripPhone('Card swap · league', 'Dance Card', dcSwapLeague().replace(gfPeekBelow(), ''))}
    </div>
  </div>
</body>
</html>`;

for (const [name, html] of Object.entries(frames)) {
  fs.writeFileSync(path.join(DIR, name), html);
  console.log('wrote', name);
}

const NOTES = `# League at a Glance — ALT patterns (vs sheet)

Companion to \`NOTES.md\` (sheet). Same hop copy and peer anatomy; different open behavior.

## Pattern A — Inline section expand
**Tap hop → league list grows under that card on the same Picks scroll.** Own module content stays visible above the hop. The hop flips to a collapse control (\`▾\`). No scrim, no sheet handle, no ×.

- Collapsed state = existing \`dc-compact\` / \`cc-compact\` / \`gf-compact\` (byte-identical hop; **not re-exported**).
- Open: peers stack below hop inside the card; one peer expanded for module detail.

## Pattern B — Card swap
**Tap hop → card body swaps** from own picks to the league list. Same card chrome and section header. Header area shows back \`‹ Your Fantasy Roster\` (DC) or \`‹ Curtain Call\` / \`‹ Grand Finale\` + title **League at a Glance** + gold module chip. Back/chevron returns to own content. Peers never stay stacked under own picks on the page.

## Vs sheet (existing)
| | Sheet | Inline | Card swap |
|--|-------|--------|-----------|
| Modal overlay | Yes (scrim + handle + ×) | No | No |
| Own content while open | Dimmed behind sheet | Still visible above hop | Replaced by league body |
| Scroll context | Sheet scroll | Main Picks scroll | Main Picks scroll (card body) |
| Hop when open | Covered / unused | Collapse control | N/A (body swapped) |

## Shared (all three patterns)
- Hop when collapsed: \`League at a Glance · 6 managers ›\`
- Peer-row anatomy; module detail only on peer expand
- Post-lock CC/GF as before
- DC numbers: 18.62 pts, Survival & Bonuses +6.00, Ezra/Tatyana, Week 2 Viral Hits
- Lauren expanded in DC with Survival & Bonuses; Kellie expanded in CC/GF

## Deliverables (this pack)
| File | Shows |
|------|--------|
| \`dc-inline-open.png\` | DC own roster + open hop + peers below; GF peek proves main scroll |
| \`cc-inline-open.png\` | CC own locked + open hop + peers; DC peek |
| \`gf-inline-open.png\` | GF own + open hop + peers; DC peek above |
| \`dc-swap-own.png\` | DC own roster + hop (swap closed) — near-identical to compact |
| \`dc-swap-league.png\` | DC card body swapped to league; back ‹ Your Fantasy Roster |
| \`cc-swap-league.png\` | CC card swapped to league |
| \`gf-swap-league.png\` | GF card swapped to league |
| \`compare-inline-vs-swap.png\` | Side-by-side DC inline-open vs DC swap-league |

**Skipped:** \`dc-inline-collapsed\` / \`cc-inline-collapsed\` / \`gf-inline-collapsed\` — reuse existing compact PNGs (same collapsed hop).
`;

fs.writeFileSync(path.join(DIR, 'NOTES-alt.md'), NOTES);
console.log('wrote NOTES-alt.md');

const shots = [
  ['dc-inline-open.html', 'dc-inline-open.png'],
  ['cc-inline-open.html', 'cc-inline-open.png'],
  ['gf-inline-open.html', 'gf-inline-open.png'],
  ['dc-swap-own.html', 'dc-swap-own.png'],
  ['dc-swap-league.html', 'dc-swap-league.png'],
  ['cc-swap-league.html', 'cc-swap-league.png'],
  ['gf-swap-league.html', 'gf-swap-league.png'],
  ['compare-inline-vs-swap.html', 'compare-inline-vs-swap.png', { wide: true }],
];

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

for (const [html, png, opts = {}] of shots) {
  const wide = !!opts.wide;
  const page = await browser.newPage({
    viewport: wide ? { width: 1000, height: 1600 } : { width: 450, height: 1100 },
    deviceScaleFactor: 2,
  });
  await page.goto('file://' + path.join(DIR, html), { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const target = wide ? await page.$('.compare-board') : await page.$('#phone');
  if (!target) throw new Error('missing target for ' + html);
  if (!wide) {
    const box = await target.boundingBox();
    const need = Math.ceil((box?.height || 900) + 60);
    if (need > 1100) {
      await page.setViewportSize({ width: 450, height: need });
      await page.waitForTimeout(200);
    }
  } else {
    const box = await target.boundingBox();
    const need = Math.ceil((box?.height || 900) + 60);
    if (need > 1600) {
      await page.setViewportSize({ width: 1000, height: need });
      await page.waitForTimeout(200);
    }
  }
  await target.screenshot({ path: path.join(DIR, png), type: 'png' });
  await page.close();
  console.log('shot', png);
}

await browser.close();

const cropPy = path.join(DIR, 'crop-tight.py');
const pngs = shots
  .filter(([, , opts]) => !(opts && opts.wide))
  .map(([, png]) => path.join(DIR, png));
const r = spawnSync('/tmp/pilvenv/bin/python3', [cropPy, ...pngs], { stdio: 'inherit' });
if (r.status) console.warn('crop-tight exit', r.status);

console.log('done');
