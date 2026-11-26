// 화면과 두 백엔드(Firebase, 체험 모드)가 함께 쓰는 상수와 검증 규칙.
// 같은 규칙이 functions/index.js 와 firestore.rules 에도 있어요. 하나를 바꾸면 셋 다 바꿔 주세요.

export const CATEGORIES = [
  { id: 'game', name: '게임 아이템', emoji: '🗡️' },
  { id: 'skin', name: '스킨·꾸미기', emoji: '🎨' },
  { id: 'digital', name: '디지털 상품', emoji: '💾' },
  { id: 'goods', name: '굿즈·피규어', emoji: '🧸' },
  { id: 'boardgame', name: '보드게임', emoji: '🎲' },
  { id: 'electronics', name: '전자기기', emoji: '🎧' },
  { id: 'etc', name: '기타', emoji: '📦' },
];
export const CATEGORY_IDS = CATEGORIES.map(c => c.id);
export const categoryOf = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

export const SIGNUP_BONUS = 10000;
export const MAX_QTY = 99;
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
// Firebase Authentication 은 이메일로 계정을 만들어요. 아이디를 이 도메인의 가상 이메일로 바꿔 써요.
// .example 은 실제로 존재할 수 없는 예약 도메인이라 메일이 나가지 않아요.
export const EMAIL_DOMAIN = 'tradehub.example';
export const usernameToEmail = u => `${u}@${EMAIL_DOMAIN}`;

export const LIMITS = {
  title: [2, 60], description: [0, 2000], price: [1, 10000000], stock: [0, 9999],
  nickname: [2, 16], bio: [0, 200], password: [6, 64],
  noticeTitle: [2, 80], noticeBody: [1, 3000],
};

export function validateUsername(u) {
  if (!USERNAME_RE.test(u || '')) return '아이디는 영문 소문자, 숫자, _ 로 3~20자예요.';
  return null;
}
export function validateNickname(n) {
  const s = (n || '').trim();
  if (s.length < LIMITS.nickname[0] || s.length > LIMITS.nickname[1]) return '닉네임은 2~16자로 입력해 주세요.';
  return null;
}
export function validatePassword(p) {
  if ((p || '').length < LIMITS.password[0]) return '비밀번호는 6자 이상이어야 해요.';
  if (p.length > LIMITS.password[1]) return '비밀번호가 너무 길어요.';
  return null;
}

// 상품 입력값을 정리하고 검사해요. 문제가 있으면 { error }, 없으면 { value }.
export function normalizeProduct(input) {
  const title = String(input.title || '').trim();
  const description = String(input.description || '').trim();
  const price = Number(input.price);
  const stock = Number(input.stock);
  const category = String(input.category || '');
  const status = input.status === 'hidden' ? 'hidden' : 'active';
  if (title.length < LIMITS.title[0] || title.length > LIMITS.title[1]) return { error: '상품 이름은 2~60자로 입력해 주세요.' };
  if (description.length > LIMITS.description[1]) return { error: '설명은 2000자까지 쓸 수 있어요.' };
  if (!Number.isInteger(price) || price < LIMITS.price[0] || price > LIMITS.price[1]) return { error: '가격은 1 ~ 10,000,000 P 사이의 정수로 입력해 주세요.' };
  if (!Number.isInteger(stock) || stock < LIMITS.stock[0] || stock > LIMITS.stock[1]) return { error: '재고는 0 ~ 9,999 사이의 정수로 입력해 주세요.' };
  if (!CATEGORY_IDS.includes(category)) return { error: '카테고리를 골라 주세요.' };
  return { value: { title, description, price, stock, category, status } };
}

export const fmtP = n => `${Number(n || 0).toLocaleString('ko-KR')} P`;

// 구매 요청마다 하나씩 만드는 고유 번호. 같은 번호로 두 번 요청하면 서버가 한 번만 처리해요.
export function newRequestId() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Date.now().toString(36) + '-' + Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}

// 서버/백엔드 오류 코드를 사용자에게 보여 줄 문장으로 바꿔요.
export function friendlyError(e) {
  const code = (e && (e.code || '')).replace(/^functions\//, '').replace(/^auth\//, 'auth/');
  const map = {
    'auth/invalid-credential': '아이디 또는 비밀번호가 맞지 않아요.',
    'auth/wrong-password': '아이디 또는 비밀번호가 맞지 않아요.',
    'auth/user-not-found': '아이디 또는 비밀번호가 맞지 않아요.',
    'auth/invalid-email': '아이디 형식이 올바르지 않아요.',
    'auth/email-already-in-use': '이미 사용 중인 아이디예요.',
    'auth/weak-password': '비밀번호는 6자 이상이어야 해요.',
    'auth/too-many-requests': '시도가 너무 많아요. 잠시 후 다시 해 주세요.',
    'auth/user-disabled': '이용이 정지된 계정이에요. 관리자에게 문의해 주세요.',
    'auth/network-request-failed': '네트워크 연결을 확인해 주세요.',
    'permission-denied': '권한이 없어요.',
    'unavailable': '서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.',
    'internal': '서버에서 문제가 생겼어요. Cloud Functions 배포 상태를 확인해 주세요.',
    'not-found': '찾을 수 없어요.',
  };
  if (e && e.message && /^[가-힣]/.test(e.message)) return e.message; // 서버가 보낸 한국어 메시지
  return map[code] || (e && e.message) || '알 수 없는 오류가 생겼어요.';
}
