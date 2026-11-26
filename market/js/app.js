// TradeHub 화면 (해시 라우터 + 화면별 렌더 함수)

import { firebaseConfig, functionsRegion, useEmulators } from './firebase-config.js';
import {
  CATEGORIES, categoryOf, fmtP, normalizeProduct, validateUsername, validateNickname, validatePassword,
  friendlyError, MAX_QTY, SIGNUP_BONUS,
} from './shared.js';
import { $, $$, esc, toast, modal, confirmDialog, promptDialog, timeAgo, fmtDate, thumb, debounce } from './ui.js';

const state = {
  api: null, user: null, authReady: false,
  products: [], productsLoaded: false,
  favorites: new Set(), notifications: [], notices: [],
};
const view = { el: null, name: '', live: [], cleanup: [] };
let userSubs = [];
let notifInitialized = false;

// ─────────────────────────────────────────────── 시작

async function boot() {
  const params = new URLSearchParams(location.search);
  const onLocalhost = ['localhost', '127.0.0.1'].includes(location.hostname);
  const wantEmulator = onLocalhost && (useEmulators || params.has('emulator'));
  view.el = $('#view');
  try {
    if (params.has('demo') || (!firebaseConfig && !wantEmulator)) {
      const { createLocalBackend } = await import('./backend-local.js');
      state.api = await createLocalBackend();
      $('#mode-banner').hidden = false;
    } else {
      const { createFirebaseBackend } = await import('./backend-firebase.js');
      const config = firebaseConfig || {
        apiKey: 'demo-key', authDomain: 'demo-tradehub.firebaseapp.com', projectId: 'demo-tradehub',
        storageBucket: 'demo-tradehub.appspot.com', appId: 'demo',
      };
      state.api = await createFirebaseBackend({ config, region: functionsRegion, emulators: wantEmulator });
      if (wantEmulator) { $('#mode-banner').hidden = false; $('#mode-banner-text').textContent = 'Firebase 에뮬레이터에 연결됨 (개발용)'; }
    }
  } catch (e) {
    console.error(e);
    view.el.innerHTML = `<div class="empty big"><div class="empty-icon">🔌</div><h2>서버에 연결하지 못했어요</h2>
      <p class="muted">${esc(e.message || e)}</p><p class="muted small">js/firebase-config.js 설정과 인터넷 연결을 확인해 주세요.</p>
      <a class="btn primary" href="?demo=1">체험 모드로 열기</a></div>`;
    return;
  }
  const api = state.api;

  api.watchProducts(list => { state.products = list; state.productsLoaded = true; refresh('products'); },
    () => toast('상품 목록을 불러오지 못했어요. 보안 규칙 배포 상태를 확인해 주세요.', 'error', 6000));
  api.watchNotices(list => { state.notices = list; renderHeader(); refresh('notices'); });
  api.onAuth(user => {
    const changedAccount = (state.user && state.user.uid) !== (user && user.uid);
    state.user = user;
    state.authReady = true;
    if (changedAccount) subscribeUserStreams();
    renderHeader();
    refresh(changedAccount ? 'auth' : 'user');
  });
  // 로그인 정보가 늦게 와도 화면은 먼저 보여 줘요.
  setTimeout(() => { if (!state.authReady) { state.authReady = true; route(); } }, 1500);

  window.addEventListener('hashchange', route);
  bindHeader();
  route();
}

function subscribeUserStreams() {
  userSubs.forEach(u => u && u());
  userSubs = [];
  state.favorites = new Set();
  state.notifications = [];
  notifInitialized = false;
  if (!state.user) return;
  userSubs.push(state.api.watchFavorites(set => { state.favorites = set; refresh('favorites'); }));
  userSubs.push(state.api.watchNotifications(list => {
    const before = new Set(state.notifications.map(n => n.id));
    state.notifications = list;
    // 처음 불러온 것 말고, 새로 도착한 알림만 토스트로 알려 줘요.
    if (notifInitialized) list.filter(n => !before.has(n.id) && !n.read).slice(0, 3).forEach(n => toast(`${n.title} — ${n.body}`, 'bell', 5000));
    notifInitialized = true;
    renderHeader();
    refresh('notifications');
  }));
}

// 데이터가 바뀌면 현재 화면이 그 데이터를 쓰는 경우에만 다시 그려요.
function refresh(kind) {
  if (!view.name) return;
  if (kind !== 'auth' && view.onData && view.live.includes(kind)) { view.onData(kind); return; }
  if (kind === 'auth' || view.live.includes(kind)) {
    const y = window.scrollY;
    route(true);
    window.scrollTo(0, y);
  }
}

// ─────────────────────────────────────────────── 라우터

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs || '') };
}
export const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

const routes = {
  '': viewHome, browse: viewBrowse, product: viewProduct, sell: viewSell, edit: viewSell,
  login: viewLogin, signup: viewSignup, me: viewMe, notices: viewNotices, notifications: viewNotifications, admin: viewAdmin,
};

function route(isRefresh = false) {
  const { parts, query } = parseHash();
  const name = parts[0] || '';
  const fn = routes[name] || viewNotFound;
  view.cleanup.forEach(c => { try { c(); } catch { /* 무시 */ } });
  view.cleanup = [];
  view.live = [];
  view.onData = null;
  view.name = name || 'home';
  document.body.dataset.route = view.name;
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === view.name));
  if (!state.productsLoaded && ['home', 'browse'].includes(view.name)) {
    view.el.innerHTML = skeleton();
    view.live = ['products'];
    return;
  }
  fn(view.el, parts.slice(1), query);
  if (!isRefresh) { window.scrollTo(0, 0); view.el.classList.remove('enter'); void view.el.offsetWidth; view.el.classList.add('enter'); }
}

function skeleton() {
  return `<div class="section"><div class="grid">${Array.from({ length: 8 }, () => '<div class="card skel"><div class="thumb"></div><div class="card-body"><div class="sk-line"></div><div class="sk-line short"></div></div></div>').join('')}</div></div>`;
}

function needLogin(el) {
  if (!state.authReady) { el.innerHTML = skeleton(); view.live = ['auth', 'user']; return true; }
  if (state.user) return false;
  const next = encodeURIComponent(location.hash || '#/');
  el.innerHTML = `<div class="empty big"><div class="empty-icon">🔒</div><h2>로그인이 필요해요</h2>
    <p class="muted">이 기능은 로그인한 회원만 쓸 수 있어요.</p>
    <div class="row gap center"><a class="btn primary" href="#/login?next=${next}">로그인</a><a class="btn ghost" href="#/signup?next=${next}">회원가입</a></div></div>`;
  return true;
}

// ─────────────────────────────────────────────── 헤더

