/* 보드게임 파티 서버
   - 방 코드별로 게임 상태를 메모리에 보관하고, 접속한 모든 폰에 실시간으로 보내요.
   - 타이머와 AI 플레이어는 서버에서 돌아가요. (아무도 화면을 안 켜 둬도 멈추지 않아요)
   - ANTHROPIC_API_KEY 환경 변수가 있으면 AI 대사를 Claude가 만들고, 없으면 준비된 문장을 써요. */
const http=require('http'),fs=require('fs'),path=require('path');
const {WebSocketServer}=require('ws');

const PORT=process.env.PORT||3000;
const API_KEY=process.env.ANTHROPIC_API_KEY||'';
const MODEL=process.env.CLAUDE_MODEL||'claude-haiku-5-5';

/* ---------- Claude (optional) ---------- */
let aiCalls=0;
async function askAI(prompt){
  if(!API_KEY)return null;
  if(aiCalls>=4)return null;           // keep a small cap on parallel calls
  aiCalls++;
  try{
    const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),12000);
    const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',signal:ctl.signal,
      headers:{'content-type':'application/json','x-api-key':API_KEY,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model:MODEL,max_tokens:80,messages:[{role:'user',content:prompt+'\n\n다른 말 없이 답만 한 줄로.'}]})});
    clearTimeout(to);
    if(!r.ok){console.warn('Claude API',r.status);return null;}
    const j=await r.json();
    const t=(j.content||[]).map(x=>x.text||'').join('').split('\n').map(s=>s.trim()).filter(Boolean)[0]||'';
    return t.replace(/^["'“”‘’`]+|["'“”‘’`.]+$/g,'').trim().slice(0,60)||null;
  }catch(e){return null;}
  finally{aiCalls--;}
}
const L=require('./logic.js')({askAI,NOW:()=>Date.now()});
const {G,BOT,BOT_NAMES,PAL,rid,clone,pick,rnd}=L;

/* ---------- rooms ---------- */
const rooms=new Map();
function room(code){
  let r=rooms.get(code);
  if(!r){r={code,players:{},game:{seq:0,mod:null},inputs:{},owner:null,clients:new Set(),aiTalk:true,botAt:{},botUi:{},botBusy:false,touched:Date.now()};rooms.set(code,r);}
  r.touched=Date.now();return r;
}
const lobby=r=>Object.keys(r.players).sort((a,b)=>(r.players[a].joinedAt||0)-(r.players[b].joinedAt||0));
const active=r=>r.game&&r.game.mod&&G[r.game.mod]?r.game:null;
function inputsFor(r,round){const o={},at={};for(const [p,d] of Object.entries(r.inputs)){if(d&&d.round===round){o[p]=d.value;at[p]=d.at||0;}}return {o,at};}

let pendingSend=new Set();
function broadcast(r){pendingSend.add(r);if(pendingSend.size===1)setImmediate(flush);}
function flush(){
  for(const r of pendingSend){
    const msg=JSON.stringify({t:'state',players:r.players,game:r.game,inputs:r.inputs,owner:r.owner,aiTalk:r.aiTalk,ai:!!API_KEY,now:Date.now()});
    for(const ws of r.clients)if(ws.readyState===1)ws.send(msg);
  }
  pendingSend.clear();
}
function update(r,fn){
  if(!r.game)return Promise.resolve(false);
  const base=clone(r.game);const {o}=inputsFor(r,base.round);
  const res=fn(base.st,base,o);
  if(res===false)return Promise.resolve(false);
  base.seq=(base.seq||0)+1;r.game=base;broadcast(r);return Promise.resolve(true);
}
function setInput(r,pid,value){const g=active(r);if(!g)return Promise.resolve();r.inputs[pid]={round:g.round,value,at:Date.now()};broadcast(r);return Promise.resolve();}
function ctxFor(r,pid,toast,ui){
  const g=r.game,{o,at}=inputsFor(r,g.round);
  return {me:pid,g,st:g.st,ps:g.ps,inGame:g.ps.includes(pid),isHost:g.host===pid,online:true,
    name:p=>(g.names&&g.names[p])||(r.players[p]&&r.players[p].name)||'?',
    color:p=>(g.colors&&g.colors[p])||(r.players[p]&&r.players[p].color)||'#999',
    inputs:o,inputAt:at,update:fn=>update(r,fn),input:v=>setInput(r,pid,v),toast:toast||(()=>{}),ui:ui||{}};
}

