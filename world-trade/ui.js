/* 월드 트레이드: 화면 */
(() => {
  'use strict';
  const E = window.WT, D = E.D;
  const { ITEMS, RES_IDS, GOOD_IDS, ALL_IDS, TRACK_IDS, DEF } = E;
  const { TRACKS, NATIONS, DIFF, PHASES, GOODS, RES } = D;
  const SAVE_KEY = 'worldtrade.save.v1', PREF_KEY = 'worldtrade.prefs.v1';

  /* ---------- helpers ---------- */
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Math.round(n).toLocaleString('ko-KR');
  const $m = n => (n < 0 ? '-$' : '$') + fmt(Math.abs(n));
  const sign = n => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(Math.abs(n));
  const gl = (id, cls) => `<span class="gl ${cls || ''}" style="--c:${ITEMS[id].c}" aria-hidden="true">${ITEMS[id].g}</span>`;
  const chip = (id, q, st) => `<span class="chip ${st || ''}">${gl(id)}${ITEMS[id].n}${q != null ? ` <b>${typeof q === 'number' ? fmt(q) : esc(q)}</b>` : ''}</span>`;
  const emb = (id, cls) => `<span class="emb ${cls || ''}" style="--c:${DEF[id].color}" aria-hidden="true">${DEF[id].name[0]}</span>`;
  const nm = id => DEF[id].name;
  const S = () => E.S;
  const P = () => E.player();
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  const lsDel = k => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } };
  const relText = r => r >= 75 ? '동맹' : r >= 60 ? '우호' : r >= 40 ? '중립' : r >= 25 ? '냉담' : '적대';
  const relColor = r => r >= 60 ? 'var(--good)' : r >= 40 ? 'var(--brass)' : 'var(--bad)';
  const bundleChips = b => {
    const out = Object.entries(b.items).filter(([, q]) => q > 0).map(([i, q]) => chip(i, q));
    if (b.money) out.push(`<span class="chip"><span class="gl" style="--c:#d9aa5c">$</span>자금 <b>${fmt(b.money)}</b></span>`);
    return out.length ? `<div class="chips">${out.join('')}</div>` : '<span class="muted small">없음</span>';
  };
  const ICON = {
    manage: '<path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6"/>',
    prod: '<path d="M2 20h20M4 20V10l5 3v-3l5 3V6h6v14"/><path d="M17 3v3"/>',
    trade: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
    market: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };
  const icon = (k, s) => `<svg viewBox="0 0 24 24" width="${s || 22}" height="${s || 22}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

  /* ---------- UI state ---------- */
  const prefs = (() => { try { return JSON.parse(lsGet(PREF_KEY)) || {}; } catch (e) { return {}; } })();
  const U = {
    screen: 'menu', tab: 'manage', recipe: null, qty: 1, mcat: 'res', mq: {}, info: null, histTab: 'mine',
    comp: { partner: null, give: E.emptyB(), take: E.emptyB(), negId: null },
    setup: Object.assign({ player: null, diff: 'normal', rounds: 30, timer: 0, ai: 7, lock: true }, prefs.setup || {}),
    prev: null,
  };
  U.setup.player = null;

  /* ---------- toast ---------- */
  function toast(text, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 2600);
    const all = $('#toasts').children, cap = window.innerWidth < 860 ? 2 : 3; while (all.length > cap) all[0].remove();
  }

  /* ---------- modal ---------- */
  let modalOnClose = null;
  function modal(html, onClose) {
    const m = $('#modal');
    m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true">${html}</div>`;
    m.hidden = false; modalOnClose = onClose || null;
    const f = m.querySelector('.btn.primary') || m.querySelector('.btn'); if (f) f.focus();
  }
  function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; const f = modalOnClose; modalOnClose = null; if (f) f(); }
  const modalOpen = () => !$('#modal').hidden;

  /* ---------- save ---------- */
  let saveT = null;
  function save() { if (!S()) return; clearTimeout(saveT); saveT = setTimeout(saveNow, 300); }
  function saveNow() { if (S()) lsSet(SAVE_KEY, E.serialize()); }
  function savedSummary() {
    const raw = lsGet(SAVE_KEY); if (!raw) return null;
    try { const s = JSON.parse(raw); if (!s || s.v !== 1) return null; return { name: DEF[s.player].name, round: s.round, max: s.maxRounds, over: s.over, raw }; } catch (e) { return null; }
  }

  /* ---------- screens ---------- */
  function show(name) {
    U.screen = name;
    document.querySelectorAll('.screen').forEach(el => el.classList.toggle('on', el.id === 'scr-' + name));
    window.scrollTo(0, 0);
    if (name === 'menu') renderMenu();
    if (name === 'setup') renderSetup();
    if (name === 'game') renderGame();
    if (name === 'result') renderResult();
  }

  /* ---------- world map backdrop ---------- */
  const BLOBS = [[190, 125, 170, 95], [430, 105, 150, 70], [330, 262, 115, 80], [215, 372, 120, 70], [560, 262, 130, 90], [700, 392, 140, 62], [845, 305, 85, 62], [762, 140, 150, 82], [470, 190, 80, 50], [640, 200, 80, 60]];
  let DOTS = null;
  function dots() {
    if (DOTS) return DOTS;
    let out = '', seed = 7;
    const r = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let y = 18; y < 470; y += 15) for (let x = 14; x < 990; x += 15) {
      const inside = BLOBS.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1 - r() * 0.35);
      if (inside) out += `<circle cx="${x}" cy="${y}" r="1.6"/>`;
    }
    return DOTS = out;
  }
  function routePath(a, b) {
    const A = DEF[a], B = DEF[b];
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2 - Math.abs(A.x - B.x) * 0.18;
    return `M${A.x} ${A.y} Q${mx} ${my} ${B.x} ${B.y}`;
  }

  /* ================= MENU ================= */
  function renderMenu() {
    const sv = savedSummary();
    const routes = [['nordin', 'sahar'], ['verdan', 'marea'], ['caldera', 'argenta'], ['aurel', 'solaris'], ['sahar', 'marea'], ['nordin', 'caldera'], ['verdan', 'aurel']];
    $('#scr-menu').innerHTML = `
      <svg class="menu-map" viewBox="0 0 1000 480" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <g fill="#2a3a4e">${dots()}</g>
        <g>${routes.map(([a, b], k) => `<path d="${routePath(a, b)}" fill="none" stroke="#d9aa5c" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="4 10" opacity=".55"><animate attributeName="stroke-dashoffset" from="0" to="-56" dur="${2 + k * .3}s" repeatCount="indefinite"/></path>`).join('')}</g>
        <g>${NATIONS.map(n => `<circle cx="${n.x}" cy="${n.y}" r="6" fill="${n.color}"/><circle cx="${n.x}" cy="${n.y}" r="12" fill="none" stroke="${n.color}" opacity=".4"/>`).join('')}</g>
      </svg>
      <div class="menu-card">
        <div class="logo">
          <div class="en">WORLD TRADE</div>
          <h1>월드 트레이드</h1>
          <p>자원이 다른 여덟 나라. 사고, 팔고, 바꾸고, 발전하세요.</p>
        </div>
        <div class="menu-btns">
          ${sv && !sv.over ? `<button class="btn primary lg" data-a="continue">이어하기 <span class="save-info">· ${esc(sv.name)} ${sv.round}/${sv.max} 라운드</span></button>` : ''}
          <button class="btn ${sv && !sv.over ? '' : 'primary'} lg" data-a="toSetup">새 게임</button>
          ${sv && sv.over ? `<button class="btn lg" data-a="lastResult">지난 게임 결과</button>` : ''}
          <button class="btn lg ghost" data-a="howto">게임 방법</button>
        </div>
        <div class="menu-foot">진행 상황은 이 브라우저에 자동 저장돼요.</div>
      </div>`;
  }

  /* ================= SETUP ================= */
  function renderSetup() {
    const st = U.setup;
    const maxY = 10;
    const card = n => {
      const bars = RES_IDS.map(r => {
        const v = n.yields[r] || 0, lv = Math.min(5, Math.ceil(v / 2));
        return `<div class="rbar ${v ? '' : 'zero'}" style="--c:${ITEMS[r].c}" title="${ITEMS[r].n}: 라운드당 약 ${v}">${gl(r)}<div class="lv">${[1, 2, 3, 4, 5].map(k => `<i class="${k <= lv ? 'on' : ''}"></i>`).join('')}</div></div>`;
      }).join('');
      const lv = TRACK_IDS.filter(t => (n.levels[t] || 1) > 1).map(t => `${TRACKS[t].n} ${n.levels[t]}`).join(' · ') || '모든 분야 1단계';
      return `<button class="ncard ${st.player === n.id ? 'sel' : ''}" style="--c:${n.color}" data-a="pickNation" data-id="${n.id}" aria-pressed="${st.player === n.id}">
        <div class="top">${emb(n.id, 'lg')}<div><h4>${esc(n.name)}</h4><div class="en">${esc(n.en)}</div></div></div>
        <div class="blurb">${esc(n.blurb)}</div>
        <div class="rbars">${bars}</div>
        <div class="trait"><b>${esc(n.trait.n)}</b> — ${esc(n.trait.d)}</div>
        <div class="meta"><span>초기 자금 <b class="brass">${$m(n.money)}</b></span><span>${esc(lv)}</span></div>
      </button>`;
    };
    const seg = (key, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button class="${st[key] === v ? 'on' : ''}" data-a="setOpt" data-k="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
    const pickN = st.player ? NATIONS.find(n => n.id === st.player) : null;
    $('#scr-setup').innerHTML = `
      <div class="setup">
        <div class="setup-head">
          <div><div class="kicker">STEP 1</div><h2>어느 나라를 이끌까요?</h2><p class="muted">나라마다 풍부한 자원과 부족한 자원이 달라요. 부족한 건 무역으로 채워야 해요.</p></div>
          <button class="btn ghost" data-a="toMenu">← 메인 메뉴</button>
        </div>
        <div class="nations">${NATIONS.map(card).join('')}</div>
        <div><div class="kicker">STEP 2</div><h2 class="serif" style="font-size:22px;font-weight:900;margin-top:2px">게임 설정</h2></div>
        <div class="panel opts">
          <div class="opt"><label>AI 난이도</label>${seg('diff', Object.entries(DIFF).map(([k, v]) => [k, v.n]))}<div class="hint">${esc(DIFF[st.diff].d)}</div></div>
          <div class="opt"><label>게임 길이</label>${seg('rounds', [[15, '15 라운드'], [30, '30 라운드'], [45, '45 라운드']])}<div class="hint">한 라운드는 보통 1~3분 걸려요.</div></div>
          <div class="opt"><label>라운드 제한 시간</label>${seg('timer', [[0, '없음'], [90, '90초'], [180, '3분'], [300, '5분']])}<div class="hint">시간이 끝나면 자동으로 정산해요.</div></div>
          <div class="opt"><label>AI 국가 수</label>${seg('ai', [[3, '3개국'], [5, '5개국'], [7, '7개국']])}<div class="hint">많을수록 시장이 북적여요.</div></div>
          <div class="opt"><label>단계 진행</label>${seg('lock', [[true, '순서대로'], [false, '자유롭게']])}<div class="hint">${st.lock ? '생산 → 무역 → 시장 순서를 지켜요. (보드게임식)' : '라운드 안에서 언제든 생산·무역·시장을 오가요.'}</div></div>
        </div>
      </div>
      <div class="setup-bar"><div class="in">
        <div class="pick">${pickN ? `${emb(pickN.id)}<div><div class="small muted">선택한 나라</div><b>${esc(pickN.name)}</b></div>` : '<span class="muted">위에서 나라를 골라 주세요.</span>'}</div>
        <button class="btn primary lg" data-a="startGame" ${pickN ? '' : 'disabled'}>게임 시작 →</button>
      </div></div>`;
  }

  /* ================= GAME ================= */
  let rq = false;
  function renderGame() { rq = false; renderHUD(); renderPhase(); renderTabs(); renderView(); }
  function schedule() { if (rq) return; rq = true; requestAnimationFrame(() => { if (U.screen === 'game') renderGame(); else rq = false; }); save(); }

  function renderHUD() {
    const s = S(), p = P();
    const prev = U.prev || {};
    const res = RES_IDS.concat(GOOD_IDS.filter(g => p.stock[g] > 0)).map(i => {
      const q = p.stock[i], d = prev[i] == null ? 0 : q - prev[i];
      return `<span class="rc ${q ? '' : 'zero'} ${d > 0 ? 'flash-up' : d < 0 ? 'flash-down' : ''}" title="${ITEMS[i].n} ${q}" data-a="tab" data-tab="manage">${gl(i)}${fmt(q)}</span>`;
    }).join('');
    const moneyD = prev.$money == null ? 0 : p.money - prev.$money;
    U.prev = Object.assign({}, p.stock, { $money: p.money });
    const rank = E.ranking().indexOf(p) + 1;
    $('#hud').innerHTML = `
      <div class="who">${emb(p.id)}<div><b>${esc(nm(p.id))}</b><small>${s.round} / ${s.maxRounds} 라운드 · ${DIFF[s.diff].n}</small></div></div>
      <div class="kpis">
        <div class="kpi money"><span>자금</span><b class="${moneyD ? 'flash' : ''}">${$m(p.money)}</b></div>
        <div class="kpi"><span>발전도</span><b>${fmt(E.score(p))} <small class="muted">${rank}위</small></b></div>
        <div class="kpi hide-s"><span>안정도</span><b class="${p.stability < 40 ? 'bad' : p.stability < 65 ? 'warn' : ''}">${Math.round(p.stability)}</b></div>
      </div>
      <div class="res" aria-label="보유 자원">${res}</div>
      <div class="end">
        ${s.timerSec ? `<span class="timer" id="timer">${icon('clock', 15)}<span>${clock(s.timeLeft)}</span></span>` : ''}
        <button class="btn icon ghost" data-a="gameMenu" aria-label="메뉴">${icon('menu', 20)}</button>
      </div>`;
    updateTimer();
  }
  const clock = t => `${Math.floor(t / 60)}:${String(Math.max(0, t) % 60).padStart(2, '0')}`;
  function updateTimer() {
    const el = $('#timer'); if (!el || !S()) return;
    el.querySelector('span').textContent = clock(S().timeLeft);
    el.classList.toggle('low', S().timeLeft <= 15 && !S().settle);
  }

  function renderPhase() {
    const s = S();
    const steps = PHASES.map((ph, k) => `<div class="step ${k < s.phase || s.settle ? 'done' : k === s.phase ? 'now' : ''}"><i>${k < s.phase || (s.settle && k === 4) ? '✓' : k + 1}</i>${ph.n}</div>`).join('');
    let btn;
    if (s.settle) btn = s.over ? `<button class="btn primary" data-a="toResult">최종 결과 →</button>` : `<button class="btn primary" data-a="showSettle">정산 결과 / 다음 라운드 →</button>`;
    else if (s.phase < 3) btn = `<button class="btn primary" data-a="nextPhase">${PHASES[s.phase + 1].n} →</button>`;
    else btn = `<button class="btn primary" data-a="settle">결과 정산 →</button>`;
    $('#phasebar').innerHTML = `<div class="steps">${steps}</div><span class="phase-hint">${esc(PHASES[s.settle ? 4 : s.phase].s)}</span>${btn}`;
  }

  const TABS = [['manage', '국가 관리'], ['prod', '생산'], ['trade', '무역'], ['market', '시장'], ['info', '세계 정보']];
  function renderTabs() {
    const s = S();
    $('#tabs').innerHTML = TABS.map(([k, l]) => {
      const dot = k === 'trade' && s.inbox.length && (s.phase >= 2 || !s.lock) ? `<span class="dot">${s.inbox.length}</span>` : '';
      return `<button class="tab ${U.tab === k ? 'on' : ''}" data-a="tab" data-tab="${k}" aria-current="${U.tab === k ? 'page' : 'false'}">${icon(k)}${l}${dot}</button>`;
    }).join('');
  }

  // 단계 잠금
  const NEED = { prod: 1, trade: 2, market: 3 };
  const NEED_N = { prod: '생산', trade: '국가 간 무역', market: '시장 거래' };
  function can(kind) {
    const s = S();
    if (s.settle) return false;
    if (!s.lock) return true;
    return s.phase === NEED[kind];
  }
  function lockMsg(kind) {
    const s = S();
    if (can(kind)) return '';
    if (s.settle) return `<div class="lockmsg">이번 라운드는 정산이 끝났어요. 다음 라운드에서 다시 할 수 있어요. <button class="btn sm" data-a="showSettle">다음 라운드로</button></div>`;
    const need = NEED[kind];
    if (s.phase < need) return `<div class="lockmsg">지금은 <b>${PHASES[s.phase].n}</b> 단계예요. ${NEED_N[kind]}은(는) <b>${PHASES[need].n}</b> 단계에서 할 수 있어요. <button class="btn sm" data-a="gotoPhase" data-ph="${need}">${PHASES[need].n} 단계로 →</button></div>`;
    return `<div class="lockmsg">${PHASES[need].n} 단계는 지났어요. 다음 라운드에 다시 할 수 있어요. (설정에서 ‘자유롭게’로 바꾸면 언제든 가능해요)</div>`;
  }

  function renderView() {
    const v = $('#view');
    const top = v.scrollTop;
    const f = { manage: viewManage, prod: viewProd, trade: viewTrade, market: viewMarket, info: viewInfo }[U.tab];
    v.innerHTML = `<div class="view-in">${f()}</div>`;
    v.scrollTop = top;
  }

  /* ---------- 국가 관리 ---------- */
  function viewManage() {
    const s = S(), p = P(), rep = s.report;
    const up = E.upkeep(p), y = E.yields(p);
    const foodHave = p.stock.food + p.stock.meal * 3, enHave = p.stock.coal + p.stock.fuel * 3;
    const rank = E.ranking().indexOf(p) + 1;
    const parts = E.scoreParts(p);
    const phase0 = s.phase === 0 && !s.settle ? `
      <div class="panel" style="border-color:var(--brass-d)">
        <div class="panel-h"><h3><span class="kicker">1단계</span> 자원 확인 — ${s.round}라운드</h3><button class="btn primary" data-a="nextPhase">생산 단계로 →</button></div>
        <div class="grid g2">
          <div><div class="small muted" style="margin-bottom:6px">이번 라운드에 들어온 자원</div>${Object.keys(rep.yields).length ? `<div class="chips">${Object.entries(rep.yields).filter(([, q]) => q > 0).map(([i, q]) => chip(i, '+' + q, 'ok')).join('')}</div>` : '<span class="muted">없음</span>'}</div>
          <div><div class="small muted" style="margin-bottom:6px">정산 때 필요한 소비량</div>
            <div class="chips">${chip('food', up.food, foodHave < up.food ? 'short' : 'ok')}${up.energy ? chip('coal', up.energy, enHave < up.energy ? 'short' : 'ok') : ''}<span class="chip"><span class="gl" style="--c:#d9aa5c">$</span>세금 수입 <b class="good">+${fmt(E.income(p))}</b></span></div>
            ${foodHave < up.food ? `<p class="small bad" style="margin-top:6px">식량이 ${up.food - foodHave}만큼 모자라요. 무역이나 시장에서 구해야 안정도가 떨어지지 않아요.</p>` : ''}
            ${enHave < up.energy ? `<p class="small bad" style="margin-top:4px">공장을 돌릴 석탄(또는 연료)이 ${up.energy - enHave}만큼 모자라요.</p>` : ''}
            <p class="small muted" style="margin-top:6px">가공식품 1개는 식량 3, 연료 1개는 석탄 3을 대신해요.</p>
          </div>
        </div>
      </div>` : '';
    const devs = TRACK_IDS.map(t => {
      const L = p.levels[t], c = E.devCost(p, t), ok = E.canUpgrade(p, t);
      return `<div class="dev ${c ? '' : 'max'}">
        <div class="h"><span class="gl md" style="--c:#d9aa5c">${TRACKS[t].g}</span><b>${TRACKS[t].n}</b><span class="lvl">Lv.${L}</span></div>
        <div class="pips">${[1, 2, 3, 4, 5].map(k => `<i class="${k <= L ? 'on' : ''}"></i>`).join('')}</div>
        <div class="d">${esc(TRACKS[t].d)}<br><span class="brass small">${esc(devEffect(p, t))}</span></div>
        ${c ? `<div class="cost"><span class="chip ${p.money >= c.money ? 'ok' : 'short'}"><span class="gl" style="--c:#d9aa5c">$</span><b>${fmt(c.money)}</b></span>${Object.entries(c.items).map(([i, q]) => chip(i, `${Math.min(p.stock[i], q)}/${q}`, p.stock[i] >= q ? 'ok' : 'short')).join('')}</div>
        <button class="btn ${ok ? 'primary' : ''} sm" data-a="upgrade" data-t="${t}" ${ok && !s.settle ? '' : 'disabled'}>${ok ? `Lv.${L + 1}로 발전` : '재료 부족'}</button>` : '<div class="small brass">최고 단계에 도달했어요</div>'}
      </div>`;
    }).join('');
    const inv = ids => ids.map(i => {
      const yy = y[i] ? `<span class="y">+${y[i].toFixed(1)}</span>` : '';
      return `<div class="inv-i ${p.stock[i] ? '' : 'zero'}">${gl(i, 'md')}<div><div class="n">${ITEMS[i].n}</div><div class="q">${fmt(p.stock[i])}</div></div>${yy}</div>`;
    }).join('');
    return `
      <div class="view-title"><div><div class="kicker">국가 관리</div><h2>${esc(nm(p.id))}</h2></div><p>${esc(DEF[p.id].trait.n)} — ${esc(DEF[p.id].trait.d)}</p></div>
      ${phase0}
      <div class="report">
        <div class="rcard"><span class="k">보유 자금</span><span class="v brass">${$m(p.money)}</span><span class="small muted">라운드당 세금 +${fmt(E.income(p))}</span></div>
        <div class="rcard"><span class="k">국가 발전도</span><span class="v">${fmt(E.score(p))}</span><span class="small muted">세계 ${rank}위 · 발전 ${parts.dev} · 부 ${parts.wealth} · 무역 ${parts.trade}</span></div>
        <div class="rcard"><span class="k">안정도</span><span class="v ${p.stability < 40 ? 'bad' : p.stability < 65 ? 'warn' : 'good'}">${Math.round(p.stability)}</span><div class="bar"><i style="width:${p.stability}%;background:${p.stability < 40 ? 'var(--bad)' : p.stability < 65 ? 'var(--warn)' : 'var(--good)'}"></i></div><span class="small muted">낮으면 생산량과 세금이 줄어요</span></div>
        <div class="rcard"><span class="k">무역 규모</span><span class="v">${$m(p.vol.trade + p.vol.market)}</span><span class="small muted">이번 라운드 ${$m(p.rv.trade + p.rv.market)}</span></div>
      </div>
      <div class="panel"><div class="panel-h"><h3>국가 발전</h3><span class="small muted">발전하면 새로운 상품과 생산 시설이 열려요. 언제든 발전시킬 수 있어요.</span></div><div class="devs">${devs}</div></div>
      <div class="grid g-side">
        <div class="panel"><div class="panel-h"><h3>창고</h3><span class="small muted">초록 숫자는 라운드당 예상 생산량</span></div>
          <div class="small muted" style="margin-bottom:8px">원자재</div><div class="inv">${inv(RES_IDS)}</div>
          <div class="small muted" style="margin:14px 0 8px">상품</div><div class="inv">${inv(GOOD_IDS)}</div>
        </div>
        <div class="panel"><div class="panel-h"><h3>국가 기록</h3></div>${logHtml(s.log.slice(0, 60))}</div>
      </div>`;
  }
  function devEffect(p, t) {
    const L = p.levels[t];
    if (t === 'industry') return `현재: 생산 라인 ${E.lines(p)}개 · 한 번에 ${E.batchCap(p)}개`;
    if (t === 'economy') return `현재: 라운드당 세금 $${fmt(E.income(p))}`;
    if (t === 'tech') return `현재: 광물 생산 +${(L - 1) * 8}%${L >= 3 ? ' · 생산 시간 단축' : ''}${L >= 4 ? ' · 산출 +25%' : ''}`;
    if (t === 'agriculture') return `현재: 농산물 생산 +${(L - 1) * 20}%`;
    if (t === 'trade') return `현재: 시장 수수료 ${Math.round(E.fee(p) * 100)}% · 제안 ${E.maxOffers(p)}회${L >= 2 ? ' · 상대 반응 예측' : ''}`;
    return '';
  }
  function logHtml(list) {
    if (!list.length) return '<div class="empty">아직 기록이 없어요.</div>';
    return `<div class="log">${list.map(l => `<div><span class="r">R${l.r}</span><span class="${l.kind}">${esc(l.text)}</span></div>`).join('')}</div>`;
  }

  /* ---------- 생산 ---------- */
  function viewProd() {
    const s = S(), p = P(), ok = can('prod');
    const lines = [];
    p.jobs.forEach(j => {
      const pct = Math.round((j.total - j.left) / j.total * 100);
      lines.push(`<div class="line"><div class="h">${gl(j.g, 'md')}<div><b>${GOODS[j.g].n}</b><div class="small muted">${j.q}개 투입 → ${j.out}개</div></div><small>${j.left}라운드 남음</small></div>
        <div class="bar"><i style="width:${Math.max(6, pct)}%"></i></div>
        ${j.left === j.total && ok ? `<button class="btn sm ghost" data-a="cancelJob" data-id="${j.id}">취소하고 재료 돌려받기</button>` : `<span class="small muted">정산 때 진행돼요</span>`}</div>`);
    });
    for (let k = p.jobs.length; k < E.lines(p); k++) lines.push(`<div class="line free">빈 생산 라인<br>아래에서 상품을 골라 생산을 시작하세요</div>`);
    const recipes = GOOD_IDS.map(g => {
      const G = GOODS[g], lock = E.locked(p, g);
      const cost = Object.entries(G.in).reduce((a, [i, q]) => a + q * E.price(i), 0);
      const outP = E.price(g) * E.outQty(p, g, 4) / 4;
      const profit = outP - cost;
      const mx = E.maxMake(p, g);
      return `<button class="recipe ${U.recipe === g ? 'sel' : ''} ${lock ? 'lock' : ''}" data-a="pickRecipe" data-g="${g}" ${lock ? 'aria-disabled="true"' : ''}>
        <div class="h">${gl(g, 'lg')}<div><b>${G.n}</b><small>${E.prodTime(p, g)}라운드 · 시장가 ${$m(E.price(g))}</small></div></div>
        <div class="flow">${Object.entries(G.in).map(([i, q]) => chip(i, q, p.stock[i] >= q ? 'ok' : 'short')).join('')}<span class="arrow">→</span>${chip(g, 1)}</div>
        <div class="foot">${lock ? `<span class="warn">🔒 필요: ${esc(lock)}</span>` : `<span>재료 시장가 ${$m(cost)}</span><span class="${profit >= 0 ? 'good' : 'bad'}">개당 ${profit >= 0 ? '+' : ''}${fmt(profit)}</span><span>지금 최대 ${mx}개</span>`}</div>
      </button>`;
    }).join('');
    let order = '';
    if (U.recipe && !E.locked(p, U.recipe)) {
      const g = U.recipe, G = GOODS[g], mx = E.maxMake(p, g);
      const q = Math.max(1, Math.min(U.qty, Math.max(1, mx)));
      U.qty = q;
      const free = E.freeLines(p);
      const reason = !ok ? '지금은 생산 단계가 아니에요' : free <= 0 ? '빈 생산 라인이 없어요' : mx <= 0 ? '재료가 부족해요' : '';
      order = `<div class="order">
        <div class="what">${gl(g, 'lg')}<div><b>${G.n}</b><div class="small muted">${E.prodTime(p, g)}라운드 후 ${E.outQty(p, g, q)}개 완성 · 라인 ${free}/${E.lines(p)} 남음</div></div></div>
        <div class="stepper"><button data-a="qty" data-d="-1" aria-label="줄이기">−</button><input type="number" inputmode="numeric" min="1" max="${Math.max(1, mx)}" value="${q}" data-in="qty" aria-label="수량"><button data-a="qty" data-d="1" aria-label="늘리기">+</button></div>
        <button class="btn sm ghost" data-a="qtyMax">최대 ${mx}</button>
        <div class="chips">${Object.entries(G.in).map(([i, k]) => chip(i, `−${k * q}`, p.stock[i] >= k * q ? '' : 'short')).join('')}</div>
        <span class="spacer"></span>
        ${reason ? `<span class="small warn">${reason}</span>` : ''}
        <button class="btn primary" data-a="startJob" ${reason ? 'disabled' : ''}>생산 시작</button>
      </div>`;
    }
    return `
      <div class="view-title"><div><div class="kicker">생산 활동</div><h2>공장과 생산 라인</h2></div><p>라인 ${E.lines(p)}개 · 한 번에 최대 ${E.batchCap(p)}개 · 생산은 정산 때 진행돼요</p></div>
      ${lockMsg('prod')}
      <div class="panel"><div class="panel-h"><h3>생산 라인</h3><span class="small muted">산업을 발전시키면 라인이 늘어요</span></div><div class="lines">${lines.join('')}</div></div>
      <div class="panel"><div class="panel-h"><h3>생산 가능한 상품</h3><span class="small muted">재료 칩: 초록=충분, 빨강=부족 (1개 기준)</span></div><div class="recipes">${recipes}</div></div>
      ${order}`;
  }

  /* ---------- 시장 ---------- */
  function spark(h, w, hgt) {
    w = w || 90; hgt = hgt || 28;
    if (!h || h.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${hgt}"></svg>`;
    const mn = Math.min(...h), mx = Math.max(...h), rg = mx - mn || 1;
    const pts = h.map((v, k) => `${(k / (h.length - 1) * (w - 4) + 2).toFixed(1)},${(hgt - 3 - (v - mn) / rg * (hgt - 6)).toFixed(1)}`).join(' ');
    const up = h[h.length - 1] >= h[0];
    return `<svg class="spark" viewBox="0 0 ${w} ${hgt}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${up ? 'var(--good)' : 'var(--bad)'}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }
  function viewMarket() {
    const s = S(), p = P(), ok = can('market');
    const ids = U.mcat === 'res' ? RES_IDS : GOOD_IDS;
    const rows = ids.map(i => {
      const pr = E.price(i), h = s.market.hist[i], prev = h.length > 1 ? h[h.length - 2] : h[0];
      const d = prev ? (pr - prev) / prev * 100 : 0;
      const q = Math.max(1, U.mq[i] || 1);
      const bq = E.maxBuy(i) >= q ? E.quoteBuy(p, i, q) : null;
      const sq = p.stock[i] >= q ? E.quoteSell(p, i, q) : null;
      const vsBase = pr / ITEMS[i].p;
      const tag = vsBase > 1.4 ? '<span class="tag sell">품귀</span>' : vsBase < 0.7 ? '<span class="tag buy">과잉</span>' : '';
      return { i, pr, d, q, bq, sq, h, tag };
    });
    const step = r => `<div class="stepper"><button data-a="mq" data-id="${r.i}" data-d="-1" aria-label="줄이기">−</button><input type="number" inputmode="numeric" min="1" value="${r.q}" data-in="mq" data-id="${r.i}" aria-label="${ITEMS[r.i].n} 수량"><button data-a="mq" data-id="${r.i}" data-d="1" aria-label="늘리기">+</button></div>`;
    const acts = r => `<div class="mact">${step(r)}
      <button class="btn good sm" data-a="buy" data-id="${r.i}" ${ok && r.bq != null && r.bq <= p.money ? '' : 'disabled'}>구매 ${r.bq != null ? $m(r.bq) : '—'}</button>
      <button class="btn bad sm" data-a="sell" data-id="${r.i}" ${ok && r.sq != null ? '' : 'disabled'}>판매 ${r.sq != null ? $m(r.sq) : '—'}</button></div>`;
    const delta = d => `<span class="delta ${d > 0.5 ? 'good' : d < -0.5 ? 'bad' : 'muted'}">${d > 0.5 ? '▲' : d < -0.5 ? '▼' : '–'} ${Math.abs(d).toFixed(1)}%</span>`;
    const table = `<table class="mtable"><thead><tr><th>품목</th><th class="num">시세</th><th>추이</th><th class="num">시장 재고</th><th class="num">내 보유</th><th class="num">거래</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td><div class="mname">${gl(r.i, 'md')}<div>${ITEMS[r.i].n} ${r.tag}<small>기준가 ${$m(ITEMS[r.i].p)}</small></div></div></td>
        <td class="num"><b>${$m(r.pr)}</b><br>${delta(r.d)}</td><td>${spark(r.h)}</td>
        <td class="num">${fmt(s.market.stock[r.i])}</td><td class="num"><b>${fmt(p.stock[r.i])}</b></td><td>${acts(r)}</td></tr>`).join('')}
      </tbody></table>`;
    const cards = `<div class="mcards">${rows.map(r => `<div class="mcard">
      <div class="row"><div class="mname">${gl(r.i, 'md')}<div>${ITEMS[r.i].n} ${r.tag}<small>시장 ${fmt(s.market.stock[r.i])} · 보유 ${fmt(p.stock[r.i])}</small></div></div>${spark(r.h, 70, 26)}<div style="text-align:right"><b>${$m(r.pr)}</b><br>${delta(r.d)}</div></div>
      ${acts(r)}</div>`).join('')}</div>`;
    // 거래량
    const vols = s.order.map(id => S().nations[id]).map(n => ({ id: n.id, v: n.vol.market + n.vol.trade, r: n.rv.market + n.rv.trade }));
    const vmax = Math.max(1, ...vols.map(x => x.v));
    const volHtml = vols.sort((a, b) => b.v - a.v).map(x => `<div class="vrow" style="--c:${DEF[x.id].color}"><span class="nm">${emb(x.id, 'sm')}${esc(nm(x.id))}</span><div class="bar"><i style="width:${x.v / vmax * 100}%"></i></div><span class="small" style="text-align:right">${$m(x.v)}</span></div>`).join('');
    const evts = s.market.events.length ? s.market.events.map(e => `<div class="evt"><b>${esc(e.n)}</b> · ${e.left}라운드 남음<br><span class="muted">수요 증가: ${Object.keys(e.target).map(i => ITEMS[i].n).join(', ')}</span></div>`).join('') : '<div class="small muted">진행 중인 세계 사건이 없어요.</div>';
    return `
      <div class="view-title"><div><div class="kicker">시장 거래</div><h2>세계 시장</h2></div><p>수수료 ${Math.round(E.fee(p) * 100)}% · 많이 살수록 값이 오르고, 많이 팔수록 값이 내려요</p></div>
      ${lockMsg('market')}
      <div class="grid g-side">
        <div class="panel">
          <div class="panel-h"><div class="seg" style="min-width:220px"><button class="${U.mcat === 'res' ? 'on' : ''}" data-a="mcat" data-v="res">원자재 10종</button><button class="${U.mcat === 'goods' ? 'on' : ''}" data-a="mcat" data-v="goods">상품 ${GOOD_IDS.length}종</button></div><span class="small muted">가격은 수요와 공급에 따라 실시간으로 변해요</span></div>
          ${table}${cards}
        </div>
        <div class="grid" style="align-content:start">
          <div class="panel"><div class="panel-h"><h3>국가별 거래량</h3><span class="small muted">누적</span></div><div class="vol">${volHtml}</div></div>
          <div class="panel"><div class="panel-h"><h3>세계 사건</h3></div><div class="evts">${evts}</div></div>
          <div class="panel"><div class="panel-h"><h3>내 시장 기록</h3></div>
            <div class="grid g2"><div class="stat"><span class="k">총 구매</span><span class="v">${$m(p.vol.buy)}</span></div><div class="stat"><span class="k">총 판매</span><span class="v">${$m(p.vol.sell)}</span></div></div></div>
        </div>
      </div>`;
  }

  /* ---------- 무역 ---------- */
  function partnerIds() { return S().order.filter(id => id !== S().player); }
  function richOf(id) { return Object.entries(DEF[id].yields).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([i]) => i); }
  function viewTrade() {
    const s = S(), p = P(), ok = can('trade');
    const ids = partnerIds();
    if (!U.comp.partner || !ids.includes(U.comp.partner)) U.comp.partner = ids[0];
    const pid = U.comp.partner, ai = E.nation(pid);
    const partners = ids.map(id => {
      const r = E.rel(id, p.id), n = s.inbox.filter(o => o.from === id).length;
      return `<button class="pbtn ${pid === id ? 'on' : ''}" data-a="partner" data-id="${id}">${emb(id)}<div><b>${esc(nm(id))}</b><small>${relText(r)} ${Math.round(r)}${n ? ` · <span class="brass">제안 ${n}</span>` : ''}</small><div class="relbar"><i style="width:${r}%;background:${relColor(r)}"></i></div></div></button>`;
    }).join('');
    // 받은 제안
    const showInbox = s.phase >= 2 || !s.lock;
    const inbox = !showInbox ? `<div class="empty">무역 단계가 되면 다른 나라의 제안이 도착해요.</div>` : s.inbox.length ? s.inbox.map(o => {
      const canAcc = ok && E.hasBundle(p, o.give);
      const kind = { buy: ['buy', '구매 요청'], sell: ['sell', '판매 제안'], barter: ['barter', '물물교환'] }[o.kind];
      const vg = E.bundleValue(o.give), vt = E.bundleValue(o.take);
      return `<div class="offer new"><div class="h">${emb(o.from, 'sm')}<b>${esc(nm(o.from))}</b><span class="tag ${kind[0]}">${kind[1]}</span></div>
        <div class="ex"><div><div class="lab">내가 줄 것</div>${bundleChips(o.give)}</div><span class="arr">→</span><div><div class="lab">내가 받을 것</div>${bundleChips(o.take)}</div></div>
        <div class="small muted">시장가 기준 손익 <b class="${vt - vg >= 0 ? 'good' : 'bad'}">${sign(vt - vg)}</b></div>
        <div class="acts"><button class="btn good sm" data-a="inAccept" data-id="${o.id}" ${canAcc ? '' : 'disabled'}>수락</button><button class="btn sm" data-a="inCounter" data-id="${o.id}" ${ok ? '' : 'disabled'}>조건 협상</button><button class="btn bad sm" data-a="inReject" data-id="${o.id}" ${ok ? '' : 'disabled'}>거절</button></div>
        ${!E.hasBundle(p, o.give) ? '<div class="small bad">내가 줄 물건이나 자금이 부족해요.</div>' : ''}</div>`;
    }).join('') : '<div class="empty">이번 라운드에 받은 제안이 없어요.</div>';

    // 작성기
    const c = U.comp;
    const row = (side, i) => {
      const q = c[side].items[i], have = side === 'give' ? p.stock[i] : ai.stock[i];
      return `<div class="brow"><span class="nm">${gl(i)}${ITEMS[i].n} <small>${side === 'give' ? '내 보유' : '상대 보유'} ${fmt(have)}</small></span>
        <span style="display:flex;align-items:center;gap:4px"><span class="stepper"><button data-a="cq" data-side="${side}" data-id="${i}" data-d="-1" aria-label="줄이기">−</button><input type="number" inputmode="numeric" min="0" value="${q}" data-in="cq" data-side="${side}" data-id="${i}" aria-label="${ITEMS[i].n} 수량"><button data-a="cq" data-side="${side}" data-id="${i}" data-d="1" aria-label="늘리기">+</button></span><button class="x" data-a="cdel" data-side="${side}" data-id="${i}" aria-label="빼기">×</button></span></div>`;
    };
    const moneyRow = side => `<div class="brow"><span class="nm"><span class="gl" style="--c:#d9aa5c">$</span>자금 <small>${side === 'give' ? '내 자금 ' + $m(p.money) : '상대 ' + $m(ai.money)}</small></span>
      <span class="stepper wide"><button data-a="cm" data-side="${side}" data-d="-50" aria-label="50 줄이기">−</button><input type="number" inputmode="numeric" min="0" step="10" value="${c[side].money || 0}" data-in="cm" data-side="${side}" aria-label="자금"><button data-a="cm" data-side="${side}" data-d="50" aria-label="50 늘리기">+</button></span></div>`;
    const addSel = side => {
      const src = side === 'give' ? p : ai;
      const opts = ALL_IDS.filter(i => src.stock[i] > 0 && c[side].items[i] == null);
      return `<select class="addsel" data-in="cadd" data-side="${side}" aria-label="품목 추가"><option value="">+ 품목 추가</option>${opts.map(i => `<option value="${i}">${ITEMS[i].n} (${side === 'give' ? '보유' : '상대'} ${src.stock[i]})</option>`).join('')}</select>`;
    };
    const vg = E.bundleValue(c.give), vt = E.bundleValue(c.take);
    const tot = Math.max(1, vg + vt);
    let predict = '';
    if (p.levels.trade >= 2 && !(E.bundleEmpty(c.give) && E.bundleEmpty(c.take))) {
      const ev = E.evaluate(ai, c, 0);
      const t = ev.ratio >= ev.greed ? ['good', '수락할 것 같아요'] : ev.ratio >= ev.greed * 0.55 ? ['warn', '역제안이 올 것 같아요'] : ['bad', '거절할 것 같아요'];
      predict = `<div class="row"><span class="muted">상대 반응 예측</span><b class="${t[0]}">${t[1]}</b></div>`;
    } else if (p.levels.trade < 2) predict = `<div class="row small muted">무역 규모 2단계부터 상대의 반응을 예측해요.</div>`;
    const negs = s.negs.filter(x => x.partner === pid);
    const open = negs.find(x => x.status === 'countered');
    const thread = negs.length ? negs.slice(0, 3).reverse().map(ng => ng.msgs.map(m => {
      const me = m.who === 'me';
      return `<div class="msg ${me ? 'me' : 'them'} ${m.result ? 'res-' + m.result : ''}"><span class="who">${me ? '우리' : esc(nm(m.who))} · R${ng.r}</span>
        ${m.give ? `<div class="ex"><div><div class="lab">${me ? '우리가 줄 것' : '당신이 줄 것'}</div>${bundleChips(m.give)}</div><span class="arr">→</span><div><div class="lab">${me ? '우리가 받을 것' : '당신이 받을 것'}</div>${bundleChips(m.take)}</div></div>` : ''}
        ${m.text ? `<span>${esc(m.text)}</span>` : ''}</div>`;
    }).join('')).join('') : '<div class="empty">아직 이 나라와 나눈 협상이 없어요.</div>';
    const counterBox = open ? `<div class="offer" style="border-color:var(--brass)"><div class="h"><b>${esc(nm(pid))}의 역제안</b><span class="tag sell">응답 대기</span></div>
      <div class="ex"><div><div class="lab">내가 줄 것</div>${bundleChips(open.counter.give)}</div><span class="arr">→</span><div><div class="lab">내가 받을 것</div>${bundleChips(open.counter.take)}</div></div>
      <div class="acts"><button class="btn good sm" data-a="cAccept" data-id="${open.id}" ${ok && E.hasBundle(p, open.counter.give) ? '' : 'disabled'}>역제안 수락</button><button class="btn sm" data-a="cEdit" data-id="${open.id}" ${ok ? '' : 'disabled'}>다시 협상</button><button class="btn bad sm" data-a="cReject" data-id="${open.id}" ${ok ? '' : 'disabled'}>거절</button></div></div>` : '';
    const left = E.offersLeft();
    const sendReason = !ok ? '무역 단계가 아니에요' : left <= 0 ? '제안 횟수를 모두 썼어요' : (E.bundleEmpty(c.give) && E.bundleEmpty(c.take)) ? '' : !E.hasBundle(p, c.give) ? '내가 줄 것이 부족해요' : '';
    const wants = E.wants(ai);
    const needList = ALL_IDS.filter(i => E.need(ai, i, wants) > 1.15).sort((a, b) => E.need(ai, b, wants) - E.need(ai, a, wants)).slice(0, 5);

    // 거래 내역
    const mine = s.trades.filter(t => t.a === p.id || t.b === p.id);
    const histRows = U.histTab === 'mine'
      ? (mine.length ? `<table class="hist"><thead><tr><th>R</th><th>상대국</th><th>보낸 것</th><th>받은 것</th><th>규모</th></tr></thead><tbody>${mine.slice(0, 40).map(t => {
        const meA = t.a === p.id, other = meA ? t.b : t.a, gave = meA ? t.give : t.take, got = meA ? t.take : t.give;
        return `<tr><td>${t.r}</td><td class="nowrap">${emb(other, 'sm')} ${esc(nm(other))}</td><td>${esc(E.bundleText(gave))}</td><td>${esc(E.bundleText(got))}</td><td class="nowrap">${$m(t.value)}</td></tr>`;
      }).join('')}</tbody></table>` : '<div class="empty">아직 성사된 거래가 없어요.</div>')
      : logHtml(s.news.slice(0, 40));

    return `
      <div class="view-title"><div><div class="kicker">국가 간 무역</div><h2>무역 협상</h2></div><p>이번 라운드 남은 제안 <b class="brass">${left}</b> / ${E.maxOffers(p)}회 · 거래는 양쪽이 동의해야 성사돼요</p></div>
      ${lockMsg('trade')}
      <div class="partners">${partners}</div>
      <div class="grid g-side">
        <div class="grid" style="align-content:start">
          <div class="panel">
            <div class="panel-h"><h3>${emb(pid)} ${esc(nm(pid))}에 제안하기</h3>
              <div class="seg"><button data-a="mode" data-v="buy">구매</button><button data-a="mode" data-v="sell">판매</button><button data-a="mode" data-v="barter">물물교환</button><button data-a="mode" data-v="clear">비우기</button></div></div>
            <div class="small muted" style="margin-bottom:10px">풍부: ${richOf(pid).map(i => ITEMS[i].n).join(', ')} · 필요로 함: ${needList.length ? needList.map(i => ITEMS[i].n).join(', ') : '특별히 없음'} · 관계 ${relText(E.rel(pid, p.id))}</div>
            <div class="comp">
              <div class="side-box"><h4><span>내가 주는 것</span><span>${$m(vg)}</span></h4>${Object.keys(c.give.items).map(i => row('give', i)).join('')}${moneyRow('give')}${addSel('give')}</div>
              <div class="swap" aria-hidden="true">⇄</div>
              <div class="side-box"><h4><span>내가 받는 것</span><span>${$m(vt)}</span></h4>${Object.keys(c.take.items).map(i => row('take', i)).join('')}${moneyRow('take')}${addSel('take')}</div>
            </div>
            <div class="balance" style="margin-top:12px">
              <div class="row"><span>시장가 기준</span><b class="${vt - vg >= 0 ? 'good' : 'bad'}">${vt - vg >= 0 ? '내게 유리' : '상대에게 유리'} ${sign(vt - vg)}</b></div>
              <div class="tw"><i style="width:${vg / tot * 100}%"></i><i style="width:${vt / tot * 100}%"></i></div>
              ${predict}
            </div>
            <div class="acts" style="margin-top:12px">${sendReason ? `<span class="small warn" style="align-self:center">${sendReason}</span>` : ''}<button class="btn primary" data-a="propose" ${sendReason || (E.bundleEmpty(c.give) && E.bundleEmpty(c.take)) ? 'disabled' : ''}>${c.negId ? '수정 제안 보내기' : '제안 보내기'} (남은 ${left}회)</button></div>
          </div>
          ${counterBox}
          <div class="panel"><div class="panel-h"><h3>협상 기록</h3></div><div class="thread">${thread}</div></div>
        </div>
        <div class="grid" style="align-content:start">
          <div class="panel"><div class="panel-h"><h3>받은 제안</h3><span class="small muted">라운드가 끝나면 사라져요</span></div><div class="grid" style="gap:10px">${inbox}</div></div>
          <div class="panel"><div class="panel-h"><div class="seg"><button class="${U.histTab === 'mine' ? 'on' : ''}" data-a="histTab" data-v="mine">거래 내역</button><button class="${U.histTab === 'world' ? 'on' : ''}" data-a="histTab" data-v="world">세계 소식</button></div></div><div class="htab">${histRows}</div></div>
        </div>
      </div>`;
  }
  function compMode(mode) {
    const p = P(), ai = E.nation(U.comp.partner), c = U.comp;
    c.give = E.emptyB(); c.take = E.emptyB(); c.negId = null;
    if (mode === 'clear') return;
    const w = E.wants(ai), pw = E.wants(p);
    const theirs = ALL_IDS.filter(i => ai.stock[i] > 0).sort((a, b) => E.surplus(ai, b, w) * E.price(b) - E.surplus(ai, a, w) * E.price(a));
    const mine = ALL_IDS.filter(i => p.stock[i] > 0).sort((a, b) => (E.need(ai, b, w) * Math.max(0, p.stock[b] - pw[b])) - (E.need(ai, a, w) * Math.max(0, p.stock[a] - pw[a])));
    if (mode === 'buy' && theirs.length) {
      const i = theirs[0], q = Math.max(1, Math.min(ai.stock[i], 4));
      c.take.items[i] = q; c.give.money = Math.min(p.money, Math.round(q * E.price(i) * 1.05 / 10) * 10);
    } else if (mode === 'sell' && mine.length) {
      const i = mine[0], q = Math.max(1, Math.min(p.stock[i], 4));
      c.give.items[i] = q; c.take.money = Math.round(q * E.price(i) * 0.95 / 10) * 10;
    } else if (mode === 'barter' && mine.length && theirs.length) {
      const x = mine[0], y = theirs.find(i => i !== x) || theirs[0];
      const qx = Math.max(1, Math.min(p.stock[x], 4));
      const qy = Math.max(1, Math.min(ai.stock[y], Math.round(qx * E.price(x) / E.price(y))));
      c.give.items[x] = qx; c.take.items[y] = qy;
    } else toast('추천할 거래를 찾지 못했어요. 직접 품목을 추가해 보세요.', 'info');
  }

  /* ---------- 세계 정보 ---------- */
  function viewInfo() {
    const s = S(), p = P();
    const sel = U.info && s.nations[U.info] ? U.info : p.id;
    const pairs = Object.entries(s.pairVol).filter(([k]) => k.split('|').every(id => s.nations[id]));
    const vmax = Math.max(1, ...pairs.map(([, v]) => v));
    const hot = new Set(s.trades.filter(t => t.r === s.round || t.r === s.round - 1).map(t => E.relKey(t.a, t.b)));
    const routes = pairs.map(([k, v]) => { const [a, b] = k.split('|'); return `<path class="route ${hot.has(k) ? 'hot' : ''}" d="${routePath(a, b)}" stroke-width="${(1 + v / vmax * 6).toFixed(1)}"/>`; }).join('');
    const nodes = s.order.map(id => {
      const d = DEF[id], n = s.nations[id], r = 10 + Math.min(14, n.score / 250);
      return `<g class="node" data-a="info" data-id="${id}" role="button" tabindex="0" aria-label="${esc(d.name)}">
        <circle cx="${d.x}" cy="${d.y}" r="${r + 8}" fill="${d.color}" opacity="${sel === id ? .3 : .12}"/>
        <circle cx="${d.x}" cy="${d.y}" r="${r}" fill="${d.color}" stroke="${id === p.id ? '#f2cd8a' : '#0d1117'}" stroke-width="${id === p.id ? 3 : 2}"/>
        <text x="${d.x}" y="${d.y + r + 20}" text-anchor="middle">${esc(d.name)}${id === p.id ? ' (나)' : ''}</text>
        <text class="sub" x="${d.x}" y="${d.y + r + 36}" text-anchor="middle">발전도 ${fmt(n.score)}</text></g>`;
    }).join('');
    const ghost = NATIONS.filter(n => !s.nations[n.id]).map(n => `<circle cx="${n.x}" cy="${n.y}" r="5" fill="#2a3544"/>`).join('');
    const map = `<svg class="map" viewBox="0 0 1000 480" role="img" aria-label="세계 무역 지도"><g fill="#1f2b3a">${dots()}</g>${ghost}${routes}${nodes}</svg>`;
    const rank = E.ranking();
    const table = `<div class="htab"><table class="rank"><thead><tr><th>#</th><th>국가</th><th>발전도</th><th>자금</th><th title="산업 경제 기술 농업 무역">발전 단계 (산·경·기·농·무)</th><th>무역 규모</th><th>관계</th></tr></thead><tbody>
      ${rank.map((n, k) => {
        const r = n.id === p.id ? null : E.rel(n.id, p.id);
        return `<tr class="${n.id === p.id ? 'me' : ''}" data-a="info" data-id="${n.id}"><td class="pos">${k + 1}</td><td>${emb(n.id, 'sm')} <b>${esc(nm(n.id))}</b></td><td><b>${fmt(n.score)}</b></td><td>${$m(n.money)}</td>
        <td><div class="lvls">${TRACK_IDS.map(t => `<span style="background:${n.levels[t] >= 4 ? 'var(--brass-d)' : ''}">${n.levels[t]}</span>`).join('')}</div></td><td>${$m(n.vol.trade + n.vol.market)}</td>
        <td>${r == null ? '—' : `<span style="color:${relColor(r)}">${relText(r)} ${Math.round(r)}</span>`}</td></tr>`;
      }).join('')}</tbody></table></div>`;
    const n = s.nations[sel], d = DEF[sel], parts = E.scoreParts(n);
    const yl = E.yields(n);
    const top = ALL_IDS.filter(i => n.stock[i] > 0).sort((a, b) => n.stock[b] * E.price(b) - n.stock[a] * E.price(a)).slice(0, 10);
    const detail = `<div class="panel">
      <div class="panel-h"><h3>${emb(sel, 'lg')}<span><span class="serif" style="font-size:20px">${esc(d.name)}</span><br><span class="small muted">${esc(d.en)}</span></span></h3>${sel !== p.id ? `<button class="btn sm" data-a="tradeWith" data-id="${sel}">무역하기 →</button>` : ''}</div>
      <p class="small" style="color:var(--ink2);margin-bottom:10px">${esc(d.blurb)}</p>
      <div class="trait small" style="color:var(--brass2);margin-bottom:12px"><b>${esc(d.trait.n)}</b> — ${esc(d.trait.d)}</div>
      <div class="grid g2" style="margin-bottom:12px">
        <div class="stat"><span class="k">발전도</span><span class="v">${fmt(n.score)}</span></div>
        <div class="stat"><span class="k">자금</span><span class="v brass">${$m(n.money)}</span></div>
        <div class="stat"><span class="k">안정도</span><span class="v">${Math.round(n.stability)}</span></div>
        <div class="stat"><span class="k">${sel === p.id ? '누적 생산' : '관계'}</span><span class="v">${sel === p.id ? fmt(n.produced) + '개' : relText(E.rel(sel, p.id))}</span></div>
      </div>
      <div class="small muted" style="margin-bottom:6px">점수 구성: 발전 ${parts.dev} · 부 ${parts.wealth} · 무역 ${parts.trade} · 안정 ${parts.stab}</div>
      ${spark(n.hist, 300, 50).replace('class="spark"', 'class="spark" style="width:100%;height:50px"')}
      <div class="small muted" style="margin:10px 0 6px">생산하는 자원 (라운드당)</div>
      <div class="chips">${Object.entries(yl).sort((a, b) => b[1] - a[1]).map(([i, v]) => chip(i, '+' + v.toFixed(1))).join('') || '<span class="muted small">없음</span>'}</div>
      <div class="small muted" style="margin:10px 0 6px">주요 보유품</div>
      <div class="chips">${top.map(i => chip(i, n.stock[i])).join('') || '<span class="muted small">없음</span>'}</div>
    </div>`;
    return `
      <div class="view-title"><div><div class="kicker">국가 정보</div><h2>세계 무역 지도</h2></div><p>선 굵기 = 두 나라 사이의 누적 거래액 · 점선은 최근 거래</p></div>
      <div class="grid g-side">
        <div class="grid" style="align-content:start"><div class="panel" style="padding:8px">${map}</div><div class="panel"><div class="panel-h"><h3>세계 순위</h3><span class="small muted">행을 누르면 자세히 봐요</span></div>${table}</div></div>
        ${detail}
      </div>`;
  }

  /* ---------- 정산 모달 ---------- */
  function showSettle() {
    const s = S(), st = s.settle; if (!st) return;
    const p = P();
    const done = st.done.length ? `<div class="chips">${st.done.map(d => chip(d.g, '+' + d.q, 'ok')).join('')}</div>` : '<span class="muted small">완성된 상품이 없어요</span>';
    const up = st.upkeep;
    const used = Object.entries(up.used).filter(([, q]) => q > 0).map(([i, q]) => chip(i, '−' + q)).join('');
    const rank = st.rank.map((r, k) => {
      const mv = r.prev - k;
      return `<tr class="${r.id === p.id ? 'me' : ''}"><td class="pos">${k + 1}</td><td>${emb(r.id, 'sm')} ${esc(nm(r.id))}</td><td><b>${fmt(r.score)}</b></td><td class="${mv > 0 ? 'good' : mv < 0 ? 'bad' : 'muted'}">${mv > 0 ? '▲' + mv : mv < 0 ? '▼' + (-mv) : '–'}</td></tr>`;
    }).join('');
    modal(`
      <div class="kicker">${st.r}라운드 결과 정산</div>
      <h3 style="margin:4px 0 14px">${s.over ? '마지막 라운드가 끝났어요' : '한 라운드가 지나갔어요'}</h3>
      <div class="report" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        <div class="rcard"><span class="k">자금 변화</span><span class="v ${st.moneyDelta >= 0 ? 'good' : 'bad'}">${sign(st.moneyDelta)}</span><span class="small muted">세금 +${fmt(st.income)}</span></div>
        <div class="rcard"><span class="k">안정도</span><span class="v ${st.stabDelta >= 0 ? 'good' : 'bad'}">${Math.round(p.stability)}</span><span class="small muted">${sign(st.stabDelta)}</span></div>
        <div class="rcard"><span class="k">발전도</span><span class="v">${fmt(p.score)}</span><span class="small muted">${st.rank.findIndex(r => r.id === p.id) + 1}위</span></div>
      </div>
      <div class="divider"></div>
      <div class="grid g2">
        <div><div class="small muted" style="margin-bottom:6px">생산 완료</div>${done}</div>
        <div><div class="small muted" style="margin-bottom:6px">국민 소비</div><div class="chips">${used || '<span class="muted small">없음</span>'}</div>
          ${up.foodShort ? `<p class="small bad" style="margin-top:6px">식량 ${up.foodShort} 부족!</p>` : ''}${up.energyShort ? `<p class="small bad">에너지 ${up.energyShort} 부족!</p>` : ''}</div>
      </div>
      ${st.event ? `<div class="evt" style="margin-top:12px"><b>세계 사건 — ${esc(st.event.n)}</b><br>${esc(st.event.d)}</div>` : ''}
      <div class="divider"></div>
      <div class="small muted" style="margin-bottom:6px">크게 움직인 시세</div>
      <div class="chips">${st.big.map(b => `<span class="chip">${gl(b.i)}${ITEMS[b.i].n} <b class="${b.d >= 0 ? 'good' : 'bad'}">${b.d >= 0 ? '▲' : '▼'}${Math.abs(b.d * 100).toFixed(0)}%</b></span>`).join('')}</div>
      <div class="divider"></div>
      <div class="grid g2">
        <div><div class="small muted" style="margin-bottom:6px">세계 순위</div><table class="rank">${rank}</table></div>
        <div><div class="small muted" style="margin-bottom:6px">세계 소식</div>${logHtml(st.news)}</div>
      </div>
      <div class="foot">${s.over ? '<button class="btn primary lg" data-a="toResult">최종 결과 보기 →</button>' : `<button class="btn ghost" data-a="closeModal">닫기</button><button class="btn primary lg" data-a="nextRound">${s.round + 1}라운드 시작 →</button>`}</div>`);
  }

  /* ================= RESULT ================= */
  function renderResult() {
    const s = S(); if (!s) return show('menu');
    const p = P(), rank = E.ranking(), win = rank[0], my = rank.indexOf(p) + 1;
    const W = 900, H = 260, pad = 34;
    const maxR = Math.max(...s.order.map(id => s.nations[id].hist.length));
    const maxV = Math.max(1, ...s.order.flatMap(id => s.nations[id].hist));
    const lines = s.order.map(id => {
      const h = s.nations[id].hist;
      const pts = h.map((v, k) => `${(pad + k / Math.max(1, maxR - 1) * (W - pad - 10)).toFixed(1)},${(H - 24 - v / maxV * (H - 40)).toFixed(1)}`).join(' ');
      return `<polyline points="${pts}" fill="none" stroke="${DEF[id].color}" stroke-width="${id === p.id ? 3 : 1.6}" opacity="${id === p.id ? 1 : .75}" stroke-linejoin="round"/>`;
    }).join('');
    const grid = [0, .25, .5, .75, 1].map(f => { const y = H - 24 - f * (H - 40); return `<line x1="${pad}" x2="${W - 10}" y1="${y}" y2="${y}" stroke="#2a3544"/><text x="${pad - 6}" y="${y + 4}" text-anchor="end">${fmt(maxV * f)}</text>`; }).join('');
    const myTrades = s.trades.filter(t => t.a === p.id || t.b === p.id);
    $('#scr-result').innerHTML = `<div class="result">
      <div class="winner">${emb(win.id, 'lg')}<div class="kicker">${s.maxRounds}라운드의 무역 전쟁이 끝났어요</div><h2>${win.id === p.id ? '세계 경제의 패권을 쥐었어요!' : esc(nm(win.id)) + '의 승리'}</h2>
        <p class="muted">${win.id === p.id ? `${esc(nm(p.id))}이(가) 발전도 ${fmt(win.score)}로 1위를 차지했어요.` : `${esc(nm(p.id))}은(는) ${my}위로 마쳤어요. 발전도 ${fmt(p.score)}`}</p></div>
      <div class="report">
        <div class="rcard"><span class="k">최종 순위</span><span class="v brass">${my}위 / ${rank.length}</span></div>
        <div class="rcard"><span class="k">국가 간 거래</span><span class="v">${myTrades.length}건</span><span class="small muted">${$m(p.vol.trade)}</span></div>
        <div class="rcard"><span class="k">시장 거래</span><span class="v">${$m(p.vol.market)}</span><span class="small muted">구매 ${$m(p.vol.buy)} · 판매 ${$m(p.vol.sell)}</span></div>
        <div class="rcard"><span class="k">생산한 상품</span><span class="v">${fmt(p.produced)}개</span><span class="small muted">발전 단계 합 ${TRACK_IDS.reduce((a, t) => a + p.levels[t], 0)}</span></div>
      </div>
      <div class="panel"><div class="panel-h"><h3>발전도 변화</h3><div class="chips">${s.order.map(id => `<span class="chip"><span class="gl" style="--c:${DEF[id].color}">${DEF[id].name[0]}</span>${esc(nm(id))}</span>`).join('')}</div></div>
        <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="라운드별 발전도 그래프">${grid}${lines}<text x="${pad}" y="${H - 6}">1R</text><text x="${W - 10}" y="${H - 6}" text-anchor="end">${maxR - 1}R</text></svg></div>
      <div class="panel"><div class="panel-h"><h3>최종 순위</h3></div><div class="htab"><table class="rank"><thead><tr><th>#</th><th>국가</th><th>발전도</th><th>발전</th><th>부</th><th>무역</th><th>안정</th><th>단계 (산·경·기·농·무)</th></tr></thead><tbody>
        ${rank.map((n, k) => { const pp = E.scoreParts(n); return `<tr class="${n.id === p.id ? 'me' : ''}"><td class="pos">${k + 1}</td><td>${emb(n.id, 'sm')} <b>${esc(nm(n.id))}</b></td><td><b>${fmt(n.score)}</b></td><td>${pp.dev}</td><td>${pp.wealth}</td><td>${pp.trade}</td><td>${pp.stab}</td><td><div class="lvls">${TRACK_IDS.map(t => `<span>${n.levels[t]}</span>`).join('')}</div></td></tr>`; }).join('')}
      </tbody></table></div></div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button class="btn primary lg" data-a="toSetup">새 게임</button><button class="btn lg" data-a="toMenu">메인 메뉴</button></div>
    </div>`;
  }

  /* ================= 게임 방법 / 메뉴 ================= */
  function howto() {
    modal(`<div class="kicker">HOW TO PLAY</div><h3 style="margin:4px 0 14px">게임 방법</h3>
      <div class="howto">
        <p>나라마다 풍부한 자원과 부족한 자원이 달라요. 부족한 건 무역으로 채우고, 남는 건 팔거나 가공해서 나라를 발전시키세요. 마지막 라운드에 <b>국가 발전도</b>가 가장 높은 나라가 이겨요.</p>
        <h4>한 라운드의 순서</h4>
        <ol><li><b>자원 확인</b> — 땅에서 자원이 들어와요. 이번 라운드에 필요한 식량·에너지를 확인해요.</li>
        <li><b>생산 활동</b> — 자원을 가공해 비싼 상품을 만들어요. (예: 철 2 + 석탄 1 → 철강)</li>
        <li><b>국가 간 무역</b> — 다른 나라에 구매·판매·물물교환을 제안하고, 받은 제안에 답해요. 상대가 역제안을 하면 수락하거나 다시 협상할 수 있어요.</li>
        <li><b>시장 거래</b> — 세계 시장에서 사고팔아요. 많이 사면 값이 오르고 많이 팔면 값이 내려가요.</li>
        <li><b>결과 정산</b> — 생산이 진행되고, 국민이 식량과 에너지를 소비하고, 세금이 들어오고, 세계 사건이 일어나요.</li></ol>
        <h4>국가 발전</h4>
        <ul><li><b>산업</b>: 생산 라인과 생산량 증가, 고급 공장 해금</li><li><b>경제</b>: 세금 수입 증가</li><li><b>기술</b>: 광물 생산 증가, 생산 시간 단축, 첨단 상품 해금</li><li><b>농업</b>: 농산물 생산 증가</li><li><b>무역 규모</b>: 시장 수수료 감소, 무역 제안 횟수 증가, 상대 반응 예측</li></ul>
        <h4>팁</h4>
        <ul><li>식량이나 에너지가 모자라면 안정도가 떨어지고, 안정도가 낮으면 생산량과 세금이 줄어요.</li>
        <li>상대국이 ‘필요로 함’에 올린 물건은 비싸게 팔 수 있어요. 관계가 좋을수록 협상이 쉬워져요.</li>
        <li>제안을 거절하면 관계가 조금 나빠지고, 거래가 성사되면 좋아져요.</li>
        <li>시세에 ‘품귀’ 표시가 붙은 물건은 지금 팔기 좋은 때예요.</li></ul>
      </div><div class="foot"><button class="btn primary" data-a="closeModal">알겠어요</button></div>`);
  }
  function gameMenu() {
    const s = S();
    modal(`<div class="kicker">MENU</div><h3 style="margin:4px 0 14px">게임 메뉴</h3>
      <div class="grid" style="gap:14px">
        <div class="opt"><label class="small muted">라운드 제한 시간</label><div class="seg">${[[0, '없음'], [90, '90초'], [180, '3분'], [300, '5분']].map(([v, l]) => `<button class="${s.timerSec === v ? 'on' : ''}" data-a="setTimer" data-v="${v}">${l}</button>`).join('')}</div></div>
        <div class="opt"><label class="small muted">단계 진행</label><div class="seg"><button class="${s.lock ? 'on' : ''}" data-a="setLock" data-v="1">순서대로</button><button class="${!s.lock ? 'on' : ''}" data-a="setLock" data-v="0">자유롭게</button></div></div>
        <div class="small muted">게임은 행동할 때마다 자동 저장돼요.</div>
      </div>
      <div class="foot"><button class="btn bad" data-a="confirmNew">새 게임</button><button class="btn" data-a="howto">게임 방법</button><button class="btn" data-a="saveExit">저장하고 메인 메뉴로</button><button class="btn primary" data-a="closeModal">계속하기</button></div>`);
  }

  /* ================= 액션 ================= */
  function res(r) { if (r && !r.ok && r.msg) toast(r.msg, 'bad'); return r && r.ok; }
  const A = {
    toSetup() { closeModal(); show('setup'); },
    toMenu() { closeModal(); show('menu'); },
    howto,
    closeModal,
    continue() {
      const sv = savedSummary(); if (!sv) return;
      try { E.load(sv.raw); } catch (e) { toast('저장된 게임을 불러오지 못했어요.', 'bad'); return; }
      U.prev = null; U.tab = PHASES[S().phase].tab; U.recipe = null; U.comp = { partner: null, give: E.emptyB(), take: E.emptyB(), negId: null };
      show('game');
      if (S().settle) showSettle();
      toast(`${nm(S().player)}, ${S().round}라운드부터 이어서 진행해요.`, 'info');
    },
    lastResult() { const sv = savedSummary(); if (!sv) return; try { E.load(sv.raw); show('result'); } catch (e) { /* ignore */ } },
    pickNation(d) { U.setup.player = d.id; renderSetup(); },
    setOpt(d) {
      let v = d.v; if (v === 'true') v = true; else if (v === 'false') v = false; else if (/^\d+$/.test(v)) v = +v;
      U.setup[d.k] = v; renderSetup();
    },
    startGame() {
      const st = U.setup; if (!st.player) return;
      lsSet(PREF_KEY, JSON.stringify({ setup: Object.assign({}, st, { player: null }) }));
      E.newGame({ player: st.player, aiCount: st.ai, rounds: st.rounds, diff: st.diff, timerSec: st.timer, lock: st.lock });
      U.prev = null; U.tab = 'manage'; U.recipe = null; U.mq = {}; U.comp = { partner: null, give: E.emptyB(), take: E.emptyB(), negId: null };
      saveNow(); show('game');
      toast(`${nm(st.player)}의 지도자가 되었어요. 1라운드 시작!`, 'good');
    },
    tab(d) { U.tab = d.tab; renderGame(); $('#view').scrollTop = 0; },
    nextPhase() { const s = S(); if (s.settle) return; E.setPhase(s.phase + 1); U.tab = PHASES[s.phase].tab; renderGame(); $('#view').scrollTop = 0; },
    gotoPhase(d) { const ph = +d.ph; E.setPhase(ph); U.tab = PHASES[S().phase].tab; renderGame(); },
    settle() { doSettle(); },
    showSettle,
    nextRound() { closeModal(); E.nextRound(); U.tab = 'manage'; U.recipe = null; U.comp.negId = null; saveNow(); renderGame(); $('#view').scrollTop = 0; toast(`${S().round}라운드가 시작됐어요. 자원이 들어왔어요.`, 'info'); },
    toResult() { closeModal(); saveNow(); show('result'); },
    gameMenu,
    saveExit() { saveNow(); closeModal(); show('menu'); toast('저장했어요.', 'good'); },
    confirmNew() {
      modal(`<h3>새 게임을 시작할까요?</h3><p class="muted" style="margin-top:8px">지금 진행 중인 게임은 사라져요.</p><div class="foot"><button class="btn" data-a="closeModal">취소</button><button class="btn bad" data-a="toSetup">새 게임 시작</button></div>`);
    },
    setTimer(d) { const s = S(); s.timerSec = +d.v; s.timeLeft = s.timerSec; save(); gameMenu(); renderHUD(); },
    setLock(d) { S().lock = d.v === '1'; save(); gameMenu(); renderGame(); },
    upgrade(d) { if (res(E.upgrade(P(), d.t))) toast(`${TRACKS[d.t].n} ${P().levels[d.t]}단계 달성!`, 'good'); },
    pickRecipe(d) { if (E.locked(P(), d.g)) { toast(`${GOODS[d.g].n}은(는) ${E.locked(P(), d.g)} 단계가 필요해요.`, 'info'); return; } U.recipe = U.recipe === d.g ? null : d.g; U.qty = Math.max(1, E.maxMake(P(), d.g)); renderView(); },
    qty(d) { U.qty = Math.max(1, Math.min(Math.max(1, E.maxMake(P(), U.recipe)), U.qty + +d.d)); renderView(); },
    qtyMax() { U.qty = Math.max(1, E.maxMake(P(), U.recipe)); renderView(); },
    startJob() { if (!can('prod')) return; if (res(E.startJob(P(), U.recipe, U.qty))) toast(`${GOODS[U.recipe].n} 생산을 시작했어요.`, 'good'); },
    cancelJob(d) { if (!can('prod')) return; res(E.cancelJob(P(), d.id)); },
    mcat(d) { U.mcat = d.v; renderView(); },
    mq(d) { U.mq[d.id] = Math.max(1, (U.mq[d.id] || 1) + +d.d); renderView(); },
    buy(d) { if (!can('market')) return; const q = U.mq[d.id] || 1; const r = E.buy(P(), d.id, q); if (res(r)) toast(`${ITEMS[d.id].n} ${q}개 구매 (−$${fmt(r.cost)})`, 'good'); },
    sell(d) { if (!can('market')) return; const q = U.mq[d.id] || 1; const r = E.sell(P(), d.id, q); if (res(r)) toast(`${ITEMS[d.id].n} ${q}개 판매 (+$${fmt(r.got)})`, 'good'); },
    partner(d) { if (U.comp.partner !== d.id) { U.comp = { partner: d.id, give: E.emptyB(), take: E.emptyB(), negId: null }; } renderView(); },
    tradeWith(d) { U.comp = { partner: d.id, give: E.emptyB(), take: E.emptyB(), negId: null }; U.tab = 'trade'; renderGame(); },
    mode(d) { compMode(d.v); renderView(); },
    cq(d) {
      const b = U.comp[d.side], src = d.side === 'give' ? P() : E.nation(U.comp.partner);
      b.items[d.id] = Math.max(0, Math.min(src.stock[d.id], (b.items[d.id] || 0) + +d.d)); renderView();
    },
    cdel(d) { delete U.comp[d.side].items[d.id]; renderView(); },
    cm(d) {
      const b = U.comp[d.side], src = d.side === 'give' ? P() : E.nation(U.comp.partner);
      b.money = Math.max(0, Math.min(Math.floor(src.money), (b.money || 0) + +d.d)); renderView();
    },
    propose() {
      if (!can('trade')) return;
      const c = U.comp, btn = document.querySelector('[data-a="propose"]');
      if (btn) { btn.disabled = true; btn.textContent = '상대국이 검토 중…'; }
      setTimeout(() => {
        const r = E.propose(c.partner, E.copyB(c.give), E.copyB(c.take), c.negId);
        if (!res(r)) { renderView(); return; }
        if (r.result === 'accept') { toast(`${nm(c.partner)}: 거래 성사!`, 'good'); U.comp = { partner: c.partner, give: E.emptyB(), take: E.emptyB(), negId: null }; }
        else if (r.result === 'counter') { toast(`${nm(c.partner)}이(가) 역제안을 보냈어요.`, 'info'); c.negId = r.neg.id; }
        else { toast(`${nm(c.partner)}: 제안을 거절했어요.`, 'bad'); c.negId = null; }
        renderGame();
      }, 550);
    },
    cAccept(d) { if (!can('trade')) return; if (res(E.acceptCounter(d.id))) { toast('거래 성사!', 'good'); U.comp.negId = null; U.comp.give = E.emptyB(); U.comp.take = E.emptyB(); } },
    cReject(d) { if (!can('trade')) return; E.rejectCounter(d.id); U.comp.negId = null; },
    cEdit(d) {
      const ng = S().negs.find(x => x.id === d.id); if (!ng || !ng.counter) return;
      U.comp.give = E.copyB(ng.counter.give); U.comp.take = E.copyB(ng.counter.take); U.comp.negId = ng.id;
      renderView(); toast('역제안 조건을 불러왔어요. 고쳐서 다시 보내세요.', 'info');
    },
    inAccept(d) { if (!can('trade')) return; if (res(E.acceptInbox(d.id))) toast('거래 성사!', 'good'); },
    inReject(d) { if (!can('trade')) return; E.rejectInbox(d.id); },
    inCounter(d) {
      const o = S().inbox.find(x => x.id === d.id); if (!o) return;
      U.comp = { partner: o.from, give: E.copyB(o.give), take: E.copyB(o.take), negId: null };
      S().inbox = S().inbox.filter(x => x !== o);
      renderGame(); toast('제안 내용을 불러왔어요. 조건을 고쳐서 보내세요.', 'info');
    },
    histTab(d) { U.histTab = d.v; renderView(); },
    info(d) { U.info = d.id; renderView(); },
  };
  function doSettle() {
    const s = S(); if (s.settle) return showSettle();
    E.settle();
    saveNow();
    renderGame();
    showSettle();
  }

  /* ---------- 이벤트 연결 ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-a]');
    if (!el) { if (e.target.id === 'modal' && !S()?.settle) closeModal(); return; }
    if (el.disabled || el.getAttribute('aria-disabled') === 'true' && el.dataset.a !== 'pickRecipe') return;
    const f = A[el.dataset.a]; if (f) { e.preventDefault(); f(el.dataset, el); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modalOpen()) closeModal();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.node')) { e.preventDefault(); A.info(e.target.dataset); }
  });
  document.addEventListener('change', e => {
    const el = e.target; const k = el.dataset && el.dataset.in; if (!k) return;
    const v = Math.max(0, Math.floor(+el.value || 0));
    if (k === 'qty') { U.qty = Math.max(1, Math.min(v, Math.max(1, E.maxMake(P(), U.recipe)))); renderView(); }
    if (k === 'mq') { U.mq[el.dataset.id] = Math.max(1, v); renderView(); }
    if (k === 'cq') { const src = el.dataset.side === 'give' ? P() : E.nation(U.comp.partner); U.comp[el.dataset.side].items[el.dataset.id] = Math.min(src.stock[el.dataset.id], v); renderView(); }
    if (k === 'cm') { const src = el.dataset.side === 'give' ? P() : E.nation(U.comp.partner); U.comp[el.dataset.side].money = Math.min(Math.floor(src.money), v); renderView(); }
    if (k === 'cadd' && el.value) { U.comp[el.dataset.side].items[el.value] = 1; renderView(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input[data-in]')) e.target.blur(); });

  E.on((type, data) => {
    if (type === 'change' || type === 'phase' || type === 'round') { if (U.screen === 'game') schedule(); }
    if (type === 'log' && U.screen === 'game' && (data.kind === 'bad')) toast(data.text, 'bad');
  });

  /* ---------- 타이머 ---------- */
  setInterval(() => {
    const s = S();
    if (!s || U.screen !== 'game' || !s.timerSec || s.settle || s.over || document.hidden) return;
    if (modalOpen()) return;
    s.timeLeft--;
    updateTimer();
    if (s.timeLeft === 30) toast('라운드 종료까지 30초 남았어요.', 'info');
    if (s.timeLeft <= 0) { s.timeLeft = 0; toast('제한 시간이 끝나 자동으로 정산해요.', 'event'); doSettle(); }
    if (s.timeLeft % 5 === 0) save();
  }, 1000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  window.addEventListener('pagehide', saveNow);

  show('menu');
})();