function bindHeader() {
  const doSearch = (input) => {
    const q = input.value.trim();
    go(`#/browse${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    input.blur();
  };
  $$('.search-form').forEach(f => f.addEventListener('submit', e => { e.preventDefault(); doSearch($('input', f)); }));
  $('#user-menu-btn').addEventListener('click', e => { e.stopPropagation(); $('#user-menu').classList.toggle('open'); });
  document.addEventListener('click', () => $('#user-menu').classList.remove('open'));
  $('#logout-btn').addEventListener('click', async () => { await state.api.signOut(); toast('로그아웃했어요.'); go('#/'); });
}

function renderHeader() {
  const u = state.user;
  document.body.classList.toggle('signed-in', !!u);
  document.body.classList.toggle('is-admin', !!(u && u.isAdmin));
  $('#points-value').textContent = u ? fmtP(u.points) : '';
  $('#points-chip').hidden = !u;
  const unread = state.notifications.filter(n => !n.read).length;
  $$('.notif-badge').forEach(b => { b.textContent = unread > 99 ? '99+' : unread; b.hidden = !unread; });
  $('#user-name').textContent = u ? u.nickname : '';
  $('#user-avatar').textContent = u ? (u.nickname || '?').slice(0, 1) : '';
  const seen = Number(localStorage.getItem('tradehub-notice-seen') || 0);
  const newNotice = state.notices.some(n => n.createdAt > seen);
  $$('.notice-dot').forEach(d => { d.hidden = !newNotice; });
  // 포인트 바뀌면 살짝 반짝
  const chip = $('#points-chip');
  if (u && chip.dataset.last && chip.dataset.last !== String(u.points)) { chip.classList.remove('flash'); void chip.offsetWidth; chip.classList.add('flash'); }
  chip.dataset.last = u ? String(u.points) : '';
}

// ─────────────────────────────────────────────── 상품 카드

function card(p) {
  const fav = state.favorites.has(p.id);
  const soldOut = p.stock <= 0;
  const badges = [
    p.isDemo ? '<span class="badge demo">테스트</span>' : '',
    soldOut ? '<span class="badge out">품절</span>' : (p.stock <= 3 ? `<span class="badge low">${p.stock}개 남음</span>` : ''),
    p.status === 'hidden' ? '<span class="badge hidden">숨김</span>' : '',
  ].join('');
  return `<article class="card ${soldOut ? 'soldout' : ''}" data-id="${esc(p.id)}">
    <a class="card-link" href="#/product/${encodeURIComponent(p.id)}" aria-label="${esc(p.title)}"></a>
    ${thumb(p)}
    <div class="badges">${badges}</div>
    <button class="fav-btn ${fav ? 'on' : ''}" data-fav="${esc(p.id)}" aria-label="즐겨찾기" aria-pressed="${fav}">${fav ? '♥' : '♡'}</button>
    <div class="card-body">
      <div class="card-cat">${categoryOf(p.category).emoji} ${esc(categoryOf(p.category).name)}</div>
      <h3 class="card-title">${esc(p.title)}</h3>
      <div class="card-meta"><span class="seller">${esc(p.sellerName)}</span><span>판매 ${p.soldCount || 0}</span></div>
      <div class="card-price">${fmtP(p.price)}</div>
    </div>
  </article>`;
}

function grid(list, emptyMsg = '상품이 없어요.') {
  if (!list.length) return `<div class="empty"><div class="empty-icon">🛒</div><p class="muted">${esc(emptyMsg)}</p></div>`;
  return `<div class="grid">${list.map(card).join('')}</div>`;
}

// 카드의 즐겨찾기 하트 버튼 처리 (이벤트 위임)
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-fav]');
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  await toggleFav(b.dataset.fav, b);
});

async function toggleFav(id, btn) {
  if (!state.user) { toast('로그인하면 즐겨찾기를 쓸 수 있어요.'); go(`#/login?next=${encodeURIComponent(location.hash)}`); return; }
  if (btn) btn.disabled = true;
  try {
    const r = await state.api.toggleFavorite(id);
    // 화면을 바로 바꾸고, 실제 값은 실시간 구독으로 다시 맞춰져요.
    if (r.favorited) state.favorites.add(id); else state.favorites.delete(id);
    toast(r.favorited ? '즐겨찾기에 담았어요.' : '즐겨찾기에서 뺐어요.', 'success', 1600);
    refresh('favorites');
  } catch (e) { toast(friendlyError(e), 'error'); }
  finally { if (btn) btn.disabled = false; }
}

// ─────────────────────────────────────────────── 정렬

const SORTS = {
  latest: { label: '최신순', fn: (a, b) => b.createdAt - a.createdAt },
  popular: { label: '인기순', fn: (a, b) => popularity(b) - popularity(a) || b.createdAt - a.createdAt },
  priceAsc: { label: '낮은 가격순', fn: (a, b) => a.price - b.price || b.createdAt - a.createdAt },
  priceDesc: { label: '높은 가격순', fn: (a, b) => b.price - a.price || b.createdAt - a.createdAt },
  favs: { label: '즐겨찾기순', fn: (a, b) => (b.favCount || 0) - (a.favCount || 0) || b.createdAt - a.createdAt },
};
const popularity = p => (p.soldCount || 0) * 3 + (p.favCount || 0) * 2;

// 추천: 인기와 신선도를 섞고, 오늘 날짜로 정해진 순서를 살짝 섞어서 매일 조금씩 달라져요.
function recommended(list) {
  const day = Math.floor(Date.now() / 864e5);
  const fav = [...state.favorites].map(id => list.find(p => p.id === id)).filter(Boolean);
  const favCats = new Set(fav.map(p => p.category));
  const seed = s => { let h = day; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0) % 1000 / 1000; };
  return list
    .filter(p => p.stock > 0 && (!state.user || p.sellerId !== state.user.uid) && !state.favorites.has(p.id))
    .map(p => ({ p, s: popularity(p) * 0.6 + (favCats.has(p.category) ? 30 : 0) + seed(p.id) * 25 + Math.max(0, 20 - (Date.now() - p.createdAt) / 864e5 * 2) }))
    .sort((a, b) => b.s - a.s).map(x => x.p);
}

// ─────────────────────────────────────────────── 홈

function viewHome(el) {
  view.live = ['products', 'favorites', 'notices', 'user'];
  const ps = state.products;
  const pinned = state.notices.filter(n => n.pinned).slice(0, 2);
  const popular = ps.filter(p => p.stock > 0).sort(SORTS.popular.fn).slice(0, 8);
  const latest = [...ps].sort(SORTS.latest.fn).slice(0, 8);
  const rec = recommended(ps).slice(0, 8);
  const u = state.user;
  const catCount = id => ps.filter(p => p.category === id).length;

  el.innerHTML = `
    <section class="hero">
      <div class="hero-glow"></div>
      <div class="hero-text">
        <span class="eyebrow">POINT MARKET</span>
        <h1>게임 아이템부터 굿즈까지,<br><em>포인트로</em> 사고파는 거래소</h1>
        <p class="muted">가입하면 ${fmtP(SIGNUP_BONUS)}를 드려요. 안 쓰는 물건을 올리고 포인트를 모아 보세요.</p>
        <form class="search-form hero-search" role="search">
          <input type="search" placeholder="어떤 상품을 찾으세요?" aria-label="상품 검색" autocomplete="off">
          <button class="btn primary" type="submit">검색</button>
        </form>
      </div>
      <div class="hero-side">
        ${u ? `
          <div class="wallet">
            <div class="muted small">${esc(u.nickname)}님의 보유 포인트</div>
            <div class="wallet-points">${fmtP(u.points)}</div>
            <div class="wallet-stats"><span>구매 ${u.purchaseCount || 0}건</span><span>판매 ${u.salesCount || 0}건</span></div>
            <div class="row gap"><a class="btn primary sm" href="#/sell">＋ 상품 등록</a><a class="btn ghost sm" href="#/me/points">포인트 내역</a></div>
          </div>` : `
          <div class="wallet">
            <div class="wallet-points small-title">지금 가입하고<br>${fmtP(SIGNUP_BONUS)} 받기</div>
            <div class="row gap"><a class="btn primary sm" href="#/signup">회원가입</a><a class="btn ghost sm" href="#/login">로그인</a></div>
          </div>`}
        <div class="hero-stats">
          <div><b>${ps.length.toLocaleString('ko-KR')}</b><span>판매 중 상품</span></div>
          <div><b>${ps.reduce((s, p) => s + (p.soldCount || 0), 0).toLocaleString('ko-KR')}</b><span>누적 판매 수량</span></div>
        </div>
      </div>
    </section>

    ${pinned.length ? `<div class="notice-strip">${pinned.map(n => `<a href="#/notices/${encodeURIComponent(n.id)}"><span class="badge pin">공지</span> ${esc(n.title)}</a>`).join('')}</div>` : ''}

    <nav class="cat-chips" aria-label="카테고리">
      ${CATEGORIES.map(c => `<a class="chip" href="#/browse?cat=${c.id}"><span>${c.emoji}</span>${esc(c.name)}<small>${catCount(c.id)}</small></a>`).join('')}
    </nav>

    ${!ps.length ? `<div class="empty big"><div class="empty-icon">📦</div><h2>아직 등록된 상품이 없어요</h2>
      <p class="muted">첫 번째 판매자가 되어 보세요.</p>
      <div class="row gap center"><a class="btn primary" href="#/sell">상품 등록하기</a>
      ${u && u.isAdmin ? '<a class="btn ghost" href="#/admin/demo">테스트 상품 넣기</a>' : ''}</div></div>` : `
    ${section('🔥 인기 상품', '#/browse?sort=popular', popular)}
    ${section('✨ 신규 등록', '#/browse?sort=latest', latest)}
    ${rec.length ? section(u ? `👍 ${esc(u.nickname)}님을 위한 추천` : '👍 추천 상품', '#/browse?sort=popular', rec) : ''}
    <div class="section"><div class="section-head"><h2>🗂️ 카테고리별 상품</h2></div>
      ${CATEGORIES.filter(c => catCount(c.id)).map(c => `
        <div class="cat-row">
          <div class="cat-row-head"><h3>${c.emoji} ${esc(c.name)}</h3><a class="more" href="#/browse?cat=${c.id}">전체 ${catCount(c.id)}개 보기 →</a></div>
          <div class="grid scroller">${ps.filter(p => p.category === c.id).sort(SORTS.latest.fn).slice(0, 6).map(card).join('')}</div>
        </div>`).join('')}
    </div>`}
  `;
  $$('.search-form', el).forEach(f => f.addEventListener('submit', e => {
    e.preventDefault(); const q = $('input', f).value.trim(); go(`#/browse${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  }));
}

function section(title, moreHref, list) {
  return `<div class="section"><div class="section-head"><h2>${title}</h2><a class="more" href="${moreHref}">더보기 →</a></div>
    <div class="grid scroller">${list.map(card).join('')}</div></div>`;
}

// ─────────────────────────────────────────────── 둘러보기 / 검색

function viewBrowse(el, _parts, query) {
  view.live = ['products', 'favorites', 'user'];
  const q = (query.get('q') || '').trim();
  const cat = query.get('cat') || '';
  const sort = SORTS[query.get('sort')] ? query.get('sort') : 'latest';
  const hideOut = query.get('out') === '0';
  const hideDemo = query.get('demo') === '0';
  const onlyFav = query.get('fav') === '1';
  const minP = Number(query.get('min')) || 0;
  const maxP = Number(query.get('max')) || 0;

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  let list = state.products.filter(p => {
    if (cat && p.category !== cat) return false;
    if (hideOut && p.stock <= 0) return false;
    if (hideDemo && p.isDemo) return false;
    if (onlyFav && !state.favorites.has(p.id)) return false;
    if (minP && p.price < minP) return false;
    if (maxP && p.price > maxP) return false;
    if (words.length) {
      const hay = `${p.title} ${p.description} ${p.sellerName} ${categoryOf(p.category).name}`.toLowerCase();
      return words.every(w => hay.includes(w));
    }
    return true;
  }).sort(SORTS[sort].fn);

  const link = (patch) => {
    const n = new URLSearchParams(query);
    Object.entries(patch).forEach(([k, v]) => (v === '' || v == null) ? n.delete(k) : n.set(k, v));
    const s = n.toString();
    return `#/browse${s ? `?${s}` : ''}`;
  };
  const c = cat && categoryOf(cat);

  el.innerHTML = `
    <div class="page-head">
      <h1>${q ? `“${esc(q)}” 검색 결과` : c ? `${c.emoji} ${esc(c.name)}` : '전체 상품'}</h1>
      <p class="muted">${list.length.toLocaleString('ko-KR')}개 상품</p>
    </div>
    <div class="browse">
      <aside class="filters">
        <form class="search-form side-search" role="search"><input type="search" value="${esc(q)}" placeholder="상품명, 설명, 판매자" aria-label="검색어"><button class="btn primary sm">검색</button></form>
        <h4>카테고리</h4>
        <div class="cat-list">
          <a class="${!cat ? 'on' : ''}" href="${link({ cat: '' })}">전체 <small>${state.products.length}</small></a>
          ${CATEGORIES.map(x => `<a class="${cat === x.id ? 'on' : ''}" href="${link({ cat: x.id })}">${x.emoji} ${esc(x.name)} <small>${state.products.filter(p => p.category === x.id).length}</small></a>`).join('')}
        </div>
        <h4>가격 (P)</h4>
        <form class="price-range" id="price-form">
          <input type="number" name="min" min="0" placeholder="최소" value="${minP || ''}" aria-label="최소 가격">
          <span>~</span>
          <input type="number" name="max" min="0" placeholder="최대" value="${maxP || ''}" aria-label="최대 가격">
          <button class="btn ghost sm">적용</button>
        </form>
        <h4>옵션</h4>
        <label class="check"><input type="checkbox" data-opt="out" ${hideOut ? 'checked' : ''}> 품절 상품 숨기기</label>
        <label class="check"><input type="checkbox" data-opt="demo" ${hideDemo ? 'checked' : ''}> 테스트 상품 숨기기</label>
        <label class="check"><input type="checkbox" data-opt="fav" ${onlyFav ? 'checked' : ''}> 즐겨찾기만 보기</label>
      </aside>
      <div class="browse-main">
        <div class="toolbar">
          <div class="sort-tabs" role="tablist">${Object.entries(SORTS).map(([k, s]) => `<a role="tab" aria-selected="${k === sort}" class="${k === sort ? 'on' : ''}" href="${link({ sort: k === 'latest' ? '' : k })}">${s.label}</a>`).join('')}</div>
          ${(q || cat || hideOut || hideDemo || onlyFav || minP || maxP) ? '<a class="btn ghost sm" href="#/browse">필터 초기화</a>' : ''}
        </div>
        ${grid(list, q ? '검색 결과가 없어요. 다른 검색어로 찾아보세요.' : '조건에 맞는 상품이 없어요.')}
      </div>
    </div>`;

  $('.side-search', el).addEventListener('submit', e => { e.preventDefault(); go(link({ q: $('input', e.target).value.trim() })); });
  $('#price-form', el).addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    go(link({ min: Number(f.min.value) > 0 ? Math.floor(f.min.value) : '', max: Number(f.max.value) > 0 ? Math.floor(f.max.value) : '' }));
  });
  $$('[data-opt]', el).forEach(cb => cb.addEventListener('change', () => {
    const k = cb.dataset.opt;
    go(link({ [k]: cb.checked ? (k === 'fav' ? '1' : '0') : '' }));
  }));
}

// ─────────────────────────────────────────────── 상품 상세 / 구매

const qtyMemo = {};

function viewProduct(el, [id]) {
  view.live = ['favorites', 'user', 'products'];
  el.innerHTML = '<div class="detail-loading">불러오는 중…</div>';
  let product;
  const unsub = state.api.watchProduct(id, p => { product = p; draw(); });
  view.cleanup.push(unsub);

  function draw() {
    const p = product;
    if (!p) {
      el.innerHTML = `<div class="empty big"><div class="empty-icon">🫥</div><h2>상품을 찾을 수 없어요</h2><p class="muted">삭제되었거나 판매가 중지된 상품이에요.</p><a class="btn primary" href="#/browse">다른 상품 보기</a></div>`;
      return;
    }
    const u = state.user;
    const mine = u && u.uid === p.sellerId;
    const cat = categoryOf(p.category);
    const fav = state.favorites.has(p.id);
    const qty = Math.min(Math.max(1, qtyMemo[p.id] || 1), Math.max(1, Math.min(p.stock, MAX_QTY)));
    const total = p.price * qty;
    const demoBlocked = p.isDemo && !state.api.canBuyDemo;

    let buyLabel = '구매하기', buyDisabled = false, reason = '';
    if (p.status !== 'active') { buyLabel = '판매 중지'; buyDisabled = true; reason = '판매자가 숨긴 상품이에요.'; }
    else if (p.stock <= 0) { buyLabel = '품절'; buyDisabled = true; reason = '재고가 없어요.'; }
    else if (demoBlocked) { buyLabel = '테스트 상품'; buyDisabled = true; reason = '테스트용 가짜 상품이라 구매할 수 없어요.'; }
    else if (!u) { buyLabel = '로그인하고 구매하기'; }
    else if (mine) { buyLabel = '내가 등록한 상품'; buyDisabled = true; }
    else if (u.points < total) { buyLabel = '포인트 부족'; buyDisabled = true; reason = `${fmtP(total - u.points)}가 더 필요해요.`; }

    const sameSeller = state.products.filter(x => x.sellerId === p.sellerId && x.id !== p.id).slice(0, 6);
    const similar = state.products.filter(x => x.category === p.category && x.id !== p.id && x.sellerId !== p.sellerId).sort(SORTS.popular.fn).slice(0, 6);

    el.innerHTML = `
      <nav class="crumbs"><a href="#/">홈</a> › <a href="#/browse?cat=${cat.id}">${cat.emoji} ${esc(cat.name)}</a></nav>
      <div class="detail">
        <div class="detail-media">${thumb(p, 'large')}</div>
        <div class="detail-info">
          <div class="badges static">
            ${p.isDemo ? '<span class="badge demo">테스트 상품</span>' : ''}
            ${p.status === 'hidden' ? '<span class="badge hidden">숨김</span>' : ''}
            ${p.stock <= 0 ? '<span class="badge out">품절</span>' : p.stock <= 3 ? `<span class="badge low">${p.stock}개 남음</span>` : ''}
          </div>
          <h1 class="detail-title">${esc(p.title)}</h1>
          <div class="detail-seller">판매자 <b>${esc(p.sellerName)}</b> · ${timeAgo(p.createdAt)} 등록</div>
          <div class="detail-price">${fmtP(p.price)}</div>
          <dl class="specs">
            <div><dt>재고</dt><dd>${p.stock.toLocaleString('ko-KR')}개</dd></div>
            <div><dt>판매</dt><dd>${(p.soldCount || 0).toLocaleString('ko-KR')}개</dd></div>
            <div><dt>즐겨찾기</dt><dd>${(p.favCount || 0).toLocaleString('ko-KR')}</dd></div>
          </dl>
          ${!mine && p.stock > 0 && p.status === 'active' && !demoBlocked ? `
            <div class="qty-row">
              <span>수량</span>
              <div class="stepper"><button type="button" data-q="-1" aria-label="수량 줄이기">−</button><input id="qty" type="number" min="1" max="${Math.min(p.stock, MAX_QTY)}" value="${qty}" aria-label="수량"><button type="button" data-q="1" aria-label="수량 늘리기">＋</button></div>
              <span class="total">합계 <b>${fmtP(total)}</b></span>
            </div>` : ''}
          ${u && !mine ? `<div class="muted small">내 포인트 ${fmtP(u.points)}</div>` : ''}
          <div class="buy-row">
            <button class="btn buy big" id="buy-btn" ${buyDisabled ? 'disabled' : ''}>${buyLabel}</button>
            <button class="btn ghost big fav-big ${fav ? 'on' : ''}" id="fav-btn" aria-pressed="${fav}">${fav ? '♥ 찜함' : '♡ 찜하기'}</button>
          </div>
          ${reason ? `<p class="buy-reason">${esc(reason)}</p>` : ''}
          ${mine ? `<div class="owner-tools">
            <a class="btn ghost sm" href="#/edit/${encodeURIComponent(p.id)}">✏️ 수정</a>
            <button class="btn ghost sm" id="toggle-hide">${p.status === 'active' ? '🙈 숨기기' : '👀 다시 판매'}</button>
            <button class="btn danger sm" id="del-btn">🗑️ 삭제</button></div>` : ''}
          ${u && u.isAdmin && !mine ? `<div class="owner-tools admin-tools"><span class="badge admin">관리자</span>
            <button class="btn ghost sm" id="adm-hide">${p.status === 'active' ? '숨기기' : '공개'}</button>
            <button class="btn danger sm" id="adm-del">삭제</button></div>` : ''}
        </div>
      </div>
      <section class="section desc"><h2>상품 설명</h2><div class="pre">${esc(p.description) || '<span class="muted">설명이 없어요.</span>'}</div></section>
      ${sameSeller.length ? `<section class="section"><div class="section-head"><h2>${esc(p.sellerName)}님의 다른 상품</h2></div><div class="grid scroller">${sameSeller.map(card).join('')}</div></section>` : ''}
      ${similar.length ? `<section class="section"><div class="section-head"><h2>비슷한 상품</h2><a class="more" href="#/browse?cat=${cat.id}">더보기 →</a></div><div class="grid scroller">${similar.map(card).join('')}</div></section>` : ''}
    `;

    const qtyInput = $('#qty', el);
    const setQty = v => {
      const max = Math.min(p.stock, MAX_QTY);
      qtyMemo[p.id] = Math.min(max, Math.max(1, Math.floor(Number(v)) || 1));
      draw();
    };
    if (qtyInput) {
      qtyInput.addEventListener('change', () => setQty(qtyInput.value));
      $$('[data-q]', el).forEach(b => b.addEventListener('click', () => setQty(qty + Number(b.dataset.q))));
    }
    $('#fav-btn', el).addEventListener('click', e => toggleFav(p.id, e.currentTarget));
    $('#buy-btn', el).addEventListener('click', () => {
      if (!state.user) { go(`#/login?next=${encodeURIComponent(location.hash)}`); return; }
      openPurchase(p, qty);
    });
    const hide = $('#toggle-hide', el);
    if (hide) hide.addEventListener('click', async () => {
      try {
        await state.api.updateProduct(p.id, { ...p, status: p.status === 'active' ? 'hidden' : 'active' });
        toast(p.status === 'active' ? '상품을 숨겼어요.' : '다시 판매를 시작했어요.', 'success');
      } catch (e) { toast(friendlyError(e), 'error'); }
    });
    const del = $('#del-btn', el);
    if (del) del.addEventListener('click', async () => {
      if (!await confirmDialog({ title: '상품 삭제', message: `“${p.title}” 상품을 삭제할까요?\n삭제하면 되돌릴 수 없어요. 거래 기록은 남아요.`, okLabel: '삭제', danger: true })) return;
      try { await state.api.deleteProduct(p.id); toast('상품을 삭제했어요.', 'success'); go('#/me/products'); }
      catch (e) { toast(friendlyError(e), 'error'); }
    });
    const ah = $('#adm-hide', el);
    if (ah) ah.addEventListener('click', async () => {
      try { await state.api.admin.setProductStatus(p.id, p.status === 'active' ? 'hidden' : 'active'); toast('상태를 바꿨어요.', 'success'); }
      catch (e) { toast(friendlyError(e), 'error'); }
    });
    const ad = $('#adm-del', el);
    if (ad) ad.addEventListener('click', async () => {
      if (!await confirmDialog({ title: '관리자 삭제', message: `“${p.title}” 상품을 삭제할까요?`, okLabel: '삭제', danger: true })) return;
      try { await state.api.admin.deleteProduct(p.id); toast('삭제했어요.', 'success'); go('#/admin/products'); }
      catch (e) { toast(friendlyError(e), 'error'); }
    });
  }
  // 찜·포인트·상품 목록이 바뀌면 구독은 그대로 두고 화면만 다시 그려요.
  view.onData = () => { if (product !== undefined) draw(); };
}

let purchasing = false;

function openPurchase(p, qty) {
  if (purchasing) return;
  const u = state.user;
  const total = p.price * qty;
  const after = u.points - total;
  // 이 확인 창 하나에 요청 번호 하나. 같은 창에서 버튼을 여러 번 눌러도 한 번만 구매돼요.
  const requestId = state.api.newRequestId();
  const m = modal({
    title: '구매 확인',
    body: `
      <div class="confirm-product">${thumb(p, 'mini')}<div><b>${esc(p.title)}</b><div class="muted small">판매자 ${esc(p.sellerName)}</div></div></div>
      <dl class="receipt">
        <div><dt>단가</dt><dd>${fmtP(p.price)}</dd></div>
        <div><dt>수량</dt><dd>${qty}개</dd></div>
        <div class="sum"><dt>결제 포인트</dt><dd>${fmtP(total)}</dd></div>
        <div><dt>현재 보유</dt><dd>${fmtP(u.points)}</dd></div>
        <div><dt>구매 후 잔액</dt><dd class="${after < 0 ? 'neg' : ''}">${fmtP(after)}</dd></div>
      </dl>
      <p class="muted small">구매를 확정하면 포인트가 바로 판매자에게 전달되고 취소할 수 없어요.</p>
      <p class="form-error" hidden></p>`,
    actions: [
      { label: '취소', kind: 'ghost' },
      {
        label: `${fmtP(total)} 결제`, kind: 'buy', id: 'confirm-buy', onClick: async (close, btn) => {
          if (purchasing) return false;
          purchasing = true; m.setBusy(true);
          btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 처리 중…';
          try {
            const r = await state.api.purchase(p.id, qty, p.price, requestId);
            m.setBusy(false); close();
            purchaseDone(p, qty, r);
          } catch (e) {
            m.setBusy(false);
            const errEl = $('.form-error', m.el);
            errEl.textContent = friendlyError(e); errEl.hidden = false;
            btn.disabled = false; btn.textContent = '다시 시도';
          } finally { purchasing = false; }
          return false;
        },
      },
    ],
  });
}

function purchaseDone(p, qty, r) {
  toast(r.duplicate ? '이미 처리된 구매예요. 중복 결제되지 않았어요.' : '구매 완료! 포인트가 차감되었어요.', 'success');
  modal({
    title: '구매 완료 🎉',
    body: `<div class="done">
      <div class="done-check">✓</div>
      <p><b>${esc(p.title)}</b> ×${qty}</p>
      <p class="done-total">${fmtP(r.total)} 사용</p>
      ${r.balance != null ? `<p class="muted">남은 포인트 ${fmtP(r.balance)}</p>` : ''}
      <p class="muted small">거래 번호 ${esc(r.tradeId)}</p></div>`,
    actions: [
      { label: '계속 둘러보기', kind: 'ghost' },
      { label: '구매 내역 보기', kind: 'primary', onClick: () => { go('#/me/purchases'); } },
    ],
  });
}

// ─────────────────────────────────────────────── 상품 등록 / 수정

function viewSell(el, [id]) {
  if (needLogin(el)) return;
  if (state.user.banned) { el.innerHTML = '<div class="empty big"><div class="empty-icon">⛔</div><h2>이용이 정지된 계정이에요</h2></div>'; return; }
  const editing = !!id;
  let original = null;
  let newFile = null;
  let removeImage = false;

  const render = (p) => {
    const v = p || { title: '', description: '', price: '', stock: 1, category: '', status: 'active' };
    el.innerHTML = `
      <div class="page-head"><h1>${editing ? '상품 수정' : '상품 등록'}</h1><p class="muted">${editing ? '내용을 고치고 저장하세요.' : '판매할 상품 정보를 입력하세요. 팔리면 판매 금액이 포인트로 들어와요.'}</p></div>
      <form class="form sell-form" id="sell-form" novalidate>
        <div class="sell-grid">
          <div>
            <label class="field"><span>상품 이미지 <small class="muted">(선택, 5MB 이하)</small></span>
              <div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="이미지 선택">
                <div class="dz-preview" id="dz-preview">${v.imageUrl ? thumb(v, 'large') : '<div class="dz-empty">🖼️<br>클릭하거나 이미지를 끌어다 놓으세요</div>'}</div>
                <input type="file" id="image" accept="image/*" hidden>
              </div>
            </label>
            <button type="button" class="btn ghost sm" id="remove-img" ${v.imageUrl ? '' : 'hidden'}>이미지 빼기</button>
          </div>
          <div class="sell-fields">
            <label class="field"><span>상품 이름</span><input name="title" maxlength="60" required value="${esc(v.title)}" placeholder="예) 한정판 아크릴 스탠드"></label>
            <label class="field"><span>카테고리</span>
              <select name="category" required><option value="">선택하세요</option>${CATEGORIES.map(c => `<option value="${c.id}" ${v.category === c.id ? 'selected' : ''}>${c.emoji} ${esc(c.name)}</option>`).join('')}</select></label>
            <div class="two">
              <label class="field"><span>가격 (P)</span><input name="price" type="number" inputmode="numeric" min="1" max="10000000" step="1" required value="${esc(v.price)}" placeholder="1000"></label>
              <label class="field"><span>재고 (개)</span><input name="stock" type="number" inputmode="numeric" min="0" max="9999" step="1" required value="${esc(v.stock)}"></label>
            </div>
            ${editing ? `<label class="field"><span>판매 상태</span><select name="status"><option value="active" ${v.status === 'active' ? 'selected' : ''}>판매 중</option><option value="hidden" ${v.status === 'hidden' ? 'selected' : ''}>숨김 (목록에 안 보임)</option></select></label>` : ''}
            <label class="field"><span>상품 설명 <small class="muted" id="desc-count">${(v.description || '').length}/2000</small></span>
              <textarea name="description" rows="7" maxlength="2000" placeholder="상태, 구성품, 거래 방법 등을 자세히 적어 주세요.">${esc(v.description)}</textarea></label>
          </div>
        </div>
        <p class="form-error" hidden></p>
        <div class="row gap end">
          <a class="btn ghost" href="${editing ? `#/product/${encodeURIComponent(id)}` : '#/'}">취소</a>
          <button class="btn primary" type="submit" id="sell-submit">${editing ? '저장하기' : '등록하기'}</button>
        </div>
      </form>`;

    const form = $('#sell-form', el);
    const fileInput = $('#image', el);
    const dz = $('#dropzone', el);
    const preview = $('#dz-preview', el);
    const setFile = f => {
      if (!f) return;
      if (!f.type.startsWith('image/')) { toast('이미지 파일만 올릴 수 있어요.', 'error'); return; }
      if (f.size > 5 * 1024 * 1024) { toast('5MB 이하 이미지만 올릴 수 있어요.', 'error'); return; }
      newFile = f; removeImage = false;
      const url = URL.createObjectURL(f);
      preview.innerHTML = `<div class="thumb large"><img src="${url}" alt="미리보기"></div>`;
      $('#remove-img', el).hidden = false;
    };
    dz.addEventListener('click', () => fileInput.click());
    dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    fileInput.addEventListener('change', () => setFile(fileInput.files[0]));
    ['dragenter', 'dragover'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', e => setFile(e.dataTransfer.files[0]));
    $('#remove-img', el).addEventListener('click', () => {
      newFile = null; removeImage = true; fileInput.value = '';
      preview.innerHTML = '<div class="dz-empty">🖼️<br>클릭하거나 이미지를 끌어다 놓으세요</div>';
      $('#remove-img', el).hidden = true;
    });
    form.description.addEventListener('input', () => { $('#desc-count', el).textContent = `${form.description.value.length}/2000`; });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const errEl = $('.form-error', form);
      errEl.hidden = true;
      const { value, error } = normalizeProduct({
        title: form.title.value, description: form.description.value, price: Number(form.price.value),
        stock: Number(form.stock.value), category: form.category.value, status: form.status ? form.status.value : 'active',
      });
      if (error) { errEl.textContent = error; errEl.hidden = false; return; }
      const btn = $('#sell-submit', el);
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 저장 중…';
      try {
        if (editing) {
          await state.api.updateProduct(id, value, newFile, removeImage && !newFile);
          toast('상품을 수정했어요.', 'success');
          go(`#/product/${encodeURIComponent(id)}`);
        } else {
          const newId = await state.api.createProduct(value, newFile);
          toast('상품을 등록했어요!', 'success');
          go(`#/product/${encodeURIComponent(newId)}`);
        }
      } catch (err) {
        errEl.textContent = friendlyError(err); errEl.hidden = false;
        btn.disabled = false; btn.textContent = editing ? '저장하기' : '등록하기';
      }
    });
  };

  if (!editing) { render(null); return; }
  el.innerHTML = '<div class="detail-loading">불러오는 중…</div>';
  let first = true;
  const unsub = state.api.watchProduct(id, p => {
    if (!first) return; first = false;
    if (!p || p.sellerId !== state.user.uid) {
      el.innerHTML = '<div class="empty big"><div class="empty-icon">🚫</div><h2>수정할 수 없는 상품이에요</h2><p class="muted">내가 등록한 상품만 수정할 수 있어요.</p></div>';
      return;
    }
    if (p.hiddenByAdmin) {
      el.innerHTML = '<div class="empty big"><div class="empty-icon">🚫</div><h2>관리자가 숨긴 상품이에요</h2><p class="muted">수정하려면 관리자에게 문의해 주세요.</p></div>';
      return;
    }
    original = p;
    render(original);
  });
  view.cleanup.push(unsub);
}

