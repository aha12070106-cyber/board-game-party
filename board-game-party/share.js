/* 더블클릭 실행용: 서버를 켜고, 친구에게 보낼 공개 링크를 만들어요.
   - 필요한 라이브러리가 없으면 자동으로 설치해요.
   - Cloudflare의 무료 임시 터널(가입 필요 없음)로 https://….trycloudflare.com 주소를 만들어요. */
const {spawn,execSync}=require('child_process');
const fs=require('fs'),path=require('path'),https=require('https'),os=require('os');
const DIR=__dirname,PORT=process.env.PORT||3000;
const line=s=>console.log(s);
const big=s=>{const bar='='.repeat(56);line('\n'+bar+'\n'+s+'\n'+bar+'\n');};

function ensureDeps(){
  if(fs.existsSync(path.join(DIR,'node_modules','ws')))return;
  line('처음 실행이라 필요한 파일을 설치하는 중이에요… (1분쯤 걸려요)');
  execSync('npm install --no-audit --no-fund',{cwd:DIR,stdio:'inherit',shell:true});
}
function download(url,dest){
  return new Promise((ok,fail)=>{
    const get=u=>https.get(u,{headers:{'user-agent':'board-game-party'}},res=>{
      if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();return get(new URL(res.headers.location,u).toString());}
      if(res.statusCode!==200){res.resume();return fail(new Error('다운로드 실패 '+res.statusCode));}
      const f=fs.createWriteStream(dest);res.pipe(f);f.on('finish',()=>f.close(ok));f.on('error',fail);
    }).on('error',fail);
    get(url);
  });
}
async function ensureTunnel(){
  const plat=process.platform,arch=os.arch()==='arm64'?'arm64':'amd64';
  const bin=path.join(DIR,'tools',plat==='win32'?'cloudflared.exe':'cloudflared');
  if(fs.existsSync(bin))return bin;
  fs.mkdirSync(path.dirname(bin),{recursive:true});
  const base='https://github.com/cloudflare/cloudflared/releases/latest/download/';
  line('친구에게 보낼 링크를 만드는 도구를 받는 중이에요… (처음 한 번만)');
  if(plat==='win32')await download(base+'cloudflared-windows-amd64.exe',bin);
  else if(plat==='darwin'){const tgz=bin+'.tgz';await download(base+`cloudflared-darwin-${arch}.tgz`,tgz);execSync(`tar -xzf "${tgz}" -C "${path.dirname(bin)}"`);fs.unlinkSync(tgz);}
  else await download(base+`cloudflared-linux-${arch}`,bin);
  if(plat!=='win32')fs.chmodSync(bin,0o755);
  return bin;
}
function openBrowser(url){
  try{
    if(process.platform==='win32')spawn('cmd',['/c','start','',url],{detached:true,stdio:'ignore'});
    else if(process.platform==='darwin')spawn('open',[url],{detached:true,stdio:'ignore'});
    else spawn('xdg-open',[url],{detached:true,stdio:'ignore'});
  }catch(e){}
}
function lanAddress(){
  for(const list of Object.values(os.networkInterfaces()))for(const a of list||[])if(a.family==='IPv4'&&!a.internal)return a.address;
  return null;
}

(async()=>{
  line('보드게임 파티를 준비하는 중이에요…');
  try{ensureDeps();}catch(e){big('설치에 실패했어요. 인터넷 연결을 확인하고 다시 실행해 주세요.');return hold();}
  const server=spawn(process.execPath,[path.join(DIR,'server.js')],{cwd:DIR,env:{...process.env,PORT:String(PORT)},stdio:'inherit'});
  server.on('exit',c=>{big('게임 서버가 멈췄어요. 이 창을 닫고 다시 실행해 주세요.');});
  const lan=lanAddress();
  let bin;
  try{bin=await ensureTunnel();}
  catch(e){
    big(`공개 링크를 만들지 못했어요.\n같은 와이파이에 있는 폰은 이 주소로 들어오면 돼요:\n  http://${lan||'localhost'}:${PORT}`);
    openBrowser(`http://localhost:${PORT}`);return;
  }
  const tun=spawn(bin,['tunnel','--no-autoupdate','--url',`http://localhost:${PORT}`],{cwd:DIR});
  let shown=false;
  const watch=buf=>{const m=String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if(m&&!shown){shown=true;
      big(`준비 완료! 이 링크를 친구들에게 보내세요:\n\n  ${m[0]}\n\n- 이 창을 닫으면 게임도 꺼져요. 노는 동안 켜 두세요.\n- 링크는 실행할 때마다 바뀌어요.${lan?`\n- 같은 와이파이라면 http://${lan}:${PORT} 로도 들어올 수 있어요.`:''}`);
      setTimeout(()=>openBrowser(m[0]),1500);}};
  tun.stdout.on('data',watch);tun.stderr.on('data',watch);
  setTimeout(()=>{if(!shown){big(`공개 링크가 늦어지고 있어요. 조금 더 기다리거나,\n같은 와이파이의 폰은 http://${lan||'localhost'}:${PORT} 로 들어오세요.`);openBrowser(`http://localhost:${PORT}`);}},40000);
  tun.on('exit',()=>{if(shown)big('공개 링크가 끊겼어요. 이 창을 닫고 다시 실행하면 새 링크가 생겨요.');});
  const stop=()=>{try{tun.kill();}catch(e){}try{server.kill();}catch(e){}process.exit(0);};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
})();
function hold(){setTimeout(()=>{},1<<30);}