/* ---------- messages from phones ---------- */
function onMessage(ws,msg){
  const r=ws.room;if(!r)return;const me=ws.pid;
  const toast=t=>{if(ws.readyState===1)ws.send(JSON.stringify({t:'toast',msg:t}));};
  const g=active(r);
  switch(msg.t){
    case 'join':{
      const n=String(msg.name||'').trim().slice(0,10);if(!n)return toast('이름을 입력해 주세요.');
      const used=Object.entries(r.players).filter(([p])=>p!==me).map(([,p])=>p.color);
      r.players[me]={name:n,color:(r.players[me]&&r.players[me].color)||PAL.find(c=>!used.includes(c))||pick(PAL),joinedAt:(r.players[me]&&r.players[me].joinedAt)||Date.now()};
      if(!r.owner)r.owner=me;broadcast(r);return;}
    case 'leave':delete r.players[me];if(r.owner===me)r.owner=lobby(r).find(p=>!r.players[p].bot)||null;broadcast(r);return;
    case 'kick':{const t=String(msg.p||'');const pl=r.players[t];if(!pl)return;
      if(!(r.owner===me||(pl.bot&&!g)))return toast('방장만 다른 사람을 뺄 수 있어요.');delete r.players[t];broadcast(r);return;}
    case 'bot':{
      if(g)return toast('게임 중에는 AI를 추가할 수 없어요.');if(lobby(r).length>=10)return toast('최대 10명이에요.');
      if(!r.players[me])return toast('먼저 입장해 주세요.');
      const usedN=Object.values(r.players).filter(p=>p.bot).map(p=>p.name);const name=BOT_NAMES.find(n=>!usedN.includes(n))||('AI '+rnd(7,99));
      const usedC=Object.values(r.players).map(p=>p.color);r.players['bot'+rid()]={name,color:PAL.find(c=>!usedC.includes(c))||pick(PAL),joinedAt:Date.now(),bot:true};
      broadcast(r);return;}
    case 'aitalk':r.aiTalk=!!msg.on;broadcast(r);return;
    case 'start':{
      const m=G[msg.mod];if(!m)return;if(!r.players[me])return toast('먼저 입장해 주세요.');
      const lp=lobby(r);if(lp.length<m.min)return toast(m.min+'명 이상 있어야 해요.');
      const ps=lp.slice(0,m.max);
      const ng={mod:msg.mod,gid:rid(),host:me,ps,names:{},colors:{},round:rid(),seq:(r.game&&r.game.seq||0)+1};
      ps.forEach(p=>{ng.names[p]=r.players[p].name;ng.colors[p]=r.players[p].color;});
      ng.bots=ps.filter(p=>r.players[p].bot);ng.st=m.setup(ps.slice(),ng);
      r.game=ng;r.botUi={};broadcast(r);return;}
    case 'end':if(!g)return;if(g.host!==me)return toast('진행자만 게임을 끝낼 수 있어요.');update(r,(st,gg)=>{gg.mod=null;gg.st=null;});return;
    case 'host':if(!g||!r.players[me])return;update(r,(st,gg)=>{gg.host=me;});return;
    case 'act':{
      if(!g)return;const m=G[g.mod];
      try{m.act(ctxFor(r,me,toast,{}),String(msg.a||''),String(msg.v==null?'':msg.v));}catch(e){console.error(e);}
      return;}
  }
}