// ─────────────────────────────────────────────── 로그인 / 회원가입

function authShell(title, sub, inner) {
  return `<div class="auth-wrap"><div class="auth-card">
    <div class="auth-logo">⬡</div><h1>${title}</h1><p class="muted">${sub}</p>${inner}</div></div>`;
}

function afterAuth(query) {
  const next = query.get('next');
  go(next && next.startsWith('#/') && !/^#\/(login|signup)/.test(next) ? next : '#/');
}

function viewLogin(el, _p, query) {
  if (state.user) { afterAuth(query); return; }
  el.innerHTML = authShell('로그인', '아이디와 비밀번호를 입력하세요.', `
    <form class="form" id="login-form" novalidate>
      <label class="field"><span>아이디</span><input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
      <label class="field"><span>비밀번호</span><input name="password" type="password" autocomplete="current-password" required></label>
      <p class="form-error" hidden></p>
      <button class="btn primary block" id="login-submit">로그인</button>
      <p class="muted small center">계정이 없나요? <a href="#/signup${query.get('next') ? `?next=${encodeURIComponent(query.get('next'))}` : ''}">회원가입</a></p>
      ${state.api.mode === 'local' ? '<p class="hint">체험 모드 관리자: <code>admin</code> / <code>admin1234</code></p>' : ''}
    </form>`);
  const f = $('#login-form', el);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = $('.form-error', f); errEl.hidden = true;
    const username = f.username.value.trim().toLowerCase();
    if (!username || !f.password.value) { errEl.textContent = '아이디와 비밀번호를 입력해 주세요.'; errEl.hidden = false; return; }
    const btn = $('#login-submit', el); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 로그인 중…';
    try {
      await state.api.signIn(username, f.password.value);
      toast('어서 오세요!', 'success');
      afterAuth(query);
    } catch (err) {
      errEl.textContent = friendlyError(err); errEl.hidden = false;
      btn.disabled = false; btn.textContent = '로그인';
    }
  });
}

