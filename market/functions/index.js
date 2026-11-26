// TradeHub 서버 코드 (Firebase Cloud Functions, 2세대)
// 포인트가 움직이거나 권한이 필요한 일은 모두 여기서 검사하고 처리해요.
// 브라우저는 포인트·관리자 권한·거래 기록을 직접 쓸 수 없어요(firestore.rules 에서 막아요).

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

initializeApp();
const db = getFirestore();

// 서울 리전. 바꾸면 js/firebase-config.js 의 functionsRegion 도 같이 바꿔 주세요.
setGlobalOptions({ region: 'asia-northeast3', maxInstances: 10 });

const SIGNUP_BONUS = 10000;
const MAX_QTY = 99;
const MAX_ADJUST = 100000000;
const EMAIL_DOMAIN = 'tradehub.example';
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

const fail = (code, msg) => { throw new HttpsError(code, msg); };

function requireAuth(req) {
  if (!req.auth) fail('unauthenticated', '로그인이 필요해요.');
  return req.auth.uid;
}

// 관리자인지는 Firestore 의 admins/{uid} 문서로 판단해요.
// 이 컬렉션은 보안 규칙상 누구도 브라우저에서 쓸 수 없고, Firebase 콘솔에서만 만들 수 있어요.
async function requireAdmin(req) {
  const uid = requireAuth(req);
  const snap = await db.doc(`admins/${uid}`).get();
  if (!snap.exists) fail('permission-denied', '관리자만 사용할 수 있어요.');
  return uid;
}

function text(v, min, max, label) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min || s.length > max) fail('invalid-argument', `${label}은(는) ${min}~${max}자로 입력해 주세요.`);
  return s;
}

function int(v, min, max, label) {
  if (!Number.isInteger(v) || v < min || v > max) fail('invalid-argument', `${label} 값이 올바르지 않아요.`);
  return v;
}

function notify(tx, uid, data) {
  const ref = db.collection('users').doc(uid).collection('notifications').doc();
  tx.set(ref, { ...data, read: false, createdAt: FieldValue.serverTimestamp() });
}

function pointLog(tx, data) {
  tx.set(db.collection('pointLogs').doc(), { ...data, createdAt: FieldValue.serverTimestamp() });
}

async function loadActiveMember(tx, uid) {
  const snap = await tx.get(db.doc(`users/${uid}`));
  if (!snap.exists) fail('failed-precondition', '회원 정보가 없어요. 다시 로그인해 주세요.');
  if (snap.data().banned) fail('permission-denied', '이용이 정지된 계정이에요.');
  return snap;
}

// ── 회원 ─────────────────────────────────────────────

// 가입 직후 한 번 불러요. 회원 문서를 만들고 가입 포인트를 줘요. 여러 번 불러도 한 번만 처리해요.
exports.createProfile = onCall(async (req) => {
  const uid = requireAuth(req);
  const email = req.auth.token.email || '';
  const [username, domain] = email.split('@');
  if (domain !== EMAIL_DOMAIN || !USERNAME_RE.test(username || '')) fail('invalid-argument', '아이디 형식이 올바르지 않아요.');
  const nickname = text(req.data && req.data.nickname, 2, 16, '닉네임');

  return db.runTransaction(async (tx) => {
    const ref = db.doc(`users/${uid}`);
    const snap = await tx.get(ref);
    if (snap.exists) return { created: false };
    tx.set(ref, {
      username, nickname, bio: '', points: SIGNUP_BONUS, banned: false,
      purchaseCount: 0, salesCount: 0, createdAt: FieldValue.serverTimestamp(),
    });
    pointLog(tx, { uid, delta: SIGNUP_BONUS, balance: SIGNUP_BONUS, type: 'signup', memo: '가입 축하 포인트', refId: '' });
    notify(tx, uid, { type: 'points', title: '가입을 환영해요!', body: `가입 축하 포인트 ${SIGNUP_BONUS.toLocaleString('ko-KR')} P가 들어왔어요.`, link: '#/me/points' });
    return { created: true };
  });
});