/* ---------- server loop: timers and AI players ---------- */
setInterval(()=>{
  for(const r of rooms.values()){
    const g=active(r);if(!g)continue;
    const m=G[g.mod];
    if(m.tick){try{m.tick(ctxFor(r,g.host));}catch(e){console.error(e);}}
    runBots(r);
  }
},500);
async function runBots(r){
  const g=active(r);if(!g||!g.bots||!g.bots.length||r.botBusy)return;
  const brain=BOT[g.mod];if(!brain)return;
  for(const b of g.bots){
    const sig=[g.gid,g.seq,g.round,b].join(':');
    if(!r.botAt[sig]){r.botAt[sig]=Date.now()+rnd(900,2400);continue;}
    if(Date.now()<r.botAt[sig])continue;
    r.botBusy=true;
    try{
      const ui=r.botUi[b]||(r.botUi[b]={});
      const c=ctxFor(r,b,null,ui);c.ask=p=>r.aiTalk?askAI(p):Promise.resolve(null);
      let d=brain(c);if(d&&d.then)d=await d;
      if(!d)continue;
      const cur=active(r);if(!cur||cur.seq!==g.seq||cur.round!==g.round)continue;
      if(d.input!==undefined)await setInput(r,b,d.input);
      else if(d.upd)await update(r,d.upd);
      else await G[g.mod].act(ctxFor(r,b,null,ui),d.a,d.v);
      return;
    }catch(e){console.error(e);}
    finally{r.botBusy=false;}
  }
  if(Object.keys(r.botAt).length>500)r.botAt={};
}

/* forget rooms nobody has used for 6 hours */
setInterval(()=>{const cut=Date.now()-6*3600e3;for(const [k,r] of rooms)if(r.touched<cut&&!r.clients.size)rooms.delete(k);},600e3);

/* ---------- http + websocket ---------- */
const PUB=path.join(__dirname,'public');
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{
  let u=decodeURIComponent((req.url||'/').split('?')[0]);
  if(u==='/healthz'){res.writeHead(200);return res.end('ok');}
  if(u==='/logic.js'){res.writeHead(200,{'content-type':TYPES['.js'],'cache-control':'no-cache'});return fs.createReadStream(path.join(__dirname,'logic.js')).pipe(res);}
  if(u==='/'||!path.extname(u))u='/index.html';
  const f=path.join(PUB,path.normalize(u).replace(/^(\.\.[/\\])+/,''));
  if(!f.startsWith(PUB))return res.writeHead(403),res.end();
  fs.readFile(f,(err,buf)=>{if(err){res.writeHead(404);return res.end('not found');}res.writeHead(200,{'content-type':TYPES[path.extname(f)]||'application/octet-stream','cache-control':'no-cache'});res.end(buf);});
});
const wss=new WebSocketServer({server,maxPayload:16*1024});
wss.on('connection',ws=>{
  ws.isAlive=true;ws.on('pong',()=>{ws.isAlive=true;});
  ws.on('message',data=>{
    let msg;try{msg=JSON.parse(String(data));}catch(e){return;}
    if(msg.t==='hello'){
      const code=String(msg.room||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
      const pid=String(msg.pid||'').replace(/[^a-z0-9]/gi,'').slice(0,20);
      if(!code||!pid)return;
      if(ws.room)ws.room.clients.delete(ws);
      ws.room=room(code);ws.pid=pid;ws.room.clients.add(ws);broadcast(ws.room);return;
    }
    if(ws.room){ws.room.touched=Date.now();
      if(msg.t==='aitalk'){ws.room.aiTalk=!!msg.on;broadcast(ws.room);return;}
      onMessage(ws,msg);}
  });
  ws.on('close',()=>{if(ws.room)ws.room.clients.delete(ws);});
});
setInterval(()=>{wss.clients.forEach(ws=>{if(!ws.isAlive)return ws.terminate();ws.isAlive=false;try{ws.ping();}catch(e){}});},30000);
server.listen(PORT,()=>console.log(`보드게임 파티 서버가 ${PORT}번 포트에서 실행 중${API_KEY?' (Claude AI 대사 켜짐)':''}`));
