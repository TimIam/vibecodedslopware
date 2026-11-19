'use strict';
// Fixed camera and cached cabinet art keep the gloves responsive on small screens.
const wall=document.createElement('canvas');wall.width=960;wall.height=530;
const w=wall.getContext('2d');
function fill(c,x,y,width,height,color){c.fillStyle=color;c.fillRect(x,y,width,height);}
function grad(c,x,y,x2,y2,stops){
  const g=c.createLinearGradient(x,y,x2,y2);stops.forEach(([p,v])=>g.addColorStop(p,v));return g;
}
function poly(c,points,color){
  c.fillStyle=color;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();
}
function ellipse(c,x,y,rx,ry,color){
  c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();
}
function label(c,text,x,y,size,color,align='left'){
  c.save();c.fillStyle=color;c.font='bold '+size+'px Consolas, monospace';c.textAlign=align;c.fillText(text,x,y);c.restore();
}
function stroke(c,path,color,width){
  c.save();c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.strokeStyle=color;c.stroke(new Path2D(path));c.restore();
}
function bolt(c,x,y){
  ellipse(c,x,y+1,4.5,4.5,'#242721');ellipse(c,x,y,3.7,3.7,'#a29f8e');stroke(c,'M '+(x-2)+' '+(y+1)+' l 4 -2','#444438',1.6);
}
function lamp(c,x,y,color,lit){
  ellipse(c,x,y,7,7,'#282b24');ellipse(c,x,y-1,4.6,4.6,color);
  if(lit){c.save();c.shadowBlur=15;c.shadowColor=color;ellipse(c,x,y-1,3.5,3.5,color);c.restore();}
}
function cabinet(){
  fill(w,0,0,960,530,grad(w,0,0,0,250,[[0,'#443e30'],[.45,'#79715a'],[1,'#514f40']]));
  // Angled walls, seams, flanged pipework and a suspended fluorescent light.
  poly(w,[[0,0],[107,45],[107,203],[0,279]],'#4c4b3c');
  poly(w,[[960,0],[854,45],[854,203],[960,279]],'#444638');
  for(const x of [108,340,622,854]){
    fill(w,x,0,3,205,'#373b32');fill(w,x+3,0,2,205,'#968c72');
    for(const y of [21,62,153,186])bolt(w,x+10,y);
  }
  for(const x of [24,53,845,875]){
    fill(w,x,0,14,207,grad(w,x,0,x+14,0,[[0,'#353931'],[.35,'#938c72'],[.55,'#afa58a'],[1,'#45483b']]));
    for(const y of [53,142]){fill(w,x-4,y,22,10,'#4c4a3e');fill(w,x-4,y+1,22,3,'#a59b80');}
  }
  fill(w,367,0,218,12,'#282b25');w.save();w.shadowBlur=28;w.shadowColor='#ffe5a4';
  fill(w,381,9,190,6,'#ffedbf');w.restore();
  // Large stencilled warning plate, wall fan and analog gauge.
  fill(w,145,54,161,103,'#34372e');fill(w,142,50,161,103,'#c89d54');fill(w,148,56,149,91,'#302f26');
  fill(w,151,59,143,85,'#cda355');label(w,'☢',222,116,65,'#38382e','center');label(w,'PLUTONIUM LAB',222,136,15,'#34362c','center');
  for(const x of [148,297])for(const y of [56,148])bolt(w,x,y);
  fill(w,371,48,215,100,'#464a3c');fill(w,374,51,209,93,'#706d58');
  for(let y=59;y<140;y+=9){fill(w,382,y,192,5,'#353c32');fill(w,382,y,192,1,'#9d9679');}
  for(const x of [376,581])for(const y of [54,142])bolt(w,x,y);
  fill(w,650,41,157,128,'#373e34');fill(w,653,43,152,119,'#777967');
  ellipse(w,702,92,38,38,'#343a31');ellipse(w,702,91,33,33,'#d4c9a4');
  for(let i=0;i<11;i++){let a=(152+i*23.5)*Math.PI/180;stroke(w,'M '+(702+Math.cos(a)*25)+' '+(91+Math.sin(a)*25)+' l '+Math.cos(a)*4+' '+Math.sin(a)*4,'#494d3f',2);}
  stroke(w,'M 702 94 L 719 72','#8b4228',2.5);ellipse(w,702,94,4,4,'#434b3c');label(w,'CELL 04',702,111,8,'#575c4d','center');
  [67,91,115].forEach((y,i)=>lamp(w,768,y,['#b7cb79','#8a7756','#725f55'][i],!i));
  fill(w,660,139,135,14,'#484e40');label(w,'CHAMBER MONITOR',727,150,10,'#c2c2a8','center');
  fill(w,88,192,785,13,'#282f27');fill(w,88,192,785,3,'#aaa38a');
  poly(w,[[0,271],[108,206],[851,206],[960,271],[960,530],[0,530]],grad(w,0,205,30,530,[[0,'#989781'],[.12,'#797d6e'],[.62,'#a5a899'],[1,'#60685d']]));
  for(const x of [-150,64,268,480,692,896,1110]){
    stroke(w,'M '+(480+(x-480)*.64)+' 207 L '+x+' 530','#575e5299',2);
  }
  let seed=2906;const rand=()=>((seed=seed*16807%2147483647)/2147483647);
  for(let i=0;i<3800;i++){let x=rand()*960,y=rand()*530;fill(w,x,y,rand()*(y>205?8:3)+1,1,rand()>.5?'#eae7ce13':'#1c201c10');}
  // Recessed work trays are projected directly onto the bench.
  for(const [x,word] of [[238,'INTAKE'],[733,'ARCHIVE']]){
    poly(w,[[x-74,244],[x+73,244],[x+103,462],[x-104,462]],'#51594e');
    poly(w,[[x-70,246],[x+69,246],[x+97,457],[x-98,457]],'#b6b6a3');
    poly(w,[[x-62,251],[x+61,251],[x+86,448],[x-86,448]],grad(w,x,250,x,448,[[0,'#495047'],[1,'#71796c']]));
    label(w,word,x,241,17,'#383f36','center');
    benchY.forEach((y,i)=>{
      ellipse(w,x,y+7,46,20,'#9b9e8b');ellipse(w,x,y+4,44,18,'#343e35');ellipse(w,x,y+6,37,13,'#566153');
      if(x===733){label(w,designs[i].symbol,x,y+12,24,designs[i].color,'center');label(w,designs[i].symbol,x+59,y+9,18,designs[i].color,'center');}
    });
  }
  const pad=[[430,250],[530,250],[553,453],[407,453]];
  poly(w,pad,'#343c34');w.save();w.clip();for(let i=320;i<620;i+=21){poly(w,[[i,249],[i+9,249],[i+99,455],[i+90,455]],'#d4a453');}w.restore();
  poly(w,[[436,257],[524,257],[543,446],[417,446]],'#707466');
  for(let i=0;i<3;i++){ellipse(w,480,benchY[i]+5,28,10,'#828779');}
  label(w,'HANDOFF',480,241,17,'#384137','center');
  for(const [x,y] of [[34,291],[916,291],[39,475],[913,475],[126,224],[829,224]])bolt(w,x,y);
  // Window shadows and soft glass reflections.
  const shade=w.createRadialGradient(478,264,160,478,264,570);shade.addColorStop(0,'#20271b00');shade.addColorStop(1,'#121a174d');fill(w,0,0,960,530,shade);
  poly(w,[[22,0],[67,0],[0,138],[0,45]],'#fff2cf0a');poly(w,[[825,0],[853,0],[733,205],[711,205]],'#fff2cf09');
}
function capsule(p){
  const x=p.x,y=p.y-(p===held?8:0);
  ctx.save();ctx.translate(x,y);ellipse(ctx,6,12+(p===held?8:0),31,10,'#18201948');
  if(p===held)ctx.rotate(hands[active].lean);
  const metal=grad(ctx,-23,0,23,0,[[0,'#454a47'],[.16,'#9fa69e'],[.32,'#e4e7cd'],[.59,'#a4ada1'],[.85,'#69756c'],[1,'#393f3b']]);
  ellipse(ctx,0,4,24,9,'#444b42');fill(ctx,-24,-15,48,19,metal);ellipse(ctx,0,3,24,8,metal);
  fill(ctx,-24,-14,48,8,p.color);ellipse(ctx,0,-14,24,8,p.color);ellipse(ctx,0,-17,24,8,'#4a524b');
  ellipse(ctx,0,-19,22,7,'#acb5a9');ellipse(ctx,0,-20,17,5,p.color);
  label(ctx,p.symbol,0,2,15,'#253b33','center');ctx.restore();
}
function glove(index,t){
  const h=hands[index],side=index?-1:1, engaged=index===active,closed=!!held&&engaged;
  const wobble=closed && !matchMedia('(prefers-reduced-motion: reduce)').matches?Math.sin(t*.006)*1.25:0;
  const x=h.x+wobble,y=h.y;
  const anchor=index?825:135;
  const sleeve=grad(ctx,anchor-48,0,anchor+80,0,[[0,'#222c39'],[.23,'#394859'],[.49,'#576779'],[.67,'#405164'],[1,'#242e36']]);
  const ax=anchor,ay=569,wx=x-side*20,wy=y+88;
  ctx.save();
  ctx.beginPath();ctx.moveTo(ax-65,ay);ctx.quadraticCurveTo(ax-48,(ay+wy)/2,wx-29,wy);
  ctx.lineTo(wx+29,wy);ctx.quadraticCurveTo(ax+48,(ay+wy)/2,ax+66,ay);ctx.closePath();ctx.fillStyle=sleeve;ctx.fill();
  for(let i=1;i<=9;i++){let u=i/10,cx=ax+(wx-ax)*u,cy=ay+(wy-ay)*u,rad=60-32*u;
    stroke(ctx,'M '+(cx-rad)+' '+cy+' Q '+cx+' '+(cy+12)+' '+(cx+rad)+' '+(cy-1),'#19232e91',4);
    stroke(ctx,'M '+(cx-rad+2)+' '+(cy-3)+' Q '+cx+' '+(cy+7)+' '+(cx+rad-2)+' '+(cy-4),'#96a6b23d',2);
  }
  ctx.translate(x,y);ctx.scale(side,1);ctx.rotate(.22+h.lean*side);
  const rubber=grad(ctx,-42,20,38,38,[[0,'#253e54'],[.2,'#486b83'],[.42,'#698b9e'],[.64,'#52738b'],[1,'#283f54']]);
  const palm=new Path2D('M -31 94 Q -39 73 -33 50 Q -37 25 -25 9 Q -16 -1 1 4 Q 22 8 25 32 Q 27 58 23 92 Q 1 103 -31 94 Z');
  ctx.fillStyle=rubber;ctx.fill(palm);ctx.strokeStyle='#2d485c';ctx.lineWidth=2;ctx.stroke(palm);
  const fingers=closed?['M -23 34 Q -35 25 -27 9','M -14 23 Q -25 9 -15 -3','M -2 19 Q -9 5 -1 -7','M 9 22 Q 6 5 13 -3','M 18 49 Q 34 35 25 18']:['M -24 35 Q -36 15 -35 2','M -14 24 Q -25 1 -24 -14','M -1 20 Q -8 -4 -6 -22','M 12 23 Q 12 1 16 -13','M 18 52 Q 42 43 41 23'];
  ctx.save();ctx.translate(0,7*h.curl);ctx.scale(1-.06*h.curl,1-.18*h.curl);
  fingers.forEach((d,i)=>{const thick=i===4?17:13;stroke(ctx,d,'#2c4459',thick+3);stroke(ctx,d,i===4?'#587b91':'#5f8298',thick);ctx.save();ctx.translate(-2,-1);stroke(ctx,d,'#9ab3bd60',3);ctx.restore();});
  ctx.restore();
  for(let i=0;i<3;i++)stroke(ctx,'M -27 '+(58+i*9)+' q 22 9 47 -1','#304e627e',2);
  stroke(ctx,'M -31 88 Q -6 98 23 88',engaged?'#edac5b':'#809398',5);
  ctx.restore();
}
cabinet();
function drawScene(t){
  ctx.drawImage(wall,0,0);
  for(const p of pods)if(p!==held)capsule(p);
  glove(1-active,t);
  if(held)capsule(held);
  glove(active,t);
  // A small open sight marks the grasp point just ahead of the palm.
  if(!finished){
    const h=hands[active];ctx.save();ctx.strokeStyle='#ffe7a2';ctx.lineWidth=2;
    for(let i=0;i<4;i++){ctx.beginPath();ctx.arc(h.x,h.y,33,i*Math.PI/2+.2,i*Math.PI/2+.55);ctx.stroke();}ctx.restore();
  }
}
requestAnimationFrame(tick);