// 닉네임·소개 수정. 내 상품에 적힌 판매자 이름도 함께 바꿔요.
exports.updateProfile = onCall(async (req) => {
  const uid = requireAuth(req);
  const nickname = text(req.data && req.data.nickname, 2, 16, '닉네임');
  const bio = typeof (req.data && req.data.bio) === 'string' ? req.data.bio.trim() : '';
  if (bio.length > 200) fail('invalid-argument', '소개는 200자까지 쓸 수 있어요.');
  const userRef = db.doc(`users/${uid}`);
  const user = await userRef.get();
  if (!user.exists) fail('failed-precondition', '회원 정보가 없어요.');
  if (user.data().banned) fail('permission-denied', '이용이 정지된 계정이에요.');
  await userRef.update({ nickname, bio });
  if (user.data().nickname !== nickname) {
    const mine = await db.collection('products').where('sellerId', '==', uid).get();
    const writer = db.bulkWriter();
    mine.forEach(d => writer.update(d.ref, { sellerName: nickname }));
    await writer.close();
  }
  return { ok: true };
});

// ── 즐겨찾기 ─────────────────────────────────────────

exports.toggleFavorite = onCall(async (req) => {
  const uid = requireAuth(req);
  const productId = req.data && req.data.productId;
  if (typeof productId !== 'string' || !productId || productId.length > 128) fail('invalid-argument', '상품 정보가 올바르지 않아요.');
  return db.runTransaction(async (tx) => {
    const pRef = db.doc(`products/${productId}`);
    const fRef = db.doc(`users/${uid}/favorites/${productId}`);
    const [p, f] = await Promise.all([tx.get(pRef), tx.get(fRef)]);
    if (!p.exists) fail('not-found', '상품을 찾을 수 없어요.');
    if (f.exists) {
      tx.delete(fRef);
      tx.update(pRef, { favCount: Math.max(0, (p.data().favCount || 0) - 1) });
      return { favorited: false };
    }
    tx.set(fRef, { createdAt: FieldValue.serverTimestamp() });
    tx.update(pRef, { favCount: (p.data().favCount || 0) + 1 });
    return { favorited: true };
  });
});

