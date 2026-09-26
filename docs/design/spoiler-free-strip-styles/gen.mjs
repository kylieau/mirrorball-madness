import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(path.join(DIR, 'pngs'), { recursive: true });

const STATUS = `<div class="status-bar">
    <span>9:41</span>
    <span class="right">
      <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor"><rect x="0" y="3" width="3" height="8" rx="0.5"/><rect x="4.5" y="2" width="3" height="9" rx="0.5"/><rect x="9" y="0.5" width="3" height="10.5" rx="0.5"/><rect x="13.5" y="0" width="3" height="11" rx="0.5" opacity="0.35"/></svg>
      <svg width="15" height="11" viewBox="0 0 15 11" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M1 7.5a7 7 0 0 1 13 0"/><path d="M3.2 5.8a4.2 4.2 0 0 1 8.6 0"/><circle cx="7.5" cy="9.2" r="1.1" fill="currentColor" stroke="none"/></svg>
      <svg width="24" height="11" viewBox="0 0 24 11"><rect x="0.5" y="0.5" width="20" height="10" rx="2.5" stroke="currentColor" fill="none" opacity="0.45"/><rect x="2" y="2" width="15" height="7" rx="1.5" fill="currentColor"/><rect x="21.5" y="3.2" width="1.8" height="4.6" rx="0.6" fill="currentColor" opacity="0.45"/></svg>
    </span>
  </div>`;

const NAV = `<div class="bottom-nav">
    <div class="nav-item"><div class="nav-logo" aria-hidden="true"></div></div>
    <div class="nav-item active">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.2 3.5 10.2V21a.8.8 0 0 0 .8.8h5.2V15.5h5V21.8h5.2a.8.8 0 0 0 .8-.8V10.2L12 3.2z"/></svg>
      Home
    </div>
    <div class="nav-item">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M8 6h11M8 12h11M8 18h11"/><path d="M4.5 6.2l1.2 1.3 2-2.5M4.5 12.2l1.2 1.3 2-2.5M4.5 18.2l1.2 1.3 2-2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Results
    </div>
    <div class="nav-item">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 19.5 14.8 4.8l4.4 2.9L9.4 22.4H5v-2.9z"/><path d="M13.2 6.8l4.2 2.8" stroke-linecap="round"/></svg>
      Picks
    </div>
    <div class="nav-item">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 20h10M8.5 20V9.5h7V20M6 9.5h12M9.2 6.2 12 4l2.8 2.2"/><path d="M12 9.5v4"/></svg>
      Standings
    </div>
  </div>`;

const CURTAIN = `<div class="curtain">
      <div class="curtain-panel left" aria-hidden="true"></div>
      <div class="curtain-panel right" aria-hidden="true"></div>
      <div class="curtain-inner">
        <div class="sticky-chip">Week 3 · Curtain Up Soon</div>
        <div class="curtain-title">Picks Open</div>
        <div class="curtain-sub">Live On Air · Tuesday 5 PM PT</div>
        <div class="week-rail-quiet" aria-label="Season week progress">
          <div class="wq-node done"><div class="wq-dot"><svg class="wq-check" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.2l2.8 2.8L10 3.5"/></svg></div><span class="wq-label"></span></div>
          <div class="wq-node done"><div class="wq-dot"><svg class="wq-check" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.2l2.8 2.8L10 3.5"/></svg></div><span class="wq-label"></span></div>
          <div class="wq-node next"><div class="wq-dot">3</div><span class="wq-label">Next</span></div>
          <div class="wq-node faded"><div class="wq-dot"></div><span class="wq-label"></span></div>
          <div class="wq-node faded"><div class="wq-dot"></div><span class="wq-label"></span></div>
          <div class="wq-node faded"><div class="wq-dot"></div><span class="wq-label"></span></div>
        </div>
      </div>
    </div>`;

