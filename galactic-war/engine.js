/* ===================================================================
   GALACTIC WAR — 게임 규칙 엔진 (서버와 브라우저가 같은 파일을 사용)
   - 온라인: 서버(gw-server.js)만 이 엔진으로 상태를 바꿔요. 클라이언트는 "행동 요청"만 보냅니다.
   - 싱글 플레이: 브라우저가 같은 엔진을 로컬 서버처럼 사용해요.
   - 모든 행동은 act(state, pid, action) 하나로 검증·적용됩니다.
   =================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GW = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------
     1. 데이터
     ------------------------------------------------------------------ */
  const RES = ['metal', 'energy', 'credits', 'crystal', 'food'];
  const RES_KO = { metal: '금속', energy: '에너지', credits: '크레딧', crystal: '크리스탈', food: '식량' };
  const RES_ICON = { metal: '⛏', energy: '⚡', credits: '◎', crystal: '◆', food: '❦' };

  const TYPES = {
    terran:   { ko: '일반 행성', planet: 1, pop: 3, color: '#3d9fd0', prod: { metal: 2, energy: 2, credits: 3, crystal: 0, food: 5 }, desc: '인구가 많이 사는 균형 잡힌 행성. 식량이 풍부해요.' },
    gas:      { ko: '가스 행성', planet: 1, pop: 1, color: '#d38f45', prod: { metal: 0, energy: 6, credits: 1, crystal: 1, food: 0 }, desc: '에너지 생산의 중심. 인구는 적어요.' },
    ice:      { ko: '얼음 행성', planet: 1, pop: 2, color: '#9fd4ee', prod: { metal: 1, energy: 1, credits: 1, crystal: 3, food: 1 }, desc: '얼음 속 크리스탈 광맥이 있어요.' },
    volcanic: { ko: '화산 행성', planet: 1, pop: 1, color: '#e2553b', prod: { metal: 6, energy: 2, credits: 0, crystal: 1, food: 0 }, desc: '금속 생산이 가장 많은 행성.' },
    desert:   { ko: '사막 행성', planet: 1, pop: 2, color: '#d8b56a', prod: { metal: 3, energy: 3, credits: 2, crystal: 0, food: 1 }, desc: '금속과 에너지를 고르게 생산해요.' },
    ruins:    { ko: '고대 유적', planet: 1, pop: 1, color: '#b38cf2', prod: { metal: 1, energy: 1, credits: 2, crystal: 3, food: 1 }, rp: 3, desc: '사라진 문명의 행성. 연구 점수와 크리스탈을 줘요.' },
    asteroid: { ko: '소행성 지대', planet: 1, outpost: 1, pop: 0, color: '#8d8a83', prod: { metal: 5, energy: 0, credits: 0, crystal: 1, food: 0 }, desc: '인구 없이 전초기지로 채굴해요.' },
    nebula:   { ko: '성운', move: 2, color: '#7a3fa8', desc: '이동력 2 소모. 이곳의 방어 측은 체력 +20%.' },
    blackhole:{ ko: '블랙홀', block: 1, color: '#000', desc: '지나갈 수 없어요. (차원 항법 연구 시 이동력 3으로 통과)' },
    empty:    { ko: '중립 지역', color: '#0c1430', desc: '비어 있는 우주 공간.' },
  };
  const PLANET_TYPES = ['terran', 'gas', 'ice', 'volcanic', 'desert', 'ruins', 'asteroid'];

  const GRADES = [
    { ko: '일반', mult: 1.0, color: '#9aa7b8' },
    { ko: '고급', mult: 1.25, color: '#47c98b' },
    { ko: '희귀', mult: 1.5, color: '#4aa8ff' },
    { ko: '영웅', mult: 1.8, color: '#b46cff' },
    { ko: '전설', mult: 2.2, color: '#f2b84b' },
  ];
  const SPECIALS = {
    darkcrystal: { ko: '암흑 결정 광맥', prod: { crystal: 3 } },
    fertile:     { ko: '비옥한 대지', prod: { food: 4 } },
    richore:     { ko: '고순도 광석', prod: { metal: 4 } },
    plasma:      { ko: '플라즈마 핵', prod: { energy: 4 } },
    tradehub:    { ko: '고대 교역로', prod: { credits: 4 } },
  };

  // cost는 1단계 기준이며 n단계 비용 = cost × n
  const BUILDINGS = {
    mine:     { ko: '광산', cat: 'eco', icon: '⛏', cost: { metal: 30, credits: 20 }, prod: { metal: 3 }, desc: '금속 +3 / 단계' },
    power:    { ko: '발전소', cat: 'eco', icon: '⚡', cost: { metal: 30, credits: 20 }, prod: { energy: 3 }, desc: '에너지 +3 / 단계' },
    refinery: { ko: '정제소', cat: 'eco', icon: '◆', cost: { metal: 50, energy: 20, credits: 30 }, prod: { crystal: 2 }, upkeep: { energy: 1 }, desc: '크리스탈 +2 / 단계 (에너지 유지비 1)' },
    trade:    { ko: '무역 센터', cat: 'eco', icon: '◎', cost: { metal: 40, credits: 30 }, prod: { credits: 4 }, desc: '크레딧 +4, 시장 거래 효율 +5% / 단계' },
    shipyard: { ko: '우주선 조선소', cat: 'mil', icon: '⚓', cost: { metal: 70, energy: 30, credits: 40 }, upkeep: { energy: 1 }, desc: '함선 생산. 단계마다 더 큰 함선, 턴당 생산량 +2' },
    defense:  { ko: '방어 기지', cat: 'mil', icon: '⛨', cost: { metal: 50, energy: 20, credits: 30 }, def: 25, upkeep: { energy: 1 }, desc: '행성 방어력 +25 / 단계' },
    mlab:     { ko: '군사 연구소', cat: 'mil', icon: '✷', cost: { metal: 60, energy: 40, credits: 40, crystal: 10 }, rp: 1, desc: '제국 함대 공격력 +5% / 단계 (최대 30%), 연구 +1' },
    orbital:  { ko: '궤도 방어 시설', cat: 'mil', icon: '◉', cost: { metal: 90, energy: 50, credits: 50, crystal: 20 }, def: 35, upkeep: { energy: 2 }, req: 'sci3', desc: '방어력 +35, 행성 반격력 증가 / 단계 (첨단 시설 필요)' },
    slab:     { ko: '과학 연구소', cat: 'sci', icon: '⚗', cost: { metal: 40, energy: 30, credits: 40 }, rp: 4, desc: '연구 +4 / 단계' },
    elab:     { ko: '에너지 연구소', cat: 'sci', icon: '⚛', cost: { metal: 50, energy: 30, credits: 40, crystal: 10 }, rp: 2, prod: { energy: 2 }, desc: '연구 +2, 에너지 +2 / 단계' },
    alab:     { ko: '외계 유물 연구소', cat: 'sci', icon: '☥', cost: { metal: 70, energy: 50, credits: 60, crystal: 25 }, rp: 5, prod: { crystal: 2 }, req: 'ruinsOrAncient', desc: '연구 +5, 크리스탈 +2 / 단계 (고대 유적 행성 또는 고대 문명 해독 필요)' },
  };
  const BCAT_KO = { eco: '경제 시설', mil: '군사 시설', sci: '연구 시설' };

  const SHIPS = {
    scout:     { ko: '정찰선', icon: '➤', atk: 1, hp: 3, move: 4, yard: 1, cost: { metal: 15, energy: 10 }, upkeep: 0, vision: 2, desc: '빠르고 시야가 넓어요(2칸). 탐험에 적합.' },
    fighter:   { ko: '전투기', icon: '✈', atk: 3, hp: 4, move: 3, yard: 1, cost: { metal: 20, energy: 8, credits: 5 }, upkeep: 1, desc: '값싼 기본 전력. 항공모함과 함께면 공격력 +50%.' },
    corvette:  { ko: '호위함', icon: '◇', atk: 4, hp: 9, move: 3, yard: 1, cost: { metal: 35, energy: 12, credits: 10 }, upkeep: 1, desc: '튼튼한 소형 함선.' },
    destroyer: { ko: '구축함', icon: '◆', atk: 9, hp: 14, move: 3, yard: 2, cost: { metal: 55, energy: 22, credits: 20 }, upkeep: 2, desc: '빠르고 강한 공격함.' },
    cruiser:   { ko: '순양함', icon: '⬟', atk: 13, hp: 24, move: 2, yard: 2, cost: { metal: 85, energy: 30, credits: 30, crystal: 10 }, upkeep: 3, desc: '균형 잡힌 주력함.' },
    battleship:{ ko: '전함', icon: '⬢', atk: 24, hp: 45, move: 2, yard: 3, cost: { metal: 140, energy: 50, credits: 50, crystal: 25 }, upkeep: 5, desc: '최강의 화력과 장갑.' },
    carrier:   { ko: '항공모함', icon: '▣', atk: 12, hp: 38, move: 2, yard: 3, cost: { metal: 120, energy: 55, credits: 40, crystal: 20 }, upkeep: 4, desc: '전투기 6대마다 공격력 +50% 지원.' },
    transport: { ko: '수송선', icon: '▤', atk: 0, hp: 6, move: 3, yard: 1, cost: { metal: 25, energy: 10, credits: 15 }, upkeep: 1, desc: '행성 식민·점령에 필요(1척 소모).' },
  };
  const SHIP_ORDER = ['scout', 'fighter', 'corvette', 'destroyer', 'cruiser', 'battleship', 'carrier', 'transport'];

  const TECHS = {
    eco1: { ko: '자동화 채굴', field: 'eco', rp: 25, cost: { energy: 30 }, req: [], desc: '모든 자원 생산 +15%' },
    eco2: { ko: '모듈식 건축', field: 'eco', rp: 40, cost: { energy: 40, crystal: 10 }, req: ['eco1'], desc: '건설 비용 -20%' },
    eco3: { ko: '은하 무역망', field: 'eco', rp: 55, cost: { energy: 60, crystal: 20 }, req: ['eco2'], desc: '크레딧 생산 +25%, 시장 거래 효율 +20%' },
    mil1: { ko: '플라즈마 무기', field: 'mil', rp: 30, cost: { energy: 35, crystal: 5 }, req: [], desc: '함선 공격력 +20%' },
    mil2: { ko: '복합 장갑', field: 'mil', rp: 40, cost: { energy: 45, crystal: 15 }, req: ['mil1'], desc: '함선 방어력(체력) +20%' },
    mil3: { ko: '워프 추진', field: 'mil', rp: 55, cost: { energy: 60, crystal: 20 }, req: ['mil2'], desc: '함대 이동력 +1' },
    sci1: { ko: '양자 컴퓨팅', field: 'sci', rp: 25, cost: { energy: 30 }, req: [], desc: '연구 속도 +25%' },
    sci2: { ko: '장거리 센서', field: 'sci', rp: 35, cost: { energy: 40, crystal: 10 }, req: ['sci1'], desc: '탐험(시야) 범위 +1, 장거리 스캔 비용 절반' },
    sci3: { ko: '첨단 시설', field: 'sci', rp: 50, cost: { energy: 55, crystal: 20 }, req: ['sci2'], desc: '건물 3단계, 궤도 방어 시설 해금' },
    sp1:  { ko: '고대 문명 해독', field: 'sp', rp: 60, cost: { energy: 60, crystal: 30 }, req: ['sci2'], desc: '유적 연구 ×2, 외계 유물 연구소 해금, 조사 보상 ×2' },
    sp2:  { ko: '차원 항법', field: 'sp', rp: 75, cost: { energy: 80, crystal: 35 }, req: ['mil3', 'sci2'], desc: '이동력 +1, 성운 이동 1, 블랙홀 통과 가능' },
    sp3:  { ko: '에너지 보호막', field: 'sp', rp: 75, cost: { energy: 80, crystal: 35 }, req: ['mil2', 'sci3'], desc: '받는 피해 -25%, 행성 방어력 +30%' },
    final:{ ko: '은하 초월', field: 'final', rp: 160, cost: { energy: 150, crystal: 80, credits: 150 }, req: ['eco3', 'sp1', 'sp2', 'sp3'], desc: '최종 기술. 완성하면 과학 승리!' },
  };
  const TECH_FIELDS = { eco: '경제 기술', mil: '군사 기술', sci: '과학 기술', sp: '특수 기술', final: '최종 기술' };

  const MAP_SIZES = {
    small:  { ko: '소형', w: 5, h: 5 },
    medium: { ko: '중형', w: 7, h: 7 },
    large:  { ko: '대형', w: 9, h: 9 },
    huge:   { ko: '초대형', w: 11, h: 11 },
  };
  const SPEEDS = {
    fast:   { ko: '빠름', turnTime: 60, startMul: 1.5 },
    normal: { ko: '보통', turnTime: 120, startMul: 1 },
    slow:   { ko: '느림', turnTime: 300, startMul: 1 },
    free:   { ko: '무제한', turnTime: 0, startMul: 1 },
  };
  const EMBLEMS = ['✦', '☄', '⚛', '♛', '✪', '❂', '♆', '⚜', '☀', '✧', '⬡', '♜'];
  const COLORS = ['#35d0c8', '#e0546b', '#f2b84b', '#9b6bff', '#5fb0ff', '#7bdc6a', '#ff8a3d', '#f06ad2'];

  const EVENTS = {
    meteor:   { ko: '운석 지대 발견', desc: '빈 우주 공간이 새 소행성 지대로 바뀌었어요.' },
    ruins:    { ko: '고대 문명 유적 발견', desc: '어딘가에 새로운 유적 신호가 잡혔어요. 함대로 조사해 보세요.' },
    boom:     { ko: '우주 무역 호황', desc: '2라운드 동안 모든 제국의 크레딧 생산 +50%.' },
    storm:    { ko: '에너지 폭풍', desc: '1라운드 동안 모든 제국의 에너지 생산 -50%.' },
    nebula:   { ko: '성운 확장', desc: '성운이 주변 빈 공간으로 퍼졌어요. 이동이 느려져요.' },
    rare:     { ko: '희귀 자원 발견', desc: '한 행성의 등급이 올라가고 그 주인이 크리스탈 30을 얻었어요.' },
    crisis:   { ko: '은하계 경제 위기', desc: '모든 제국이 보유 크레딧의 20%를 잃었어요.' },
    pirates:  { ko: '중립 세력 등장', desc: '우주 해적 함대가 나타났어요.' },
  };

  const NAME_A = ['케플러', '오리온', '베가', '시리우스', '안타레스', '리겔', '알데바란', '카노푸스', '데네브', '폴라리스', '프록시마', '타우', '엡실론', '글리제', '아케론', '니비루', '솔라리스', '헬리오스', '타이탄', '엘리시움', '아르케', '노바', '제니스', '칼립소', '이카루스', '하이페리온', '아스트라', '벨라트릭스', '미라', '레굴루스', '스피카', '아크투루스', '카펠라', '알타이르', '오메가', '세레스', '유로파', '가니메데', '에리다누스', '카시오페아', '안드로메다', '페르세우스', '드라코', '리라', '히드라', '케페우스', '판도라', '아틀라스'];
  const NAME_B = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'b', 'c', 'd', 'Prime', '알파', '베타', '감마', '델타'];

  /* ------------------------------------------------------------------
     2. 작은 도구들
     ------------------------------------------------------------------ */
  class GWError extends Error { constructor(m) { super(m); this.gw = true; } }
  const fail = m => { throw new GWError(m); };
  const clone = o => JSON.parse(JSON.stringify(o));
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const wpick = (obj) => { let t = 0; for (const k in obj) t += obj[k]; let r = Math.random() * t; for (const k in obj) { r -= obj[k]; if (r < 0) return k; } return Object.keys(obj)[0]; };
  const int = (v, lo, hi) => { v = Math.floor(Number(v)); if (!isFinite(v)) v = lo; return Math.max(lo, Math.min(hi, v)); };
  const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
  const zeroRes = () => ({ metal: 0, energy: 0, credits: 0, crystal: 0, food: 0 });
  const relKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  const sumShips = ships => Object.values(ships || {}).reduce((a, b) => a + (b || 0), 0);

  /* ---- 육각형 좌표 (pointy-top, odd-r offset) ---- */
  const DIRS = [
    [[1, 0], [-1, 0], [0, -1], [-1, -1], [0, 1], [-1, 1]],   // 짝수 행
    [[1, 0], [-1, 0], [1, -1], [0, -1], [1, 1], [0, 1]],     // 홀수 행
  ];
  function neighbors(s, id) {
    const w = s.w, h = s.h, x = id % w, y = Math.floor(id / w), out = [];
    for (const [dx, dy] of DIRS[y & 1]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h) out.push(ny * w + nx); }
    return out;
  }
  function toCube(x, y) { const q = x - (y - (y & 1)) / 2; return [q, y, -q - y]; }
  function dist(s, a, b) {
    const [q1, r1, s1] = toCube(a % s.w, Math.floor(a / s.w)), [q2, r2, s2] = toCube(b % s.w, Math.floor(b / s.w));
    return Math.max(Math.abs(q1 - q2), Math.abs(r1 - r2), Math.abs(s1 - s2));
  }
  function within(s, id, r) { const out = []; for (let i = 0; i < s.w * s.h; i++) if (dist(s, id, i) <= r) out.push(i); return out; }

  /* ------------------------------------------------------------------
     3. 관계 / 보너스 / 경제 계산
     ------------------------------------------------------------------ */
  function rel(s, a, b) {
    if (a === b) return 'self';
    if (a === 'pirate' || b === 'pirate') return 'war';
    const r = s.rel[relKey(a, b)];
    return r ? r.s : 'neutral';
  }
  function setRel(s, a, b, v) { s.rel[relKey(a, b)] = { s: v, since: s.round }; }
  const friendly = (s, a, b) => a === b || rel(s, a, b) === 'alliance';
  const has = (s, pid, t) => !!(s.players[pid] && s.players[pid].research && s.players[pid].research.done.includes(t));

  function bonus(s, pid) {
    const b = { prod: 1, build: 1, trade: 1, atk: 1, hp: 1, move: 0, research: 1, vision: 0, ancient: 1, warp: false, shield: 1, credits: 1, planetDef: 1 };
    if (!s.players[pid]) return b;
    if (has(s, pid, 'eco1')) b.prod += 0.15;
    if (has(s, pid, 'eco2')) b.build = 0.8;
    if (has(s, pid, 'eco3')) { b.trade += 0.2; b.credits += 0.25; }
    if (has(s, pid, 'mil1')) b.atk += 0.2;
    if (has(s, pid, 'mil2')) b.hp += 0.2;
    if (has(s, pid, 'mil3')) b.move += 1;
    if (has(s, pid, 'sci1')) b.research += 0.25;
    if (has(s, pid, 'sci2')) b.vision += 1;
    if (has(s, pid, 'sp1')) b.ancient = 2;
    if (has(s, pid, 'sp2')) { b.warp = true; b.move += 1; }
    if (has(s, pid, 'sp3')) { b.shield = 0.75; b.planetDef = 1.3; }
    let ml = 0, tc = 0;
    for (const t of s.tiles) if (t.owner === pid) { ml += t.buildings.mlab || 0; tc += t.buildings.trade || 0; }
    b.atk += Math.min(0.3, ml * 0.05);
    b.trade += Math.min(0.3, tc * 0.05);
    return b;
  }
  const modActive = (s, k) => s.mods.some(m => m.key === k && m.until >= s.round);

  function maxPop(t) { const T = TYPES[t.type]; if (!T || !T.planet) return 0; return T.pop * t.size + (t.capital ? 3 : 0); }
  function maxDef(s, t) {
    if (!t.owner) return 0;
    const base = (t.capital ? 40 : 10) + (t.buildings.defense || 0) * BUILDINGS.defense.def + (t.buildings.orbital || 0) * BUILDINGS.orbital.def;
    return Math.round(base * bonus(s, t.owner).planetDef);
  }
  function slots(t) { return t.size + 1 + (t.capital ? 1 : 0); }

  function planetProd(s, t, b) {
    const T = TYPES[t.type], g = GRADES[t.grade], out = zeroRes();
    if (!T || !T.planet) return out;
    const sizeF = 0.7 + 0.15 * t.size;
    for (const r of RES) out[r] += (T.prod[r] || 0) * g.mult * sizeF;
    out.crystal += t.grade >= 2 ? t.grade - 1 : 0;
    if (t.special) for (const [r, v] of Object.entries(SPECIALS[t.special].prod)) out[r] += v;
    if (t.capital) for (const r of RES) out[r] += 4;
    out.credits += t.pop;                        // 세금: 인구 1당 크레딧 1
    for (const [k, lv] of Object.entries(t.buildings)) {
      const B = BUILDINGS[k]; if (!B || !B.prod) continue;
      for (const [r, v] of Object.entries(B.prod)) out[r] += v * lv;
    }
    for (const r of RES) out[r] *= b.prod;
    out.credits *= b.credits;
    return out;
  }

  // 한 제국의 턴 당 생산 / 소비 계산
  function economy(s, pid) {
    const p = s.players[pid], b = bonus(s, pid);
    const prod = zeroRes(), upkeep = zeroRes(), planets = [];
    let rp = 0, pop = 0;
    if (!p) return { prod, upkeep, net: zeroRes(), rp: 0, pop: 0, planets };
    const capMul = p.capital == null ? 0.7 : 1;
    for (const t of s.tiles) {
      if (t.owner !== pid) continue;
      const pr = planetProd(s, t, b);
      for (const r of RES) pr[r] *= capMul;
      if (modActive(s, 'boom')) pr.credits *= 1.5;
      if (modActive(s, 'storm')) pr.energy *= 0.5;
      for (const r of RES) { pr[r] = Math.round(pr[r]); prod[r] += pr[r]; }
      let trp = (TYPES[t.type].rp || 0) * b.ancient + (t.capital ? 5 : 0);
      for (const [k, lv] of Object.entries(t.buildings)) {
        const B = BUILDINGS[k]; if (!B) continue;
        if (B.rp) trp += B.rp * lv;
        if (B.upkeep) for (const [r, v] of Object.entries(B.upkeep)) upkeep[r] += v * lv;
      }
      rp += trp; pop += t.pop;
      planets.push({ id: t.id, name: t.name, prod: pr, rp: trp });
    }
    upkeep.food += pop;
    for (const f of s.fleets) if (f.owner === pid) for (const [k, n] of Object.entries(f.ships)) upkeep.credits += SHIPS[k].upkeep * n;
    rp = Math.round(rp * b.research * (p.capital == null ? 0.5 : 1));
    const net = zeroRes();
    for (const r of RES) net[r] = prod[r] - upkeep[r];
    return { prod, upkeep, net, rp, pop, planets };
  }

  function militaryPower(s, pid) {
    const b = bonus(s, pid); let m = 0;
    for (const f of s.fleets) if (f.owner === pid) m += fleetPower(f.ships, b);
    return Math.round(m);
  }
  function fleetPower(ships, b) {
    b = b || { atk: 1, hp: 1 }; let m = 0;
    for (const [k, n] of Object.entries(ships || {})) { const S = SHIPS[k]; if (S) m += n * (S.atk * b.atk + S.hp * b.hp * 0.5); }
    return Math.round(m);
  }
  function assets(s, pid) {
    const p = s.players[pid]; if (!p) return 0;
    let v = p.res.credits + p.res.metal + p.res.energy + p.res.crystal * 2 + p.res.food * 0.5;
    for (const t of s.tiles) if (t.owner === pid) {
      v += 60 * GRADES[t.grade].mult;
      for (const lv of Object.values(t.buildings)) v += 40 * lv * (lv + 1) / 2;
    }
    return Math.round(v);
  }
  function score(s, pid) {
    const p = s.players[pid]; if (!p || !p.alive) return 0;
    let planets = 0, pop = 0, bl = 0;
    for (const t of s.tiles) if (t.owner === pid) { planets++; pop += t.pop; for (const lv of Object.values(t.buildings)) bl += lv; }
    return Math.round(planets * 12 + pop * 2 + p.research.done.length * 15 + bl * 4 + militaryPower(s, pid) / 8 + assets(s, pid) / 60 + (p.capital != null ? 20 : 0));
  }
  function colonizableCount(s) { return s.tiles.filter(t => TYPES[t.type] && TYPES[t.type].planet).length; }

  function victoryProgress(s) {
    const V = s.settings.victory, total = colonizableCount(s), out = {};
    for (const pid of s.order) {
      const p = s.players[pid];
      const owned = s.tiles.filter(t => t.owner === pid).length;
      const r = p.research, fin = TECHS.final;
      let sci = r.done.includes('final') ? 1 : (r.done.length / Object.keys(TECHS).length) * 0.9 + (r.cur === 'final' ? 0.1 * Math.min(1, r.prog / fin.rp) : 0);
      out[pid] = {
        conquest: Math.min(1, owned / Math.max(1, Math.ceil(total * V.conquestPct / 100))),
        owned, need: Math.ceil(total * V.conquestPct / 100),
        economy: Math.min(1, assets(s, pid) / V.economyTarget), assets: assets(s, pid),
        science: Math.min(1, sci), techs: r.done.length,
        score: score(s, pid),
      };
    }
    return out;
  }

  /* ------------------------------------------------------------------
     4. 맵 생성 / 새 게임
     ------------------------------------------------------------------ */
  function makeName(used) {
    for (let i = 0; i < 200; i++) {
      const n = pick(NAME_A) + (Math.random() < 0.7 ? '-' + pick(NAME_B) : '');
      if (!used.has(n)) { used.add(n); return n; }
    }
    const n = pick(NAME_A) + '-' + rnd(10, 999); used.add(n); return n;
  }
  function tileName(type, used) {
    const base = makeName(used);
    if (type === 'nebula') return base.split('-')[0] + ' 성운';
    if (type === 'asteroid') return base.split('-')[0] + ' 소행성대';
    if (type === 'blackhole') return base.split('-')[0] + ' 특이점';
    if (type === 'empty') return '심우주 ' + base.split('-')[0];
    return base;
  }
  function rollGrade(boost) { let g = Number(wpick({ 0: 50, 1: 26, 2: 14, 3: 7, 4: 3 })); if (boost) g = Math.min(4, g + boost); return g; }
  function makePlanet(t, type, used, gradeBoost) {
    t.type = type; t.name = tileName(type, used); t.grade = rollGrade(gradeBoost || 0); t.size = type === 'asteroid' ? 1 : rnd(1, 3);
    t.special = Math.random() < [0.05, 0.15, 0.3, 0.5, 0.8][t.grade] ? pick(Object.keys(SPECIALS)) : null;
  }

  function capitalSpots(w, h, n) {
    const i = w >= 7 ? 1 : 0;
    const c = [[i, i], [w - 1 - i, h - 1 - i], [w - 1 - i, i], [i, h - 1 - i]];
    return c.slice(0, n).map(([x, y]) => y * w + x);
  }

  function newGame(cfg, players) {
    const size = MAP_SIZES[cfg.mapSize] ? cfg.mapSize : 'medium';
    const speed = SPEEDS[cfg.speed] ? cfg.speed : 'normal';
    const { w, h } = MAP_SIZES[size];
    const V = cfg.victory || {};
    const s = {
      v: 1, id: cfg.id || ('g' + Date.now().toString(36)), name: str(cfg.name || 'GALACTIC WAR', 30),
      w, h, round: 1, turnIdx: 0, phase: 'playing', winner: null, winReason: '', seq: 1,
      settings: {
        mapSize: size, speed, turnTime: SPEEDS[speed].turnTime,
        victory: {
          conquest: V.conquest !== false, conquestPct: int(V.conquestPct || 60, 30, 90),
          economy: V.economy !== false, economyTarget: int(V.economyTarget || 6000, 1000, 50000),
          science: V.science !== false,
          empire: true, roundLimit: int(V.roundLimit || 40, 5, 200),
        },
      },
      order: [], players: {}, tiles: [], fleets: [], rel: {}, proposals: [], messages: [], log: [], battles: [], mods: [], lastEvent: null,
      turnStart: Date.now(), stats: { battles: 0, captures: 0 },
    };
    const used = new Set();
    // 1) 지형
    for (let id = 0; id < w * h; id++) {
      const t = { id, x: id % w, y: Math.floor(id / w), type: 'empty', name: '', grade: 0, size: 1, special: null, owner: null, capital: false, pop: 0, buildings: {}, def: 0, garrison: 0, site: null, surveyed: false };
      const type = wpick({ empty: 26, terran: 11, gas: 9, ice: 9, volcanic: 8, desert: 9, asteroid: 9, nebula: 8, blackhole: 3, ruins: 4 });
      if (TYPES[type].planet) makePlanet(t, type, used); else { t.type = type; t.name = tileName(type, used); }
      s.tiles.push(t);
    }
    // 2) 은하 중심: 전설 유적 + 강한 수비대
    const center = Math.floor(h / 2) * w + Math.floor(w / 2);
    // 3) 수도 배치
    const spots = capitalSpots(w, h, players.length);
    // 플레이어 순서를 섞어 공정하게
    const order = players.map(p => p.pid).sort(() => Math.random() - 0.5);
    order.forEach((pid, i) => {
      const P = players.find(p => p.pid === pid);
      const c = spots[i];
      const t = s.tiles[c];
      makePlanet(t, 'terran', used); t.grade = 1; t.size = 3; t.special = null;
      t.owner = pid; t.capital = true; t.pop = 5; t.buildings = { shipyard: 1, mine: 1 }; t.site = null; t.surveyed = true;
      // 수도 주변: 블랙홀 제거, 쉬운 식민지 2개 보장
      const near = within(s, c, 2).filter(n => n !== c);
      for (const n of near) { const nt = s.tiles[n]; if (nt.type === 'blackhole') { nt.type = 'empty'; nt.name = tileName('empty', used); } }
      let easy = near.filter(n => TYPES[s.tiles[n].type].planet).length;
      for (const n of near.sort(() => Math.random() - 0.5)) {
        if (easy >= 3) break;
        const nt = s.tiles[n]; if (nt.type === 'empty' || nt.type === 'nebula') { makePlanet(nt, pick(['terran', 'desert', 'ice', 'gas', 'volcanic']), used); easy++; }
      }
      const sm = SPEEDS[speed].startMul;
      s.players[pid] = {
        pid, name: str(P.name || '사령관', 16), empire: str(P.empire || (P.name + ' 제국'), 20), color: P.color || COLORS[i], emblem: P.emblem || EMBLEMS[i],
        bot: !!P.bot, alive: true, capital: c, capitalLostRound: null,
        res: { metal: Math.round(160 * sm), energy: Math.round(110 * sm), credits: Math.round(200 * sm), crystal: Math.round(30 * sm), food: Math.round(60 * sm) },
        research: { done: [], cur: null, prog: 0 },
        explored: new Array(w * h).fill(0),
        flags: {}, lastIncome: null, elimRound: null,
      };
      s.fleets.push({ id: 'f' + s.seq++, owner: pid, tile: c, ships: { scout: 1, fighter: 2, corvette: 1, transport: 1 }, mp: 0, acted: false, fresh: false });
      s.order.push(pid);
    });
    // 4) 은하 중심 유적
    if (!s.tiles[center].owner) {
      const ct = s.tiles[center];
      makePlanet(ct, 'ruins', used, 0); ct.grade = 4; ct.size = 3; ct.special = 'darkcrystal'; ct.name = '아르카디아 중심 유적';
      ct.garrison = 40 + w * 6;
    }
    // 5) 수비대, 조사 지점, 해적
    for (const t of s.tiles) {
      if (t.owner || t.id === center) continue;
      const dCap = Math.min(...spots.map(c => dist(s, c, t.id)));
      if (TYPES[t.type].planet && dCap > 2 && Math.random() < 0.45) t.garrison = Math.round(rnd(8, 18) * (1 + t.grade * 0.5));
      if (dCap > 0 && Math.random() < 0.4 && t.type !== 'blackhole') {
        t.site = t.type === 'empty' ? wpick({ planet: 4, rare: 3, ruins: 2, neutral: 2, event: 2 }) : wpick({ rare: 4, ruins: 2, neutral: 2, event: 3 });
      }
    }
    const pirateCount = Math.floor((w * h) / 30);
    for (let i = 0; i < pirateCount; i++) spawnPirates(s, 1);
    // 6) 블랙홀 때문에 수도끼리 막히지 않게
    for (let i = 1; i < spots.length; i++) {
      if (!reachableIgnoringFleets(s, spots[0], spots[i])) for (const t of s.tiles) if (t.type === 'blackhole') { t.type = 'empty'; t.name = tileName('empty', used); }
    }
    // 7) 초기 시야, 방어력
    for (const t of s.tiles) if (t.owner) t.def = maxDef(s, t);
    for (const pid of s.order) refreshVision(s, pid);
    addLog(s, `은하 전쟁이 시작되었습니다! ${s.order.length}개 제국이 패권을 다툽니다.`);
    startTurn(s);
    return s;
  }
  function reachableIgnoringFleets(s, a, b) {
    const seen = new Set([a]), q = [a];
    while (q.length) { const c = q.shift(); if (c === b) return true; for (const n of neighbors(s, c)) if (!seen.has(n) && s.tiles[n].type !== 'blackhole') { seen.add(n); q.push(n); } }
    return false;
  }
  function spawnPirates(s, strength) {
    const caps = s.order.map(p => s.players[p].capital).filter(c => c != null);
    const cand = s.tiles.filter(t => !t.owner && t.type !== 'blackhole' && !s.fleets.some(f => f.tile === t.id) && caps.every(c => dist(s, c, t.id) > 2));
    if (!cand.length) return null;
    const t = pick(cand), k = Math.max(1, strength + Math.floor(s.round / 8));
    const f = { id: 'f' + s.seq++, owner: 'pirate', tile: t.id, ships: { fighter: rnd(1, 3) * k, corvette: rnd(1, 2) * k }, mp: 0, acted: false };
    if (k >= 2) f.ships.destroyer = rnd(0, k - 1);
    s.fleets.push(f);
    return t;
  }

  /* ------------------------------------------------------------------
     5. 시야 / 탐험
     ------------------------------------------------------------------ */
  function visionSources(s, pid) {
    const b = bonus(s, pid), src = [];
    for (const t of s.tiles) if (t.owner === pid) src.push([t.id, 1 + b.vision + (t.capital ? 1 : 0)]);
    for (const f of s.fleets) if (f.owner === pid) src.push([f.tile, (f.ships.scout ? 2 : 1) + b.vision]);
    return src;
  }
  function refreshVision(s, pid) {
    const p = s.players[pid]; if (!p) return;
    for (const [c, r] of visionSources(s, pid)) for (const id of within(s, c, r)) p.explored[id] = 1;
  }
  function visibleSet(s, pid) {
    const set = new Set(), who = [pid];
    for (const o of s.order) if (o !== pid && rel(s, pid, o) === 'alliance') who.push(o);
    for (const w of who) for (const [c, r] of visionSources(s, w)) for (const id of within(s, c, r)) set.add(id);
    return set;
  }

  /* ------------------------------------------------------------------
     6. 이동 / 경로
     ------------------------------------------------------------------ */
  function enterCost(s, pid, t) {
    if (t.fog) return 1;
    const b = bonus(s, pid);
    if (t.type === 'blackhole') return b.warp ? 3 : Infinity;
    if (t.type === 'nebula') return b.warp ? 1 : 2;
    return 1;
  }
  function hostileFleetsAt(s, pid, tile) { return s.fleets.filter(f => f.tile === tile && f.owner !== pid && !friendly(s, pid, f.owner)); }
  // 다익스트라: 목적지 이외에는 적대 함대가 있는 칸 / 불가침 상대 행성 칸을 지날 수 없음
  function findPath(s, pid, from, to) {
    const N = s.w * s.h, best = new Array(N).fill(Infinity), prev = new Array(N).fill(-1);
    best[from] = 0; const open = [from];
    while (open.length) {
      open.sort((a, b) => best[a] - best[b]);
      const c = open.shift();
      if (c === to) break;
      if (c !== from && hostileFleetsAt(s, pid, c).length) continue;   // 적이 있는 칸에서는 멈춤
      for (const n of neighbors(s, c)) {
        const t = s.tiles[n];
        if (t.owner && t.owner !== pid && rel(s, pid, t.owner) === 'nap') continue;
        const cost = enterCost(s, pid, t);
        if (!isFinite(cost)) continue;
        const nc = best[c] + cost;
        if (nc < best[n]) { best[n] = nc; prev[n] = c; if (!open.includes(n)) open.push(n); }
      }
    }
    if (!isFinite(best[to])) return null;
    const path = []; for (let c = to; c !== -1; c = prev[c]) path.unshift(c);
    return { path, cost: best[to] };
  }
  function fleetMove(s, f) {
    let m = Infinity; for (const [k, n] of Object.entries(f.ships)) if (n > 0) m = Math.min(m, SHIPS[k].move);
    if (!isFinite(m)) m = 0;
    return m + bonus(s, f.owner).move;
  }
  // 이번 턴에 갈 수 있는 칸 (클라이언트 미리보기용, view에서도 동작)
  function reachable(s, pid, f) {
    const out = {}; if (!f || f.mp <= 0) return out;
    const N = s.w * s.h, best = new Array(N).fill(Infinity); best[f.tile] = 0; const open = [f.tile];
    while (open.length) {
      open.sort((a, b) => best[a] - best[b]); const c = open.shift();
      if (c !== f.tile && hostileFleetsAt(s, pid, c).length) continue;
      for (const n of neighbors(s, c)) {
        const t = s.tiles[n];
        if (t.owner && t.owner !== pid && rel(s, pid, t.owner) === 'nap') continue;
        const nc = best[c] + enterCost(s, pid, t);
        if (nc <= f.mp && nc < best[n]) { best[n] = nc; out[n] = nc; open.push(n); }
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------
     7. 전투
     ------------------------------------------------------------------ */
  function firepower(ships, mods) {
    let a = 0; const carriers = ships.carrier || 0, fighters = ships.fighter || 0, boosted = Math.min(fighters, carriers * 6);
    for (const [k, n] of Object.entries(ships)) if (n > 0) a += SHIPS[k].atk * n;
    a += boosted * SHIPS.fighter.atk * 0.5;
    return a * mods.atk;
  }
  function applyDamage(side, dmg, hpMul, rand) {
    const pools = [];
    for (const [k, n] of Object.entries(side.ships)) if (n > 0) pools.push([k, n * SHIPS[k].hp * hpMul]);
    if (side.planet > 0) pools.push(['planet', side.planet]);
    const total = pools.reduce((a, p) => a + p[1], 0), loss = {};
    if (total <= 0) return loss;
    for (const [k, pool] of pools) {
      const share = dmg * pool / total;
      if (k === 'planet') { const d = Math.min(side.planet, share); side.planet = Math.max(0, Math.round((side.planet - d) * 10) / 10); loss.planet = Math.round(d); continue; }
      const each = SHIPS[k].hp * hpMul, raw = share / each;
      let kills = Math.floor(raw); if (rand() < raw - kills) kills++;
      kills = Math.min(side.ships[k], kills);
      if (kills) { side.ships[k] -= kills; loss[k] = kills; }
    }
    return loss;
  }
  // A: {ships, mods:{atk,hp,taken}}, D: {ships, planet, planetAtk, mods}
  function simulateBattle(A, D, rand) {
    rand = rand || Math.random;
    const a = { ships: Object.assign({}, A.ships), planet: 0 }, d = { ships: Object.assign({}, D.ships), planet: D.planet || 0 };
    const rounds = [];
    for (let r = 1; r <= 6; r++) {
      const aCombat = Object.entries(a.ships).some(([k, n]) => n > 0 && SHIPS[k].atk > 0);
      const aAlive = sumShips(a.ships) > 0, dAlive = sumShips(d.ships) > 0 || d.planet > 0;
      if (!aAlive || !dAlive || (!aCombat && r === 1)) break;
      const aAtk = firepower(a.ships, A.mods) * (0.85 + rand() * 0.3);
      const dAtk = (firepower(d.ships, D.mods) + d.planet * (D.planetAtk || 0.3)) * (0.85 + rand() * 0.3);
      const toD = aAtk * D.mods.taken, toA = dAtk * A.mods.taken;
      const dLoss = applyDamage(d, toD, D.mods.hp, rand), aLoss = applyDamage(a, toA, A.mods.hp, rand);
      rounds.push({ r, aDmg: Math.round(toD), dDmg: Math.round(toA), aLoss, dLoss, aPow: fleetPower(a.ships, A.mods), dPow: fleetPower(d.ships, D.mods) + Math.round(d.planet) });
      if (!aCombat) break;
    }
    const aLeft = sumShips(a.ships) > 0, dLeft = sumShips(d.ships) > 0 || d.planet > 0;
    const winner = aLeft && !dLeft ? 'attacker' : (!aLeft && dLeft ? 'defender' : 'draw');
    return { a: a.ships, d: d.ships, planet: d.planet, rounds, winner };
  }
  function estimateWin(A, D, n) {
    n = n || 80; let w = 0;
    for (let i = 0; i < n; i++) if (simulateBattle(A, D).winner === 'attacker') w++;
    return w / n;
  }
  function sideMods(s, pid, tile, defending) {
    const b = pid === 'pirate' || pid === 'neutral' ? { atk: 1, hp: 1, shield: 1 } : bonus(s, pid);
    const t = s.tiles[tile];
    return { atk: b.atk, hp: b.hp * (defending && t.type === 'nebula' ? 1.2 : 1), taken: b.shield };
  }
  // 이 칸에서 pid의 함대가 공격할 때 상대 측 구성 (서버·클라이언트 공용)
  function defenderSetup(s, pid, tileId) {
    const t = s.tiles[tileId];
    const enemies = hostileFleetsAt(s, pid, tileId).filter(f => f.owner === 'pirate' || rel(s, pid, f.owner) !== 'nap');
    let defOwner = null;
    if (t.owner && t.owner !== pid && !friendly(s, pid, t.owner)) defOwner = t.owner;
    else if (enemies.length) defOwner = enemies[0].owner;
    else if (!t.owner && t.garrison > 0) defOwner = 'neutral';
    if (!defOwner) return null;
    const fleets = enemies.filter(f => f.owner === defOwner);
    const ships = {};
    for (const f of fleets) for (const [k, n] of Object.entries(f.ships)) ships[k] = (ships[k] || 0) + n;
    let planet = 0, planetAtk = 0.3;
    if (defOwner === 'neutral') { planet = t.garrison; planetAtk = 0.45; }
    else if (t.owner === defOwner) { planet = t.def || 0; planetAtk = 0.3 + 0.08 * ((t.buildings && t.buildings.orbital) || 0); }
    return { owner: defOwner, fleets, ships, planet, planetAtk, mods: sideMods(s, defOwner, tileId, true) };
  }

  /* ------------------------------------------------------------------
     8. 턴 진행
     ------------------------------------------------------------------ */
  function addLog(s, txt, to) { s.log.push({ r: s.round, txt, to: to || null }); if (s.log.length > 250) s.log.splice(0, s.log.length - 250); }
  const pname = (s, pid) => pid === 'pirate' ? '우주 해적' : pid === 'neutral' ? '중립 수비대' : (s.players[pid] ? s.players[pid].empire : '?');

  function startTurn(s) {
    const pid = s.order[s.turnIdx], p = s.players[pid];
    s.turnStart = Date.now();
    p.flags = { prod: true, research: true, build: false, ship: false, move: false, dip: false, built: {}, shipsBuilt: {}, scan: false };
    const eco = economy(s, pid);
    // 1. 자원 생산
    for (const r of RES) p.res[r] += eco.net[r];
    p.lastIncome = eco.net;
    const notes = [];
    if (p.res.food < 0) {
      p.res.food = 0;
      for (const t of s.tiles) if (t.owner === pid && t.pop > 1) t.pop--;
      notes.push('식량 부족으로 행성 인구가 줄었습니다');
    } else {
      for (const t of s.tiles) if (t.owner === pid && t.pop < maxPop(t)) t.pop++;
    }
    if (p.res.credits < 0) {
      p.res.credits = 0;
      const mine = s.fleets.filter(f => f.owner === pid && sumShips(f.ships) > 0);
      if (mine.length) {
        const f = pick(mine), k = Object.keys(f.ships).filter(k => f.ships[k] > 0).sort((a, b) => SHIPS[b].upkeep - SHIPS[a].upkeep)[0];
        f.ships[k]--; notes.push(`크레딧 부족으로 ${SHIPS[k].ko} 1척이 이탈했습니다`);
        cleanupFleets(s);
      }
    }
    if (p.res.energy < 0) p.res.energy = 0;
    for (const r of RES) p.res[r] = Math.round(p.res[r]);
    // 2. 연구 진행
    const R = p.research;
    if (R.cur) {
      R.prog += eco.rp;
      if (R.prog >= TECHS[R.cur].rp) {
        R.prog -= TECHS[R.cur].rp; R.done.push(R.cur);
        addLog(s, `${p.empire}이(가) [${TECHS[R.cur].ko}] 연구를 완료했습니다.`);
        R.cur = null;
      }
    } else R.prog = Math.min(R.prog, 0);
    // 함대 / 방어력
    for (const f of s.fleets) if (f.owner === pid) { f.mp = fleetMove(s, f); f.acted = false; f.fresh = false; f.surveyed = false; }
    for (const t of s.tiles) if (t.owner === pid) {
      const sieged = hostileFleetsAt(s, pid, t.id).some(f => f.owner === 'pirate' || rel(s, pid, f.owner) === 'war');
      if (!sieged) t.def = Math.min(maxDef(s, t), Math.round((t.def || 0) + maxDef(s, t) * 0.25));
    }
    refreshVision(s, pid);
    if (notes.length) addLog(s, notes.join(' / '), [pid]);
    checkVictory(s);
  }

  function endTurn(s) {
    if (s.phase !== 'playing') return;
    const n = s.order.length;
    let idx = s.turnIdx, wrapped = false;
    for (let i = 0; i < n; i++) {
      idx = (idx + 1) % n;
      if (idx === 0) wrapped = true;
      if (s.players[s.order[idx]].alive) break;
    }
    if (wrapped) {
      s.round++;
      const V = s.settings.victory;
      if (s.round > V.roundLimit) { finishByScore(s); return; }
      s.proposals = s.proposals.filter(pr => s.round - pr.round <= 2);
      s.mods = s.mods.filter(m => m.until >= s.round);
      galacticEvent(s);
    }
    s.turnIdx = idx;
    startTurn(s);
  }

  function galacticEvent(s) {
    if (Math.random() > 0.3) return;
    const key = pick(Object.keys(EVENTS));
    const E = EVENTS[key];
    let detail = E.desc, tile = null;
    const empties = s.tiles.filter(t => t.type === 'empty' && !t.owner);
    switch (key) {
      case 'meteor': {
        if (!empties.length) return;
        const t = pick(empties); makePlanet(t, 'asteroid', new Set(s.tiles.map(x => x.name))); t.garrison = 0; tile = t.id;
        detail = `${t.name}에 새로운 소행성 지대가 생겼어요.`; break;
      }
      case 'ruins': {
        const c = s.tiles.filter(t => !t.owner && !t.site && t.type !== 'blackhole' && !t.surveyed);
        if (!c.length) return; const t = pick(c); t.site = 'ruins'; tile = t.id;
        detail = `${t.name} 근처에서 유적 신호가 잡혔어요. 함대로 조사하면 보상을 받아요.`; break;
      }
      case 'boom': s.mods.push({ key: 'boom', until: s.round + 1, ko: E.ko }); break;
      case 'storm': s.mods.push({ key: 'storm', until: s.round, ko: E.ko }); break;
      case 'nebula': {
        const neb = s.tiles.filter(t => t.type === 'nebula'); if (!neb.length) return;
        const src = pick(neb); let c = 0;
        for (const n of neighbors(s, src.id)) { const t = s.tiles[n]; if (t.type === 'empty' && !t.owner && c < 2) { t.type = 'nebula'; t.name = src.name; c++; } }
        if (!c) return; tile = src.id; detail = `${src.name}이(가) 주변으로 퍼졌어요.`; break;
      }
      case 'rare': {
        const owned = s.tiles.filter(t => t.owner && s.players[t.owner]);
        if (!owned.length) return; const t = pick(owned);
        t.grade = Math.min(4, t.grade + 1); s.players[t.owner].res.crystal += 30; tile = t.id;
        detail = `${pname(s, t.owner)}의 ${t.name}에서 희귀 자원이 발견되어 등급이 ${GRADES[t.grade].ko}(으)로 올랐어요. 크리스탈 +30`; break;
      }
      case 'crisis': for (const pid of s.order) { const p = s.players[pid]; p.res.credits = Math.round(p.res.credits * 0.8); } break;
      case 'pirates': { const t = spawnPirates(s, 2); if (!t) return; tile = t.id; detail = `${t.name}에 우주 해적 함대가 나타났어요.`; break; }
    }
    s.lastEvent = { round: s.round, key, ko: E.ko, desc: detail, tile };
    addLog(s, `[우주 이벤트] ${E.ko} — ${detail}`);
  }

  function cleanupFleets(s) {
    for (const f of s.fleets) for (const k of Object.keys(f.ships)) if (!f.ships[k]) delete f.ships[k];
    s.fleets = s.fleets.filter(f => sumShips(f.ships) > 0);
  }

  function eliminateIfDead(s, pid) {
    const p = s.players[pid]; if (!p || !p.alive) return;
    if (s.tiles.some(t => t.owner === pid)) return;
    p.alive = false; p.elimRound = s.round;
    s.fleets = s.fleets.filter(f => f.owner !== pid);
    s.proposals = s.proposals.filter(pr => pr.from !== pid && pr.to !== pid);
    addLog(s, `☠ ${p.empire}이(가) 모든 행성을 잃고 멸망했습니다.`);
  }

  function endGame(s, winner, reason) {
    if (s.phase === 'ended') return;
    s.phase = 'ended'; s.winner = winner; s.winReason = reason; s.endedAt = Date.now();
    s.final = s.order.map(pid => ({ pid, empire: s.players[pid].empire, name: s.players[pid].name, color: s.players[pid].color, emblem: s.players[pid].emblem, score: score(s, pid), alive: s.players[pid].alive, bot: s.players[pid].bot })).sort((a, b) => b.score - a.score);
    addLog(s, `🏆 ${pname(s, winner)}의 ${reason}!`);
  }
  function finishByScore(s) {
    s.round = s.settings.victory.roundLimit;
    const alive = s.order.filter(p => s.players[p].alive).sort((a, b) => score(s, b) - score(s, a));
    endGame(s, alive[0], '제국 승리 (최종 라운드 최고 점수)');
  }
  function checkVictory(s) {
    if (s.phase !== 'playing') return;
    const alive = s.order.filter(p => s.players[p].alive);
    if (alive.length === 1) return endGame(s, alive[0], '최후의 제국 (정복 승리)');
    const V = s.settings.victory, prog = victoryProgress(s);
    for (const pid of alive) {
      const pr = prog[pid];
      if (V.science && s.players[pid].research.done.includes('final')) return endGame(s, pid, '과학 승리');
      if (V.conquest && pr.conquest >= 1) return endGame(s, pid, `정복 승리 (행성 ${V.conquestPct}% 점령)`);
      if (V.economy && pr.economy >= 1) return endGame(s, pid, `경제 승리 (총자산 ${V.economyTarget} 달성)`);
    }
  }

  /* ------------------------------------------------------------------
     9. 행동 처리 (모든 검증은 여기서)
     ------------------------------------------------------------------ */
  function canPay(res, cost, mul) { mul = mul || 1; for (const [r, v] of Object.entries(cost)) if (res[r] < Math.ceil(v * mul)) return false; return true; }
  function pay(p, cost, mul, what) {
    mul = mul || 1;
    const lack = Object.entries(cost).filter(([r, v]) => p.res[r] < Math.ceil(v * mul)).map(([r, v]) => `${RES_KO[r]} ${Math.ceil(v * mul) - p.res[r]}`);
    if (lack.length) fail(`${what || ''} 자원이 부족합니다 (부족: ${lack.join(', ')})`);
    for (const [r, v] of Object.entries(cost)) p.res[r] -= Math.ceil(v * mul);
  }
  function scaleCost(cost, mul) { const o = {}; for (const [r, v] of Object.entries(cost)) o[r] = Math.ceil(v * mul); return o; }
  function buildCost(s, pid, key, level) { return scaleCost(BUILDINGS[key].cost, level * bonus(s, pid).build); }
  function buildCheck(s, pid, t, key) {
    const B = BUILDINGS[key]; if (!B) return '알 수 없는 건물';
    if (!t || t.owner !== pid) return '내 행성에만 건설할 수 있습니다';
    const lv = t.buildings[key] || 0;
    if (lv >= 3) return '이미 최대 단계(3)입니다';
    if (lv === 2 && !has(s, pid, 'sci3')) return '3단계 업그레이드는 [첨단 시설] 연구가 필요합니다';
    if (!lv && Object.keys(t.buildings).length >= slots(t)) return `건설 슬롯이 가득 찼습니다 (${slots(t)}칸)`;
    if (B.req === 'sci3' && !has(s, pid, 'sci3')) return '[첨단 시설] 연구가 필요합니다';
    if (B.req === 'ruinsOrAncient' && t.type !== 'ruins' && !has(s, pid, 'sp1')) return '고대 유적 행성이거나 [고대 문명 해독] 연구가 필요합니다';
    if (TYPES[t.type].outpost && ['shipyard', 'slab', 'elab', 'alab', 'mlab'].includes(key)) return '소행성 전초기지에는 지을 수 없습니다';
    if (s.players[pid].flags.built && s.players[pid].flags.built[t.id]) return '이 행성은 이번 턴에 이미 건설했습니다';
    return null;
  }
  function shipCheck(s, pid, t, type, n) {
    const S = SHIPS[type]; if (!S) return '알 수 없는 함선';
    if (!t || t.owner !== pid) return '내 행성에서만 생산할 수 있습니다';
    const yard = t.buildings.shipyard || 0;
    if (!yard) return '이 행성에는 조선소가 없습니다';
    if (yard < S.yard) return `${S.ko}은(는) 조선소 ${S.yard}단계가 필요합니다`;
    const done = (s.players[pid].flags.shipsBuilt || {})[t.id] || 0, cap = yard * 2;
    if (done + n > cap) return `이 조선소는 이번 턴에 ${cap - done}척 더 만들 수 있습니다`;
    if (hostileFleetsAt(s, pid, t.id).some(f => f.owner === 'pirate' || rel(s, pid, f.owner) === 'war')) return '적 함대에 봉쇄되어 생산할 수 없습니다';
    return null;
  }
  function marketPrice(s, pid, res, side) {
    const base = { metal: [0.5, 1.6], energy: [0.5, 1.6], crystal: [2, 5.5], food: [0.4, 1.3] }[res];
    if (!base) return null;
    const eff = bonus(s, pid).trade;
    return side === 'sell' ? base[0] * eff : base[1] / eff;
  }
  function getFleet(s, pid, id) {
    const f = s.fleets.find(f => f.id === id);
    if (!f) fail('함대를 찾을 수 없습니다');
    if (f.owner !== pid) fail('내 함대가 아닙니다');
    return f;
  }
  const SHIP_TYPES = Object.keys(SHIPS);
  function cleanShips(obj) { const o = {}; for (const k of SHIP_TYPES) { const n = int((obj || {})[k] || 0, 0, 9999); if (n) o[k] = n; } return o; }
  function cleanRes(obj) { const o = {}; for (const r of RES) { const n = int((obj || {})[r] || 0, 0, 1e6); if (n) o[r] = n; } return o; }

  function resolveAttack(s, pid, f, auto) {
    const t = s.tiles[f.tile];
    const D = defenderSetup(s, pid, f.tile);
    if (!D) fail('공격할 대상이 없습니다');
    if (D.owner !== 'pirate' && D.owner !== 'neutral') {
      const r = rel(s, pid, D.owner);
      if (r === 'alliance' || r === 'nap') fail('동맹/불가침 관계인 제국은 공격할 수 없습니다');
      if (r === 'neutral') { setRel(s, pid, D.owner, 'war'); addLog(s, `⚔ ${pname(s, pid)}이(가) ${pname(s, D.owner)}에게 전쟁을 선포했습니다.`); }
    }
    const A = { ships: f.ships, mods: sideMods(s, pid, f.tile, false) };
    const before = { a: Object.assign({}, f.ships), d: Object.assign({}, D.ships), planet: D.planet };
    const odds = estimateWin(A, D, 60);
    const res = simulateBattle(A, D);
    // 결과 반영: 공격 함대
    f.ships = res.a; f.acted = true; f.mp = 0;
    // 방어 함대: 손실을 함대별로 분배
    const lossLeft = {};
    for (const k of Object.keys(D.ships)) lossLeft[k] = D.ships[k] - (res.d[k] || 0);
    for (const df of D.fleets) for (const k of Object.keys(df.ships)) { const l = Math.min(df.ships[k], lossLeft[k] || 0); df.ships[k] -= l; lossLeft[k] -= l; }
    if (D.owner === 'neutral') t.garrison = Math.round(res.planet);
    else if (t.owner === D.owner) t.def = Math.round(res.planet);
    cleanupFleets(s);
    s.stats.battles++;
    // 점령
    let captured = false;
    const defendersGone = !defenderSetup(s, pid, t.id);
    if (res.winner === 'attacker' && defendersGone && TYPES[t.type].planet && t.owner !== pid && (f.ships.transport || 0) > 0) {
      const prev = t.owner; captureTile(s, pid, t, f); captured = prev || 'neutral';
    }
    const rep = {
      id: 'b' + s.seq++, round: s.round, tile: t.id, tileName: t.name, auto: !!auto,
      attacker: pid, defender: D.owner, before, after: { a: Object.assign({}, res.a), d: Object.assign({}, res.d), planet: Math.round(res.planet) },
      powA: [fleetPower(before.a, A.mods), fleetPower(res.a, A.mods)], powD: [fleetPower(before.d, D.mods) + Math.round(before.planet), fleetPower(res.d, D.mods) + Math.round(res.planet)],
      rounds: res.rounds, winner: res.winner, odds: Math.round(odds * 100), captured: !!captured,
    };
    s.battles.push(rep); if (s.battles.length > 40) s.battles.shift();
    const wk = res.winner === 'attacker' ? '공격 승리' : res.winner === 'defender' ? '방어 성공' : '무승부';
    addLog(s, `⚔ ${t.name} 전투: ${pname(s, pid)} vs ${pname(s, D.owner)} — ${wk}${captured ? ' · 행성 점령!' : ''}`);
    if (D.owner !== 'neutral' && D.owner !== 'pirate') eliminateIfDead(s, D.owner);
    refreshVision(s, pid);
    checkVictory(s);
    return rep;
  }

  function captureTile(s, pid, t, f) {
    const prev = t.owner;
    if (prev && s.players[prev]) {
      if (t.capital) { s.players[prev].capital = null; s.players[prev].capitalLostRound = s.round; addLog(s, `★ ${pname(s, prev)}의 수도 ${t.name}이(가) 함락되었습니다! (생산 -30%, 연구 -50%)`); }
      for (const k of Object.keys(t.buildings)) { t.buildings[k]--; if (t.buildings[k] <= 0) delete t.buildings[k]; }
      t.pop = Math.max(maxPop(t) ? 1 : 0, Math.floor(t.pop / 2));
    } else {
      t.pop = maxPop(t) ? 1 : 0;
    }
    t.capital = false; t.owner = pid; t.garrison = 0; t.def = Math.round(maxDef(s, t) * 0.3);
    f.ships.transport--; cleanupFleets(s);
    s.stats.captures++;
    addLog(s, `🚩 ${pname(s, pid)}이(가) ${t.name}을(를) ${prev ? pname(s, prev) + '에게서 빼앗았습니다' : '점령했습니다'}.`);
    if (prev) eliminateIfDead(s, prev);
  }

  function survey(s, pid, f) {
    const t = s.tiles[f.tile], p = s.players[pid], m = bonus(s, pid).ancient;
    if (f.surveyed) fail('이 함대는 이번 턴에 이미 조사했습니다');
    if (t.surveyed) fail('이미 조사가 끝난 지역입니다');
    if (hostileFleetsAt(s, pid, t.id).length) fail('적 함대가 있어 조사할 수 없습니다');
    f.surveyed = true; f.mp = 0; t.surveyed = true;
    const site = t.site; t.site = null;
    let out = { kind: site || 'none', title: '특별한 것 없음', text: '이 지역에서는 별다른 것을 찾지 못했어요.' };
    const used = new Set(s.tiles.map(x => x.name));
    switch (site) {
      case 'planet': makePlanet(t, pick(['terran', 'ice', 'desert', 'gas', 'volcanic']), used, 1); t.garrison = 0;
        out = { kind: site, title: '새로운 행성 발견', text: `${t.name} (${TYPES[t.type].ko}, ${GRADES[t.grade].ko})을(를) 발견했어요! 수송선으로 식민할 수 있어요.` }; break;
      case 'rare': { const c = rnd(20, 40) * m, mt = rnd(30, 60) * m; p.res.crystal += c; p.res.metal += mt;
        if (TYPES[t.type].planet && t.grade < 4) t.grade++;
        out = { kind: site, title: '희귀 자원 발견', text: `크리스탈 +${c}, 금속 +${mt}${TYPES[t.type].planet ? ` · ${t.name}의 등급이 ${GRADES[t.grade].ko}(으)로 상승` : ''}` }; break; }
      case 'ruins': { const rp = 20 * m, cr = 60 * m; p.res.credits += cr;
        if (p.research.cur) p.research.prog += rp; else p.res.energy += rp * 2;
        if (t.type === 'empty') { makePlanet(t, 'ruins', used); t.garrison = 0; }
        out = { kind: site, title: '고대 유적 발견', text: `크레딧 +${cr}, ${p.research.cur ? '연구 진행 +' + rp : '에너지 +' + rp * 2}${t.type === 'ruins' ? ' · 유적 행성이 드러났어요' : ''}` }; break; }
      case 'neutral':
        if (Math.random() < 0.5) {
          const g = rnd(50, 90) * m; p.res.credits += g;
          out = { kind: site, title: '중립 세력 발견 (우호)', text: `떠돌이 상단과 교역했어요. 크레딧 +${g}` };
        } else {
          const pf = { id: 'f' + s.seq++, owner: 'pirate', tile: t.id, ships: { fighter: rnd(2, 4), corvette: rnd(1, 2) }, mp: 0, acted: false };
          s.fleets.push(pf);
          out = { kind: site, title: '중립 세력 발견 (적대)', text: '숨어 있던 해적이 나타났어요! 같은 칸에서 공격하거나 후퇴하세요.' };
        } break;
      case 'event': {
        const r = Math.random();
        if (r < 0.4) { const e = rnd(40, 80) * m; p.res.energy += e; out = { kind: site, title: '우주 이벤트: 에너지 성류', text: `에너지 +${e}` }; }
        else if (r < 0.7) { p.res.food += 40 * m; out = { kind: site, title: '우주 이벤트: 생명체 포자', text: `식량 +${40 * m}` }; }
        else { const k = Object.keys(f.ships).find(k => f.ships[k] > 0 && k !== 'transport'); if (k && f.ships[k] > 1) { f.ships[k]--; } p.res.crystal += 15;
          out = { kind: site, title: '우주 이벤트: 중력 폭풍', text: `함선 일부가 손상되었지만 크리스탈 +15를 얻었어요${k && f.ships[k] >= 0 ? '' : ''}` }; }
        break;
      }
    }
    p.flags.move = true;
    addLog(s, `🔭 ${t.name} 조사: ${out.title} — ${out.text}`, [pid]);
    return out;
  }

  function doAction(s, pid, a) {
    if (!a || typeof a !== 'object') fail('잘못된 요청');
    const p = s.players[pid];
    if (!p) fail('이 게임의 플레이어가 아닙니다');
    if (s.phase !== 'playing') fail('게임이 이미 끝났습니다');
    if (!p.alive) fail('멸망한 제국은 행동할 수 없습니다');
    const anyTime = { dip_respond: 1, msg: 1 };
    if (!anyTime[a.type] && s.order[s.turnIdx] !== pid) fail('지금은 당신의 차례가 아닙니다');
    const tileOf = id => { const t = s.tiles[int(id, -1, s.tiles.length)]; if (!t) fail('잘못된 타일'); return t; };

    switch (a.type) {
      case 'end_turn': endTurn(s); return { ended: true };

      case 'build': {
        const t = tileOf(a.tile), key = String(a.b);
        const e = buildCheck(s, pid, t, key); if (e) fail(e);
        const lv = (t.buildings[key] || 0) + 1;
        pay(p, buildCost(s, pid, key, lv), 1, BUILDINGS[key].ko);
        t.buildings[key] = lv; p.flags.built[t.id] = true; p.flags.build = true;
        if (BUILDINGS[key].def) t.def = Math.min(maxDef(s, t), (t.def || 0) + BUILDINGS[key].def);
        addLog(s, `🏗 ${t.name}에 ${BUILDINGS[key].ko} ${lv}단계 ${lv > 1 ? '업그레이드' : '건설'}`, [pid]);
        return { tile: t.id, b: key, lv };
      }

      case 'ship': {
        const t = tileOf(a.tile), type = String(a.ship), n = int(a.n, 1, 20);
        const e = shipCheck(s, pid, t, type, n); if (e) fail(e);
        pay(p, SHIPS[type].cost, n, SHIPS[type].ko);
        let f = s.fleets.find(f => f.owner === pid && f.tile === t.id && f.fresh);
        if (!f) { f = { id: 'f' + s.seq++, owner: pid, tile: t.id, ships: {}, mp: 0, acted: false, fresh: true }; s.fleets.push(f); }
        f.ships[type] = (f.ships[type] || 0) + n;
        p.flags.shipsBuilt[t.id] = (p.flags.shipsBuilt[t.id] || 0) + n; p.flags.ship = true;
        addLog(s, `⚓ ${t.name} 조선소에서 ${SHIPS[type].ko} ${n}척 생산`, [pid]);
        return { fleet: f.id };
      }

      case 'move': {
        const f = getFleet(s, pid, a.fleet), to = tileOf(a.to).id;
        if (to === f.tile) fail('이미 그 위치에 있습니다');
        if (f.acted) fail('전투를 치른 함대는 이번 턴에 더 움직일 수 없습니다');
        const P = findPath(s, pid, f.tile, to);
        if (!P) fail('그곳으로 가는 길이 없습니다');
        if (P.cost > f.mp) fail(`이동력이 부족합니다 (필요 ${P.cost}, 남은 이동력 ${f.mp})`);
        const dest = s.tiles[to];
        const hostile = hostileFleetsAt(s, pid, to);
        const destOwnerRel = dest.owner && dest.owner !== pid ? rel(s, pid, dest.owner) : null;
        if (destOwnerRel === 'nap') fail('불가침 협정을 맺은 제국의 영토에는 들어갈 수 없습니다');
        for (const hf of hostile) {
          if (hf.owner === 'pirate') continue;
          const r = rel(s, pid, hf.owner);
          if (r === 'nap') fail('불가침 협정 상대의 함대가 있는 칸에는 들어갈 수 없습니다');
          if (r === 'neutral' && !a.attack) fail('다른 제국의 함대가 있습니다. 공격(전쟁 선포)을 확인해야 들어갈 수 있습니다');
        }
        f.tile = to; f.mp -= P.cost; f.fresh = false;
        for (const id of P.path) for (const v of within(s, id, f.ships.scout ? 2 : 1)) p.explored[v] = 1;
        refreshVision(s, pid);
        p.flags.move = true;
        let battle = null;
        if (hostile.length) battle = resolveAttack(s, pid, f, true);
        return { path: P.path, battle };
      }

      case 'attack': {
        const f = getFleet(s, pid, a.fleet);
        if (f.acted) fail('이 함대는 이번 턴에 이미 전투했습니다');
        if (!Object.entries(f.ships).some(([k, n]) => n > 0 && SHIPS[k].atk > 0)) fail('전투 함선이 없습니다');
        p.flags.move = true;
        return { battle: resolveAttack(s, pid, f, false) };
      }

      case 'colonize': {
        const f = getFleet(s, pid, a.fleet), t = s.tiles[f.tile];
        if (!TYPES[t.type].planet) fail('식민할 수 있는 행성이 아닙니다');
        if (t.owner) fail(t.owner === pid ? '이미 내 행성입니다' : '다른 제국의 행성은 공격해서 점령해야 합니다');
        if (t.garrison > 0) fail('중립 수비대가 있습니다. 먼저 공격하세요');
        if (hostileFleetsAt(s, pid, t.id).length) fail('적 함대가 있어 식민할 수 없습니다');
        if (!f.ships.transport) fail('수송선이 필요합니다');
        pay(p, { credits: 40, metal: 20 }, 1, '식민');
        captureTile(s, pid, t, f); p.flags.move = true;
        refreshVision(s, pid); checkVictory(s);
        return { tile: t.id };
      }

      case 'split': {
        const f = getFleet(s, pid, a.fleet), take = cleanShips(a.ships);
        if (!sumShips(take)) fail('나눌 함선을 고르세요');
        for (const [k, n] of Object.entries(take)) if ((f.ships[k] || 0) < n) fail('보유한 것보다 많이 나눌 수 없습니다');
        if (sumShips(take) >= sumShips(f.ships)) fail('원래 함대에 최소 1척은 남겨야 합니다');
        for (const [k, n] of Object.entries(take)) f.ships[k] -= n;
        const nf = { id: 'f' + s.seq++, owner: pid, tile: f.tile, ships: take, mp: f.mp, acted: f.acted, fresh: f.fresh, surveyed: f.surveyed };
        s.fleets.push(nf); cleanupFleets(s);
        // 분리 후 이동력은 각 함대 구성 기준으로 다시 제한
        return { fleet: nf.id };
      }

      case 'merge': {
        const t = tileOf(a.tile);
        const mine = s.fleets.filter(f => f.owner === pid && f.tile === t.id);
        if (mine.length < 2) fail('합칠 함대가 2개 이상 있어야 합니다');
        const base = mine[0];
        for (const f of mine.slice(1)) {
          for (const [k, n] of Object.entries(f.ships)) base.ships[k] = (base.ships[k] || 0) + n;
          base.mp = Math.min(base.mp, f.mp); base.acted = base.acted || f.acted; base.surveyed = base.surveyed || f.surveyed; f.ships = {};
        }
        base.fresh = false;
        cleanupFleets(s);
        return { fleet: base.id };
      }

      case 'disband': {
        const f = getFleet(s, pid, a.fleet);
        s.fleets = s.fleets.filter(x => x !== f);
        addLog(s, `함대 해산 (${s.tiles[f.tile].name})`, [pid]);
        return {};
      }

      case 'survey': { const f = getFleet(s, pid, a.fleet); return { survey: survey(s, pid, f) }; }

      case 'scan': {
        const t = tileOf(a.tile);
        if (p.flags.scan) fail('장거리 스캔은 턴마다 1번만 할 수 있습니다');
        const mineT = s.tiles.filter(x => x.owner === pid);
        if (!mineT.some(x => dist(s, x.id, t.id) <= 4)) fail('내 행성에서 4칸 이내 지역만 스캔할 수 있습니다');
        const cost = has(s, pid, 'sci2') ? 15 : 30;
        pay(p, { energy: cost }, 1, '장거리 스캔');
        const ids = within(s, t.id, 2); for (const id of ids) p.explored[id] = 1;
        p.flags.scan = true; p.flags.move = true;
        const found = ids.filter(id => s.tiles[id].site && !s.tiles[id].surveyed).length;
        addLog(s, `📡 ${t.name} 주변 장거리 스캔 완료 — 조사할 신호 ${found}곳`, [pid]);
        return { revealed: ids, signals: found };
      }

      case 'research': {
        const k = String(a.tech), T = TECHS[k];
        if (!T) fail('알 수 없는 기술');
        if (p.research.done.includes(k)) fail('이미 완료한 기술입니다');
        if (p.research.cur) fail(`이미 [${TECHS[p.research.cur].ko}]을(를) 연구 중입니다`);
        const miss = T.req.filter(r => !p.research.done.includes(r));
        if (miss.length) fail('선행 기술이 필요합니다: ' + miss.map(r => TECHS[r].ko).join(', '));
        pay(p, T.cost, 1, T.ko);
        p.research.cur = k; p.research.prog = Math.max(0, p.research.prog);
        addLog(s, `🔬 [${T.ko}] 연구를 시작했습니다.`, [pid]);
        return { tech: k };
      }

      case 'market': {
        const res = String(a.res), side = a.side === 'buy' ? 'buy' : 'sell', amt = int(a.amt, 1, 100000);
        const price = marketPrice(s, pid, res, side); if (price == null) fail('거래할 수 없는 자원');
        if (side === 'sell') {
          if (p.res[res] < amt) fail(`${RES_KO[res]}이(가) 부족합니다`);
          const gain = Math.floor(amt * price); if (gain < 1) fail('거래량이 너무 적습니다');
          p.res[res] -= amt; p.res.credits += gain;
          p.flags.dip = true; return { gain };
        } else {
          const costC = Math.ceil(amt * price);
          if (p.res.credits < costC) fail(`크레딧이 부족합니다 (필요 ${costC})`);
          p.res.credits -= costC; p.res[res] += amt;
          p.flags.dip = true; return { cost: costC };
        }
      }

      case 'capital': {
        const t = tileOf(a.tile);
        if (p.capital != null) fail('이미 수도가 있습니다');
        if (t.owner !== pid) fail('내 행성이어야 합니다');
        if (TYPES[t.type].outpost) fail('전초기지는 수도가 될 수 없습니다');
        pay(p, { credits: 200, metal: 100 }, 1, '수도 이전');
        t.capital = true; p.capital = t.id; p.capitalLostRound = null;
        addLog(s, `★ ${p.empire}이(가) ${t.name}을(를) 새 수도로 정했습니다.`);
        return {};
      }

      case 'dip_propose': {
        const to = String(a.to), q = s.players[to], kind = String(a.kind);
        if (!q || to === pid) fail('잘못된 상대');
        if (!q.alive) fail('멸망한 제국입니다');
        const r = rel(s, pid, to);
        if (!['alliance', 'nap', 'peace', 'trade'].includes(kind)) fail('알 수 없는 제안');
        if (kind === 'alliance' && r === 'alliance') fail('이미 동맹입니다');
        if (kind === 'alliance' && r === 'war') fail('전쟁 중에는 먼저 평화 협정을 맺어야 합니다');
        if (kind === 'nap' && r !== 'neutral') fail('중립 관계에서만 불가침 협정을 제안할 수 있습니다');
        if (kind === 'peace' && r !== 'war') fail('전쟁 중일 때만 평화를 제안할 수 있습니다');
        const give = cleanRes(a.give), get = cleanRes(a.get);
        if (kind === 'trade') {
          if (!Object.keys(give).length && !Object.keys(get).length) fail('거래할 자원을 정하세요');
          if (!canPay(p.res, give)) fail('제안한 자원을 보유하고 있지 않습니다');
        }
        if (s.proposals.some(x => x.from === pid && x.to === to && x.kind === kind)) fail('같은 제안이 이미 대기 중입니다');
        const pr = { id: 'p' + s.seq++, from: pid, to, kind, give, get, text: str(a.text, 120), round: s.round };
        s.proposals.push(pr); p.flags.dip = true;
        const K = { alliance: '동맹', nap: '불가침 협정', peace: '평화 협정', trade: '자원 거래' }[kind];
        addLog(s, `✉ ${p.empire} → ${q.empire}: ${K} 제안`, [pid, to]);
        if (q.bot) aiRespondOne(s, to, pr);
        return { proposal: pr.id };
      }

      case 'dip_respond': {
        const pr = s.proposals.find(x => x.id === a.id);
        if (!pr) fail('제안을 찾을 수 없습니다 (만료되었을 수 있어요)');
        if (pr.to !== pid) fail('나에게 온 제안이 아닙니다');
        return applyResponse(s, pr, !!a.accept);
      }

      case 'dip_break': {
        const to = String(a.to); if (!s.players[to] || to === pid) fail('잘못된 상대');
        const R = s.rel[relKey(pid, to)];
        if (!R || (R.s !== 'alliance' && R.s !== 'nap')) fail('해제할 협정이 없습니다');
        if (s.round - R.since < 3) fail(`협정 체결 후 3라운드가 지나야 해제할 수 있습니다 (${3 - (s.round - R.since)}라운드 남음)`);
        const was = R.s;
        setRel(s, pid, to, 'neutral'); p.flags.dip = true;
        addLog(s, `💔 ${p.empire}이(가) ${s.players[to].empire}와(과)의 ${was === 'alliance' ? '동맹' : '불가침 협정'}을 해제했습니다.`);
        return {};
      }

      case 'dip_war': {
        const to = String(a.to); if (!s.players[to] || to === pid) fail('잘못된 상대');
        const r = rel(s, pid, to);
        if (r === 'war') fail('이미 전쟁 중입니다');
        if (r !== 'neutral') fail('동맹/불가침 협정을 먼저 해제해야 합니다');
        setRel(s, pid, to, 'war'); p.flags.dip = true;
        addLog(s, `⚔ ${p.empire}이(가) ${s.players[to].empire}에게 전쟁을 선포했습니다!`);
        return {};
      }

      case 'msg': {
        const to = a.to === 'all' ? 'all' : String(a.to), text = str(a.text, 200);
        if (!text) fail('내용을 입력하세요');
        if (to !== 'all' && !s.players[to]) fail('잘못된 상대');
        s.messages.push({ id: 'm' + s.seq++, from: pid, to, text, round: s.round, t: Date.now() });
        if (s.messages.length > 150) s.messages.splice(0, s.messages.length - 150);
        if (to !== 'all') p.flags.dip = p.flags.dip || s.order[s.turnIdx] === pid;
        return {};
      }
    }
    fail('알 수 없는 행동: ' + a.type);
  }

  function applyResponse(s, pr, accept) {
    s.proposals = s.proposals.filter(x => x !== pr);
    const A = s.players[pr.from], B = s.players[pr.to];
    const K = { alliance: '동맹', nap: '불가침 협정', peace: '평화 협정', trade: '자원 거래' }[pr.kind];
    if (!accept) { addLog(s, `✉ ${B.empire}이(가) ${A.empire}의 ${K} 제안을 거절했습니다.`, [pr.from, pr.to]); return { accepted: false }; }
    const r = rel(s, pr.from, pr.to);
    if (pr.kind === 'trade') {
      if (!canPay(A.res, pr.give)) fail(`${A.empire}이(가) 제안한 자원을 더 이상 보유하고 있지 않습니다`);
      if (!canPay(B.res, pr.get)) fail('요청받은 자원이 부족합니다');
      for (const [k, v] of Object.entries(pr.give)) { A.res[k] -= v; B.res[k] += v; }
      for (const [k, v] of Object.entries(pr.get)) { B.res[k] -= v; A.res[k] += v; }
    } else if (pr.kind === 'alliance') { if (r === 'war') fail('전쟁 중에는 동맹을 맺을 수 없습니다'); setRel(s, pr.from, pr.to, 'alliance'); }
    else if (pr.kind === 'nap') { if (r !== 'neutral') fail('현재 관계에서는 불가침 협정을 맺을 수 없습니다'); setRel(s, pr.from, pr.to, 'nap'); }
    else if (pr.kind === 'peace') { if (r !== 'war') fail('이미 전쟁 중이 아닙니다'); setRel(s, pr.from, pr.to, 'neutral'); }
    addLog(s, `🤝 ${A.empire}와(과) ${B.empire}의 ${K}이(가) 성립되었습니다.`, pr.kind === 'trade' ? [pr.from, pr.to] : null);
    return { accepted: true };
  }

  /* 원자적 실행: 복사본에 적용하고 성공하면 그 상태를 돌려줌 */
  function act(state, pid, action) {
    const s = clone(state);
    try {
      const info = doAction(s, pid, action);
      return { ok: true, state: s, info: info || {} };
    } catch (e) {
      if (e && e.gw) return { ok: false, err: e.message };
      return { ok: false, err: '처리 중 오류가 발생했습니다: ' + (e && e.message), crash: true };
    }
  }
  // 시간 초과 등으로 강제로 턴을 넘김
  function forceEndTurn(state) { const s = clone(state); addLog(s, `⏱ ${pname(s, s.order[s.turnIdx])}의 턴 시간이 끝났습니다.`); endTurn(s); return s; }

  /* ------------------------------------------------------------------
     10. 플레이어별 화면 정보 (안개·비공개 정보 필터)
     ------------------------------------------------------------------ */
  function view(s, pid) {
    const p = s.players[pid];
    const vis = p ? visibleSet(s, pid) : new Set(s.tiles.map(t => t.id));
    const allies = p ? s.order.filter(o => o !== pid && rel(s, pid, o) === 'alliance') : [];
    const known = t => !p || p.explored[t.id] || vis.has(t.id) || allies.some(o => s.players[o].explored[t.id]) || s.phase === 'ended';
    const tiles = s.tiles.map(t => {
      if (!known(t)) return { id: t.id, x: t.x, y: t.y, fog: 1 };
      const v = vis.has(t.id) || s.phase === 'ended' || t.owner === pid;
      const o = { id: t.id, x: t.x, y: t.y, type: t.type, name: t.name, grade: t.grade, size: t.size, special: t.special, owner: t.owner, capital: t.capital, surveyed: t.surveyed, vis: v ? 1 : 0 };
      if (v) { o.pop = t.pop; o.buildings = Object.assign({}, t.buildings); o.def = t.def; o.maxDef = maxDef(s, t); o.garrison = t.garrison; }
      else { o.buildings = {}; o.garrison = t.garrison > 0 ? -1 : 0; }
      return o;
    });
    const fleets = s.fleets.filter(f => f.owner === pid || vis.has(f.tile) || s.phase === 'ended').map(f => clone(f));
    const prog = victoryProgress(s);
    const players = {};
    for (const o of s.order) {
      const q = s.players[o];
      let planets = 0, pop = 0;
      for (const t of s.tiles) if (t.owner === o) { planets++; pop += t.pop; }
      players[o] = {
        pid: o, name: q.name, empire: q.empire, color: q.color, emblem: q.emblem, bot: q.bot, alive: q.alive, capital: q.capital != null && known(s.tiles[q.capital]) ? q.capital : (q.capital != null ? -1 : null),
        planets, pop, techs: q.research.done.length, military: militaryPower(s, o), score: prog[o].score, connected: q.connected !== false,
      };
      if (o === pid || s.phase === 'ended') { players[o].res = Object.assign({}, q.res); players[o].research = clone(q.research); players[o].flags = clone(q.flags); players[o].lastIncome = q.lastIncome; }
    }
    const relations = {};
    for (let i = 0; i < s.order.length; i++) for (let j = i + 1; j < s.order.length; j++) {
      const k = relKey(s.order[i], s.order[j]); relations[k] = s.rel[k] || { s: 'neutral', since: 0 };
    }
    const mine = x => !x.to || x.to.includes(pid);
    return {
      v: s.v, id: s.id, name: s.name, w: s.w, h: s.h, round: s.round, turnIdx: s.turnIdx, order: s.order.slice(), phase: s.phase,
      winner: s.winner, winReason: s.winReason, final: s.final || null, settings: clone(s.settings), turnStart: s.turnStart,
      me: pid, tiles, fleets, players, rel: relations, mods: clone(s.mods), lastEvent: s.lastEvent,
      proposals: s.proposals.filter(x => x.from === pid || x.to === pid).map(clone),
      messages: s.messages.filter(m => m.to === 'all' || m.to === pid || m.from === pid).slice(-80),
      log: s.log.filter(mine).slice(-80),
      battles: s.battles.filter(b => b.attacker === pid || b.defender === pid || vis.has(b.tile)).slice(-15),
      victory: prog, totalPlanets: colonizableCount(s), stats: s.stats,
      econ: p ? economy(s, pid) : null, bonus: p ? bonus(s, pid) : null,
    };
  }

  /* ------------------------------------------------------------------
     11. AI
     ------------------------------------------------------------------ */
  function aiRespondOne(s, pid, pr) {
    const me = s.players[pid], them = s.players[pr.from];
    const myPow = militaryPower(s, pid) + 1, theirPow = militaryPower(s, pr.from) + 1;
    let ok = false;
    if (pr.kind === 'peace') ok = myPow < theirPow * 1.3 || Math.random() < 0.4;
    else if (pr.kind === 'nap') ok = theirPow > myPow * 0.7 || Math.random() < 0.5;
    else if (pr.kind === 'alliance') ok = s.round >= 3 && Math.random() < 0.55;
    else if (pr.kind === 'trade') {
      const val = o => Object.entries(o).reduce((a, [k, v]) => a + v * ({ metal: 1, energy: 1, credits: 1, crystal: 3, food: 0.6 }[k]), 0);
      ok = val(pr.give) >= val(pr.get) * 0.95 && canPay(me.res, pr.get);
    }
    try { applyResponse(s, pr, ok); } catch (e) { if (!e.gw) throw e; }
    void them;
  }

  function aiPlay(state, pid) {
    let s = clone(state);
    const tryA = a => { const r = act(s, pid, a); if (r.ok) { s = r.state; return r.info; } return null; };
    const p = () => s.players[pid];
    if (!p() || !p().alive || s.order[s.turnIdx] !== pid || s.phase !== 'playing') return s;

    // 0) 받은 제안 응답
    for (const pr of s.proposals.filter(x => x.to === pid)) { aiRespondOne(s, pid, pr); }

    // 1) 연구
    if (!p().research.cur) {
      const order = ['sci1', 'eco1', 'mil1', 'eco2', 'sci2', 'mil2', 'sci3', 'eco3', 'mil3', 'sp1', 'sp3', 'sp2', 'final'];
      for (const k of order) if (!p().research.done.includes(k) && TECHS[k].req.every(r => p().research.done.includes(r))) { if (tryA({ type: 'research', tech: k })) break; }
    }

    // 2) 시장: 넘치는 자원 판매 / 부족한 식량 구입
    const R = p().res;
    if (R.food < 10 && (p().lastIncome || {}).food < 0) tryA({ type: 'market', res: 'food', side: 'buy', amt: 30 });
    for (const r of ['metal', 'energy']) if (R[r] > 600) tryA({ type: 'market', res: r, side: 'sell', amt: R[r] - 450 });
    if (R.crystal > 250) tryA({ type: 'market', res: 'crystal', side: 'sell', amt: R.crystal - 180 });
    if (R.credits > 350 && R.metal < 200) tryA({ type: 'market', res: 'metal', side: 'buy', amt: Math.floor((R.credits - 250) / 1.6) });

    const myTiles = () => s.tiles.filter(t => t.owner === pid);
    const aiShips = () => {
    const eco = economy(s, pid);
    const transports = () => s.fleets.filter(f => f.owner === pid).reduce((a, f) => a + (f.ships.transport || 0), 0);
    const freePlanets = s.tiles.filter(t => TYPES[t.type].planet && !t.owner && p().explored[t.id]).length;
    for (const t of myTiles().filter(t => t.buildings.shipyard)) {
      const y = t.buildings.shipyard;
      for (let i = 0; i < y * 2; i++) {
        let type;
        if (transports() < Math.min(3, 1 + Math.floor(freePlanets / 3))) type = 'transport';
        else if (eco.net.credits < 0 && s.round > 3) break;
        else type = y >= 3 && p().res.crystal > 40 ? pick(['battleship', 'carrier', 'cruiser']) : y >= 2 ? pick(['destroyer', 'cruiser', 'destroyer']) : pick(['fighter', 'corvette', 'corvette']);
        const c = SHIPS[type].cost;
        const ok = Object.entries(c).every(([r, v]) => p().res[r] - v >= (r === 'metal' || r === 'credits' ? 30 : 0));
        if (!ok) break;
        if (!tryA({ type: 'ship', tile: t.id, ship: type, n: 1 })) break;
      }
    }

    };
    const wantMil = 40 + s.round * 14;
    if (militaryPower(s, pid) < wantMil) aiShips();
    // 3) 건설
    const reserve = { metal: 40, credits: 40 };
    const prefer = t => {
      if (t.capital) return ['shipyard', 'slab', 'mine', 'power', 'trade', 'defense', 'mlab', 'elab', 'refinery', 'orbital'];
      const base = { terran: ['trade', 'slab', 'mine', 'defense'], gas: ['power', 'elab', 'defense'], ice: ['refinery', 'slab', 'power'], volcanic: ['mine', 'shipyard', 'defense'], desert: ['mine', 'power', 'trade'], ruins: ['alab', 'slab', 'refinery'], asteroid: ['mine', 'defense'] }[t.type] || ['mine'];
      return base;
    };
    for (const t of myTiles().sort((a, b) => (b.capital ? 1 : 0) - (a.capital ? 1 : 0))) {
      for (const k of prefer(t)) {
        if (buildCheck(s, pid, t, k)) continue;
        const c = buildCost(s, pid, k, (t.buildings[k] || 0) + 1);
        const after = Object.assign({}, p().res); for (const [r, v] of Object.entries(c)) after[r] -= v;
        if (after.metal < reserve.metal || after.credits < reserve.credits || Object.values(after).some(v => v < 0)) continue;
        if (k === 'shipyard' && myTiles().filter(x => x.buildings.shipyard).length >= 2 + Math.floor(myTiles().length / 5)) continue;
        if (tryA({ type: 'build', tile: t.id, b: k })) break;
      }
    }

    // 5) 외교: 약한 이웃에게 전쟁 선포, 강한 이웃에게 불가침 제안
    const myPow = militaryPower(s, pid);
    for (const o of s.order) {
      if (o === pid || !s.players[o].alive) continue;
      const r = rel(s, pid, o), op = militaryPower(s, o);
      if (r === 'neutral' && s.round >= 6 && myPow > op * 1.5 && myPow > 60 && Math.random() < 0.35) tryA({ type: 'dip_war', to: o });
      else if (r === 'neutral' && op > myPow * 1.6 && Math.random() < 0.2 && !s.proposals.some(x => x.from === pid && x.to === o)) tryA({ type: 'dip_propose', to: o, kind: 'nap' });
      else if (r === 'war' && op > myPow * 1.4 && Math.random() < 0.3 && !s.proposals.some(x => x.from === pid && x.to === o)) tryA({ type: 'dip_propose', to: o, kind: 'peace' });
    }

    // 6) 함대 운용
    for (let guard = 0; guard < 3; guard++) {
      // 같은 칸의 내 함대 합치기 (조선소)
      const groups = {};
      for (const f of s.fleets) if (f.owner === pid) (groups[f.tile] = groups[f.tile] || []).push(f);
      for (const [tile, fs] of Object.entries(groups)) if (fs.length > 1 && s.tiles[tile].owner === pid) tryA({ type: 'merge', tile: Number(tile) });
    }
    // 수송선 분리: 전투함과 함께 있는 수송선 중 1척 빼고 나머지는 식민 함대로
    for (const f of s.fleets.filter(f => f.owner === pid && f.mp > 0)) {
      const war = sumShips(f.ships) - (f.ships.transport || 0) - (f.ships.scout || 0);
      if (f.ships.scout && sumShips(f.ships) > f.ships.scout) tryA({ type: 'split', fleet: f.id, ships: { scout: f.ships.scout } });
      const ff = s.fleets.find(x => x.id === f.id); if (!ff) continue;
      const extra = (ff.ships.transport || 0) - (war > 0 ? 1 : 0);
      for (let i = 0; i < extra; i++) { const cur = s.fleets.find(x => x.id === f.id); if (!cur || sumShips(cur.ships) <= 1) break; tryA({ type: 'split', fleet: f.id, ships: { transport: 1 } }); }
    }

    const targeted = new Set();
    const fleetIds = s.fleets.filter(f => f.owner === pid).map(f => f.id);
    for (const fid of fleetIds) {
      let f = s.fleets.find(x => x.id === fid); if (!f) continue;
      const t = s.tiles[f.tile];
      const isScout = sumShips(f.ships) === (f.ships.scout || 0);
      const isColony = sumShips(f.ships) === (f.ships.transport || 0);
      const power = fleetPower(f.ships, bonus(s, pid));
      // 현재 칸에서 할 일
      if (!t.surveyed && t.site && !hostileFleetsAt(s, pid, t.id).length && (isScout || Math.random() < 0.5)) { tryA({ type: 'survey', fleet: fid }); continue; }
      if (f.ships.transport && TYPES[t.type].planet && !t.owner && !t.garrison && !hostileFleetsAt(s, pid, t.id).length) { if (tryA({ type: 'colonize', fleet: fid })) continue; }
      const D = defenderSetup(s, pid, t.id);
      if (D && !isColony && !isScout && !f.acted) {
        const okRel = D.owner === 'pirate' || D.owner === 'neutral' || rel(s, pid, D.owner) === 'war';
        if (okRel && estimateWin({ ships: f.ships, mods: sideMods(s, pid, t.id, false) }, D, 40) > 0.6) { tryA({ type: 'attack', fleet: fid }); continue; }
      }
      f = s.fleets.find(x => x.id === fid); if (!f || f.mp <= 0) continue;
      // 목표 고르기
      let best = null, bestScore = -Infinity;
      for (const c of s.tiles) {
        if (c.id === f.tile || targeted.has(c.id + ':' + (isColony ? 'c' : 'w'))) continue;
        const d = dist(s, f.tile, c.id); let sc = -Infinity;
        if (isScout) {
          if (!p().explored[c.id]) sc = 6 - d;
          else if (c.site && !c.surveyed) sc = 8 - d;
        } else if (isColony) {
          if (TYPES[c.type].planet && !c.owner && !c.garrison && p().explored[c.id] && !hostileFleetsAt(s, pid, c.id).length) sc = 10 + c.grade * 2 - d * 2;
        } else {
          if (!p().explored[c.id]) continue;
          const DD = defenderSetup(s, pid, c.id);
          if (DD && (DD.owner === 'neutral' || DD.owner === 'pirate' || rel(s, pid, DD.owner) === 'war')) {
            const enemyPow = fleetPower(DD.ships, DD.mods) + DD.planet;
            if (power > enemyPow * 1.4) sc = 12 + (c.owner ? 6 : 0) + c.grade * 2 - d * 2 + (c.capital ? 8 : 0);
          } else if (c.site && !c.surveyed && !DD) sc = 3 - d;
        }
        if (sc > bestScore) { bestScore = sc; best = c; }
      }
      if (!best || bestScore === -Infinity) {
        // 방어: 수도로 복귀
        if (!isScout && !isColony && p().capital != null && f.tile !== p().capital) best = s.tiles[p().capital]; else continue;
      }
      targeted.add(best.id + ':' + (isColony ? 'c' : 'w'));
      const P = findPath(s, pid, f.tile, best.id); if (!P) continue;
      // 이동력 안에서 갈 수 있는 가장 먼 칸
      let acc = 0, stop = null;
      for (let i = 1; i < P.path.length; i++) {
        acc += enterCost(s, pid, s.tiles[P.path[i]]);
        if (acc > f.mp) break;
        const id = P.path[i];
        const hf = hostileFleetsAt(s, pid, id);
        if (hf.length) {
          const okRel = hf.every(x => x.owner === 'pirate' || rel(s, pid, x.owner) === 'war');
          if (okRel && !isColony && !isScout && i === P.path.length - 1) stop = id;
          break;
        }
        const own = s.tiles[id].owner;
        if (own && own !== pid && rel(s, pid, own) === 'nap') break;
        stop = id;
      }
      if (stop != null) {
        const info = tryA({ type: 'move', fleet: fid, to: stop, attack: true });
        const nf = info && s.fleets.find(x => x.id === fid);
        if (nf) {
          const nt = s.tiles[nf.tile];
          if (nf.ships.transport && TYPES[nt.type].planet && !nt.owner && !nt.garrison && !hostileFleetsAt(s, pid, nt.id).length) tryA({ type: 'colonize', fleet: fid });
          else if (!nf.acted && !isColony && !isScout) {
            const DD = defenderSetup(s, pid, nt.id);
            if (DD && (DD.owner === 'neutral' || DD.owner === 'pirate' || rel(s, pid, DD.owner) === 'war') && estimateWin({ ships: nf.ships, mods: sideMods(s, pid, nt.id, false) }, DD, 40) > 0.6) tryA({ type: 'attack', fleet: fid });
          }
        }
      }
    }
    // 7) 함선 생산 (이동 후에 생산해서 새 함선이 다음 턴에 합류)
    aiShips();
    // 수도 상실 시 새 수도
    if (p() && p().alive && p().capital == null) {
      const c = myTiles().filter(t => !TYPES[t.type].outpost).sort((a, b) => b.size - a.size)[0];
      if (c) tryA({ type: 'capital', tile: c.id });
    }
    if (s.phase === 'playing' && s.order[s.turnIdx] === pid) tryA({ type: 'end_turn' });
    return s;
  }

  return {
    RES, RES_KO, RES_ICON, TYPES, PLANET_TYPES, GRADES, SPECIALS, BUILDINGS, BCAT_KO, SHIPS, SHIP_ORDER, TECHS, TECH_FIELDS, MAP_SIZES, SPEEDS, EMBLEMS, COLORS, EVENTS,
    newGame, act, view, aiPlay, forceEndTurn, neighbors, dist, within, findPath, reachable, fleetMove, economy, bonus, score, assets, militaryPower, fleetPower,
    victoryProgress, buildCheck, buildCost, shipCheck, marketPrice, defenderSetup, sideMods, estimateWin, simulateBattle, rel, relKey, maxPop, maxDef, slots,
    hostileFleetsAt, sumShips, clone, enterCost, planetProd, cleanRes,
  };
});
