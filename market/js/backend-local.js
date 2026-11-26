// 체험 모드 백엔드: Firebase 설정 전에 사이트를 둘러보고 기능을 시험해 볼 수 있게 해 줘요.
// 데이터는 이 브라우저의 localStorage 에만 저장되고, 보안이 전혀 없어요. 실제 서비스에는 쓰지 마세요.
// 기능 동작(검증 규칙, 재고·포인트 처리)은 Cloud Functions 와 똑같이 맞춰 두었어요.

import { SIGNUP_BONUS, MAX_QTY, validateUsername, validateNickname, validatePassword, normalizeProduct, newRequestId } from './shared.js';
import { shrinkImage } from './backend-firebase.js';

const DB_KEY = 'tradehub-demo-db-v1';
const SESSION_KEY = 'tradehub-demo-session';

const err = (code, message) => Object.assign(new Error(message), { code });
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const clone = o => JSON.parse(JSON.stringify(o));
const byNewest = (a, b) => b.createdAt - a.createdAt;
const fmt = n => n.toLocaleString('ko-KR');

async function hash(pw) {
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('tradehub:' + pw));
    return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 0; for (const c of 'tradehub:' + pw) h = (h * 31 + c.charCodeAt(0)) | 0; return 'x' + h;
}

const DEMO = [
  ['전설의 화염검 +12', 'game', 48000, 3, '공격력 +240, 화염 속성. 강화 실패 없이 12강 완료된 무기예요.', 21, 14],
  ['한정판 네온 캐릭터 스킨', 'skin', 15000, 10, '시즌 이벤트에서만 얻을 수 있던 네온 테마 스킨이에요.', 35, 22],
  ['인디게임 스팀 키 묶음', 'digital', 9900, 25, '인디 게임 3종 등록 키 묶음. 등록 방법 안내 포함.', 12, 9],
  ['픽셀 드래곤 아크릴 스탠드', 'goods', 12000, 7, '15cm 크기, 받침 포함. 새 상품.', 8, 17],
  ['전략 보드게임 확장팩', 'boardgame', 32000, 4, '기본판이 있어야 플레이할 수 있는 확장팩이에요. 미개봉.', 5, 6],
  ['무선 게이밍 헤드셋', 'electronics', 89000, 2, '7.1 채널, 배터리 30시간. 사용감 거의 없음.', 3, 11],
  ['희귀 펫 알 (무작위)', 'game', 5500, 40, '부화하면 희귀 등급 이상 펫이 나와요.', 44, 8],
  ['골드 프레임 프로필 테두리', 'skin', 3000, 99, '프로필에 금색 테두리가 생겨요.', 18, 4],
  ['OST 디지털 앨범', 'digital', 7700, 50, '24곡 고음질 음원 다운로드 코드.', 9, 12],
  ['한정판 메탈 주사위 세트', 'boardgame', 18000, 6, '금속 재질 7종 주사위 + 파우치.', 14, 19],
  ['기계식 키보드 키캡 세트', 'electronics', 42000, 5, 'PBT 재질, 영문/한글 각인.', 7, 10],
  ['럭키 박스', 'etc', 1000, 0, '무엇이 들었는지 아무도 몰라요. (품절 표시 테스트용)', 60, 25],
];

function demoProducts(now) {
  const out = {};
  DEMO.forEach(([title, category, price, stock, description, soldCount, favCount], i) => {
    const id = 'demo' + i;
    out[id] = {
      id, title, category, price, stock, description, soldCount, favCount, status: 'active', isDemo: true,
      imageUrl: '', imagePath: '', sellerId: 'demo-seller', sellerName: '테스트 상점',
      createdAt: now - (i + 1) * 3600e3, updatedAt: now - (i + 1) * 3600e3,
    };
  });
  return out;
}