function homeBody(extraLeague = false) {
  return `${CURTAIN}
    <div class="picks-countdown">Picks close in 3d 4h</div>
    <div class="make-picks-card">
      <div class="league-hash">#supportSWEKylie</div>
      <div class="cta">Make picks ›</div>
    </div>
    <div class="section-head">
      <h2>Leagues This Week · 1 of 4 needs picks</h2>
      <div class="see-all">Manage <span>›</span></div>
    </div>
    <div class="league-list-card">
      <div class="league-row">
        <div>
          <div class="name">#supportSWEKylie</div>
          <div class="meta">Rank 4 of 7 · 0.00 pts</div>
        </div>
        <span class="pill due">Picks Due</span>
      </div>
      <div class="league-row">
        <div>
          <div class="name">Carrie Ann&apos;s Biggest Fans</div>
          <div class="meta">Rank 4 of 6 · 0.00 pts</div>
        </div>
        <span class="pill behind">1 wk behind</span>
      </div>
      <div class="league-row">
        <div>
          <div class="name">Pen &amp; Paso (Doble)</div>
          <div class="meta">Rank 6 of 6 · 0.00 pts</div>
        </div>
        <span class="pill behind">1 wk behind</span>
      </div>
      ${extraLeague ? `<div class="league-row">
        <div>
          <div class="name">matt with the stars</div>
          <div class="meta">Rank 5 of 6 · 0.00 pts</div>
        </div>
        <span class="pill behind">1 wk behind</span>
      </div>` : ''}
    </div>`;
}

function stickySoft() {
  return `<div class="sticky-chrome style-soft">
    <div class="logo-row">
      <div class="wordmark"><span class="orb"></span>Mirrorball Madness</div>
      <div class="avatar">K</div>
    </div>
    <div class="sf-line">
      <span class="dot"></span>
      <div class="copy"><b>Spoiler-Free</b> · Week 2 results are in</div>
      <span class="cta">Mark Watched</span>
    </div>
  </div>`;
}
function stickyChip() {
  return `<div class="sticky-chrome style-chip">
    <div class="logo-row">
      <div class="wordmark"><span class="orb"></span>Mirrorball Madness</div>
      <div class="avatar">K</div>
    </div>
    <div class="sf-chips">
      <div class="sf-status-chip"><span class="dot"></span><span><b>Spoiler-Free</b> · Week 2 results are in</span></div>
      <span class="sf-cta">Mark Watched</span>
    </div>
  </div>`;
}
function stickyCompact() {
  return `<div class="sticky-chrome style-compact">
    <div class="logo-row">
      <div class="brand-stack">
        <div class="wordmark"><span class="orb"></span>Mirrorball Madness</div>
        <div class="sf-mini"><span class="dot"></span><span><b>Spoiler-Free</b> · Week 2 results are in</span></div>
      </div>
      <div class="compact-actions">
        <span class="cta-ghost">Mark Watched</span>
        <div class="avatar">K</div>
      </div>
    </div>
  </div>`;
}
function stickyAccent() {
  return `<div class="sticky-chrome style-accent">
    <div class="logo-row">
      <div class="wordmark"><span class="orb"></span>Mirrorball Madness</div>
      <div class="avatar">K</div>
    </div>
    <div class="sf-line">
      <span class="dot"></span>
      <div class="copy"><b>Spoiler-Free</b> · Week 2 results are in</div>
      <span class="cta">Mark Watched</span>
    </div>
  </div>`;
}

const stickies = {
  soft: stickySoft,
  chip: stickyChip,
  compact: stickyCompact,
  accent: stickyAccent,
};

function phonePage({ title, caption, styleKey, scrolled }) {
  const sticky = stickies[styleKey]();
  const body = scrolled
    ? `<div class="scroll-clip"><div class="scroll home scrolled-deep">${homeBody(true)}</div></div>`
    : `<div class="scroll home">
    <div class="page-title-block"><h1>Home</h1></div>
    ${homeBody(false)}
  </div>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<link rel="stylesheet" href="shared.css"/>
<link rel="stylesheet" href="phone-common.css"/>
</head>
<body class="phone-page">
<div class="phone-wrap" id="shot">
<div class="phone" id="phone">
${STATUS}
${sticky}
${body}
${NAV}
</div>
<div class="caption-badge">${caption}</div>
</div>
</body>
</html>
`;
}

