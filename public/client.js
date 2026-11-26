/* ===== 보드게임 파티: browser side (talks to the server over WebSocket) ===== */
let OFFSET=0;
const L=boardLogic({sched:()=>sched(),NOW:()=>Date.now()+OFFSET});
const {$,esc,B,F,chip,chips,PAL,rid,clone,pick,rnd,G,GAME_ORDER,BOT_NAMES}=L;
function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,v);}catch(e){}}
let ME=lsGet('bg-pid');if(!ME){ME='u'+rid();lsSet('bg-pid',ME);}
const S={online:true,connected:false,isOwner:false,players:{},game:null,inputs:{},owner:null,aiTalk:true,ai:false};
const UI={};
const params=new URLSearchParams(location.search);
const ROOM=(params.get('r')||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);

const lobby=()=>Object.keys(S.players).sort((a,b)=>(S.players[a].joinedAt||0)-(S.players[b].joinedAt||0));
const active=()=>S.game&&S.game.mod&&G[S.game.mod]?S.game:null;
let toastT;
function toast(t){const el=$('toast');el.textContent=t;el.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{el.hidden=true;},3200);}
function inputsFor(round){const o={},at={};for(const [p,d] of Object.entries(S.inputs)){if(d&&d.round===round){o[p]=d.value;at[p]=d.at||0;}}return {o,at};}

/* ----- connection ----- */
let ws=null,retry=0;
function send(m){if(ws&&ws.readyState===1){ws.send(JSON.stringify(m));return true;}toast('서버와 연결이 끊겼어요. 다시 연결하는 중…');return false;}
function connect(){
  if(!ROOM)return;
  const proto=location.protocol==='https:'?'wss':'ws';
  ws=new WebSocket(proto+'://'+location.host+'/ws');
  ws.onopen=()=>{retry=0;S.connected=true;ws.send(JSON.stringify({t:'hello',room:ROOM,pid:ME}));render();};
  ws.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch(x){return;}
    if(m.t==='state'){OFFSET=m.now-Date.now();S.players=m.players||{};S.game=m.game;S.inputs=m.inputs||{};S.owner=m.owner;S.isOwner=m.owner===ME;S.aiTalk=m.aiTalk!==false;S.ai=!!m.ai;sched();}
    else if(m.t==='toast')toast(m.msg);};
  ws.onclose=()=>{S.connected=false;render();setTimeout(connect,Math.min(8000,600*Math.pow(2,retry++)));};
  ws.onerror=()=>{try{ws.close();}catch(e){}};
}

/* module actions: UI-only parts run here; anything that changes the game is sent to the server */
function ctx(){
  const g=S.game,{o,at}=inputsFor(g.round);
  const key=g.mod+':'+(g.gid||'');
  return {me:ME,g,st:g.st,ps:g.ps,inGame:g.ps.includes(ME),isHost:g.host===ME,online:true,
    name:p=>(g.names&&g.names[p])||(S.players[p]&&S.players[p].name)||'?',
    color:p=>(g.colors&&g.colors[p])||(S.players[p]&&S.players[p].color)||'#999',
    inputs:o,inputAt:at,toast,ui:UI[key]||(UI[key]={}),
    update:()=>{},input:()=>{}};
}

