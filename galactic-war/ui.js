/* ===================================================================
   GALACTIC WAR — 화면 (로비, 방, 싱글 플레이, 지도, 패널, 모든 창)
   =================================================================== */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* */ } },
  };
  const SS = { get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* */ } } };
  const rhex = n => { const a = new Uint8Array(n); (self.crypto || window.msCrypto).getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); };
  const fmt = n => (Math.round(n) || 0).toLocaleString('ko-KR');
  const sum = o => Object.values(o || {}).reduce((a, b) => a + (b || 0), 0);

  /* ---------- 내 정보 / 설정 ---------- */
  let ME_ID = LS.get('gw-pid'); if (!ME_ID) { ME_ID = 'u' + rhex(8); LS.set('gw-pid', ME_ID); }
  let SECRET = LS.get('gw-secret'); if (!SECRET) { SECRET = rhex(16); LS.set('gw-secret', SECRET); }
  const CFG = Object.assign({ name: '', empire: '', color: GW.COLORS[0], emblem: GW.EMBLEMS[0], server: '', aiSpeed: 'normal' }, LS.get('gw-cfg', {}));
  const saveCfg = () => LS.set('gw-cfg', CFG);
  const myName = () => CFG.name || '사령관';
  const myEmpire = () => ({ name: myName(), empire: CFG.empire || myName() + ' 제국', color: CFG.color, emblem: CFG.emblem });

  /* ---------- 토스트 / 모달 / 확인 창 ---------- */
  function toast(msg, kind) {
    const el = document.createElement('div'); el.className = 'toast ' + (kind || ''); el.textContent = msg;
    $('toasts').appendChild(el); setTimeout(() => el.remove(), kind === 'err' ? 4500 : 3200);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  }
  const M = { render: null, queue: [], sys: false };
  function openModal(html, opt) {
    opt = opt || {};
    const m = $('modal');
    m.innerHTML = `<div class="box ${opt.cls || ''}" role="dialog" aria-modal="true">${html}</div>`;
    m.hidden = false; M.render = opt.render || null; M.sys = !!opt.sys; M.onclose = opt.onclose || null;
    const f = m.querySelector('[autofocus]'); if (f) f.focus();
  }
  function closeModal() {
    const m = $('modal'); m.hidden = true; m.innerHTML = ''; M.render = null; const oc = M.onclose; M.onclose = null; if (oc) oc();
    if (M.queue.length) { const n = M.queue.shift(); setTimeout(n, 50); }
  }
  function popup(fn) { if ($('modal').hidden) fn(); else M.queue.push(fn); }
  function refreshModal() {
    if ($('modal').hidden || !M.render) return;
    const box = $('modal').querySelector('.box'); const st = box ? box.scrollTop : 0;
    try { $('modal').querySelector('.box').innerHTML = M.render(); } catch (e) { console.error(e); }
    const nb = $('modal').querySelector('.box'); if (nb) nb.scrollTop = st;
  }
  const mh = (title, extra) => `<div class="mh"><h2>${title}</h2>${extra || ''}<button class="x" data-a="closeModal" aria-label="닫기">✕</button></div>`;
  let confirmResolve = null;
  function confirmBox(title, body, okText, kind) {
    return new Promise(res => {
      confirmResolve = res;
      const c = $('confirm');
      c.innerHTML = `<div class="box narrow" role="alertdialog" aria-modal="true"><div class="mh"><h2>${esc(title)}</h2></div><div>${body || ''}</div><div class="spacer"></div>
        <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-a="confirmNo">취소</button><button class="btn ${kind || 'pri'}" data-a="confirmYes" autofocus>${esc(okText || '확인')}</button></div></div>`;
      c.hidden = false; c.querySelector('[autofocus]').focus();
    });
  }
  function confirmDone(v) { $('confirm').hidden = true; $('confirm').innerHTML = ''; const r = confirmResolve; confirmResolve = null; if (r) r(v); }

  /* ---------- 공통 표시 ---------- */
  const crest = (p, lg) => p ? `<span class="crest ${lg ? 'lg' : ''}" style="background:${esc(p.color)};box-shadow:0 0 12px -2px ${esc(p.color)}">${esc(p.emblem)}</span>` : '<span class="crest" style="background:#333">?</span>';
  const resChip = (r, v) => `<span title="${GW.RES_KO[r]}">${GW.RES_ICON[r]} ${fmt(v)}</span>`;
  function costHtml(cost, have, mul) {
    mul = mul || 1;
    return `<span class="cost">${Object.entries(cost).map(([r, v]) => { const n = Math.ceil(v * mul); return `<span class="${have && have[r] < n ? 'lack' : ''}">${GW.RES_ICON[r]}${fmt(n)}</span>`; }).join('')}</span>`;
  }
  const relKo = { war: '전쟁', neutral: '중립', nap: '불가침', alliance: '동맹', self: '나' };
  const relCls = { war: 'red', neutral: '', nap: 'teal', alliance: 'green', self: 'gold' };
  const relBadge = r => `<span class="badge ${relCls[r] || ''}">${relKo[r] || r}</span>`;
  const gradeBadge = g => `<span class="badge" style="background:${GW.GRADES[g].color}22;color:${GW.GRADES[g].color}">${GW.GRADES[g].ko}</span>`;
  const lvDots = n => `<span class="lv">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
  const shipsHtml = ships => `<div class="shipline">${GW.SHIP_ORDER.filter(k => ships[k]).map(k => `<span title="${GW.SHIPS[k].ko}">${GW.SHIPS[k].icon} ${GW.SHIPS[k].ko} ×${ships[k]}</span>`).join('') || '<span class="dim">없음</span>'}</div>`;

  /* ---------- 화면 전환 ---------- */
  let curScreen = 'menu';
  function show(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === 'scr-' + name));
    curScreen = name; closeDrawers();
    if (name !== 'game') SS.set('gw-screen', name);
  }

  /* ===================================================================
     온라인 연결
     =================================================================== */
  function serverUrl() {
    if (CFG.server) {
      let u = CFG.server.trim().replace(/\/+$/, '');
      if (/^https?:/i.test(u)) u = u.replace(/^http/i, 'ws');
      if (!/^wss?:/i.test(u)) u = 'wss://' + u;
      return u.replace(/\/gw$/, '') + '/gw';
    }
    if (!/^https?:$/.test(location.protocol)) return null;
    if (/github\.io$/i.test(location.hostname)) return null;
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/gw';
  }
  const Net = {
    ws: null, ok: false, authed: false, retry: 0, pending: new Map(), seq: 1, offset: 0, room: null, rooms: [], records: [], wantRoom: null, timer: null,
    connect() {
      const url = serverUrl(); if (!url) return false;
      if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return true;
      let ws;
      try { ws = new WebSocket(url); } catch (e) { netbar('서버 주소가 올바르지 않습니다'); return false; }
      this.ws = ws;
      ws.onopen = () => { this.ok = true; this.retry = 0; ws.send(JSON.stringify({ t: 'hello', pid: ME_ID, secret: SECRET, name: myName() })); netbar(null); };
      ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (er) { return; } try { this.onMsg(m); } catch (er) { console.error(er); toast('화면 갱신 중 오류가 있었어요. 다시 불러옵니다.', 'err'); this.send({ t: 'resync' }); } };
      ws.onclose = () => {
        this.ok = false; this.authed = false;
        for (const [, p] of this.pending) p.res({ ok: false, err: '서버 연결이 끊겼습니다' }); this.pending.clear();
        if (this.ws !== ws) return;
        const wait = Math.min(15000, 800 * Math.pow(1.7, this.retry++));
        if (Game.mode === 'online' || ['rooms', 'room', 'create'].includes(curScreen)) netbar(`서버 연결이 끊겼어요. ${Math.ceil(wait / 1000)}초 뒤 다시 연결합니다…`);
        clearTimeout(this.timer); this.timer = setTimeout(() => this.connect(), wait);
      };
      ws.onerror = () => { /* onclose에서 처리 */ };
      return true;
    },
    send(m) { if (this.ws && this.ws.readyState === 1 && this.authed) { this.ws.send(JSON.stringify(m)); return true; } return false; },
    request(m) {
      return new Promise(res => {
        const req = this.seq++; m.req = req;
        if (!this.send(m)) return res({ ok: false, err: '서버에 연결되어 있지 않습니다. 잠시 후 다시 시도하세요.' });
        const to = setTimeout(() => { if (this.pending.has(req)) { this.pending.delete(req); res({ ok: false, err: '서버 응답이 없습니다. 연결을 확인하세요.' }); } }, 12000);
        this.pending.set(req, { res: v => { clearTimeout(to); res(v); } });
      });
    },
    onMsg(m) {
      if (m.req && this.pending.has(m.req) && (m.t === 'res' || m.t === 'err')) {
        const p = this.pending.get(m.req); this.pending.delete(m.req);
        p.res(m.t === 'res' ? m : { ok: false, err: m.msg }); return;
      }
      switch (m.t) {
        case 'auth':
          if (!m.ok) { ME_ID = 'u' + rhex(8); SECRET = rhex(16); LS.set('gw-pid', ME_ID); LS.set('gw-secret', SECRET); toast(m.msg, 'err'); try { this.ws.close(); } catch (e) { /* */ } }
          return;
        case 'welcome':
          this.authed = true; this.offset = m.now - Date.now(); this.room = null;
          if (m.room) { this.roomId = m.room; this.roomStatus = m.roomStatus; }
          else { this.roomId = null; if (Game.mode === 'online') { Game.mode = null; show('menu'); renderMenu(); } }
          if (curScreen === 'rooms') this.send({ t: 'rooms' });
          if (curScreen === 'records') this.send({ t: 'records' });
          if (this.wantRoom) { const w = this.wantRoom; this.wantRoom = null; w(); }
          if (curScreen === 'menu') renderMenu();
          return;
        case 'rooms': this.rooms = m.rooms; if (curScreen === 'rooms') renderRooms(); return;
        case 'records': this.records = m.records; if (curScreen === 'records') renderRecords(); return;
        case 'room': {
          const prev = this.room; this.room = m.room; this.roomId = m.room.id; this.roomStatus = m.room.status;
          if (m.room.status === 'lobby') { if (['create', 'rooms', 'room', 'menu'].includes(curScreen) && (curScreen === 'room' || !prev || prev.id !== m.room.id || this.joining)) { this.joining = false; show('room'); renderRoom(); } }
          else if (Game.mode !== 'online' && (this.joining || curScreen === 'room')) { this.joining = false; this.send({ t: 'resync' }); }
          if (curScreen === 'menu') renderMenu();
          return;
        }
        case 'view':
          this.offset = m.now - Date.now();
          if (Game.mode !== 'online') {
            if (Game.mode === 'local') return;                       // 싱글 플레이 중에는 끼어들지 않음
            if (!(curScreen === 'room' || this.joining || SS.get('gw-screen') === 'online-game')) return;
            Game.enter('online'); this.joining = false;
          }
          Game.setView(m.view); return;
        case 'left':
          this.room = null; this.roomId = null;
          if (m.kicked) toast('방장이 방에서 내보냈습니다.', 'err');
          if (Game.mode === 'online') Game.exit();
          if (curScreen === 'room') { show('menu'); renderMenu(); }
          return;
        case 'err': toast(m.msg, 'err'); return;
        case 'toast': toast(m.msg); return;
      }
    },
  };
  function netbar(msg, ok) { const b = $('netbar'); if (!msg) { b.hidden = true; return; } b.textContent = msg; b.className = 'netbar' + (ok ? ' ok' : ''); b.hidden = false; }
  function needServer(after) {
    if (!serverUrl()) {
      openModal(mh('온라인 서버가 필요해요') + `<p>온라인 멀티플레이는 게임 상태를 검증하는 <b>게임 서버</b>에서 진행돼요. 지금 페이지는 서버 없이 열려 있어요.</p>
        <ul class="muted"><li>서버에서 연 주소(예: <code>https://내서버/galactic-war/</code>)로 접속하거나</li><li><b>설정 → 서버 주소</b>에 서버 주소를 입력하세요. (예: <code>board-game-party.onrender.com</code>)</li></ul>
        <p class="muted small">싱글 플레이는 서버 없이 바로 할 수 있어요.</p><div class="row"><button class="btn pri" data-a="go" data-s="settings">설정 열기</button><button class="btn" data-a="go" data-s="single">싱글 플레이</button></div>`, { cls: 'narrow' });
      return false;
    }
    Net.connect();
    if (Net.authed) { after(); return true; }
    netbar('서버에 연결하는 중…', true);
    Net.wantRoom = () => { netbar(null); after(); };
    return true;
  }

  /* ===================================================================
     싱글 플레이 (브라우저 안의 로컬 서버)
     =================================================================== */
  const Local = {
    s: null, me: 'me', timer: null,
    start(cfg, empire, ai) {
      const players = [{ pid: 'me', name: empire.name, empire: empire.empire, color: empire.color, emblem: empire.emblem, bot: false }];
      const aiNames = [['오메가', '오메가 연합'], ['네메시스', '네메시스 군단'], ['헬리오스', '헬리오스 왕조']];
      const colors = GW.COLORS.filter(c => c !== empire.color), embs = GW.EMBLEMS.filter(e => e !== empire.emblem);
      for (let i = 0; i < ai; i++) players.push({ pid: 'ai' + i, name: aiNames[i][0] + ' AI', empire: aiNames[i][1], color: colors[i], emblem: embs[i + 2], bot: true });
      this.s = GW.newGame(Object.assign({ name: '싱글 플레이' }, cfg), players);
      this.save(); Game.enter('local'); this.refresh(); this.pump();
    },
    resume() {
      const s = LS.get('gw-single'); if (!s || !s.players || !s.players.me) return false;
      this.s = s; Game.enter('local'); this.refresh(); this.pump(); return true;
    },
    save() { if (!this.s) return; if (!LS.set('gw-single', this.s)) toast('브라우저 저장 공간이 부족해 저장하지 못했어요.', 'err'); },
    refresh() { Game.setView(GW.view(this.s, this.me)); },
    act(a) {
      const r = GW.act(this.s, this.me, a);
      if (r.ok) { this.s = r.state; this.save(); this.refresh(); this.pump(); }
      else if (r.crash) console.error(r.err);
      return Promise.resolve(r);
    },
    pump() {
      clearTimeout(this.timer);
      const s = this.s; if (!s || s.phase !== 'playing') { if (s && s.phase === 'ended') this.record(); return; }
      const pid = s.order[s.turnIdx];
      if (!s.players[pid].bot) return;
      const delay = { fast: 250, normal: 800, slow: 1600 }[CFG.aiSpeed] || 800;
      this.timer = setTimeout(() => {
        if (Game.mode !== 'local' || this.s !== s) return;
        try { this.s = GW.aiPlay(s, pid); if (this.s.order[this.s.turnIdx] === pid && this.s.round === s.round && this.s.phase === 'playing') this.s = GW.forceEndTurn(this.s); }
        catch (e) { console.error(e); toast('AI 처리 중 오류 — 턴을 넘겨 복구했어요.', 'err'); this.s = GW.forceEndTurn(s); }
        this.save(); this.refresh(); this.pump();
      }, delay);
    },
    record() {
      const s = this.s; if (!s || s.recorded) return;
      s.recorded = true; this.save();
      const recs = LS.get('gw-records', []);
      recs.unshift({ id: s.id, room: '싱글 플레이', mode: 'single', endedAt: Date.now(), rounds: s.round, map: s.settings.mapSize, winner: s.winner, winnerName: s.players[s.winner] ? s.players[s.winner].empire : '?', reason: s.winReason, players: s.final, me: 'me' });
      LS.set('gw-records', recs.slice(0, 50));
    },
  };

  /* ===================================================================
     게임 컨트롤러 (온라인/싱글 공통)
     =================================================================== */
  const Game = {
    mode: null, V: null, gid: null, sel: null, selFleet: null, moving: null, seen: new Set(), lastTurnKey: null, lastEventKey: null, endedShown: false,
    enter(mode) {
      this.mode = mode; this.V = null; this.gid = null; this.sel = null; this.moving = null; this.endedShown = false;
      show('game'); if (mode === 'online') SS.set('gw-screen', 'online-game');
    },
    exit() { this.mode = null; this.V = null; clearTimeout(Local.timer); closeModal(); show('menu'); renderMenu(); },
    act(a) { return this.mode === 'local' ? Local.act(a) : Net.request({ t: 'act', a }).then(r => r.ok ? { ok: true, info: r.info } : { ok: false, err: r.err }); },
    me() { return this.V && this.V.players[this.V.me]; },
    myTurn() { const V = this.V; return !!V && V.phase === 'playing' && V.order[V.turnIdx] === V.me; },
    setView(v) {
      const first = this.gid !== v.id;
      if (first) { this.gid = v.id; this.seen = new Set(v.battles.map(b => b.id)); this.lastEventKey = v.lastEvent ? v.lastEvent.round + v.lastEvent.key : null; this.lastTurnKey = null; this.endedShown = false; }
      this.V = v;
      if (this.selFleet && !v.fleets.some(f => f.id === this.selFleet)) this.selFleet = null;
      if (this.moving && !v.fleets.some(f => f.id === this.moving && f.owner === v.me)) this.moving = null;
      try { renderGame(first); } catch (e) { console.error(e); toast('화면 그리기 오류: ' + e.message, 'err'); }
      // 알림: 새 전투, 우주 이벤트, 내 차례, 게임 종료
      for (const b of v.battles) if (!this.seen.has(b.id)) { this.seen.add(b.id); if (b.attacker === v.me || b.defender === v.me) { const bb = b; popup(() => showBattle(bb)); } }
      if (v.lastEvent && v.lastEvent.round + v.lastEvent.key !== this.lastEventKey) { this.lastEventKey = v.lastEvent.round + v.lastEvent.key; const ev = v.lastEvent; popup(() => showEvent(ev)); }
      const tk = v.round + ':' + v.turnIdx;
      if (tk !== this.lastTurnKey) {
        this.lastTurnKey = tk;
        if (this.myTurn()) banner('당신의 차례입니다', `라운드 ${v.round} · 자원 생산과 연구가 진행되었습니다`);
        else if (!first && v.phase === 'playing') { const p = v.players[v.order[v.turnIdx]]; if (p) toast(`${p.empire}의 차례`); }
      }
      if (v.phase === 'ended' && !this.endedShown) { this.endedShown = true; popup(() => showGameOver()); }
      refreshModal();
    },
  };
  function banner(t, sub) { const b = $('turnbanner'); b.innerHTML = esc(t) + (sub ? `<small>${esc(sub)}</small>` : ''); b.hidden = false; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; clearTimeout(b._t); b._t = setTimeout(() => { b.hidden = true; }, 2300); }

  /* 행동 실행: 확인 창 → 요청 → 결과 */
  async function doAct(a, title, body, okText, kind) {
    if (title && !(await confirmBox(title, body, okText, kind))) return null;
    const r = await Game.act(a);
    if (!r.ok) { toast(r.err || '실패했습니다', 'err'); return null; }
    const info = r.info || {};
    if (info.battle) { Game.seen.add(info.battle.id); popup(() => showBattle(info.battle)); }
    if (info.survey) popup(() => showSurvey(info.survey));
    return info;
  }

  /* ===================================================================
     메뉴 / 로비 화면
     =================================================================== */
  function renderMenu() {
    const single = LS.get('gw-single');
    const canResume = single && single.phase === 'playing';
    const onlineGame = Net.roomId && Net.roomStatus === 'playing';
    $('scr-menu').innerHTML = `<div class="wrap">
      <div class="hero"><div class="k">ONLINE SPACE STRATEGY</div><h1>GALACTIC WAR</h1><p>육각형 은하에서 최대 4개 제국이 패권을 다투는 턴제 우주 전략 보드게임</p></div>
      ${onlineGame ? `<div class="banner"><span class="grow">🛰 진행 중인 온라인 게임이 있어요.</span><button class="btn pri sm" data-a="rejoin">재접속</button></div>` : ''}
      ${Net.roomId && Net.roomStatus === 'lobby' ? `<div class="banner"><span class="grow">대기 중인 방에 참가해 있어요.</span><button class="btn pri sm" data-a="rejoin">방으로 돌아가기</button></div>` : ''}
      ${canResume ? `<div class="banner"><span class="grow">💾 저장된 싱글 플레이 (라운드 ${single.round})</span><button class="btn pri sm" data-a="resumeSingle">이어하기</button></div>` : ''}
      <div class="menu">
        <button class="btn pri" data-a="quick">⚡ 빠른 게임<small>공개 방에 바로 참가</small></button>
        <button class="btn" data-a="go" data-s="create">🛠 방 만들기<small>규칙을 정하고 친구 초대</small></button>
        <button class="btn" data-a="go" data-s="rooms">📡 방 참가하기<small>방 목록 / 코드로 참가</small></button>
        <button class="btn teal" data-a="go" data-s="single">🤖 싱글 플레이<small>AI 제국과 대결 (서버 불필요)</small></button>
        <button class="btn" data-a="go" data-s="codex">📖 제국 도감<small>행성·건물·함선·기술</small></button>
        <button class="btn" data-a="go" data-s="records">🏆 게임 기록<small>지난 전쟁의 결과</small></button>
        <button class="btn" data-a="go" data-s="settings">⚙ 설정<small>이름, 제국, 서버</small></button>
        <button class="btn vio" data-a="rules">📜 게임 규칙<small>처음이라면 꼭 읽어 보세요</small></button>
      </div>
      <p class="muted small" style="text-align:center;margin-top:22px">사령관: <b>${esc(myName())}</b> · ${esc(myEmpire().empire)} ${crest({ color: CFG.color, emblem: CFG.emblem })}
      · 서버: ${serverUrl() ? (Net.authed ? '<span class="green">연결됨</span>' : '<span class="muted">대기</span>') : '<span class="dim">없음 (싱글 플레이만 가능)</span>'}</p>
    </div>`;
  }

  /* 제국 꾸미기 컴포넌트 */
  function empirePicker(prefix, val, taken) {
    taken = taken || [];
    return `<div class="field"><label>사령관 이름</label><input type="text" id="${prefix}-name" maxlength="16" value="${esc(val.name)}"></div>
      <div class="field"><label>제국 이름</label><input type="text" id="${prefix}-empire" maxlength="20" value="${esc(val.empire)}"></div>
      <div class="field"><label>제국 색상</label><div class="swatches" id="${prefix}-colors">${GW.COLORS.map(c => `<button type="button" class="swatch ${c === val.color ? 'on' : ''} ${taken.includes(c) && c !== val.color ? 'taken' : ''}" style="background:${c}" data-a="pickColor" data-p="${prefix}" data-v="${c}" aria-label="색 ${c}"></button>`).join('')}</div></div>
      <div class="field"><label>문장</label><div class="emblems" id="${prefix}-embs">${GW.EMBLEMS.map(e => `<button type="button" class="emb ${e === val.emblem ? 'on' : ''}" data-a="pickEmb" data-p="${prefix}" data-v="${e}">${e}</button>`).join('')}</div></div>`;
  }
  function readEmpire(prefix) {
    const c = document.querySelector(`#${prefix}-colors .on`), e = document.querySelector(`#${prefix}-embs .on`);
    const name = ($(prefix + '-name').value || '').trim().slice(0, 16) || '사령관';
    return { name, empire: ($(prefix + '-empire').value || '').trim().slice(0, 20) || name + ' 제국', color: c ? c.dataset.v : GW.COLORS[0], emblem: e ? e.dataset.v : GW.EMBLEMS[0] };
  }
  const segHtml = (id, opts, cur) => `<div class="seg" id="${id}">${opts.map(([v, l]) => `<button type="button" class="${String(v) === String(cur) ? 'on' : ''}" data-a="seg" data-v="${v}">${l}</button>`).join('')}</div>`;
  const segVal = id => { const b = document.querySelector(`#${id} .on`); return b ? b.dataset.v : null; };
  function settingsForm(prefix, S, disabled) {
    const V = S.victory;
    const dis = disabled ? 'disabled' : '';
    return `<div class="field"><label>맵 크기</label>${segHtml(prefix + '-map', Object.entries(GW.MAP_SIZES).map(([k, m]) => [k, `${m.ko} (${m.w * m.h}칸)`]), S.mapSize)}</div>
      <div class="field"><label>게임 속도 (턴 제한 시간)</label>${segHtml(prefix + '-speed', Object.entries(GW.SPEEDS).map(([k, m]) => [k, `${m.ko}${m.turnTime ? ' ' + m.turnTime + '초' : ''}`]), S.speed)}</div>
      <div class="field"><label>승리 조건</label>
        <label class="row"><input type="checkbox" id="${prefix}-vc" ${V.conquest ? 'checked' : ''} ${dis}> 정복 승리: 전체 행성의 <select id="${prefix}-vcp" style="width:auto" ${dis}>${[40, 50, 60, 75].map(n => `<option ${n === V.conquestPct ? 'selected' : ''}>${n}</option>`).join('')}</select>% 점령</label>
        <label class="row"><input type="checkbox" id="${prefix}-ve" ${V.economy ? 'checked' : ''} ${dis}> 경제 승리: 총자산 <select id="${prefix}-vet" style="width:auto" ${dis}>${[4000, 6000, 8000, 12000].map(n => `<option ${n === V.economyTarget ? 'selected' : ''}>${n}</option>`).join('')}</select> 달성</label>
        <label class="row"><input type="checkbox" id="${prefix}-vs" ${V.science ? 'checked' : ''} ${dis}> 과학 승리: 최종 기술 [은하 초월] 완성</label>
        <label class="row"><input type="checkbox" checked disabled> 제국 승리: <select id="${prefix}-vr" style="width:auto" ${dis}>${[20, 30, 40, 60, 80].map(n => `<option ${n === V.roundLimit ? 'selected' : ''}>${n}</option>`).join('')}</select> 라운드 종료 시 최고 점수 (항상 적용)</label>
      </div>`;
  }
  function readSettings(prefix) {
    return {
      mapSize: segVal(prefix + '-map') || 'medium', speed: segVal(prefix + '-speed') || 'normal',
      victory: {
        conquest: $(prefix + '-vc').checked, conquestPct: +$(prefix + '-vcp').value, economy: $(prefix + '-ve').checked, economyTarget: +$(prefix + '-vet').value,
        science: $(prefix + '-vs').checked, empire: true, roundLimit: +$(prefix + '-vr').value,
      },
    };
  }
  const DEF_SETTINGS = { mapSize: 'medium', speed: 'normal', victory: { conquest: true, conquestPct: 60, economy: true, economyTarget: 6000, science: true, empire: true, roundLimit: 40 } };

  function renderCreate() {
    $('scr-create').innerHTML = `<div class="wrap"><div class="backbar"><button class="btn sm" data-a="go" data-s="menu">← 로비</button><h2>방 만들기</h2></div>
      <div class="grid2"><div class="card">
        <div class="field"><label>방 이름</label><input type="text" id="c-room" maxlength="24" value="${esc(myName())}의 은하"></div>
        <div class="field"><label>최대 인원</label>${segHtml('c-max', [[2, '2명'], [3, '3명'], [4, '4명']], 4)}</div>
        <div class="field"><label>공개 설정</label>${segHtml('c-pub', [['1', '공개방'], ['0', '비공개방']], '1')}</div>
        <div class="field"><label>비밀번호 (선택)</label><input type="password" id="c-pw" maxlength="32" placeholder="비워 두면 누구나 참가" autocomplete="new-password"></div>
        ${settingsForm('c', DEF_SETTINGS)}
      </div><div class="card"><h3>내 제국</h3>${empirePicker('ce', myEmpire())}
        <button class="btn pri block" data-a="createRoom">방 만들기 →</button>
        <p class="muted small">방을 만든 사람이 방장이 되어 설정을 바꾸고 게임을 시작할 수 있어요. 빈자리는 AI 제국으로 채울 수 있어요.</p></div></div></div>`;
  }

  function renderRooms() {
    const list = Net.rooms || [];
    $('scr-rooms').innerHTML = `<div class="wrap"><div class="backbar"><button class="btn sm" data-a="go" data-s="menu">← 로비</button><h2 class="grow">방 참가하기</h2><button class="btn sm" data-a="refreshRooms">↻ 새로고침</button></div>
      <div class="card tight row" style="margin-bottom:14px"><input type="text" id="j-code" placeholder="방 코드 (예: K7Q2M)" maxlength="8" style="max-width:200px;text-transform:uppercase"><button class="btn teal" data-a="joinCode">코드로 참가</button><span class="muted small">비공개방은 코드로만 참가할 수 있어요.</span></div>
      ${!Net.authed ? '<p class="muted">서버에 연결하는 중…</p>' : list.filter(r => r.isPublic || r.members.some(m => m.pid === ME_ID)).length === 0 ? '<div class="card"><p class="muted" style="margin:0">열려 있는 방이 없어요. 방을 만들거나 빠른 게임을 눌러 보세요.</p></div>' : ''}
      ${list.filter(r => r.isPublic || r.members.some(m => m.pid === ME_ID)).map(r => {
        const mine = r.members.some(m => m.pid === ME_ID);
        const can = mine || (r.status === 'lobby' && r.count < r.max);
        return `<div class="roomrow"><div><div class="row"><b>${esc(r.name)}</b>${r.locked ? '<span class="badge gold">🔒 비밀번호</span>' : ''}${r.status === 'lobby' ? '<span class="badge teal">대기 중</span>' : `<span class="badge red">게임 중 · R${r.round}</span>`}</div>
          <div class="muted small">방장 ${esc(r.hostName)} · 참가 ${r.count}/${r.max} · 맵 ${GW.MAP_SIZES[r.settings.mapSize].ko} · ${GW.SPEEDS[r.settings.speed].ko} · 코드 ${r.id}</div>
          <div class="row" style="margin-top:4px">${r.members.map(m => crest(m)).join('')}</div></div>
          <button class="btn ${can ? 'pri' : ''}" ${can ? '' : 'disabled'} data-a="joinRoom" data-id="${r.id}" data-locked="${r.locked && !mine ? 1 : 0}">${mine ? '돌아가기' : r.status !== 'lobby' ? '진행 중' : r.count >= r.max ? '가득 참' : '참가'}</button></div>`;
      }).join('')}</div>`;
  }

  function renderRoom() {
    const r = Net.room; if (!r) { $('scr-room').innerHTML = '<div class="wrap"><p>방 정보를 불러오는 중…</p></div>'; return; }
    const host = r.host === ME_ID, me = r.members.find(m => m.pid === ME_ID) || {};
    const chatEl = $('room-chat'), atBottom = !chatEl || chatEl.scrollTop + chatEl.clientHeight >= chatEl.scrollHeight - 10;
    const typing = $('room-msg') ? $('room-msg').value : '';
    const link = location.origin + location.pathname + '?room=' + r.id;
    $('scr-room').innerHTML = `<div class="wrap"><div class="backbar"><button class="btn sm" data-a="leaveRoom">← 나가기</button><h2 class="grow">${esc(r.name)}</h2><span class="badge gold">코드 ${r.id}</span></div>
      <div class="grid2"><div class="col">
        <div class="card"><div class="row"><h3 class="grow" style="margin:0">참가자 ${r.members.length}/${r.max}</h3>${host && r.members.length < r.max ? '<button class="btn sm teal" data-a="addBot">＋ AI 추가</button>' : ''}</div><div class="spacer"></div>
          ${r.members.map(m => `<div class="member">${crest(m, true)}<div class="grow"><b>${esc(m.empire)}</b> ${m.pid === r.host ? '<span class="badge gold">👑 방장</span>' : ''} ${m.bot ? '<span class="badge vio">AI</span>' : ''}<div class="muted small">${esc(m.name)} ${m.bot ? '' : `<span class="dot ${m.online ? '' : 'off'}"></span> ${m.online ? '접속 중' : '오프라인'}`}</div></div>
            ${host && m.pid !== ME_ID ? `<button class="btn xs danger" data-a="kick" data-pid="${m.pid}">내보내기</button>` : ''}</div>`).join('')}
          ${[...Array(Math.max(0, r.max - r.members.length))].map(() => '<div class="member dim">빈 자리 — 다른 플레이어를 기다리는 중</div>').join('')}
          <div class="row"><input type="text" readonly value="${esc(link)}" id="room-link" style="flex:1;min-width:0"><button class="btn sm" data-a="copyLink">초대 링크 복사</button></div>
        </div>
        <div class="card"><h3>채팅</h3><div class="chatbox" id="room-chat">${(r.chat || []).map(c => c.from ? `<div><b style="color:${esc(c.color)}">${esc(c.name)}</b>: ${esc(c.text)}</div>` : `<div class="sys">${esc(c.text)}</div>`).join('')}</div>
          <div class="row" style="margin-top:8px"><input type="text" id="room-msg" maxlength="200" placeholder="메시지 입력" style="flex:1;min-width:0"><button class="btn sm" data-a="roomChat">보내기</button></div></div>
      </div><div class="col">
        <div class="card"><h3>게임 설정 ${host ? '' : '<span class="muted small">(방장만 변경 가능)</span>'}</h3>
          ${host ? `<div class="field"><label>방 이름</label><input type="text" id="r-room" maxlength="24" value="${esc(r.name)}"></div>
            <div class="field"><label>최대 인원</label>${segHtml('r-max', [[2, '2명'], [3, '3명'], [4, '4명']], r.max)}</div>
            <div class="field"><label>공개 설정</label>${segHtml('r-pub', [['1', '공개방'], ['0', '비공개방']], r.isPublic ? '1' : '0')}</div>
            <div class="field"><label>비밀번호 ${r.locked ? '(설정됨)' : ''}</label><input type="password" id="r-pw" maxlength="32" placeholder="${r.locked ? '바꾸려면 입력, 지우려면 공백 하나' : '비워 두면 없음'}" autocomplete="new-password"></div>
            ${settingsForm('r', r.settings)}<button class="btn sm" data-a="saveRoomSettings">설정 저장</button>`
            : `<div class="kv"><span>맵</span><b>${GW.MAP_SIZES[r.settings.mapSize].ko}</b><span>속도</span><b>${GW.SPEEDS[r.settings.speed].ko}</b><span>공개</span><b>${r.isPublic ? '공개' : '비공개'}${r.locked ? ' · 🔒' : ''}</b>
              <span>승리</span><b>${victoryText(r.settings.victory)}</b></div>`}
        </div>
        <div class="card"><h3>내 제국</h3>${empirePicker('re', { name: me.name || myName(), empire: me.empire || '', color: me.color || CFG.color, emblem: me.emblem || CFG.emblem }, r.members.filter(m => m.pid !== ME_ID).map(m => m.color))}<button class="btn sm" data-a="saveEmpire">제국 정보 저장</button></div>
        ${host ? `<button class="btn pri block" data-a="startGame" ${r.members.length < 2 ? 'disabled' : ''}>🚀 게임 시작</button>${r.members.length < 2 ? '<p class="muted small">2명 이상(AI 포함)이 있어야 시작할 수 있어요.</p>' : ''}` : '<p class="muted" style="text-align:center">방장이 게임을 시작하기를 기다리는 중…</p>'}
      </div></div></div>`;
    const ce = $('room-chat'); if (ce && atBottom) ce.scrollTop = ce.scrollHeight;
    if (typing && $('room-msg')) $('room-msg').value = typing;
  }
  function victoryText(V) {
    const a = [];
    if (V.conquest) a.push(`정복 ${V.conquestPct}%`); if (V.economy) a.push(`경제 ${fmt(V.economyTarget)}`); if (V.science) a.push('과학'); a.push(`제국 ${V.roundLimit}R`);
    return a.join(' · ');
  }

  function renderSingle() {
    $('scr-single').innerHTML = `<div class="wrap"><div class="backbar"><button class="btn sm" data-a="go" data-s="menu">← 로비</button><h2>싱글 플레이</h2></div>
      <div class="grid2"><div class="card">
        <div class="field"><label>AI 제국 수</label>${segHtml('s-ai', [[1, '1개'], [2, '2개'], [3, '3개']], 3)}</div>
        ${settingsForm('s', Object.assign({}, DEF_SETTINGS, { speed: 'free' }))}
        <p class="muted small">싱글 플레이에서는 턴 시간 제한이 없어요. 속도가 '빠름'이면 시작 자원이 1.5배예요. 진행 상황은 이 브라우저에 자동 저장돼요.</p>
      </div><div class="card"><h3>내 제국</h3>${empirePicker('se', myEmpire())}
        <button class="btn pri block" data-a="startSingle">🚀 전쟁 시작</button></div></div></div>`;
  }

  /* ---------- 제국 도감 ---------- */
  let codexTab = 'planets';
  function renderCodex() {
    const tabs = [['planets', '행성·지형'], ['grades', '행성 등급'], ['buildings', '건물'], ['ships', '함선'], ['techs', '기술'], ['events', '우주 이벤트'], ['empires', '제국 문장']];
    let body = '';
    if (codexTab === 'planets') body = `<div class="codexgrid">${Object.entries(GW.TYPES).map(([k, T]) => `<div class="card tight"><div class="row"><span class="planetball" style="width:30px;height:30px;background:${T.color};color:${T.color}"></span><b>${T.ko}</b></div>
      <p class="small muted">${T.desc}</p>${T.prod ? `<div class="small">기본 생산: ${GW.RES.filter(r => T.prod[r]).map(r => `${GW.RES_ICON[r]}${T.prod[r]}`).join(' ')}${T.rp ? ` · 연구 +${T.rp}` : ''}</div><div class="small muted">최대 인구: 크기 × ${T.pop}</div>` : ''}</div>`).join('')}</div>
      <h3 style="margin-top:14px">특수 자원</h3><div class="codexgrid">${Object.values(GW.SPECIALS).map(S => `<div class="card tight"><b>${S.ko}</b><div class="small">${Object.entries(S.prod).map(([r, v]) => `${GW.RES_KO[r]} +${v}`).join(', ')}</div></div>`).join('')}</div>`;
    if (codexTab === 'grades') body = `<table class="t"><tr><th>등급</th><th>생산 배율</th><th>특수 자원 확률</th><th>추가 크리스탈</th></tr>${GW.GRADES.map((g, i) => `<tr><td>${gradeBadge(i)}</td><td>×${g.mult}</td><td>${[5, 15, 30, 50, 80][i]}%</td><td>${i >= 2 ? '+' + (i - 1) : '-'}</td></tr>`).join('')}</table><p class="muted small">행성 크기(1~3)는 생산량, 최대 인구, 건설 슬롯(크기+1, 수도 +1)을 결정해요.</p>`;
    if (codexTab === 'buildings') body = Object.entries(GW.BCAT_KO).map(([c, ko]) => `<h3>${ko}</h3><div class="codexgrid">${Object.entries(GW.BUILDINGS).filter(([, B]) => B.cat === c).map(([, B]) => `<div class="card tight"><b>${B.icon} ${B.ko}</b><p class="small muted" style="margin:4px 0">${B.desc}</p><div class="small">1단계 비용: ${costHtml(B.cost)}</div><div class="small dim">n단계 비용 = 1단계 × n · 최대 3단계</div></div>`).join('')}</div>`).join('');
    if (codexTab === 'ships') body = `<div style="overflow:auto"><table class="t shiptbl"><tr><th>함선</th><th>공격</th><th>방어(체력)</th><th>이동</th><th>조선소</th><th>생산 비용</th><th>유지비</th></tr>${GW.SHIP_ORDER.map(k => { const S = GW.SHIPS[k]; return `<tr><td>${S.icon} <b>${S.ko}</b><div class="tiny muted">${S.desc}</div></td><td>${S.atk}</td><td>${S.hp}</td><td>${S.move}</td><td>${S.yard}단계</td><td>${costHtml(S.cost)}</td><td>◎${S.upkeep}/턴</td></tr>`; }).join('')}</table></div>`;
    if (codexTab === 'techs') body = Object.entries(GW.TECH_FIELDS).map(([f, ko]) => `<h3>${ko}</h3><div class="codexgrid">${Object.entries(GW.TECHS).filter(([, T]) => T.field === f).map(([, T]) => `<div class="card tight"><b>${T.ko}</b><p class="small muted" style="margin:4px 0">${T.desc}</p><div class="small">연구 점수 ${T.rp} · 비용 ${costHtml(T.cost)}</div>${T.req.length ? `<div class="tiny dim">선행: ${T.req.map(r => GW.TECHS[r].ko).join(', ')}</div>` : ''}</div>`).join('')}</div>`).join('');
    if (codexTab === 'events') body = `<div class="codexgrid">${Object.values(GW.EVENTS).map(E => `<div class="card tight"><b>${E.ko}</b><p class="small muted" style="margin:4px 0">${E.desc}</p></div>`).join('')}</div><p class="muted small">매 라운드 시작 시 30% 확률로 은하 전체에 이벤트가 일어나요.</p>`;
    if (codexTab === 'empires') body = `<p class="muted">제국마다 고유한 색상과 문장을 골라 지도 위 영토와 함대에 표시해요.</p><div class="row">${GW.COLORS.map((c, i) => crest({ color: c, emblem: GW.EMBLEMS[i] }, true)).join('')}</div><div class="spacer"></div>
      <div class="card tight"><b>수도 행성</b><p class="small muted" style="margin:4px 0">게임 시작 시 수도(일반 행성, 크기 3, 고급)와 조선소·광산, 정찰선·전투기·호위함·수송선을 받아요. 수도는 모든 자원 +4, 연구 +5, 방어력 40, 시야 +1, 슬롯 +1. 수도를 잃으면 모든 생산 -30%, 연구 -50%이고, 크레딧 200·금속 100으로 다른 행성에 새 수도를 세울 수 있어요.</p></div>`;
    $('scr-codex').innerHTML = `<div class="wrap"><div class="backbar"><button class="btn sm" data-a="go" data-s="menu">← 로비</button><h2>제국 도감</h2></div>
      <div class="tabs">${tabs.map(([k, l]) => `<button class="${k === codexTab ? 'on' : ''}" data-a="codexTab" data-v="${k}">${l}</button>`).join('')}</div>${body}</div>`;
  }

  /* ---------- 기록 ---------- */
  function renderRecords() {
    const local = LS.get('gw-records', []);
    const row = (r, me) => `<div class="roomrow"><div><div class="row"><b>${esc(r.room)}</b><span class="badge ${r.mode === 'single' ? 'teal' : 'vio'}">${r.mode === 'single' ? '싱글' : '온라인'}</span><span class="muted small">${new Date(r.endedAt).toLocaleString('ko-KR')}</span></div>
      <div class="small">🏆 <b class="gold">${esc(r.winnerName)}</b> — ${esc(r.reason)} · ${r.rounds}라운드 · ${GW.MAP_SIZES[r.map] ? GW.MAP_SIZES[r.map].ko : ''}</div>
      <div class="row small" style="margin-top:4px">${(r.players || []).map((p, i) => `<span class="badge" style="${p.pid === me ? 'outline:1px solid var(--gold)' : ''}">${i + 1}위 ${esc(p.emblem)} ${esc(p.empire)} ${p.score}점</span>`).join('')}</div></div></div>`;
    $('scr-records').innerHTML = `<div class="wrap"><div class="backbar"><button class="btn sm" data-a="go" data-s="menu">← 로비</button><h2>게임 기록</h2></div>
      <h3>이 기기의 싱글 플레이</h3>${local.length ? local.map(r => row(r, 'me')).join('') : '<p class="muted">아직 기록이 없어요.</p>'}
      <h3 style="margin-top:18px">온라인 게임 (서버)</h3>${!serverUrl() ? '<p class="muted">서버에 연결되어 있지 않아요.</p>' : !Net.authed ? '<p class="muted">서버에 연결하는 중…</p>' : (Net.records || []).length ? Net.records.map(r => row(r, ME_ID)).join('') : '<p class="muted">아직 기록이 없어요.</p>'}</div>`;
  }

  /* ---------- 설정 ---------- */
  function renderSettings() {
    $('scr-settings').innerHTML = `<div class="wrap"><div class="backbar"><button class="btn sm" data-a="go" data-s="menu">← 로비</button><h2>설정</h2></div>
      <div class="grid2"><div class="card"><h3>기본 제국</h3>${empirePicker('st', myEmpire())}</div>
      <div class="card"><h3>온라인 서버</h3><div class="field"><label>서버 주소</label><input type="url" id="st-server" value="${esc(CFG.server)}" placeholder="${location.host && !/github\.io$/.test(location.hostname) ? '비워 두면 이 사이트의 서버 사용' : '예: board-game-party.onrender.com'}"></div>
        <p class="muted small">현재 연결 대상: <code>${esc(serverUrl() || '없음')}</code></p>
        <h3>싱글 플레이 AI 진행 속도</h3>${segHtml('st-ai', [['fast', '빠름'], ['normal', '보통'], ['slow', '느림']], CFG.aiSpeed)}
        <div class="spacer"></div><button class="btn pri" data-a="saveSettings">설정 저장</button>
        <hr><h3>데이터</h3><p class="muted small">내 접속 ID: <code>${esc(ME_ID)}</code></p>
        <button class="btn danger sm" data-a="resetData">싱글 플레이 저장·기록 지우기</button></div></div></div>`;
  }

  /* ===================================================================
     게임 화면
     =================================================================== */
  const HR = 34, SQ = Math.sqrt(3);
  const hc = (x, y) => [HR * SQ * (x + 0.5 * (y & 1)) + HR * SQ / 2 + 10, HR * 1.5 * y + HR + 10];
  const hexPts = (cx, cy, r) => { const p = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); p.push((cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1)); } return p.join(' '); };
  const cam = { x: 0, y: 0, k: 1, fitted: null };

  function renderGame(first) {
    renderTop(); renderPhases(); renderLeft(); renderMap(first); renderRight(); renderBottom();
  }
  function renderTop() {
    const V = Game.V, me = Game.me(), cur = V.players[V.order[V.turnIdx]];
    const inc = (me && me.lastIncome) || {}, net = V.econ ? V.econ.net : {};
    $('top').innerHTML = `<button class="btn sm mobtoggle" data-a="drawer" data-d="left" aria-label="제국 패널">☰</button>
      <div class="res" data-a="econ" title="눌러서 생산·소비 보기" style="cursor:pointer">${me && me.res ? GW.RES.map(r => `<span class="resi"><span class="ic">${GW.RES_ICON[r]}</span>${fmt(me.res[r])}<span class="d ${net[r] >= 0 ? 'p' : 'n'}">${net[r] >= 0 ? '+' : ''}${fmt(net[r] || 0)}</span></span>`).join('') : ''}</div>
      <div class="topinfo">
        <span class="chip">라운드 <b>${V.round}</b>/${V.settings.victory.roundLimit}</span>
        <span class="chip ${Game.myTurn() ? 'now' : ''}">${crest(cur)} ${Game.myTurn() ? '<b>내 차례</b>' : esc(cur ? cur.empire : '')} <span class="timer" id="timer"></span></span>
        <span class="chip">점수 <b class="gold">${me ? me.score : 0}</b></span>
        <button class="btn sm" data-a="victory">🏆 승리</button>
        <button class="btn sm" data-a="gameMenu" aria-label="메뉴">⋯</button>
        <button class="btn sm mobtoggle" data-a="drawer" data-d="right" aria-label="정보 패널">ℹ</button>
      </div>`;
    void inc; tickTimer();
  }
  function tickTimer() {
    const el = $('timer'); const V = Game.V; if (!el || !V) return;
    if (V.phase !== 'playing' || !V.settings.turnTime || Game.mode === 'local') { el.textContent = ''; return; }
    const now = Date.now() + (Game.mode === 'online' ? Net.offset : 0);
    const left = Math.max(0, Math.ceil((V.turnStart + V.settings.turnTime * 1000 - now) / 1000));
    el.textContent = `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    el.style.color = left <= 15 ? 'var(--red)' : '';
  }
  setInterval(tickTimer, 1000);

  function renderPhases() {
    const me = Game.me(), f = (me && me.flags) || {}, mt = Game.myTurn();
    const steps = [['prod', '1 자원 생산'], ['research', '2 연구 진행'], ['build', '3 건설·업그레이드'], ['ship', '4 함선 생산'], ['move', '5 함대 이동·탐험'], ['dip', '6 외교·거래'], ['end', '7 턴 종료']];
    let curSet = false;
    $('phases').innerHTML = mt ? steps.map(([k, l]) => { const d = !!f[k]; let c = d ? 'done' : ''; if (!d && !curSet && k !== 'end') { c = 'cur'; curSet = true; } return `<span class="${c}">${d ? '✓ ' : ''}${l}</span>`; }).join('')
      : `<span>다른 제국의 차례입니다 — 지도와 정보를 살펴보고, 외교 제안에 응답하거나 메시지를 보낼 수 있어요.</span>`;
  }

  function renderLeft() {
    const V = Game.V, me = Game.me();
    const relOf = o => o === V.me ? 'self' : GW.rel(V, V.me, o);
    const pls = V.order.map(o => {
      const p = V.players[o], cur = V.order[V.turnIdx] === o && V.phase === 'playing';
      return `<div class="pl ${cur ? 'cur' : ''} ${p.alive ? '' : 'dead'}">${cur ? '<span class="turnmark">▶</span>' : ''}${crest(p)}<div class="grow" style="min-width:0"><div class="nm">${esc(p.empire)} ${o === V.me ? '<span class="badge gold">나</span>' : relBadge(relOf(o))}</div>
        <div class="sub">${esc(p.name)} ${p.bot ? '· AI' : `· <span class="dot ${p.connected ? '' : 'off'}"></span>`} · 행성 ${p.planets} · 점수 ${p.score}${p.alive ? '' : ' · ☠ 멸망'}</div></div>
        ${o !== V.me && p.alive ? `<button class="btn xs" data-a="dipWith" data-pid="${o}" title="외교">✉</button>` : ''}</div>`;
    }).join('');
    let info = '';
    if (me && me.res) {
      const R = me.research, T = R.cur ? GW.TECHS[R.cur] : null;
      info = `<h3>제국 정보</h3><div class="card tight"><div class="row" style="margin-bottom:6px">${crest(me, true)}<div><b>${esc(me.empire)}</b><div class="muted small">${esc(me.name)} 사령관</div></div></div>
        <div class="kv"><span>보유 행성</span><b>${me.planets}</b><span>점령 지역</span><b>${me.planets} / ${V.totalPlanets}</b><span>총 인구</span><b>${me.pop}</b><span>총 자원</span><b>${fmt(sum(me.res))}</b>
        <span>군사력</span><b>${fmt(me.military)}</b><span>연구 수준</span><b>${me.techs} / ${Object.keys(GW.TECHS).length}</b><span>연구 속도</span><b>${V.econ.rp}/턴</b><span>수도</span><b>${me.capital != null && me.capital >= 0 ? esc(V.tiles[me.capital].name) : '<span class="red">없음</span>'}</b></div>
        ${T ? `<div class="small" style="margin-top:6px">🔬 ${esc(T.ko)} ${Math.min(R.prog, T.rp)}/${T.rp}</div><div class="bar"><i style="width:${Math.min(100, R.prog / T.rp * 100)}%"></i></div>` : '<div class="small muted" style="margin-top:6px">진행 중인 연구 없음</div>'}</div>`;
    }
    const rels = V.order.filter(o => o !== V.me).map(o => `<div class="row small" style="justify-content:space-between"><span>${esc(V.players[o].emblem)} ${esc(V.players[o].empire)}</span>${relBadge(relOf(o))}</div>`).join('');
    const props = V.proposals.filter(p => p.to === V.me).length;
    const unread = V.messages.filter(m => m.from !== V.me).slice(-1)[0];
    $('left').innerHTML = `<h3>플레이어</h3>${pls}${info}
      <h3>외교 관계</h3><div class="card tight col">${rels || '<span class="muted small">-</span>'}${props ? `<button class="btn sm pri" data-a="dip">📨 받은 제안 ${props}건</button>` : ''}${unread ? `<div class="small muted">💬 ${esc(V.players[unread.from] ? V.players[unread.from].empire : '')}: ${esc(unread.text.slice(0, 40))}</div>` : ''}</div>
      <h3>최근 소식</h3><div class="loglist">${V.log.slice(-14).reverse().map(l => `<div><span class="r">R${l.r}</span>${esc(l.txt)}</div>`).join('')}</div>
      <div class="spacer"></div><button class="btn sm block" data-a="log">전체 기록 보기</button>`;
  }

  /* ---------- 지도 ---------- */
  function svgDefs() {
    const grads = Object.entries(GW.TYPES).filter(([, T]) => T.planet).map(([k, T]) => `<radialGradient id="pg-${k}" cx="35%" cy="32%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".22" stop-color="${T.color}"/><stop offset="1" stop-color="#050617"/></radialGradient>`).join('');
    return `<defs>${grads}
      <radialGradient id="bh" cx="50%" cy="50%" r="50%"><stop offset=".35" stop-color="#000"/><stop offset=".55" stop-color="#ff9b3d"/><stop offset=".7" stop-color="#7a2bd1" stop-opacity=".6"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      <radialGradient id="neb" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#c46bff" stop-opacity=".55"/><stop offset=".6" stop-color="#5a2bb0" stop-opacity=".3"/><stop offset="1" stop-color="#2a1060" stop-opacity="0"/></radialGradient>
      <pattern id="fog" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#04051a"/><circle cx="3" cy="4" r=".7" fill="#1f2766"/><circle cx="10" cy="10" r=".6" fill="#1a2058"/></pattern>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>`;
  }
  function renderMap(first) {
    const V = Game.V, svg = $('map');
    const fleetsBy = {};
    for (const f of V.fleets) (fleetsBy[f.tile] = fleetsBy[f.tile] || []).push(f);
    const reach = Game.moving ? GW.reachable(V, V.me, V.fleets.find(f => f.id === Game.moving)) : null;
    const recentBattle = new Set(V.battles.filter(b => b.round >= V.round - 0).map(b => b.tile));
    let out = '';
    for (const t of V.tiles) {
      const [cx, cy] = hc(t.x, t.y);
      let g = `<g class="hex" data-id="${t.id}">`;
      g += `<polygon class="hexbase" points="${hexPts(cx, cy, HR - 0.5)}" fill="${t.fog ? 'url(#fog)' : '#0a1030'}"/>`;
      if (t.fog) { g += `<text x="${cx}" y="${cy + 4}" class="lbl-name" style="fill:#2b3577;font-size:12px">?</text></g>`; out += g; continue; }
      const owner = t.owner && V.players[t.owner];
      if (owner) g += `<polygon points="${hexPts(cx, cy, HR - 3)}" fill="${owner.color}" fill-opacity=".16" stroke="${owner.color}" stroke-width="2.2" stroke-opacity=".9"/>`;
      const T = GW.TYPES[t.type];
      if (t.type === 'nebula') g += `<ellipse cx="${cx}" cy="${cy}" rx="${HR * 0.85}" ry="${HR * 0.6}" fill="url(#neb)"/><ellipse cx="${cx + 6}" cy="${cy - 5}" rx="${HR * 0.5}" ry="${HR * 0.35}" fill="url(#neb)"/>`;
      else if (t.type === 'blackhole') g += `<circle cx="${cx}" cy="${cy}" r="${HR * 0.62}" fill="url(#bh)"/><circle cx="${cx}" cy="${cy}" r="${HR * 0.2}" fill="#000"/>`;
      else if (t.type === 'asteroid') { for (const [dx, dy, r] of [[-9, -5, 3.5], [4, -9, 2.6], [8, 3, 4], [-3, 6, 3], [-12, 6, 2], [12, -4, 1.8]]) g += `<circle cx="${cx + dx}" cy="${cy + dy - 2}" r="${r}" fill="#8d8a83" stroke="#4a4740" stroke-width=".8"/>`; }
      else if (t.type === 'empty') g += `<circle cx="${cx - 8}" cy="${cy - 6}" r=".9" fill="#5a63a0"/><circle cx="${cx + 7}" cy="${cy + 5}" r=".7" fill="#5a63a0"/>`;
      if (T.planet && t.type !== 'asteroid') {
        const r = 7 + t.size * 2.6 + (t.capital ? 1.5 : 0);
        if (t.grade >= 3) g += `<circle cx="${cx}" cy="${cy - 3}" r="${r + 3.5}" fill="none" stroke="${GW.GRADES[t.grade].color}" stroke-opacity=".7" stroke-width="1.2" filter="url(#glow)"/>`;
        g += `<circle cx="${cx}" cy="${cy - 3}" r="${r}" fill="url(#pg-${t.type})"/>`;
        if (t.type === 'gas') g += `<ellipse cx="${cx}" cy="${cy - 3}" rx="${r + 5}" ry="${r * 0.32}" fill="none" stroke="#e8c690" stroke-opacity=".6" stroke-width="1.3"/>`;
        if (t.type === 'ruins') g += `<text x="${cx}" y="${cy + 1}" class="lbl-name" style="font-size:10px;fill:#fff">☥</text>`;
      }
      if (t.capital) g += `<text x="${cx}" y="${cy - 3 - (7 + t.size * 2.6) - 3}" class="lbl-name" style="font-size:11px;fill:${owner ? owner.color : '#fff'}">★</text>`;
      if (T.planet || t.type === 'nebula' || t.type === 'blackhole') g += `<text x="${cx}" y="${cy + HR * 0.62}" class="lbl-name">${esc(shortName(t.name))}</text>`;
      if (t.garrison) g += `<text x="${cx - HR * 0.55}" y="${cy - HR * 0.35}" class="lbl-name" style="fill:#ff8a98;font-size:10px">⛨${t.garrison > 0 ? t.garrison : '?'}</text>`;
      if (!t.vis) g += `<polygon points="${hexPts(cx, cy, HR - 0.5)}" fill="#02030f" fill-opacity=".48" pointer-events="none"/>`;
      if (recentBattle.has(t.id)) g += `<text x="${cx + HR * 0.52}" y="${cy - HR * 0.35}" class="lbl-name" style="font-size:11px">⚔</text>`;
      const fl = fleetsBy[t.id] || [];
      const owners = [...new Set(fl.map(f => f.owner))];
      owners.forEach((o, i) => {
        const ships = fl.filter(f => f.owner === o).reduce((a, f) => a + GW.sumShips(f.ships), 0);
        const col = o === 'pirate' ? '#ff5a6e' : (V.players[o] ? V.players[o].color : '#aaa');
        const fx = cx + HR * 0.38 - i * 17, fy = cy + HR * 0.18;
        const sel = fl.some(f => f.id === Game.selFleet || f.id === Game.moving) && o === V.me;
        g += `<g transform="translate(${fx},${fy})"><path d="M-7,5 L0,-8 L7,5 L0,2 Z" fill="${col}" stroke="${sel ? '#fff' : '#05071a'}" stroke-width="${sel ? 1.6 : 1}"/>${o === 'pirate' ? '<text y="-10" class="lbl-fleet" style="font-size:8px">☠</text>' : ''}<circle cx="7" cy="5" r="5.5" fill="#05071a" stroke="${col}"/><text x="7" y="8" class="lbl-fleet" style="font-size:7.5px">${ships}</text></g>`;
      });
      if (Game.sel === t.id) g += `<polygon points="${hexPts(cx, cy, HR - 1.5)}" fill="none" stroke="var(--gold)" stroke-width="2.6" filter="url(#glow)" pointer-events="none"/>`;
      g += '</g>'; out += g;
    }
    // 이동 범위 표시
    let ov = '';
    if (reach) for (const [id, c] of Object.entries(reach)) {
      const t = V.tiles[id], [cx, cy] = hc(t.x, t.y);
      const hostile = GW.hostileFleetsAt(V, V.me, +id).length > 0;
      ov += `<g class="hex" data-id="${id}"><polygon points="${hexPts(cx, cy, HR - 4)}" fill="${hostile ? '#ff5a6e' : '#35d0c8'}" fill-opacity=".22" stroke="${hostile ? '#ff5a6e' : '#7af0e9'}" stroke-width="1.5" stroke-dasharray="4 3"/><text x="${cx}" y="${cy - HR * 0.5}" class="lbl-fleet" style="fill:${hostile ? '#ffb3be' : '#7af0e9'}">${hostile ? '⚔' : ''}${c}</text></g>`;
    }
    svg.innerHTML = svgDefs() + `<g id="cam">${out}${ov}</g>`;
    const mw = HR * SQ * (V.w + 0.5) + 20, mhh = HR * 1.5 * (V.h - 1) + HR * 2 + 20;
    if (first || cam.fitted !== V.id) {
      fitMap(mw, mhh); cam.fitted = V.id;
      const me = Game.me();
      if (first && $('mapwrap').clientWidth < 700 && me && me.capital >= 0) { cam.k *= 1.7; applyCam(); centerOn(me.capital); }
    }
    applyCam();
    const hint = $('movehint');
    if (Game.moving) { const f = V.fleets.find(x => x.id === Game.moving); hint.innerHTML = `<span>이동할 칸을 누르세요 · 남은 이동력 ${f ? f.mp : 0}</span><button class="btn xs" data-a="cancelMove">취소</button>`; hint.hidden = false; }
    else hint.hidden = true;
  }
  const shortName = n => n.length > 9 ? n.slice(0, 8) + '…' : n;
  function fitMap(mw, mhh) {
    const r = $('mapwrap').getBoundingClientRect();
    const k = Math.max(0.35, Math.min(2.2, Math.min(r.width / mw, r.height / mhh) * 0.94));
    cam.k = k; cam.x = (r.width - mw * k) / 2; cam.y = (r.height - mhh * k) / 2;
  }
  function applyCam() { const g = $('cam'); if (g) g.setAttribute('transform', `translate(${cam.x.toFixed(1)},${cam.y.toFixed(1)}) scale(${cam.k.toFixed(3)})`); }
  function zoomAt(px, py, f) { const nk = Math.max(0.3, Math.min(3.5, cam.k * f)); cam.x = px - (px - cam.x) * nk / cam.k; cam.y = py - (py - cam.y) * nk / cam.k; cam.k = nk; applyCam(); }
  function centerOn(id) {
    const V = Game.V; if (!V || id == null || id < 0) return; const t = V.tiles[id]; const [cx, cy] = hc(t.x, t.y); const r = $('mapwrap').getBoundingClientRect();
    cam.x = r.width / 2 - cx * cam.k; cam.y = r.height / 2 - cy * cam.k; applyCam();
  }
  (function bindMap() {
    const svg = $('map'), ptrs = new Map(); let down = null, panned = false, pinch = null;
    svg.addEventListener('pointerdown', e => {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) { down = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, target: e.target.closest('[data-id]') }; panned = false; }
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: cam.k }; panned = true; }
      try { svg.setPointerCapture(e.pointerId); } catch (er) { /* */ }
    });
    svg.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const rect = svg.getBoundingClientRect();
      if (ptrs.size === 2 && pinch) {
        const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt((a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top, (pinch.k * d / pinch.d) / cam.k); return;
      }
      if (down && ptrs.size === 1) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (!panned && Math.hypot(dx, dy) > 6) { panned = true; svg.classList.add('panning'); }
        if (panned) { cam.x = down.cx + dx; cam.y = down.cy + dy; applyCam(); }
      }
    });
    const up = e => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (ptrs.size === 0) {
        svg.classList.remove('panning');
        if (down && !panned && down.target) onTileClick(+down.target.dataset.id);
        down = null;
      }
    };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
    svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
    document.querySelector('.mapctl').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return; const r = $('mapwrap').getBoundingClientRect(); const z = +b.dataset.zoom;
      if (z === 0) { const me = Game.me(); centerOn(me && me.capital >= 0 ? me.capital : (Game.V.tiles.find(t => t.owner === Game.V.me) || {}).id); }
      else zoomAt(r.width / 2, r.height / 2, z > 0 ? 1.25 : 0.8);
    });
    window.addEventListener('resize', () => { if (Game.V && curScreen === 'game') { cam.fitted = null; renderMap(false); } });
  })();

  async function onTileClick(id) {
    const V = Game.V; if (!V) return;
    if (Game.moving) {
      const f = V.fleets.find(x => x.id === Game.moving);
      const reach = GW.reachable(V, V.me, f);
      if (id === (f && f.tile)) { Game.moving = null; renderMap(false); return; }
      if (!(id in reach)) { toast('이동력 범위 밖이거나 갈 수 없는 칸입니다', 'err'); return; }
      await moveFleet(f, id, reach[id]);
      return;
    }
    Game.sel = id;
    const mineHere = V.fleets.filter(f => f.tile === id && f.owner === V.me);
    Game.selFleet = mineHere.length ? mineHere[0].id : null;
    renderMap(false); renderRight();
    if (window.innerWidth <= 900) openDrawer('right');
  }
  async function moveFleet(f, to, cost) {
    const V = Game.V, t = V.tiles[to];
    const hostile = GW.hostileFleetsAt(V, V.me, to);
    let body = `<p><b>${esc(t.fog ? '미탐험 지역' : t.name)}</b>(으)로 함대를 이동합니다. 이동력 ${cost} 소모 (남은 ${f.mp - cost}).</p>`, kind = 'pri', attack = false;
    if (hostile.length) {
      const D = GW.defenderSetup(Object.assign({}, V, { fleets: V.fleets.map(x => x.id === f.id ? Object.assign({}, x, { tile: to }) : x) }), V.me, to);
      const odds = D ? Math.round(GW.estimateWin({ ships: f.ships, mods: GW.sideMods(V, V.me, to, false) }, D, 120) * 100) : 100;
      const neutralRel = hostile.some(h => h.owner !== 'pirate' && GW.rel(V, V.me, h.owner) === 'neutral');
      body += `<p class="red">⚔ 도착하면 ${hostile[0].owner === 'pirate' ? '우주 해적' : esc(V.players[hostile[0].owner].empire)} 함대와 전투가 벌어집니다.</p><p>예상 승률: <b class="${odds >= 60 ? 'green' : odds >= 35 ? 'gold' : 'red'}">${odds}%</b></p>`;
      if (neutralRel) body += '<p class="gold">⚠ 중립 관계인 제국을 공격하면 자동으로 전쟁이 선포됩니다.</p>';
      kind = 'danger'; attack = true;
    }
    const info = await doAct({ type: 'move', fleet: f.id, to, attack }, '함대 이동', body, attack ? '공격 이동' : '이동', kind);
    Game.moving = null;
    if (info) { Game.sel = to; Game.selFleet = Game.V && Game.V.fleets.some(x => x.id === f.id) ? f.id : null; }
    if (Game.V) { renderMap(false); renderRight(); }
  }

  /* ---------- 오른쪽 패널: 선택한 타일 ---------- */
  function renderRight() {
    const V = Game.V, me = Game.me();
    if (Game.sel == null) {
      $('right').innerHTML = `<h3>선택한 지역</h3><div class="card tight"><p class="muted" style="margin:0">지도에서 행성이나 지역을 눌러 정보를 확인하고 명령을 내리세요.</p></div>
        <h3>내 함대</h3>${V.fleets.filter(f => f.owner === V.me).map(f => `<button class="btn sm block" style="justify-content:flex-start;margin-bottom:5px" data-a="selTile" data-id="${f.tile}">⚑ ${esc(V.tiles[f.tile].name || '미탐험 지역')} · ${GW.sumShips(f.ships)}척 · 이동력 ${f.mp}</button>`).join('') || '<p class="muted small">함대가 없어요.</p>'}`;
      return;
    }
    const t = V.tiles[Game.sel];
    let h = '';
    if (t.fog) {
      h = `<h3>선택한 지역</h3><div class="card tight"><b>미탐험 지역</b><p class="muted small">안개에 가려진 곳이에요. 함대를 보내거나 <b>탐험 → 장거리 스캔</b>으로 밝혀 보세요.</p><button class="btn sm teal" data-a="scanHere">📡 이곳 장거리 스캔</button></div>`;
    } else {
      const T = GW.TYPES[t.type], owner = t.owner && V.players[t.owner];
      const mine = t.owner === V.me;
      h += `<h3>선택한 지역</h3><div class="card tight"><div class="tilehead">${T.planet ? `<span class="planetball" style="background:radial-gradient(circle at 35% 30%,#fff,${T.color} 30%,#050617);color:${T.color}"></span>` : ''}
        <div><b style="font-size:15px">${esc(t.name)}</b> ${t.capital ? '<span class="badge gold">★ 수도</span>' : ''}<div class="row" style="gap:4px;margin-top:3px"><span class="badge">${T.ko}</span>${T.planet ? gradeBadge(t.grade) + `<span class="badge">크기 ${t.size}</span>` : ''}</div></div></div>
        ${t.special ? `<div class="small gold">✧ ${GW.SPECIALS[t.special].ko}</div>` : ''}
        <div class="small muted">${T.desc}</div>
        <div class="spacer"></div>
        <div class="kv">
          <span>소유</span><b>${owner ? `${esc(owner.emblem)} ${esc(owner.empire)}` : (T.planet ? '중립 (무주지)' : '-')}</b>
          ${T.planet ? `<span>인구</span><b>${t.vis ? `${t.pop} / ${GW.maxPop(t)}` : '?'}</b>` : ''}
          ${t.owner ? `<span>방어력</span><b>${t.vis ? `${t.def} / ${t.maxDef}` : '?'}</b>` : ''}
          ${!t.owner && t.garrison ? `<span>중립 수비대</span><b class="red">${t.garrison > 0 ? t.garrison : '있음 (?)'}</b>` : ''}
          <span>조사</span><b>${t.surveyed ? '완료' : '<span class="teal">조사 가능</span>'}</b>
        </div>`;
      if (T.planet) {
        const pr = mine && V.econ.planets.find(p => p.id === t.id);
        const prod = pr ? pr.prod : GW.planetProd(V, Object.assign({ pop: 0, buildings: {} }, t, { pop: t.pop || 0, buildings: t.buildings || {} }), { prod: 1, credits: 1 });
        h += `<div class="spacer"></div><div class="lbl">${pr ? '턴당 생산' : '예상 기본 생산'}</div><div class="cost">${GW.RES.map(r => `<span>${GW.RES_ICON[r]}${Math.round(prod[r])}</span>`).join('')}${pr && pr.rp ? `<span>🔬${pr.rp}</span>` : ''}</div>`;
      }
      h += '</div>';
      // 건물
      if (T.planet && t.vis) {
        const bl = Object.entries(t.buildings || {});
        h += `<h3>건물 ${bl.length}/${GW.slots(t)}</h3><div class="blist">${bl.map(([k, lv]) => `<div class="bitem"><span>${GW.BUILDINGS[k].icon} ${GW.BUILDINGS[k].ko}</span>${lvDots(lv)}</div>`).join('') || '<span class="muted small">건물 없음</span>'}</div>`;
        if (mine) h += `<div class="row" style="margin-top:6px"><button class="btn sm" data-a="build">🏗 건설·업그레이드</button>${t.buildings.shipyard ? '<button class="btn sm" data-a="ships">⚓ 함선 생산</button>' : ''}</div>`;
        if (mine && me.capital == null && !T.outpost) h += `<button class="btn sm gold block" style="margin-top:6px" data-a="capital" data-id="${t.id}">★ 이곳을 새 수도로 (◎200 ⛏100)</button>`;
      }
      // 함대
      const fl = V.fleets.filter(f => f.tile === t.id);
      h += `<h3>함대 ${fl.length ? '(' + fl.length + ')' : ''}</h3>`;
      if (!fl.length) h += `<p class="muted small">${t.vis ? '이 칸에 함대가 없어요.' : '현재 시야 밖이라 함대를 볼 수 없어요.'}</p>`;
      const mineFl = fl.filter(f => f.owner === V.me);
      for (const f of fl) h += fleetCard(f, t, mineFl.length);
    }
    $('right').innerHTML = h;
  }
  function fleetCard(f, t, myCount) {
    const V = Game.V, mine = f.owner === V.me, mt = Game.myTurn();
    const own = f.owner === 'pirate' ? { empire: '우주 해적', color: '#ff5a6e', emblem: '☠' } : V.players[f.owner];
    const pow = GW.fleetPower(f.ships, mine ? V.bonus : null);
    let h = `<div class="fleetcard ${mine ? 'mine' : ''}"><div class="row">${crest(own)}<b class="grow">${esc(own.empire)}</b><span class="badge">전력 ${pow}</span></div>${shipsHtml(f.ships)}`;
    if (mine) {
      h += `<div class="small muted">이동력 ${f.mp} · ${f.acted ? '전투 완료' : '전투 가능'}${f.fresh ? ' · 신규 생산(다음 턴 이동)' : ''}${f.surveyed ? ' · 조사 완료' : ''}</div>`;
      if (mt) {
        const D = GW.defenderSetup(V, V.me, t.id);
        const canCol = GW.TYPES[t.type].planet && !t.owner && !(t.garrison) && f.ships.transport && !GW.hostileFleetsAt(V, V.me, t.id).length;
        const combat = Object.entries(f.ships).some(([k, n]) => n && GW.SHIPS[k].atk > 0);
        h += `<div class="row" style="margin-top:6px;gap:5px">
          <button class="btn xs teal" data-a="moveMode" data-f="${f.id}" ${f.mp > 0 && !f.acted ? '' : 'disabled'}>➤ 이동</button>
          ${D && combat ? `<button class="btn xs danger" data-a="attack" data-f="${f.id}" ${f.acted ? 'disabled' : ''}>⚔ 공격${f.ships.transport && GW.TYPES[t.type].planet && t.owner !== V.me ? '·점령' : ''}</button>` : ''}
          ${canCol ? `<button class="btn xs pri" data-a="colonize" data-f="${f.id}">🚩 식민</button>` : ''}
          ${!t.surveyed ? `<button class="btn xs vio" data-a="survey" data-f="${f.id}" ${f.surveyed ? 'disabled' : ''}>🔭 조사</button>` : ''}
          ${GW.sumShips(f.ships) > 1 ? `<button class="btn xs" data-a="split" data-f="${f.id}">✂ 분할</button>` : ''}
          ${myCount > 1 ? `<button class="btn xs" data-a="merge" data-id="${t.id}">⧉ 합치기</button>` : ''}
          <button class="btn xs ghost" data-a="disband" data-f="${f.id}">해산</button></div>`;
      }
    }
    return h + '</div>';
  }

  function renderBottom() {
    const mt = Game.myTurn(), V = Game.V, ended = V.phase === 'ended';
    const props = V.proposals.filter(p => p.to === V.me).length;
    $('bottom').innerHTML = `
      <button class="btn pri end" data-a="endTurn" ${mt ? '' : 'disabled'}><span class="i">⏭</span>턴 종료</button>
      <button class="btn" data-a="research"><span class="i">🔬</span>연구</button>
      <button class="btn" data-a="build"><span class="i">🏗</span>건설</button>
      <button class="btn" data-a="ships"><span class="i">⚓</span>함선 생산</button>
      <button class="btn" data-a="dip"><span class="i">🤝</span>외교${props ? ` (${props})` : ''}</button>
      <button class="btn" data-a="explore"><span class="i">🔭</span>탐험</button>
      <button class="btn" data-a="market"><span class="i">◎</span>시장</button>
      ${ended ? '<button class="btn teal" data-a="gameover"><span class="i">🏆</span>결과</button>' : ''}`;
  }

  /* ---------- 창들 ---------- */
  function researchModal() {
    const V = Game.V, me = Game.me(), R = me.research, mt = Game.myTurn();
    const rp = V.econ.rp;
    return mh('기술 연구', `<span class="badge teal">연구 속도 ${rp}/턴</span>`) + `<p class="muted small">한 번에 하나의 기술만 연구해요. 시작할 때 비용을 내고, 매 턴 시작 시 연구 점수가 쌓여 완료돼요. 연구 시설(과학·에너지·외계 유물 연구소)과 고대 유적이 연구 속도를 올려요.</p>
      <div class="techgrid">${Object.entries(GW.TECH_FIELDS).map(([f, ko]) => `<div class="col"><b class="small ${f === 'final' ? 'gold' : 'teal'}">${ko}</b>${Object.entries(GW.TECHS).filter(([, T]) => T.field === f).map(([k, T]) => {
        const done = R.done.includes(k), cur = R.cur === k, ok = T.req.every(r => R.done.includes(r));
        const turns = rp > 0 ? Math.ceil(Math.max(0, T.rp - (cur ? R.prog : 0)) / rp) : '∞';
        return `<div class="tech ${done ? 'done' : cur ? 'cur' : ok ? '' : 'lock'}"><b>${T.ko}</b><span class="muted">${T.desc}</span>
          <span>🔬 ${T.rp}점 · 약 ${turns}턴</span><span>비용 ${costHtml(T.cost, me.res)}</span>${T.req.length ? `<span class="dim">선행: ${T.req.map(r => (R.done.includes(r) ? '✓' : '') + GW.TECHS[r].ko).join(', ')}</span>` : ''}
          ${done ? '<span class="badge green">✓ 완료</span>' : cur ? `<div class="bar"><i style="width:${Math.min(100, R.prog / T.rp * 100)}%"></i></div><span class="gold">연구 중 ${Math.min(R.prog, T.rp)}/${T.rp}</span>` : `<button class="btn xs ${ok ? 'teal' : ''}" data-a="doResearch" data-k="${k}" ${ok && mt && !R.cur ? '' : 'disabled'}>${!ok ? '🔒 잠김' : R.cur ? '다른 연구 진행 중' : '연구 시작'}</button>`}</div>`;
      }).join('')}</div>`).join('')}</div>`;
  }
  function pickPlanetModal(title, filter, act) {
    const V = Game.V;
    const list = V.tiles.filter(t => t.owner === V.me && filter(t));
    return mh(title) + (list.length ? `<p class="muted small">행성을 고르세요.</p><div class="col">${list.map(t => `<button class="btn" style="justify-content:space-between" data-a="${act}" data-id="${t.id}"><span>${t.capital ? '★ ' : ''}${esc(t.name)} <span class="muted small">${GW.TYPES[t.type].ko} · 크기 ${t.size}</span></span><span class="small muted">건물 ${Object.keys(t.buildings).length}/${GW.slots(t)}${t.buildings.shipyard ? ' · ⚓' + t.buildings.shipyard : ''}</span></button>`).join('')}</div>` : '<p class="muted">해당하는 행성이 없어요.</p>');
  }
  function buildModal(tid) {
    const V = Game.V, me = Game.me(), t = V.tiles[tid], mt = Game.myTurn();
    const fake = { players: { [V.me]: { research: me.research, flags: me.flags } }, tiles: V.tiles };
    return mh(`건설 — ${esc(t.name)}`, `<button class="btn sm" data-a="build" data-pick="1">다른 행성</button>`) + `<p class="muted small">행성마다 턴당 1번 건설·업그레이드할 수 있어요. 건설 슬롯 ${Object.keys(t.buildings).length}/${GW.slots(t)} · 최대 3단계 (3단계는 [첨단 시설] 필요)${V.bonus.build < 1 ? ' · 모듈식 건축: 비용 -20%' : ''}</p>` +
      Object.entries(GW.BCAT_KO).map(([c, ko]) => `<h3>${ko}</h3><div class="blist">${Object.entries(GW.BUILDINGS).filter(([, B]) => B.cat === c).map(([k, B]) => {
        const lv = t.buildings[k] || 0, err = GW.buildCheck(fake, V.me, t, k);
        const cost = lv < 3 ? GW.buildCost({ players: fake.players, tiles: V.tiles }, V.me, k, lv + 1) : null;
        return `<div class="bitem" style="align-items:flex-start"><div class="grow"><b>${B.icon} ${B.ko}</b> ${lvDots(lv)}<div class="small muted">${B.desc}</div>${cost ? `<div class="small">${lv ? lv + 1 + '단계 업그레이드' : '건설'} 비용: ${costHtml(cost, me.res)}</div>` : ''}${err && lv < 3 ? `<div class="tiny red">${esc(err)}</div>` : ''}</div>
          <button class="btn xs ${lv ? 'vio' : 'teal'}" data-a="doBuild" data-id="${t.id}" data-b="${k}" ${!err && mt ? '' : 'disabled'}>${lv >= 3 ? '최대' : lv ? '업그레이드' : '건설'}</button></div>`;
      }).join('')}</div>`).join('');
  }
  function shipModal(tid) {
    const V = Game.V, me = Game.me(), t = V.tiles[tid], mt = Game.myTurn(), yard = t.buildings.shipyard || 0;
    const built = (me.flags.shipsBuilt || {})[t.id] || 0;
    return mh(`함선 생산 — ${esc(t.name)}`, `<button class="btn sm" data-a="ships" data-pick="1">다른 조선소</button>`) + `<p class="muted small">조선소 ${yard}단계 · 이번 턴 ${built}/${yard * 2}척 생산. 새 함선은 이 행성에 나타나며 다음 턴부터 움직일 수 있어요. 유지비는 매 턴 크레딧에서 빠져요.</p>
      <div style="overflow:auto"><table class="t shiptbl"><tr><th>함선</th><th>공격</th><th>방어</th><th>이동</th><th>비용 (1척)</th><th>유지</th><th>수량</th><th></th></tr>${GW.SHIP_ORDER.map(k => {
        const S = GW.SHIPS[k], ok = yard >= S.yard;
        return `<tr class="${ok ? '' : 'dim'}"><td>${S.icon} <b>${S.ko}</b><div class="tiny muted">${S.desc}</div></td><td>${S.atk}</td><td>${S.hp}</td><td>${S.move}</td><td>${costHtml(S.cost, me.res)}</td><td>◎${S.upkeep}</td>
          <td>${ok ? `<span class="stepper"><button data-a="step" data-t="n-${k}" data-d="-1">−</button><input type="number" id="n-${k}" value="1" min="1" max="20"><button data-a="step" data-t="n-${k}" data-d="1">＋</button></span>` : `<span class="tiny">조선소 ${S.yard}단계 필요</span>`}</td>
          <td><button class="btn xs teal" data-a="doShip" data-id="${t.id}" data-k="${k}" ${ok && mt ? '' : 'disabled'}>생산</button></td></tr>`;
      }).join('')}</table></div>`;
  }
  function dipModal() {
    const V = Game.V, me = V.me, mt = Game.myTurn();
    const others = V.order.filter(o => o !== me);
    const K = { alliance: '동맹', nap: '불가침 협정', peace: '평화 협정', trade: '자원 거래' };
    const resTxt = o => Object.entries(o || {}).map(([r, v]) => `${GW.RES_ICON[r]}${v}`).join(' ') || '없음';
    const inc = V.proposals.filter(p => p.to === me), out = V.proposals.filter(p => p.from === me);
    return mh('외교') + `<p class="muted small">제안과 해제·선전포고는 내 차례에 할 수 있고, 받은 제안 응답과 메시지는 언제든 가능해요. 협정은 체결 후 3라운드가 지나야 해제할 수 있어요. 동맹끼리는 시야를 공유하고 영토를 통과할 수 있어요. 불가침 상대의 영토에는 들어갈 수 없어요.</p>
      ${inc.length ? `<h3>📨 받은 제안</h3>${inc.map(p => `<div class="bitem"><div class="grow"><b>${esc(V.players[p.from].empire)}</b> → ${K[p.kind]}${p.kind === 'trade' ? `<div class="small">받는 것: ${resTxt(p.give)} · 주는 것: ${resTxt(p.get)}</div>` : ''}${p.text ? `<div class="small muted">“${esc(p.text)}”</div>` : ''}<div class="tiny dim">라운드 ${p.round}에 제안 · 2라운드 뒤 만료</div></div>
        <button class="btn xs teal" data-a="respond" data-id="${p.id}" data-ok="1">수락</button><button class="btn xs danger" data-a="respond" data-id="${p.id}" data-ok="0">거절</button></div>`).join('')}` : ''}
      ${out.length ? `<h3>보낸 제안 (응답 대기)</h3>${out.map(p => `<div class="bitem small">${esc(V.players[p.to].empire)} · ${K[p.kind]}${p.kind === 'trade' ? ` (줌 ${resTxt(p.give)} / 받음 ${resTxt(p.get)})` : ''}</div>`).join('')}` : ''}
      <h3>제국 관계</h3>${others.map(o => {
        const p = V.players[o], r = GW.rel(V, me, o), R = V.rel[GW.relKey(me, o)] || {}, age = V.round - (R.since || 0);
        const b = (a, l, cls, dis) => `<button class="btn xs ${cls || ''}" data-a="${a}" data-pid="${o}" ${mt && !dis && p.alive ? '' : 'disabled'}>${l}</button>`;
        return `<div class="card tight" style="margin-bottom:8px"><div class="row">${crest(p)}<b class="grow">${esc(p.empire)} <span class="muted small">${esc(p.name)}</span></b>${relBadge(r)}${R.since ? `<span class="tiny dim">R${R.since}부터</span>` : ''}</div>
          <div class="small muted" style="margin:4px 0">행성 ${p.planets} · 군사력 ${fmt(p.military)} · 기술 ${p.techs} · 점수 ${p.score}${p.alive ? '' : ' · ☠ 멸망'}</div>
          <div class="row" style="gap:5px">${r !== 'alliance' && r !== 'war' ? b('propose', '🤝 동맹 요청', 'teal') : ''}${r === 'neutral' ? b('proposeNap', '🕊 불가침 협정') : ''}${r === 'war' ? b('proposePeace', '🕊 평화 제안', 'teal') : ''}
            ${b('trade', '⇄ 자원 거래')}${r === 'alliance' || r === 'nap' ? b('breakRel', `💔 ${r === 'alliance' ? '동맹' : '협정'} 해제${age < 3 ? ` (${3 - age}R 뒤)` : ''}`, 'ghost', age < 3) : ''}${r === 'neutral' ? b('declareWar', '⚔ 전쟁 선포', 'danger') : ''}
            <button class="btn xs" data-a="msgTo" data-pid="${o}">💬 메시지</button></div></div>`;
      }).join('')}
      <h3>외교 메시지</h3><div class="chatbox" id="dip-chat">${V.messages.map(m => `<div><b style="color:${esc((V.players[m.from] || {}).color)}">${esc((V.players[m.from] || {}).empire)}</b> <span class="tiny dim">${m.to === 'all' ? '전체' : '→ ' + esc((V.players[m.to] || {}).empire)} · R${m.round}</span><br>${esc(m.text)}</div>`).join('') || '<div class="sys">아직 메시지가 없어요.</div>'}</div>
      <div class="row" style="margin-top:8px"><select id="dip-to" style="width:auto"><option value="all">전체에게</option>${others.map(o => `<option value="${o}" ${Game.msgTo === o ? 'selected' : ''}>${esc(V.players[o].empire)}</option>`).join('')}</select><input type="text" id="dip-msg" maxlength="200" placeholder="메시지" style="flex:1;min-width:0"><button class="btn sm" data-a="sendMsg">보내기</button></div>`;
  }
  function tradeModal(to) {
    const V = Game.V, me = Game.me(), p = V.players[to];
    return mh(`자원 거래 제안 — ${esc(p.empire)}`) + `<p class="muted small">상대가 수락하는 순간 서버가 양쪽 자원을 확인하고 교환해요. (내 차례에만 제안 가능)</p>
      <table class="t"><tr><th>자원</th><th>내가 줄 양 (보유)</th><th>내가 받을 양</th></tr>${GW.RES.map(r => `<tr><td>${GW.RES_ICON[r]} ${GW.RES_KO[r]}</td><td><input type="number" min="0" id="tg-${r}" value="0"> <span class="tiny muted">${fmt(me.res[r])}</span></td><td><input type="number" min="0" id="tt-${r}" value="0"></td></tr>`).join('')}</table>
      <div class="field" style="margin-top:8px"><label>한마디 (선택)</label><input type="text" id="tr-text" maxlength="120"></div>
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-a="dip">뒤로</button><button class="btn pri" data-a="sendTrade" data-pid="${to}">거래 제안 보내기</button></div>`;
  }
  function exploreModal() {
    const V = Game.V, mt = Game.myTurn(), me = Game.me();
    const fl = V.fleets.filter(f => f.owner === V.me && !V.tiles[f.tile].surveyed);
    const sel = Game.sel != null ? V.tiles[Game.sel] : null;
    const cost = V.bonus.vision > 0 ? 15 : 30;
    const near = sel && V.tiles.some(t => t.owner === V.me && GW.dist(V, t.id, sel.id) <= 4);
    return mh('탐험') + `<p class="muted small">함대가 지나간 곳과 시야 안은 지도에 영구히 기록돼요. 아직 조사하지 않은 지역에 함대가 있으면 <b>조사</b>해서 새로운 행성, 희귀 자원, 고대 유적, 중립 세력, 우주 이벤트를 찾을 수 있어요. (함대의 남은 이동력을 모두 사용)</p>
      <h3>함대 조사</h3>${fl.length ? fl.map(f => `<div class="bitem"><span>⚑ ${esc(V.tiles[f.tile].name)} · ${GW.sumShips(f.ships)}척</span><button class="btn xs vio" data-a="survey" data-f="${f.id}" ${mt && !f.surveyed ? '' : 'disabled'}>${f.surveyed ? '조사 완료' : '🔭 조사'}</button></div>`).join('') : '<p class="muted small">조사하지 않은 지역에 있는 함대가 없어요. 정찰선을 보내 보세요.</p>'}
      <h3>장거리 스캔</h3><div class="card tight"><p class="small" style="margin:0 0 6px">선택한 칸 주변 2칸을 밝혀요. 내 행성에서 4칸 이내만 가능 · 턴당 1회 · 에너지 ${cost}${me.flags.scan ? ' · <span class="gold">이번 턴 사용함</span>' : ''}</p>
        ${sel ? `<div class="row"><span class="grow">대상: <b>${esc(sel.fog ? '미탐험 지역' : sel.name)}</b> ${near ? '' : '<span class="red small">(범위 밖)</span>'}</span><button class="btn sm teal" data-a="scanHere" ${mt && near && !me.flags.scan ? '' : 'disabled'}>📡 스캔</button></div>` : '<p class="muted small" style="margin:0">먼저 지도에서 스캔할 칸을 선택하세요.</p>'}</div>`;
  }
  function marketModal() {
    const V = Game.V, me = Game.me(), mt = Game.myTurn();
    return mh('은하 시장') + `<p class="muted small">크레딧으로 자원을 사고팔아요. 무역 센터(단계당 +5%, 최대 30%)와 [은하 무역망] 연구로 거래 효율이 좋아져요. 현재 효율 ×${V.bonus.trade.toFixed(2)}</p>
      <table class="t"><tr><th>자원</th><th>보유</th><th>판매가</th><th>구매가</th><th>수량</th><th></th></tr>${['metal', 'energy', 'crystal', 'food'].map(r => {
        const sp = GW.marketPrice(V, V.me, r, 'sell'), bp = GW.marketPrice(V, V.me, r, 'buy');
        return `<tr><td>${GW.RES_ICON[r]} ${GW.RES_KO[r]}</td><td>${fmt(me.res[r])}</td><td>◎${sp.toFixed(2)}</td><td>◎${bp.toFixed(2)}</td><td><input type="number" id="mk-${r}" value="20" min="1" style="width:80px"></td>
          <td><div class="row" style="gap:4px"><button class="btn xs" data-a="trade1" data-r="${r}" data-s="sell" ${mt ? '' : 'disabled'}>판매</button><button class="btn xs teal" data-a="trade1" data-r="${r}" data-s="buy" ${mt ? '' : 'disabled'}>구매</button></div></td></tr>`;
      }).join('')}</table><p class="small">보유 크레딧: ◎${fmt(me.res.credits)}</p>`;
  }
  function victoryModal() {
    const V = Game.V, S = V.settings.victory;
    const rows = (key, label, val) => `<h3>${label}</h3>${V.order.map(o => { const p = V.players[o], pr = V.victory[o]; return `<div class="row small" style="margin-bottom:4px"><span style="width:130px">${esc(p.emblem)} ${esc(p.empire)}</span><div class="bar grow ${key === 'score' ? 'gold' : ''}"><i style="width:${Math.round(pr[key] * 100)}%"></i></div><span style="width:110px;text-align:right" class="num">${val(pr)}</span></div>`; }).join('')}`;
    const maxScore = Math.max(1, ...V.order.map(o => V.victory[o].score));
    for (const o of V.order) V.victory[o].scoreP = V.victory[o].score / maxScore;
    return mh('승리 조건 진행도') +
      (S.conquest ? rows('conquest', `정복 승리 — 전체 행성 ${V.totalPlanets}개 중 ${S.conquestPct}% 점령`, pr => `${pr.owned} / ${pr.need}`) : '') +
      (S.economy ? rows('economy', `경제 승리 — 총자산 ${fmt(S.economyTarget)} (자원 + 행성 가치 + 건물 가치)`, pr => `${fmt(pr.assets)}`) : '') +
      (S.science ? rows('science', '과학 승리 — 최종 기술 [은하 초월] 완성', pr => `기술 ${pr.techs}/${Object.keys(GW.TECHS).length}`) : '') +
      rows('scoreP', `제국 승리 — ${S.roundLimit}라운드 종료 시 최고 점수 (현재 ${V.round}라운드)`, pr => `${pr.score}점`) +
      `<p class="muted small">모든 행성을 잃은 제국은 멸망하고, 마지막까지 남은 제국도 승리해요. 점수 = 행성×12 + 인구×2 + 기술×15 + 건물 단계×4 + 군사력/8 + 총자산/60 + 수도 20</p>`;
  }
  function econModal() {
    const V = Game.V, E = V.econ;
    return mh('생산과 소비') + `<p class="muted small">매 턴 시작할 때 아래 순서로 반영돼요: 자원 생산 → 유지비 차감 → 인구 성장(식량이 충분하면) → 연구 진행.</p>
      <div style="overflow:auto"><table class="t"><tr><th>행성</th>${GW.RES.map(r => `<th>${GW.RES_ICON[r]}</th>`).join('')}<th>🔬</th></tr>
      ${E.planets.map(p => `<tr><td>${esc(p.name)}</td>${GW.RES.map(r => `<td class="num">${p.prod[r]}</td>`).join('')}<td class="num">${p.rp}</td></tr>`).join('')}
      <tr><th>총 생산</th>${GW.RES.map(r => `<th class="num green">+${E.prod[r]}</th>`).join('')}<th class="num">${E.rp}</th></tr>
      <tr><th>유지·소비</th>${GW.RES.map(r => `<th class="num red">${E.upkeep[r] ? '-' + E.upkeep[r] : 0}</th>`).join('')}<th></th></tr>
      <tr><th>순수익</th>${GW.RES.map(r => `<th class="num ${E.net[r] >= 0 ? 'green' : 'red'}">${E.net[r] >= 0 ? '+' : ''}${E.net[r]}</th>`).join('')}<th></th></tr></table></div>
      <p class="small muted">크레딧 유지비 = 함선 유지비 합계 · 에너지 유지비 = 정제소·조선소·방어 시설 · 식량 소비 = 총 인구 ${E.pop}. 식량이 바닥나면 인구가 줄고, 크레딧이 바닥나면 함선이 이탈해요.${V.mods.length ? '<br>진행 중인 이벤트: ' + V.mods.map(m => esc(m.ko)).join(', ') : ''}</p>`;
  }
  function logModal() {
    const V = Game.V;
    return mh('전체 기록') + `<div class="loglist" style="max-height:none">${V.log.slice().reverse().map(l => `<div><span class="r">R${l.r}</span>${esc(l.txt)}</div>`).join('')}</div>
      ${V.battles.length ? `<h3>전투 보고서</h3><div class="col">${V.battles.slice().reverse().map(b => `<button class="btn sm" style="justify-content:space-between" data-a="battle" data-id="${b.id}"><span>R${b.round} ${esc(b.tileName)}</span><span class="small">${b.winner === 'attacker' ? '공격 승리' : b.winner === 'defender' ? '방어 성공' : '무승부'}</span></button>`).join('')}</div>` : ''}`;
  }
  function sideName(V, pid) { return pid === 'pirate' ? { empire: '우주 해적', color: '#ff5a6e', emblem: '☠' } : pid === 'neutral' ? { empire: '중립 수비대', color: '#8a93b8', emblem: '⛨' } : V.players[pid] || { empire: '?', color: '#555', emblem: '?' }; }
  function showBattle(b) {
    const V = Game.V; if (!V) return;
    const A = sideName(V, b.attacker), D = sideName(V, b.defender);
    const me = V.me, iWon = (b.winner === 'attacker' && b.attacker === me) || (b.winner === 'defender' && b.defender === me);
    const loss = (bef, aft) => GW.SHIP_ORDER.filter(k => bef[k]).map(k => `<div class="small">${GW.SHIPS[k].icon} ${GW.SHIPS[k].ko} ${bef[k]} → <b>${aft[k] || 0}</b>${bef[k] - (aft[k] || 0) ? ` <span class="red">(-${bef[k] - (aft[k] || 0)})</span>` : ''}</div>`).join('');
    const maxD = Math.max(1, ...b.rounds.map(r => Math.max(r.aDmg, r.dDmg)));
    const res = b.winner === 'attacker' ? `${A.empire} 승리` : b.winner === 'defender' ? `${D.empire} 방어 성공` : '무승부 — 양측 생존';
    openModal(mh(`⚔ 전투 보고서 — ${esc(b.tileName)}`) + `<div class="battle">
      <div class="result ${b.winner === 'draw' ? 'muted' : iWon ? 'gold' : (b.attacker === me || b.defender === me) ? 'red' : ''}">${esc(res)}${b.captured ? ' · 🚩 행성 점령' : ''}</div>
      <div class="sides"><div class="side ${b.winner === 'attacker' ? 'win' : ''}">${crest(A, true)}<div><b>${esc(A.empire)}</b></div><div class="small muted">공격 측</div><div class="small">전력 ${b.powA[0]} → <b>${b.powA[1]}</b></div><div class="bar"><i style="width:${b.powA[0] ? b.powA[1] / b.powA[0] * 100 : 0}%"></i></div><div style="margin-top:6px">${loss(b.before.a, b.after.a)}</div></div>
        <div class="vs">VS</div>
        <div class="side ${b.winner === 'defender' ? 'win' : ''}">${crest(D, true)}<div><b>${esc(D.empire)}</b></div><div class="small muted">방어 측</div><div class="small">전력 ${b.powD[0]} → <b>${b.powD[1]}</b></div><div class="bar"><i style="width:${b.powD[0] ? b.powD[1] / b.powD[0] * 100 : 0}%"></i></div><div style="margin-top:6px">${loss(b.before.d, b.after.d)}${b.before.planet ? `<div class="small">⛨ 행성 방어 ${Math.round(b.before.planet)} → <b>${b.after.planet}</b></div>` : ''}</div></div></div>
      <p class="small muted" style="text-align:center">전투 전 예상 승률(공격 측): <b>${b.odds}%</b> · 피해는 전력 × 무작위(85~115%)로 계산되고, 체력 비율대로 나뉘어 함선이 격침돼요.</p>
      <h3>라운드별 피해</h3><div class="rounds">${b.rounds.map(r => `<div class="rr"><span class="small">R${r.r}</span><div><div class="dmgbar"><i style="width:${r.aDmg / maxD * 100}%;background:${A.color}"></i></div><span class="tiny">${esc(A.emblem)} 가한 피해 ${r.aDmg}</span></div><div><div class="dmgbar"><i style="width:${r.dDmg / maxD * 100}%;background:${D.color}"></i></div><span class="tiny">${esc(D.emblem)} 가한 피해 ${r.dDmg}</span></div></div>`).join('') || '<p class="muted small">전투가 바로 끝났어요.</p>'}</div>
      ${b.winner === 'attacker' && !b.captured && b.attacker === me && V.tiles[b.tile] && GW.TYPES[V.tiles[b.tile].type] && GW.TYPES[V.tiles[b.tile].type].planet && V.tiles[b.tile].owner !== me ? '<p class="small gold">방어를 무력화했어요. 수송선이 있는 함대로 공격하면 행성을 점령할 수 있어요.</p>' : ''}
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn pri" data-a="closeModal">확인</button></div></div>`, { sys: true });
  }
  function showSurvey(sv) {
    openModal(mh('🔭 조사 결과') + `<div class="card"><b class="gold" style="font-size:16px">${esc(sv.title)}</b><p>${esc(sv.text)}</p></div><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn pri" data-a="closeModal">확인</button></div>`, { cls: 'narrow', sys: true });
  }
  function showEvent(ev) {
    openModal(mh('🌌 우주 이벤트 — 라운드 ' + ev.round) + `<div class="card"><b class="teal" style="font-size:17px">${esc(ev.ko)}</b><p>${esc(ev.desc)}</p></div>
      <div class="row" style="justify-content:flex-end;margin-top:12px">${ev.tile != null ? `<button class="btn" data-a="eventGo" data-id="${ev.tile}">위치 보기</button>` : ''}<button class="btn pri" data-a="closeModal">확인</button></div>`, { cls: 'narrow', sys: true });
  }
  function showGameOver() {
    const V = Game.V; if (!V) return;
    const W = V.players[V.winner] || {}, iWon = V.winner === V.me;
    openModal(mh('게임 종료') + `<div style="text-align:center">${crest(W, true)}<div class="result ${iWon ? 'gold' : ''}" style="margin-top:8px">${iWon ? '🏆 승리!' : '패배'}</div>
      <p><b>${esc(W.empire)}</b> — ${esc(V.winReason)}</p><p class="muted small">${V.round}라운드 · 전투 ${V.stats.battles}회 · 점령 ${V.stats.captures}회</p></div>
      <table class="t"><tr><th>순위</th><th>제국</th><th>점수</th><th>상태</th></tr>${(V.final || []).map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.emblem)} ${esc(p.empire)} <span class="muted small">${esc(p.name)}${p.bot ? ' · AI' : ''}</span></td><td>${p.score}</td><td>${p.alive ? '생존' : '☠ 멸망'}</td></tr>`).join('')}</table>
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-a="closeModal">지도 보기</button><button class="btn" data-a="go" data-s="records">기록 보기</button><button class="btn pri" data-a="exitGame">로비로</button></div>`, { sys: true });
  }
  function splitModal(f) {
    return mh('함대 분할') + `<p class="muted small">새 함대로 옮길 함선 수를 정하세요. 원래 함대에 최소 1척은 남아야 해요. 수송선을 따로 보내 식민할 때 유용해요.</p>
      <table class="t">${GW.SHIP_ORDER.filter(k => f.ships[k]).map(k => `<tr><td>${GW.SHIPS[k].icon} ${GW.SHIPS[k].ko} (보유 ${f.ships[k]})</td><td><span class="stepper"><button data-a="step" data-t="sp-${k}" data-d="-1">−</button><input type="number" id="sp-${k}" value="0" min="0" max="${f.ships[k]}"><button data-a="step" data-t="sp-${k}" data-d="1">＋</button></span></td></tr>`).join('')}</table>
      <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn ghost" data-a="closeModal">취소</button><button class="btn pri" data-a="doSplit" data-f="${f.id}">분할</button></div>`;
  }
  function gameMenu() {
    return mh('메뉴') + `<div class="col"><button class="btn" data-a="rules">📜 게임 규칙</button><button class="btn" data-a="victory">🏆 승리 조건 진행도</button><button class="btn" data-a="econ">📊 생산과 소비</button><button class="btn" data-a="log">📜 전체 기록 · 전투 보고서</button>
      <button class="btn" data-a="saveGame">💾 게임 저장</button><button class="btn" data-a="resync">↻ 상태 다시 불러오기 (오류 복구)</button>
      <button class="btn danger" data-a="leaveGame">${Game.mode === 'online' ? '🚪 게임 나가기 (AI가 대신 운영)' : '🚪 로비로 (자동 저장됨)'}</button></div>`;
  }
  function rulesHtml() {
    return mh('📜 GALACTIC WAR 게임 규칙') + `<div class="small" style="line-height:1.7">
    <h3>목표</h3><p>육각형 은하 지도에서 2~4개 제국이 경쟁해요. 방장이 고른 승리 조건(정복·경제·과학·제국) 중 하나를 먼저 달성하면 승리해요. 정해진 라운드가 끝나면 점수가 가장 높은 제국이 이겨요(제국 승리). 모든 행성을 잃으면 멸망해요.</p>
    <h3>턴 진행</h3><p>제국들은 순서대로 한 턴씩 행동하고, 모두 한 번씩 하면 새 라운드가 시작돼요. 내 턴이 시작되면 <b>1. 자원 생산</b>과 <b>2. 연구 진행</b>이 자동으로 이뤄지고, 그다음 <b>3. 건설·업그레이드 → 4. 함선 생산 → 5. 함대 이동·탐험 → 6. 외교·거래</b>를 원하는 만큼 한 뒤 <b>7. 턴 종료</b>를 눌러요. 온라인에서는 게임 속도에 따라 턴 시간 제한이 있어요.</p>
    <h3>자원</h3><p>⛏ 금속(건물·함선) · ⚡ 에너지(시설 운영·연구) · ◎ 크레딧(거래·각종 비용·함선 유지비) · ◆ 크리스탈(고급 기술·특수 시설) · ❦ 식량(인구 유지, 인구 1당 1 소비). 상단 자원을 누르면 생산·소비 내역이 보여요. 식량이 바닥나면 인구가 줄고, 크레딧이 바닥나면 함선이 이탈해요.</p>
    <h3>행성</h3><p>행성은 종류(일반·가스·얼음·화산·사막·고대 유적·소행성)와 등급(일반·고급·희귀·영웅·전설), 크기(1~3)가 있어요. 등급이 높을수록 생산량이 많고 특수 자원이 있을 확률이 높아요. 성운은 이동력 2를 쓰고, 블랙홀은 지나갈 수 없어요.</p>
    <h3>점령</h3><p>수송선이 있는 함대가 무주지 행성에 있으면 <b>식민</b>(◎40 ⛏20, 수송선 1척 소모)할 수 있어요. 중립 수비대(⛨)가 있는 행성이나 다른 제국의 행성은 <b>공격</b>해서 방어력과 함대를 모두 무너뜨려야 하고, 그 함대에 수송선이 있으면 승리와 동시에 점령해요. 점령당한 행성의 건물은 1단계씩 내려가요.</p>
    <h3>수도</h3><p>수도는 모든 자원 +4, 연구 +5, 방어력 40, 건설 슬롯 +1을 줘요. 수도를 잃으면 생산 -30%, 연구 -50%이고, 다른 행성을 ◎200 ⛏100에 새 수도로 정할 수 있어요.</p>
    <h3>건물</h3><p>행성마다 턴당 1번 건설 또는 업그레이드할 수 있고, 슬롯 수는 크기+1개예요. 건물은 최대 3단계이며 n단계 비용은 1단계의 n배예요. 3단계와 궤도 방어 시설은 [첨단 시설] 연구가 필요해요.</p>
    <h3>함대</h3><p>조선소가 있는 행성에서 함선을 만들어요(조선소 단계당 턴에 2척, 단계가 높을수록 큰 함선). 새 함선은 다음 턴부터 움직여요. 함대 이동력은 가장 느린 함선 기준이에요. 함대를 누르고 <b>이동</b>을 고르면 갈 수 있는 칸이 표시돼요. 적 함대가 있는 칸으로 들어가면 전투가 벌어져요. 함대를 나누거나 합칠 수 있어요.</p>
    <h3>전투</h3><p>전투는 최대 6라운드 자동으로 진행돼요. 매 라운드 양쪽이 동시에 (공격력 합 × 기술 보너스 × 85~115% 무작위)만큼 피해를 주고, 피해는 함선 체력 비율대로 나뉘어 격침돼요. 방어 측은 행성 방어력(방어 기지·궤도 방어 시설)도 함께 싸우며, 성운에서는 체력 +20%예요. 공격 전에 예상 승률이 표시되고, 끝나면 전투 보고서가 나와요.</p>
    <h3>연구</h3><p>한 번에 한 기술을 연구해요. 시작 비용을 내면 매 턴 연구 점수가 쌓여 완료돼요. 경제·군사·과학·특수 4분야 12개 기술을 거쳐 최종 기술 [은하 초월]을 완성하면 과학 승리예요.</p>
    <h3>탐험</h3><p>안개 속 지역은 함대 시야(정찰선 2칸)나 장거리 스캔으로 밝혀요. 한 번 밝힌 곳은 계속 지도에 남지만, 시야 밖의 함대는 보이지 않아요. 조사하지 않은 칸에서 <b>조사</b>하면 새 행성·희귀 자원·고대 유적·중립 세력·우주 이벤트를 만날 수 있어요.</p>
    <h3>외교</h3><p>관계는 중립·불가침·동맹·전쟁이 있어요. 동맹은 시야를 공유하고 서로 공격할 수 없어요. 불가침 상대의 영토에는 들어갈 수 없어요. 중립인 제국을 공격하면 자동으로 전쟁이 시작돼요. 협정은 체결 후 3라운드가 지나야 해제할 수 있어요. 자원 거래는 상대가 수락하면 서버가 확인하고 교환해요.</p>
    <h3>우주 이벤트</h3><p>매 라운드 30% 확률로 운석 지대, 고대 유적, 무역 호황, 에너지 폭풍, 성운 확장, 희귀 자원, 경제 위기, 해적 등장 같은 이벤트가 일어나 실제 게임에 영향을 줘요.</p>
    <h3>온라인 규칙</h3><p>모든 행동은 서버가 검증해요. 연결이 끊겨도 같은 브라우저로 다시 접속하면 이어서 할 수 있고, 게임을 떠나면 AI가 대신 제국을 운영해요(돌아오면 되찾음). 접속이 끊긴 플레이어의 턴은 60초 뒤 자동으로 넘어가요.</p></div>`;
  }

  /* ---------- 서랍(모바일) ---------- */
  function openDrawer(which) { closeDrawers(); $(which).classList.add('open'); const s = document.createElement('div'); s.className = 'scrim'; s.id = 'scrim'; s.addEventListener('click', closeDrawers); document.body.appendChild(s); }
  function closeDrawers() { ['left', 'right'].forEach(i => $(i) && $(i).classList.remove('open')); const s = $('scrim'); if (s) s.remove(); }

  /* ===================================================================
     클릭 처리 (모든 버튼은 data-a)
     =================================================================== */
  const sel = () => Game.V && Game.sel != null ? Game.V.tiles[Game.sel] : null;
  const myFleet = id => Game.V.fleets.find(f => f.id === id && f.owner === Game.V.me);
  const H = {
    closeModal, confirmYes: () => confirmDone(true), confirmNo: () => confirmDone(false),
    go: d => {
      closeModal();
      if (d.s === 'menu') { show('menu'); renderMenu(); }
      else if (d.s === 'create') needServer(() => { show('create'); renderCreate(); });
      else if (d.s === 'rooms') needServer(() => { show('rooms'); renderRooms(); Net.send({ t: 'rooms' }); });
      else if (d.s === 'single') { show('single'); renderSingle(); }
      else if (d.s === 'codex') { show('codex'); renderCodex(); }
      else if (d.s === 'records') { if (Game.mode) Game.exit(); show('records'); renderRecords(); if (serverUrl()) { Net.connect(); Net.send({ t: 'records' }); } }
      else if (d.s === 'settings') { show('settings'); renderSettings(); }
    },
    rules: () => openModal(rulesHtml(), { cls: 'wide' }),
    quick: () => needServer(async () => { Net.joining = true; const r = await Net.request({ t: 'quick', empire: myEmpire() }); if (!r.ok) { Net.joining = false; toast(r.err, 'err'); } else if (r.created) toast('열린 방이 없어 새 방을 만들었어요. AI를 추가하거나 친구를 기다리세요.'); }),
    rejoin: () => needServer(() => { Net.joining = true; SS.set('gw-screen', 'online-game'); if (!Net.send({ t: 'rejoin' })) Net.joining = false; }),
    resumeSingle: () => { if (!Local.resume()) toast('저장된 게임을 불러오지 못했어요.', 'err'); },
    seg: (d, el) => { el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); },
    pickColor: (d, el) => { if (el.classList.contains('taken')) return toast('다른 제국이 사용 중인 색이에요.', 'err'); el.parentElement.querySelectorAll('.swatch').forEach(b => b.classList.toggle('on', b === el)); },
    pickEmb: (d, el) => { el.parentElement.querySelectorAll('.emb').forEach(b => b.classList.toggle('on', b === el)); },
    codexTab: d => { codexTab = d.v; renderCodex(); },
    createRoom: async () => {
      const emp = readEmpire('ce');
      const msg = { t: 'create', name: $('c-room').value, max: +segVal('c-max'), isPublic: segVal('c-pub') === '1', password: $('c-pw').value, settings: readSettings('c'), empire: emp };
      if (!await confirmBox('방 만들기', `<p><b>${esc(msg.name)}</b> · 최대 ${msg.max}명 · ${msg.isPublic ? '공개' : '비공개'}${msg.password ? ' · 🔒' : ''}</p><p class="small muted">${GW.MAP_SIZES[msg.settings.mapSize].ko} 맵 · ${GW.SPEEDS[msg.settings.speed].ko} · ${victoryText(msg.settings.victory)}</p>`, '만들기')) return;
      Object.assign(CFG, emp); saveCfg();
      Net.joining = true; const r = await Net.request(msg); if (!r.ok) { Net.joining = false; toast(r.err, 'err'); }
    },
    refreshRooms: () => { Net.send({ t: 'rooms' }); toast('방 목록을 새로 불러왔어요.'); },
    joinRoom: async d => {
      let password = '';
      if (d.locked === '1') { password = prompt('비밀번호를 입력하세요') || ''; if (!password) return; }
      else if (!await confirmBox('방 참가', '이 방에 참가할까요?', '참가')) return;
      Net.joining = true; const r = await Net.request({ t: 'join', id: d.id, password, empire: myEmpire() });
      if (!r.ok) { Net.joining = false; toast(r.err, 'err'); }
    },
    joinCode: async () => {
      const id = ($('j-code').value || '').trim().toUpperCase(); if (!id) return toast('방 코드를 입력하세요.', 'err');
      const room = (Net.rooms || []).find(r => r.id === id);
      const password = room && !room.locked ? '' : (prompt('비밀번호가 있다면 입력하세요 (없으면 비워 두기)') || '');
      Net.joining = true; const r = await Net.request({ t: 'join', id, password, empire: myEmpire() });
      if (!r.ok) { Net.joining = false; toast(r.err, 'err'); }
    },
    leaveRoom: async () => { if (await confirmBox('방 나가기', '이 방에서 나갈까요?', '나가기', 'danger')) Net.send({ t: 'leave' }); },
    addBot: () => Net.request({ t: 'add_bot' }).then(r => { if (!r.ok) toast(r.err, 'err'); }),
    kick: async d => { if (await confirmBox('내보내기', '이 참가자를 방에서 내보낼까요?', '내보내기', 'danger')) Net.request({ t: 'kick', pid: d.pid }).then(r => { if (!r.ok) toast(r.err, 'err'); }); },
    copyLink: () => { const i = $('room-link'); i.select(); (navigator.clipboard ? navigator.clipboard.writeText(i.value) : Promise.reject()).then(() => toast('초대 링크를 복사했어요.', 'ok')).catch(() => { document.execCommand('copy'); toast('초대 링크를 복사했어요.', 'ok'); }); },
    roomChat: () => { const i = $('room-msg'); const t = i.value.trim(); if (!t) return; Net.send({ t: 'chat', text: t }); i.value = ''; },
    saveRoomSettings: async () => {
      const pw = $('r-pw').value;
      const r = await Net.request({ t: 'settings', settings: readSettings('r'), max: +segVal('r-max'), name: $('r-room').value, isPublic: segVal('r-pub') === '1', password: pw === '' ? undefined : pw.trim() });
      toast(r.ok ? '설정을 저장했어요.' : r.err, r.ok ? 'ok' : 'err');
    },
    saveEmpire: async () => { const e = readEmpire('re'); const r = await Net.request({ t: 'empire', empire: e }); toast(r.ok ? '제국 정보를 저장했어요.' : r.err, r.ok ? 'ok' : 'err'); if (r.ok) { Object.assign(CFG, e); saveCfg(); } },
    startGame: async () => { if (!await confirmBox('게임 시작', `<p>${Net.room.members.length}개 제국으로 전쟁을 시작합니다. 시작 후에는 설정을 바꿀 수 없어요.</p>`, '🚀 시작')) return; const r = await Net.request({ t: 'start' }); if (!r.ok) toast(r.err, 'err'); },
    startSingle: async () => {
      const emp = readEmpire('se'), ai = +segVal('s-ai'), st = readSettings('s');
      const old = LS.get('gw-single');
      if (!await confirmBox('싱글 플레이 시작', `<p>AI ${ai}개 제국과 ${GW.MAP_SIZES[st.mapSize].ko} 맵에서 시작합니다.</p>${old && old.phase === 'playing' ? '<p class="gold">⚠ 저장된 싱글 플레이가 새 게임으로 덮어써집니다.</p>' : ''}`, '시작')) return;
      Object.assign(CFG, emp); saveCfg();
      Local.start(st, emp, ai);
    },
    saveSettings: () => {
      const e = readEmpire('st'); Object.assign(CFG, e, { server: $('st-server').value.trim(), aiSpeed: segVal('st-ai') || 'normal' }); saveCfg();
      if (Net.ws) { const w = Net.ws; Net.ws = null; try { w.close(); } catch (er) { /* */ } }
      if (serverUrl()) Net.connect();
      toast('설정을 저장했어요.', 'ok'); renderSettings();
    },
    resetData: async () => { if (!await confirmBox('데이터 지우기', '이 브라우저의 싱글 플레이 저장과 기록을 모두 지울까요? 되돌릴 수 없어요.', '지우기', 'danger')) return; LS.del('gw-single'); LS.del('gw-records'); toast('지웠어요.', 'ok'); },

    /* --- 게임 --- */
    drawer: d => { if ($(d.d).classList.contains('open')) closeDrawers(); else openDrawer(d.d); },
    selTile: d => { Game.sel = +d.id; const f = Game.V.fleets.find(x => x.tile === +d.id && x.owner === Game.V.me); Game.selFleet = f ? f.id : null; centerOn(+d.id); renderMap(false); renderRight(); },
    endTurn: async () => {
      const V = Game.V, idle = V.fleets.filter(f => f.owner === V.me && f.mp > 0 && !f.acted).length, me = Game.me();
      const body = `<p>턴을 마치고 다음 제국에게 넘깁니다.</p>${idle ? `<p class="small muted">아직 움직일 수 있는 함대 ${idle}개</p>` : ''}${!me.research.cur ? '<p class="small gold">⚠ 진행 중인 연구가 없어요.</p>' : ''}`;
      const r = await doAct({ type: 'end_turn' }, '턴 종료', body, '턴 종료'); if (r) { Game.moving = null; }
    },
    research: () => openModal(researchModal(), { cls: 'wide', render: researchModal }),
    doResearch: d => { const T = GW.TECHS[d.k]; doAct({ type: 'research', tech: d.k }, '연구 시작', `<p><b>${T.ko}</b> — ${T.desc}</p><p>비용 ${costHtml(T.cost, Game.me().res)} · 연구 점수 ${T.rp}</p>`, '연구 시작').then(i => { if (i) toast(`[${T.ko}] 연구를 시작했어요.`, 'ok'); }); },
    build: d => {
      const t = sel();
      if (t && t.owner === Game.V.me && !d.pick) { const id = t.id; openModal(buildModal(id), { render: () => buildModal(id) }); }
      else openModal(pickPlanetModal('건설할 행성 선택', () => true, 'buildAt'));
    },
    buildAt: d => { const id = +d.id; Game.sel = id; renderMap(false); renderRight(); openModal(buildModal(id), { render: () => buildModal(id) }); },
    doBuild: d => {
      const V = Game.V, t = V.tiles[+d.id], B = GW.BUILDINGS[d.b], lv = (t.buildings[d.b] || 0) + 1;
      const cost = GW.buildCost({ players: { [V.me]: Game.me() }, tiles: V.tiles }, V.me, d.b, lv);
      doAct({ type: 'build', tile: t.id, b: d.b }, lv > 1 ? '업그레이드' : '건설', `<p>${esc(t.name)}에 <b>${B.ko} ${lv}단계</b>를 ${lv > 1 ? '업그레이드' : '건설'}합니다.</p><p>${B.desc}</p><p>비용 ${costHtml(cost, Game.me().res)}</p>`, lv > 1 ? '업그레이드' : '건설').then(i => { if (i) toast(`${B.ko} ${lv}단계 완료!`, 'ok'); });
    },
    ships: d => {
      const t = sel();
      if (t && t.owner === Game.V.me && t.buildings.shipyard && !d.pick) { const id = t.id; openModal(shipModal(id), { cls: 'wide', render: null }); }
      else openModal(pickPlanetModal('조선소 선택', t => !!t.buildings.shipyard, 'shipsAt'));
    },
    shipsAt: d => { const id = +d.id; Game.sel = id; renderMap(false); renderRight(); openModal(shipModal(id), { cls: 'wide' }); },
    step: d => { const i = $(d.t); i.value = Math.max(+i.min || 0, Math.min(+i.max || 99, (+i.value || 0) + +d.d)); },
    doShip: async d => {
      const S = GW.SHIPS[d.k], n = Math.max(1, Math.min(20, +$('n-' + d.k).value || 1)), id = +d.id;
      const i = await doAct({ type: 'ship', tile: id, ship: d.k, n }, '함선 생산', `<p><b>${S.ko} ${n}척</b>을 생산합니다.</p><p>비용 ${costHtml(S.cost, Game.me().res, n)} · 유지비 ◎${S.upkeep * n}/턴</p>`, '생산');
      if (i) { toast(`${S.ko} ${n}척 생산 완료!`, 'ok'); openModal(shipModal(id), { cls: 'wide' }); }
    },
    moveMode: d => { closeModal(); closeDrawers(); Game.moving = d.f; Game.selFleet = d.f; renderMap(false); toast('지도에서 이동할 칸을 누르세요.'); },
    cancelMove: () => { Game.moving = null; renderMap(false); },
    attack: d => {
      const V = Game.V, f = myFleet(d.f); if (!f) return;
      const t = V.tiles[f.tile], D = GW.defenderSetup(V, V.me, f.tile); if (!D) return toast('공격할 대상이 없어요.', 'err');
      const odds = Math.round(GW.estimateWin({ ships: f.ships, mods: GW.sideMods(V, V.me, f.tile, false) }, D, 150) * 100);
      const who = sideName(V, D.owner);
      const war = D.owner !== 'pirate' && D.owner !== 'neutral' && GW.rel(V, V.me, D.owner) === 'neutral';
      const body = `<p><b>${esc(t.name)}</b>에서 ${esc(who.empire)}을(를) 공격합니다.</p><div class="kv"><span>내 전력</span><b>${GW.fleetPower(f.ships, V.bonus)}</b><span>상대 함대 전력</span><b>${GW.fleetPower(D.ships, D.mods)}</b><span>행성 방어·수비대</span><b>${Math.round(D.planet)}</b><span>예상 승률</span><b class="${odds >= 60 ? 'green' : odds >= 35 ? 'gold' : 'red'}">${odds}%</b></div>
        ${f.ships.transport && GW.TYPES[t.type].planet && t.owner !== V.me ? '<p class="small teal">수송선이 있어 승리하면 행성을 점령해요 (수송선 1척 소모).</p>' : GW.TYPES[t.type].planet && t.owner !== V.me ? '<p class="small muted">수송선이 없어 이겨도 점령은 못 하고 방어만 무너뜨려요.</p>' : ''}${war ? '<p class="gold">⚠ 중립 관계인 제국을 공격하면 전쟁이 선포됩니다.</p>' : ''}`;
      doAct({ type: 'attack', fleet: f.id }, '공격 명령', body, '⚔ 공격', 'danger');
    },
    colonize: d => { const f = myFleet(d.f); if (!f) return; const t = Game.V.tiles[f.tile]; doAct({ type: 'colonize', fleet: f.id }, '식민', `<p><b>${esc(t.name)}</b>에 식민지를 세웁니다.</p><p>비용 ◎40 ⛏20 · 수송선 1척 소모</p>`, '🚩 식민').then(i => { if (i) toast(`${t.name}을(를) 제국에 편입했어요!`, 'gold'); }); },
    survey: d => { const f = myFleet(d.f); if (!f) return; closeModal(); doAct({ type: 'survey', fleet: f.id }, '지역 조사', `<p><b>${esc(Game.V.tiles[f.tile].name)}</b>을(를) 조사합니다. 이 함대는 이번 턴에 더 이동할 수 없어요.</p>`, '🔭 조사'); },
    split: d => { const f = myFleet(d.f); if (f) openModal(splitModal(f), { cls: 'narrow' }); },
    doSplit: async d => {
      const f = myFleet(d.f); if (!f) return; const ships = {};
      for (const k of Object.keys(f.ships)) { const v = +($('sp-' + k) || {}).value || 0; if (v > 0) ships[k] = v; }
      if (!sum(ships)) return toast('나눌 함선 수를 정하세요.', 'err');
      closeModal();
      const i = await doAct({ type: 'split', fleet: f.id, ships }, '함대 분할', `<p>${GW.SHIP_ORDER.filter(k => ships[k]).map(k => `${GW.SHIPS[k].ko} ${ships[k]}척`).join(', ')}을(를) 새 함대로 분리합니다.</p>`, '분할');
      if (i) { Game.selFleet = i.fleet; renderRight(); }
    },
    merge: d => doAct({ type: 'merge', tile: +d.id }, '함대 합치기', '<p>이 칸의 내 함대를 하나로 합칩니다. 이동력은 가장 적게 남은 함대 기준이 돼요.</p>', '합치기'),
    disband: d => { const f = myFleet(d.f); if (f) doAct({ type: 'disband', fleet: f.id }, '함대 해산', `<p class="red">${GW.sumShips(f.ships)}척을 영구히 해산합니다. 유지비를 아낄 수 있지만 되돌릴 수 없어요.</p>`, '해산', 'danger'); },
    capital: d => doAct({ type: 'capital', tile: +d.id }, '수도 이전', '<p>이 행성을 새 수도로 정합니다. 비용 ◎200 ⛏100</p>', '★ 수도 지정'),
    dip: () => openModal(dipModal(), { cls: 'wide' }),
    dipWith: d => { Game.msgTo = d.pid; openModal(dipModal(), { cls: 'wide' }); },
    respond: d => { const ok = d.ok === '1'; doAct({ type: 'dip_respond', id: d.id, accept: ok }, ok ? '제안 수락' : '제안 거절', ok ? '<p>이 제안을 수락합니다.</p>' : '<p>이 제안을 거절합니다.</p>', ok ? '수락' : '거절', ok ? 'teal' : 'danger').then(i => { if (i) { toast(ok ? '제안을 수락했어요.' : '거절했어요.', 'ok'); openModal(dipModal(), { cls: 'wide' }); } }); },
    propose: d => dipSend(d.pid, 'alliance', '동맹 요청', '동맹을 맺으면 시야를 공유하고 서로 공격할 수 없어요.'),
    proposeNap: d => dipSend(d.pid, 'nap', '불가침 협정 제안', '협정을 맺으면 서로의 영토와 함대 칸에 들어갈 수 없고 공격할 수 없어요.'),
    proposePeace: d => dipSend(d.pid, 'peace', '평화 제안', '수락되면 전쟁이 끝나고 중립 관계가 돼요.'),
    trade: d => openModal(tradeModal(d.pid), { cls: 'narrow' }),
    sendTrade: async d => {
      const give = {}, get = {};
      for (const r of GW.RES) { const g = +$('tg-' + r).value || 0, t = +$('tt-' + r).value || 0; if (g > 0) give[r] = Math.floor(g); if (t > 0) get[r] = Math.floor(t); }
      const txt = o => Object.entries(o).map(([r, v]) => `${GW.RES_ICON[r]}${v}`).join(' ') || '없음';
      const i = await doAct({ type: 'dip_propose', to: d.pid, kind: 'trade', give, get, text: $('tr-text').value }, '거래 제안', `<p>줄 것: ${txt(give)}<br>받을 것: ${txt(get)}</p>`, '제안 보내기');
      if (i) { toast('거래 제안을 보냈어요.', 'ok'); openModal(dipModal(), { cls: 'wide' }); }
    },
    breakRel: d => doAct({ type: 'dip_break', to: d.pid }, '협정 해제', '<p class="gold">협정을 해제하면 중립 관계가 됩니다. 상대에게 알림이 가요.</p>', '해제', 'danger').then(i => { if (i) openModal(dipModal(), { cls: 'wide' }); }),
    declareWar: d => doAct({ type: 'dip_war', to: d.pid }, '전쟁 선포', `<p class="red">${esc(Game.V.players[d.pid].empire)}에게 전쟁을 선포합니다. 모든 제국에 공개돼요.</p>`, '⚔ 선전포고', 'danger').then(i => { if (i) openModal(dipModal(), { cls: 'wide' }); }),
    msgTo: d => { Game.msgTo = d.pid; const s = $('dip-to'); if (s) s.value = d.pid; const i = $('dip-msg'); if (i) i.focus(); },
    sendMsg: async () => {
      const text = $('dip-msg').value.trim(), to = $('dip-to').value; if (!text) return;
      const r = await Game.act({ type: 'msg', to, text });
      if (!r.ok) return toast(r.err, 'err');
      openModal(dipModal(), { cls: 'wide' }); const c = $('dip-chat'); if (c) c.scrollTop = c.scrollHeight;
    },
    explore: () => openModal(exploreModal(), { render: exploreModal }),
    scanHere: () => {
      const t = sel(); if (!t) return toast('스캔할 칸을 먼저 선택하세요.', 'err');
      const cost = Game.V.bonus.vision > 0 ? 15 : 30;
      closeModal(); doAct({ type: 'scan', tile: t.id }, '장거리 스캔', `<p>${esc(t.fog ? '미탐험 지역' : t.name)} 주변 2칸을 스캔합니다. 에너지 ${cost}</p>`, '📡 스캔').then(i => { if (i) toast(`스캔 완료 — 조사할 만한 신호 ${i.signals}곳`, 'ok'); });
    },
    market: () => openModal(marketModal()),
    trade1: async d => {
      const amt = Math.floor(+$('mk-' + d.r).value || 0); if (amt <= 0) return toast('수량을 입력하세요.', 'err');
      const p = GW.marketPrice(Game.V, Game.V.me, d.r, d.s), val = d.s === 'sell' ? Math.floor(amt * p) : Math.ceil(amt * p);
      const i = await doAct({ type: 'market', res: d.r, side: d.s, amt }, d.s === 'sell' ? '자원 판매' : '자원 구매', `<p>${GW.RES_KO[d.r]} ${amt}을(를) ${d.s === 'sell' ? `판매하고 ◎${val}을 받습니다` : `◎${val}에 구매합니다`}.</p>`, d.s === 'sell' ? '판매' : '구매');
      if (i) { toast('거래 완료!', 'ok'); openModal(marketModal()); }
    },
    victory: () => openModal(victoryModal(), { render: victoryModal }),
    econ: () => openModal(econModal(), { cls: 'wide', render: econModal }),
    log: () => openModal(logModal(), { render: logModal }),
    battle: d => { const b = Game.V.battles.find(x => x.id === d.id); if (b) showBattle(b); },
    eventGo: d => { closeModal(); Game.sel = +d.id; centerOn(+d.id); renderMap(false); renderRight(); },
    gameMenu: () => openModal(gameMenu(), { cls: 'narrow' }),
    gameover: () => showGameOver(),
    saveGame: async () => {
      if (Game.mode === 'local') { Local.save(); toast('이 브라우저에 저장했어요.', 'ok'); return; }
      const r = await Net.request({ t: 'save' }); toast(r.ok ? '서버에 저장했어요. 언제든 재접속할 수 있어요.' : r.err, r.ok ? 'ok' : 'err');
    },
    resync: () => { closeModal(); if (Game.mode === 'local') { const s = LS.get('gw-single'); if (s) { Local.s = s; Local.refresh(); Local.pump(); } } else Net.send({ t: 'resync' }); toast('상태를 다시 불러왔어요.', 'ok'); },
    leaveGame: async () => {
      if (Game.mode === 'local') { closeModal(); Local.save(); Game.exit(); return; }
      const ended = Game.V && Game.V.phase === 'ended';
      if (!await confirmBox('게임 나가기', ended ? '<p>로비로 돌아갑니다.</p>' : '<p>게임을 떠나면 AI가 내 제국을 대신 운영해요. 같은 브라우저로 다시 참가하면 제국을 되찾을 수 있어요.</p>', '나가기', 'danger')) return;
      closeModal(); if (!ended) Net.send({ t: 'leave' }); SS.set('gw-screen', 'menu'); Game.exit();
    },
    exitGame: () => { closeModal(); if (Game.mode === 'online') { Net.send({ t: 'leave' }); SS.set('gw-screen', 'menu'); } Game.exit(); },
  };
  function dipSend(to, kind, title, desc) {
    doAct({ type: 'dip_propose', to, kind }, title, `<p>${esc(Game.V.players[to].empire)}에게 ${title.replace(' 제안', '').replace(' 요청', '')}을(를) 제안합니다.</p><p class="small muted">${desc}</p>`, '제안 보내기')
      .then(i => { if (i) { toast('제안을 보냈어요.', 'ok'); openModal(dipModal(), { cls: 'wide' }); } });
  }
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-a]'); if (!el || el.disabled) return;
    const fn = H[el.dataset.a]; if (!fn) return;
    e.preventDefault();
    try { const r = fn(el.dataset, el, e); if (r && r.catch) r.catch(er => { console.error(er); toast('오류: ' + er.message, 'err'); }); }
    catch (er) { console.error(er); toast('오류: ' + er.message, 'err'); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!$('confirm').hidden) confirmDone(false); else if (!$('modal').hidden) closeModal(); else if (Game.moving) { Game.moving = null; renderMap(false); } else closeDrawers(); }
    if (e.key === 'Enter' && e.target.id === 'room-msg') H.roomChat();
    if (e.key === 'Enter' && e.target.id === 'dip-msg') H.sendMsg();
  });
  $('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });
  window.addEventListener('error', e => { toast('예상치 못한 오류가 있었어요. 메뉴 → 상태 다시 불러오기로 복구할 수 있어요.', 'err'); console.error(e.error || e.message); });

  /* ===================================================================
     시작
     =================================================================== */
  function boot() {
    if (!CFG.name) { CFG.name = '사령관' + Math.floor(Math.random() * 900 + 100); CFG.empire = CFG.name + ' 제국'; CFG.color = GW.COLORS[Math.floor(Math.random() * 4)]; CFG.emblem = GW.EMBLEMS[Math.floor(Math.random() * GW.EMBLEMS.length)]; saveCfg(); }
    const wasInGame = SS.get('gw-screen') === 'online-game';
    show('menu'); renderMenu();
    if (wasInGame) SS.set('gw-screen', 'online-game');
    const params = new URLSearchParams(location.search), code = (params.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (serverUrl()) Net.connect();
    if (code) {
      history.replaceState(null, '', location.pathname);
      needServer(async () => {
        const known = Net.roomId === code;
        let password = '';
        if (!known) { password = prompt(`방 ${code}에 참가합니다. 비밀번호가 있다면 입력하세요 (없으면 비워 두기)`) || ''; }
        Net.joining = true; const r = await Net.request({ t: 'join', id: code, password, empire: myEmpire() });
        if (!r.ok) { Net.joining = false; toast(r.err, 'err'); }
      });
    } else if (wasInGame && serverUrl()) {
      Net.wantRoom = () => { if (Net.roomId) { Net.joining = true; Net.send({ t: 'rejoin' }); } };
    }
  }
  boot();
  window.GWUI = { Game, Net, Local, H };
})();
