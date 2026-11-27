# 보드게임 파티 서버

각자 폰으로 같은 방에 들어와 20가지 파티 게임을 하는 실시간 서버예요.
친구들은 계정 없이 링크만으로 들어와요. AI 플레이어와 타이머도 서버에서 돌아가요.

---

## 가장 쉬운 방법: 내 컴퓨터에서 켜기

### 처음 한 번만
[nodejs.org/ko](https://nodejs.org/ko)에서 **LTS** 버튼을 눌러 Node.js를 설치해요. 설치 화면에서는 계속 **다음**만 누르면 돼요.

### 놀 때마다
1. 압축을 푼 폴더를 열어요.
2. 실행 파일을 더블클릭해요.
   - 윈도우: **START-Windows.bat**
   - 맥: **START-Mac.command**
3. 검은 창에 **"준비 완료! 이 링크를 친구들에게 보내세요"**와 함께 `https://….trycloudflare.com` 주소가 나와요. 브라우저도 자동으로 열려요.
4. 그 링크를 카톡으로 친구들에게 보내요. 친구 폰에서 링크를 누르고 **새 방 만들기** 또는 방 코드로 들어오면 끝이에요.

### 알아 둘 점
- **검은 창을 닫으면 게임이 꺼져요.** 노는 동안 켜 두세요.
- 링크는 실행할 때마다 새로 바뀌어요.
- 처음 실행할 때는 필요한 파일을 받느라 1분쯤 걸려요.
- 같은 와이파이에 있는 폰은 창에 함께 나오는 `http://192.168…:3000` 주소로도 들어올 수 있어요.

### 이럴 땐 이렇게
- **윈도우에서 "PC 보호" 파란 창이 뜰 때:** **추가 정보 → 실행**을 눌러요.
- **맥에서 "열 수 없습니다"라고 뜰 때:** 파일을 **오른쪽 클릭 → 열기 → 열기**를 눌러요.
- **방화벽 허용 창이 뜰 때:** **허용**을 눌러요.

---

## 컴퓨터를 안 켜 두고 싶다면: Render에 올리기

인터넷에 서버를 올려 두면 언제든 같은 주소로 접속할 수 있어요. 무료예요.

1. [github.com](https://github.com)에 가입해요. 오른쪽 위 **+ → New repository**를 눌러 저장소를 만들어요. 공개(Public)로 만들어요.
2. 저장소 화면에서 **uploading an existing file**을 누르고, 압축을 푼 폴더 **안의** 파일과 폴더(`public`, `world-trade` 등)를 끌어다 놓은 뒤 **Commit changes**를 눌러요. 폴더째 올리면 한 단계 더 들어가서 Render와 GitHub Pages가 파일을 못 찾아요.
3. [render.com](https://render.com)에 GitHub 계정으로 가입해요.
4. **New + → Blueprint**를 누르고 방금 만든 저장소를 골라요. 설정은 `render.yaml` 파일에 다 들어 있어서 따로 입력할 게 없어요.
5. **Apply**를 누르고 몇 분 기다리면 `https://board-game-party-….onrender.com` 주소가 생겨요.

무료 플랜에서는 15분 동안 아무도 접속하지 않으면 서버가 잠들어요. 다음 접속 때 1분쯤 기다려야 하고, 그때 열려 있던 방은 사라져요.

---

## GitHub 안에서 바로 켜기: Codespaces

Render 가입 없이 GitHub 안에서 서버를 켜는 방법이에요. 무료 계정은 한 달에 약 60시간까지 쓸 수 있어요.

1. 저장소 화면에서 초록색 **Code** 버튼 → **Codespaces** 탭 → **Create codespace on main**을 눌러요.
2. 1~2분 기다리면 편집기 화면이 열리고, 아래 터미널에 "보드게임 파티 서버가 3000번 포트에서 실행 중"이 떠요.
   - 안 뜨면 터미널에 `npm install && npm start`를 입력하고 Enter를 눌러요.
3. 아래쪽 **PORTS**(포트) 탭에서 3000번 줄을 오른쪽 클릭 → **Port Visibility → Public**을 눌러요. 이걸 안 하면 친구들이 못 들어와요.
4. 같은 줄의 **Forwarded Address** 주소를 복사해서 친구들에게 보내요.

- 노는 동안 Codespaces 탭을 닫지 마세요. 한동안 아무것도 안 누르면 저절로 멈출 수 있어요.
- 다 놀고 나면 저장소 화면의 **Code → Codespaces**에서 멈추거나 지우면 시간이 아껴져요.

---

## (선택) AI 대사를 Claude가 만들게 하기

API 키가 없어도 AI 플레이어는 준비된 문장으로 잘 움직여요. 라이어 힌트, 진실 게임 대답, 끝말잇기 단어를 Claude가 그때그때 만들게 하려면 [console.anthropic.com](https://console.anthropic.com)에서 API 키를 발급받아요. 사용한 만큼 요금이 나가요.

- **Render:** Blueprint를 만들 때 `ANTHROPIC_API_KEY` 칸에 키를 넣어요. 나중에는 서비스 화면의 **Environment**에서 넣을 수 있어요.
- **내 컴퓨터:** 실행 파일을 메모장으로 열고 `node share.js` 바로 윗줄에 다음 줄을 넣어요.
  - 윈도우: `set ANTHROPIC_API_KEY=발급받은키`
  - 맥: `export ANTHROPIC_API_KEY=발급받은키`

---

## 파일 구성

| 파일 | 역할 |
|---|---|
| `START-Windows.bat`, `START-Mac.command` | 더블클릭 실행 파일 |
| `share.js` | 서버를 켜고 공개 링크를 만들어요 |
| `server.js` | 서버 본체 (방, 실시간 동기화, 타이머, AI) |
| `logic.js` | 20가지 게임 규칙과 AI 두뇌 |
| `public/` | 폰에서 보이는 화면 |
| `index.html` | GitHub Pages 첫 화면 (게임 선택) |
| `gw-server.js`, `galactic-war/` | 🌌 GALACTIC WAR (아래 설명) |
| `render.yaml` | Render 자동 설정 |

---

# 🌌 GALACTIC WAR (온라인 우주 전략)

육각형 은하 지도에서 2~4개 제국이 **행성 점령 · 자원 관리 · 기술 연구 · 함대 전투 · 외교**로 패권을 다투는 턴제 전략 보드게임이에요.

- **싱글 플레이 (서버 필요 없음):** https://aha12070106-cyber.github.io/board-game-party/galactic-war/ → 싱글 플레이
- **온라인 멀티플레이:** 이 서버를 켜고(아래 방법 그대로) 주소 뒤에 **`/galactic-war/`**를 붙여요. 예: `http://localhost:3000/galactic-war/`, `https://board-game-party-….onrender.com/galactic-war/`
  - GitHub Pages 주소로 열었다면 **설정 → 서버 주소**에 서버 주소(예: `board-game-party-….onrender.com`)를 넣으면 온라인 메뉴를 쓸 수 있어요.
- 로비: 빠른 게임 · 방 만들기(인원, 공개/비공개, 비밀번호, 맵 크기 25/49/81/121칸, 게임 속도, 승리 조건) · 방 참가(목록/코드/초대 링크) · 싱글 플레이 · 제국 도감 · 게임 기록 · 설정 · 게임 규칙
- **모든 행동은 서버가 검증**해요. 클라이언트는 행동만 요청하고, 자원·행성 소유권·전투 결과는 서버가 계산해요. 플레이어마다 안개가 걸린 정보만 받아요.
- 게임은 `data/` 폴더에 자동 저장돼서 새로고침하거나 서버가 다시 켜져도 이어서 할 수 있어요. 게임을 떠나면 AI가 대신 운영하고, 다시 들어오면 되찾아요.
- 구조와 데이터 설계: [`galactic-war/DESIGN.md`](galactic-war/DESIGN.md)

> Render 무료 플랜은 서버가 잠들거나 다시 배포되면 디스크가 초기화돼서 저장된 온라인 게임이 사라질 수 있어요. 오래 이어서 할 게임은 내 컴퓨터 실행을 쓰거나, Render 유료 플랜의 Persistent Disk를 붙이고 `GW_DATA_DIR` 환경 변수를 그 경로로 지정하세요.

| 파일 | 역할 |
|---|---|
| `galactic-war/engine.js` | 게임 규칙 엔진 (서버·브라우저 공용): 맵 생성, 행동 검증, 전투, 연구, 외교, 이벤트, 승리, AI |
| `galactic-war/ui.js`, `style.css`, `index.html` | 화면 |
| `gw-server.js` | 온라인 권위 서버 (방, 동기화, 턴 타이머, AI 턴, 저장/재접속) |

---

## 🌏 월드 트레이드 (무역 시뮬레이션)

**바로 플레이:** https://aha12070106-cyber.github.io/board-game-party/world-trade/ (GitHub Pages)

서버를 켠 뒤 주소 뒤에 **`/world-trade/`**를 붙여도 열려요. (예: `http://localhost:3000/world-trade/`)
`world-trade/index.html`을 브라우저로 바로 열어도 혼자 플레이할 수 있어요.

- 8개 국가 중 하나를 골라 AI 국가(3·5·7개국, 난이도 3단계)와 경쟁해요.
- 라운드 순서: 자원 확인 → 생산 → 국가 간 무역(제안·역제안·수락/거절) → 세계 시장 → 정산
- 자원 10종, 상품 13종, 발전 항목 5개(산업·경제·기술·농업·무역 규모), 세계 사건 10종
- 라운드 제한 시간 설정, 자동 저장 / 이어하기, PC·모바일 화면 지원

| 파일 | 역할 |
|---|---|
| `world-trade/data.js` | 자원·상품·국가·발전 비용 데이터 |
| `world-trade/engine.js` | 게임 규칙, 시장 가격, AI |
| `world-trade/ui.js`, `style.css` | 화면 |

### GitHub Pages
저장소 **Settings → Pages**에서 *Deploy from a branch*, `main` / `(root)`로 설정되어 있으면 최상위 `index.html`이 첫 화면이 돼요.
GitHub Pages는 정적 파일만 올려 주기 때문에 **월드 트레이드는 바로 플레이할 수 있지만, 보드게임 파티는 실시간 서버가 필요해서 Pages에서는 동작하지 않아요.** (내 컴퓨터, Render, Codespaces 방법을 쓰세요)