const pages = [
  { file: '02-soft-inset.html', title: 'Soft inset · Rest — Mirrorball Madness', caption: '1 · Soft inset · Rest — tinted fill, single hairline, no double rails', styleKey: 'soft', scrolled: false },
  { file: '03-chip-row.html', title: 'Chip row · Rest — Mirrorball Madness', caption: '2 · Chip row · Rest — status chip + Mark Watched in sticky padding', styleKey: 'chip', scrolled: false },
  { file: '04-compact.html', title: 'Compact one-line · Rest — Mirrorball Madness', caption: '3 · Compact · Rest — SF under wordmark, ghost Mark Watched by avatar', styleKey: 'compact', scrolled: false },
  { file: '05-accent-rail.html', title: 'Accent rail · Rest — Mirrorball Madness', caption: '4 · Accent rail · Rest — tinted band, left gold edge, rounded bottom', styleKey: 'accent', scrolled: false },
  { file: '06-soft-scroll.html', title: 'Soft inset · Scroll — Mirrorball Madness', caption: '1 · Soft inset · Scroll — branding + soft SF stay sticky together', styleKey: 'soft', scrolled: true },
  { file: '07-chip-scroll.html', title: 'Chip row · Scroll — Mirrorball Madness', caption: '2 · Chip row · Scroll — chip toolbar stays with wordmark + avatar', styleKey: 'chip', scrolled: true },
];

for (const p of pages) {
  writeFileSync(path.join(DIR, p.file), phonePage(p));
  console.log('wrote', p.file);
}

