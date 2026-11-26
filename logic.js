/* Shared game rules for the board-game party server and browser.
   boardLogic(env) needs: env.sched() (redraw, browser only), env.askAI(prompt) -> Promise<string|null>, env.NOW() -> ms. */
function boardLogic(env){
const sched=env.sched||(()=>{}),askAI=env.askAI||(async()=>null),NOW=env.NOW||(()=>Date.now());
const UI={};
/* ===== utilities ===== */
const PAL=['#ff4d6d','#2d9cdb','#22a35a','#f2994a','#9b51e0','#0fb5a5','#e0488f','#8d6e3f','#3f51b5','#7cb342'];
const rid=()=>Math.random().toString(36).slice(2,9);
const $=id=>document.getElementById(id);
const clone=o=>JSON.parse(JSON.stringify(o));
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const pick=a=>a[Math.floor(Math.random()*a.length)];
const rnd=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
const norm=s=>String(s==null?'':s).replace(/\s+/g,'').toLowerCase();
const nr=g=>{g.round=rid();};
const B=(label,act,arg,cls,dis)=>`<button type="button" class="btn ${cls||''}" data-act="${act}" data-arg="${esc(arg==null?'':arg)}"${dis?' disabled':''}>${label}</button>`;
const F=(name,ph,btn,extra)=>`<form class="row" data-form="${name}" autocomplete="off"><input name="v" placeholder="${esc(ph)}" ${extra||''}><button class="btn" type="submit">${btn}</button></form>`;
const chip=(c,p)=>`<span class="chip"><i style="background:${c.color(p)}"></i>${esc(c.name(p))}</span>`;
const chips=(c,ps)=>ps.map(p=>chip(c,p)).join(' ');
const timer=t=>`<span class="timer" data-ends="${t}">${Math.max(0,Math.ceil((t-NOW())/1000))}</span>초`;
/* a deck that never repeats until exhausted */
function draw(st,key,len){st.decks=st.decks||{};let d=st.decks[key];if(!d||!d.length)d=shuffle([...Array(len).keys()]);const v=d.pop();st.decks[key]=d;return v;}
function addScore(st,p,n){st.score=st.score||{};st.score[p]=(st.score[p]||0)+n;}
function logp(st,t){st.log=st.log||[];st.log.unshift(t);st.log=st.log.slice(0,25);}
const logView=st=>st.log&&st.log.length?`<ul class="log">${st.log.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:'';
/* korean helpers */
const CHO='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
function choOf(w){return [...w].map(ch=>{const k=ch.charCodeAt(0)-0xAC00;return k>=0&&k<11172?CHO[Math.floor(k/588)]:ch;}).join('');}
function dueum(ch){ // allowed starting syllables for a word following ch
  const k=ch.charCodeAt(0)-0xAC00;if(k<0||k>=11172)return [ch];
  const cho=Math.floor(k/588),jung=Math.floor((k%588)/28),jong=k%28;
  const mk=c=>String.fromCharCode(0xAC00+c*588+jung*28+jong);
  const iy=[2,6,7,12,17,20].includes(jung);
  const out=[ch];
  if(cho===5){out.push(mk(iy?11:2));}
  else if(cho===2&&iy){out.push(mk(11));}
  return out;
}
function isHangulWord(w){return /^[가-힣]{2,}$/.test(w);}

/* ===== content ===== */
const MISSIONS=[
 ['칭찬 폭격','왼쪽 사람의 장점 3가지를 10초 안에 말하기'],['플라밍고','눈 감고 한 발로 10초 버티기'],
 ['노래방 1절','좋아하는 노래 후렴 한 소절 부르기'],['성대모사','다른 사람들이 고른 동물 소리 흉내 내기'],
 ['초성 챌린지','"ㄱ"으로 시작하는 음식 5개를 10초 안에 말하기'],['예고편 내레이션','지금 이 자리를 영화 예고편처럼 소개하기'],
 ['가위바위보','오른쪽 사람과 가위바위보 한 판 이기기'],['포커페이스','10초 동안 무표정 유지 (다른 사람들은 웃기기)'],
 ['사진 한 장','휴대폰 속 최근 사진 하나 보여 주고 사연 소개하기'],['삼행시','모두가 정해 준 단어로 삼행시 짓기'],
 ['빨간 물건','3초 안에 이 방에 있는 빨간 물건 가리키기'],['끝말잇기','오른쪽 사람과 끝말잇기 5턴 버티기'],
 ['박수 리듬','왼쪽 사람이 친 박수 리듬을 그대로 따라 하기'],['뉴스 속보','오늘 있었던 일을 아나운서 톤으로 전하기'],
 ['혀 꼬기','"간장 공장 공장장은 강 공장장" 세 번 막힘없이'],['거꾸로 세기','20부터 1까지 막힘없이 거꾸로 세기'],
 ['몸으로 말해요','왼쪽 사람이 귓속말한 단어를 몸짓만으로 맞히게 하기'],['응원 구호','참가자 전원 이름을 넣은 응원 구호 만들기'],
 ['표정 3단 변신','10초 안에 서로 다른 웃긴 표정 3개 짓기'],['즉석 퀴즈','다른 사람들이 낸 퀴즈 1개 맞히기'],
 ['나라 이름','5초 안에 나라 이름 4개 말하기'],['광고 모델','손에 잡히는 물건 하나를 15초 동안 광고하기'],
 ['모델 워킹','방 한쪽 끝까지 런웨이처럼 걸어갔다 오기'],['한 문장 시','"오늘 밤"으로 시작하는 한 줄 시 짓기'],
 ['손 안 쓰기','바닥에 앉았다가 손 안 짚고 일어나기'],['인터뷰','오른쪽 사람에게 기자처럼 질문 3개 하기']
];
const LIAR={
 '과일':['사과','바나나','수박','딸기','포도','복숭아','귤','망고','키위','파인애플','체리','감'],
 '음식':['김치찌개','떡볶이','치킨','피자','짜장면','비빔밥','삼겹살','라면','초밥','햄버거','냉면','김밥'],
 '동물':['고양이','강아지','호랑이','기린','펭귄','코끼리','토끼','원숭이','판다','악어','부엉이','돌고래'],
 '직업':['의사','소방관','요리사','경찰관','선생님','가수','택배기사','미용사','농부','우주비행사','변호사','바리스타'],
 '장소':['병원','학교','도서관','놀이공원','찜질방','공항','편의점','캠핑장','수영장','영화관','시장','노래방'],
 '물건':['우산','칫솔','리모컨','안경','베개','휴대폰 충전기','손거울','가위','냉장고','자전거','시계','지갑'],
 '운동':['축구','야구','농구','배드민턴','수영','탁구','볼링','등산','요가','스키','태권도','골프'],
 '탈것':['지하철','버스','택시','비행기','배','자전거','오토바이','기차','열기구','킥보드','캠핑카','헬리콥터']
};
const SPY=[
 ['찜질방',['때밀이','매점 직원','계란 먹는 손님','잠든 손님']],['놀이공원',['매표소 직원','롤러코스터 탑승객','인형탈 알바','길 잃은 아이']],
 ['병원 응급실',['의사','간호사','환자','보호자']],['비행기 안',['기장','승무원','창가 승객','아기 엄마']],
 ['편의점',['야간 알바','점장','라면 먹는 학생','택배 맡기는 손님']],['결혼식장',['신랑','신부 친구','축가 가수','사진사']],
 ['캠핑장',['캠핑 초보','장작 패는 사람','관리인','바비큐 담당']],['학교 교실',['담임 선생님','반장','전학생','졸린 학생']],
 ['영화관',['매표 직원','팝콘 먹는 관객','늦게 온 관객','영사 기사']],['해수욕장',['안전요원','튜브 장수','서핑하는 사람','모래성 만드는 아이']],
 ['노래방',['사장님','마이크 놓지 않는 사람','탬버린 담당','박수만 치는 사람']],['동물원',['사육사','기린 보는 아이','기념품 직원','사진 찍는 관광객']],
 ['미용실',['원장','인턴','파마하는 손님','잡지 읽는 손님']],['우주정거장',['선장','엔지니어','과학자','관광객']],
 ['재래시장',['떡볶이 사장님','흥정하는 손님','배달 기사','시식 담당']]
];
const BALANCE=[
 ['평생 여름만','평생 겨울만'],['라면 평생 금지','치킨 평생 금지'],['과거로 시간여행','미래로 시간여행'],['투명 인간 되기','하늘 날기'],
 ['월 300 놀고먹기','월 1000 매일 야근'],['연락 안 되는 연인','연락 너무 자주 하는 연인'],['평생 휴대폰 없이','평생 친구 없이'],
 ['10년 젊어지기','10억 받기'],['깻잎 떼 주기 OK','깻잎 떼 주기 NO'],['짜장면','짬뽕'],['부먹','찍먹'],['산','바다'],
 ['아침형 인간','저녁형 인간'],['모든 언어 하기','모든 악기 연주'],['좋아하는 노래 무한 반복','싫어하는 노래 한 번'],
 ['혼자 1등','다 같이 2등'],['비밀 없는 친구','비밀 지켜 주는 친구'],['여행은 계획파','여행은 즉흥파'],['집에서 쉬기','밖에서 놀기'],
 ['문자로 고백','직접 고백'],['매일 같은 옷','매일 같은 메뉴'],['로또 1등 한 번','평생 작은 행운'],['고양이','강아지'],
 ['대기업 막내','스타트업 대표'],['영화관 맨 앞줄','영화관 맨 뒷줄'],['씻고 자기','그냥 자기'],['탕수육 소스 부어 먹기','깐풍기로 바꾸기'],
 ['한 달 동안 폰 금지','한 달 동안 단 것 금지'],['내 생각 다 들리기','남 생각 다 들리기'],['물냉면','비빔냉면']
];
const ECHO=['여름 하면 떠오르는 것','편의점에서 꼭 사는 것','한국 사람이 제일 좋아하는 음식','월요일 하면 떠오르는 단어','빨간색 과일',
 '첫 데이트 장소','노래방 18번이 될 장르','여행 갈 때 꼭 챙기는 것','겨울 간식','스트레스 풀 때 하는 것','동물원에서 제일 인기 많은 동물',
 '치킨에 어울리는 음료','시험 기간 필수품','비 오는 날 먹고 싶은 음식','가장 무서운 벌레','부모님께 드릴 선물','캠핑 필수품',
 '영화 볼 때 간식','크리스마스 하면 떠오르는 것','아침 메뉴','파란색 하면 떠오르는 것','제일 귀찮은 집안일','생일에 받고 싶은 것',
 '한강 하면 떠오르는 것','회식 2차 장소','바다에서 하는 것','야식 1순위','소풍 도시락 메뉴','숫자 7 하면 떠오르는 것','밤에 하는 일'];
const POINT=['가장 먼저 결혼할 것 같은 사람','무인도에서 제일 오래 살아남을 사람','몰래 일기 쓸 것 같은 사람','갑자기 해외로 떠날 것 같은 사람',
 '연예인이 될 뻔한 사람','라면을 제일 맛있게 끓일 사람','길에서 제일 자주 길을 잃을 사람','지갑을 제일 자주 잃어버릴 사람',
 '노래방에서 마이크 안 놓을 사람','제일 먼저 부자가 될 사람','좀비 사태에서 리더가 될 사람','거짓말을 제일 못할 사람',
 '비밀을 제일 잘 지킬 사람','10년 뒤 가장 많이 변해 있을 사람','고양이처럼 생긴 사람','새벽 3시에 연락해도 받을 사람',
 '여행 짐을 제일 많이 쌀 사람','몰래 춤 연습할 것 같은 사람','유튜버로 성공할 것 같은 사람','술 마시면 제일 귀여워질 사람',
 '제일 늦게 답장할 사람','다이어트 결심을 제일 자주 할 사람','처음 본 사람과 제일 빨리 친해질 사람','공포 영화 보고 못 잘 사람',
 '복권 당첨되면 숨길 것 같은 사람','제일 오래 살 것 같은 사람','오늘 집에 제일 늦게 갈 사람','숨은 재능이 제일 많을 사람','요리 대회 나가면 우승할 사람','아침잠이 제일 많을 사람'];
const SON=['라면 국물에 밥 말아 먹어 본 사람','지각해서 뛰어 본 사람','셀카 10장 넘게 찍어 본 사람','혼자 영화 본 사람','혼자 고깃집 가 본 사람',
 '버스에서 졸다가 내릴 곳 지나친 사람','휴대폰 화면 깨 본 사람','다이어트 3일 만에 포기한 사람','새벽 4시까지 게임해 본 사람',
 '카톡 보내고 바로 지워 본 사람','노래방에서 혼자 노래해 본 사람','길에서 넘어져 본 사람','외국에 가 본 사람','연예인 실제로 본 사람',
 '비행기에서 잠들어 본 사람','택시에 물건 두고 내려 본 사람','반려동물 키워 본 사람','손글씨 편지 써 본 사람','머리 스스로 잘라 본 사람',
 '복권 사 본 사람','밤새 벼락치기 해 본 사람','엘리베이터에 갇혀 본 사람','캠핑 가 본 사람','번지점프나 놀이기구 무서워서 포기해 본 사람',
 '오늘 커피 마신 사람','알람 끄고 다시 잠든 사람','라면 하루 두 번 먹어 본 사람','일기를 일주일 넘게 써 본 사람','생일 케이크 혼자 다 먹어 본 사람','이 방에서 제일 먼저 온 사람'];
const TRUTH=['요즘 제일 자주 듣는 노래는?','최근에 몰래 산 물건은?','지금까지 받은 선물 중 최고는?','가장 부끄러웠던 순간은?','어릴 때 꿈은?',
 '여기 있는 사람 중 첫인상이 제일 달랐던 사람은?','최근에 한 거짓말 하나','휴대폰에서 제일 많이 쓰는 앱은?','가장 최근에 운 이유는?',
 '절대 못 먹는 음식은?','1억이 생기면 제일 먼저 할 일은?','남에게 말 못 한 작은 취미는?','최근에 가장 화났던 일은?','인생 영화 하나',
 '타임머신이 있다면 몇 살로?','무인도에 딱 하나 가져간다면?','가장 오래된 친구 자랑 하나','최근 검색 기록 중 하나 공개','요즘 고민 하나',
 '내 성격에서 고치고 싶은 점','최근 1년 가장 잘한 선택','가장 무서워하는 것','첫 월급(용돈)으로 산 것','여기 있는 사람 중 닮고 싶은 점이 있는 사람'];
const DARE=['10초 동안 아이돌 안무 따라 하기','왼쪽 사람에게 3행시로 칭찬하기','30초 동안 모든 말을 노래로 하기','최근 사진첩 사진 하나 공개',
 '다음 차례까지 존댓말로만 말하기','아무 동물 흉내 15초','가장 웃긴 표정으로 단체 셀카 찍기','오른쪽 사람 성대모사','팔굽혀펴기 10개(또는 앉았다 일어나기 10개)',
 '진지한 표정으로 사랑 고백 대사 한 줄','눈 감고 자기 이름 예쁘게 쓰기','다음 차례까지 손 머리 위에 올리기','모두에게 별명 지어 주기',
 '광고 성우처럼 물 한 잔 소개하기','엉덩이로 이름 쓰기','혀 꼬는 말 3번 연속','10초 동안 웃지 않고 다른 사람 눈 보기','즉석 랩 4줄',
 '1분 동안 휴대폰 엎어 두기','가장 좋아하는 노래 한 소절 부르기'];
const CHARADES=['원숭이','펭귄','캥거루','고릴라','뱀','닭','코끼리','고양이','개구리','상어','양치질','세수하기','라면 끓이기','자전거 타기','수영',
 '야구 타자','볼링','골프','태권도','스키','줄넘기','낚시','사진 찍기','택시 잡기','지각해서 뛰기','셀카 찍기','화장하기','설거지','청소기 돌리기',
 '빨래 널기','요리사','경찰관','지휘자','마술사','소방관','의사','DJ','발레리나','복서','우주비행사','좀비','로봇','허수아비','오페라 가수',
 '팝콘 먹기','하품','재채기','삐침','모기 잡기','비 맞기','폭죽','파도타기','눈사람 만들기','아기 업기','엘리베이터','거울','시계','풍선 불기','기타 연주','윙크'];
const CHOSUNG=[['음식','떡볶이'],['음식','김치찌개'],['음식','비빔밥'],['음식','짜장면'],['음식','삼겹살'],['음식','불고기'],['음식','순대국'],['음식','호떡'],
 ['음식','붕어빵'],['음식','팥빙수'],['동물','고양이'],['동물','강아지'],['동물','호랑이'],['동물','코끼리'],['동물','다람쥐'],['동물','고슴도치'],
 ['동물','오징어'],['동물','하마'],['동물','두더지'],['동물','부엉이'],['나라','대한민국'],['나라','브라질'],['나라','이탈리아'],['나라','베트남'],
 ['나라','캐나다'],['나라','이집트'],['나라','스위스'],['직업','소방관'],['직업','요리사'],['직업','간호사'],['직업','바리스타'],['직업','사진작가'],
 ['직업','미용사'],['물건','냉장고'],['물건','선풍기'],['물건','청소기'],['물건','휴지통'],['물건','칫솔'],['물건','우산'],['물건','손목시계'],
 ['장소','놀이공원'],['장소','도서관'],['장소','찜질방'],['장소','편의점'],['장소','수영장'],['장소','운동장'],['과일','바나나'],['과일','복숭아'],
 ['과일','파인애플'],['과일','블루베리'],['과일','참외'],['과일','수박'],['운동','배드민턴'],['운동','탁구'],['운동','농구'],['운동','줄다리기'],
 ['날씨','소나기'],['날씨','무지개'],['날씨','함박눈'],['날씨','태풍']];
const BOMB_TOPICS=['과일 이름','나라 이름','동물 이름','라면 종류','아이돌 그룹','지하철역 이름','빨간색인 것','편의점 과자','운동 종목','영화 제목',
 '직업 이름','바다에 사는 것','부엌에 있는 물건','"ㅅ"으로 시작하는 단어','두 글자 음식','치킨 브랜드','악기 이름','꽃 이름','자동차 브랜드','학교에 있는 것'];
const CHAIN_START=['기차','사과','바다','자동차','호랑이','우산','고구마','나무','하늘','토끼','도시락','라면','강아지','연필','구름','다리미','모자','수박','가방','시계'];
/* ===== games, part 1: hidden-role & answer-reveal games ===== */
const G={};
const flipBtn=(c,inner,label)=>c.ui.open===c.g.round?`<div class="${Date.now()-(c.ui.fat||0)<500?'anim':''}">${inner}</div><div class="row" style="justify-content:center;margin-top:10px">${B('카드 가리기','flip','','sec sm')}</div>`:`<div class="secret"><p class="muted">${label||'다른 사람이 못 보게 확인하세요.'}</p><div style="margin-top:10px">${B('내 카드 보기','flip','','dark')}</div></div>`;
function flip(c){c.ui.open=c.ui.open===c.g.round?null:c.g.round;c.ui.fat=Date.now();sched();}
function tally(inp,keys){const t={};keys.forEach(p=>{const v=inp[p];if(v!=null&&v!=='')t[v]=(t[v]||0)+1;});return t;}
function topOf(t){let max=0,tops=[];for(const [k,n] of Object.entries(t)){if(n>max){max=n;tops=[k];}else if(n===max)tops.push(k);}return {max,tops};}
function progress(c,who){const done=who.filter(p=>p in c.inputs);return `<p class="muted">${done.length}/${who.length}명 완료${done.length<who.length?' · 기다리는 중: '+chips(c,who.filter(p=>!(p in c.inputs))):''}</p>`;}

/* ---------- 라이어 / 스파이 ---------- */
function SecretGame(spy){
  const deal=(st,g)=>{
    const ps=g.ps;st.n++;st.liar=pick(ps);st.hints={};st.first=pick(ps);st.res=null;st.guess=null;st.win=null;
    if(spy){const i=draw(st,'spy',SPY.length);st.place=SPY[i][0];const roles=shuffle(SPY[i][1]);st.roles={};ps.filter(p=>p!==st.liar).forEach((p,k)=>{st.roles[p]=roles[k%roles.length];});}
    else{st.cat=pick(Object.keys(LIAR));st.word=LIAR[st.cat][draw(st,'w'+st.cat,LIAR[st.cat].length)];}
    st.phase='talk';nr(g);
  };
  const resolve=(st,inp,g)=>{
    const t=tally(inp,g.ps),{tops}=topOf(t);st.tally=t;
    st.accused=tops.length===1?tops[0]:null;
    if(st.accused===st.liar){st.phase='guess';nr(g);}
    else{st.phase='end';st.win='liar';addScore(st,st.liar,3);}
  };
  const judge=(st,guess,g)=>{
    st.guess=guess;
    const ok=spy?guess===st.place:norm(guess)===norm(st.word);
    st.phase='end';
    if(ok){st.win='liar';addScore(st,st.liar,3);}
    else{st.win='town';g.ps.filter(p=>p!==st.liar).forEach(p=>addScore(st,p,1));}
  };
  const L=spy?'스파이':'라이어';
  return {name:spy?'스파이 찾기':'라이어 게임',icon:spy?'스':'라',tag:'추리',min:3,max:10,
    rules:spy?['스파이를 뺀 모두가 같은 장소와 각자의 역할을 받아요. 스파이는 장소를 몰라요.','돌아가며 다른 사람에게 장소에 관한 질문을 하고 답해요.','투표로 스파이를 찾으세요. 잡힌 스파이가 장소를 맞히면 스파이 승리!','이기면 스파이 3점, 시민은 각 1점.']
      :['라이어를 뺀 모두가 같은 제시어를 받아요. 라이어는 주제만 알아요.','돌아가며 제시어를 한 마디씩 설명해요. 너무 쉽게 말하면 라이어가 눈치채요.','투표로 라이어를 찾으세요. 잡힌 라이어가 제시어를 맞히면 라이어 승리!','이기면 라이어 3점, 시민은 각 1점.'],
    setup(){return {phase:'idle',n:0,score:{}};},
    view(c){
      const st=c.st;let h='';
      if(st.phase==='idle')return `<div class="q"><div class="qt">모두 모이면 카드를 나눠요.</div><div class="qs">진행자가 버튼을 누르면 각자 폰에 비밀 카드가 생겨요.</div></div>`+(c.isHost?B('카드 나누기','deal','','big'):'<p class="muted">진행자가 시작하길 기다리는 중…</p>');
      h+=`<div class="q"><div class="qn">${st.n}번째 판</div><div class="qt">${spy?'장소를 숨긴 사람은 누구?':'주제: '+esc(st.cat)}</div></div>`;
      if(c.inGame&&st.phase!=='end'){
        let card;
        if(c.me===st.liar)card=`<div class="secret hot"><p>당신은</p><div class="big">${L}!</div><p>${spy?'들키지 말고 장소를 알아내세요.':'주제는 '+esc(st.cat)+'. 들키지 말고 제시어를 알아내세요.'}</p></div>`;
        else card=spy?`<div class="secret cool"><p>장소</p><div class="big">${esc(st.place)}</div><p>내 역할: ${esc(st.roles[c.me])}</p></div>`:`<div class="secret cool"><p>제시어</p><div class="big">${esc(st.word)}</div></div>`;
        h+=flipBtn(c,card);
      }
      if(st.phase==='talk'){
        h+=`<div class="banner">${chip(c,st.first)}부터 시작해서 돌아가며 ${spy?'서로 질문하고 답해요.':'제시어를 한 마디씩 설명해요.'}</div>`;
        const hs=Object.entries(st.hints||{});if(hs.length)h+=`<div><h2>AI의 한 마디</h2><ul class="reslist">${hs.map(([p,t])=>`<li>${chip(c,p)}<span>“${esc(t)}”</span></li>`).join('')}</ul></div>`;
        const pend=(c.g.bots||[]).filter(p=>!(st.hints||{})[p]);if(pend.length)h+=`<p class="muted">${chips(c,pend)} 생각하는 중…</p>`;
        h+=c.isHost?B('투표 시작','vote','','big'):'';
      }else if(st.phase==='vote'){
        h+=`<div><h2>${L}라고 생각하는 사람</h2>`;
        if(c.inGame)h+=`<div class="choices">${c.ps.filter(p=>p!==c.me).map(p=>B(chip(c,p),'v',p,c.inputs[c.me]===p?'on':'sec')).join('')}</div>`;
        h+=`</div>`+progress(c,c.ps)+(c.isHost?B('지금 개표','count','','sec'):'');
      }else if(st.phase==='guess'){
        h+=`<div class="banner">${chip(c,st.liar)}이(가) ${L}로 지목됐어요! 정답을 맞히면 ${L}의 역전승.</div>`;
        if(c.me===st.liar)h+=spy?`<h2>장소는 어디일까요?</h2><div class="choices">${SPY.map(s=>B(esc(s[0]),'g',s[0],'sec')).join('')}</div>`:F('g','제시어는?','정답 제출','maxlength="20"');
        else h+=`<p class="muted">${esc(c.name(st.liar))}이(가) 정답을 고민하는 중…</p>`;
      }else if(st.phase==='end'){
        const lw=st.win==='liar';
        h+=`<div class="secret ${lw?'hot':'cool'}"><p>${lw?L+' 승리!':'시민 승리!'}</p><div class="big">${esc(c.name(st.liar))}</div><p>${L}였어요. ${spy?'장소':'제시어'}: <b>${esc(spy?st.place:st.word)}</b>${st.guess!=null?' · '+L+'의 답: '+esc(st.guess):''}</p></div>`;
        const hs2=Object.entries(st.hints||{});if(hs2.length)h+=`<p class="muted">AI의 한 마디: ${hs2.map(([p,t])=>esc(c.name(p))+' “'+esc(t)+'”').join(' · ')}</p>`;
        if(st.tally)h+=`<ul class="reslist">${c.ps.filter(p=>st.tally[p]).sort((a,b)=>st.tally[b]-st.tally[a]).map(p=>`<li>${chip(c,p)}<b>${st.tally[p]}표</b></li>`).join('')}</ul>`;
        if(c.isHost)h+=B('다음 판','deal','','big');
      }
      return h;
    },
    act(c,a,v){
      if(a==='flip')return flip(c);
      if(a==='deal')return c.update((st,g)=>{if(st.phase!=='idle'&&st.phase!=='end')return false;deal(st,g);});
      if(a==='vote')return c.update((st,g)=>{if(st.phase!=='talk')return false;st.phase='vote';nr(g);});
      if(a==='v')return c.input(v);
      if(a==='count')return c.update((st,g,inp)=>{if(st.phase!=='vote')return false;resolve(st,inp,g);});
      if(a==='g'){if(c.me!==c.st.liar)return;if(!String(v).trim())return c.toast('정답을 입력해 주세요.');return c.input(String(v).trim());}
    },
    tick(c){
      const st=c.st;
      if(st.phase==='vote'&&c.ps.every(p=>p in c.inputs))c.update((st,g,inp)=>{if(st.phase!=='vote'||!g.ps.every(p=>p in inp))return false;resolve(st,inp,g);});
      if(st.phase==='guess'&&(st.liar in c.inputs))c.update((st,g,inp)=>{if(st.phase!=='guess'||!(st.liar in inp))return false;judge(st,inp[st.liar],g);});
    }
  };
}
G.liar=SecretGame(false);
G.spy=SecretGame(true);

/* ---------- 마피아 ---------- */
const ROLE={mafia:['마피아','밤마다 한 명을 제거해요. 마피아끼리는 서로를 알아요.'],doctor:['의사','밤마다 한 명을 골라 지켜요. 자신도 지킬 수 있어요.'],police:['경찰','밤마다 한 명을 조사해 마피아인지 알아내요.'],citizen:['시민','낮 토론과 투표로 마피아를 찾아내요.']};
function mafiaWin(st){
  const m=st.alive.filter(p=>st.roles[p]==='mafia').length,o=st.alive.length-m;
  if(m===0){st.phase='end';st.winner='town';return true;}
  if(m>=o){st.phase='end';st.winner='mafia';return true;}
  return false;
}
function mafiaDawn(st,inp,g){
  const al=st.alive,mafs=al.filter(p=>st.roles[p]==='mafia');
  const {tops}=topOf(tally(inp,mafs));const victim=tops[0]||null;
  const doc=al.find(p=>st.roles[p]==='doctor'),pol=al.find(p=>st.roles[p]==='police');
  const saved=doc&&inp[doc];
  if(pol&&inp[pol])st.police.push({day:st.day,t:inp[pol],m:st.roles[inp[pol]]==='mafia'});
  if(victim&&victim!==saved){st.alive=al.filter(p=>p!==victim);st.news=`${st.day}일차 아침: 밤사이 ${g.names[victim]}님이 마피아에게 당했어요.`;}
  else if(victim)st.news=`${st.day}일차 아침: 의사가 누군가를 살렸어요! 아무도 다치지 않았어요.`;
  else st.news=`${st.day}일차 아침: 조용한 밤이었어요.`;
  st.phase='day';mafiaWin(st);
}
function mafiaCount(st,inp,g){
  const t=tally(inp,st.alive);delete t.skip;const {max,tops}=topOf(t);
  if(tops.length===1&&max>0){const x=tops[0];st.alive=st.alive.filter(p=>p!==x);st.news=`투표 결과 ${g.names[x]}님이 처형됐어요. ${st.roles[x]==='mafia'?'마피아였어요!':'마피아가 아니었어요…'}`;}
  else st.news='표가 갈려서 아무도 처형되지 않았어요.';
  st.tally=t;st.day++;st.phase='dusk';mafiaWin(st);
}
G.mafia={name:'마피아',icon:'마',tag:'추리',min:4,max:10,
  rules:['각자 폰에 비밀 역할이 나와요: 마피아, 의사, 경찰, 시민.','밤에는 역할이 있는 사람만 폰으로 행동하고, 나머지는 눈을 감아요.','낮에는 토론하고 투표로 한 명을 처형해요.','마피아를 모두 잡으면 시민 승리, 마피아 수가 나머지 이상이 되면 마피아 승리.'],
  setup(ps){
    const n=ps.length,arr=[];const mN=n>=8?3:n>=6?2:1;
    for(let i=0;i<mN;i++)arr.push('mafia');arr.push('police');if(n>=5)arr.push('doctor');while(arr.length<n)arr.push('citizen');
    const sh=shuffle(arr),roles={};ps.forEach((p,i)=>roles[p]=sh[i]);
    return {phase:'role',roles,alive:ps.slice(),day:1,news:'게임 시작! 각자 역할을 확인하세요.',police:[],winner:null};
  },
  view(c){
    const st=c.st,me=c.me,r=st.roles[me],alive=st.alive.includes(me),dead=c.inGame&&!alive;
    let h=`<div class="q"><div class="qn">${st.phase==='night'?st.day+'일차 밤':st.day+'일차'}</div><div class="qt">${esc(st.news)}</div><div class="qs">살아 있는 사람 ${st.alive.length}명</div></div>`;
    if(c.inGame&&st.phase!=='end'){
      const mates=st.alive.filter(p=>st.roles[p]==='mafia'&&p!==me);
      const card=`<div class="secret ${r==='mafia'?'hot':'cool'}"><p>내 역할</p><div class="big">${ROLE[r][0]}</div><p>${ROLE[r][1]}</p>${r==='mafia'&&mates.length?`<p style="margin-top:8px">동료: ${mates.map(p=>esc(c.name(p))).join(', ')}</p>`:''}${r==='police'&&st.police.length?`<p style="margin-top:8px">${st.police.map(x=>`${x.day}일차: ${esc(c.name(x.t))} → ${x.m?'마피아!':'마피아 아님'}`).join('<br>')}</p>`:''}</div>`;
      h+=flipBtn(c,card,dead?'탈락했어요. 내 역할 다시 보기':'');
    }
    if(dead||!c.inGame||st.phase==='end')h+=`<div><h2>${st.phase==='end'?'모든 역할':'모든 역할 (탈락자·구경꾼만 보여요)'}</h2><ul class="reslist">${c.ps.map(p=>`<li>${chip(c,p)}<span>${ROLE[st.roles[p]][0]}${st.alive.includes(p)?'':' · 탈락'}</span></li>`).join('')}</ul></div>`;
    if(st.phase==='role'){h+=c.isHost?B('밤 시작','night','','big'):'<p class="muted">모두 역할을 확인하면 진행자가 밤을 시작해요.</p>';}
    else if(st.phase==='night'){
      const actors=st.alive.filter(p=>st.roles[p]!=='citizen');
      if(alive&&r!=='citizen'){
        let targets=r==='mafia'?st.alive.filter(p=>st.roles[p]!=='mafia'):r==='police'?st.alive.filter(p=>p!==me):st.alive;
        const q=r==='mafia'?'누구를 제거할까요?':r==='police'?'누구를 조사할까요?':'누구를 지킬까요?';
        h+=`<div><h2>${q}</h2><div class="choices">${targets.map(p=>B(chip(c,p),'v',p,c.inputs[me]===p?'on':'sec')).join('')}</div></div>`;
        if(r==='mafia'){const ms=st.alive.filter(p=>st.roles[p]==='mafia'&&p!==me&&c.inputs[p]);if(ms.length)h+=`<p class="muted">동료 선택: ${ms.map(p=>esc(c.name(p))+' → '+esc(c.name(c.inputs[p]))).join(', ')}</p>`;}
      }else if(alive)h+=`<div class="secret"><div class="big">눈을 감아요</div><p>밤이 끝날 때까지 화면을 보지 마세요.</p></div>`;
      h+=`<p class="muted">밤 행동 ${actors.filter(p=>p in c.inputs).length}/${actors.length}</p>`;
      if(c.isHost)h+=B('아침으로 넘기기','dawn','','sec');
    }
    else if(st.phase==='day'){h+=`<div class="banner">토론 시간! 누가 마피아일까요?</div>`+(c.isHost?B('투표 시작','vote','','big'):'');}
    else if(st.phase==='vote'){
      if(alive)h+=`<div><h2>처형할 사람</h2><div class="choices">${st.alive.map(p=>B(chip(c,p),'v',p,c.inputs[me]===p?'on':'sec')).join('')}${B('기권','v','skip',c.inputs[me]==='skip'?'on':'sec')}</div></div>`;
      h+=progress(c,st.alive)+(c.isHost?B('지금 개표','count','','sec'):'');
    }
    else if(st.phase==='dusk'){h+=c.isHost?B('밤 시작','night','','big'):'<p class="muted">진행자가 밤을 시작하길 기다리는 중…</p>';}
    else if(st.phase==='end'){h+=`<div class="secret ${st.winner==='mafia'?'hot':'cool'}"><div class="big">${st.winner==='mafia'?'마피아 승리!':'시민 승리!'}</div></div>`+(c.isHost?B('새 게임 (역할 다시 뽑기)','again','','big'):'');}
    return h;
  },
  act(c,a,v){
    if(a==='flip')return flip(c);
    if(a==='night')return c.update((st,g)=>{if(st.phase!=='role'&&st.phase!=='dusk')return false;st.phase='night';st.news=st.day+'일차 밤이 됐어요. 모두 눈을 감아요.';nr(g);});
    if(a==='v')return c.input(v);
    if(a==='dawn')return c.update((st,g,inp)=>{if(st.phase!=='night')return false;mafiaDawn(st,inp,g);});
    if(a==='vote')return c.update((st,g)=>{if(st.phase!=='day')return false;st.phase='vote';nr(g);});
    if(a==='count')return c.update((st,g,inp)=>{if(st.phase!=='vote')return false;mafiaCount(st,inp,g);});
    if(a==='again')return c.update((st,g)=>{g.st=G.mafia.setup(g.ps);nr(g);});
  },
  tick(c){
    const st=c.st;
    if(st.phase==='night'){const act=st.alive.filter(p=>st.roles[p]!=='citizen');if(act.every(p=>p in c.inputs))c.update((st,g,inp)=>{if(st.phase!=='night')return false;if(!st.alive.filter(p=>st.roles[p]!=='citizen').every(p=>p in inp))return false;mafiaDawn(st,inp,g);});}
    if(st.phase==='vote'&&st.alive.every(p=>p in c.inputs))c.update((st,g,inp)=>{if(st.phase!=='vote'||!st.alive.every(p=>p in inp))return false;mafiaCount(st,inp,g);});
  }
};

/* ---------- answer & reveal family ---------- */
function RG(meta,o){
  const who=(st,ps)=>o.who?o.who(st,ps):ps;
  const reveal=(st,inp,ps)=>{st.ans={};who(st,ps).forEach(p=>{if(p in inp)st.ans[p]=inp[p];});st.phase='show';o.score&&o.score(st,st.ans,ps);};
  return Object.assign({},meta,{
    setup(ps){const st={phase:'ask',score:{},n:1};o.init&&o.init(st,ps);o.next(st,ps);return st;},
    view(c){
      const st=c.st,w=who(st,c.ps);
      let h=`<div class="q"><div class="qn">${o.label||'문제'} ${st.n}</div>${o.prompt(c)}</div>`;
      if(st.phase==='ask'){
        if(w.includes(c.me))h+=o.input(c,c.inputs[c.me]);
        else if(c.inGame)h+='<p class="muted">이번 문제는 쉬어요.</p>';
        h+=progress(c,w)+(c.isHost?B('지금 공개','show','','sec'):'');
      }else if(st.phase==='show'){
        h+=o.result(c);
        if(c.isHost)h+=B(o.over&&o.over(st,c.ps)?'최종 결과':'다음 문제','next','','big');
      }else h+=o.end(c)+(c.isHost?B('처음부터 다시','restart','','big'):'');
      return h;
    },
    act(c,a,v){
      if(a==='a'){if(!who(c.st,c.ps).includes(c.me))return;const val=o.parse?o.parse(v,c):v;if(val==null||val==='')return c.toast('답을 입력해 주세요.');return c.input(val);}
      if(a==='show')return c.update((st,g,inp)=>{if(st.phase!=='ask')return false;reveal(st,inp,g.ps);});
      if(a==='next')return c.update((st,g)=>{if(st.phase!=='show')return false;if(o.over&&o.over(st,g.ps)){st.phase='end';return;}st.n++;o.next(st,g.ps);st.phase='ask';nr(g);});
    },
    tick(c){
      const st=c.st;if(st.phase!=='ask')return;const w=who(st,c.ps);
      if(w.length&&w.every(p=>p in c.inputs))c.update((st,g,inp)=>{if(st.phase!=='ask')return false;const ww=who(st,g.ps);if(!ww.every(p=>p in inp))return false;reveal(st,inp,g.ps);});
    }
  });
}
function mkRG(meta,o){const m=RG(meta,o);const restart=m.act;m.act=function(c,a,v){if(a==='restart')return c.update((st,g)=>{g.st=m.setup(g.ps);nr(g);});return restart.call(m,c,a,v);};return m;}
const promptQ=(t,s)=>`<div class="qt">${esc(t)}</div>${s?`<div class="qs">${esc(s)}</div>`:''}`;
function groupsView(c,ans,label){
  const groups={};Object.entries(ans).forEach(([p,v])=>{(groups[v]=groups[v]||[]).push(p);});
  return Object.entries(groups).sort((a,b)=>b[1].length-a[1].length).map(([v,ps])=>`<li><b>${label?label(v):esc(v)}</b><span>${chips(c,ps)}</span></li>`).join('');
}

G.balance=mkRG({name:'밸런스 게임',icon:'밸',tag:'파티',min:2,max:10,rules:['둘 중 하나를 각자 폰에서 골라요.','모두 고르면 누가 뭘 골랐는지 공개돼요.','소수파는 왜 그걸 골랐는지 변론하기!']},{
  next(st){st.q=BALANCE[draw(st,'b',BALANCE.length)];},
  prompt:c=>promptQ('둘 중 하나만 고른다면?','마음 바뀌면 다시 눌러도 돼요.'),
  input:(c,cur)=>`<div class="choices two">${c.st.q.map((t,i)=>B(esc(t),'a',String(i),cur===String(i)?'on':'sec')).join('')}</div>`,
  result(c){const st=c.st,ps=Object.keys(st.ans);
    return `<ul class="reslist">${st.q.map((t,i)=>{const who=ps.filter(p=>st.ans[p]===String(i));const pct=ps.length?Math.round(who.length/ps.length*100):0;return `<li><b>${esc(t)}</b><span class="kv">${who.length}명 · ${pct}%</span><span class="meter"><b style="width:${pct}%"></b></span><span>${chips(c,who)||'<span class="muted">없음</span>'}</span></li>`;}).join('')}</ul>`;},
  over:()=>false,end:()=>''
});
G.echo=mkRG({name:'이구동성',icon:'이',tag:'파티',min:3,max:10,rules:['주제를 보고 떠오르는 단어를 하나씩 적어요.','다른 사람과 같은 답을 쓰면 겹친 사람 수만큼 점수!','띄어쓰기는 무시하고 비교해요.']},{
  next(st){st.q=ECHO[draw(st,'e',ECHO.length)];},
  prompt:c=>promptQ(c.st.q,'남들도 쓸 것 같은 답을 적어요.'),
  input:(c,cur)=>F('a',cur?'내 답: '+cur+' (고치려면 다시 입력)':'내 답','제출','maxlength="20"'),
  parse:v=>String(v).trim(),
  score(st,ans){const g={};Object.entries(ans).forEach(([p,v])=>{const k=norm(v);(g[k]=g[k]||[]).push(p);});Object.values(g).forEach(ps=>{if(ps.length>1)ps.forEach(p=>addScore(st,p,ps.length-1));});},
  result(c){const ans={};Object.entries(c.st.ans).forEach(([p,v])=>ans[p]=v);
    const groups={};Object.entries(ans).forEach(([p,v])=>{const k=norm(v);(groups[k]=groups[k]||{v,ps:[]}).ps.push(p);});
    return `<ul class="reslist">${Object.values(groups).sort((a,b)=>b.ps.length-a.ps.length).map(gp=>`<li><b>${esc(gp.v)}</b><span>${chips(c,gp.ps)}${gp.ps.length>1?` <span class="tag">+${gp.ps.length-1}점</span>`:''}</span></li>`).join('')}</ul>`;},
  over:()=>false,end:()=>''
});
G.point=mkRG({name:'지목 투표',icon:'지',tag:'파티',min:3,max:10,rules:['"가장 ~할 것 같은 사람"에 어울리는 사람을 골라요. 나 자신도 OK.','모두 고르면 결과가 공개돼요.','제일 많이 뽑힌 사람은 한마디 소감!']},{
  next(st){st.q=POINT[draw(st,'p',POINT.length)];},
  prompt:c=>promptQ(c.st.q+'은?','마음 바뀌면 다시 눌러도 돼요.'),
  input:(c,cur)=>`<div class="choices">${c.ps.map(p=>B(chip(c,p),'a',p,cur===p?'on':'sec')).join('')}</div>`,
  result(c){const t=tally(c.st.ans,Object.keys(c.st.ans));const ord=Object.keys(t).sort((a,b)=>t[b]-t[a]);const tot=Object.keys(c.st.ans).length||1;
    return `<ul class="reslist">${ord.map(p=>`<li>${chip(c,p)}<span class="kv">${t[p]}표</span><span class="meter"><b style="width:${Math.round(t[p]/tot*100)}%"></b></span></li>`).join('')}</ul>`;},
  over:()=>false,end:()=>''
});
G.nunchi=mkRG({name:'눈치 숫자',icon:'눈',tag:'파티',label:'라운드',min:3,max:10,rules:['1부터 10 중 숫자 하나를 몰래 골라요.','다른 사람과 겹치지 않은 숫자 중 가장 큰 숫자를 고른 사람이 1점.','욕심내서 10을 고르면 겹칠지도!']},{
  next(){},
  prompt:()=>promptQ('겹치지 않는 가장 큰 숫자를 노려요','1~10 중 하나. 남과 겹치면 무효예요.'),
  input:(c,cur)=>`<div class="pad" style="grid-template-columns:repeat(5,minmax(0,1fr))">${[...Array(10)].map((_,i)=>B(String(i+1),'a',String(i+1),cur===String(i+1)?'on':'sec')).join('')}</div>`,
  score(st,ans){const t=tally(ans,Object.keys(ans));const uniq=Object.keys(t).filter(k=>t[k]===1).map(Number);st.win=null;if(uniq.length){const best=Math.max(...uniq);const p=Object.keys(ans).find(p=>+ans[p]===best);st.win=p;st.best=best;addScore(st,p,1);}},
  result(c){const st=c.st;const t=tally(st.ans,Object.keys(st.ans));
    return (st.win?`<div class="secret cool"><p>${st.best}을(를) 혼자 고른</p><div class="big">${esc(c.name(st.win))}</div><p>1점 획득!</p></div>`:`<div class="secret"><div class="big">전부 겹쳤어요!</div><p>이번 라운드는 무승부.</p></div>`)+
      `<ul class="reslist">${Object.keys(t).sort((a,b)=>b-a).map(n=>`<li><b>${n}</b><span>${chips(c,Object.keys(st.ans).filter(p=>st.ans[p]===n))}${t[n]>1?' <span class="tag">겹침</span>':''}</span></li>`).join('')}</ul>`;},
  over:()=>false,end:()=>''
});
G.son=mkRG({name:'손병호 게임',icon:'손',tag:'파티',min:3,max:10,rules:['모두 손가락 5개로 시작해요.','"~해 본 사람 접어!" 해당되면 접는다를 골라요. 거짓말은 양심에 맡겨요.','손가락을 다 접으면 탈락. 마지막까지 남은 사람이 승리!']},{
  init(st,ps){st.f={};ps.forEach(p=>st.f[p]=5);},
  who:(st,ps)=>ps.filter(p=>st.f[p]>0),
  next(st){st.q=SON[draw(st,'s',SON.length)];},
  prompt:c=>promptQ(c.st.q+', 접어!','해당되면 접어요.'),
  input:(c,cur)=>`<div class="choices two">${B('접는다 (해 봤다)','a','y',cur==='y'?'on':'sec')}${B('안 접는다','a','n',cur==='n'?'on':'sec')}</div><p class="muted">내 손가락 ${c.st.f[c.me]}개 남음</p>`,
  score(st,ans){Object.entries(ans).forEach(([p,v])=>{if(v==='y')st.f[p]=Math.max(0,st.f[p]-1);});},
  result(c){const st=c.st,ys=Object.keys(st.ans).filter(p=>st.ans[p]==='y');
    return `<div class="banner">접은 사람: ${chips(c,ys)||'아무도 없어요'}</div><ul class="reslist">${c.ps.slice().sort((a,b)=>st.f[b]-st.f[a]).map(p=>`<li>${chip(c,p)}<span class="kv">${st.f[p]>0?'손가락 '+st.f[p]+'개':'탈락'}</span></li>`).join('')}</ul>`;},
  over:(st,ps)=>ps.filter(p=>st.f[p]>0).length<=1,
  end(c){const left=c.ps.filter(p=>c.st.f[p]>0);return `<div class="secret cool"><p>최후의 생존자</p><div class="big">${left.length?esc(c.name(left[0])):'모두 탈락!'}</div></div>`;}
});
G.holjjak=mkRG({name:'홀짝',icon:'홀',tag:'파티',label:'라운드',min:2,max:10,rules:['모두 구슬 10개로 시작해요. 차례대로 한 명이 구슬 주인이 돼요.','주인은 구슬을 1~5개 몰래 쥐고, 나머지는 홀인지 짝인지 맞혀요.','맞히면 주인에게서 1개, 틀리면 주인에게 1개. 구슬이 0개가 되면 탈락!']},{
  init(st,ps){st.m={};ps.forEach(p=>st.m[p]=10);st.h=-1;},
  who:(st,ps)=>ps.filter(p=>st.m[p]>0),
  next(st,ps){const al=ps.filter(p=>st.m[p]>0);let i=st.h;for(let k=0;k<ps.length;k++){i=(i+1)%ps.length;if(st.m[ps[i]]>0)break;}st.h=i;st.holder=ps[i];if(!al.length)st.holder=null;},
  prompt:c=>promptQ(esc(c.name(c.st.holder))+'의 구슬은 홀? 짝?','주인은 몇 개를 쥘지 고르고, 나머지는 홀짝을 골라요.'),
  input(c,cur){const st=c.st;if(c.me===st.holder){const mx=Math.min(5,st.m[c.me]);return `<h2>몇 개 쥘까요? (내 구슬 ${st.m[c.me]}개)</h2><div class="pad" style="grid-template-columns:repeat(5,minmax(0,1fr))">${[...Array(mx)].map((_,i)=>B(String(i+1),'a',String(i+1),cur===String(i+1)?'on':'sec')).join('')}</div>`;}
    return `<div class="choices two">${B('홀','a','odd',cur==='odd'?'on':'sec')}${B('짝','a','even',cur==='even'?'on':'sec')}</div><p class="muted">내 구슬 ${st.m[c.me]}개</p>`;},
  score(st,ans){const h=st.holder,n=+ans[h];if(!n){st.res='주인이 구슬을 안 쥐어서 이번 판은 무효.';return;}const par=n%2?'odd':'even';st.cnt=n;
    Object.keys(ans).forEach(p=>{if(p===h)return;if(ans[p]===par){if(st.m[h]>0){st.m[h]--;st.m[p]++;}}else{if(st.m[p]>0){st.m[p]--;st.m[h]++;}}});st.res=null;},
  result(c){const st=c.st,par=st.cnt%2?'odd':'even';const ok=Object.keys(st.ans).filter(p=>p!==st.holder&&st.ans[p]===par),no=Object.keys(st.ans).filter(p=>p!==st.holder&&st.ans[p]!==par);
    return (st.res?`<div class="banner">${esc(st.res)}</div>`:`<div class="secret"><p>${esc(c.name(st.holder))}이(가) 쥔 구슬</p><div class="big">${st.cnt}개 · ${st.cnt%2?'홀':'짝'}</div></div><div class="banner">맞힘: ${chips(c,ok)||'없음'}<br>틀림: ${chips(c,no)||'없음'}</div>`)+
      `<ul class="reslist">${c.ps.slice().sort((a,b)=>st.m[b]-st.m[a]).map(p=>`<li>${chip(c,p)}<span class="kv">${st.m[p]>0?'구슬 '+st.m[p]+'개':'탈락'}</span></li>`).join('')}</ul>`;},
  over:(st,ps)=>ps.filter(p=>st.m[p]>0).length<=1,
  end(c){const left=c.ps.filter(p=>c.st.m[p]>0);return `<div class="secret cool"><p>구슬을 모두 차지한</p><div class="big">${left.length?esc(c.name(left[0])):'?'}</div></div>`;}
});
/* ===== games, part 2: turn, card and board games ===== */
const tp=c=>c.ps[c.st.turn];
const nextIdx=(st,ps,skipFn)=>{let i=st.turn;for(let k=0;k<ps.length;k++){i=(i+1)%ps.length;if(!skipFn||!skipFn(ps[i]))break;}return i;};
const myTurn=c=>c.me===tp(c);
const PIPS={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
const dieH=(n,pop)=>`<div class="die${pop?' pop':''}">${[...Array(9)].map((_,i)=>`<i class="${PIPS[n].includes(i)?'on':''}"></i>`).join('')}</div>`;
function popOnce(c,key){const fresh=c.ui.lastRoll!==key;c.ui.lastRoll=key;return fresh&&key!=null;}

/* ---------- 진실 혹은 도전 ---------- */
G.truth={name:'진실 혹은 도전',icon:'진',tag:'파티',min:2,max:10,
  rules:['차례인 사람이 진실 또는 도전을 골라요.','진실은 질문에 솔직하게 답하고, 도전은 미션을 해요.','못 하겠으면 패스! 패스한 횟수가 기록돼요.'],
  setup(){return {turn:0,phase:'choose',card:null,pass:{}};},
  view(c){
    const st=c.st,p=tp(c),mine=myTurn(c)||c.isHost;let h='';
    if(st.phase==='choose'){
      h+=`<div class="q"><div class="qn">차례</div><div class="qt">${esc(c.name(p))}, 진실? 도전?</div></div>`;
      h+=mine?`<div class="choices two">${B('진실','pick','truth','dark')}${B('도전','pick','dare','red')}</div>`:`<p class="muted">${esc(c.name(p))}이(가) 고르는 중…</p>`;
    }else{
      const cd=st.card;
      h+=`<div class="secret ${cd.k==='dare'?'hot':'cool'}"><p>${esc(c.name(p))}의 ${cd.k==='dare'?'도전':'진실'}</p><div class="big" style="font-size:clamp(22px,5vw,32px)">${esc(cd.t)}</div>${cd.ans?`<p style="margin-top:10px;font-weight:700">${esc(c.name(p))}: “${esc(cd.ans)}”</p>`:''}</div>`;
      if(isBot(c.g,p)&&!cd.ans)h+=`<p class="muted">${esc(c.name(p))}이(가) 생각하는 중…</p>`;
      h+=mine?`<div class="choices two">${B('완료','done','','')}${B('패스','skip','','sec')}</div>`:'<p class="muted">끝나면 차례인 사람이 완료를 눌러요.</p>';
    }
    const ps=Object.keys(st.pass).filter(k=>st.pass[k]);
    if(ps.length)h+=`<p class="muted">패스 기록: ${ps.map(k=>esc(c.name(k))+' '+st.pass[k]+'번').join(', ')}</p>`;
    return h;
  },
  act(c,a,v){
    const me=c.me;
    if(a==='pick')return c.update((st,g)=>{if(st.phase!=='choose')return false;const t=v==='dare'?DARE[draw(st,'d',DARE.length)]:TRUTH[draw(st,'t',TRUTH.length)];st.card={k:v,t};st.phase='card';});
    if(a==='done'||a==='skip')return c.update((st,g)=>{if(st.phase!=='card')return false;if(a==='skip'){const p=g.ps[st.turn];st.pass[p]=(st.pass[p]||0)+1;}st.turn=(st.turn+1)%g.ps.length;st.phase='choose';st.card=null;});
  }
};

/* ---------- 몸으로 말해요 ---------- */
G.charades={name:'몸으로 말해요',icon:'몸',tag:'순발력',min:3,max:10,
  rules:['차례인 사람 폰에만 제시어가 보여요. 말 없이 몸으로만 설명!','60초 동안 최대한 많이 맞히게 하세요.','맞힌 사람 이름을 누르면 설명한 사람과 맞힌 사람 모두 1점.'],
  setup(){return {turn:0,phase:'ready',word:null,ends:0,score:{},got:0,last:null};},
  view(c){
    const st=c.st,p=tp(c),actor=myTurn(c);let h='';
    if(st.phase==='ready'){
      h+=`<div class="q"><div class="qn">다음 설명</div><div class="qt">${esc(c.name(p))} 차례</div>${st.last?`<div class="qs">${esc(st.last)}</div>`:''}</div>`;
      h+=actor||c.isHost?B('시작 (60초)','go','','big'):'<p class="muted">설명할 사람이 시작을 누르길 기다리는 중…</p>';
    }else{
      h+=`<div class="row" style="justify-content:space-between"><span class="chip">${chip(c,p)} 설명 중</span><span>${timer(st.ends)} · 맞힌 개수 ${st.got}</span></div>`;
      if(actor){
        h+=`<div class="secret hot"><p>제시어</p><div class="big">${esc(st.word)}</div><p>말하지 말고 몸으로!</p></div>`;
        h+=`<h2>누가 맞혔나요?</h2><div class="choices">${c.ps.filter(q=>q!==p).map(q=>B(chip(c,q),'got',q,'')).join('')}${B('패스','pass','','sec')}</div>`;
      }else h+=`<div class="secret"><div class="big">?</div><p>${esc(c.name(p))}의 몸짓을 보고 큰 소리로 맞혀요!</p></div>`;
    }
    return h;
  },
  act(c,a,v){
    if(a==='skipturn')return c.update((st,g)=>{if(st.phase!=='ready'||g.ps[st.turn]!==c.me)return false;st.last=g.names[c.me]+'은(는) 몸이 없어서 설명 차례를 넘겼어요.';st.turn=(st.turn+1)%g.ps.length;});
    if(a==='go')return c.update((st,g)=>{if(st.phase!=='ready')return false;st.phase='play';st.got=0;st.word=CHARADES[draw(st,'c',CHARADES.length)];st.ends=Date.now()+60000;});
    if(a==='got')return c.update((st,g)=>{if(st.phase!=='play')return false;addScore(st,g.ps[st.turn],1);addScore(st,v,1);st.got++;st.word=CHARADES[draw(st,'c',CHARADES.length)];});
    if(a==='pass')return c.update((st)=>{if(st.phase!=='play')return false;st.word=CHARADES[draw(st,'c',CHARADES.length)];});
  },
  tick(c){if(c.st.phase==='play'&&Date.now()>c.st.ends)c.update((st,g)=>{if(st.phase!=='play'||Date.now()<=st.ends)return false;st.last=`${g.names[g.ps[st.turn]]}: ${st.got}개 맞힘`;st.phase='ready';st.turn=(st.turn+1)%g.ps.length;});}
};

/* ---------- 초성 퀴즈 ---------- */
G.chosung={name:'초성 퀴즈',icon:'초',tag:'순발력',min:2,max:10,
  rules:['화면에 나온 초성과 주제를 보고 단어를 맞혀요.','각자 폰에 답을 입력하고, 가장 먼저 맞힌 사람이 1점.','진행자는 힌트를 열거나 정답을 공개할 수 있어요.'],
  setup(){const st={phase:'ask',hint:0,score:{},n:1};const q=CHOSUNG[draw(st,'q',CHOSUNG.length)];st.cat=q[0];st.w=q[1];return st;},
  view(c){
    const st=c.st;
    const shown=[...st.w].map((ch,i)=>i<st.hint?ch:choOf(ch)).join('');
    let h=`<div class="q"><div class="qn">문제 ${st.n} · 주제 ${esc(st.cat)}</div><div class="big3">${esc(shown)}</div><div class="qs">${st.w.length}글자</div></div>`;
    if(st.phase==='ask'){
      if(c.inGame)h+=c.inputs[c.me]?'<div class="banner">정답! 다른 사람을 기다려요.</div>':F('a','정답 입력','제출','maxlength="12"');
      if(c.isHost)h+=`<div class="row">${B('힌트 한 글자','hint','','sec',st.hint>=st.w.length-1)}${B('정답 공개','reveal','','sec')}</div>`;
    }else{
      h+=`<div class="secret ${st.win?'cool':''}"><p>정답</p><div class="big">${esc(st.w)}</div><p>${st.win?esc(c.name(st.win))+' 1점!':'아무도 못 맞혔어요.'}</p></div>`;
      if(c.isHost)h+=B('다음 문제','next','','big');
    }
    return h;
  },
  act(c,a,v){
    if(a==='a'){if(norm(v)===norm(c.st.w)){c.toast('정답!');return c.input(c.st.w);}if(String(v).trim())c.toast('땡! 다시 생각해 봐요.');return;}
    if(a==='hint')return c.update(st=>{if(st.phase!=='ask')return false;st.hint=Math.min(st.w.length-1,st.hint+1);});
    if(a==='reveal')return c.update(st=>{if(st.phase!=='ask')return false;st.phase='show';st.win=null;});
    if(a==='next')return c.update((st,g)=>{if(st.phase!=='show')return false;const q=CHOSUNG[draw(st,'q',CHOSUNG.length)];st.cat=q[0];st.w=q[1];st.hint=0;st.n++;st.phase='ask';st.win=null;nr(g);});
  },
  tick(c){
    const st=c.st;if(st.phase!=='ask')return;
    const right=Object.keys(c.inputs).filter(p=>c.inputs[p]===st.w);if(!right.length)return;
    const at=c.inputAt;right.sort((a,b)=>at[a]-at[b]);const w=right[0];
    c.update(st=>{if(st.phase!=='ask')return false;st.phase='show';st.win=w;addScore(st,w,1);});
  }
};

/* ---------- 주사위 파티 ---------- */
const DTYPES={};
[2,5,8,11,14,17,20,23,26,28].forEach(i=>DTYPES[i]='mission');[4,13,22].forEach(i=>DTYPES[i]='up');[9,19,27].forEach(i=>DTYPES[i]='down');
[7,24].forEach(i=>DTYPES[i]='again');[12,25].forEach(i=>DTYPES[i]='swap');DTYPES[16]='skip';
const DINFO={mission:['★','미션'],up:['+3','지름길'],down:['−3','미끄럼'],again:['↻','한 번 더'],swap:['⇄','자리 바꾸기'],skip:['Zz','한 턴 쉬기']};
const DGOAL=29;
function dWin(st,p,n){if(st.pos[p]<DGOAL)return false;st.pos[p]=DGOAL;st.winner=p;st.phase='done';st.card=null;logp(st,n(p)+' 골인! 우승!');return true;}
function dEnd(st,ps,n){st.card=null;st.phase='roll';for(let k=0;k<ps.length;k++){st.turn=(st.turn+1)%ps.length;const p=ps[st.turn];if(st.skip[p]){st.skip[p]=false;logp(st,n(p)+' 이번 턴은 쉬어요.');continue;}break;}}
function dLand(st,ps,n){
  const p=ps[st.turn],t=DTYPES[st.pos[p]];
  if(dWin(st,p,n))return;
  const card=(type,kind,title,text)=>{st.phase='card';st.card={type,kind,title,text};};
  if(t==='mission'){const m=MISSIONS[draw(st,'m',MISSIONS.length)];card('mission','미션 카드',m[0],m[1]);}
  else if(t==='up'){st.pos[p]+=3;logp(st,n(p)+' 지름길 +3');if(dWin(st,p,n))return;card('up','지름길','3칸 앞으로!',n(p)+', '+st.pos[p]+'번 칸으로.');}
  else if(t==='down'){st.pos[p]=Math.max(0,st.pos[p]-3);logp(st,n(p)+' 미끄럼 −3');card('down','미끄럼','3칸 뒤로…',n(p)+', '+st.pos[p]+'번 칸으로.');}
  else if(t==='again'){logp(st,n(p)+' 한 번 더!');card('again','보너스','한 번 더 굴려요!',n(p)+', 주사위를 한 번 더.');}
  else if(t==='skip'){st.skip[p]=true;logp(st,n(p)+' 다음 턴 쉬기');card('skip','휴식','한 턴 쉬어요',n(p)+'은(는) 다음 차례를 건너뛰어요.');}
  else if(t==='swap'){
    const o=ps.filter(q=>q!==p);const lead=o.reduce((a,b)=>st.pos[b]>st.pos[a]?b:a);let tg,msg;
    if(st.pos[lead]>st.pos[p]){tg=lead;msg=n(p)+'이(가) 1등 '+n(lead)+'와(과) 자리 교환!';}else{tg=o.reduce((a,b)=>st.pos[b]<st.pos[a]?b:a);msg=n(p)+'이(가) 1등이라 꼴찌 '+n(tg)+'와(과) 자리 교환.';}
    const x=st.pos[p];st.pos[p]=st.pos[tg];st.pos[tg]=x;logp(st,n(p)+' ⇄ '+n(tg));card('swap','자리 바꾸기','자리 바꾸기!',msg);
  }else dEnd(st,ps,n);
}
G.dice={name:'주사위 파티',icon:'⚀',tag:'보드',min:2,max:6,
  rules:['자기 차례에 주사위를 굴려 29번 골인 칸에 먼저 도착하면 승리.','미션 칸: 카드의 미션을 하고, 다른 사람 폰에서 성공/실패를 판정해요. 성공하면 +2칸.','지름길 +3, 미끄럼 −3, 한 번 더, 자리 바꾸기(1등과 교환), 한 턴 쉬기.'],
  setup(ps){const pos={};ps.forEach(p=>pos[p]=0);return {pos,skip:{},turn:0,phase:'roll',card:null,dice:1,rk:null,winner:null,log:['게임 시작!']};},
  view(c){
    const st=c.st,p=tp(c);
    const cellIndex=s=>{const r=Math.floor(s/6),k=s%6;return r%2===0?r*6+k:r*6+(5-k);};
    let b='<div class="board">';
    for(let s=0;s<30;s++){const i=cellIndex(s),t=i===0?'start':i===DGOAL?'goal':(DTYPES[i]||'');let ic='',lb='';if(t==='start')ic='출발';else if(t==='goal')ic='골인';else if(DINFO[t]){ic=DINFO[t][0];lb=DINFO[t][1];}
      const toks=c.ps.filter(q=>st.pos[q]===i).map(q=>`<span class="tok" style="background:${c.color(q)}" title="${esc(c.name(q))}"></span>`).join('');
      b+=`<div class="cell ${t}"><span class="no">${i}</span>${ic?`<span class="ic">${ic}</span>`:''}${lb?`<span class="lb">${lb}</span>`:''}<div class="tokens">${toks}</div></div>`;}
    b+='</div>';
    let h=b;
    if(st.winner){h+=`<div class="secret cool"><p>우승</p><div class="big">${esc(c.name(st.winner))}</div></div>`+(c.isHost?B('한 판 더','again','','big'):'');return h+logView(st);}
    const can=myTurn(c)||c.isHost;
    h+=`<div class="row" style="gap:16px">${dieH(st.dice,popOnce(c,st.rk))}<div style="flex:1;min-width:160px">`;
    if(st.phase==='roll')h+=can?B(myTurn(c)?'주사위 굴리기':'대신 굴리기','roll','','big'):`<p class="muted">${esc(c.name(p))}이(가) 굴리길 기다리는 중…</p>`;
    h+='</div></div>';
    if(st.card){const cd=st.card;let acts;
      if(cd.type==='mission')acts=(!myTurn(c)&&c.inGame)||!c.online?`<div class="choices two" style="margin-top:12px">${B('실패','fail','','sec')}${B('성공 (+2칸)','ok')}</div>`:'<p style="margin-top:10px">다른 사람들이 판정해 줘요.</p>';
      else acts=can?`<div style="margin-top:12px">${B(cd.type==='again'?'확인하고 다시 굴리기':'다음 사람','next')}</div>`:'';
      h+=`<div class="card ${cd.type}"><div class="kind">${cd.kind}</div><div class="ct">${esc(cd.title)}</div><p>${esc(cd.text)}</p>${acts}</div>`;}
    h+=`<ul class="reslist">${c.ps.slice().sort((a,b)=>st.pos[b]-st.pos[a]).map(q=>`<li>${chip(c,q)}<span class="kv">${st.pos[q]}/${DGOAL}${st.skip[q]?' · 쉬는 중':''}</span></li>`).join('')}</ul>`;
    return h+logView(st);
  },
  act(c,a){
    const ME=c.me;
    const n=p=>c.name(p);
    if(a==='roll')return c.update((st,g)=>{if(st.phase!=='roll'||st.winner)return false;const d=rnd(1,6);st.dice=d;st.rk=rid();const p=g.ps[st.turn];st.pos[p]=Math.min(DGOAL,st.pos[p]+d);logp(st,n(p)+' 🎲'+d+' → '+st.pos[p]+'번');dLand(st,g.ps,n);});
    if(a==='ok')return c.update((st,g)=>{if(st.card?.type!=='mission')return false;const p=g.ps[st.turn];st.pos[p]+=2;logp(st,n(p)+' 미션 성공 +2');if(!dWin(st,p,n))dEnd(st,g.ps,n);});
    if(a==='fail')return c.update((st,g)=>{if(st.card?.type!=='mission')return false;logp(st,n(g.ps[st.turn])+' 미션 실패');dEnd(st,g.ps,n);});
    if(a==='next')return c.update((st,g)=>{if(!st.card||st.card.type==='mission')return false;if(st.card.type==='again'){st.card=null;st.phase='roll';}else dEnd(st,g.ps,n);});
    if(a==='again')return c.update((st,g)=>{g.st=G.dice.setup(g.ps);});
  }
};

/* ---------- 세계일주 땅따먹기 ---------- */
const LAND=[{n:'출발',s:'start'},{n:'방콕',p:60,g:0},{n:'하노이',p:80,g:0},{n:'카이로',p:100,g:1},{n:'이스탄불',p:120,g:1},{n:'찬스',s:'chance'},
 {n:'아테네',p:140,g:2},{n:'로마',p:160,g:2},{n:'마드리드',p:180,g:3},{n:'파리',p:200,g:3},{n:'무인도',s:'island'},{n:'런던',p:220,g:4},{n:'베를린',p:240,g:4},
 {n:'시드니',p:260,g:5},{n:'도쿄',p:280,g:5},{n:'찬스',s:'chance'},{n:'뉴욕',p:300,g:6},{n:'밴쿠버',p:320,g:6},{n:'부산',p:350,g:7},{n:'서울',p:400,g:7}];
const GCOL=['#c8a27a','#7fc8f0','#e07bb5','#f2a64a','#e5484d','#f5d34a','#37b37e','#3f51b5'];
const CHANCE=[['복권 당첨!',st=>150],['과속 벌금',st=>-100],['생일 축하금 (모두에게 30씩 받기)','bday'],['한턱 쏘기 (모두에게 30씩 주기)','treat'],['출발로 이동 (+200)','go'],['무인도로 이동','isle'],['장학금',st=>100],['병원비',st=>-80]];
const rentOf=(st,i)=>{const c=LAND[i];let r=Math.ceil(c.p*0.4/10)*10;const pair=LAND.map((x,k)=>k).filter(k=>LAND[k].g===c.g);if(pair.every(k=>st.own[k]===st.own[i]))r*=2;return r;};
function lgAssets(st,p){return st.money[p]+Object.keys(st.own).filter(k=>st.own[k]===p).reduce((s,k)=>s+LAND[k].p,0);}
function lgBust(st,p,n,g){if(st.money[p]>=0)return;st.out.push(p);Object.keys(st.own).forEach(k=>{if(st.own[k]===p)delete st.own[k];});logp(st,n(p)+' 파산!');const left=g.ps.filter(q=>!st.out.includes(q));if(left.length<=1){st.phase='end';st.winner=left[0]||null;}}
function lgNext(st,g,n){if(st.phase==='end')return;st.phase='roll';for(let k=0;k<g.ps.length;k++){st.turn=(st.turn+1)%g.ps.length;const p=g.ps[st.turn];if(st.out.includes(p))continue;if(st.isle[p]){st.isle[p]=false;logp(st,n(p)+' 무인도에서 한 턴 쉬어요.');continue;}break;}}
G.land={name:'세계일주 땅따먹기',icon:'땅',tag:'보드',min:2,max:6,
  rules:['주사위 2개를 굴려 세계를 돌며 도시를 사요. 출발을 지나면 200 받아요.','남의 도시에 서면 통행료를 내요. 같은 색 두 도시를 다 가지면 통행료 2배.','돈이 마이너스가 되면 파산. 마지막 생존자, 또는 진행자가 끝냈을 때 총자산 1등이 승리.'],
  setup(ps){const money={};ps.forEach(p=>money[p]=1500);const pos={};ps.forEach(p=>pos[p]=0);return {money,pos,own:{},isle:{},out:[],turn:0,phase:'roll',d:[1,1],rk:null,msg:'모두 1500으로 시작해요.',log:[]};},
  view(c){
    const st=c.st,p=tp(c);
    const slot=i=>i<=5?[1,i+1]:i<=10?[i-4,6]:i<=15?[6,16-i]:[21-i,1];
    let h='<div class="ring">';
    LAND.forEach((cell,i)=>{const [r,k]=slot(i);const own=st.own[i];const toks=c.ps.filter(q=>!st.out.includes(q)&&st.pos[q]===i).map(q=>`<span class="tok" style="background:${c.color(q)}"></span>`).join('');
      h+=`<div class="rc${cell.s?' sp':''}${st.pos[p]===i&&st.phase!=='end'?' here':''}" style="grid-row:${r};grid-column:${k}">${cell.g!=null?`<span class="own" style="background:${own?c.color(own):GCOL[cell.g]};${own?'height:100%;opacity:.25':''}"></span>`:''}<span class="rn">${cell.n}</span>${cell.p?`<span class="rp">${own?'통행 '+rentOf(st,i):cell.p}</span>`:''}<div class="tokens">${toks}</div></div>`;});
    const can=(myTurn(c)||c.isHost)&&st.phase!=='end';
    let mid=`<div style="display:flex;gap:6px">${dieH(st.d[0],popOnce(c,st.rk))}${dieH(st.d[1],false)}</div><div style="font-weight:800">${st.phase==='end'?'게임 끝':chip(c,p)+' 차례'}</div><div class="muted" style="font-size:12px">${esc(st.msg)}</div>`;
    h+=`<div class="ringmid">${mid}</div></div>`;
    if(st.phase==='roll')h+=can?B(myTurn(c)?'주사위 굴리기':'대신 굴리기','roll','','big'):`<p class="muted">${esc(c.name(p))}이(가) 굴리길 기다리는 중…</p>`;
    if(st.phase==='buy'){const cell=LAND[st.pos[p]];h+=`<div class="card"><div class="kind">빈 도시</div><div class="ct">${cell.n} · ${cell.p}</div><p>${esc(c.name(p))}의 돈 ${st.money[p]}</p>${can?`<div class="choices two" style="margin-top:12px">${B('구매','buy','','',st.money[p]<cell.p)}${B('패스','pass','','sec')}</div>`:''}</div>`;}
    if(st.phase==='end'){const rk=c.ps.slice().sort((a,b)=>lgAssets(st,b)-lgAssets(st,a));const w=st.winner||rk[0];h+=`<div class="secret cool"><p>우승</p><div class="big">${esc(c.name(w))}</div></div>`;if(c.isHost)h+=B('새 게임','again','','big');}
    h+=`<ul class="reslist">${c.ps.map(q=>`<li>${chip(c,q)}<span class="kv">${st.out.includes(q)?'파산':'현금 '+st.money[q]+' · 총자산 '+lgAssets(st,q)}${st.isle[q]?' · 무인도':''}</span></li>`).join('')}</ul>`;
    if(c.isHost&&st.phase!=='end')h+=B('여기서 끝내고 총자산으로 순위 정하기','end','','sec');
    return h+logView(st);
  },
  act(c,a){
    const n=p=>c.name(p);
    if(a==='roll')return c.update((st,g)=>{
      if(st.phase!=='roll')return false;
      const p=g.ps[st.turn],d=[rnd(1,6),rnd(1,6)],old=st.pos[p];st.d=d;st.rk=rid();
      let np=old+d[0]+d[1];if(np>=20){np-=20;st.money[p]+=200;logp(st,n(p)+' 출발 통과 +200');}
      st.pos[p]=np;const cell=LAND[np];st.msg=`${n(p)}: ${d[0]+d[1]} → ${cell.n}`;logp(st,st.msg);
      if(cell.p){const o=st.own[np];
        if(o==null){st.phase='buy';return;}
        if(o!==p){const r=rentOf(st,np);st.money[p]-=r;st.money[o]+=r;st.msg+=` · ${n(o)}에게 통행료 ${r}`;logp(st,n(p)+' → '+n(o)+' 통행료 '+r);lgBust(st,p,n,g);}
      }else if(cell.s==='island'){st.isle[p]=true;st.msg+=' · 다음 턴 쉬기';}
      else if(cell.s==='chance'){const ch=CHANCE[draw(st,'ch',CHANCE.length)];st.msg+=' · 찬스: '+ch[0];logp(st,'찬스: '+ch[0]);
        const others=g.ps.filter(q=>q!==p&&!st.out.includes(q));
        if(ch[1]==='bday')others.forEach(q=>{st.money[q]-=30;st.money[p]+=30;lgBust(st,q,n,g);});
        else if(ch[1]==='treat')others.forEach(q=>{st.money[q]+=30;st.money[p]-=30;});
        else if(ch[1]==='go'){st.pos[p]=0;st.money[p]+=200;}
        else if(ch[1]==='isle'){st.pos[p]=10;st.isle[p]=true;}
        else st.money[p]+=ch[1](st);
        lgBust(st,p,n,g);
      }
      lgNext(st,g,n);
    });
    if(a==='buy')return c.update((st,g)=>{if(st.phase!=='buy')return false;const p=g.ps[st.turn],i=st.pos[p];if(st.money[p]<LAND[i].p)return false;st.money[p]-=LAND[i].p;st.own[i]=p;st.msg=n(p)+' '+LAND[i].n+' 구매!';logp(st,st.msg);lgNext(st,g,n);});
    if(a==='pass')return c.update((st,g)=>{if(st.phase!=='buy')return false;lgNext(st,g,n);});
    if(a==='end')return c.update(st=>{if(st.phase==='end')return false;st.phase='end';st.winner=null;});
    if(a==='again')return c.update((st,g)=>{g.st=G.land.setup(g.ps);});
  }
};

/* ---------- 카오스 카드 ---------- */
const CC={draw2:['두 장 꿀꺽','카드 2장을 뽑아요.',0,6],all1:['모두 한 장','모든 사람이 1장씩 뽑아요.',0,4],steal:['슬쩍','지목한 사람의 카드 1장을 가져와요.',1,5],
 dump2:['폭탄 투척','지목한 사람이 카드 2장을 버려요.',1,5],swap:['손패 바꾸기','지목한 사람과 손패를 통째로 바꿔요.',1,3],gift:['선물 공세','내 카드 2장을 지목한 사람에게 줘요.',1,5],
 clean:['대청소','나를 뺀 모두가 1장씩 버려요.',0,3],spin:['빙글빙글','모두 손패를 다음 사람에게 넘겨요.',0,2],rev:['역주행','차례 방향이 반대로 바뀌어요.',0,3],skip:['건너뛰기','다음 사람의 차례를 건너뛰어요.',0,4]};
function ccDraw(st,p,k){for(let i=0;i<k;i++){if(!st.deck.length){st.deck=shuffle(st.discard);st.discard=[];}if(!st.deck.length)return;st.hands[p].push(st.deck.pop());}}
function ccDrop(st,p,k){for(let i=0;i<k&&st.hands[p].length;i++){const j=Math.floor(Math.random()*st.hands[p].length);st.discard.push(st.hands[p].splice(j,1)[0]);}}
function ccNext(st,ps){const step=()=>{st.turn=(st.turn+st.dir+ps.length)%ps.length;};step();if(st.skipNext){st.skipNext=false;step();}}
G.chaos={name:'카오스 카드',icon:'카',tag:'카드',min:2,max:6,
  rules:['정확히 카드 10장을 든 채로 내 차례가 시작되면 "10장 선언!"으로 승리.','내 차례에는 카드 1장 뽑기, 또는 카드 1장 내기 중 하나를 해요.','뺏기·버리게 하기·손패 바꾸기 같은 카드로 남의 10장을 망쳐요. 내 손패는 내 폰에만 보여요.'],
  setup(ps){const deck=[];Object.entries(CC).forEach(([k,v])=>{for(let i=0;i<v[3];i++)deck.push(k);});const st={deck:shuffle(deck),discard:[],hands:{},turn:0,dir:1,skipNext:false,winner:null,last:'모두 3장씩 받고 시작해요.',log:[]};ps.forEach(p=>{st.hands[p]=[];ccDraw(st,p,3);});return st;},
  view(c){
    const st=c.st,p=tp(c),mine=myTurn(c);let h='';
    if(st.winner){h+=`<div class="secret cool"><p>10장 선언 성공!</p><div class="big">${esc(c.name(st.winner))}</div></div>`;if(c.isHost)h+=B('한 판 더','again','','big');return h;}
    h+=`<div class="q"><div class="qn">${st.dir>0?'정방향':'역방향'} · 남은 덱 ${st.deck.length}장</div><div class="qt">${esc(c.name(p))} 차례</div><div class="qs">${esc(st.last)}</div></div>`;
    h+=`<ul class="reslist">${c.ps.map(q=>`<li>${chip(c,q)}<span class="kv">${st.hands[q].length}장${st.hands[q].length===10?' ⚠':''}</span></li>`).join('')}</ul>`;
    if(c.inGame){
      const hand=st.hands[c.me],sel=c.ui.sel;
      if(mine&&hand.length===10)h+=B('10장 선언!','win','','big red');
      h+=`<h2>내 손패 (${hand.length}장)</h2><div class="hand">${hand.map((k,i)=>`<button type="button" class="cc${sel===i?' sel':''}" data-act="sel" data-arg="${i}"${mine?'':' disabled'}><b>${CC[k][0]}</b><small>${CC[k][1]}</small></button>`).join('')||'<p class="muted">카드가 없어요.</p>'}</div>`;
      if(mine){
        if(sel!=null&&hand[sel]){const k=hand[sel];
          h+=CC[k][2]?`<div><h2>누구에게 쓸까요?</h2><div class="choices">${c.ps.filter(q=>q!==c.me).map(q=>B(chip(c,q),'play',sel+'|'+q,'')).join('')}</div></div>`:B(`"${CC[k][0]}" 내기`,'play',sel+'|','big');
        }
        h+=B('카드 1장 뽑기','draw','','sec');
      }else h+=`<p class="muted">${esc(c.name(p))}의 차례예요.</p>`;
    }
    return h+logView(st);
  },
  act(c,a,v){
    const n=p=>c.name(p),me=c.me;
    if(a==='sel'){c.ui.sel=c.ui.sel===+v?null:+v;sched();return;}
    if(a==='win')return c.update((st,g)=>{if(g.ps[st.turn]!==me||st.hands[me].length!==10)return false;st.winner=me;logp(st,n(me)+' 10장 선언!');});
    if(a==='draw'){c.ui.sel=null;return c.update((st,g)=>{const p=g.ps[st.turn];if(p!==me||st.winner)return false;ccDraw(st,p,1);st.last=n(p)+'이(가) 1장 뽑았어요.';logp(st,st.last);ccNext(st,g.ps);});}
    if(a==='play'){const [i,t]=v.split('|');c.ui.sel=null;return c.update((st,g)=>{
      const p=g.ps[st.turn];if(p!==me||st.winner)return false;const k=st.hands[p][+i];if(!k)return false;
      st.hands[p].splice(+i,1);st.discard.push(k);let m=n(p)+': '+CC[k][0];
      if(k==='draw2')ccDraw(st,p,2);
      else if(k==='all1')g.ps.forEach(q=>ccDraw(st,q,1));
      else if(k==='steal'&&st.hands[t].length){const j=Math.floor(Math.random()*st.hands[t].length);st.hands[p].push(st.hands[t].splice(j,1)[0]);m+=' → '+n(t);}
      else if(k==='dump2'){ccDrop(st,t,2);m+=' → '+n(t);}
      else if(k==='swap'){const x=st.hands[p];st.hands[p]=st.hands[t];st.hands[t]=x;m+=' ⇄ '+n(t);}
      else if(k==='gift'){for(let z=0;z<2&&st.hands[p].length;z++){const j=Math.floor(Math.random()*st.hands[p].length);st.hands[t].push(st.hands[p].splice(j,1)[0]);}m+=' → '+n(t);}
      else if(k==='clean')g.ps.filter(q=>q!==p).forEach(q=>ccDrop(st,q,1));
      else if(k==='spin'){const hs=g.ps.map(q=>st.hands[q]);g.ps.forEach((q,z)=>{st.hands[g.ps[(z+st.dir+g.ps.length)%g.ps.length]]=hs[z];});}
      else if(k==='rev')st.dir*=-1;
      else if(k==='skip')st.skipNext=true;
      st.last=m;logp(st,m);ccNext(st,g.ps);
    });}
    if(a==='again')return c.update((st,g)=>{g.st=G.chaos.setup(g.ps);});
  }
};
/* ===== games, part 3: number & word games ===== */

/* ---------- 숫자 코드 (타일 추리) ---------- */
const tkey=t=>t.n*2+(t.c==='w'?1:0);
const cdAlive=(st,ps)=>ps.filter(p=>!st.out.includes(p));
function cdCheck(st,p,ps,n){if(st.hands[p].every(t=>t.o)&&!st.out.includes(p)){st.out.push(p);logp(st,n(p)+' 코드가 모두 풀려 탈락!');}const al=cdAlive(st,ps);if(al.length<=1){st.phase='end';st.winner=al[0]||null;}}
function cdNext(st,ps){if(st.phase==='end')return;let i=st.turn;for(let k=0;k<ps.length;k++){i=(i+1)%ps.length;if(!st.out.includes(ps[i]))break;}st.turn=i;st.drawn=null;st.phase=st.pool.length?'draw':'guess';}
function cdInsert(st,p,t){st.hands[p].push(t);st.hands[p].sort((a,b)=>tkey(a)-tkey(b));}
const tileH=(t,mine,extra,act,arg)=>{const show=t.o||mine;const cls=`ct2 ${t.c}${t.o?' open':''}${!t.o?' hid':''}${mine?' mine':''}${extra||''}`;
  return act?`<button type="button" class="${cls}" data-act="${act}" data-arg="${arg}">${show?t.n:''}</button>`:`<span class="${cls}">${show?t.n:''}</span>`;};
G.code={name:'숫자 코드',icon:'코',tag:'추리',min:2,max:4,
  rules:['0~11 숫자가 적힌 검은·흰 타일을 받아요. 내 타일은 작은 수부터 정렬되고, 숫자가 같으면 검은색이 왼쪽.','내 차례: 타일 1장을 뽑고, 남의 숨은 타일 하나를 골라 숫자를 맞혀요.','맞히면 그 타일이 공개되고 더 맞힐지 멈출지 골라요. 틀리면 내 타일 하나가 공개돼요.','타일이 모두 공개되면 탈락. 마지막까지 남은 사람이 승리!'],
  setup(ps){const all=[];for(let i=0;i<12;i++){all.push({n:i,c:'b',o:false});all.push({n:i,c:'w',o:false});}const pool=shuffle(all);const k=ps.length>=4?3:4;const st={hands:{},pool,turn:0,phase:'draw',drawn:null,out:[],winner:null,last:'',log:[]};ps.forEach(p=>{st.hands[p]=[];for(let i=0;i<k;i++)cdInsert(st,p,pool.pop());});return st;},
  view(c){
    const st=c.st,p=tp(c),mine=myTurn(c),ui=c.ui;let h='';
    if(st.phase==='end'){h+=`<div class="secret cool"><p>최후의 해독자</p><div class="big">${esc(c.name(st.winner))}</div></div>`+(c.isHost?B('한 판 더','again','','big'):'');}
    else h+=`<div class="q"><div class="qn">남은 타일 ${st.pool.length}장</div><div class="qt">${esc(c.name(p))} 차례</div>${st.last?`<div class="qs">${esc(st.last)}</div>`:''}</div>`;
    const canPick=mine&&st.phase==='guess';
    c.ps.filter(q=>q!==c.me||!c.inGame).forEach(q=>{
      h+=`<div class="opp"><div class="row" style="justify-content:space-between">${chip(c,q)}<span class="muted">${st.out.includes(q)?'탈락':''}</span></div><div class="tiles2">${st.hands[q].map((t,i)=>{
        const sel=ui.t&&ui.t.p===q&&ui.t.i===i;const tg=canPick&&!t.o&&!st.out.includes(q);
        return tileH(t,st.phase==='end',(tg?' tgt':'')+(sel?' selt':''),tg?'tsel':'',q+'|'+i);}).join('')}</div></div>`;
    });
    if(c.inGame){
      h+=`<div class="opp" style="border-color:var(--ink)"><div class="row" style="justify-content:space-between"><b>내 코드</b><span class="muted">빨간 줄 = 공개된 타일</span></div><div class="tiles2">${st.hands[c.me].map(t=>tileH(t,true)).join('')}</div>${mine&&st.drawn?`<p class="muted" style="margin-top:6px">뽑은 타일: ${tileH(st.drawn,true)}</p>`:''}</div>`;
    }
    if(st.phase!=='end'){
      if(mine){
        if(st.phase==='draw')h+=B('타일 뽑기','draw','','big');
        else if(st.phase==='guess'){
          if(ui.t&&st.hands[ui.t.p]&&st.hands[ui.t.p][ui.t.i]&&!st.hands[ui.t.p][ui.t.i].o){h+=`<h2>${esc(c.name(ui.t.p))}의 ${ui.t.i+1}번째 타일 숫자는?</h2><div class="pad">${[...Array(12)].map((_,n)=>B(String(n),'guess',ui.t.p+'|'+ui.t.i+'|'+n,'sec')).join('')}</div>`;}
          else h+='<div class="banner">맞힐 상대 타일(노란 테두리)을 눌러요.</div>';
        }else if(st.phase==='more')h+=`<div class="choices two">${B('계속 맞히기','more','')}${B('멈추기','stop','','sec')}</div>`;
      }else h+=`<p class="muted">${esc(c.name(p))}이(가) ${st.phase==='draw'?'타일을 뽑는':'추리하는'} 중…</p>`;
    }
    return h+logView(st);
  },
  act(c,a,v){
    const n=p=>c.name(p),me=c.me;
    if(a==='tsel'){const [p,i]=v.split('|');c.ui.t={p,i:+i};sched();return;}
    if(a==='draw')return c.update((st,g)=>{if(g.ps[st.turn]!==me||st.phase!=='draw')return false;st.drawn=st.pool.pop()||null;st.phase='guess';});
    if(a==='guess'){const [p,i,num]=v.split('|');c.ui.t=null;return c.update((st,g)=>{
      if(g.ps[st.turn]!==me||st.phase!=='guess')return false;const t=st.hands[p]&&st.hands[p][+i];if(!t||t.o)return false;
      if(t.n===+num){t.o=true;st.last=`${n(me)}: ${n(p)}의 타일 ${num} 정답!`;logp(st,st.last);cdCheck(st,p,g.ps,n);if(st.phase!=='end')st.phase='more';}
      else{st.last=`${n(me)}: ${n(p)}의 타일이 ${num}? 땡!`;logp(st,st.last);
        if(st.drawn){st.drawn.o=true;cdInsert(st,me,st.drawn);st.drawn=null;}else{const h=st.hands[me].find(x=>!x.o);if(h)h.o=true;}
        cdCheck(st,me,g.ps,n);cdNext(st,g.ps);}
    });}
    if(a==='more')return c.update((st,g)=>{if(g.ps[st.turn]!==me||st.phase!=='more')return false;st.phase='guess';});
    if(a==='stop')return c.update((st,g)=>{if(g.ps[st.turn]!==me||st.phase!=='more')return false;if(st.drawn)cdInsert(st,me,st.drawn);st.drawn=null;st.last=n(me)+'이(가) 멈췄어요.';cdNext(st,g.ps);});
    if(a==='again')return c.update((st,g)=>{g.st=G.code.setup(g.ps);});
  }
};

/* ---------- 숫자 야구 ---------- */
function bbSecret(){return shuffle([1,2,3,4,5,6,7,8,9]).slice(0,3).join('');}
G.baseball={name:'숫자 야구',icon:'야',tag:'추리',min:2,max:10,
  rules:['게임이 1~9 중 서로 다른 숫자 3개로 비밀 번호를 만들어요.','차례대로 세 자리 숫자를 불러요. 숫자와 자리가 맞으면 스트라이크(S), 숫자만 맞으면 볼(B).','기록은 모두에게 보여요. 남의 기록도 힌트! 3S를 먼저 만들면 승리.'],
  setup(){return {secret:bbSecret(),hist:[],turn:0,phase:'play',winner:null,score:{}};},
  view(c){
    const st=c.st,p=tp(c);let h='';
    if(st.phase==='end')h+=`<div class="secret cool"><p>정답 ${st.secret}</p><div class="big">${esc(c.name(st.winner))} 홈런!</div></div>`+(c.isHost?B('다음 판','again','','big'):'');
    else{h+=`<div class="q"><div class="qn">${st.hist.length}번째 시도까지</div><div class="big3">? ? ?</div><div class="qs">${esc(c.name(p))} 차례</div></div>`;
      h+=myTurn(c)?F('g','서로 다른 숫자 3개 (예: 382)','던지기','inputmode="numeric" maxlength="3"'):`<p class="muted">${esc(c.name(p))}이(가) 숫자를 고르는 중…</p>`;}
    h+=`<ul class="reslist">${st.hist.slice().reverse().map(x=>`<li>${chip(c,x.p)}<b style="font-family:var(--display);font-size:20px;letter-spacing:.1em">${x.g}</b><span class="kv">${x.s?x.s+'S ':''}${x.b?x.b+'B':''}${!x.s&&!x.b?'아웃':''}</span></li>`).join('')}</ul>`;
    return h;
  },
  act(c,a,v){
    if(a==='g'){const s=String(v).trim();if(!/^[1-9]{3}$/.test(s)||new Set(s).size<3)return c.toast('1~9 중 서로 다른 숫자 3개를 입력해요.');
      return c.update((st,g)=>{if(st.phase!=='play'||g.ps[st.turn]!==c.me)return false;let S=0,Bl=0;[...s].forEach((d,i)=>{if(st.secret[i]===d)S++;else if(st.secret.includes(d))Bl++;});st.hist.push({p:c.me,g:s,s:S,b:Bl});
        if(S===3){st.phase='end';st.winner=c.me;addScore(st,c.me,1);}else st.turn=(st.turn+1)%g.ps.length;});}
    if(a==='again')return c.update((st,g)=>{st.secret=bbSecret();st.hist=[];st.phase='play';st.winner=null;st.turn=(st.turn+1)%g.ps.length;});
  }
};

/* ---------- 폭탄 숫자 (업다운) ---------- */
G.updown={name:'폭탄 숫자',icon:'업',tag:'파티',min:2,max:10,
  rules:['1~100 사이 어딘가에 폭탄 숫자가 숨어 있어요.','차례대로 범위 안의 숫자를 하나 불러요. 업/다운에 따라 범위가 줄어들어요.','폭탄 숫자를 부른 사람이 벌칙!'],
  setup(){return {secret:rnd(1,100),lo:1,hi:100,turn:0,phase:'play',loser:null,hist:[],lose:{}};},
  view(c){
    const st=c.st,p=tp(c);let h='';
    if(st.phase==='boom')h+=`<div class="secret hot"><p>폭탄은 ${st.secret}!</p><div class="big">${esc(c.name(st.loser))} 펑!</div><p>벌칙 당첨!</p></div>`+(c.isHost?B('다시 하기','again','','big'):'');
    else{h+=`<div class="q"><div class="qn">남은 범위</div><div class="big3">${st.lo} ~ ${st.hi}</div><div class="qs">${esc(c.name(p))} 차례</div></div>`;
      h+=myTurn(c)?F('g',st.lo+'~'+st.hi+' 중 하나','부르기','inputmode="numeric" maxlength="3"'):`<p class="muted">${esc(c.name(p))}이(가) 숫자를 고르는 중…</p>`;}
    h+=`<ul class="reslist">${st.hist.slice().reverse().map(x=>`<li>${chip(c,x.p)}<b>${x.n}</b><span class="kv">${x.r}</span></li>`).join('')}</ul>`;
    const L=Object.keys(st.lose).filter(k=>st.lose[k]);if(L.length)h+=`<p class="muted">벌칙 기록: ${L.map(k=>esc(c.name(k))+' '+st.lose[k]+'번').join(', ')}</p>`;
    return h;
  },
  act(c,a,v){
    if(a==='g'){const x=parseInt(v,10);if(!(x>=c.st.lo&&x<=c.st.hi))return c.toast(c.st.lo+'~'+c.st.hi+' 사이 숫자를 불러요.');
      return c.update((st,g)=>{if(st.phase!=='play'||g.ps[st.turn]!==c.me||x<st.lo||x>st.hi)return false;
        if(x===st.secret){st.phase='boom';st.loser=c.me;st.lose[c.me]=(st.lose[c.me]||0)+1;st.hist.push({p:c.me,n:x,r:'펑!'});return;}
        if(x<st.secret){st.lo=x+1;st.hist.push({p:c.me,n:x,r:'업 ▲'});}else{st.hi=x-1;st.hist.push({p:c.me,n:x,r:'다운 ▼'});}
        st.turn=(st.turn+1)%g.ps.length;});}
    if(a==='again')return c.update((st,g)=>{Object.assign(st,{secret:rnd(1,100),lo:1,hi:100,phase:'play',loser:null,hist:[]});st.turn=g.ps.indexOf(st.loser)>=0?st.turn:0;});
  }
};

/* ---------- 폭탄 돌리기 ---------- */
G.bomb={name:'폭탄 돌리기',icon:'폭',tag:'순발력',min:3,max:10,
  rules:['진행자가 불을 붙이면 폭탄이 한 사람에게 가요. 언제 터질지는 아무도 몰라요.','폭탄을 든 사람은 주제에 맞는 단어를 외치고 "넘기기"를 눌러 다음 사람에게 넘겨요.','폭탄이 터질 때 들고 있던 사람이 벌칙!'],
  setup(){return {phase:'ready',holder:0,topic:null,fuse:0,passes:0,lose:{},last:null};},
  view(c){
    const st=c.st,hp=c.ps[st.holder];let h='';
    if(st.phase==='ready'){
      h+=`<div class="q"><div class="qn">준비</div><div class="qt">불을 붙이면 주제가 나와요</div>${st.last?`<div class="qs">${esc(st.last)}</div>`:''}</div>`;
      h+=c.isHost?B('불 붙이기','go','','big red'):'<p class="muted">진행자가 불을 붙이길 기다리는 중…</p>';
    }else if(st.phase==='live'){
      h+=`<div class="q"><div class="qn">주제</div><div class="qt">${esc(st.topic)}</div><div class="qs">넘긴 횟수 ${st.passes}번 · 째깍째깍…</div></div>`;
      if(c.me===hp)h+=`<div class="secret hot"><p>폭탄이 나한테!</p><div class="big">${esc(st.topic)} 하나 외치고</div></div>`+B('넘기기 →','pass','','big red');
      else h+=`<div class="secret"><p>폭탄을 든 사람</p><div class="big">${esc(c.name(hp))}</div></div>`;
      if(!c.online&&c.me!==hp)h+=B(esc(c.name(hp))+' 대신 넘기기','pass','','sec');
    }else{
      h+=`<div class="secret hot"><p>펑!</p><div class="big">${esc(c.name(hp))}</div><p>벌칙 당첨! (넘긴 횟수 ${st.passes}번)</p></div>`+(c.isHost?B('다시 하기','again','','big'):'');
    }
    const L=Object.keys(st.lose).filter(k=>st.lose[k]);if(L.length)h+=`<p class="muted">벌칙 기록: ${L.map(k=>esc(c.name(k))+' '+st.lose[k]+'번').join(', ')}</p>`;
    return h;
  },
  act(c,a){
    if(a==='go')return c.update((st,g)=>{if(st.phase!=='ready')return false;st.topic=BOMB_TOPICS[draw(st,'b',BOMB_TOPICS.length)];st.holder=rnd(0,g.ps.length-1);st.fuse=Date.now()+rnd(20,45)*1000;st.passes=0;st.phase='live';});
    if(a==='pass')return c.update((st,g)=>{if(st.phase!=='live')return false;if(c.online&&g.ps[st.holder]!==c.me)return false;st.holder=(st.holder+1)%g.ps.length;st.passes++;});
    if(a==='again')return c.update(st=>{if(st.phase!=='boom')return false;st.phase='ready';});
  },
  tick(c){if(c.st.phase==='live'&&Date.now()>=c.st.fuse)c.update((st,g)=>{if(st.phase!=='live'||Date.now()<st.fuse)return false;st.phase='boom';const p=g.ps[st.holder];st.lose[p]=(st.lose[p]||0)+1;st.last=g.names[p]+' 펑!';});}
};

/* ---------- 끝말잇기 ---------- */
const CHAIN_SEC=20;
G.chain={name:'끝말잇기',icon:'끝',tag:'순발력',min:2,max:10,
  rules:['앞 단어의 마지막 글자로 시작하는 두 글자 이상 한글 단어를 입력해요. 두음법칙 OK (예: 력→역).','이미 나온 단어는 안 돼요. 제한 시간 20초!','시간 안에 못 이으면 탈락. 이상한 단어는 진행자가 탈락시킬 수 있어요. 마지막 생존자가 승리.'],
  setup(ps){const w=pick(CHAIN_START);return {chain:[{w,p:null}],used:{[w]:1},alive:ps.slice(),turn:0,ends:Date.now()+CHAIN_SEC*1000+5000,phase:'play',winner:null,last:'시작 단어: '+w};},
  view(c){
    const st=c.st;let h='';
    const last=st.chain[st.chain.length-1].w,lc=last[last.length-1];const ok=dueum(lc);
    const cur=st.alive[st.turn];
    if(st.phase==='end')h+=`<div class="secret cool"><p>끝까지 살아남은</p><div class="big">${esc(c.name(st.winner))}</div></div>`+(c.isHost?B('다시 하기','again','','big'):'');
    else{
      h+=`<div class="q"><div class="qn">"${esc(ok.join('/'))}"(으)로 시작</div><div class="big3">${esc(last)}</div><div class="qs">${esc(c.name(cur))} 차례 · ${timer(st.ends)}</div></div>`;
      if(c.me===cur)h+=F('w',ok.join('/')+'(으)로 시작하는 단어','잇기','maxlength="10"');
      else if(c.inGame&&!st.alive.includes(c.me))h+='<div class="banner">탈락했어요. 구경하면서 응원해요.</div>';
      else h+=`<p class="muted">${esc(c.name(cur))}이(가) 생각하는 중…</p>`;
      if(c.isHost&&st.chain.length>1)h+=B('방금 단어 무효 (그 사람 탈락)','veto','','sec');
    }
    if(st.last)h+=`<div class="banner">${esc(st.last)}</div>`;
    h+=`<div class="chain">${st.chain.slice(-30).map(x=>`<span title="${x.p?esc(c.name(x.p)):'시작'}">${esc(x.w)}</span>`).join('')}</div>`;
    h+=`<p class="muted">남은 사람: ${chips(c,st.alive)}</p>`;
    return h;
  },
  act(c,a,v){
    if(a==='w'){const w=String(v).trim();const st=c.st;const last=st.chain[st.chain.length-1].w;
      if(!isHangulWord(w))return c.toast('두 글자 이상 한글 단어만 돼요.');
      if(!dueum(last[last.length-1]).includes(w[0]))return c.toast('"'+dueum(last[last.length-1]).join('/')+'"(으)로 시작해야 해요.');
      if(st.used[w])return c.toast('이미 나온 단어예요.');
      return c.update((st,g)=>{if(st.phase!=='play'||st.alive[st.turn]!==c.me)return false;st.chain.push({w,p:c.me});st.used[w]=1;st.last=null;st.turn=(st.turn+1)%st.alive.length;st.ends=Date.now()+CHAIN_SEC*1000;});}
    if(a==='veto')return c.update((st,g)=>{if(st.phase!=='play'||st.chain.length<2)return false;const x=st.chain.pop();delete st.used[x.w];const i=st.alive.indexOf(x.p);
      st.last=`"${x.w}" 무효! ${g.names[x.p]} 탈락.`;if(i>=0){st.alive.splice(i,1);st.turn=i%st.alive.length;}
      if(st.alive.length<=1){st.phase='end';st.winner=st.alive[0];}st.ends=Date.now()+CHAIN_SEC*1000;});
    if(a==='again')return c.update((st,g)=>{g.st=G.chain.setup(g.ps);});
  },
  tick(c){if(c.st.phase==='play'&&Date.now()>c.st.ends)c.update((st,g)=>{if(st.phase!=='play'||Date.now()<=st.ends)return false;const p=st.alive[st.turn];st.alive.splice(st.turn,1);st.last=`${g.names[p]} 시간 초과로 탈락!`;
    if(st.alive.length<=1){st.phase='end';st.winner=st.alive[0];return;}st.turn=st.turn%st.alive.length;st.ends=Date.now()+CHAIN_SEC*1000;});}
};

const GAME_ORDER=['mafia','liar','spy','code','chaos','land','dice','balance','echo','point','son','truth','charades','chosung','bomb','chain','updown','baseball','nunchi','holjjak'];
/* ===== AI players: run on the host's phone ===== */
const BOT_NAMES=['AI 하나','AI 두리','AI 세찌','AI 네오','AI 다섯','AI 여섯'];
const isBot=(g,p)=>!!(g&&g.bots&&g.bots.includes(p));
const WORDBANK=[...new Set([].concat(...Object.values(LIAR),CHARADES,CHOSUNG.map(x=>x[1]),CHAIN_START,SPY.map(s=>s[0]),
 '가구 가지 가위 감자 강물 거미 거울 게임 겨울 계란 고래 고무 공원 과자 구두 국수 군인 그네 그림 기린 기억 기타 김치 나비 나라 낙타 날개 남산 냄비 노래 노을 놀이 누나 눈사람 다리 다람쥐 단추 달걀 담요 당근 대추 도마 도시 돌고래 동전 두부 딸기 라면 레몬 로봇 리본 마늘 마술 만두 매미 머리 모래 모자 무지개 문어 물감 미역 바다 바람 바지 반지 배추 버섯 벌레 별자리 병원 보리 복숭아 볶음밥 부채 비누 비행기 사과 사랑 사슴 사자 상자 새우 생선 설탕 소금 소풍 수박 숟가락 시계 신발 아기 아빠 야구 양말 양파 어묵 얼음 여름 여우 연필 오리 오이 우유 원숭이 유리 은행 의자 이불 인형 자동차 자석 잠옷 장미 저녁 전화 접시 젓가락 정원 조개 종이 주스 지갑 지도 지붕 짜장면 참외 창문 책상 천둥 초밥 축구 치즈 치킨 카메라 칼국수 커피 코끼리 콩나물 크레파스 타조 탁구 토끼 토마토 튤립 파도 팝콘 편지 포도 풍선 피아노 하늘 하마 학교 할머니 햄버거 호두 호박 호수 휴지 흙탕물 이야기 기차역 역사 사다리 리모컨 컵라면 면도기 기러기 기온 온도 도토리 리듬 듬뿍 뿌리 이마 마차 차표 표정 정류장 장갑 갑옷 옷걸이 이름 름 노트 트럭 럭비 비둘기 기적 적금 금요일 일요일 요리 리코더 더위 위성 성탄절 절구 구름 구슬 슬픔 픔 낚시 시소 소나기 기념일 일기 기자 자전거 거북 북극 극장 장난감 감기 기침 침대 대문 문방구 구멍 멍게 게다리 리어카 카드 드럼 럼 바나나 나무 무릎 릎 우산 산책 책 책가방 방석 석류 유령 영화 화분 분수 수영 영어 어깨 깨소금 금붕어 어부 부엌 엌 하품 품 고구마 마녀 녀석 석탄 탄산 산타 타자 자두 두더지 지우개 개구리 리무진 진주 주먹 먹물 물고기 기와 와플 플루트 트로피 피자 자장가 가방 방울 울타리 리본 본드 드레스 스키 키위 위로 로켓 켓'.split(' ')))].filter(w=>/^[가-힣]{2,}$/.test(w));
const ECHO_FB=['수박','삼각김밥','치킨','월요병','딸기','영화관','발라드','충전기','붕어빵','잠','판다','콜라','커피','파전','바퀴벌레','용돈','텐트','팝콘','산타','토스트','바다','설거지','케이크','치킨','노래방','수영','치킨','김밥','행운','잠'];
const HINT_FB=['생각보다 자주 봐요','좋아하는 사람이 많아요','색깔이 먼저 떠올라요','어릴 때 추억이 있어요','어디서든 볼 수 있어요','이름만 들어도 알 거예요','계절이 떠올라요','크기가 애매해요'];
const SPY_Q=['여기 오면 주로 뭐 해요?','여긴 몇 시쯤 붐벼요?','여기서 돈 많이 써요?','여기 올 때 뭐 챙겨요?','여기 혼자 와도 돼요?'];
const TRUTH_FB=['음… 그건 다음 판에 말할게요!','사실 저는 매일 새로 태어나요.','비밀이지만 여러분이 제일 좋아요.','저는 숫자 7을 제일 좋아해요.'];
const DARE_FB=['(상상 속에서 완벽하게 해냈어요!)','몸이 없어서 마음으로 해냈어요.','지금 화면 속에서 열심히 춤추는 중이에요.'];

const others=c=>c.ps.filter(p=>p!==c.me);
const wait=(c)=>c.inputs&&(c.me in c.inputs);

function codeGuess(c){
  const st=c.st,me=c.me;const seen=new Set();
  c.ps.forEach(p=>st.hands[p].forEach(t=>{if(t.o||p===me)seen.add(t.n+t.c);}));if(st.drawn)seen.add(st.drawn.n+st.drawn.c);
  const opts=[];
  c.ps.filter(p=>p!==me&&!st.out.includes(p)).forEach(p=>{const h=st.hands[p];h.forEach((t,i)=>{if(t.o)return;
    let lo=-1,hi=24;for(let j=i-1;j>=0;j--){if(h[j].o){lo=tkey(h[j]);break;}}for(let j=i+1;j<h.length;j++){if(h[j].o){hi=tkey(h[j]);break;}}
    const cands=[...Array(12).keys()].filter(n=>{const k=n*2+(t.c==='w'?1:0);return k>lo&&k<hi&&!seen.has(n+t.c);});
    opts.push({p,i,cands:cands.length?cands:[...Array(12).keys()]});});});
  if(!opts.length)return null;
  opts.sort((a,b)=>a.cands.length-b.cands.length);
  const o=Math.random()<.7?opts[0]:pick(opts);
  return {a:'guess',v:o.p+'|'+o.i+'|'+pick(o.cands)};
}
function bbGuess(st){
  const all=[];for(let a=1;a<10;a++)for(let b=1;b<10;b++)for(let d=1;d<10;d++)if(a!==b&&b!==d&&a!==d)all.push(''+a+b+d);
  const ok=all.filter(s=>st.hist.every(h=>{let S=0,Bl=0;[...h.g].forEach((x,i)=>{if(s[i]===x)S++;else if(s.includes(x))Bl++;});return S===h.s&&Bl===h.b;}));
  return pick(ok.length?ok:all);
}
async function chainWord(st,c){
  const last=st.chain[st.chain.length-1].w,ok=dueum(last[last.length-1]);
  const t=await (c.ask||askAI)(`끝말잇기 중이에요. "${ok.join('" 또는 "')}"(으)로 시작하는 2~4글자 한국어 명사 하나를 말해 주세요. 이미 나온 단어: ${Object.keys(st.used).slice(-40).join(', ')}`);
  const valid=w=>w&&isHangulWord(w)&&ok.includes(w[0])&&!st.used[w];
  if(valid(t))return t;
  const w2=shuffle(WORDBANK).find(valid);return w2||null;
}

/* each brain returns {a,v} (a module action), {input:v}, {upd:fn}, or null; may be async */
const BOT={
  liar:liarBrain(false),spy:liarBrain(true),
  mafia(c){const st=c.st,me=c.me,r=st.roles[me];if(!st.alive.includes(me)||wait(c))return null;
    if(st.phase==='night'&&r!=='citizen'){const mates=st.alive.filter(p=>st.roles[p]==='mafia'&&p!==me&&c.inputs[p]);
      if(r==='mafia')return {a:'v',v:mates.length?c.inputs[mates[0]]:pick(st.alive.filter(p=>st.roles[p]!=='mafia'))};
      if(r==='police')return {a:'v',v:pick(st.alive.filter(p=>p!==me&&!st.police.some(x=>x.t===p))) || pick(st.alive.filter(p=>p!==me))};
      return {a:'v',v:Math.random()<.4?me:pick(st.alive)};}
    if(st.phase==='vote'){let pool=st.alive.filter(p=>p!==me&&!(r==='mafia'&&st.roles[p]==='mafia'));const hit=st.police.find(x=>x.m&&st.alive.includes(x.t));if(r==='police'&&hit)return {a:'v',v:hit.t};return {a:'v',v:pool.length?pick(pool):'skip'};}
    return null;},
  balance:c=>c.st.phase==='ask'&&!wait(c)?{a:'a',v:pick(['0','1'])}:null,
  point:c=>c.st.phase==='ask'&&!wait(c)?{a:'a',v:pick(c.ps)}:null,
  nunchi:c=>c.st.phase==='ask'&&!wait(c)?{a:'a',v:String(pick([3,4,5,5,6,6,7,7,8,9,10]))}:null,
  son:c=>c.st.phase==='ask'&&!wait(c)&&c.st.f[c.me]>0?{a:'a',v:Math.random()<.4?'y':'n'}:null,
  holjjak(c){const st=c.st;if(st.phase!=='ask'||wait(c)||!(st.m[c.me]>0))return null;return c.me===st.holder?{a:'a',v:String(rnd(1,Math.min(5,st.m[c.me])))}:{a:'a',v:pick(['odd','even'])};},
  async echo(c){const st=c.st;if(st.phase!=='ask'||wait(c))return null;const t=await (c.ask||askAI)(`이구동성 게임: "${st.q}"에 대해 대부분의 한국 사람이 떠올릴 단어 하나.`);return {a:'a',v:(t&&t.length<=12?t:null)||ECHO_FB[ECHO.indexOf(st.q)]||pick(ECHO_FB)};},
  async truth(c){const st=c.st;if(c.ps[st.turn]!==c.me)return null;
    if(st.phase==='choose')return {a:'pick',v:pick(['truth','dare'])};
    if(st.card&&st.card.ans==null){const t=await (c.ask||askAI)(st.card.k==='truth'?`친구들끼리 진실 게임 중이에요. AI 플레이어인 당신이 다음 질문에 재치 있게 한 문장으로 답해요: ${st.card.t}`:`친구들끼리 도전 게임 중이에요. 몸이 없는 AI 플레이어가 "${st.card.t}" 미션을 했다고 상상하며 재밌게 한 문장으로 묘사해요.`);
      const ans=t||pick(st.card.k==='truth'?TRUTH_FB:DARE_FB);return {upd:(s,g)=>{if(s.phase!=='card'||g.ps[s.turn]!==c.me)return false;s.card.ans=ans;}};}
    if(st.card&&st.card.ans!=null&&Date.now()-(c.ui.ansAt||(c.ui.ansAt=Date.now()))>6000){c.ui.ansAt=0;return {a:'done'};}
    return null;},
  charades:c=>c.st.phase==='ready'&&c.ps[c.st.turn]===c.me?{a:'skipturn'}:null,
  chosung:c=>c.st.phase==='ask'&&!wait(c)&&Math.random()<.06?{input:c.st.w}:null,
  dice(c){const st=c.st,turn=c.ps[st.turn];
    if(st.winner)return null;
    if(turn===c.me&&st.phase==='roll')return {a:'roll'};
    if(st.card&&st.card.type==='mission'){const humansJudge=c.ps.some(p=>p!==turn&&!isBot(c.g,p));if(turn===c.me&&humansJudge)return null;if(turn!==c.me&&humansJudge)return null;if(turn===c.me&&!humansJudge)return {a:Math.random()<.6?'ok':'fail'};if(c.ps.filter(p=>p!==turn&&isBot(c.g,p))[0]===c.me)return {a:Math.random()<.7?'ok':'fail'};return null;}
    if(turn===c.me&&st.card)return {a:'next'};return null;},
  land(c){const st=c.st;if(c.ps[st.turn]!==c.me)return null;if(st.phase==='roll')return {a:'roll'};
    if(st.phase==='buy'){const cell=LAND[st.pos[c.me]];return {a:st.money[c.me]-cell.p>=150?'buy':'pass'};}return null;},
  chaos(c){const st=c.st,me=c.me;if(st.winner||c.ps[st.turn]!==me)return null;const h=st.hands[me],n=h.length;
    if(n===10)return {a:'win'};
    const idx=k=>h.indexOf(k);const opp=others(c);
    const threat=opp.filter(p=>st.hands[p].length>=9&&st.hands[p].length<=11).sort((a,b)=>Math.abs(10-st.hands[a].length)-Math.abs(10-st.hands[b].length))[0];
    if(threat&&Math.random()<.45){for(const k of ['swap','dump2','steal']){if(idx(k)>=0&&(k!=='swap'||Math.abs(10-n)>1))return {a:'play',v:idx(k)+'|'+threat};}if(idx('clean')>=0)return {a:'play',v:idx('clean')+'|'};}
    if(n>10){if(idx('gift')>=0&&n>=12)return {a:'play',v:idx('gift')+'|'+opp.slice().sort((a,b)=>st.hands[a].length-st.hands[b].length)[0]};const k=h.findIndex(x=>!CC[x][2]&&x!=='draw2'&&x!=='all1');if(k>=0)return {a:'play',v:k+'|'};return {a:'play',v:'0|'+opp[0]};}
    if(n<=8&&idx('draw2')>=0)return {a:'play',v:idx('draw2')+'|'};
    if(n<=7&&idx('steal')>=0)return {a:'play',v:idx('steal')+'|'+opp.slice().sort((a,b)=>st.hands[b].length-st.hands[a].length)[0]};
    return {a:'draw'};},
  code(c){const st=c.st;if(st.phase==='end'||c.ps[st.turn]!==c.me)return null;
    if(st.phase==='draw')return {a:'draw'};if(st.phase==='guess')return codeGuess(c);if(st.phase==='more')return {a:Math.random()<.4?'more':'stop'};return null;},
  baseball:c=>c.st.phase==='play'&&c.ps[c.st.turn]===c.me?{a:'g',v:bbGuess(c.st)}:null,
  updown(c){const st=c.st;if(st.phase!=='play'||c.ps[st.turn]!==c.me)return null;return {a:'g',v:String(rnd(st.lo,st.hi))};},
  bomb:c=>c.st.phase==='live'&&c.ps[c.st.holder]===c.me?{a:'pass',v:''}:null,
  async chain(c){const st=c.st;if(st.phase!=='play'||st.alive[st.turn]!==c.me||c.ui.gaveUp===st.chain.length)return null;const w=await chainWord(st,c);if(!w){c.ui.gaveUp=st.chain.length;return null;}return {a:'w',v:w};}
};
function liarBrain(spy){
  return async c=>{
    const st=c.st,me=c.me;
    if(st.phase==='talk'&&!(st.hints&&st.hints[me])){
      let t;
      if(me===st.liar)t=await (c.ask||askAI)(spy?`스파이 게임에서 장소를 모르는 스파이예요. 들키지 않게 어느 장소에나 통할 질문 하나를 짧게 해요.`:`라이어 게임의 라이어예요. 주제는 "${st.cat}"인데 제시어를 몰라요. 들키지 않게 주제 안 어떤 단어에도 통할 애매한 설명 한 마디(15자 이내).`);
      else t=await (c.ask||askAI)(spy?`스파이 게임이에요. 장소는 "${st.place}", 내 역할은 "${st.roles[me]}". 스파이가 장소를 눈치채지 못하게, 하지만 동료는 알아챌 만한 애매한 한 마디(15자 이내). 장소 이름은 말하지 마요.`:`라이어 게임이에요. 주제 "${st.cat}", 제시어 "${st.word}". 라이어가 눈치채지 못하게 애매하지만 동료는 알아챌 설명 한 마디(15자 이내). 제시어는 말하지 마요.`);
      const text=t&&(spy||!st.word||!t.includes(st.word))?t:(spy?pick(SPY_Q):pick(HINT_FB));
      return {upd:(s)=>{if(s.phase!=='talk')return false;s.hints=s.hints||{};s.hints[me]=text;}};
    }
    if(st.phase==='vote'&&!wait(c)){const pool=c.ps.filter(p=>p!==me&&p!==(me===st.liar?me:null));
      const tally={};Object.values(c.inputs).forEach(v=>tally[v]=(tally[v]||0)+1);
      const lead=Object.keys(tally).filter(p=>p!==me).sort((a,b)=>tally[b]-tally[a])[0];
      return {a:'v',v:me===st.liar?pick(pool.filter(p=>p!==me)):(lead&&Math.random()<.5?lead:pick(pool))};}
    if(st.phase==='guess'&&me===st.liar&&!wait(c)){
      if(spy){const t=await (c.ask||askAI)(`스파이 게임에서 사람들의 말: ${Object.values(st.hints||{}).join(' / ')}. 다음 장소 중 가장 그럴듯한 하나만 그대로 답해요: ${SPY.map(s=>s[0]).join(', ')}`);const pl=SPY.find(s=>t&&t.includes(s[0]));return {a:'g',v:pl?pl[0]:pick(SPY)[0]};}
      const t=await (c.ask||askAI)(`라이어 게임. 주제 "${st.cat}". 사람들의 힌트: ${Object.entries(st.hints||{}).filter(([p])=>p!==me).map(([,v])=>v).join(' / ')}. 제시어로 가장 그럴듯한 단어 하나만 답해요. 후보: ${LIAR[st.cat].join(', ')}`);
      const w=LIAR[st.cat].find(x=>t&&t.includes(x));return {a:'g',v:w||pick(LIAR[st.cat])};}
    return null;
  };
}


return {$,esc,B,F,chip,chips,timer,PAL,rid,clone,shuffle,pick,rnd,norm,nr,G,GAME_ORDER,BOT,BOT_NAMES,isBot,LIAR,SPY};
}
if(typeof module!=="undefined")module.exports=boardLogic;