function viewSignup(el, _p, query) {
  if (state.user) { afterAuth(query); return; }
  el.innerHTML = authShell('회원가입', `가입하면 ${fmtP(SIGNUP_BONUS)}를 드려요.`, `
    <form class="form" id="signup-form" novalidate>
      <label class="field"><span>아이디 <small class="muted">영문 소문자·숫자·_ 3~20자</small></span><input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" required></label>
      <label class="field"><span>닉네임 <small class="muted">2~16자, 다른 회원에게 보여요</small></span><input name="nickname" maxlength="16" required></label>
      <label class="field"><span>비밀번호 <small class="muted">6자 이상</small></span><input name="password" type="password" autocomplete="new-password" required></label>
      <label class="field"><span>비밀번호 확인</span><input name="password2" type="password" autocomplete="new-password" required></label>
      <p class="muted small">⚠️ 아이디로 가입해서 비밀번호를 잊으면 찾을 수 없어요. 잘 기억해 두세요.</p>
      <p class="form-error" hidden></p>
      <button class="btn primary block" id="signup-submit">가입하기</button>
      <p class="muted small center">이미 계정이 있나요? <a href="#/login">로그인</a></p>
    </form>`);
  const f = $('#signup-form', el);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = $('.form-error', f); errEl.hidden = true;
    const username = f.username.value.trim().toLowerCase();
    const nickname = f.nickname.value.trim();
    const msg = validateUsername(username) || validateNickname(nickname) || validatePassword(f.password.value)
      || (f.password.value !== f.password2.value ? '비밀번호 확인이 일치하지 않아요.' : null);
    if (msg) { errEl.textContent = msg; errEl.hidden = false; return; }
    const btn = $('#signup-submit', el); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 가입 중…';
    try {
      await state.api.signUp(username, f.password.value, nickname);
      toast(`가입 완료! ${fmtP(SIGNUP_BONUS)}가 지급되었어요.`, 'success', 4500);
      afterAuth(query);
    } catch (err) {
      errEl.textContent = friendlyError(err); errEl.hidden = false;
      btn.disabled = false; btn.textContent = '가입하기';
    }
  });
}