// ——— BOARD ———
const boardCss = `
  body.board-page { padding: 28px 24px 36px; }
  .board {
    width: 1480px;
    background: #08050a;
    border-radius: 18px;
    padding: 28px 28px 22px;
  }
  .board > h1 {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 26px;
    font-weight: 600;
    color: #fff;
    margin-bottom: 6px;
  }
  .board .sub {
    font-size: 13.5px;
    color: var(--muted);
    line-height: 1.45;
    max-width: 1180px;
    margin-bottom: 18px;
  }
  .board .sub strong { color: #E8D5E4; font-weight: 600; }
  .board .sub .gold { color: var(--gold-bright); }
  .phones {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }
  .col { display: flex; flex-direction: column; gap: 8px; }
  .col-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 4px 2px;
    min-height: 52px;
  }
  .col-top { display: flex; align-items: baseline; gap: 7px; }
  .col-letter {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 18px;
    color: var(--gold);
    font-weight: 600;
  }
  .col-name { font-size: 13px; font-weight: 600; color: #F3EAF2; }
  .col-desc { font-size: 11px; color: var(--muted); line-height: 1.35; }
  .phone.mini {
    width: 100%;
    height: 680px;
    border-radius: 28px;
  }
  .phone.mini .status-bar { height: 36px; font-size: 13px; padding: 0 22px 6px; }
  .phone.mini .bottom-nav { height: 62px; padding: 6px 2px 12px; }
  .phone.mini .nav-item { font-size: 9px; }
  .phone.mini .nav-item svg { width: 18px; height: 18px; }
  .phone.mini .nav-logo { width: 22px; height: 22px; }

  .sticky-chrome {
    flex-shrink: 0;
    background: rgba(20, 14, 22, 0.98);
    border-bottom: 1px solid rgba(243,234,242,0.08);
    z-index: 14;
  }
  .logo-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 14px 5px;
    gap: 8px;
  }
  .wordmark {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 13.5px;
    font-weight: 600;
    color: #F8F0F6;
    letter-spacing: 0.01em;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .wordmark .orb {
    width: 16px; height: 16px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #F0D978, #D4AF37 55%, #8A6A1E);
    box-shadow: 0 0 0 1px rgba(212,175,55,0.35);
    flex-shrink: 0;
  }
  .logo-row .avatar { width: 26px; height: 26px; font-size: 11px; }

  .sf-line {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 30px;
    padding: 5px 12px 6px 14px;
    background: linear-gradient(180deg, rgba(42,28,40,0.97), rgba(26,18,30,0.99));
    border-top: 1px solid rgba(212,175,55,0.18);
    border-bottom: 1px solid rgba(212,175,55,0.18);
  }
  .sf-line .dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--gold);
    box-shadow: 0 0 0 2px rgba(212,175,55,0.22);
    flex-shrink: 0;
  }
  .sf-line .copy {
    flex: 1; min-width: 0;
    font-size: 10.5px;
    font-weight: 500;
    color: rgba(243,234,242,0.86);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
  }
  .sf-line .copy b { color: var(--gold-bright); font-weight: 600; }
  .sf-line .cta, .sf-cta {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 700;
    color: #1A121E;
    background: linear-gradient(180deg, #E8C547, #D4AF37);
    padding: 4px 9px;
    border-radius: 999px;
    white-space: nowrap;
  }

  /* Soft */
  .style-soft.sticky-chrome { border-bottom: none; }
  .style-soft .sf-line {
    background: linear-gradient(180deg, rgba(52, 34, 50, 0.92), rgba(36, 24, 40, 0.88));
    border-top: none;
    border-bottom: 1px solid rgba(243, 234, 242, 0.14);
  }

  /* Chip */
  .style-chip .sf-chips {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 1px 12px 8px 14px;
    background: transparent;
  }
  .style-chip .sf-status-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 100%;
    min-width: 0;
    background: rgba(212, 175, 55, 0.11);
    border: 1px solid rgba(212, 175, 55, 0.3);
    border-radius: 999px;
    padding: 4px 9px 4px 8px;
    font-size: 10px;
    font-weight: 500;
    color: rgba(243,234,242,0.9);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
  }
  .style-chip .sf-status-chip .dot {
    width: 5px; height: 5px;
    border-radius: 50%;
    background: var(--gold);
    box-shadow: 0 0 0 1.5px rgba(212,175,55,0.2);
    flex-shrink: 0;
  }
  .style-chip .sf-status-chip b { color: var(--gold-bright); font-weight: 600; }
  .style-chip .sf-cta { font-size: 9.5px; padding: 4px 8px; }

  /* Compact */
  .style-compact .logo-row { padding: 7px 12px 7px 14px; gap: 6px; }
  .style-compact .brand-stack {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1;
  }
  .style-compact .wordmark { font-size: 12.5px; }
  .style-compact .sf-mini {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 9.5px;
    font-weight: 500;
    color: rgba(243,234,242,0.72);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-left: 22px;
  }
  .style-compact .sf-mini .dot {
    width: 4.5px; height: 4.5px;
    border-radius: 50%;
    background: var(--gold);
    box-shadow: 0 0 0 1.5px rgba(212,175,55,0.2);
    flex-shrink: 0;
  }
  .style-compact .sf-mini b { color: var(--gold-bright); font-weight: 600; }
  .style-compact .compact-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .style-compact .cta-ghost {
    font-size: 9.5px;
    font-weight: 600;
    color: var(--gold-bright);
    background: transparent;
    border: 1px solid rgba(212, 175, 55, 0.38);
    padding: 3px 7px;
    border-radius: 999px;
    white-space: nowrap;
  }

  /* Accent */
  .style-accent.sticky-chrome { border-bottom: none; padding-bottom: 5px; }
  .style-accent .sf-line {
    margin: 0 8px 0;
    padding: 6px 10px 6px 11px;
    background: linear-gradient(180deg, rgba(42,28,40,0.85), rgba(28,18,32,0.92));
    border-top: 1px solid rgba(212, 175, 55, 0.32);
    border-bottom: none;
    border-left: 2.5px solid var(--gold);
    border-radius: 0 0 11px 11px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }

  .page-title-block { padding: 6px 14px 4px; flex-shrink: 0; }
  .page-title-block h1 {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 28px;
    font-weight: 600;
    color: #fff;
    letter-spacing: -0.01em;
    line-height: 1.05;
    display: inline-block;
    position: relative;
    padding-bottom: 4px;
  }
  .page-title-block h1::after {
    content: '';
    position: absolute;
    left: 0; bottom: 0;
    width: 36px; height: 2px;
    background: var(--gold);
    border-radius: 1px;
  }
  .scroll.tight { padding: 4px 12px 8px; gap: 8px; }
  .curtain { min-height: 118px; }
  .curtain-inner { padding: 12px 48px 10px; gap: 2px; }
  .curtain-title { font-size: 24px; }
  .curtain-sub { font-size: 11px; color: rgba(232,197,71,0.85); }
  .sticky-chip { font-size: 9.5px; padding: 2px 8px; margin-bottom: 2px; }
  .week-rail-quiet { max-width: 200px; }
  .wq-dot { width: 14px; height: 14px; font-size: 7.5px; }
  .wq-label { font-size: 7.5px; }
  .picks-countdown { font-size: 18px; text-align: left; padding: 0 2px; }
  .make-picks-card { padding: 10px 12px; border-radius: 12px; }
  .make-picks-card .league-hash { font-size: 14px; }
  .make-picks-card .cta { font-size: 12px; }
  .section-head h2 { font-size: 13.5px; color: var(--gold); }
  .section-head .see-all { font-size: 11px; }
  .league-list-card { border-radius: 12px; }
  .league-row { padding: 9px 12px; }
  .league-row .name { font-size: 13px; }
  .league-row .meta { font-size: 10.5px; }
  .pill { font-size: 10px; padding: 3px 8px; }
  .pill.behind {
    background: rgba(154,135,152,0.1);
    color: var(--muted);
    border: 1px solid rgba(154,135,152,0.22);
  }
  .callout {
    margin-top: 16px;
    padding: 11px 14px;
    border-radius: 10px;
    background: rgba(212,175,55,0.08);
    border: 1px solid rgba(212,175,55,0.22);
    font-size: 12.5px;
    color: #D9CBD7;
    line-height: 1.45;
  }
  .callout strong { color: var(--gold-bright); }
  .current-note {
    margin-top: 10px;
    font-size: 11.5px;
    color: var(--muted);
    line-height: 1.4;
  }
  .current-note em {
    font-style: normal;
    color: rgba(232,197,71,0.85);
    font-weight: 600;
  }
  .scroll-row {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    margin-top: 22px;
    max-width: 720px;
  }
  .row-head {
    grid-column: 1 / -1;
    font-size: 12px;
    font-weight: 600;
    color: rgba(243,234,242,0.7);
    letter-spacing: 0.02em;
    margin-bottom: -2px;
  }
  .scroll-clip {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .scroll.scrolled-deep {
    margin-top: 0;
    transform: translateY(-88px);
  }
`;