/* ----- rendering ----- */
let rq=false,pending=false;
function sched(){if(rq)return;rq=true;setTimeout(()=>{rq=false;render();},0);}
function focusedInStage(){const a=document.activeElement;return a&&a.tagName==='INPUT'&&$('stage').contains(a)&&a.value!=='';}
function render(){
  renderStatus();
  if(!ROOM){$('peoplePanel').innerHTML=helpPanel();$('scorePanel').hidden=true;$('stage').innerHTML=landingView();return;}
  renderPeople();renderScore();
  if(focusedInStage()){pending=true;return;}
  pending=false;
  const g=active();
  $('stage').innerHTML=g?gameView():lobbyView();
  try{afterRender();}catch(e){}
}
document.addEventListener('focusout',()=>{setTimeout(()=>{if(pending)render();},0);});
function renderStatus(){
  const el=$('status');
  if(!ROOM){el.innerHTML='<span class="live off"></span>방을 만들거나 코드를 입력하세요';return;}
  el.innerHTML=(S.connected?'<span class="live"></span>':'<span class="live off"></span>')+`방 <b class="code">${esc(ROOM)}</b>`+(S.connected?'':' · 다시 연결하는 중…');
}
function roomLink(){return location.origin+location.pathname+'?r='+ROOM;}
function landingView(){
  return `<div class="stack"><div><h3>친구들과 같은 방에 모여요</h3><p class="muted" style="margin-top:4px">방을 만들고 링크나 방 코드를 친구에게 보내면 돼요. 계정은 필요 없어요.</p></div>
    ${B('새 방 만들기','x-newroom','','big')}
    <div><h2>받은 방 코드로 들어가기</h2>${F('x-goroom','방 코드 (예: K7QF)','입장','maxlength="8" autocapitalize="characters"')}</div></div>`;
}
function helpPanel(){return `<h2>이렇게 해요</h2><ol class="help"><li>한 명이 방을 만들어요.</li><li>방 링크를 친구들에게 보내요.</li><li>각자 이름을 쓰고 입장해요.</li><li>게임을 고르면 시작!</li></ol>`;}
function renderPeople(){
  const lp=lobby(),g=active();
  let h=`<h2>방 ${esc(ROOM)}</h2><div class="share"><input id="shareLink" readonly value="${esc(roomLink())}" aria-label="방 링크">${B('링크 복사','x-copy','','dark sm')}</div>`;
  if(!S.players[ME])h+=`<p class="muted" style="margin:12px 0 8px">이름을 정하고 입장하세요.</p>${F('x-join','내 이름','입장','maxlength="10" id="joinName"')}`;
  h+='<h2 style="margin-top:16px">참가자 '+lp.length+'명</h2><ul class="people">'+lp.map(p=>{
    const pl=S.players[p];
    const tags=(pl.bot?'<span class="ai">AI</span>':'')+(p===ME?'<span class="me">나</span>':'')+(S.owner===p?'<span class="tag">방장</span>':'')+(g&&g.host===p?'<span class="host">진행</span>':'')+(g&&!g.ps.includes(p)?'<span class="tag">구경</span>':'');
    const nameChip=`<span class="chip"><i style="background:${pl.color}"></i>${esc(pl.name)}</span>`;
    const kick=p!==ME&&(S.isOwner||(pl.bot&&!g&&S.players[ME]))?`<button type="button" class="x" data-act="x-kick" data-arg="${p}" aria-label="${esc(pl.name)} 빼기">×</button>`:'';
    return `<li>${nameChip}${tags}${kick}</li>`;
  }).join('')+'</ul>';
  const nb=lp.filter(p=>S.players[p].bot).length;
  if(!g&&S.players[ME]&&lp.length<10)h+=`<div class="row" style="margin-top:12px">${B('+ AI 추가','x-bot','','dark sm')}${nb&&S.ai?B(S.aiTalk?'AI 대사: Claude가 생각':'AI 대사: 기본 문장','x-aitalk','','sec sm'):''}</div>${nb?'<p class="muted" style="margin-top:6px;font-size:12px">AI와 타이머는 서버에서 움직여요.</p>':''}`;
  if(S.players[ME])h+=`<div class="row" style="margin-top:12px">${B('나가기','x-leave','','sec sm')}</div>`;
  $('peoplePanel').innerHTML=h;
}
function renderScore(){
  const g=active(),el=$('scorePanel');
  const sc=g&&g.st&&g.st.score;
  if(!sc||!Object.keys(sc).length){el.hidden=true;return;}
  const c=ctx();
  const ord=g.ps.slice().sort((a,b)=>(sc[b]||0)-(sc[a]||0));
  const top=Math.max(1,...ord.map(p=>sc[p]||0));
  const rows=ord.map((p,i)=>{const v=sc[p]||0,rk=ord.findIndex(q=>(sc[q]||0)===v)+1;
    return `<li><span class="rk r${rk<=3&&v>0?rk:0}">${rk}</span>${chip(c,p)}<span class="kv">${v}점</span><span class="sbar"><b style="width:${v/top*100}%;background:${c.color(p)}"></b></span></li>`;}).join('');
  el.innerHTML=`<h2>점수판</h2><ul class="scores">${rows}</ul>`;el.hidden=false;
}
const TAGC={'추리':'#8b6cf0','파티':'#ff6b8a','보드':'#2d9cdb','순발력':'#f2994a','카드':'#22a35a'};
const SHORT={mafia:'밤엔 몰래 행동, 낮엔 투표로 마피아 색출',liar:'제시어를 모르는 라이어를 찾아라',spy:'장소를 모르는 스파이를 찾아라',code:'숨은 숫자 타일을 추리해 맞히기',
 chaos:'정확히 10장 들고 선언하면 승리',land:'도시를 사고 통행료 받는 세계일주',dice:'미션 칸 가득한 주사위 레이스',balance:'둘 중 하나, 모두의 선택 공개',
 echo:'남들과 같은 답을 쓰면 점수',point:'가장 ~할 것 같은 사람 지목',son:'해 본 사람 접어! 마지막 생존자',truth:'솔직하게 답하거나 미션 수행',
 charades:'말 없이 몸으로 설명하기',chosung:'초성 보고 먼저 맞히기',bomb:'터지기 전에 폭탄 넘기기',chain:'20초 안에 끝말 잇기',
 updown:'폭탄 숫자를 부르면 벌칙',baseball:'스트라이크·볼로 세 자리 맞히기',nunchi:'안 겹치는 가장 큰 숫자 고르기',holjjak:'쥔 구슬이 홀인지 짝인지'};