// ─────────────────────────────────────────────── 내 정보

const ME_TABS = [
  ['products', '내 상품'], ['purchases', '구매 내역'], ['sales', '판매 내역'],
  ['points', '포인트 내역'], ['favorites', '즐겨찾기'], ['settings', '프로필 설정'],
];

function viewMe(el, [tab = 'products']) {
  if (needLogin(el)) return;
  if (!ME_TABS.some(t => t[0] === tab)) tab = 'products';
  view.live = tab === 'favorites' ? ['favorites', 'products', 'user'] : ['user'];
  const u = state.user;
  el.innerHTML = `
    <section class="profile">
      <div class="avatar big">${esc((u.nickname || '?').slice(0, 1))}</div>
      <div class="profile-main">
        <h1>${esc(u.nickname)} ${u.isAdmin ? '<span class="badge admin">관리자</span>' : ''} ${u.banned ? '<span class="badge out">정지됨</span>' : ''}</h1>
        <div class="muted">@${esc(u.username)} · ${fmtDate(u.createdAt, false)} 가입</div>
        ${u.bio ? `<p class="bio">${esc(u.bio)}</p>` : ''}
      </div>
      <div class="profile-stats">
        <div class="stat-points"><span>보유 포인트</span><b>${fmtP(u.points)}</b></div>
        <div><span>구매</span><b>${u.purchaseCount || 0}</b></div>
        <div><span>판매</span><b>${u.salesCount || 0}</b></div>
      </div>
    </section>
    <nav class="tabs" role="tablist">${ME_TABS.map(([k, l]) => `<a role="tab" aria-selected="${k === tab}" class="${k === tab ? 'on' : ''}" href="#/me/${k}">${l}</a>`).join('')}</nav>
    <div id="tab-body"><div class="detail-loading">불러오는 중…</div></div>`;
  const body = $('#tab-body', el);
  const fns = { products: meProducts, purchases: meTrades, sales: meTrades, points: mePoints, favorites: meFavorites, settings: meSettings };
  fns[tab](body, tab).catch(e => { body.innerHTML = `<div class="empty"><p class="form-error">${esc(friendlyError(e))}</p></div>`; });
}

async function meProducts(body) {
  const list = await state.api.myProducts();
  if (!list.length) {
    body.innerHTML = '<div class="empty"><div class="empty-icon">📦</div><p class="muted">아직 등록한 상품이 없어요.</p><a class="btn primary" href="#/sell">첫 상품 등록하기</a></div>';
    return;
  }
  body.innerHTML = `<div class="toolbar"><span class="muted">${list.length}개 · 판매 중 ${list.filter(p => p.status === 'active').length}개</span><a class="btn primary sm" href="#/sell">＋ 새 상품</a></div>${grid(list)}`;
}