// ── 구매 ─────────────────────────────────────────────
// 한 트랜잭션 안에서 재고·잔액을 확인하고, 구매자 차감·판매자 지급·재고 감소·거래 기록을 함께 저장해요.
// 중간에 하나라도 실패하면 아무것도 바뀌지 않아요.
// requestId 가 같은 요청은 한 번만 처리돼서(거래 문서 ID 로 씀) 버튼을 여러 번 눌러도 중복 구매되지 않아요.
exports.purchase = onCall(async (req) => {
  const uid = requireAuth(req);
  const d = req.data || {};
  const productId = d.productId;
  if (typeof productId !== 'string' || !productId || productId.length > 128) fail('invalid-argument', '상품 정보가 올바르지 않아요.');
  if (typeof d.requestId !== 'string' || !/^[A-Za-z0-9_-]{10,64}$/.test(d.requestId)) fail('invalid-argument', '요청 번호가 올바르지 않아요.');
  const qty = int(d.qty, 1, MAX_QTY, '수량');
  const expectedPrice = int(d.expectedPrice, 1, 10000000, '가격');
  const tradeId = `${uid}_${d.requestId}`;

  return db.runTransaction(async (tx) => {
    const tradeRef = db.doc(`trades/${tradeId}`);
    const productRef = db.doc(`products/${productId}`);
    const buyerRef = db.doc(`users/${uid}`);
    const [tradeSnap, productSnap] = await Promise.all([tx.get(tradeRef), tx.get(productRef)]);
    if (tradeSnap.exists) {
      const t = tradeSnap.data();
      return { tradeId, duplicate: true, total: t.total };
    }
    if (!productSnap.exists) fail('not-found', '상품이 삭제되었거나 찾을 수 없어요.');
    const p = productSnap.data();
    if (p.status !== 'active') fail('failed-precondition', '지금은 판매하지 않는 상품이에요.');
    if (p.isDemo) fail('failed-precondition', '테스트 상품은 구매할 수 없어요.');
    if (p.sellerId === uid) fail('failed-precondition', '내가 등록한 상품은 살 수 없어요.');
    if (p.price !== expectedPrice) fail('aborted', '그사이 가격이 바뀌었어요. 가격을 확인하고 다시 시도해 주세요.');
    if ((p.stock || 0) < qty) fail('failed-precondition', p.stock > 0 ? `재고가 ${p.stock}개만 남았어요.` : '품절된 상품이에요.');

    const sellerRef = db.doc(`users/${p.sellerId}`);
    const [buyerSnap, sellerSnap] = await Promise.all([tx.get(buyerRef), tx.get(sellerRef)]);
    if (!buyerSnap.exists) fail('failed-precondition', '회원 정보가 없어요. 다시 로그인해 주세요.');
    const buyer = buyerSnap.data();
    if (buyer.banned) fail('permission-denied', '이용이 정지된 계정이에요.');
    if (!sellerSnap.exists) fail('failed-precondition', '판매자 정보를 찾을 수 없어요.');
    const seller = sellerSnap.data();
    if (seller.banned) fail('failed-precondition', '판매가 중지된 판매자의 상품이에요.');

    const total = p.price * qty;
    if ((buyer.points || 0) < total) fail('failed-precondition', `포인트가 부족해요. (필요 ${total.toLocaleString('ko-KR')} P)`);
    const buyerBalance = buyer.points - total;
    const sellerBalance = (seller.points || 0) + total;

    tx.update(buyerRef, { points: buyerBalance, purchaseCount: FieldValue.increment(1) });
    tx.update(sellerRef, { points: sellerBalance, salesCount: FieldValue.increment(1) });
    tx.update(productRef, { stock: p.stock - qty, soldCount: FieldValue.increment(qty) });
    tx.set(tradeRef, {
      productId, productTitle: p.title, productImage: p.imageUrl || '', category: p.category,
      buyerId: uid, buyerName: buyer.nickname, sellerId: p.sellerId, sellerName: seller.nickname,
      qty, unitPrice: p.price, total, createdAt: FieldValue.serverTimestamp(),
    });
    pointLog(tx, { uid, delta: -total, balance: buyerBalance, type: 'purchase', memo: `${p.title} ×${qty} 구매`, refId: tradeId });
    pointLog(tx, { uid: p.sellerId, delta: total, balance: sellerBalance, type: 'sale', memo: `${p.title} ×${qty} 판매`, refId: tradeId });
    notify(tx, uid, { type: 'purchase', title: '구매 완료', body: `${p.title} ×${qty} — ${total.toLocaleString('ko-KR')} P를 사용했어요.`, link: '#/me/purchases' });
    notify(tx, p.sellerId, { type: 'sale', title: '상품이 팔렸어요!', body: `${buyer.nickname}님이 ${p.title} ×${qty}를 구매했어요. +${total.toLocaleString('ko-KR')} P`, link: '#/me/sales' });
    return { tradeId, duplicate: false, total, balance: buyerBalance };
  });
});

// ── 관리자 ───────────────────────────────────────────

exports.adminAdjustPoints = onCall(async (req) => {
  const adminUid = await requireAdmin(req);
  const d = req.data || {};
  if (typeof d.uid !== 'string' || !d.uid) fail('invalid-argument', '회원을 골라 주세요.');
  const delta = int(d.delta, -MAX_ADJUST, MAX_ADJUST, '포인트');
  if (delta === 0) fail('invalid-argument', '0이 아닌 값을 입력해 주세요.');
  const memo = typeof d.memo === 'string' ? d.memo.trim().slice(0, 100) : '';
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`users/${d.uid}`);
    const snap = await tx.get(ref);
    if (!snap.exists) fail('not-found', '회원을 찾을 수 없어요.');
    const balance = (snap.data().points || 0) + delta;
    if (balance < 0) fail('failed-precondition', `잔액보다 많이 회수할 수 없어요. (현재 ${(snap.data().points || 0).toLocaleString('ko-KR')} P)`);
    tx.update(ref, { points: balance });
    pointLog(tx, { uid: d.uid, delta, balance, type: delta > 0 ? 'admin_grant' : 'admin_revoke', memo: memo || (delta > 0 ? '관리자 지급' : '관리자 회수'), refId: '', adminId: adminUid });
    notify(tx, d.uid, {
      type: 'points', title: delta > 0 ? '포인트 지급' : '포인트 회수',
      body: `관리자가 ${Math.abs(delta).toLocaleString('ko-KR')} P를 ${delta > 0 ? '지급' : '회수'}했어요.${memo ? ` (${memo})` : ''}`, link: '#/me/points',
    });
    return { balance };
  });
});