const AI_NOTE={charades:'몸이 없어서 설명 차례는 넘기고, 맞히기는 못 해요.',dice:'AI 미션은 사람이 판정하고, 판정할 사람이 없으면 자동으로 정해요.',liar:'Claude가 힌트 한 마디를 만들어요.',spy:'Claude가 질문 한 마디를 만들어요.',truth:'Claude가 진실 답변과 도전 상상을 들려줘요.',echo:'Claude가 많이들 쓸 법한 답을 골라요.',chain:'Claude가 단어를 생각해요.',chosung:'AI도 가끔 정답을 맞혀요.'};
const FILTERS=[['all','전체'],['추리','추리'],['board','보드·카드'],['파티','파티'],['순발력','순발력']];
const inFilter=(m,f)=>f==='all'||!f?true:f==='board'?(m.tag==='보드'||m.tag==='카드'):m.tag===f;
function lobbyView(){
  const lp=lobby(),sel=UI.lobbySel,f=UI.filter||'all',n=lp.length;
  const fits=GAME_ORDER.filter(id=>n>=G[id].min&&n<=G[id].max).length;
  let h=`<div class="stack"><div class="lobbyhead"><div><h3>무슨 게임 할까요?</h3><p class="muted" style="margin-top:4px">${n}명 입장 · 지금 인원으로 할 수 있는 게임 ${fits}개 · 고른 사람이 진행자</p></div></div>`;
  h+=`<div class="filters" role="tablist">${FILTERS.map(([k,l])=>`<button type="button" class="fchip${f===k?' on':''}" data-act="x-filter" data-arg="${k}" aria-pressed="${f===k}">${l}</button>`).join('')}</div>`;
  if(sel&&G[sel]){
    const m=G[sel],ok=n>=m.min,over=n>m.max;
    h+=`<div class="detail${Date.now()-(UI.selAt||0)<500?' anim':''}"><div class="dhead"><span class="gi" style="background:${TAGC[m.tag]}">${m.icon}</span><div style="min-width:0"><h3>${esc(m.name)}</h3><p class="dsub">${esc(SHORT[sel]||'')}</p></div><span class="tag dark">${m.min}~${m.max}명</span></div>
      <ol>${m.rules.map(r=>`<li>${esc(r)}</li>`).join('')}</ol>${AI_NOTE[sel]?`<p class="dsub">AI: ${esc(AI_NOTE[sel])}</p>`:''}
      ${!ok?`<p class="warn">${m.min-n}명이 더 있어야 시작할 수 있어요.</p>`:over?`<p class="warn">앞에서부터 ${m.max}명만 참여하고 나머지는 구경해요.</p>`:''}
      <div class="row">${B('이 게임 시작','x-start',sel,'',!ok||!S.players[ME])}${B('닫기','x-pick','','ghost2')}</div></div>`;
  }
  h+='<div class="tiles">'+GAME_ORDER.filter(id=>inFilter(G[id],f)).map(id=>{const m=G[id],fit=n>=m.min&&n<=m.max,need=n<m.min;
    return `<button type="button" class="gt${sel===id?' sel':''}${need?' dim':''}" data-act="x-pick" data-arg="${id}" style="--gc:${TAGC[m.tag]}"><span class="gi">${m.icon}</span><b>${esc(m.name)}</b><span class="gs">${esc(SHORT[id]||'')}</span><small>${m.tag} · ${m.min}~${m.max}명${need?` · <em>${m.min-n}명 더 필요</em>`:fit?' · <em class="ok">지금 가능</em>':''}</small></button>`;}).join('')+'</div></div>';
  return h;
}
/* whose turn is it, for the turn banner */
function turnOf(c){
  const st=c.st,id=c.g.mod;if(!st)return null;
  if(st.winner||['end','done','boom'].includes(st.phase))return null;
  if(['truth','charades','dice','land','chaos','code','baseball','updown'].includes(id))return c.ps[st.turn]||null;
  if(id==='chain')return st.alive[st.turn]||null;
  if(id==='bomb')return st.phase==='live'?c.ps[st.holder]:null;
  if(id==='holjjak')return st.phase==='ask'?st.holder:null;
  return null;
}
function gameView(){
  const c=ctx(),m=G[c.g.mod];
  let bar=`<div class="gbar" style="--gc:${TAGC[m.tag]}"><div class="ttl"><span class="gi">${m.icon}</span><div style="min-width:0"><h3>${esc(m.name)}</h3><span class="muted">진행자 ${esc(c.name(c.g.host))} · ${c.ps.length}명 참여</span></div></div><div class="row">`;
  if(c.isHost)bar+=B('게임 목록','x-end','','sec sm');
  else if(S.players[ME])bar+=B('내가 진행할게','x-host','','sec sm');
  bar+='</div></div>';
  const t=turnOf(c);
  const turn=t?`<div class="turnpill${t===ME?' mine':''}" style="--pc:${c.color(t)}"><i></i>${t===ME?'내 차례예요!':esc(c.name(t))+' 차례'}</div>`:'';
  let body;
  try{body=m.view(c);}catch(e){console.error(e);body='<p>화면을 그리지 못했어요. 진행자가 게임 목록으로 돌아가 다시 시작해 주세요.</p>';}
  const spect=!c.inGame?`<div class="banner">이번 판은 구경 중이에요.</div>`:'';
  const who='';
  return bar+`<div class="stack">${turn}${who}${spect}${body}</div>`;
}
/* celebrations & nudges */
const seen={};
function afterRender(){
  const g=active();if(!g||!g.st)return;
  const st=g.st,done=st.phase==='end'||st.phase==='done'||(!!st.winner&&st.phase!=='boom');
  const k=g.gid||'x';
  if(!(k in seen)){seen[k]={done,turn:undefined};}
  else if(done&&!seen[k].done)confetti();
  seen[k].done=done;
  const t=turnOf(ctx());
  if(S.online&&t===ME&&seen[k].turn!==ME&&seen[k].turn!==undefined)toast('내 차례예요!');
  seen[k].turn=t;
}
function confetti(){
  if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const cv=document.createElement('canvas');cv.className='confetti';document.body.appendChild(cv);
  const W=cv.width=innerWidth,H=cv.height=innerHeight,x=cv.getContext('2d');
  const cols=['#ffc83d','#ff6b8a','#2fbf71','#2d9cdb','#8b6cf0','#fff'];
  const P=[...Array(140)].map(()=>({x:W/2+(Math.random()-.5)*W*.3,y:H*.35,vx:(Math.random()-.5)*14,vy:-Math.random()*14-4,r:Math.random()*6+4,c:pick(cols),a:Math.random()*6,va:(Math.random()-.5)*.4}));
  let f=0;(function step(){x.clearRect(0,0,W,H);P.forEach(p=>{p.vy+=.35;p.x+=p.vx;p.y+=p.vy;p.vx*=.99;p.a+=p.va;x.save();x.translate(p.x,p.y);x.rotate(p.a);x.fillStyle=p.c;x.fillRect(-p.r/2,-p.r/4,p.r,p.r/2);x.restore();});
    if(++f<110)requestAnimationFrame(step);else cv.remove();})();
}