async function meTrades(body, tab) {
  const { purchases, sales } = await state.api.myTrades();
  const list = tab === 'purchases' ? purchases : sales;
  const isBuy = tab === 'purchases';
  body.innerHTML = `
    <div class="toolbar">
      <input class="input" type="search" id="trade-q" placeholder="거래 검색 (상품명, ${isBuy ? '판매자' : '구매자'}, 거래번호)" aria-label="거래 검색">
      <span class="muted" id="trade-sum"></span>
    </div>
    <div id="trade-list"></div>`;
  const draw = () => {
    const q = $('#trade-q', body).value.trim().toLowerCase();
    const rows = list.filter(t => !q || `${t.productTitle} ${t.sellerName} ${t.buyerName} ${t.id}`.toLowerCase().includes(q));
    $('#trade-sum', body).textContent = `${rows.length}건 · 합계 ${fmtP(rows.reduce((s, t) => s + t.total, 0))}`;
    $('#trade-list', body).innerHTML = rows.length ? `<div class="rows">${rows.map(t => tradeRow(t, isBuy ? 'buy' : 'sell')).join('')}</div>`
      : `<div class="empty"><div class="empty-icon">🧾</div><p class="muted">${q ? '검색 결과가 없어요.' : isBuy ? '아직 구매한 상품이 없어요.' : '아직 판매된 상품이 없어요.'}</p></div>`;
  };
  $('#trade-q', body).addEventListener('input', debounce(draw, 150));
  draw();
}

function tradeRow(t, side) {
  const sign = side === 'buy' ? '−' : side === 'sell' ? '+' : '';
  return `<div class="trow">
    ${thumb({ imageUrl: t.productImage, category: t.category }, 'mini')}
    <div class="trow-main">
      <a href="#/product/${encodeURIComponent(t.productId)}"><b>${esc(t.productTitle)}</b></a> <span class="muted">×${t.qty}</span>
      <div class="muted small">${side === 'buy' ? `판매자 ${esc(t.sellerName)}` : side === 'sell' ? `구매자 ${esc(t.buyerName)}` : `${esc(t.buyerName)} ← ${esc(t.sellerName)}`} · ${fmtDate(t.createdAt)}</div>
      <div class="muted tiny">거래번호 ${esc(t.id)}</div>
    </div>
    <div class="trow-amt ${side === 'buy' ? 'neg' : side === 'sell' ? 'pos' : ''}">${sign}${fmtP(t.total)}<div class="muted tiny">단가 ${fmtP(t.unitPrice)}</div></div>
  </div>`;
}

const LOG_TYPES = { signup: '가입 포인트', purchase: '구매', sale: '판매', admin_grant: '관리자 지급', admin_revoke: '관리자 회수' };

async function mePoints(body) {
  const logs = await state.api.myPointLogs();
  body.innerHTML = logs.length ? `<div class="rows">${logs.map(l => `
    <div class="trow">
      <div class="log-icon ${l.delta >= 0 ? 'pos' : 'neg'}">${l.delta >= 0 ? '＋' : '－'}</div>
      <div class="trow-main"><b>${esc(LOG_TYPES[l.type] || l.type)}</b><div class="muted small">${esc(l.memo)} · ${fmtDate(l.createdAt)}</div></div>
      <div class="trow-amt ${l.delta >= 0 ? 'pos' : 'neg'}">${l.delta >= 0 ? '+' : '−'}${fmtP(Math.abs(l.delta))}<div class="muted tiny">잔액 ${fmtP(l.balance)}</div></div>
    </div>`).join('')}</div>` : '<div class="empty"><p class="muted">포인트 내역이 없어요.</p></div>';
}

async function meFavorites(body) {
  const list = state.products.filter(p => state.favorites.has(p.id)).sort(SORTS.latest.fn);
  body.innerHTML = grid(list, '즐겨찾기한 상품이 없어요. 상품의 ♡를 눌러 담아 보세요.');
}

async function meSettings(body) {
  const u = state.user;
  body.innerHTML = `
    <form class="form narrow" id="profile-form">
      <label class="field"><span>아이디</span><input value="${esc(u.username)}" disabled></label>
      <label class="field"><span>닉네임</span><input name="nickname" maxlength="16" value="${esc(u.nickname)}" required></label>
      <label class="field"><span>소개 <small class="muted">200자 이내</small></span><textarea name="bio" rows="3" maxlength="200">${esc(u.bio || '')}</textarea></label>
      <p class="form-error" hidden></p>
      <div class="row gap"><button class="btn primary" id="profile-save">저장</button></div>
    </form>
    <div class="danger-zone"><button class="btn ghost" id="logout2">로그아웃</button></div>`;
  const f = $('#profile-form', body);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = $('.form-error', f); errEl.hidden = true;
    const msg = validateNickname(f.nickname.value);
    if (msg) { errEl.textContent = msg; errEl.hidden = false; return; }
    const btn = $('#profile-save', body); btn.disabled = true;
    try { await state.api.updateProfile({ nickname: f.nickname.value.trim(), bio: f.bio.value.trim() }); toast('프로필을 저장했어요.', 'success'); }
    catch (err) { errEl.textContent = friendlyError(err); errEl.hidden = false; }
    finally { btn.disabled = false; }
  });
  $('#logout2', body).addEventListener('click', async () => { await state.api.signOut(); toast('로그아웃했어요.'); go('#/'); });
}

// ─────────────────────────────────────────────── 공지 / 알림

function viewNotices(el, [openId]) {
  view.live = ['notices'];
  const list = [...state.notices].sort((a, b) => (b.pinned - a.pinned) || b.createdAt - a.createdAt);
  try { localStorage.setItem('tradehub-notice-seen', String(Date.now())); } catch { /* 무시 */ }
  renderHeader();
  el.innerHTML = `
    <div class="page-head"><h1>📢 공지사항</h1>${state.user && state.user.isAdmin ? '<a class="btn primary sm" href="#/admin/notices">공지 쓰기</a>' : ''}</div>
    ${list.length ? `<div class="notice-list">${list.map(n => `
      <details class="notice" ${n.id === openId ? 'open' : ''} id="notice-${esc(n.id)}">
        <summary>${n.pinned ? '<span class="badge pin">고정</span>' : ''}<b>${esc(n.title)}</b><span class="muted small">${fmtDate(n.createdAt, false)}</span></summary>
        <div class="notice-body pre">${esc(n.body)}</div>
        <div class="muted small">작성 ${esc(n.authorName)}</div>
      </details>`).join('')}</div>` : '<div class="empty"><div class="empty-icon">📭</div><p class="muted">공지사항이 없어요.</p></div>'}`;
  if (openId) { const d = $(`#notice-${CSS.escape(openId)}`, el); d && d.scrollIntoView({ block: 'center' }); }
}

function viewNotifications(el) {
  if (needLogin(el)) return;
  view.live = ['notifications'];
  const list = state.notifications;
  const icon = { purchase: '🛍️', sale: '💰', points: '🪙' };
  el.innerHTML = `
    <div class="page-head"><h1>🔔 거래 알림</h1>
      ${list.some(n => !n.read) ? '<button class="btn ghost sm" id="read-all">모두 읽음</button>' : ''}</div>
    ${list.length ? `<div class="rows">${list.map(n => `
      <div class="trow notif ${n.read ? '' : 'unread'}">
        <div class="log-icon">${icon[n.type] || '🔔'}</div>
        <a class="trow-main" href="${n.link && n.link.startsWith('#/') ? esc(n.link) : '#/notifications'}" data-read="${esc(n.id)}"><b>${esc(n.title)}</b><div class="small">${esc(n.body)}</div><div class="muted tiny">${timeAgo(n.createdAt)}</div></a>
        <button class="icon-btn" data-del="${esc(n.id)}" aria-label="알림 삭제">✕</button>
      </div>`).join('')}</div>` : '<div class="empty"><div class="empty-icon">🔕</div><p class="muted">알림이 없어요. 상품을 사거나 팔면 여기에 알려 드려요.</p></div>'}`;
  const ra = $('#read-all', el);
  if (ra) ra.addEventListener('click', () => state.api.markNotificationsRead(list.filter(n => !n.read).map(n => n.id)).catch(e => toast(friendlyError(e), 'error')));
  $$('[data-read]', el).forEach(a => a.addEventListener('click', () => {
    const n = list.find(x => x.id === a.dataset.read);
    if (n && !n.read) state.api.markNotificationsRead([n.id]).catch(() => {});
  }));
  $$('[data-del]', el).forEach(b => b.addEventListener('click', () => state.api.deleteNotification(b.dataset.del).catch(e => toast(friendlyError(e), 'error'))));
}

// ─────────────────────────────────────────────── 관리자
// 이 화면을 여는 것만으로는 아무 권한도 생기지 않아요.
// 모든 관리자 동작은 서버(Cloud Functions)와 보안 규칙이 admins/{uid} 를 다시 확인해요.

const ADMIN_TABS = [['dashboard', '대시보드'], ['products', '상품 관리'], ['users', '회원 관리'], ['trades', '거래 내역'], ['notices', '공지사항'], ['demo', '테스트 데이터']];