const miniCurtain = `<div class="curtain">
            <div class="curtain-panel left"></div>
            <div class="curtain-panel right"></div>
            <div class="curtain-inner">
              <div class="sticky-chip">Week 3 · Curtain Up Soon</div>
              <div class="curtain-title">Picks Open</div>
              <div class="curtain-sub">Live On Air · Tuesday 5 PM PT</div>
              <div class="week-rail-quiet">
                <div class="wq-node done"><div class="wq-dot"><svg class="wq-check" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M2 6.2l2.8 2.8L10 3.5"/></svg></div><span class="wq-label"></span></div>
                <div class="wq-node done"><div class="wq-dot"><svg class="wq-check" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M2 6.2l2.8 2.8L10 3.5"/></svg></div><span class="wq-label"></span></div>
                <div class="wq-node next"><div class="wq-dot">3</div><span class="wq-label">Next</span></div>
                <div class="wq-node faded"><div class="wq-dot"></div><span class="wq-label"></span></div>
                <div class="wq-node faded"><div class="wq-dot"></div><span class="wq-label"></span></div>
              </div>
            </div>
          </div>`;

const miniRestBody = `${miniCurtain}
          <div class="picks-countdown">Picks close in 3d 4h</div>
          <div class="make-picks-card">
            <div class="league-hash">#supportSWEKylie</div>
            <div class="cta">Make picks ›</div>
          </div>
          <div class="section-head">
            <h2>Leagues This Week · 1 of 4</h2>
            <div class="see-all">Manage <span>›</span></div>
          </div>
          <div class="league-list-card">
            <div class="league-row">
              <div><div class="name">#supportSWEKylie</div><div class="meta">Rank 4 of 7 · 0.00 pts</div></div>
              <span class="pill due">Picks Due</span>
            </div>
            <div class="league-row">
              <div><div class="name">Carrie Ann&apos;s Biggest Fans</div><div class="meta">Rank 4 of 6 · 0.00 pts</div></div>
              <span class="pill behind">1 wk behind</span>
            </div>
          </div>`;

