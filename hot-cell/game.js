'use strict';
const canvas = document.querySelector('#world');
const ctx = canvas.getContext('2d');
const el = id => document.getElementById(id);
const designs = [
  {name:'Amber', symbol:'▲', color:'#ffbc4b'},
  {name:'Mint', symbol:'●', color:'#72e1b6'},
  {name:'Lilac', symbol:'◆', color:'#d1a8ff'}
];
const benchY = [285,357,430], handoffX = 480;
const hands = [{x:235,y:473}, {x:733,y:473}];
let pods, active, held, start, elapsed, finished, sound=false, audio, lastTime=0, pointer=null;
let bestTime = 0, pausedAt=null;
try {bestTime = Number(localStorage.getItem('hot-cell.best.1')) || 0;} catch {}
const keys = new Set();
const clamp = (v,lo,hi) => Math.min(hi,Math.max(lo,v));
const timeText = ms => {
  const tenths=Math.floor(ms/100);
  return String(Math.floor(tenths/600)).padStart(2,'0')+':'+String(Math.floor(tenths/10)%60).padStart(2,'0')+'.'+tenths%10;
};
function beep(freq,length=.09){
  if(!sound) return;
  try{
    audio ||= new AudioContext();
    if(audio.state==='suspended') audio.resume().catch(()=>{});
    const osc=audio.createOscillator(),gain=audio.createGain();
    osc.type='triangle';osc.frequency.value=freq;
    gain.gain.setValueAtTime(.1,audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+length);
    osc.connect(gain).connect(audio.destination);osc.start();osc.stop(audio.currentTime+length);
  }catch{}
}
function notice(phase, body){el('phase').textContent=phase;el('hint').textContent=body;}
function rows(){
  el('rows').replaceChildren(...pods.map(p=>{
    const row=document.createElement('div');row.className='row'+(p.docked?' done':'');
    row.innerHTML='<b>'+p.symbol+'</b><span>'+p.name+'</span><em>'+(p.docked?'✓ FILED':p===held?'IN GRIP':p.passed?'HANDOFF':'QUEUED')+'</em>';
    return row;
  }));
}
function selectHand(n){
  active=n;
  el('left').setAttribute('aria-pressed',String(!n));el('right').setAttribute('aria-pressed',String(!!n));
}
function reset(){
  keys.clear();pointer=null;held=null;start=null;pausedAt=null;elapsed=0;finished=false;selectHand(0);
  const order=[0,1,2];
  for(let i=2;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
  pods=designs.map((d,i)=>({...d,idx:i,x:238,y:benchY[order[i]],dockY:benchY[i],passed:false,docked:false}));
  hands.forEach((h,i)=>Object.assign(h,{x:i?816:145,y:396,lean:0,curl:0}));
  el('again').textContent='Reset shift';el('clock').textContent=timeText(0);el('best').textContent=bestTime?timeText(bestTime):'—';el('runstate').textContent='STANDBY';
  notice('01 / PICKUP','Drag a capsule onto the striped handoff pad.');rows();
}
function move(x,y){
  const h=hands[active];
  const nextX=clamp(x,active?405:72,active?888:555);
  h.lean=clamp(h.lean+(nextX-h.x)*.002,-.18,.18);
  h.x=nextX;h.y=clamp(y,235,483);
  if(held){held.x=h.x;held.y=h.y;}
}
function grab(){
  if(finished || held) return;
  const h=hands[active];
  const p=pods.filter(p=>!p.docked).sort((a,b)=>Math.hypot(a.x-h.x,a.y-h.y)-Math.hypot(b.x-h.x,b.y-h.y))[0];
  if(!p || Math.hypot(p.x-h.x,p.y-h.y)>42){notice('OPEN GRIP','Move the glove over a capsule to pick it up.');return;}
  held=p;move(p.x,p.y);
  if(start===null){start=performance.now();el('runstate').textContent='RUNNING';}
  notice(active?'03 / FILE':'02 / PASS',active?'Release '+p.name+' in its '+p.symbol+' socket on the right.':'Release '+p.name+' on the striped center pad.');beep(310);rows();
}
function release(){
  if(!held)return;
  const p=held;held=null;
  if(!active && Math.abs(p.x-handoffX)<=68 && p.y>=251 && p.y<=455){
    p.passed=true;
    p.x=handoffX;p.y=benchY[p.idx];selectHand(1);
    notice('03 / FILE','Right glove ready. Drag '+p.name+' from the pad to its '+p.symbol+' socket.');beep(530);
  }else if(active && p.passed && Math.hypot(p.x-733,p.y-p.dockY)<43){
    p.x=733;p.y=p.dockY;p.docked=true;beep(730);
    if(pods.every(pod=>pod.docked)){
      elapsed=performance.now()-start;finished=true;el('clock').textContent=timeText(elapsed);el('runstate').textContent='COMPLETE';
      const record=!bestTime||elapsed<bestTime;
      if(record){bestTime=elapsed;try{localStorage.setItem('hot-cell.best.1',String(elapsed));}catch{}}
      el('best').textContent=timeText(bestTime);el('again').textContent='New shift';
      notice('SHIFT COMPLETE','All three filed in '+timeText(elapsed)+(record?' · Personal best.':'.'));
    }else{selectHand(0);notice('01 / PICKUP','Capsule filed. Relay the next one across the bench.');}
  }else{
    // Each capsule returns to a separate cradle so a loose drop cannot hide another.
    p.x=p.passed?handoffX:238;p.y=p.passed?benchY[p.idx]:p.homeY;
    notice('MISSED DROP',p.passed?'Capsule returned to the handoff pad. Use the right glove to match its socket.':'Capsule returned to its cradle. Aim for the striped center pad.');beep(140);
  }
  rows();
}
function startShift(){reset();pods.forEach(p=>p.homeY=p.y);}
function switchHand(n){
  if(held){notice('GRIP OCCUPIED','Release the capsule before changing gloves.');return;}
  selectHand(n);
}
function aim(event){
  const r=canvas.getBoundingClientRect();
  move((event.clientX-r.left)*960/r.width,(event.clientY-r.top)*530/r.height);
}
canvas.addEventListener('pointerdown',e=>{
  if(finished||pointer!==null||e.button!==0)return;
  e.preventDefault();canvas.focus({preventScroll:true});pointer=e.pointerId;canvas.setPointerCapture(pointer);aim(e);grab();
});
canvas.addEventListener('pointermove',e=>{if(!finished && (pointer===e.pointerId||pointer===null && e.pointerType==='mouse'))aim(e);});
canvas.addEventListener('pointerup',e=>{if(pointer!==e.pointerId)return;aim(e);pointer=null;release();});
canvas.addEventListener('pointercancel',e=>{if(pointer===e.pointerId){pointer=null;release();}});
window.addEventListener('keydown',e=>{
  if(e.altKey||e.ctrlKey||e.metaKey||e.target.closest('button,a')||finished)return;
  const k=e.key.toLowerCase();
  if(!['arrowleft','arrowright','arrowup','arrowdown',' ','q','w','a','s','d'].includes(k))return;
  e.preventDefault();keys.add(k);if(e.repeat)return;
  if(k===' ')held?release():grab();
  if(k==='q')switchHand(1-active);
});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>keys.clear());
document.addEventListener('visibilitychange',()=>{
  keys.clear();
  if(start===null||finished)return;
  if(document.hidden){pausedAt=performance.now();}
  else if(pausedAt!==null){start+=performance.now()-pausedAt;pausedAt=null;}
});
el('again').onclick=()=>{startShift();canvas.focus({preventScroll:true});};
el('left').onclick=()=>{switchHand(0);canvas.focus({preventScroll:true});};
el('right').onclick=()=>{switchHand(1);canvas.focus({preventScroll:true});};
el('sound').onclick=()=>{sound=!sound;el('sound').textContent='Sound '+(sound?'on':'off');el('sound').setAttribute('aria-pressed',String(sound));beep(450);canvas.focus({preventScroll:true});};
function tick(t){
  const dt=Math.min((t-lastTime)/1000,.05);lastTime=t;
  if(!finished){
    const has=(a,b)=>keys.has(a)||keys.has(b);
    const dx=Number(has('arrowright','d'))-Number(has('arrowleft','a')),dy=Number(has('arrowdown','s'))-Number(has('arrowup','w'));
    if(dx||dy)move(hands[active].x+dx*dt*280,hands[active].y+dy*dt*280);
    if(start!==null && pausedAt===null){elapsed=t-start;el('clock').textContent=timeText(Math.max(0,elapsed));}
  }
  hands.forEach((h,i)=>{
    h.lean*=Math.exp(-dt*8);
    h.curl+=((held&&i===active?1:0)-h.curl)*(1-Math.exp(-dt*17));
  });
  drawScene(t);requestAnimationFrame(tick);
}
startShift();
