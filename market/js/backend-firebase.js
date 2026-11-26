// 실제 서비스용 백엔드: Firebase Authentication + Cloud Firestore + Cloud Functions + Storage
// 포인트가 움직이는 일(구매, 지급/회수, 가입 포인트)은 전부 Cloud Functions 를 불러서 처리해요.

import { usernameToEmail, newRequestId } from './shared.js';

const SDK = 'https://www.gstatic.com/firebasejs/13.2.0';

const ms = v => (v && typeof v.toMillis === 'function') ? v.toMillis() : (typeof v === 'number' ? v : Date.now());
const norm = snap => {
  const d = snap.data();
  const o = { id: snap.id, ...d };
  if ('createdAt' in d) o.createdAt = ms(d.createdAt);
  if ('updatedAt' in d) o.updatedAt = ms(d.updatedAt);
  return o;
};
const byNewest = (a, b) => b.createdAt - a.createdAt;

export async function createFirebaseBackend({ config, region, emulators }) {
  const [appM, authM, fsM, fnM, stM] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
    import(`${SDK}/firebase-functions.js`),
    import(`${SDK}/firebase-storage.js`),
  ]);
  const { initializeApp } = appM;
  const {
    getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
    signOut, setPersistence, browserLocalPersistence, connectAuthEmulator, deleteUser,
  } = authM;
  const {
    getFirestore, connectFirestoreEmulator, collection, doc, getDoc, getDocs, onSnapshot, query, where, limit,
    addDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch,
  } = fsM;
  const { getFunctions, httpsCallable, connectFunctionsEmulator } = fnM;
  const { getStorage, connectStorageEmulator, ref: sRef, uploadBytes, getDownloadURL, deleteObject } = stM;

  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const fns = getFunctions(app, region);
  const storage = config.storageBucket ? getStorage(app) : null;
  if (emulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(fns, '127.0.0.1', 5001);
    if (storage) connectStorageEmulator(storage, '127.0.0.1', 9199);
  }
  await setPersistence(auth, browserLocalPersistence);

  const call = async (name, data) => (await httpsCallable(fns, name)(data)).data;

  let current = null; // { uid, ...profile, isAdmin }
  let profileUnsub = null;
  const authListeners = new Set();
  const emitAuth = () => authListeners.forEach(cb => cb(current));
  let pendingNickname = null; // 가입 직후 프로필 만들 때 쓸 닉네임

  onAuthStateChanged(auth, async (fbUser) => {
    if (profileUnsub) { profileUnsub(); profileUnsub = null; }
    if (!fbUser) { current = null; emitAuth(); return; }
    let isAdmin = false;
    try { isAdmin = (await getDoc(doc(db, 'admins', fbUser.uid))).exists(); } catch { isAdmin = false; }
    let triedCreate = false;
    profileUnsub = onSnapshot(doc(db, 'users', fbUser.uid), async (snap) => {
      if (!snap.exists()) {
        // 가입 도중 창을 닫아 프로필이 없는 경우에도 여기서 만들어요.
        if (!triedCreate) {
          triedCreate = true;
          const nickname = pendingNickname || fbUser.email.split('@')[0];
          try { await call('createProfile', { nickname }); } catch (e) { console.error(e); current = null; emitAuth(); }
        }
        return;
      }
      current = { uid: fbUser.uid, ...norm(snap), isAdmin };
      emitAuth();
    }, (err) => { console.error(err); });
  });

  // 상품 이미지를 최대 1200px JPEG 로 줄여서 올려요.
  async function uploadImage(file) {
    if (!storage) throw new Error('Storage 가 설정되지 않아 이미지를 올릴 수 없어요. (firebase-config.js 의 storageBucket 확인)');
    const blob = await shrinkImage(file, 1200, 0.85);
    const path = `products/${auth.currentUser.uid}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    await uploadBytes(sRef(storage, path), blob, { contentType: 'image/jpeg' });
    return { imagePath: path, imageUrl: await getDownloadURL(sRef(storage, path)) };
  }
  async function removeImage(path) {
    if (!path || !storage) return;
    try { await deleteObject(sRef(storage, path)); } catch { /* 이미 지워졌으면 무시 */ }
  }

  const requireUser = () => {
    if (!auth.currentUser || !current) throw new Error('로그인이 필요해요.');
    return current;
  };

  return {
    mode: 'firebase',
    canBuyDemo: false,

    onAuth(cb) { authListeners.add(cb); return () => authListeners.delete(cb); },
    get user() { return current; },

    async signUp(username, password, nickname) {
      pendingNickname = nickname;
      const cred = await createUserWithEmailAndPassword(auth, usernameToEmail(username), password);
      try {
        await call('createProfile', { nickname });
      } catch (e) {
        // 프로필을 못 만들면 반쪽 계정이 남지 않도록 지워요.
        try { await deleteUser(cred.user); } catch { /* 무시 */ }
        throw e;
      }
    },
    async signIn(username, password) {
      await signInWithEmailAndPassword(auth, usernameToEmail(username), password);
    },
    async signOut() { await signOut(auth); },

    // ── 상품 ──
    watchProducts(cb, onError) {
      return onSnapshot(query(collection(db, 'products'), where('status', '==', 'active'), limit(1000)),
        s => cb(s.docs.map(norm)), e => { console.error(e); onError && onError(e); });
    },
    watchProduct(id, cb) {
      return onSnapshot(doc(db, 'products', id), s => cb(s.exists() ? norm(s) : null), () => cb(null));
    },
    async myProducts() {
      const u = requireUser();
      const s = await getDocs(query(collection(db, 'products'), where('sellerId', '==', u.uid)));
      return s.docs.map(norm).sort(byNewest);
    },
    async createProduct(data, imageFile) {
      const u = requireUser();
      let img = { imageUrl: '', imagePath: '' };
      if (imageFile) img = await uploadImage(imageFile);
      try {
        const r = await addDoc(collection(db, 'products'), {
          ...data, ...img, sellerId: u.uid, sellerName: u.nickname, soldCount: 0, favCount: 0, isDemo: false,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        return r.id;
      } catch (e) { await removeImage(img.imagePath); throw e; }
    },
    async updateProduct(id, data, imageFile, removeOldImage) {
      requireUser();
      const before = (await getDoc(doc(db, 'products', id))).data();
      const patch = { ...data, updatedAt: serverTimestamp() };
      if (imageFile) Object.assign(patch, await uploadImage(imageFile));
      else if (removeOldImage) Object.assign(patch, { imageUrl: '', imagePath: '' });
      await updateDoc(doc(db, 'products', id), patch);
      if ((imageFile || removeOldImage) && before && before.imagePath) await removeImage(before.imagePath);
    },
    async deleteProduct(id) {
      requireUser();
      const s = await getDoc(doc(db, 'products', id));
      await deleteDoc(doc(db, 'products', id));
      if (s.exists() && s.data().sellerId === auth.currentUser.uid) await removeImage(s.data().imagePath);
    },

    // ── 거래 ──
    newRequestId,
    async purchase(productId, qty, expectedPrice, requestId) {
      requireUser();
      return call('purchase', { productId, qty, expectedPrice, requestId });
    },
    async myTrades() {
      const u = requireUser();
      const [b, s] = await Promise.all([
        getDocs(query(collection(db, 'trades'), where('buyerId', '==', u.uid))),
        getDocs(query(collection(db, 'trades'), where('sellerId', '==', u.uid))),
      ]);
      return { purchases: b.docs.map(norm).sort(byNewest), sales: s.docs.map(norm).sort(byNewest) };
    },
    async myPointLogs() {
      const u = requireUser();
      const s = await getDocs(query(collection(db, 'pointLogs'), where('uid', '==', u.uid)));
      return s.docs.map(norm).sort(byNewest);
    },

    // ── 즐겨찾기 ──
    watchFavorites(cb) {
      if (!current) { cb(new Set()); return () => {}; }
      return onSnapshot(collection(db, 'users', current.uid, 'favorites'), s => cb(new Set(s.docs.map(d => d.id))), () => cb(new Set()));
    },
    async toggleFavorite(productId) { requireUser(); return call('toggleFavorite', { productId }); },

    // ── 알림 ──
    watchNotifications(cb) {
      if (!current) { cb([]); return () => {}; }
      return onSnapshot(query(collection(db, 'users', current.uid, 'notifications'), limit(200)),
        s => cb(s.docs.map(norm).sort(byNewest)), () => cb([]));
    },
    async markNotificationsRead(ids) {
      const u = requireUser();
      if (!ids.length) return;
      const batch = writeBatch(db);
      ids.slice(0, 450).forEach(id => batch.update(doc(db, 'users', u.uid, 'notifications', id), { read: true }));
      await batch.commit();
    },
    async deleteNotification(id) {
      const u = requireUser();
      await deleteDoc(doc(db, 'users', u.uid, 'notifications', id));
    },

    // ── 공지 ──
    watchNotices(cb) {
      return onSnapshot(collection(db, 'notices'), s => cb(s.docs.map(norm).sort(byNewest)), () => cb([]));
    },

    // ── 프로필 ──
    async updateProfile(p) { requireUser(); return call('updateProfile', p); },

    // ── 관리자 (서버/보안 규칙이 관리자 여부를 다시 확인해요) ──
    admin: {
      async users() { return (await getDocs(collection(db, 'users'))).docs.map(norm).sort(byNewest); },
      async products() { return (await getDocs(collection(db, 'products'))).docs.map(norm).sort(byNewest); },
      async trades() { return (await getDocs(collection(db, 'trades'))).docs.map(norm).sort(byNewest); },
      async pointLogs() { return (await getDocs(collection(db, 'pointLogs'))).docs.map(norm).sort(byNewest); },
      async adjustPoints(uid, delta, memo) { return call('adminAdjustPoints', { uid, delta, memo }); },
      async setBan(uid, banned) { return call('adminSetBan', { uid, banned }); },
      async setProductStatus(id, status) { await updateDoc(doc(db, 'products', id), { status, updatedAt: serverTimestamp() }); },
      async deleteProduct(id) { await deleteDoc(doc(db, 'products', id)); },
      async createNotice({ title, body, pinned }) {
        await addDoc(collection(db, 'notices'), { title, body, pinned: !!pinned, authorName: (current && current.nickname) || '관리자', createdAt: serverTimestamp() });
      },
      async updateNotice(id, { title, body, pinned }) {
        await updateDoc(doc(db, 'notices', id), { title, body, pinned: !!pinned });
      },
      async deleteNotice(id) { await deleteDoc(doc(db, 'notices', id)); },
      async seedDemo() { return call('adminSeedDemo', {}); },
      async clearDemo() { return call('adminClearDemo', {}); },
    },
  };
}

export function shrinkImage(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('이미지 파일만 올릴 수 있어요.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? resolve(b) : reject(new Error('이미지를 처리하지 못했어요.')), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽지 못했어요.')); };
    img.src = url;
  });
}
