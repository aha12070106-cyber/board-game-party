/* ===================================================================
   GALACTIC WAR — 온라인 멀티플레이 서버 (권위 서버)
   - 게임 상태는 서버에만 있고, 클라이언트는 행동을 "요청"만 합니다.
   - 모든 행동은 galactic-war/engine.js 의 act()로 검증한 뒤 적용합니다.
   - 플레이어마다 안개가 걸린 화면(view)만 보내서 숨은 정보가 새지 않아요.
   - 방과 게임은 data/ 폴더에 저장되어 서버가 다시 켜져도 이어서 할 수 있어요.
   =================================================================== */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');
const GW = require('./galactic-war/engine.js');

module.exports = function createGalacticWar(opts) {
  const DATA = opts.dataDir || path.join(__dirname, 'data');
  const FILE = path.join(DATA, 'gw-state.json'), RECS = path.join(DATA, 'gw-records.json');
  try { fs.mkdirSync(DATA, { recursive: true }); } catch (e) { /* 읽기 전용이면 메모리만 사용 */ }

  const rooms = new Map();       // id -> room
  const idents = {};             // pid -> secret hash
  let records = [];
  const conns = new Map();       // pid -> Set<ws>

  /* ---------- 저장 / 불러오기 ---------- */
  function load() {
    try {
      const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      for (const r of j.rooms || []) rooms.set(r.id, r);
      Object.assign(idents, j.idents || {});
      console.log(`[GW] 저장된 방 ${rooms.size}개를 불러왔어요.`);
    } catch (e) { if (e.code !== 'ENOENT') console.warn('[GW] 저장 파일을 읽지 못했어요:', e.message); }
    try { records = JSON.parse(fs.readFileSync(RECS, 'utf8')); } catch (e) { records = []; }
  }
  let saveT = null;
  function writeAtomic(file, data) {
    try { const tmp = file + '.tmp'; fs.writeFileSync(tmp, data); fs.renameSync(tmp, file); return true; }
    catch (e) { console.warn('[GW] 저장 실패:', e.message); return false; }
  }
  function saveNow() {
    clearTimeout(saveT); saveT = null;
    return writeAtomic(FILE, JSON.stringify({ rooms: [...rooms.values()], idents }));
  }
  function scheduleSave() { if (!saveT) saveT = setTimeout(saveNow, 1500); }
  load();

  /* ---------- 도구 ---------- */
  const hash = s => crypto.createHash('sha256').update('gw:' + s).digest('hex');
  const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
  const newRoomId = () => { let id; do { id = Array.from(crypto.randomBytes(5)).map(b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join(''); } while (rooms.has(id)); return id; };
  const online = pid => !!(conns.get(pid) && conns.get(pid).size);
  function send(ws, m) { if (ws.readyState === 1) ws.send(JSON.stringify(m)); }
  function sendPid(pid, m) { const set = conns.get(pid); if (set) for (const ws of set) send(ws, m); }

  function cleanSettings(x, prev) {
    x = x || {}; prev = prev || {};
    const V = x.victory || prev.victory || {};
    return {
      mapSize: GW.MAP_SIZES[x.mapSize] ? x.mapSize : (prev.mapSize || 'medium'),
      speed: GW.SPEEDS[x.speed] ? x.speed : (prev.speed || 'normal'),
      victory: {
        conquest: V.conquest !== false, conquestPct: Math.max(30, Math.min(90, Number(V.conquestPct) || 60)),
        economy: V.economy !== false, economyTarget: Math.max(1000, Math.min(50000, Number(V.economyTarget) || 6000)),
        science: V.science !== false, empire: true, roundLimit: Math.max(5, Math.min(200, Number(V.roundLimit) || 40)),
      },
    };
  }
  function cleanEmpire(e, name, room, pid) {
    e = e || {};
    const used = room ? room.members.filter(m => m.pid !== pid).map(m => m.color) : [];
    let color = GW.COLORS.includes(e.color) ? e.color : null;
    if (!color || used.includes(color)) color = GW.COLORS.find(c => !used.includes(c)) || GW.COLORS[0];
    const nm = clean(name || e.name, 16) || '사령관';
    return { name: nm, empire: clean(e.empire, 20) || nm + ' 제국', color, emblem: GW.EMBLEMS.includes(e.emblem) ? e.emblem : GW.EMBLEMS[Math.floor(Math.random() * GW.EMBLEMS.length)] };
  }

  function roomInfo(r) {
    return {
      id: r.id, name: r.name, host: r.host, hostName: (r.members.find(m => m.pid === r.host) || {}).name || '?', max: r.max, isPublic: r.isPublic, locked: !!r.pwHash,
      settings: r.settings, status: r.status, round: r.game ? r.game.round : 0,
      members: r.members.map(m => ({ pid: m.pid, name: m.name, empire: m.empire, color: m.color, emblem: m.emblem, bot: !!m.bot, online: m.bot || online(m.pid), left: !!m.left })),
      chat: (r.chat || []).slice(-40),
    };
  }
  function roomList() {
    return [...rooms.values()].filter(r => r.status !== 'ended').map(r => {
      const i = roomInfo(r); delete i.chat;
      i.count = r.members.length; return i;
    }).sort((a, b) => (a.status === 'lobby' ? 0 : 1) - (b.status === 'lobby' ? 0 : 1));
  }
  function pushRoom(r) {
    const info = roomInfo(r);
    for (const m of r.members) if (!m.bot) sendPid(m.pid, { t: 'room', room: info });
    if (r.game) pushViews(r);
  }
  function pushViews(r) {
    if (!r.game) return;
    for (const pid of r.game.order) { const p = r.game.players[pid]; p.connected = p.bot || online(pid); }
    for (const m of r.members) {
      if (m.bot || !online(m.pid)) continue;
      try { sendPid(m.pid, { t: 'view', view: GW.view(r.game, m.pid), now: Date.now() }); }
      catch (e) { console.error('[GW] view 오류', e); }
    }
  }
  function broadcastLobbyList() {
    const list = roomList();
    for (const set of conns.values()) for (const ws of set) if (ws.wantsList) send(ws, { t: 'rooms', rooms: list });
  }
  function memberRoom(pid) { for (const r of rooms.values()) if (r.members.some(m => m.pid === pid && !m.left) && r.status !== 'ended') return r; return null; }

  function commit(r, state) {
    r.game = state; r.updated = Date.now();
    if (state.phase === 'ended' && r.status !== 'ended') finish(r);
    pushViews(r); scheduleSave();
  }
  function finish(r) {
    r.status = 'ended';
    const g = r.game;
    const rec = {
      id: g.id, room: r.name, mode: 'online', endedAt: Date.now(), rounds: g.round, map: g.settings.mapSize, winner: g.winner,
      winnerName: g.players[g.winner] ? g.players[g.winner].empire : '?', reason: g.winReason, players: g.final,
    };
    records.unshift(rec); records = records.slice(0, 200);
    writeAtomic(RECS, JSON.stringify(records));
    pushRoom(r); broadcastLobbyList();
  }

  /* ---------- 방 관리 ---------- */
  function joinRoom(ws, r, empire) {
    const pid = ws.pid;
    const cur = memberRoom(pid);
    if (cur && cur !== r) return send(ws, { t: 'err', msg: '이미 다른 방에 참가 중입니다. 먼저 나가 주세요.' });
    let m = r.members.find(x => x.pid === pid);
    if (m) {
      // 재접속: 나갔다가 돌아오면 AI에게 맡겼던 제국을 되찾음
      if (m.left) { m.left = false; if (r.game && r.game.players[pid]) { r.game.players[pid].bot = false; } }
    } else {
      if (r.status !== 'lobby') return send(ws, { t: 'err', msg: '이미 시작된 게임에는 새로 참가할 수 없습니다.' });
      if (r.members.length >= r.max) return send(ws, { t: 'err', msg: '방이 가득 찼습니다.' });
      m = Object.assign({ pid, bot: false }, cleanEmpire(empire, ws.name, r, pid));
      r.members.push(m);
      sys(r, `${m.name}님이 입장했습니다.`);
    }
    ws.roomId = r.id;
    pushRoom(r); broadcastLobbyList(); scheduleSave();
  }
  function sys(r, text) { r.chat = r.chat || []; r.chat.push({ from: null, text, t: Date.now() }); if (r.chat.length > 80) r.chat.shift(); }
  function leaveRoom(ws) {
    const r = memberRoom(ws.pid); if (!r) return send(ws, { t: 'left' });
    const m = r.members.find(x => x.pid === ws.pid);
    if (r.status === 'lobby') {
      r.members = r.members.filter(x => x !== m);
      sys(r, `${m.name}님이 나갔습니다.`);
      if (r.host === ws.pid) { const nh = r.members.find(x => !x.bot); if (nh) { r.host = nh.pid; sys(r, `${nh.name}님이 새 방장이 되었습니다.`); } }
      if (!r.members.some(x => !x.bot)) rooms.delete(r.id);
    } else {
      // 게임 중: AI가 제국을 대신 운영 (재접속 시 되찾을 수 있음)
      m.left = true;
      if (r.game && r.game.players[ws.pid]) r.game.players[ws.pid].bot = true;
      sys(r, `${m.name}님이 게임을 떠났습니다. AI가 제국을 대신 운영합니다.`);
      if (r.host === ws.pid) { const nh = r.members.find(x => !x.bot && !x.left); if (nh) r.host = nh.pid; }
      if (!r.members.some(x => !x.bot && !x.left)) { r.status = 'ended'; r.abandoned = true; }
    }
    ws.roomId = null;
    send(ws, { t: 'left' });
    pushRoom(r); broadcastLobbyList(); scheduleSave();
  }

  /* ---------- 메시지 처리 ---------- */
  function onMsg(ws, msg) {
    const pid = ws.pid;
    const reply = (ok, extra) => send(ws, Object.assign({ t: 'res', req: msg.req, ok }, extra || {}));
    const err = m => { send(ws, { t: 'err', msg: m, req: msg.req }); };
    const r = memberRoom(pid);
    const isHost = r && r.host === pid;
    switch (msg.t) {
      case 'rooms': ws.wantsList = true; return send(ws, { t: 'rooms', rooms: roomList() });
      case 'records': return send(ws, { t: 'records', records: records.slice(0, 50) });
      case 'name': ws.name = clean(msg.name, 16) || ws.name; return;

      case 'create': {
        if (r) return err('이미 참가 중인 방이 있습니다. 먼저 나가 주세요.');
        if ([...rooms.values()].filter(x => x.host === pid && x.status === 'lobby').length) return err('이미 만든 방이 있습니다.');
        const id = newRoomId();
        const nr = {
          id, name: clean(msg.name, 24) || `${ws.name}의 은하`, host: pid, max: Math.max(2, Math.min(4, Number(msg.max) || 4)),
          isPublic: msg.isPublic !== false, pwHash: msg.password ? hash(id + ':' + clean(msg.password, 32)) : null,
          settings: cleanSettings(msg.settings), members: [], status: 'lobby', game: null, chat: [], created: Date.now(), updated: Date.now(),
        };
        rooms.set(id, nr);
        joinRoom(ws, nr, msg.empire);
        return reply(true, { room: id });
      }
      case 'join': {
        const target = rooms.get(clean(msg.id, 10).toUpperCase());
        if (!target || target.status === 'ended') return err('방을 찾을 수 없습니다.');
        const already = target.members.some(m => m.pid === pid);
        if (target.pwHash && !already && hash(target.id + ':' + clean(msg.password, 32)) !== target.pwHash) return err('비밀번호가 틀렸습니다.');
        joinRoom(ws, target, msg.empire);
        return reply(true, { room: target.id });
      }
      case 'quick': {
        if (r) { joinRoom(ws, r); return reply(true, { room: r.id }); }
        const open = [...rooms.values()].find(x => x.status === 'lobby' && x.isPublic && !x.pwHash && x.members.length < x.max);
        if (open) { joinRoom(ws, open, msg.empire); return reply(true, { room: open.id }); }
        const id = newRoomId();
        const nr = { id, name: `빠른 게임 ${id.slice(0, 3)}`, host: pid, max: 4, isPublic: true, pwHash: null, settings: cleanSettings({}), members: [], status: 'lobby', game: null, chat: [], created: Date.now(), updated: Date.now() };
        rooms.set(id, nr); joinRoom(ws, nr, msg.empire);
        return reply(true, { room: id, created: true });
      }
      case 'rejoin': {
        if (!r) return send(ws, { t: 'left' });
        joinRoom(ws, r); return;
      }
      case 'leave': return leaveRoom(ws);
    }

    if (!r) return err('참가 중인 방이 없습니다.');
    switch (msg.t) {
      case 'settings': {
        if (!isHost) return err('방장만 설정을 바꿀 수 있습니다.');
        if (r.status !== 'lobby') return err('게임이 이미 시작되었습니다.');
        r.settings = cleanSettings(msg.settings, r.settings);
        if (msg.max) { const mx = Math.max(2, Math.min(4, Number(msg.max))); if (mx >= r.members.length) r.max = mx; }
        if (msg.name) r.name = clean(msg.name, 24) || r.name;
        if (typeof msg.isPublic === 'boolean') r.isPublic = msg.isPublic;
        if (typeof msg.password === 'string') r.pwHash = msg.password ? hash(r.id + ':' + clean(msg.password, 32)) : null;
        pushRoom(r); broadcastLobbyList(); scheduleSave(); return reply(true);
      }
      case 'empire': {
        if (r.status !== 'lobby') return err('게임 중에는 제국을 바꿀 수 없습니다.');
        const m = r.members.find(x => x.pid === pid);
        Object.assign(m, cleanEmpire(msg.empire, msg.empire && msg.empire.name || m.name, r, pid));
        pushRoom(r); scheduleSave(); return reply(true);
      }
      case 'add_bot': {
        if (!isHost) return err('방장만 AI를 추가할 수 있습니다.');
        if (r.status !== 'lobby') return err('게임이 이미 시작되었습니다.');
        if (r.members.length >= r.max) return err('방이 가득 찼습니다.');
        const names = ['오메가 AI', '네메시스 AI', '타이탄 AI', '헬리오스 AI', '아테나 AI'];
        const nm = names.find(n => !r.members.some(m => m.name === n)) || 'AI';
        const bpid = 'bot' + crypto.randomBytes(4).toString('hex');
        r.members.push(Object.assign({ pid: bpid, bot: true }, cleanEmpire({ empire: nm.replace(' AI', '') + ' 연합' }, nm, r, bpid)));
        pushRoom(r); broadcastLobbyList(); scheduleSave(); return reply(true);
      }
      case 'kick': {
        if (!isHost) return err('방장만 내보낼 수 있습니다.');
        if (r.status !== 'lobby') return err('게임 중에는 내보낼 수 없습니다.');
        const target = String(msg.pid);
        if (target === pid) return err('자기 자신은 내보낼 수 없습니다.');
        const m = r.members.find(x => x.pid === target); if (!m) return;
        r.members = r.members.filter(x => x !== m);
        sys(r, `${m.name}님이 방에서 제외되었습니다.`);
        if (!m.bot) { sendPid(target, { t: 'left', kicked: true }); }
        pushRoom(r); broadcastLobbyList(); scheduleSave(); return reply(true);
      }
      case 'chat': {
        const text = clean(msg.text, 200); if (!text) return;
        const m = r.members.find(x => x.pid === pid);
        r.chat = r.chat || []; r.chat.push({ from: pid, name: m.name, color: m.color, text, t: Date.now() }); if (r.chat.length > 80) r.chat.shift();
        pushRoom(r); return;
      }
      case 'start': {
        if (!isHost) return err('방장만 게임을 시작할 수 있습니다.');
        if (r.status !== 'lobby') return err('이미 시작되었습니다.');
        if (r.members.length < 2) return err('2명 이상(AI 포함) 있어야 시작할 수 있습니다.');
        try {
          r.game = GW.newGame(Object.assign({ id: 'g' + r.id + Date.now().toString(36), name: r.name }, r.settings), r.members.map(m => ({ pid: m.pid, name: m.name, empire: m.empire, color: m.color, emblem: m.emblem, bot: m.bot })));
        } catch (e) { console.error(e); return err('게임 생성 중 오류가 발생했습니다. 다시 시도해 주세요.'); }
        r.status = 'playing';
        sys(r, '게임이 시작되었습니다!');
        pushRoom(r); broadcastLobbyList(); saveNow(); return reply(true);
      }
      case 'act': {
        if (r.status !== 'playing' || !r.game) return err('진행 중인 게임이 없습니다.');
        const res = GW.act(r.game, pid, msg.a);
        if (!res.ok) { if (res.crash) console.error('[GW] 엔진 오류', res.err, msg.a); return reply(false, { err: res.err }); }
        commit(r, res.state);
        return reply(true, { info: res.info });
      }
      case 'resync': if (r.game) send(ws, { t: 'view', view: GW.view(r.game, pid), now: Date.now() }); return send(ws, { t: 'room', room: roomInfo(r) });
      case 'save': {
        const ok = saveNow();
        return ok ? reply(true) : err('저장에 실패했습니다. 서버 디스크를 확인해 주세요.');
      }
    }
  }

  /* ---------- 서버 루프: AI 턴, 턴 시간 제한, 접속 끊김 처리 ---------- */
  const busy = new Set();
  setInterval(() => {
    const now = Date.now();
    for (const r of rooms.values()) {
      if (r.status !== 'playing' || !r.game || busy.has(r.id)) continue;
      const g = r.game; if (g.phase !== 'playing') { if (r.status === 'playing') finish(r); continue; }
      const pid = g.order[g.turnIdx], p = g.players[pid];
      const elapsed = now - (g.turnStart || now);
      busy.add(r.id);
      try {
        if (p.bot) {
          if (elapsed > 1200) commit(r, GW.aiPlay(g, pid));
        } else if (g.settings.turnTime && elapsed > g.settings.turnTime * 1000) {
          commit(r, GW.forceEndTurn(g));
        } else if (!online(pid) && elapsed > 60000) {
          commit(r, GW.forceEndTurn(g));
        }
        // 상태가 그대로면 (AI가 턴을 못 끝낸 경우) 강제 진행
        if (r.game === g && p.bot && elapsed > 8000) commit(r, GW.forceEndTurn(g));
      } catch (e) {
        console.error('[GW] 루프 오류 — 턴을 넘겨 복구합니다', e);
        try { commit(r, GW.forceEndTurn(g)); } catch (e2) { console.error(e2); }
      } finally { busy.delete(r.id); }
    }
  }, 500);
  // 오래된 방 정리
  setInterval(() => {
    const now = Date.now(); let ch = false;
    for (const [id, r] of rooms) {
      const idle = now - (r.updated || r.created);
      const anyone = r.members.some(m => !m.bot && online(m.pid));
      if ((r.status === 'lobby' && !anyone && idle > 3 * 3600e3) || (r.status === 'ended' && idle > 24 * 3600e3) || (!anyone && idle > 14 * 24 * 3600e3)) { rooms.delete(id); ch = true; }
    }
    if (ch) scheduleSave();
  }, 600e3);

  /* ---------- 웹소켓 ---------- */
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 });
  wss.on('connection', ws => {
    ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
    ws.bucket = 30; ws.last = Date.now();
    ws.on('message', data => {
      const now = Date.now(); ws.bucket = Math.min(30, ws.bucket + (now - ws.last) / 50); ws.last = now;
      if (ws.bucket < 1) return; ws.bucket--;
      let msg; try { msg = JSON.parse(String(data)); } catch (e) { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'hello') {
        const pid = String(msg.pid || '').replace(/[^a-z0-9]/gi, '').slice(0, 24), secret = String(msg.secret || '').slice(0, 64);
        if (pid.length < 8 || secret.length < 16 || pid.startsWith('bot')) return send(ws, { t: 'auth', ok: false, msg: '잘못된 접속 정보' });
        const h = hash(secret);
        if (idents[pid] && idents[pid] !== h) return send(ws, { t: 'auth', ok: false, msg: '다른 기기에서 사용 중인 ID입니다. 새 ID로 접속합니다.' });
        if (!idents[pid]) { idents[pid] = h; scheduleSave(); }
        ws.pid = pid; ws.name = clean(msg.name, 16) || '사령관';
        if (!conns.has(pid)) conns.set(pid, new Set());
        conns.get(pid).add(ws);
        const r = memberRoom(pid);
        send(ws, { t: 'welcome', pid, room: r ? r.id : null, roomStatus: r ? r.status : null, now: Date.now() });
        if (r) { send(ws, { t: 'room', room: roomInfo(r) }); pushRoom(r); }
        return;
      }
      if (!ws.pid) return send(ws, { t: 'auth', ok: false, msg: '먼저 접속(hello)이 필요합니다' });
      try { onMsg(ws, msg); } catch (e) { console.error('[GW] 메시지 처리 오류', e); send(ws, { t: 'err', msg: '서버 처리 중 오류가 발생했습니다. 상태를 다시 불러옵니다.', req: msg.req }); const r = memberRoom(ws.pid); if (r && r.game) send(ws, { t: 'view', view: GW.view(r.game, ws.pid), now: Date.now() }); }
    });
    ws.on('close', () => {
      if (ws.pid && conns.has(ws.pid)) {
        conns.get(ws.pid).delete(ws);
        if (!conns.get(ws.pid).size) { conns.delete(ws.pid); const r = memberRoom(ws.pid); if (r) pushRoom(r); }
      }
    });
  });
  setInterval(() => { wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; try { ws.ping(); } catch (e) { /* */ } }); }, 30000);

  process.on('SIGTERM', () => { saveNow(); process.exit(0); });
  process.on('SIGINT', () => { saveNow(); process.exit(0); });

  return {
    handleUpgrade(req, socket, head) { wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req)); },
    saveNow,
  };
};