function viewAdmin(el, [tab = 'dashboard']) {
  if (needLogin(el)) return;
  if (!state.user.isAdmin) {
    el.innerHTML = '<div class="empty big"><div class="empty-icon">🛡️</div><h2>관리자 전용 페이지예요</h2><p class="muted">관리자 권한이 있는 계정으로 로그인해 주세요.</p><a class="btn primary" href="#/">홈으로</a></div>';
    return;
  }
  if (!ADMIN_TABS.some(t => t[0] === tab)) tab = 'dashboard';
  el.innerHTML = `
    <div class="page-head"><h1>🛡️ 관리자</h1><span class="muted small">${state.api.mode === 'local' ? '체험 모드' : 'Firebase'}</span></div>
    <nav class="tabs" role="tablist">${ADMIN_TABS.map(([k, l]) => `<a role="tab" aria-selected="${k === tab}" class="${k === tab ? 'on' : ''}" href="#/admin/${k}">${l}</a>`).join('')}</nav>
    <div id="admin-body"><div class="detail-loading">불러오는 중…</div></div>`;
  let body = $('#admin-body', el);
  const fns = { dashboard: adminDashboard, products: adminProducts, users: adminUsers, trades: adminTrades, notices: adminNotices, demo: adminDemo };
  // 다시 불러올 때는 영역을 새로 만들어서 이벤트가 겹치지 않게 해요.
  const run = (fresh = true) => {
    if (fresh) { const b = document.createElement('div'); b.id = 'admin-body'; body.replaceWith(b); body = b; }
    const target = body;
    fns[tab](target, () => run(true)).catch(e => { target.innerHTML = `<div class="empty"><p class="form-error">${esc(friendlyError(e))}</p></div>`; });
  };
  run(false);
}