exports.adminSetBan = onCall(async (req) => {
  const adminUid = await requireAdmin(req);
  const d = req.data || {};
  if (typeof d.uid !== 'string' || !d.uid) fail('invalid-argument', '회원을 골라 주세요.');
  if (d.uid === adminUid) fail('failed-precondition', '자기 자신은 정지할 수 없어요.');
  const banned = d.banned === true;
  const ref = db.doc(`users/${d.uid}`);
  if (!(await ref.get()).exists) fail('not-found', '회원을 찾을 수 없어요.');
  await ref.update({ banned });
  // 로그인 자체도 막고, 이미 로그인된 기기의 토큰도 끊어요.
  await getAuth().updateUser(d.uid, { disabled: banned });
  if (banned) await getAuth().revokeRefreshTokens(d.uid);
  // 정지된 회원의 상품은 숨기고, 해제하면 다시 보여요.
  const mine = await db.collection('products').where('sellerId', '==', d.uid).get();
  const writer = db.bulkWriter();
  mine.forEach(p => {
    if (banned && p.data().status === 'active') writer.update(p.ref, { status: 'hidden', hiddenByAdmin: true });
    if (!banned && p.data().hiddenByAdmin) writer.update(p.ref, { status: 'active', hiddenByAdmin: FieldValue.delete() });
  });
  await writer.close();
  return { banned };
});

// 테스트용 가짜 상품. isDemo: true 로 표시되고, 화면에 "테스트" 배지가 붙으며, 구매할 수 없어요.
const DEMO_PRODUCTS = [
  ['전설의 화염검 +12', 'game', 48000, 3, '공격력 +240, 화염 속성. 강화 실패 없이 12강 완료된 무기예요.'],
  ['한정판 네온 캐릭터 스킨', 'skin', 15000, 10, '시즌 이벤트에서만 얻을 수 있던 네온 테마 스킨이에요.'],
  ['인디게임 스팀 키 묶음', 'digital', 9900, 25, '인디 게임 3종 등록 키 묶음. 등록 방법 안내 포함.'],
  ['픽셀 드래곤 아크릴 스탠드', 'goods', 12000, 7, '15cm 크기, 받침 포함. 새 상품.'],
  ['전략 보드게임 확장팩', 'boardgame', 32000, 4, '기본판이 있어야 플레이할 수 있는 확장팩이에요. 미개봉.'],
  ['무선 게이밍 헤드셋', 'electronics', 89000, 2, '7.1 채널, 배터리 30시간. 사용감 거의 없음.'],
  ['희귀 펫 알 (무작위)', 'game', 5500, 40, '부화하면 희귀 등급 이상 펫이 나와요.'],
  ['골드 프레임 프로필 테두리', 'skin', 3000, 99, '프로필에 금색 테두리가 생겨요.'],
  ['OST 디지털 앨범', 'digital', 7700, 50, '24곡 고음질 음원 다운로드 코드.'],
  ['한정판 메탈 주사위 세트', 'boardgame', 18000, 6, '금속 재질 7종 주사위 + 파우치.'],
  ['기계식 키보드 키캡 세트', 'electronics', 42000, 5, 'PBT 재질, 영문/한글 각인.'],
  ['럭키 박스', 'etc', 1000, 0, '무엇이 들었는지 아무도 몰라요. (품절 표시 테스트용)'],
];

exports.adminSeedDemo = onCall(async (req) => {
  await requireAdmin(req);
  const batch = db.batch();
  const now = Date.now();
  DEMO_PRODUCTS.forEach(([title, category, price, stock, description], i) => {
    batch.set(db.collection('products').doc(), {
      title, category, price, stock, description, status: 'active', isDemo: true,
      imageUrl: '', imagePath: '', sellerId: 'demo-seller', sellerName: '테스트 상점',
      soldCount: Math.floor(Math.random() * 30), favCount: Math.floor(Math.random() * 20),
      createdAt: new Date(now - i * 3600 * 1000), updatedAt: new Date(now - i * 3600 * 1000),
    });
  });
  await batch.commit();
  return { count: DEMO_PRODUCTS.length };
});

exports.adminClearDemo = onCall(async (req) => {
  await requireAdmin(req);
  const snap = await db.collection('products').where('isDemo', '==', true).get();
  const writer = db.bulkWriter();
  snap.forEach(d => writer.delete(d.ref));
  await writer.close();
  return { count: snap.size };
});
