"use strict";
const canvas = document.querySelector("#view");
const ctx = canvas.getContext("2d", { alpha: false });
const statusText = document.querySelector("#status");
const forecast = document.querySelector("#weather");
const density = document.querySelector("#density");
const mysteries = document.querySelector("#mysteries");
const menu = document.querySelector("#menu");
const params = new URLSearchParams(location.search);
const width = 1672, height = 941;
const segment = courtyard.frames / courtyard.fps;
let seed = Number(params.get("seed")) || (Math.random() * 4294967296 >>> 0);
function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
}
function shuffled(values) {
    const a = [...values];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function video(src) {
    const v = document.createElement("video");
    v.muted = true; v.defaultMuted = true; v.playsInline = true; v.preload = "metadata";
    v.src = "playback/" + src;
    v.addEventListener("error", () => {
        statusText.hidden = false;
        statusText.textContent = "A room could not load. Keep the playback and source folders beside this file.";
    });
    return v;
}
class Take {
    constructor(src) { this.video = video(src); this.running = false; this.ready = false; this.serial = 0; }
    play(id, duration, offset = 0) {
        const v = this.video, serial = ++this.serial;
        this.running = true; this.ready = false;
        this.begin = id * segment; this.end = this.begin + segment;
        v.pause();
        const start = () => {
            if (this.serial !== serial) return;
            v.playbackRate = segment / duration;
            const target = this.begin + offset * segment;
            const show = () => {
                if (this.serial !== serial) return;
                this.ready = true;
                v.play().catch(err => {
                    if (err.name === "AbortError") return;
                    this.stop();
                    statusText.hidden = false; statusText.textContent = "Click the courtyard to begin playback.";
                    canvas.addEventListener("click", () => { statusText.hidden = true; this.play(id,duration); }, {once:true});
                });
            };
            if (Math.abs(v.currentTime-target)<.001 && v.readyState>=2) show();
            else { v.addEventListener("seeked",show,{once:true}); v.currentTime = target; }
        };
        if (v.readyState >= 1) start(); else v.addEventListener("loadedmetadata",start,{once:true});
    }
    stop() { ++this.serial; this.video.pause(); this.ready = this.running = false; }
    get visible() { return this.ready && this.video.readyState>=2 && !this.video.seeking && this.video.currentTime<this.end; }
    get finished() { return this.running && this.ready && (this.video.ended || this.video.currentTime>=this.end-.01); }
    get phase() { return Math.max(0,Math.min(1,(this.video.currentTime-this.begin)/segment)); }
}
class Home {
    constructor(data,id) {
        Object.assign(this,data);
        this.id=id; this.action=new Take(data.video); this.hall=null; this.deck=[];
        this.next=0; this.nextWalk=random()*66; this.followup=false; this.last=-1; this.hotUntil=0;
    }
    allowed(n) {
        return mysteries.checked || !(this.id===8 && n===2 || this.id===13 && (n===1 || n===2));
    }
    begin(now,initial=false) {
        let n;
        if(this.followup && mysteries.checked) { n=2; this.followup=false; }
        else {
            this.deck=this.deck.filter(i=>this.allowed(i));
            if(!this.deck.length) {
                this.deck=shuffled([0,1,2,3,4].filter(i=>this.allowed(i) && !(this.id===13 && i===2)));
                if(this.deck.length>1 && this.deck[0]===this.last)
                    [this.deck[0],this.deck[1]]=[this.deck[1],this.deck[0]];
            }
            n=this.deck.shift();
        }
        this.last=n;
        if(this.id===13 && n===1) this.followup=true;
        const duration=13.1+random()*2.0;
        this.action.play(n,duration,initial ? .27+random()*.40 : 0);
        if((this.id===0 && n===1)||(this.id===5 && (n===2||n===4))) this.hotUntil=now+duration+12;
    }
    update(now) {
        if(this.action.finished || (this.action.running && !this.allowed(this.last))) {
            this.action.stop(); this.next=now+6+random()*12;
        }
        if(this.hall?.finished) { this.hall.stop(); this.nextWalk=now+36+random()*62; }
        if(now>=this.nextWalk && !this.hall?.running) {
            this.hall ??=new Take(courtyard.passage);
            this.reverse=random()<.5; this.hall.play(Math.floor(random()*4),2.3+random()*.9);
        }
    }
    draw(now) {
        const [x,y,w,h,sash]=this.pane;
        if(this.hall?.visible) {
            const [l,top,r,bottom]=this.door;
            const dx=x+w*l/100,dy=y+h*top/100,dw=w*(r-l)/100,dh=h*(bottom-top)/100;
            const sh=dh*.91,sw=sh*144/104;
            ctx.save(); ctx.beginPath(); ctx.rect(dx,dy,dw,dh); ctx.clip();
            ctx.beginPath();ctx.rect(x,y,w,sash-y);ctx.rect(x,sash+3,w,y+h-sash-3);ctx.clip();
            if(this.reverse) { ctx.translate(2*dx+dw,0); ctx.scale(-1,1); }
            ctx.globalAlpha=.74;
            const px=dx+dw*.5;
            ctx.drawImage(this.hall.video,px-sw*.5,dy+dh-sh-1.4,sw,sh);
            ctx.restore();
        }
        if(now<this.hotUntil) {
            const sx=x+w*(this.id===0?.39:.14),sy=y+h*(this.id===0?.57:.59);
            ctx.save();ctx.beginPath();ctx.rect(x,y,w,sash-y);ctx.rect(x,sash+3,w,y+h-sash-3);ctx.clip();
            for(let i=0;i<9;i++) {
                const rise=(now*.34+i/9)%1;
                ctx.fillStyle="rgba(198,195,178,"+(.055*Math.sin(rise*Math.PI))+")";
                ctx.beginPath();ctx.ellipse(sx+Math.sin(now+3*rise)*rise*2,sy-rise*10,1+rise,1.3+rise,0,0,Math.PI*2);ctx.fill();
            }
            ctx.restore();
        }
        if(this.action.visible) ctx.drawImage(this.action.video,x,y,w,h);
    }
}
const homes=courtyard.rooms.map((d,i)=>new Home(d,i));
let queue=[],nextArrival=0;
function schedule(now) {
    homes.forEach(h=>h.update(now));
    if(now<nextArrival || homes.filter(h=>h.action.running).length>=Number(density.value)) return;
    for(let i=0;i<homes.length;i++) {
        if(!queue.length) queue=shuffled(homes);
        const home=queue.pop();
        if(home.action.running || home.next>now) continue;
        home.begin(now); nextArrival=now+.35+random()*.9; break;
    }
}

const air = {Clear:[0,0,0,.02],Drizzle:[.36,0,.07,.11],Rain:[.87,0,.1,.24],
    Thunderstorm:[1,0,.18,.33],Fog:[0,0,.79,.16],Snow:[0,1,.21,.12]};
const neighbors={Clear:["Drizzle","Fog"],Drizzle:["Clear","Rain","Fog"],Rain:["Drizzle","Thunderstorm"],
    Thunderstorm:["Rain","Drizzle"],Fog:["Clear","Drizzle"],Snow:["Fog","Clear"]};
const winter=random()<.2;
let state=winter?"Snow":"Rain",previous=state,front=-25,nextFront=76+random()*53,flash=-100,nextFlash=8;
if(air[params.get("weather")]) forecast.value=params.get("weather");
if(air[forecast.value]) previous=state=forecast.value;
function switchWeather(name,now) { previous=state;state=name;front=now;nextFront=now+86+random()*84; }
const fog=document.createElement("canvas");fog.width=600;fog.height=125;
const fg=fog.getContext("2d");
for(let i=0;i<56;i++) {
    const x=random()*600,y=34+random()*65,r=30+random()*60;
    for(const shift of [-600,0,600]) {
        const grad=fg.createRadialGradient(x+shift,y,0,x+shift,y,r);
        grad.addColorStop(0,"rgba(153,165,179,.14)");grad.addColorStop(1,"rgba(158,170,184,0)");
        fg.fillStyle=grad;fg.fillRect(x+shift-r,y-r,2*r,2*r);
    }
}
const drops=Array.from({length:380},()=>({x:random()*width,y:random()*height,d:.17+.83*random(),phase:random()*6.28}));
function bank(offset,y,h,amount) {
    if(amount<.006) return;ctx.globalAlpha=amount;
    const x=-width+(offset%width);ctx.drawImage(fog,x,y,width,h);ctx.drawImage(fog,x+width,y,width,h);
}
function drawWeather(t,dt) {
    const manual=forecast.value!=="Changing weather";
    if(manual && forecast.value!==state) switchWeather(forecast.value,t);
    if(!manual && t>nextFront) {
        const choices=neighbors[state];switchWeather(winter && state==="Fog" && random()<.5?"Snow":choices[Math.floor(random()*choices.length)],t);
    }
    let k=Math.max(0,Math.min(1,(t-front)/(manual?2.2:22)));k=k*k*(3-2*k);
    const [rain,snow,mist,cloud]=air[state].map((v,i)=>air[previous][i]*(1-k)+v*k);
    ctx.save();ctx.fillStyle="rgba(22,37,58,"+cloud*.35+")";ctx.fillRect(0,0,width,height);
    bank(t*3.5,-120,345,mist*.66);bank(width-(t*5.1)%width,535,467,mist*.53);ctx.globalAlpha=1;
    if(t>nextFlash) { if(state==="Thunderstorm" && k>.4) flash=t;nextFlash=t+12+random()*27; }
    const age=t-flash;
    if(age>=0 && age<1.3) {
        ctx.fillStyle="rgba(176,197,231,"+(.24*Math.min(1,age*13)*Math.exp(-age*4.4))+")";ctx.fillRect(0,0,width,height);
    }
    const wind=.58+.32*Math.sin(t*.097)+.19*Math.sin(t*.28), count=Math.floor(drops.length*Math.max(rain,snow));
    ctx.strokeStyle="rgba(196,206,216,.21)";ctx.fillStyle="rgba(212,217,226,.67)";ctx.lineWidth=.83;ctx.beginPath();
    for(let i=0;i<count;i++) {
        const d=drops[i],flake=snow>rain, speed=flake?17+d.d*53:285+d.d*505;
        d.x+=dt*(flake?18*wind+16*Math.sin(t+d.phase):speed*wind*.13);d.y+=dt*speed;
        if(d.y>height+12){d.y-=height+34;d.x=random()*(width+50)-30;}
        if(d.x>width+10)d.x-=width+30;
        if(flake){const radius=.45+d.d*d.d;ctx.moveTo(d.x+radius,d.y);ctx.arc(d.x,d.y,radius,0,Math.PI*2);}
        else {const len=(4+12*d.d)*(.6+rain*.4);ctx.moveTo(d.x,d.y);ctx.lineTo(d.x+wind*.13*len,d.y+len);}
    }
    if(snow>rain)ctx.fill();else ctx.stroke();
    if(rain>.08) {
        ctx.strokeStyle="rgba(197,186,165,.18)";
        ctx.beginPath();
        for(let i=0;i<rain*22;i++) {
            const cycle=t*(1+i%3*.12)+i*.751,p=cycle%1;if(p>.6)continue;
            const x=((i*317+Math.floor(cycle)*193)%width),y=906+(i*31+Math.floor(cycle)*13)%33;
            ctx.moveTo(x+1+p*9,y);ctx.ellipse(x,y,1+p*9,.5+p*1.4,0,0,Math.PI*.82);
        }
        ctx.stroke();
    }
    ctx.restore();
}

const plate=new Image();plate.src="playback/courtyard.jpg";
let origin, last=0;
function frame(ms) {
    const now=(ms-origin)/1000,dt=Math.min(.12,Math.max(0,now-last));last=now;
    const sw=Math.max(1,Math.round(innerWidth*Math.min(devicePixelRatio,2))),sh=Math.max(1,Math.round(innerHeight*Math.min(devicePixelRatio,2)));
    if(canvas.width!==sw || canvas.height!==sh){canvas.width=sw;canvas.height=sh;}
    const scale=Math.min(sw/width,sh/height),ox=(sw-width*scale)/2,oy=(sh-height*scale)/2;
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle="#060809";ctx.fillRect(0,0,sw,sh);
    ctx.setTransform(scale,0,0,scale,ox,oy);ctx.save();ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();
    ctx.drawImage(plate,0,0,width,height);schedule(now);homes.forEach(h=>h.draw(now));drawWeather(now,dt);ctx.restore();
    requestAnimationFrame(frame);
}
plate.decode().then(()=>{
    statusText.hidden=true;queue=shuffled(homes);
    for(let i=0;i<Number(density.value);i++)queue.pop().begin(0,true);
    origin=performance.now();requestAnimationFrame(frame);
}).catch(()=>{statusText.textContent="Keep the playback folder beside the HTML file, then reopen it.";});

let hideControls;
function reveal() {
    document.body.classList.remove("quiet");clearTimeout(hideControls);
    hideControls=setTimeout(()=>{if(!menu.open)document.body.classList.add("quiet");},1900);
}
function full() {
    if(document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(()=>{});
}
document.querySelector("#full").onclick=full;canvas.ondblclick=full;
document.addEventListener("pointermove",reveal);menu.addEventListener("toggle",reveal);
document.addEventListener("keydown",e=>{if(e.key.toLowerCase()==="f" && e.target===document.body)full();reveal();});
density.addEventListener("change",()=>{density.value=Math.max(2,Math.min(10,Number(density.value)||7));});
mysteries.addEventListener("change",()=>{if(!mysteries.checked)homes[13].followup=false;});
reveal();