const miniScrollBody = `${miniCurtain}
          <div class="picks-countdown">Picks close in 3d 4h</div>
          <div class="make-picks-card">
            <div class="league-hash">#supportSWEKylie</div>
            <div class="cta">Make picks ›</div>
          </div>
          <div class="section-head">
            <h2>Leagues This Week · 1 of 4</h2>
            <div class="see-all">Manage <span>›</span></div>
          </div>
          <div class="league-list-card">
            <div class="league-row">
              <div><div class="name">#supportSWEKylie</div><div class="meta">Rank 4 of 7 · 0.00 pts</div></div>
              <span class="pill due">Picks Due</span>
            </div>
            <div class="league-row">
              <div><div class="name">Carrie Ann&apos;s Biggest Fans</div><div class="meta">Rank 4 of 6 · 0.00 pts</div></div>
              <span class="pill behind">1 wk behind</span>
            </div>
            <div class="league-row">
              <div><div class="name">Pen &amp; Paso (Doble)</div><div class="meta">Rank 6 of 6 · 0.00 pts</div></div>
              <span class="pill behind">1 wk behind</span>
            </div>
          </div>`;

const miniNav = `<div class="bottom-nav">
          <div class="nav-item"><div class="nav-logo"></div></div>
          <div class="nav-item active"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.2 3.5 10.2V21a.8.8 0 0 0 .8.8h5.2V15.5h5V21.8h5.2a.8.8 0 0 0 .8-.8V10.2L12 3.2z"/></svg>Home</div>
          <div class="nav-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M8 6h11M8 12h11M8 18h11"/></svg>Results</div>
          <div class="nav-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 19.5 14.8 4.8l4.4 2.9L9.4 22.4H5v-2.9z"/></svg>Picks</div>
          <div class="nav-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 20h10M8.5 20V9.5h7V20"/></svg>Standings</div>
        </div>`;

