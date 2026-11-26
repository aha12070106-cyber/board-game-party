/* 월드 트레이드: 게임 데이터 (자원, 상품, 국가, 발전 항목, 이벤트) */
(typeof window !== "undefined" ? window : globalThis).WT_DATA = (() => {
  const RES = {
    wood:   { n: '나무', g: '木', c: '#9a7448', p: 12 },
    iron:   { n: '철',   g: '鐵', c: '#8794a3', p: 18 },
    gold:   { n: '금',   g: '金', c: '#d8b04a', p: 60 },
    coal:   { n: '석탄', g: '炭', c: '#5d636d', p: 14 },
    food:   { n: '식량', g: '食', c: '#8fb35e', p: 10 },
    oil:    { n: '석유', g: '油', c: '#6b6290', p: 30 },
    cotton: { n: '면화', g: '綿', c: '#cfc6b2', p: 15 },
    rubber: { n: '고무', g: '膠', c: '#5f8a66', p: 22 },
    gems:   { n: '보석', g: '寶', c: '#c065b6', p: 75 },
    copper: { n: '구리', g: '銅', c: '#c97f4f', p: 24 },
  };
  // t: 생산 시간(라운드), tier: 시장 규모 구분, req: 해금 조건
  const GOODS = {
    lumber:      { n: '목재',     g: '材', c: '#b88a55', p: 32,   t: 1, tier: 1, in: { wood: 2 } },
    steel:       { n: '철강',     g: '鋼', c: '#9fb0c2', p: 72,   t: 2, tier: 1, in: { iron: 2, coal: 1 } },
    cloth:       { n: '옷감',     g: '布', c: '#e2d6bb', p: 42,   t: 1, tier: 1, in: { cotton: 2 } },
    meal:        { n: '가공식품', g: '糧', c: '#a9c46d', p: 40,   t: 1, tier: 1, in: { food: 3 } },
    fuel:        { n: '연료',     g: '燃', c: '#8e7fc2', p: 76,   t: 1, tier: 1, in: { oil: 2 } },
    wire:        { n: '전선',     g: '線', c: '#de9663', p: 88,   t: 1, tier: 2, in: { copper: 2, rubber: 1 }, req: { industry: 2 } },
    tools:       { n: '공구',     g: '具', c: '#a7a196', p: 124,  t: 1, tier: 2, in: { steel: 1, lumber: 1 }, req: { industry: 2 } },
    furniture:   { n: '가구',     g: '家', c: '#c79a63', p: 134,  t: 2, tier: 2, in: { lumber: 2, cloth: 1 }, req: { industry: 2 } },
    jewelry:     { n: '장신구',   g: '飾', c: '#e0a6d6', p: 186,  t: 2, tier: 2, in: { gold: 1, gems: 1 }, req: { tech: 2 } },
    tires:       { n: '타이어',   g: '輪', c: '#78967c', p: 146,  t: 2, tier: 2, in: { rubber: 2, steel: 1 }, req: { tech: 2 } },
    machinery:   { n: '기계',     g: '機', c: '#7fa3c9', p: 430,  t: 3, tier: 3, in: { steel: 2, tools: 1, fuel: 1 }, req: { industry: 3, tech: 3 } },
    electronics: { n: '전자제품', g: '電', c: '#6cc0c9', p: 410,  t: 3, tier: 3, in: { wire: 2, gold: 1, steel: 1 }, req: { tech: 4 } },
    vehicle:     { n: '자동차',   g: '車', c: '#e7c36a', p: 1560, t: 4, tier: 3, in: { machinery: 1, tires: 2, fuel: 1, electronics: 1 }, req: { industry: 5, tech: 5 } },
  };

  const TRACKS = {
    industry:    { n: '산업',     g: '工', d: '생산 라인과 한 번에 만드는 양이 늘고, 고급 공장이 열려요.' },
    economy:     { n: '경제',     g: '經', d: '매 라운드 세금 수입이 늘어요.' },
    tech:        { n: '기술',     g: '技', d: '광물 생산량이 늘고, 생산 시간이 줄고, 첨단 상품이 열려요.' },
    agriculture: { n: '농업',     g: '農', d: '식량·면화·고무·나무 생산량이 늘어요.' },
    trade:       { n: '무역 규모', g: '貿', d: '시장 수수료가 낮아지고, 라운드당 무역 제안 횟수가 늘어요.' },
  };

  // 다음 레벨로 올리는 비용 (L = 현재 레벨)
  const DEV_COST = {
    industry:    [null, { money: 300, items: { wood: 6, iron: 4 } }, { money: 600, items: { lumber: 4, steel: 3 } }, { money: 1000, items: { steel: 6, tools: 2 } }, { money: 1600, items: { tools: 4, machinery: 1 } }],
    economy:     [null, { money: 400, items: { gold: 1, food: 6 } }, { money: 800, items: { gold: 2, cloth: 3 } }, { money: 1300, items: { jewelry: 1, gold: 3 } }, { money: 2000, items: { jewelry: 3, furniture: 2 } }],
    tech:        [null, { money: 350, items: { copper: 4, iron: 2 } }, { money: 700, items: { wire: 3, steel: 2 } }, { money: 1200, items: { wire: 4, tools: 2, gold: 2 } }, { money: 1800, items: { electronics: 2, machinery: 1 } }],
    agriculture: [null, { money: 250, items: { wood: 5, food: 6 } }, { money: 500, items: { lumber: 3, tools: 1 } }, { money: 900, items: { tools: 2, fuel: 3 } }, { money: 1400, items: { machinery: 1, fuel: 4 } }],
    trade:       [null, { money: 300, items: { wood: 4, food: 4 } }, { money: 600, items: { lumber: 3, cloth: 3 } }, { money: 1000, items: { fuel: 4, tires: 2 } }, { money: 1600, items: { tires: 3, electronics: 1 } }],
  };

  // 국가: yields = 라운드당 기본 자원 생산량
  const NATIONS = [
    { id: 'nordin', name: '노르딘 연방', en: 'Nordin Federation', color: '#6f9be0', x: 190, y: 120,
      blurb: '끝없는 침엽수림과 오래된 광산의 나라. 땅은 차갑고 식량은 늘 모자라요.',
      yields: { wood: 8, iron: 5, coal: 4, copper: 2, food: 2 }, stock: { wood: 14, iron: 8, coal: 6, food: 8 },
      money: 1200, levels: { industry: 2 }, prio: ['industry', 'tech', 'economy', 'trade', 'agriculture'],
      trait: { id: 'forge', n: '대장간의 전통', d: '산업 발전 비용 20% 할인' } },
    { id: 'sahar', name: '사하르 토후국', en: 'Sahar Emirate', color: '#e0a24f', x: 560, y: 255,
      blurb: '사막 아래 석유와 금이 잠든 나라. 돈은 넘치지만 물과 숲이 귀해요.',
      yields: { oil: 8, gold: 2, gems: 1, food: 1, cotton: 1 }, stock: { oil: 12, gold: 3, food: 6 },
      money: 2000, levels: {}, prio: ['trade', 'economy', 'industry', 'tech', 'agriculture'],
      trait: { id: 'bazaar', n: '대상인의 시장', d: '세계 시장 수수료 3%p 감면' } },
    { id: 'aurel', name: '아우렐 공국', en: 'Aurel Principality', color: '#d8c35a', x: 340, y: 255,
      blurb: '금과 보석을 캐는 산악 공국. 은행가들이 세계의 돈줄을 쥐고 있어요.',
      yields: { gold: 3, gems: 3, copper: 4, iron: 2, food: 2, wood: 1 }, stock: { gold: 4, gems: 3, copper: 5, food: 7 },
      money: 1500, levels: { economy: 2 }, prio: ['economy', 'tech', 'trade', 'industry', 'agriculture'],
      trait: { id: 'bank', n: '공국 은행', d: '세금 수입 30% 증가' } },
    { id: 'verdan', name: '베르단 공화국', en: 'Verdan Republic', color: '#7cc07a', x: 215, y: 370,
      blurb: '비옥한 평야의 곡창지대. 먹을 것은 넘치지만 쇠붙이가 귀해요.',
      yields: { food: 10, cotton: 6, wood: 3, rubber: 1 }, stock: { food: 20, cotton: 8, wood: 6 },
      money: 1000, levels: { agriculture: 2 }, prio: ['agriculture', 'trade', 'economy', 'industry', 'tech'],
      trait: { id: 'granary', n: '국가 곡창', d: '식량 소비 30% 감소' } },
    { id: 'marea', name: '마레아 제도', en: 'Marea Isles', color: '#4fc0c4', x: 845, y: 305,
      blurb: '열대 바다의 섬나라. 고무 농장과 진주, 그리고 모두와 친한 항구가 있어요.',
      yields: { rubber: 6, food: 5, gems: 2, wood: 3, cotton: 2, oil: 1 }, stock: { rubber: 8, food: 10, wood: 4 },
      money: 1100, levels: { trade: 2 }, prio: ['trade', 'agriculture', 'economy', 'tech', 'industry'],
      trait: { id: 'diplomat', n: '항구의 외교관', d: '모든 국가와 우호 관계로 시작, 협상이 쉬워요' } },
    { id: 'caldera', name: '칼데라 왕국', en: 'Caldera Kingdom', color: '#d06a55', x: 430, y: 95,
      blurb: '화산 지대 위의 공업국. 석탄과 철이 쏟아지지만 밭은 척박해요.',
      yields: { coal: 8, iron: 6, copper: 3, gold: 1, food: 2 }, stock: { coal: 12, iron: 10, food: 7 },
      money: 1100, levels: { industry: 2 }, prio: ['industry', 'tech', 'trade', 'economy', 'agriculture'],
      trait: { id: 'mines', n: '화산 광맥', d: '철·석탄·구리 생산량 20% 증가' } },
    { id: 'solaris', name: '솔라리스 연합', en: 'Solaris Union', color: '#e7c95b', x: 700, y: 390,
      blurb: '남쪽 해안의 신흥 연합. 면화와 석유, 고무가 고루 나요.',
      yields: { cotton: 5, oil: 4, rubber: 3, food: 4, copper: 1 }, stock: { cotton: 6, oil: 6, rubber: 4, food: 8 },
      money: 1200, levels: {}, prio: ['industry', 'trade', 'tech', 'economy', 'agriculture'],
      trait: { id: 'loom', n: '연합 방직소', d: '옷감·연료·타이어를 만들 때 1개씩 더 나와요' } },
    { id: 'argenta', name: '아르젠타', en: 'Argenta', color: '#a98fe0', x: 760, y: 135,
      blurb: '학자와 기술자의 도시국가. 자원은 고루 조금씩, 머리는 넉넉하게.',
      yields: { food: 3, wood: 3, iron: 2, copper: 2, coal: 2, cotton: 2, oil: 1, gold: 1 }, stock: { food: 8, wood: 5, iron: 4, copper: 3 },
      money: 1600, levels: { tech: 2 }, prio: ['tech', 'industry', 'economy', 'trade', 'agriculture'],
      trait: { id: 'academy', n: '왕립 학술원', d: '기술 발전 비용 20% 할인' } },
  ];

  // 세계 사건: stock = 시장 재고 배율(즉시), target = 수요 배율(지속)
  const EVENTS = [
    { id: 'oilshock', n: '석유 파동', d: '산유국 분쟁으로 석유와 연료 공급이 끊겼어요.', stock: { oil: 0.45, fuel: 0.6 } },
    { id: 'harvest',  n: '대풍년', d: '세계 곳곳의 풍작으로 식량이 넘쳐나요.', stock: { food: 1.8, meal: 1.4 } },
    { id: 'boom',     n: '건설 붐', d: '도시 개발 열풍으로 목재와 철강 수요가 치솟아요.', target: { lumber: 1.5, steel: 1.5, wood: 1.3 }, rounds: 3 },
    { id: 'goldrush', n: '골드 러시', d: '새 금광이 발견되어 금이 쏟아져요.', stock: { gold: 1.7 } },
    { id: 'drought',  n: '대가뭄', d: '비가 오지 않아 식량과 면화가 귀해졌어요.', stock: { food: 0.55, cotton: 0.6 } },
    { id: 'techwave', n: '기술 혁신', d: '새로운 발명으로 전선과 전자제품 수요가 커졌어요.', target: { wire: 1.5, electronics: 1.6, copper: 1.3 }, rounds: 3 },
    { id: 'mine',     n: '광산 붕괴', d: '대형 광산 사고로 석탄과 철 공급이 줄었어요.', stock: { coal: 0.55, iron: 0.6 } },
    { id: 'fashion',  n: '사치품 열풍', d: '귀족들 사이에 장신구와 옷감이 유행이에요.', target: { jewelry: 1.5, cloth: 1.3, gems: 1.3 }, rounds: 3 },
    { id: 'blight',   n: '고무나무 병충해', d: '병충해가 고무 농장을 휩쓸었어요.', stock: { rubber: 0.5, tires: 0.7 } },
    { id: 'motor',    n: '자동차 시대', d: '자동차 수요가 폭발했어요. 기계와 타이어도 덩달아 귀해요.', target: { vehicle: 1.6, tires: 1.4, machinery: 1.3 }, rounds: 4 },
  ];

  const DIFF = {
    easy:   { n: '쉬움',   greed: 1.0,  yield: 0.85, skill: 0.45, d: 'AI가 느슨하게 협상하고 성장이 느려요.' },
    normal: { n: '보통',   greed: 1.1,  yield: 1.0,  skill: 0.8,  d: '공정한 상대. 처음 하는 분께 추천해요.' },
    hard:   { n: '어려움', greed: 1.22, yield: 1.15, skill: 1.0,  d: 'AI가 깐깐하게 흥정하고 빠르게 발전해요.' },
  };

  const PHASES = [
    { n: '자원 확인', s: '이번 라운드에 들어온 자원과 필요한 소비량을 확인해요.', tab: 'manage' },
    { n: '생산 활동', s: '자원을 가공해 더 비싼 상품을 만들어요.', tab: 'prod' },
    { n: '국가 간 무역', s: '다른 나라와 사고팔고 물물교환해요.', tab: 'trade' },
    { n: '시장 거래', s: '세계 시장에서 자원과 상품을 사고팔아요.', tab: 'market' },
    { n: '결과 정산', s: '생산 완료, 소비, 세금, 세계 사건을 정산해요.', tab: 'manage' },
  ];

  return { RES, GOODS, TRACKS, DEV_COST, NATIONS, EVENTS, DIFF, PHASES };
})();
if (typeof module !== "undefined") module.exports = globalThis.WT_DATA;