async function freshDb() {
  const now = Date.now();
  const db = { users: {}, admins: {}, products: demoProducts(now), trades: {}, pointLogs: {}, notifications: {}, favorites: {}, notices: {} };
  db.users['demo-seller'] = { id: 'demo-seller', username: 'demo_shop', nickname: '테스트 상점', bio: '체험 모드용 가짜 판매자예요.', points: 0, banned: false, purchaseCount: 0, salesCount: 0, createdAt: now - 864e5 * 7, passHash: await hash(crypto.getRandomValues(new Uint32Array(4)).join('')) };
  db.users['admin'] = { id: 'admin', username: 'admin', nickname: '관리자', bio: '', points: 0, banned: false, purchaseCount: 0, salesCount: 0, createdAt: now - 864e5 * 8, passHash: await hash('admin1234') };
  db.admins['admin'] = true;
  db.notices['n1'] = { id: 'n1', title: 'TradeHub 체험 모드에 오신 걸 환영해요', body: '지금은 체험 모드예요. 데이터가 이 브라우저에만 저장돼요.\n\n가입하면 10,000 P를 드려요. 상품을 올리고 사고팔아 보세요.\n관리자 화면은 아이디 admin / 비밀번호 admin1234 로 로그인해서 볼 수 있어요.', pinned: true, authorName: '관리자', createdAt: now - 3600e3 };
  db.notices['n2'] = { id: 'n2', title: '"테스트" 배지가 붙은 상품은 가짜 데이터예요', body: '테스트 상품은 기능 확인용이에요. 실제 서비스(Firebase 모드)에서는 테스트 상품을 살 수 없고, 관리자 화면에서 한 번에 지울 수 있어요.', pinned: false, authorName: '관리자', createdAt: now - 7200e3 };
  return db;
}