function miniSoft() {
  return `<div class="sticky-chrome style-soft">
          <div class="logo-row">
            <div class="wordmark"><span class="orb"></span>Mirrorball Madness</div>
            <div class="avatar">K</div>
          </div>
          <div class="sf-line">
            <span class="dot"></span>
            <div class="copy"><b>Spoiler-Free</b> · Week 2 results are in</div>
            <span class="cta">Mark Watched</span>
          </div>
        </div>`;
}
function miniChip() {
  return `<div class="sticky-chrome style-chip">
          <div class="logo-row">
            <div class="wordmark"><span class="orb"></span>Mirrorball Madness</div>
            <div class="avatar">K</div>
          </div>
          <div class="sf-chips">
            <div class="sf-status-chip"><span class="dot"></span><span><b>Spoiler-Free</b> · Week 2 results are in</span></div>
            <span class="sf-cta">Mark Watched</span>
          </div>
        </div>`;
}
function miniCompact() {
  return `<div class="sticky-chrome style-compact">
          <div class="logo-row">
            <div class="brand-stack">
              <div class="wordmark"><span class="orb"></span>Mirrorball Madness</div>
              <div class="sf-mini"><span class="dot"></span><span><b>Spoiler-Free</b> · Week 2 results are in</span></div>
            </div>
            <div class="compact-actions">
              <span class="cta-ghost">Mark Watched</span>
              <div class="avatar">K</div>
            </div>
          </div>
        </div>`;
}
function miniAccent() {
  return `<div class="sticky-chrome style-accent">
          <div class="logo-row">
            <div class="wordmark"><span class="orb"></span>Mirrorball Madness</div>
            <div class="avatar">K</div>
          </div>
          <div class="sf-line">
            <span class="dot"></span>
            <div class="copy"><b>Spoiler-Free</b> · Week 2 results are in</div>
            <span class="cta">Mark Watched</span>
          </div>
        </div>`;
}

function col(letter, name, desc, stickyHtml, scrolled = false) {
  const scroll = scrolled
    ? `<div class="scroll-clip"><div class="scroll tight scrolled-deep">${miniScrollBody}</div></div>`
    : `<div class="scroll tight">
          <div class="page-title-block" style="padding-left:2px;padding-right:2px"><h1>Home</h1></div>
          ${miniRestBody}
        </div>`;
  return `<div class="col">
      <div class="col-label">
        <div class="col-top">
          <span class="col-letter">${letter}</span>
          <span class="col-name">${name}</span>
        </div>
        <div class="col-desc">${desc}</div>
      </div>
      <div class="phone mini">
        <div class="status-bar"><span>9:41</span><span class="right">LTE</span></div>
        ${stickyHtml}
        ${scroll}
        ${miniNav}
      </div>
    </div>`;
}

const board = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>SF strip visual styles — Mirrorball Madness</title>
<link rel="stylesheet" href="shared.css"/>
<style>${boardCss}</style>
</head>
<body class="board-page">
<div class="board" id="shot">
  <h1>Spoiler-Free strip · Visual styles (Pattern B)</h1>
  <p class="sub">
    Placement locked: <strong>sticky wordmark + avatar, SF under branding</strong> (never absolute-top).
    Copy: <strong>Spoiler-Free · Week 2 results are in</strong> + gold Mark Watched. No couple names.
    Four quieter alternatives to the current hard gold double-rail.
  </p>

  <div class="phones">
    ${col('1', 'Soft inset', 'Tinted fill · single hairline · keep gold pill', miniSoft())}
    ${col('2', 'Chip row', 'No full-bleed bar · status chip + Mark Watched', miniChip())}
    ${col('3', 'Compact one-line', 'SF under wordmark · ghost Mark Watched by avatar', miniCompact())}
    ${col('4', 'Accent rail', 'Tinted band · left gold edge · rounded bottom', miniAccent())}
  </div>

  <div class="scroll-row">
    <div class="row-head">Scroll check — Soft vs Chip (styles that change most when sticky)</div>
    ${col('1s', 'Soft inset · Scroll', 'Branding + soft band stay together', miniSoft(), true)}
    ${col('2s', 'Chip row · Scroll', 'Chip toolbar stays with wordmark + avatar', miniChip(), true)}
  </div>

  <div class="callout">
    <strong>Mosaic lean:</strong> Soft inset or Chip row strongest — quieter than hazard-tape rails, still readable with Mark Watched.
    Compact if chrome budget is tight. Accent if they still want the strip “set apart.”
  </div>
  <p class="current-note">
    <em>Current (contrast):</em> hard gold double-rail, sharp corners, full-bleed band — the B rest/scroll from the placement pack. Not shown as a fifth column; these four replace that chrome on the same B placement.
  </p>
</div>
</body>
</html>
`;

writeFileSync(path.join(DIR, 'board.html'), board);
console.log('wrote board.html');