setInterval(()=>{document.querySelectorAll('[data-ends]').forEach(el=>{el.textContent=Math.max(0,Math.ceil((+el.dataset.ends-Date.now()-OFFSET)/1000));});},500);

/* ----- actions ----- */
function handle(a,v){
  if(a==='x-pick'){UI.lobbySel=v||null;UI.selAt=Date.now();render();if(v){const d=document.querySelector('.detail');if(d&&d.scrollIntoView)d.scrollIntoView({block:'nearest',behavior:'smooth'});}return;}
  if(a==='x-filter'){UI.filter=v;render();return;}
  if(a==='x-newroom'){const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let c='';for(let i=0;i<4;i++)c+=A[Math.floor(Math.random()*A.length)];location.search='?r='+c;return;}
  if(a==='x-goroom'){const c=String(v).toUpperCase().replace(/[^A-Z0-9]/g,'');if(c.length<3)return toast('방 코드를 확인해 주세요.');location.search='?r='+c;return;}
  if(a==='x-copy'){const t=roomLink();const sel=()=>{const i=$('shareLink');if(i){i.focus();i.select();}};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(()=>toast('링크를 복사했어요. 친구에게 보내 주세요!'),()=>{sel();toast('링크를 길게 눌러 복사해 주세요.');});else{sel();toast('링크를 길게 눌러 복사해 주세요.');}return;}
  if(a==='x-join'){if(!String(v).trim())return toast('이름을 입력해 주세요.');send({t:'join',name:v});return;}
  if(a==='x-leave')return send({t:'leave'});
  if(a==='x-kick')return send({t:'kick',p:v});
  if(a==='x-bot')return send({t:'bot'});
  if(a==='x-aitalk')return send({t:'aitalk',on:!S.aiTalk});
  if(a==='x-start'){UI.lobbySel=null;return send({t:'start',mod:v});}
  if(a==='x-end')return send({t:'end'});
  if(a==='x-host')return send({t:'host'});
  const g=active();if(!g)return;
  /* run locally for instant UI feedback (selection, validation); if it would change the game, send it */
  const c=ctx();let sent=false;const go=()=>{if(!sent){sent=true;send({t:'act',a,v});}return Promise.resolve(true);};
  c.update=go;c.input=go;
  try{G[g.mod].act(c,a,v);}catch(e){console.error(e);}
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b||b.disabled)return;handle(b.dataset.act,b.dataset.arg||'');});
document.addEventListener('submit',e=>{
  const f=e.target.closest('form[data-form]');if(!f)return;e.preventDefault();
  const inp=f.querySelector('[name=v]');const v=inp?inp.value:'';if(inp){inp.value='';inp.blur();}
  handle(f.dataset.form,v);
});
render();connect();