async function adminDashboard(body) {
  const A = state.api.admin;
  const [users, products, trades] = await Promise.all([A.users(), A.products(), A.trades()]);
  const volume = trades.reduce((s, t) => s + t.total, 0);
  const circulating = users.reduce((s, u) => s + (u.points || 0), 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayTrades = trades.filter(t => t.createdAt >= today.getTime());
  body.innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>회원</span><b>${users.length.toLocaleString('ko-KR')}</b><small>정지 ${users.filter(u => u.banned).length}</small></div>
      <div class="kpi"><span>상품</span><b>${products.length.toLocaleString('ko-KR')}</b><small>테스트 ${products.filter(p => p.isDemo).length} · 숨김 ${products.filter(p => p.status !== 'active').length}</small></div>
      <div class="kpi"><span>거래</span><b>${trades.length.toLocaleString('ko-KR')}</b><small>오늘 ${todayTrades.length}건</small></div>
      <div class="kpi"><span>누적 거래액</span><b>${fmtP(volume)}</b><small>오늘 ${fmtP(todayTrades.reduce((s, t) => s + t.total, 0))}</small></div>
      <div class="kpi"><span>유통 포인트</span><b>${fmtP(circulating)}</b><small>회원 보유 합계</small></div>
    </div>
    <div class="section"><div class="section-head"><h2>최근 거래</h2><a class="more" href="#/admin/trades">전체 보기 →</a></div>
      ${trades.length ? `<div class="rows">${trades.slice(0, 8).map(t => tradeRow(t, 'admin')).join('')}</div>` : '<p class="muted">거래가 없어요.</p>'}</div>`;
}

async function adminProducts(body, rerun) {
  const list = await state.api.admin.products();
  body.innerHTML = `
    <div class="toolbar">
      <input class="input" type="search" id="ap-q" placeholder="상품명, 판매자 검색" aria-label="상품 검색">
      <select class="input" id="ap-f" aria-label="상품 필터"><option value="">전체</option><option value="active">판매 중</option><option value="hidden">숨김</option><option value="demo">테스트 상품</option><option value="real">실제 상품</option></select>
      <span class="muted" id="ap-count"></span>
    </div><div id="ap-list"></div>`;
  const draw = () => {
    const q = $('#ap-q', body).value.trim().toLowerCase();
    const f = $('#ap-f', body).value;
    const rows = list.filter(p => (!q || `${p.title} ${p.sellerName}`.toLowerCase().includes(q))
      && (!f || (f === 'demo' ? p.isDemo : f === 'real' ? !p.isDemo : p.status === f)));
    $('#ap-count', body).textContent = `${rows.length}개`;
    $('#ap-list', body).innerHTML = rows.length ? `<div class="rows">${rows.map(p => `
      <div class="trow">
        ${thumb(p, 'mini')}
        <div class="trow-main"><a href="#/product/${encodeURIComponent(p.id)}"><b>${esc(p.title)}</b></a>
          ${p.isDemo ? '<span class="badge demo">테스트</span>' : ''}${p.status !== 'active' ? `<span class="badge hidden">${p.hiddenByAdmin ? '정지로 숨김' : '숨김'}</span>` : ''}
          <div class="muted small">${esc(p.sellerName)} · ${fmtP(p.price)} · 재고 ${p.stock} · 판매 ${p.soldCount || 0} · ${fmtDate(p.createdAt, false)}</div></div>
        <div class="trow-actions">
          <button class="btn ghost sm" data-hide="${esc(p.id)}">${p.status === 'active' ? '숨기기' : '공개'}</button>
          <button class="btn danger sm" data-del="${esc(p.id)}">삭제</button>
        </div>
      </div>`).join('')}</div>` : '<div class="empty"><p class="muted">상품이 없어요.</p></div>';
  };
  $('#ap-q', body).addEventListener('input', debounce(draw, 150));
  $('#ap-f', body).addEventListener('change', draw);
  body.addEventListener('click', async e => {
    const h = e.target.closest('[data-hide]'); const d = e.target.closest('[data-del]');
    if (h) {
      const p = list.find(x => x.id === h.dataset.hide);
      try { await state.api.admin.setProductStatus(p.id, p.status === 'active' ? 'hidden' : 'active'); toast('상태를 바꿨어요.', 'success'); rerun(); }
      catch (err) { toast(friendlyError(err), 'error'); }
    }
    if (d) {
      const p = list.find(x => x.id === d.dataset.del);
      if (!await confirmDialog({ title: '상품 삭제', message: `“${p.title}” (${p.sellerName}) 상품을 삭제할까요?`, okLabel: '삭제', danger: true })) return;
      try { await state.api.admin.deleteProduct(p.id); toast('삭제했어요.', 'success'); rerun(); }
      catch (err) { toast(friendlyError(err), 'error'); }
    }
  });
  draw();
}

async function adminUsers(body, rerun) {
  const list = (await state.api.admin.users()).filter(u => u.id !== 'demo-seller');
  body.innerHTML = `
    <div class="toolbar"><input class="input" type="search" id="au-q" placeholder="아이디, 닉네임 검색" aria-label="회원 검색"><span class="muted" id="au-count"></span></div>
    <div id="au-list"></div>`;
  const draw = () => {
    const q = $('#au-q', body).value.trim().toLowerCase();
    const rows = list.filter(u => !q || `${u.username} ${u.nickname}`.toLowerCase().includes(q));
    $('#au-count', body).textContent = `${rows.length}명`;
    $('#au-list', body).innerHTML = rows.length ? `<div class="rows">${rows.map(u => `
      <div class="trow">
        <div class="avatar">${esc((u.nickname || '?').slice(0, 1))}</div>
        <div class="trow-main"><b>${esc(u.nickname)}</b> <span class="muted">@${esc(u.username)}</span> ${u.banned ? '<span class="badge out">정지</span>' : ''} ${u.id === state.user.uid ? '<span class="badge admin">나</span>' : ''}
          <div class="muted small">구매 ${u.purchaseCount || 0} · 판매 ${u.salesCount || 0} · ${fmtDate(u.createdAt, false)} 가입</div></div>
        <div class="trow-amt">${fmtP(u.points)}</div>
        <div class="trow-actions">
          <button class="btn ghost sm" data-pts="${esc(u.id)}">포인트</button>
          ${u.id !== state.user.uid ? `<button class="btn ${u.banned ? 'ghost' : 'danger'} sm" data-ban="${esc(u.id)}">${u.banned ? '정지 해제' : '정지'}</button>` : ''}
        </div>
      </div>`).join('')}</div>` : '<div class="empty"><p class="muted">회원이 없어요.</p></div>';
  };
  $('#au-q', body).addEventListener('input', debounce(draw, 150));
  body.addEventListener('click', async e => {
    const p = e.target.closest('[data-pts]'); const b = e.target.closest('[data-ban]');
    if (p) {
      const u = list.find(x => x.id === p.dataset.pts);
      promptDialog({
        title: `${u.nickname}님 포인트 조정`,
        note: `현재 ${fmtP(u.points)} · 지급은 양수, 회수는 음수로 입력하세요. (예: 5000, -2000)`,
        fields: [
          { name: 'delta', label: '포인트', type: 'number', step: 1, placeholder: '5000 또는 -2000' },
          { name: 'memo', label: '사유 (회원에게 보여요)', maxlength: 100, placeholder: '이벤트 당첨' },
        ],
        okLabel: '적용',
        onSubmit: async ({ delta, memo }) => {
          const n = Number(delta);
          if (!Number.isInteger(n) || n === 0) throw new Error('0이 아닌 정수를 입력해 주세요.');
          try { const r = await state.api.admin.adjustPoints(u.id, n, memo); toast(`${u.nickname}님 잔액 ${fmtP(r.balance)}`, 'success'); }
          catch (err) { throw new Error(friendlyError(err)); }
          rerun();
        },
      });
    }
    if (b) {
      const u = list.find(x => x.id === b.dataset.ban);
      const ban = !u.banned;
      if (!await confirmDialog({ title: ban ? '회원 정지' : '정지 해제', message: ban ? `${u.nickname}님을 정지할까요?\n로그인이 막히고 판매 중인 상품이 숨겨져요.` : `${u.nickname}님의 정지를 풀까요?\n정지 때문에 숨겨진 상품이 다시 보여요.`, okLabel: ban ? '정지' : '해제', danger: ban })) return;
      try { await state.api.admin.setBan(u.id, ban); toast(ban ? '정지했어요.' : '정지를 풀었어요.', 'success'); rerun(); }
      catch (err) { toast(friendlyError(err), 'error'); }
    }
  });
  draw();
}

async function adminTrades(body) {
  const [trades, logs] = await Promise.all([state.api.admin.trades(), state.api.admin.pointLogs()]);
  body.innerHTML = `
    <div class="toolbar">
      <div class="sort-tabs"><a href="#" class="on" data-kind="trades">거래 ${trades.length}</a><a href="#" data-kind="logs">포인트 내역 ${logs.length}</a></div>
      <input class="input" type="search" id="at-q" placeholder="거래 검색 (상품명, 회원, 거래번호)" aria-label="거래 검색">
      <input class="input" type="date" id="at-from" aria-label="시작 날짜"><span class="muted">~</span><input class="input" type="date" id="at-to" aria-label="끝 날짜">
      <span class="muted" id="at-sum"></span>
    </div><div id="at-list"></div>`;
  let kind = 'trades';
  const draw = () => {
    const q = $('#at-q', body).value.trim().toLowerCase();
    const from = $('#at-from', body).value ? new Date($('#at-from', body).value + 'T00:00:00').getTime() : 0;
    const to = $('#at-to', body).value ? new Date($('#at-to', body).value + 'T23:59:59').getTime() : Infinity;
    const inRange = x => x.createdAt >= from && x.createdAt <= to;
    if (kind === 'trades') {
      const rows = trades.filter(t => inRange(t) && (!q || `${t.productTitle} ${t.buyerName} ${t.sellerName} ${t.id}`.toLowerCase().includes(q)));
      $('#at-sum', body).textContent = `${rows.length}건 · ${fmtP(rows.reduce((s, t) => s + t.total, 0))}`;
      $('#at-list', body).innerHTML = rows.length ? `<div class="rows">${rows.map(t => tradeRow(t, 'admin')).join('')}</div>` : '<div class="empty"><p class="muted">거래가 없어요.</p></div>';
    } else {
      const rows = logs.filter(l => inRange(l) && (!q || `${l.memo} ${l.uid} ${LOG_TYPES[l.type]}`.toLowerCase().includes(q)));
      $('#at-sum', body).textContent = `${rows.length}건`;
      $('#at-list', body).innerHTML = rows.length ? `<div class="rows">${rows.map(l => `
        <div class="trow"><div class="log-icon ${l.delta >= 0 ? 'pos' : 'neg'}">${l.delta >= 0 ? '＋' : '－'}</div>
          <div class="trow-main"><b>${esc(LOG_TYPES[l.type] || l.type)}</b> <span class="muted small">회원 ${esc(l.uid)}</span><div class="muted small">${esc(l.memo)} · ${fmtDate(l.createdAt)}</div></div>
          <div class="trow-amt ${l.delta >= 0 ? 'pos' : 'neg'}">${l.delta >= 0 ? '+' : '−'}${fmtP(Math.abs(l.delta))}<div class="muted tiny">잔액 ${fmtP(l.balance)}</div></div></div>`).join('')}</div>`
        : '<div class="empty"><p class="muted">내역이 없어요.</p></div>';
    }
  };
  $$('[data-kind]', body).forEach(a => a.addEventListener('click', e => {
    e.preventDefault(); kind = a.dataset.kind;
    $$('[data-kind]', body).forEach(x => x.classList.toggle('on', x === a)); draw();
  }));
  $('#at-q', body).addEventListener('input', debounce(draw, 150));
  $('#at-from', body).addEventListener('change', draw);
  $('#at-to', body).addEventListener('change', draw);
  draw();
}

async function adminNotices(body) {
  const draw = () => {
    const list = state.notices;
    body.innerHTML = `
      <div class="toolbar"><button class="btn primary sm" id="new-notice">＋ 새 공지</button><span class="muted">${list.length}개</span></div>
      ${list.length ? `<div class="rows">${list.map(n => `
        <div class="trow"><div class="trow-main">${n.pinned ? '<span class="badge pin">고정</span>' : ''}<b>${esc(n.title)}</b><div class="muted small">${fmtDate(n.createdAt)} · ${esc(n.authorName)}</div></div>
          <div class="trow-actions"><button class="btn ghost sm" data-edit="${esc(n.id)}">수정</button><button class="btn danger sm" data-del="${esc(n.id)}">삭제</button></div></div>`).join('')}</div>`
        : '<div class="empty"><p class="muted">공지가 없어요.</p></div>'}`;
  };
  const editor = (n) => promptDialog({
    title: n ? '공지 수정' : '새 공지',
    fields: [
      { name: 'title', label: '제목', value: n ? n.title : '', maxlength: 80 },
      { name: 'body', label: '내용', type: 'textarea', value: n ? n.body : '', maxlength: 3000 },
      { name: 'pinned', label: '상단 고정', type: 'checkbox', value: n ? n.pinned : false, hint: '홈 화면 위쪽에 보여요' },
    ],
    okLabel: n ? '저장' : '등록',
    onSubmit: async ({ title, body: text, pinned }) => {
      title = title.trim(); text = text.trim();
      if (title.length < 2 || title.length > 80) throw new Error('제목은 2~80자로 입력해 주세요.');
      if (!text) throw new Error('내용을 입력해 주세요.');
      try {
        if (n) await state.api.admin.updateNotice(n.id, { title, body: text, pinned });
        else await state.api.admin.createNotice({ title, body: text, pinned });
      } catch (err) { throw new Error(friendlyError(err)); }
      toast(n ? '공지를 수정했어요.' : '공지를 등록했어요.', 'success');
    },
  });
  view.live = ['notices'];
  draw();
  body.addEventListener('click', async e => {
    if (e.target.closest('#new-notice')) editor(null);
    const ed = e.target.closest('[data-edit]'); const dl = e.target.closest('[data-del]');
    if (ed) editor(state.notices.find(n => n.id === ed.dataset.edit));
    if (dl) {
      const n = state.notices.find(x => x.id === dl.dataset.del);
      if (!await confirmDialog({ title: '공지 삭제', message: `“${n.title}” 공지를 삭제할까요?`, okLabel: '삭제', danger: true })) return;
      try { await state.api.admin.deleteNotice(n.id); toast('삭제했어요.', 'success'); } catch (err) { toast(friendlyError(err), 'error'); }
    }
  });
}

async function adminDemo(body) {
  const products = await state.api.admin.products();
  const demo = products.filter(p => p.isDemo).length;
  body.innerHTML = `
    <div class="panel">
      <h3>테스트용 가짜 데이터</h3>
      <p class="muted">테스트 상품은 <span class="badge demo">테스트</span> 배지가 붙고, ${state.api.canBuyDemo ? '체험 모드에서는 살 수 있어요.' : '실제 서비스에서는 구매할 수 없어요.'} 실제 회원이 올린 상품과 섞이지 않게 <code>isDemo</code> 표시로 구분해요.</p>
      <p>현재 테스트 상품 <b>${demo}</b>개 · 실제 상품 <b>${products.length - demo}</b>개</p>
      <div class="row gap"><button class="btn primary" id="seed">테스트 상품 12개 넣기</button><button class="btn danger" id="clear" ${demo ? '' : 'disabled'}>테스트 상품 모두 지우기</button></div>
    </div>
    ${state.api.mode === 'local' ? `<div class="panel"><h3>체험 모드 초기화</h3><p class="muted">이 브라우저에 저장된 체험 모드 데이터(회원, 상품, 거래)를 모두 지우고 처음 상태로 돌려요.</p><button class="btn danger" id="reset">전체 초기화</button></div>` : ''}`;
  $('#seed', body).addEventListener('click', async e => {
    e.target.disabled = true;
    try { const r = await state.api.admin.seedDemo(); toast(`테스트 상품 ${r.count}개를 넣었어요.`, 'success'); adminDemo(body); }
    catch (err) { toast(friendlyError(err), 'error'); e.target.disabled = false; }
  });
  $('#clear', body).addEventListener('click', async e => {
    if (!await confirmDialog({ title: '테스트 상품 삭제', message: `테스트 상품 ${demo}개를 모두 지울까요? 실제 상품은 지워지지 않아요.`, okLabel: '지우기', danger: true })) return;
    e.target.disabled = true;
    try { const r = await state.api.admin.clearDemo(); toast(`테스트 상품 ${r.count}개를 지웠어요.`, 'success'); adminDemo(body); }
    catch (err) { toast(friendlyError(err), 'error'); e.target.disabled = false; }
  });
  const reset = $('#reset', body);
  if (reset) reset.addEventListener('click', async () => {
    if (!await confirmDialog({ title: '전체 초기화', message: '체험 모드의 모든 데이터를 지울까요?', okLabel: '초기화', danger: true })) return;
    await state.api.admin.resetAll(); toast('초기화했어요.', 'success'); go('#/');
  });
}

function viewNotFound(el) {
  el.innerHTML = '<div class="empty big"><div class="empty-icon">🧭</div><h2>페이지를 찾을 수 없어요</h2><a class="btn primary" href="#/">홈으로</a></div>';
}

boot();
