/* 월드 트레이드: 게임 규칙, 시장, AI (화면과 분리되어 있어요) */
(function (root) {
  const D = root.WT_DATA || require('./data.js');
  const { RES, GOODS, TRACKS, DEV_COST, NATIONS, EVENTS, DIFF } = D;
  const ITEMS = Object.assign({}, RES, GOODS);
  const RES_IDS = Object.keys(RES), GOOD_IDS = Object.keys(GOODS), ALL_IDS = RES_IDS.concat(GOOD_IDS);
  const TRACK_IDS = Object.keys(TRACKS);
  const DEF = {}; NATIONS.forEach(n => DEF[n.id] = n);

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rint = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const sround = x => Math.floor(x + Math.random());
  const uid = () => Math.random().toString(36).slice(2, 9);
  const relKey = (a, b) => a < b ? a + '|' + b : b + '|' + a;

  let S = null; // 현재 게임 상태
  const E = { get S() { return S; }, set S(v) { S = v; } };
  const listeners = [];
  E.on = fn => listeners.push(fn);
  const emit = (type, data) => listeners.forEach(fn => fn(type, data));

  function log(text, kind, who) {
    S.log.unshift({ r: S.round, text, kind: kind || 'info', who: who || null });
    if (S.log.length > 160) S.log.length = 160;
    emit('log', { text, kind });
  }

  /* ---------- 새 게임 ---------- */
  E.newGame = function (opt) {
    const ids = [opt.player].concat(shuffle(NATIONS.map(n => n.id).filter(id => id !== opt.player)).slice(0, opt.aiCount));
    S = {
      v: 1, id: uid(), started: Date.now(), round: 1, maxRounds: opt.rounds, phase: 0,
      diff: opt.diff, timerSec: opt.timerSec, timeLeft: opt.timerSec, lock: opt.lock,
      player: opt.player, order: ids, nations: {}, rel: {}, pairVol: {},
      market: { stock: {}, base: {}, hist: {}, events: [] },
      inbox: [], negs: [], trades: [], log: [], news: [], offersUsed: 0,
      report: null, settle: null, over: false, stats: { produced: 0, bought: 0, sold: 0 },
    };
    ids.forEach(id => {
      const d = DEF[id];
      const n = { id, ai: id !== opt.player, money: d.money, stock: {}, levels: {}, stability: 80, jobs: [],
        vol: { trade: 0, market: 0, buy: 0, sell: 0 }, rv: { trade: 0, market: 0 }, hist: [], score: 0, produced: 0 };
      ALL_IDS.forEach(i => n.stock[i] = d.stock[i] || 0);
      TRACK_IDS.forEach(t => n.levels[t] = d.levels[t] || 1);
      if (n.ai && opt.diff === 'hard') n.money = Math.round(n.money * 1.15);
      if (n.ai && opt.diff === 'easy') n.money = Math.round(n.money * 0.9);
      S.nations[id] = n;
    });
    ids.forEach(a => ids.forEach(b => { if (a < b) S.rel[relKey(a, b)] = (a === 'marea' || b === 'marea') ? 65 : 50; }));
    ALL_IDS.forEach(i => {
      const base = i === 'food' ? 150 : i === 'coal' ? 100 : RES[i] ? 70 : GOODS[i].tier === 1 ? 28 : GOODS[i].tier === 2 ? 14 : 7;
      S.market.base[i] = base;
      S.market.stock[i] = Math.round(base * rnd(0.85, 1.15));
      S.market.hist[i] = [];
    });
    ALL_IDS.forEach(i => S.market.hist[i].push(price(i)));
    ids.forEach(id => { const n = S.nations[id]; n.score = score(n); n.hist.push(n.score); });
    log('새로운 시대가 열렸어요. ' + ids.length + '개국이 세계 무역에 참여해요.', 'world');
    startRound();
    return S;
  };

  E.player = () => S.nations[S.player];
  E.nation = id => S.nations[id];
  E.rel = (a, b) => S.rel[relKey(a, b)] ?? 50;
  function addRel(a, b, d) { const k = relKey(a, b); S.rel[k] = clamp((S.rel[k] ?? 50) + d, 0, 100); }

  /* ---------- 시장 ---------- */
  function effTarget(i) {
    let t = S.market.base[i];
    for (const e of S.market.events) if (e.target && e.target[i]) t *= e.target[i];
    return t;
  }
  function price(i, st) {
    const s = Math.max(1, st == null ? S.market.stock[i] : st);
    return ITEMS[i].p * clamp(Math.pow(effTarget(i) / s, 0.65), 0.35, 3.5);
  }
  E.price = price;
  E.basePrice = i => ITEMS[i].p;
  E.fee = n => {
    let f = 0.10 - 0.02 * (n.levels.trade - 1);
    if (n.id === 'sahar') f -= 0.03;
    return Math.max(0.01, f);
  };
  E.maxBuy = i => Math.max(0, Math.floor(S.market.stock[i]) - 2);
  E.quoteBuy = (n, i, q) => { let s = S.market.stock[i], c = 0; for (let k = 0; k < q; k++) { c += price(i, s); s--; } return Math.ceil(c * (1 + E.fee(n))); };
  E.quoteSell = (n, i, q) => { let s = S.market.stock[i], c = 0; for (let k = 0; k < q; k++) { s++; c += price(i, s); } return Math.floor(c * (1 - E.fee(n))); };

  E.buy = function (n, i, q, quiet) {
    q = Math.floor(q);
    if (q <= 0 || q > E.maxBuy(i)) return { ok: false, msg: '시장 재고가 부족해요.' };
    const cost = E.quoteBuy(n, i, q);
    if (cost > n.money) return { ok: false, msg: '자금이 부족해요.' };
    n.money -= cost; n.stock[i] += q; S.market.stock[i] -= q;
    n.vol.market += cost; n.rv.market += cost; n.vol.buy += cost;
    if (!n.ai) { S.stats.bought += cost; if (!quiet) log(`세계 시장에서 ${ITEMS[i].n} ${q}개를 $${cost.toLocaleString()}에 샀어요.`, 'market', n.id); }
    emit('change');
    return { ok: true, cost };
  };
  E.sell = function (n, i, q, quiet) {
    q = Math.floor(q);
    if (q <= 0 || n.stock[i] < q) return { ok: false, msg: '보유량이 부족해요.' };
    const got = E.quoteSell(n, i, q);
    n.money += got; n.stock[i] -= q; S.market.stock[i] += q;
    n.vol.market += got; n.rv.market += got; n.vol.sell += got;
    if (!n.ai) { S.stats.sold += got; if (!quiet) log(`세계 시장에 ${ITEMS[i].n} ${q}개를 $${got.toLocaleString()}에 팔았어요.`, 'market', n.id); }
    emit('change');
    return { ok: true, got };
  };

  /* ---------- 생산 / 소비 ---------- */
  E.lines = n => 1 + n.levels.industry;
  E.batchCap = n => 2 + n.levels.industry * 2;
  E.prodTime = (n, g) => { let t = GOODS[g].t; if (n.levels.tech >= 3) t--; if (n.levels.tech >= 5) t--; return Math.max(1, t); };
  E.outQty = (n, g, q) => {
    let o = q;
    if (n.levels.tech >= 4) o += Math.floor(q * 0.25);
    if (n.id === 'solaris' && (g === 'cloth' || g === 'fuel' || g === 'tires')) o += 1;
    return o;
  };
  E.locked = (n, g) => {
    const req = GOODS[g].req || {};
    const miss = Object.keys(req).filter(t => n.levels[t] < req[t]);
    return miss.length ? miss.map(t => `${TRACKS[t].n} ${req[t]}`).join(', ') : null;
  };
  E.maxMake = (n, g) => {
    let m = E.batchCap(n);
    for (const [i, q] of Object.entries(GOODS[g].in)) m = Math.min(m, Math.floor(n.stock[i] / q));
    return Math.max(0, m);
  };
  E.freeLines = n => E.lines(n) - n.jobs.length;
  E.startJob = function (n, g, q) {
    q = Math.floor(q);
    if (E.locked(n, g)) return { ok: false, msg: '아직 해금되지 않았어요.' };
    if (E.freeLines(n) <= 0) return { ok: false, msg: '빈 생산 라인이 없어요.' };
    if (q <= 0 || q > E.maxMake(n, g)) return { ok: false, msg: '재료가 부족하거나 용량을 넘었어요.' };
    for (const [i, k] of Object.entries(GOODS[g].in)) n.stock[i] -= k * q;
    const t = E.prodTime(n, g);
    n.jobs.push({ id: uid(), g, q, out: E.outQty(n, g, q), left: t, total: t });
    if (!n.ai) log(`${GOODS[g].n} ${q}개 생산을 시작했어요. (${t}라운드)`, 'prod', n.id);
    emit('change');
    return { ok: true };
  };
  E.cancelJob = function (n, jobId) {
    const j = n.jobs.find(x => x.id === jobId); if (!j) return;
    if (j.left !== j.total) return { ok: false, msg: '이미 진행된 생산은 취소할 수 없어요.' };
    for (const [i, k] of Object.entries(GOODS[j.g].in)) n.stock[i] += k * j.q;
    n.jobs = n.jobs.filter(x => x !== j);
    log(`${GOODS[j.g].n} 생산을 취소하고 재료를 돌려받았어요.`, 'prod', n.id);
    emit('change');
    return { ok: true };
  };

  E.yields = function (n) {
    const d = DEF[n.id], out = {};
    for (const r of RES_IDS) {
      const b = d.yields[r] || 0; if (!b) continue;
      let m = 1;
      if (r === 'food' || r === 'cotton' || r === 'rubber' || r === 'wood') m += 0.2 * (n.levels.agriculture - 1);
      else m += 0.08 * (n.levels.tech - 1);
      if (n.id === 'caldera' && (r === 'iron' || r === 'coal' || r === 'copper')) m += 0.2;
      m *= 0.5 + n.stability / 200;
      if (n.ai) m *= DIFF[S.diff].yield;
      out[r] = b * m;
    }
    return out;
  };
  E.upkeep = function (n) {
    const lv = TRACK_IDS.reduce((s, t) => s + n.levels[t], 0);
    let food = Math.ceil(2 + lv * 0.35);
    if (n.id === 'verdan') food = Math.ceil(food * 0.7);
    const energy = Math.max(0, n.levels.industry - 1);
    return { food, energy };
  };
  E.income = function (n) {
    let t = 50 + 50 * n.levels.economy;
    if (n.id === 'aurel') t *= 1.3;
    return Math.round(t * (0.6 + n.stability / 250));
  };
  function payUpkeep(n) {
    const u = E.upkeep(n);
    let need = u.food, used = { food: 0, meal: 0, coal: 0, fuel: 0 };
    let take = Math.min(n.stock.food, need); n.stock.food -= take; need -= take; used.food = take;
    while (need > 0 && n.stock.meal > 0) { n.stock.meal--; need -= 3; used.meal++; }
    const foodShort = Math.max(0, need);
    let e = u.energy;
    take = Math.min(n.stock.coal, e); n.stock.coal -= take; e -= take; used.coal = take;
    while (e > 0 && n.stock.fuel > 0) { n.stock.fuel--; e -= 3; used.fuel++; }
    const energyShort = Math.max(0, e);
    let ds = 0;
    if (foodShort > 0) ds -= 4 + foodShort * 2;
    if (energyShort > 0) ds -= 3 + energyShort * 2;
    if (!foodShort && !energyShort) ds += 5;
    n.stability = clamp(n.stability + ds, 10, 100);
    return { u, used, foodShort, energyShort, ds };
  }

  /* ---------- 국가 발전 ---------- */
  E.devCost = function (n, t) {
    const L = n.levels[t]; if (L >= 5) return null;
    const c = DEV_COST[t][L];
    let disc = 1;
    if ((t === 'industry' && n.id === 'nordin') || (t === 'tech' && n.id === 'argenta')) disc = 0.8;
    const items = {};
    for (const [i, q] of Object.entries(c.items)) items[i] = Math.ceil(q * disc);
    return { money: Math.round(c.money * disc), items };
  };
  E.canUpgrade = function (n, t) {
    const c = E.devCost(n, t); if (!c) return false;
    if (n.money < c.money) return false;
    return Object.entries(c.items).every(([i, q]) => n.stock[i] >= q);
  };
  E.upgrade = function (n, t) {
    if (!E.canUpgrade(n, t)) return { ok: false, msg: '자금이나 재료가 부족해요.' };
    const c = E.devCost(n, t);
    n.money -= c.money;
    for (const [i, q] of Object.entries(c.items)) n.stock[i] -= q;
    n.levels[t]++;
    if (n.ai) news(`${DEF[n.id].name}이(가) ${TRACKS[t].n}을(를) ${n.levels[t]}단계로 발전시켰어요.`);
    else log(`${TRACKS[t].n}이(가) ${n.levels[t]}단계로 발전했어요!`, 'dev', n.id);
    n.score = score(n);
    emit('change'); emit('upgrade', { n, t });
    return { ok: true };
  };

  /* ---------- 점수 ---------- */
  E.netWorth = function (n) {
    let v = n.money;
    for (const i of ALL_IDS) v += n.stock[i] * ITEMS[i].p * 0.7;
    for (const j of n.jobs) v += j.out * GOODS[j.g].p * 0.7;
    return v;
  };
  E.scoreParts = function (n) {
    const dev = TRACK_IDS.reduce((s, t) => s + n.levels[t] * (n.levels[t] + 1) / 2 * 40, 0);
    const wealth = E.netWorth(n) / 20;
    const trade = n.vol.trade / 40 + n.vol.market / 120;
    const stab = n.stability / 2;
    return { dev: Math.round(dev), wealth: Math.round(wealth), trade: Math.round(trade), stab: Math.round(stab) };
  };
  function score(n) { const p = E.scoreParts(n); return p.dev + p.wealth + p.trade + p.stab; }
  E.score = score;
  E.ranking = () => S.order.map(id => S.nations[id]).sort((a, b) => score(b) - score(a));

  /* ---------- 필요도 (AI가 물건의 가치를 매길 때 사용) ---------- */
  function nextTrack(n) {
    let pr = DEF[n.id].prio;
    const fy = (E.yields(n).food || 0), fu = E.upkeep(n).food;
    if (fy < fu && DEF[n.id].yields.food >= 3) pr = ['agriculture'].concat(pr.filter(t => t !== 'agriculture'));
    let best = null, bc = Infinity;
    pr.forEach((t, k) => {
      const c = E.devCost(n, t); if (!c) return;
      const v = c.money * (1 + k * 0.25) + Object.entries(c.items).reduce((s, [i, q]) => s + q * ITEMS[i].p, 0);
      if (v < bc) { bc = v; best = t; }
    });
    return best;
  }
  E.nextTrack = nextTrack;
  function wants(n) {
    const w = {}; ALL_IDS.forEach(i => w[i] = 0);
    const u = E.upkeep(n);
    w.food = u.food * 2; w.coal = u.energy * 2;
    const t = nextTrack(n);
    if (t) { const c = E.devCost(n, t); for (const [i, q] of Object.entries(c.items)) w[i] += q; }
    // 가장 수익이 좋은 상품 재료
    const best = bestRecipes(n).slice(0, 2);
    best.forEach(({ g }) => { for (const [i, q] of Object.entries(GOODS[g].in)) w[i] += q * Math.ceil(E.batchCap(n) / 2); });
    return w;
  }
  E.wants = wants;
  function need(n, i, w) {
    w = w || wants(n);
    const want = w[i], have = n.stock[i];
    if (want > 0 && have < want) return 1 + 0.7 * (1 - have / want);
    if (have > want * 2 + 6) return 0.8;
    return 1;
  }
  E.need = need;
  function surplus(n, i, w) { w = w || wants(n); return Math.max(0, n.stock[i] - Math.max(Math.ceil(w[i] * 1.2), RES[i] ? 3 : 0)); }
  E.surplus = surplus;
  function bestRecipes(n) {
    return GOOD_IDS.filter(g => !E.locked(n, g)).map(g => {
      const cost = Object.entries(GOODS[g].in).reduce((s, [i, q]) => s + q * price(i), 0);
      const out = price(g) * E.outQty(n, g, 4) / 4;
      return { g, margin: (out - cost) / E.prodTime(n, g), unit: out - cost };
    }).sort((a, b) => b.margin - a.margin);
  }
  E.bestRecipes = bestRecipes;

  /* ---------- 거래 ---------- */
  // 묶음: { items: {id: qty}, money }
  const emptyB = () => ({ items: {}, money: 0 });
  E.emptyB = emptyB;
  E.bundleValue = b => Object.entries(b.items).reduce((s, [i, q]) => s + q * price(i), 0) + (b.money || 0);
  E.bundleEmpty = b => !b.money && !Object.values(b.items).some(q => q > 0);
  function hasBundle(n, b) {
    if ((b.money || 0) > n.money) return false;
    return Object.entries(b.items).every(([i, q]) => n.stock[i] >= q);
  }
  E.hasBundle = hasBundle;
  function moveBundle(from, to, b) {
    from.money -= b.money || 0; to.money += b.money || 0;
    for (const [i, q] of Object.entries(b.items)) { from.stock[i] -= q; to.stock[i] += q; }
  }
  E.bundleText = b => {
    const parts = Object.entries(b.items).filter(([, q]) => q > 0).map(([i, q]) => `${ITEMS[i].n} ${q}`);
    if (b.money) parts.push(`$${Math.round(b.money).toLocaleString()}`);
    return parts.join(', ') || '없음';
  };
  // a가 give를 b에게 주고 b가 take를 a에게 줘요
  function execTrade(a, b, give, take, quiet) {
    if (!hasBundle(a, give) || !hasBundle(b, take)) return false;
    moveBundle(a, b, give); moveBundle(b, a, take);
    const value = Math.round(E.bundleValue(give) + E.bundleValue(take));
    [a, b].forEach(n => { n.vol.trade += value; n.rv.trade += value; });
    const k = relKey(a.id, b.id); S.pairVol[k] = (S.pairVol[k] || 0) + value;
    addRel(a.id, b.id, 3 + Math.min(4, value / 400));
    S.trades.unshift({ r: S.round, a: a.id, b: b.id, give, take, value });
    if (S.trades.length > 200) S.trades.length = 200;
    if (!quiet) emit('trade', { a: a.id, b: b.id, value });
    a.score = score(a); b.score = score(b);
    return true;
  }
  E.execTrade = execTrade;

  E.maxOffers = n => 2 + n.levels.trade;
  E.offersLeft = () => E.maxOffers(E.player()) - S.offersUsed;

  function greedOf(ai, other, rounds) {
    let g = DIFF[S.diff].greed - (E.rel(ai.id, other.id) - 50) / 400;
    if (other.id === 'marea') g -= 0.05;
    g += (rounds || 0) * 0.02;
    return Math.max(0.85, g);
  }
  // AI 입장에서 offer(플레이어 기준: give=플레이어가 주는 것, take=플레이어가 받는 것)를 평가해요
  E.evaluate = function (ai, offer, rounds) {
    const p = E.player(), w = wants(ai);
    const gain = Object.entries(offer.give.items).reduce((s, [i, q]) => s + q * price(i) * need(ai, i, w), 0) + (offer.give.money || 0);
    const loss = Object.entries(offer.take.items).reduce((s, [i, q]) => s + q * price(i) * need(ai, i, w), 0) + (offer.take.money || 0);
    const greed = greedOf(ai, p, rounds);
    return { gain, loss, greed, ratio: loss > 0 ? gain / loss : Infinity };
  };

  function aiMsg(kind, ai) {
    const r = E.rel(ai.id, S.player);
    const warm = r >= 65, cold = r < 35;
    const M = {
      accept: warm ? ['좋은 친구와의 거래는 언제나 환영이에요.', '기꺼이 받아들이죠. 앞으로도 잘 부탁해요.'] : cold ? ['…좋아요. 이번만은 받아들이죠.', '조건은 괜찮군요. 거래하죠.'] : ['공정한 제안이군요. 수락합니다.', '좋습니다, 거래 성사예요.'],
      counter: warm ? ['조금만 맞춰 주시면 바로 도장 찍을게요.', '친구 사이니까, 이 정도면 어떨까요?'] : cold ? ['그 조건으로는 어림없어요. 이건 어떻습니까.', '우리를 얕보는군요. 이 조건이라면 생각해 보죠.'] : ['조건을 조금 조정하면 받아들이겠습니다.', '이런 조건이라면 어떻습니까?'],
      reject: cold ? ['거절합니다. 시간 낭비군요.', '이런 제안은 받을 수 없어요.'] : ['아쉽지만 이번엔 어렵겠어요.', '저희에게 맞지 않는 조건이에요.'],
      stock: ['그만큼은 저희에게도 없어요.'],
      tired: ['이미 충분히 이야기했어요. 협상은 여기까지죠.'],
    };
    return pick(M[kind]);
  }

  // 플레이어가 제안을 보내요 → AI가 수락/역제안/거절
  E.propose = function (partnerId, give, take, negId) {
    const p = E.player(), ai = S.nations[partnerId];
    if (E.offersLeft() <= 0) return { ok: false, msg: '이번 라운드 제안 횟수를 모두 썼어요. 무역 규모를 발전시키면 늘어나요.' };
    if (E.bundleEmpty(give) && E.bundleEmpty(take)) return { ok: false, msg: '주고받을 것을 정해 주세요.' };
    if (!hasBundle(p, give)) return { ok: false, msg: '내가 주기로 한 물건이나 자금이 부족해요.' };
    clean(give); clean(take);
    let neg = negId && S.negs.find(x => x.id === negId && x.status !== 'closed');
    if (!neg) { neg = { id: uid(), partner: partnerId, r: S.round, rounds: 0, status: 'open', msgs: [], counter: null }; S.negs.unshift(neg); }
    neg.rounds++; neg.status = 'open'; neg.counter = null;
    S.offersUsed++;
    neg.msgs.push({ who: 'me', give: copyB(give), take: copyB(take) });
    // 재고 확인
    const lacking = Object.entries(take.items).filter(([i, q]) => ai.stock[i] < q);
    if ((take.money || 0) > ai.money || lacking.length) {
      const c = { give: copyB(give), take: copyB(take) };
      lacking.forEach(([i]) => { c.take.items[i] = ai.stock[i]; });
      c.take.money = Math.min(c.take.money || 0, Math.floor(ai.money * 0.8));
      clean(c.take);
      if (E.bundleEmpty(c.take) && !E.bundleEmpty(take)) return finishNeg(neg, 'reject', ai, aiMsg('stock', ai));
      return counterOrAccept(neg, ai, c, aiMsg('stock', ai) + ' 가진 만큼으로 조정할게요.');
    }
    return counterOrAccept(neg, ai, { give: copyB(give), take: copyB(take) });
  };
  function counterOrAccept(neg, ai, offer, prefix) {
    const p = E.player();
    const ev = E.evaluate(ai, offer, neg.rounds - 1);
    if (ev.ratio >= ev.greed && !prefix) {
      if (execTrade(p, ai, offer.give, offer.take)) {
        log(`${DEF[ai.id].name}와(과) 거래 성사: ${E.bundleText(offer.give)} → ${E.bundleText(offer.take)}`, 'trade', ai.id);
        return finishNeg(neg, 'accept', ai, aiMsg('accept', ai));
      }
      return finishNeg(neg, 'reject', ai, '거래 조건을 맞출 수 없어요.');
    }
    if (neg.rounds >= 4) { addRel(ai.id, p.id, -2); return finishNeg(neg, 'reject', ai, aiMsg('tired', ai)); }
    if (ev.ratio < ev.greed * 0.55 && !prefix) { addRel(ai.id, p.id, -1); return finishNeg(neg, 'reject', ai, aiMsg('reject', ai)); }
    // 역제안 만들기
    const c = makeCounter(ai, offer, ev, neg.rounds - 1);
    if (!c) { addRel(ai.id, p.id, -1); return finishNeg(neg, 'reject', ai, aiMsg('reject', ai)); }
    neg.status = 'countered'; neg.counter = c;
    neg.msgs.push({ who: ai.id, give: copyB(c.give), take: copyB(c.take), text: (prefix ? prefix + ' ' : '') + aiMsg('counter', ai) });
    emit('change');
    return { ok: true, result: 'counter', neg };
  }
  function makeCounter(ai, offer, ev, rounds) {
    const p = E.player(), w = wants(ai);
    const c = { give: copyB(offer.give), take: copyB(offer.take) };
    let deficit = ev.loss * ev.greed - ev.gain;
    if (deficit <= 0) return c;
    // 1) 플레이어가 받는 물건 수량 줄이기 (가치가 큰 것부터)
    const preferMoney = Math.random() < 0.45 && p.money >= (c.give.money || 0) + deficit;
    if (!preferMoney) {
      for (const i of Object.keys(c.take.items).sort((a, b) => price(b) - price(a))) {
        const unit = price(i) * need(ai, i, w) * ev.greed;
        while (deficit > 0 && c.take.items[i] > 1) { c.take.items[i]--; deficit -= unit; }
      }
    }
    // 2) 플레이어가 받는 돈 줄이기
    if (deficit > 0 && c.take.money > 0) {
      const cut = Math.min(c.take.money, Math.ceil(deficit / ev.greed));
      c.take.money -= cut; deficit -= cut * ev.greed;
    }
    // 3) 플레이어가 주는 돈 늘리기
    if (deficit > 0) {
      const add = Math.ceil(deficit / 10) * 10;
      if ((c.give.money || 0) + add <= p.money) { c.give.money = (c.give.money || 0) + add; deficit = 0; }
    }
    // 4) 플레이어가 주는 물건 늘리기
    if (deficit > 0) {
      for (const i of Object.keys(c.give.items)) {
        const unit = price(i) * need(ai, i, w);
        while (deficit > 0 && p.stock[i] > c.give.items[i]) { c.give.items[i]++; deficit -= unit; }
      }
    }
    clean(c.give); clean(c.take);
    if (deficit > 0 || E.bundleEmpty(c.take)) return null;
    return c;
  }
  function finishNeg(neg, status, ai, text) {
    neg.status = 'closed'; neg.result = status; neg.counter = null;
    neg.msgs.push({ who: ai.id, text, result: status });
    emit('change');
    return { ok: true, result: status, neg };
  }
  E.acceptCounter = function (negId) {
    const neg = S.negs.find(x => x.id === negId); if (!neg || !neg.counter) return { ok: false };
    const p = E.player(), ai = S.nations[neg.partner], c = neg.counter;
    if (!hasBundle(p, c.give)) return { ok: false, msg: '내가 줄 물건이나 자금이 부족해요.' };
    if (!execTrade(p, ai, c.give, c.take)) return { ok: false, msg: '상대가 더 이상 조건을 맞출 수 없어요.' };
    log(`${DEF[ai.id].name}의 역제안을 수락했어요: ${E.bundleText(c.give)} → ${E.bundleText(c.take)}`, 'trade', ai.id);
    neg.msgs.push({ who: 'me', text: '역제안을 수락했어요.' });
    return finishNeg(neg, 'accept', ai, aiMsg('accept', ai));
  };
  E.rejectCounter = function (negId) {
    const neg = S.negs.find(x => x.id === negId); if (!neg) return;
    neg.msgs.push({ who: 'me', text: '역제안을 거절했어요.' });
    addRel(neg.partner, S.player, -1);
    neg.status = 'closed'; neg.result = 'reject'; neg.counter = null;
    emit('change');
  };

  // AI가 플레이어에게 보내는 제안
  E.acceptInbox = function (id) {
    const o = S.inbox.find(x => x.id === id); if (!o) return { ok: false };
    const p = E.player(), ai = S.nations[o.from];
    if (!hasBundle(p, o.give)) return { ok: false, msg: '내가 줄 물건이나 자금이 부족해요.' };
    if (!execTrade(p, ai, o.give, o.take)) { S.inbox = S.inbox.filter(x => x !== o); emit('change'); return { ok: false, msg: '상대국이 더 이상 조건을 지킬 수 없어 제안이 취소됐어요.' }; }
    addRel(p.id, ai.id, 2);
    log(`${DEF[ai.id].name}의 제안을 수락했어요: ${E.bundleText(o.give)} → ${E.bundleText(o.take)}`, 'trade', ai.id);
    S.inbox = S.inbox.filter(x => x !== o);
    emit('change');
    return { ok: true };
  };
  E.rejectInbox = function (id) {
    const o = S.inbox.find(x => x.id === id); if (!o) return;
    addRel(S.player, o.from, -1);
    log(`${DEF[o.from].name}의 제안을 거절했어요.`, 'trade', o.from);
    S.inbox = S.inbox.filter(x => x !== o);
    emit('change');
  };

  function copyB(b) { return { items: Object.assign({}, b.items), money: b.money || 0 }; }
  E.copyB = copyB;
  function clean(b) { for (const k of Object.keys(b.items)) if (!(b.items[k] > 0)) delete b.items[k]; b.money = Math.max(0, Math.round(b.money || 0)); return b; }

  function makeOffersForPlayer() {
    const p = E.player(), pw = wants(p), py = E.yields(p);
    const ais = shuffle(S.order.filter(id => id !== S.player));
    const max = rint(1, 3);
    for (const id of ais) {
      if (S.inbox.length >= max) break;
      if (Math.random() > 0.6) continue;
      const ai = S.nations[id], w = wants(ai);
      const xs = RES_IDS.filter(i => surplus(ai, i, w) >= 3 && (!py[i] || p.stock[i] < pw[i]));
      const ys = ALL_IDS.filter(i => p.stock[i] >= 4 && p.stock[i] > pw[i] + 2 && need(ai, i, w) > 1.05);
      const x = xs.length ? pick(xs) : null, y = ys.length ? pick(ys) : null;
      const kind = x && y ? 'barter' : x ? 'sell' : y ? 'buy' : null;
      if (!kind) continue;
      const o = { id: uid(), from: id, r: S.round, kind, give: emptyB(), take: emptyB() };
      if (kind === 'barter') {
        const qx = Math.min(surplus(ai, x, w), rint(2, 6));
        const val = qx * price(x) * rnd(1.0, 1.12);
        const qy = Math.max(1, Math.min(p.stock[y] - 1, Math.round(val / price(y))));
        o.take.items[x] = qx; o.give.items[y] = qy;
      } else if (kind === 'sell') {
        const qx = Math.min(surplus(ai, x, w), rint(3, 8));
        o.take.items[x] = qx; o.give.money = Math.round(qx * price(x) * rnd(1.0, 1.18));
        if (o.give.money > p.money) continue;
      } else {
        const qy = Math.min(p.stock[y] - 1, rint(2, 6));
        const m = Math.round(qy * price(y) * rnd(0.95, 1.15));
        if (m > ai.money * 0.6 || qy <= 0) continue;
        o.give.items[y] = qy; o.take.money = m;
      }
      S.inbox.push(o);
    }
  }

  /* ---------- AI 턴 ---------- */
  function aiTurn(n) {
    const sk = DIFF[S.diff].skill;
    let w = wants(n);
    // 1) 식량·에너지 확보
    const u = E.upkeep(n);
    const foodGap = u.food * 2 - n.stock.food - n.stock.meal * 3;
    if (foodGap > 0) E.buy(n, 'food', Math.min(E.maxBuy('food'), Math.ceil(foodGap)), true);
    const enGap = u.energy * 2 - n.stock.coal - n.stock.fuel * 3;
    if (enGap > 0) E.buy(n, 'coal', Math.min(E.maxBuy('coal'), Math.ceil(enGap)), true);
    // 2) 발전
    const tries = S.diff === 'hard' ? 2 : 1;
    for (let k = 0; k < tries; k++) {
      if (Math.random() > sk + 0.15) break;
      const t = nextTrack(n); if (!t) break;
      const c = E.devCost(n, t);
      if (!E.canUpgrade(n, t) && n.money > c.money * 1.3) {
        for (const [i, q] of Object.entries(c.items)) {
          const miss = q - n.stock[i];
          if (miss > 0 && miss <= E.maxBuy(i) && E.quoteBuy(n, i, miss) < n.money - c.money - 100) E.buy(n, i, miss, true);
        }
      }
      if (E.canUpgrade(n, t)) E.upgrade(n, t); else break;
    }
    // 3) 생산
    w = wants(n);
    const recipes = bestRecipes(n).filter(r => r.margin > 0);
    let guard = 0;
    while (E.freeLines(n) > 0 && guard++ < 8) {
      let done = false;
      for (const r of recipes) {
        if (Math.random() > sk + 0.2) continue;
        let q = E.maxMake(n, r.g);
        if (q < 2 && sk >= 0.8 && n.money > 600) {
          // 부족한 재료를 사 와요
          const want = Math.min(E.batchCap(n), 3);
          let ok = true;
          for (const [i, k] of Object.entries(GOODS[r.g].in)) {
            const miss = k * want - n.stock[i];
            if (miss > 0) { if (miss > E.maxBuy(i) || E.quoteBuy(n, i, miss) > n.money * 0.3) { ok = false; break; } E.buy(n, i, miss, true); }
          }
          if (ok) q = E.maxMake(n, r.g);
        }
        if (q >= 1) { E.startJob(n, r.g, q); done = true; break; }
      }
      if (!done) break;
    }
    // 4) 남는 것 팔기
    w = wants(n);
    for (const i of ALL_IDS) {
      const s = GOODS[i] ? Math.max(0, n.stock[i] - (w[i] || 0)) : surplus(n, i, w);
      if (s >= (GOODS[i] ? 1 : 4)) {
        const q = Math.min(GOODS[i] ? s : Math.ceil(s * rnd(0.4, 0.7)), 25);
        if (q > 0) E.sell(n, i, q, true);
      }
    }
  }

  function aiTradesBetween() {
    const ais = shuffle(S.order.filter(id => id !== S.player));
    let count = 0;
    for (const a of ais) {
      if (count >= 3 || Math.random() > 0.55) continue;
      const A = S.nations[a], wa = wants(A);
      for (const b of shuffle(ais.filter(x => x !== a))) {
        const B = S.nations[b], wb = wants(B);
        const xs = RES_IDS.filter(i => surplus(A, i, wa) >= 3 && need(B, i, wb) > 1.1);
        const ys = RES_IDS.filter(i => surplus(B, i, wb) >= 3 && need(A, i, wa) > 1.1);
        if (!xs.length || !ys.length) continue;
        const x = pick(xs), y = pick(ys);
        let qx = Math.min(surplus(A, x, wa), rint(2, 6));
        let qy = Math.max(1, Math.min(surplus(B, y, wb), Math.round(qx * price(x) / price(y))));
        qx = Math.max(1, Math.min(qx, Math.round(qy * price(y) / price(x))));
        const g = emptyB(), t = emptyB(); g.items[x] = qx; t.items[y] = qy;
        if (execTrade(A, B, g, t, true)) {
          count++;
          news(`${DEF[a].name} ↔ ${DEF[b].name}: ${ITEMS[x].n} ${qx} ⇄ ${ITEMS[y].n} ${qy}`, 'trade');
          emit('aitrade', { a, b });
        }
        break;
      }
    }
  }

  function news(text, kind) {
    S.news.unshift({ r: S.round, text, kind: kind || 'world' });
    if (S.news.length > 120) S.news.length = 120;
  }

  /* ---------- 라운드 진행 ---------- */
  function startRound() {
    S.phase = 0; S.offersUsed = 0; S.timeLeft = S.timerSec;
    S.negs = S.negs.filter(x => x.r >= S.round - 1);
    const rep = { r: S.round, yields: {}, upkeep: null };
    S.order.forEach(id => {
      const n = S.nations[id];
      n.rv = { trade: 0, market: 0 };
      const y = E.yields(n);
      for (const [i, v] of Object.entries(y)) {
        const q = sround(v * rnd(0.85, 1.15));
        n.stock[i] += q;
        if (!n.ai) rep.yields[i] = q;
      }
    });
    rep.upkeep = E.upkeep(E.player());
    rep.income = E.income(E.player());
    S.report = rep;
    S.inbox = [];
    makeOffersForPlayer();
    emit('round');
  }

  E.setPhase = function (ph) {
    if (ph <= S.phase || ph > 4) return;
    S.phase = ph;
    if (ph === 2 && S.inbox.length) log(`${S.inbox.length}개국에서 무역 제안이 도착했어요.`, 'trade');
    emit('phase');
  };

  E.settle = function () {
    const p = E.player();
    const before = {}; S.order.forEach(id => before[id] = E.ranking().indexOf(S.nations[id]));
    const prevMoney = p.money, prevStab = p.stability;
    // 1) AI 활동
    shuffle(S.order.filter(id => id !== S.player)).forEach(id => aiTurn(S.nations[id]));
    aiTradesBetween();
    // 2) 생산 진행
    const done = [];
    S.order.forEach(id => {
      const n = S.nations[id];
      n.jobs.forEach(j => { j.left--; if (j.left <= 0) { n.stock[j.g] += j.out; n.produced += j.out; if (!n.ai) { done.push({ g: j.g, q: j.out }); S.stats.produced += j.out; } } });
      n.jobs = n.jobs.filter(j => j.left > 0);
    });
    done.forEach(d => log(`${GOODS[d.g].n} ${d.q}개 생산이 끝났어요.`, 'prod', p.id));
    // 3) 소비
    const ups = {};
    S.order.forEach(id => { ups[id] = payUpkeep(S.nations[id]); });
    const up = ups[p.id];
    if (up.foodShort) log(`식량이 ${up.foodShort}만큼 부족해 국민들이 동요해요. (안정도 하락)`, 'bad', p.id);
    if (up.energyShort) log(`에너지(석탄·연료)가 ${up.energyShort}만큼 부족해 공장이 멈칫했어요.`, 'bad', p.id);
    // 4) 세금
    const incomes = {};
    S.order.forEach(id => { const n = S.nations[id]; const inc = E.income(n); n.money += inc; incomes[id] = inc; });
    // 5) 세계 시장 변화
    const prevPrice = {}; ALL_IDS.forEach(i => prevPrice[i] = price(i));
    ALL_IDS.forEach(i => {
      const m = S.market, base = m.base[i];
      let st = m.stock[i];
      st += (base - st) * 0.2 + rnd(-0.05, 0.05) * base;
      m.stock[i] = Math.max(2, Math.round(st * 10) / 10);
    });
    S.market.events.forEach(e => e.left--);
    S.market.events = S.market.events.filter(e => e.left > 0);
    let ev = null;
    if (S.round > 1 && Math.random() < 0.32) {
      const def = pick(EVENTS.filter(e => !S.market.events.some(x => x.id === e.id)));
      if (def) {
        ev = def;
        if (def.stock) for (const [i, k] of Object.entries(def.stock)) S.market.stock[i] = Math.max(2, S.market.stock[i] * k);
        if (def.target) S.market.events.push({ id: def.id, n: def.n, target: def.target, left: def.rounds });
        news(`[세계 사건] ${def.n}: ${def.d}`, 'event');
        log(`세계 사건 — ${def.n}: ${def.d}`, 'event');
      }
    }
    ALL_IDS.forEach(i => { const h = S.market.hist[i]; h.push(price(i)); if (h.length > 40) h.shift(); });
    // 6) 관계는 천천히 50으로
    for (const k of Object.keys(S.rel)) S.rel[k] += (50 - S.rel[k]) * 0.03;
    // 7) 점수
    S.order.forEach(id => { const n = S.nations[id]; n.score = score(n); n.hist.push(n.score); });
    const rank = E.ranking();
    const movers = [];
    if (S.inbox.length) S.inbox.forEach(o => addRel(S.player, o.from, -0.5));
    S.inbox = [];
    const big = ALL_IDS.map(i => ({ i, d: (price(i) - prevPrice[i]) / prevPrice[i] })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 4);
    S.settle = {
      r: S.round, done, upkeep: up, income: incomes[p.id], moneyDelta: p.money - prevMoney, stabDelta: p.stability - prevStab,
      event: ev ? { n: ev.n, d: ev.d } : null, big, rank: rank.map(n => ({ id: n.id, score: n.score, prev: before[n.id] })),
      news: S.news.filter(x => x.r === S.round).slice(0, 8),
    };
    S.phase = 4;
    if (S.round >= S.maxRounds) { S.over = true; S.endedAt = Date.now(); log('마지막 라운드가 끝났어요. 세계 무역의 승자가 가려졌어요!', 'world'); }
    emit('settled', S.settle);
    return S.settle;
  };
  E.nextRound = function () {
    if (S.over) return;
    S.round++; S.settle = null;
    startRound();
  };

  /* ---------- 저장 ---------- */
  E.serialize = () => JSON.stringify(S);
  E.load = json => { const s = typeof json === 'string' ? JSON.parse(json) : json; if (!s || s.v !== 1 || !s.nations) throw new Error('bad save'); S = s; return S; };

  Object.assign(E, { D, ITEMS, RES_IDS, GOOD_IDS, ALL_IDS, TRACK_IDS, DEF, clamp, rnd, pick, relKey });
  if (typeof module !== 'undefined') module.exports = E; else root.WT = E;
})(typeof window !== 'undefined' ? window : globalThis);