export async function createLocalBackend() {
  let db;
  try { db = JSON.parse(localStorage.getItem(DB_KEY)); } catch { db = null; }
  if (!db || !db.users) db = await freshDb();

  const subs = new Set(); // 데이터가 바뀌면 다시 계산할 구독들
  const save = () => {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
    catch { throw err('resource-exhausted', '브라우저 저장 공간이 가득 찼어요. 이미지가 큰 상품을 지워 주세요.'); }
  };
  const changed = () => { save(); subs.forEach(fn => fn()); };
  const subscribe = fn => { subs.add(fn); fn(); return () => subs.delete(fn); };
  save();

  // 다른 탭에서 바뀐 내용도 반영해요.
  window.addEventListener('storage', (e) => {
    if (e.key === DB_KEY && e.newValue) { db = JSON.parse(e.newValue); subs.forEach(fn => fn()); }
    if (e.key === SESSION_KEY) { sessionUid = e.newValue; subs.forEach(fn => fn()); }
  });

  let sessionUid = null;
  try { sessionUid = localStorage.getItem(SESSION_KEY); } catch { /* 무시 */ }
  const me = () => {
    const u = sessionUid && db.users[sessionUid];
    if (!u) return null;
    const { passHash, ...pub } = u;
    return { uid: u.id, ...clone(pub), isAdmin: !!db.admins[u.id] };
  };
  const requireUser = () => {
    const u = me();
    if (!u) throw err('unauthenticated', '로그인이 필요해요.');
    if (u.banned) throw err('permission-denied', '이용이 정지된 계정이에요.');
    return u;
  };
  const requireAdmin = () => { const u = requireUser(); if (!u.isAdmin) throw err('permission-denied', '관리자만 사용할 수 있어요.'); return u; };
  const notify = (to, n) => {
    (db.notifications[to] ||= {});
    const id = uid();
    db.notifications[to][id] = { id, ...n, read: false, createdAt: Date.now() };
  };
  const log = (l) => { const id = uid(); db.pointLogs[id] = { id, ...l, createdAt: Date.now() }; };
  const setSession = (v) => { sessionUid = v; try { v ? localStorage.setItem(SESSION_KEY, v) : localStorage.removeItem(SESSION_KEY); } catch { /* 무시 */ } };
  const wait = () => new Promise(r => setTimeout(r, 120)); // 서버 응답처럼 아주 살짝 기다려요

  async function imageFromFile(file) {
    const blob = await shrinkImage(file, 640, 0.75);
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  }

  return {
    mode: 'local',
    canBuyDemo: true,

    onAuth(cb) {
      let last;
      return subscribe(() => { const u = me(); const k = JSON.stringify(u); if (k !== last) { last = k; cb(u); } });
    },
    get user() { return me(); },

    async signUp(username, password, nickname) {
      await wait();
      const e = validateUsername(username) || validatePassword(password) || validateNickname(nickname);
      if (e) throw err('invalid-argument', e);
      if (Object.values(db.users).some(u => u.username === username)) throw err('auth/email-already-in-use', '이미 사용 중인 아이디예요.');
      const id = uid();
      db.users[id] = { id, username, nickname: nickname.trim(), bio: '', points: SIGNUP_BONUS, banned: false, purchaseCount: 0, salesCount: 0, createdAt: Date.now(), passHash: await hash(password) };
      log({ uid: id, delta: SIGNUP_BONUS, balance: SIGNUP_BONUS, type: 'signup', memo: '가입 축하 포인트', refId: '' });
      notify(id, { type: 'points', title: '가입을 환영해요!', body: `가입 축하 포인트 ${fmt(SIGNUP_BONUS)} P가 들어왔어요.`, link: '#/me/points' });
      setSession(id);
      changed();
    },
    async signIn(username, password) {
      await wait();
      const u = Object.values(db.users).find(x => x.username === username);
      if (!u || u.passHash !== await hash(password)) throw err('auth/invalid-credential', '아이디 또는 비밀번호가 맞지 않아요.');
      if (u.banned) throw err('auth/user-disabled', '이용이 정지된 계정이에요. 관리자에게 문의해 주세요.');
      setSession(u.id);
      changed();
    },
    async signOut() { setSession(null); changed(); },

    watchProducts(cb) {
      return subscribe(() => cb(Object.values(db.products).filter(p => p.status === 'active').map(clone)));
    },
    watchProduct(id, cb) {
      return subscribe(() => {
        const p = db.products[id];
        const u = me();
        cb(p && (p.status === 'active' || (u && (u.uid === p.sellerId || u.isAdmin))) ? clone(p) : null);
      });
    },
    async myProducts() {
      const u = requireUser();
      return Object.values(db.products).filter(p => p.sellerId === u.uid).map(clone).sort(byNewest);
    },
    async createProduct(data, imageFile) {
      const u = requireUser();
      const { value, error } = normalizeProduct(data);
      if (error) throw err('invalid-argument', error);
      const imageUrl = imageFile ? await imageFromFile(imageFile) : '';
      const id = uid();
      db.products[id] = { id, ...value, imageUrl, imagePath: '', sellerId: u.uid, sellerName: u.nickname, soldCount: 0, favCount: 0, isDemo: false, createdAt: Date.now(), updatedAt: Date.now() };
      changed();
      return id;
    },
    async updateProduct(id, data, imageFile, removeOldImage) {
      const u = requireUser();
      const p = db.products[id];
      if (!p || p.sellerId !== u.uid) throw err('permission-denied', '권한이 없어요.');
      if (p.hiddenByAdmin) throw err('permission-denied', '관리자가 숨긴 상품은 수정할 수 없어요.');
      const { value, error } = normalizeProduct(data);
      if (error) throw err('invalid-argument', error);
      Object.assign(p, value, { updatedAt: Date.now() });
      if (imageFile) p.imageUrl = await imageFromFile(imageFile);
      else if (removeOldImage) p.imageUrl = '';
      changed();
    },
    async deleteProduct(id) {
      const u = requireUser();
      const p = db.products[id];
      if (!p) return;
      if (p.sellerId !== u.uid && !u.isAdmin) throw err('permission-denied', '권한이 없어요.');
      delete db.products[id];
      changed();
    },

    newRequestId,
    async purchase(productId, qty, expectedPrice, requestId) {
      await wait();
      const u = requireUser();
      if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw err('invalid-argument', '수량 값이 올바르지 않아요.');
      const tradeId = `${u.uid}_${requestId}`;
      if (db.trades[tradeId]) return { tradeId, duplicate: true, total: db.trades[tradeId].total };
      const p = db.products[productId];
      if (!p) throw err('not-found', '상품이 삭제되었거나 찾을 수 없어요.');
      if (p.status !== 'active') throw err('failed-precondition', '지금은 판매하지 않는 상품이에요.');
      if (p.sellerId === u.uid) throw err('failed-precondition', '내가 등록한 상품은 살 수 없어요.');
      if (p.price !== expectedPrice) throw err('aborted', '그사이 가격이 바뀌었어요. 가격을 확인하고 다시 시도해 주세요.');
      if (p.stock < qty) throw err('failed-precondition', p.stock > 0 ? `재고가 ${p.stock}개만 남았어요.` : '품절된 상품이에요.');
      const buyer = db.users[u.uid];
      const seller = db.users[p.sellerId];
      if (!seller) throw err('failed-precondition', '판매자 정보를 찾을 수 없어요.');
      if (seller.banned) throw err('failed-precondition', '판매가 중지된 판매자의 상품이에요.');
      const total = p.price * qty;
      if (buyer.points < total) throw err('failed-precondition', `포인트가 부족해요. (필요 ${fmt(total)} P)`);
      buyer.points -= total; buyer.purchaseCount++;
      seller.points += total; seller.salesCount++;
      p.stock -= qty; p.soldCount += qty;
      db.trades[tradeId] = { id: tradeId, productId, productTitle: p.title, productImage: p.imageUrl, category: p.category, buyerId: u.uid, buyerName: buyer.nickname, sellerId: p.sellerId, sellerName: seller.nickname, qty, unitPrice: p.price, total, isDemo: !!p.isDemo, createdAt: Date.now() };
      log({ uid: u.uid, delta: -total, balance: buyer.points, type: 'purchase', memo: `${p.title} ×${qty} 구매`, refId: tradeId });
      log({ uid: p.sellerId, delta: total, balance: seller.points, type: 'sale', memo: `${p.title} ×${qty} 판매`, refId: tradeId });
      notify(u.uid, { type: 'purchase', title: '구매 완료', body: `${p.title} ×${qty} — ${fmt(total)} P를 사용했어요.`, link: '#/me/purchases' });
      notify(p.sellerId, { type: 'sale', title: '상품이 팔렸어요!', body: `${buyer.nickname}님이 ${p.title} ×${qty}를 구매했어요. +${fmt(total)} P`, link: '#/me/sales' });
      changed();
      return { tradeId, duplicate: false, total, balance: buyer.points };
    },
    async myTrades() {
      const u = requireUser();
      const all = Object.values(db.trades);
      return { purchases: all.filter(t => t.buyerId === u.uid).map(clone).sort(byNewest), sales: all.filter(t => t.sellerId === u.uid).map(clone).sort(byNewest) };
    },
    async myPointLogs() {
      const u = requireUser();
      return Object.values(db.pointLogs).filter(l => l.uid === u.uid).map(clone).sort(byNewest);
    },

    watchFavorites(cb) {
      return subscribe(() => { const u = me(); cb(new Set(u ? Object.keys(db.favorites[u.uid] || {}) : [])); });
    },
    async toggleFavorite(productId) {
      const u = requireUser();
      const p = db.products[productId];
      if (!p) throw err('not-found', '상품을 찾을 수 없어요.');
      const favs = (db.favorites[u.uid] ||= {});
      let favorited;
      if (favs[productId]) { delete favs[productId]; p.favCount = Math.max(0, p.favCount - 1); favorited = false; }
      else { favs[productId] = Date.now(); p.favCount++; favorited = true; }
      changed();
      return { favorited };
    },

    watchNotifications(cb) {
      return subscribe(() => { const u = me(); cb(u ? Object.values(db.notifications[u.uid] || {}).map(clone).sort(byNewest) : []); });
    },
    async markNotificationsRead(ids) {
      const u = requireUser();
      ids.forEach(id => { const n = (db.notifications[u.uid] || {})[id]; if (n) n.read = true; });
      changed();
    },
    async deleteNotification(id) {
      const u = requireUser();
      delete (db.notifications[u.uid] || {})[id];
      changed();
    },

    watchNotices(cb) { return subscribe(() => cb(Object.values(db.notices).map(clone).sort(byNewest))); },

    async updateProfile({ nickname, bio }) {
      const u = requireUser();
      const e = validateNickname(nickname);
      if (e) throw err('invalid-argument', e);
      if ((bio || '').length > 200) throw err('invalid-argument', '소개는 200자까지 쓸 수 있어요.');
      const rec = db.users[u.uid];
      rec.nickname = nickname.trim(); rec.bio = (bio || '').trim();
      Object.values(db.products).forEach(p => { if (p.sellerId === u.uid) p.sellerName = rec.nickname; });
      changed();
    },

    admin: {
      async users() { requireAdmin(); return Object.values(db.users).map(({ passHash, ...u }) => clone(u)).sort(byNewest); },
      async products() { requireAdmin(); return Object.values(db.products).map(clone).sort(byNewest); },
      async trades() { requireAdmin(); return Object.values(db.trades).map(clone).sort(byNewest); },
      async pointLogs() { requireAdmin(); return Object.values(db.pointLogs).map(clone).sort(byNewest); },
      async adjustPoints(target, delta, memo) {
        const a = requireAdmin();
        if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1e8) throw err('invalid-argument', '포인트 값이 올바르지 않아요.');
        const u = db.users[target];
        if (!u) throw err('not-found', '회원을 찾을 수 없어요.');
        if (u.points + delta < 0) throw err('failed-precondition', `잔액보다 많이 회수할 수 없어요. (현재 ${fmt(u.points)} P)`);
        u.points += delta;
        memo = (memo || '').trim().slice(0, 100);
        log({ uid: target, delta, balance: u.points, type: delta > 0 ? 'admin_grant' : 'admin_revoke', memo: memo || (delta > 0 ? '관리자 지급' : '관리자 회수'), refId: '', adminId: a.uid });
        notify(target, { type: 'points', title: delta > 0 ? '포인트 지급' : '포인트 회수', body: `관리자가 ${fmt(Math.abs(delta))} P를 ${delta > 0 ? '지급' : '회수'}했어요.${memo ? ` (${memo})` : ''}`, link: '#/me/points' });
        changed();
        return { balance: u.points };
      },
      async setBan(target, banned) {
        const a = requireAdmin();
        if (target === a.uid) throw err('failed-precondition', '자기 자신은 정지할 수 없어요.');
        const u = db.users[target];
        if (!u) throw err('not-found', '회원을 찾을 수 없어요.');
        u.banned = !!banned;
        Object.values(db.products).forEach(p => {
          if (p.sellerId !== target) return;
          if (banned && p.status === 'active') { p.status = 'hidden'; p.hiddenByAdmin = true; }
          if (!banned && p.hiddenByAdmin) { p.status = 'active'; delete p.hiddenByAdmin; }
        });
        changed();
        return { banned: u.banned };
      },
      async setProductStatus(id, status) { requireAdmin(); const p = db.products[id]; if (p) { p.status = status; p.updatedAt = Date.now(); changed(); } },
      async deleteProduct(id) { requireAdmin(); delete db.products[id]; changed(); },
      async createNotice({ title, body, pinned }) {
        const a = requireAdmin(); const id = uid();
        db.notices[id] = { id, title, body, pinned: !!pinned, authorName: a.nickname, createdAt: Date.now() };
        changed();
      },
      async updateNotice(id, { title, body, pinned }) { requireAdmin(); Object.assign(db.notices[id], { title, body, pinned: !!pinned }); changed(); },
      async deleteNotice(id) { requireAdmin(); delete db.notices[id]; changed(); },
      async seedDemo() {
        requireAdmin();
        const fresh = demoProducts(Date.now());
        Object.values(fresh).forEach(p => { const id = 'demo' + uid(); db.products[id] = { ...p, id }; });
        changed();
        return { count: Object.keys(fresh).length };
      },
      async clearDemo() {
        requireAdmin();
        const ids = Object.keys(db.products).filter(k => db.products[k].isDemo);
        ids.forEach(k => delete db.products[k]);
        changed();
        return { count: ids.length };
      },
      async resetAll() { db = await freshDb(); setSession(null); changed(); },
    },
  };
}
