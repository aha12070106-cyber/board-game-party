# GALACTIC WAR — 설계 문서

## 1. 전체 구조

```
브라우저 (galactic-war/ui.js)                 서버 (server.js + gw-server.js)
 ├─ 로비·방·싱글·도감·기록·설정 화면           ├─ HTTP: /galactic-war/ 정적 파일
 ├─ 지도(SVG 육각형) · 패널 · 모든 창           ├─ WebSocket /gw : 방 관리 + 게임 진행
 └─ 행동 "요청"만 보냄 ──── WebSocket ────▶    ├─ engine.act() 로 모든 행동 검증 후 적용
      ◀── 플레이어별 view (안개 필터) ───────    ├─ AI 턴, 턴 시간 제한, 끊긴 플레이어 처리
                                               └─ data/gw-state.json, gw-records.json 저장

galactic-war/engine.js  ← 서버와 브라우저가 같은 파일을 사용하는 규칙 엔진
  newGame · act(검증+적용, 원자적) · view(안개/비공개 필터) · aiPlay · forceEndTurn
```

- **권위 서버**: 게임 상태는 서버에만 있습니다. 클라이언트는 `{type:'build', tile, b}` 같은 행동만 보내고, 서버가 차례·소유권·자원·규칙을 모두 확인한 뒤 복사본에 적용하고 성공하면 커밋합니다. 자원·행성 소유권·전투 결과(서버 난수)는 클라이언트가 바꿀 수 없습니다.
- **정보 은닉**: 서버는 플레이어마다 `view()`로 만든 화면만 보냅니다. 탐험 안 한 칸은 좌표만, 시야 밖 함대는 아예 빠지고, 다른 제국의 자원·연구·제안·비밀 메시지는 포함되지 않습니다.
- **싱글 플레이**: 같은 엔진을 브라우저 안에서 로컬 서버처럼 사용하므로 서버 없이(GitHub Pages 포함) 동작합니다. 진행은 localStorage에 자동 저장됩니다.

### Firebase/Supabase 대신 자체 서버를 쓴 이유
요구 사항의 핵심은 "모든 중요한 행동을 서버에서 검증"입니다. Firebase/Supabase에서 이를 하려면 Cloud Functions/Edge Functions에 게임 엔진을 올려야 하고(유료 플랜·별도 프로젝트 키 필요), 클라이언트 직접 쓰기를 막는 보안 규칙도 따로 관리해야 합니다. 이 저장소에는 이미 Render에 배포되는 Node.js + WebSocket 서버가 있어서, 같은 서버에 권위 게임 서버를 붙이는 것이 가장 단순하고 확실합니다. 엔진은 순수 함수(`act(state, pid, action) → {ok, state}`)라서 나중에 Cloud Functions 등으로 옮기기도 쉽습니다.

## 2. 데이터 (저장 구조)

`data/gw-state.json`
```js
{
  idents: { [pid]: sha256(secret) },          // 접속 ID 소유 확인 (다른 사람이 ID를 사칭하지 못함)
  rooms: [{
    id: 'K7Q2M', name, host: pid, max: 2..4, isPublic, pwHash,   // 비밀번호는 해시만 저장
    settings: { mapSize, speed, victory: { conquest, conquestPct, economy, economyTarget, science, empire, roundLimit } },
    members: [{ pid, name, empire, color, emblem, bot, left }],
    status: 'lobby' | 'playing' | 'ended', chat: [...],
    game: GameState | null,
  }]
}
```

`GameState` (engine.js)
| 필드 | 내용 |
|---|---|
| `w, h, round, turnIdx, order[], phase, winner, winReason, turnStart` | 맵 크기, 라운드/턴, 진행 상태 |
| `settings` | 맵·속도·턴 제한 시간·승리 조건 |
| `players[pid]` | 이름, 제국, 색, 문장, `bot`, `alive`, `capital`, `res{metal,energy,credits,crystal,food}`, `research{done[],cur,prog}`, `explored[]`(영구 탐험 기록), `flags`(이번 턴 단계 진행) |
| `tiles[]` | `type`(10종), `name`, `grade`(0~4), `size`(1~3), `special`, `owner`, `capital`, `pop`, `buildings{key:level}`, `def`, `garrison`(중립 수비대), `site`(숨은 탐험 보상), `surveyed` |
| `fleets[]` | `id, owner(pid/'pirate'), tile, ships{type:count}, mp, acted, fresh, surveyed` |
| `rel{'a\|b'}` | `{ s: 'neutral'|'nap'|'alliance'|'war', since }` |
| `proposals[]` | `{ id, from, to, kind: alliance/nap/peace/trade, give, get, round }` |
| `messages[]`, `log[]`, `battles[]` | 외교 메시지, 기록(공개 범위 `to`), 전투 보고서 |
| `mods[]`, `lastEvent` | 진행 중인 우주 이벤트 효과 |

`data/gw-records.json` — 끝난 게임: 방 이름, 라운드, 승자, 승리 방식, 최종 순위.

저장은 변경 1.5초 뒤 임시 파일에 쓰고 이름을 바꾸는 방식(원자적)이며, 서버 종료 신호(SIGTERM)에도 즉시 저장합니다.

## 3. 통신 프로토콜 (WebSocket `/gw`)

클라이언트 → 서버: `hello{pid,secret,name}` · `rooms` · `records` · `create{name,max,isPublic,password,settings,empire}` · `join{id,password,empire}` · `quick{empire}` · `rejoin` · `leave` · `settings`(방장) · `empire` · `add_bot`/`kick`(방장) · `chat` · `start`(방장) · `act{a}` · `resync` · `save`

서버 → 클라이언트: `welcome{room}` · `rooms[]` · `room{...}` · `view{view, now}` · `res{req, ok, info|err}` · `err` · `left`

## 4. 턴 / 규칙 요약

1. 자원 생산(행성 생산 − 유지비, 식량 → 인구) 2. 연구 진행 — 턴 시작 시 자동
3. 건설·업그레이드(행성당 턴 1회) 4. 함선 생산(조선소 단계×2척) 5. 함대 이동·전투·식민·조사·스캔 6. 외교·거래·시장 7. 턴 종료

- 라운드가 넘어갈 때 30% 확률로 우주 이벤트(8종)
- 승리: 정복(행성 %), 경제(총자산), 과학(은하 초월), 제국(라운드 제한 시 최고 점수, 항상 적용), 최후 생존
- 턴 시간 초과 / 접속 끊김 60초 → 서버가 턴을 넘김, 게임을 떠난 플레이어 → AI가 운영(재접속 시 되찾음)

## 5. 검증

- `node` 시뮬레이션: 2~4개 AI 제국이 모든 맵 크기에서 끝까지 플레이(예외·무한 루프 없음, 평균 30~45라운드에 승부)
- Playwright: 싱글 플레이 전체 흐름, 온라인 2개 브라우저(방 생성·초대 링크 참가·AI 추가·시작·턴 동기화·차례 위반/조작 요청 거부·거래·새로고침 재접속·서버 재시작 후 복구), 모바일 화면
