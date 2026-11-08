// Rain Window. One long sash window at night. Everything beyond the glass is out-of-focus light, baked into
// half-res HDR plates (one blurred, one nearly sharp for what the drops see); traffic and lightning go on top
// each frame. Water lives in a reduced-res additive field (normal, height, coverage): a persistent layer for
// fine beading that running drops wipe clean, plus every bead and rivulet redrawn as instanced sprites.
// One full-screen pass then refracts the scene through that field. Condensation is a third slow buffer.

const VIEWS = {
  city:   { name: 'City', id: 0, hor: .60, far: .652, near: .735, tram: { name: 'tram', len: .92, n: 13, col: [1, .78, .46], v: .17, y: .615 } },
  coast:  { name: 'Coast road', id: 1, hor: .47, far: .69, near: .755, tram: { name: 'train', len: 1.9, n: 26, col: [.86, .9, .72], v: .3, y: .615 } },
  forest: { name: 'Forest road', id: 2, hor: .62, far: .705, near: .775, tram: { name: 'truck', len: .55, n: 7, col: [1, .55, .12], v: .27, y: .695 } },
};
const TINTS = {
  dusk:     { name: 'Dusk', top: [.022, .036, .10], low: [.42, .17, .10], glow: [.30, .10, .05], lit: [.75, .78, .95], lights: .72, veil: [.05, .036, .036] },
  blue:     { name: 'Blue hour', top: [.006, .017, .05], low: [.035, .065, .15], glow: [.10, .06, .05], lit: [.72, .8, 1.05], lights: 1, veil: [.026, .032, .046] },
  midnight: { name: 'Midnight', top: [.0018, .0028, .007], low: [.012, .012, .018], glow: [.05, .026, .018], lit: [.7, .74, 1], lights: 1.12, veil: [.016, .018, .024] },
  dawn:     { name: 'Before dawn', top: [.016, .032, .075], low: [.21, .18, .21], glow: [.14, .09, .08], lit: [.85, .85, .95], lights: .55, veil: [.05, .05, .062] },
};

const WARM = [1, .60, .24], AMBER = [1, .42, .08], SODIUM = [1, .55, .16], WHITE = [1, .88, .72], COOL = [.62, .78, 1], RED = [1, .07, .04], GRN = [.1, 1, .5], TEAL = [.1, .8, .75], PINK = [1, .18, .42], VIOLET = [.5, .25, 1];
const STRIDE = 12, MAXINST = 1 << 16;
const FIELD_T = .25; // the coverage value a droplet's visible edge sits at

const INST_VS = HEAD + `layout(location=0)in vec4 a0;layout(location=1)in vec4 a1;layout(location=2)in vec4 a2;uniform vec2 uW;const vec2 Q[4]=vec2[4](vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(1,1));vec4 W2(vec2 w){return vec4(w.x/uW.x*2.-1.,1.-w.y/uW.y*2.,0.,1.);}`;

// ---- water: one droplet into the field. n is the surface normal, written multiplied by coverage so overlaps blend
const dropVS = INST_VS + `out vec2 vP;out vec2 vK;void main(){vec2 c=Q[gl_VertexID];vP=c;vK=a1.xy;gl_Position=W2(a0.xy+c*a0.zw);}`;
const dropFS = HEAD + `in vec2 vP;in vec2 vK;out vec4 o;void main(){
 vec2 p=vP;p.x*=1.+vK.x*(-p.y)*.55;float r2=dot(p,p);if(r2>=1.){o=vec4(0.);return;}
 float g=(1.-r2);g*=g;vec2 n=p/.707;float rr=min(1.,length(n));float h=sqrt(max(0.,1.-rr*rr));
 g*=vK.y;o=vec4(n*g,h*g,g);}`;

// ---- soft capsule stamps: wiping water off and clearing condensation
const capVS = INST_VS + `out vec2 vP;out vec2 vWp;flat out vec4 vA;flat out float vL;void main(){vec2 c=Q[gl_VertexID];vec2 d=a0.zw-a0.xy;float L=length(d);vec2 t=L>.001?d/L:vec2(1,0),nr=vec2(-t.y,t.x);float r=a1.x,hl=L*.5+r;vec2 m=(a0.xy+a0.zw)*.5;vP=vec2(c.x*hl,c.y*r);vA=a1;vL=L*.5;vWp=m+t*vP.x+nr*vP.y;gl_Position=W2(vWp);}`;
const capFS = HEAD + NOISE + `in vec2 vP;in vec2 vWp;flat in vec4 vA;flat in float vL;uniform float uWhich;out vec4 o;void main(){
 float r=vA.x,kind=vA.w;float d=length(vec2(max(abs(vP.x)-vL,0.),vP.y));
 float a=1.-smoothstep(r*.78,r,d+(kind<.5?(vn(vWp/r*1.6)-.5)*r*.3+(vn(vWp/r*7.)-.5)*r*.07:kind>1.5?(vn(vWp*vec2(.3,.06))-.5)*r*.7:0.));
 float s=uWhich<.5?vA.y:vA.z;
 if(kind>.5&&kind<1.5){float n=vn(vec2(vP.y/r*42.,vP.x*.003))*.55+vn(vec2(vP.y/r*130.,3.))*.45;s*=smoothstep(.12,.42,n+.1);}
 o=vec4(0.,0.,0.,a*s);}`;

// ---- out-of-focus light
const lightVS = INST_VS + `uniform float uScale,uScaleG,uLens;out vec2 vP;out vec2 vOff;flat out vec4 vC;void main(){vec2 c=Q[gl_VertexID];float gl=a1.w;float s=gl>.5?uScaleG:uScale;vec2 e=a0.zw*s;float an=a2.x;float ca=cos(an),sa=sin(an);vec2 q=c*e;vec2 r=vec2(q.x*ca-q.y*sa,q.x*sa+q.y*ca);vP=c;vC=a1;vOff=uLens*(a0.x/uW.x-.5)*vec2(1.,.12);gl_Position=W2(a0.xy+r);}`;
const lightFS = HEAD + `in vec2 vP;in vec2 vOff;flat in vec4 vC;uniform float uI,uHot;out vec4 o;void main(){vec3 c;float r=length(vP);
 if(vC.w>.5){float k=exp(-r*r*3.6);c=vC.rgb*k;}
 else{float e=smoothstep(1.,.8,r)*smoothstep(1.3,1.12,length(vP+vOff));float rim=smoothstep(.45,1.,r);float k=(.68+.24*rim*rim+.16*vP.y*.5+.05*sin(r*11.+vP.x*2.))*e;c=vC.rgb*k;}
 c*=uI;c=min(c,vec3(uHot));o=vec4(c,0.);}`;
const rectVS = INST_VS + `uniform float uSoft;out vec2 vP;flat out vec4 vB;flat out vec4 vC;void main(){vec2 c=Q[gl_VertexID];float s=a2.x*uSoft+1.;vec2 h=a0.zw+vec2(s);vP=c*h;vB=vec4(a0.zw,s,0.);vC=a1;gl_Position=W2(a0.xy+vP);}`;
const rectFS = HEAD + `in vec2 vP;flat in vec4 vB;flat in vec4 vC;out vec4 o;void main(){vec2 d=abs(vP)-vB.xy;float s=vB.z;float x=1.-smoothstep(-s,s,d.x),y=1.-smoothstep(-s,s,d.y);float a=x*y*vC.a;o=vec4(vC.rgb*a,a);}`;

// the world past the glass with nothing lit on it yet
const skyFS = HEAD + NOISE + `uniform vec2 uRes,uWorld;uniform float uU,uHor,uKind,uLit;uniform vec3 uTop,uLow,uGlow;out vec4 o;
void main(){vec2 uv=gl_FragCoord.xy/uRes;vec2 w=vec2(uv.x*uWorld.x,(1.-uv.y)*uWorld.y);float y=w.y/uU,x=w.x/uU;
 float hor=uHor;float c1=fbm(vec2(x*.55,y*1.5)+vec2(2.,uKind*5.));float c2=fbm(vec2(x*1.8-3.,y*4.2));
 float t=clamp(y/hor,0.,1.);vec3 c=mix(uTop,uLow,pow(t,1.7));float hb=smoothstep(hor-.02,hor+.02,y);
 if(uLit>.5){float cl=smoothstep(.3,.78,c1*.7+c2*.4);c=mix(vec3(.22,.26,.38),vec3(1.5,1.6,1.9),cl)*smoothstep(1.05,.2,t*.6);if(y>hor){c*=.05;}o=vec4(c,1.);return;}
 c*=.72+.62*smoothstep(.25,.75,c1);c+=uGlow*exp(-pow((hor-y)/.17,2.))*(.6+.6*c2);
 if(y>hor-.02){float d=max(0.,y-hor);
  vec3 g=mix(uLow*.42,uTop*.5,smoothstep(0.,.5,d));
  float wet=fbm(vec2(x*2.4,y*30.)+7.);g*=.34+.8*wet;
  if(uKind>.5&&uKind<1.5&&y<.58){float sw=fbm(vec2(x*7.,y*90.)+vec2(uKind,0.));g=uLow*.24*(.35+1.1*smoothstep(.45,.8,sw))+uGlow*.15*exp(-d/.04);}
  vec3 gc=g+uGlow*.65*exp(-d/.05);c=mix(c,gc,hb);
  if(y>.88){float q=smoothstep(.88,1.02,y);c=mix(c,uTop*.5+uGlow*.03,q);}
 }
 o=vec4(c,1.);}`;

const copyFS = HEAD + `uniform sampler2D uT;uniform vec4 uMul;out vec4 o;void main(){o=texelFetch(uT,ivec2(gl_FragCoord.xy),0)*uMul;}`;
const scaleFS = HEAD + `uniform sampler2D uT;uniform vec2 uRes;uniform vec3 uMul;out vec4 o;void main(){o=vec4(texture(uT,gl_FragCoord.xy/uRes).rgb*uMul,0.);}`;
const downFS = HEAD + `uniform sampler2D uT;uniform vec2 uRes,uPx;out vec4 o;void main(){vec2 uv=gl_FragCoord.xy/uRes;vec3 c=texture(uT,uv+uPx*vec2(-1,-1)).rgb+texture(uT,uv+uPx*vec2(1,-1)).rgb+texture(uT,uv+uPx*vec2(-1,1)).rgb+texture(uT,uv+uPx*vec2(1,1)).rgb;o=vec4(c*.25,1.);}`;
const blurFS = HEAD + `uniform sampler2D uT;uniform vec2 uRes,uD;out vec4 o;void main(){vec2 uv=gl_FragCoord.xy/uRes;vec3 c=texture(uT,uv).rgb*.227;c+=(texture(uT,uv+uD*1.385).rgb+texture(uT,uv-uD*1.385).rgb)*.316;c+=(texture(uT,uv+uD*3.231).rgb+texture(uT,uv-uD*3.231).rgb)*.07;o=vec4(c,1.);}`;
const refogFS = HEAD + NOISE + `uniform sampler2D uT;uniform vec2 uRes;uniform float uAmt,uK;out vec4 o;void main(){vec4 t=texture(uT,gl_FragCoord.xy/uRes);o=vec4(vec3(t.r*uAmt),clamp(uK*t.g,0.,1.));}`;
const fogTargetFS = HEAD + NOISE + `uniform vec2 uRes,uWorld;uniform float uU;out vec4 o;void main(){vec2 uv=gl_FragCoord.xy/uRes;vec2 w=vec2(uv.x*uWorld.x,(1.-uv.y)*uWorld.y)/uU;
 float a=fbm(w*1.6+3.);float b=fbm(w*5.5+11.);float base=mix(.36,1.,smoothstep(.05,1.,w.y));float f=clamp(base*smoothstep(.14,.56,a+.16*b)+.14,0.,1.);
 float rate=.42+1.05*fbm(w*3.+7.);o=vec4(f,rate,0.,1.);}`;
// a tile of micro-droplets, the texture you see in condensation up close
const microFS = HEAD + `uniform float uN;out vec4 o;vec2 h(vec2 p){p=mod(p,uN);vec3 a=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));a+=dot(a,a.yzx+33.33);return fract((a.xx+a.yz)*a.zy);}
void main(){vec2 p=gl_FragCoord.xy/512.*uN;vec2 ip=floor(p),fp=fract(p);float f1=9.;vec2 best=vec2(0.);for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(i,j),r=g+h(ip+g)-fp;float d=dot(r,r);if(d<f1){f1=d;best=h(ip+g+13.);}}float d=sqrt(f1);float dome=smoothstep(.62,.05,d);o=vec4(dome*(.55+.45*best.x),best.x,best.y,1.);}`;

// the sash: paint, glazing bead, sill. Gamma-space and premultiplied; alpha over glass is also the contact shadow
const frameFS = HEAD + NOISE + `uniform vec3 uM[8];uniform int uN;uniform vec2 uWorld;uniform float uU;out vec4 o;
void main(){vec2 p=gl_FragCoord.xy;p.y=uWorld.y-p.y;int k=0;for(int i=0;i<uN;i++)if(p.x>=uM[i].x&&p.x<uM[i].x+uM[i].y)k=i;vec3 m=uM[k];
 float hw=.03*uU,head=.052*uU,sillH=.098*uU;float x0=m.x+hw,x1=m.x+m.y-hw,y1=m.z-sillH;float dg=min(min(p.x-x0,x1-p.x),min(p.y-head,y1-p.y));
 float railT=-1.,railB=-1.;if(m.z>uU*1.25){railT=uU-sillH;railB=railT+.042*uU;if(p.y>railT&&p.y<railB)dg=-min(p.y-railT,railB-p.y);else if(p.y>=railB)dg=min(dg,p.y-railB);else dg=min(dg,railT-p.y);}
 float gn=fbm(vec2(p.x*.018,p.y*.3)+3.);
 vec3 col=vec3(0.);float a=1.;
 if(dg>0.){ // glass: shadow from the frame, a very faint room in the reflection
  float v=exp(-dg/(.012*uU))*.72+exp(-dg/(.09*uU))*.22;a=clamp(v,0.,.94);
  vec2 q=(p-vec2(m.x+m.y*.74,uU*.2))/(uU*vec2(.62,.42));col=vec3(.042,.026,.015)*exp(-dot(q,q)*1.4);
 } else {
  float dout=-dg;
  if(p.y>y1){ // the sill: top plane catches a reflection, the nose drops to black
   float t=(p.y-y1)/sillH;
   if(t<.6){float g=t/.6;col=mix(vec3(.2,.18,.15),vec3(.075,.064,.052),smoothstep(0.,1.,g))*(.8+.45*gn);a=mix(.34,.95,smoothstep(0.,.95,g));col*=a*.8;}
   else{float g=(t-.6)/.4;col=mix(vec3(.05,.042,.036),vec3(.012,.01,.009),smoothstep(0.,.9,g))*(.8+.4*gn);}
   col+=vec3(.23,.2,.16)*exp(-abs(t-.6)/.012);
   col+=vec3(.12,.11,.09)*exp(-t/.018);
  } else {
   float g=clamp(dout/(.03*uU),0.,1.);
   col=mix(vec3(.04,.034,.03),vec3(.095,.083,.072),smoothstep(.1,.9,g))*(.75+.5*gn);
   if(p.y<head)col*=mix(.5,1.,smoothstep(0.,head,p.y));
   float bead=exp(-pow((dout-5.)/2.6,2.));col+=vec3(.05,.045,.04)*bead;col+=vec3(.1,.095,.085)*exp(-dout/1.4);
  }
  col+=(h12(p+2.1)-.5)/255.*1.5;
 }
 o=vec4(col,a);}`;

// the one full-screen pass
const finalFS = HEAD + `in vec2 vW;uniform sampler2D uFar,uSharp,uBlur,uDrop,uFog,uFrame,uNoise;uniform vec2 uWorld,uShake;uniform vec4 uRip,uView;uniform float uTime,uFlash,uM,uU,uSill;uniform vec3 uVeil;out vec4 o;
float h(vec2 p){vec3 a=fract(vec3(p.xyx)*.1031);a+=dot(a,a.yzx+33.33);return fract((a.x+a.y)*a.z);}
vec3 tone(vec3 c){c=max(c,vec3(0.));c=c*(2.51*c+.03)/(c*(2.43*c+.59)+.14);return pow(c,vec3(1./2.2));}
void main(){
 vec2 uv=vec2(vW.x/uWorld.x,1.-vW.y/uWorld.y);vec4 fr=texture(uFrame,uv);vec3 blur=texture(uBlur,uv).rgb;float gr=(h(vW+fract(uTime)*311.)-.5)*.022;
 if(fr.a>.995){vec3 sp=tone(blur)*.11;o=vec4(fr.rgb*(1.+uFlash*1.8)+sp+gr*.5,1.);return;}
 if(vW.y>uSill){ // what the sill reflects: the lights above it, smeared along the paint
  vec3 rf=texture(uBlur,vec2(uv.x,1.-(2.*uSill-vW.y)/uWorld.y)).rgb;
  o=vec4(tone(rf*.9)*(1.-fr.a)+fr.rgb*(1.+uFlash*2.)+gr,1.);return;}
 vec2 du=uv+uShake;
 if(uRip.w>.001){vec2 dp=vW-uRip.xy;float r=length(dp)/uU;float w=sin(r*58.-uRip.z)*exp(-r*6.5)*uRip.w;du+=(dp/(length(dp)+.001))*w*.004*vec2(uU/uWorld.x,-uU/uWorld.y);}
 vec4 d=texture(uDrop,du);float f=d.a;float aa=max(fwidth(f)*.85,.02);float m=smoothstep(${FIELD_T}-aa,${FIELD_T}+aa,f);
 vec3 far=texture(uFar,uv).rgb;float fg=texture(uFog,uv).r;float fk=smoothstep(.1,.68,fg);
 vec4 nz=texture(uNoise,vW/(uU*.09));
 vec3 fogC=blur*(1.08+.08*nz.r)+uVeil*(.92+.16*nz.g);fogC=mix(fogC,vec3(dot(fogC,vec3(.33))),.06);
 vec3 c=mix(far,fogC,fk*.965);
 c*=1.+uFlash*.12;
 if(m>.003){vec2 n=d.rg/max(f,.002);float len=length(n);float h0=d.b/max(f,.002);
  vec2 ofs=-n*uM;vec2 suv=uv+vec2(ofs.x/uWorld.x,-ofs.y/uWorld.y);vec2 ca=n*.0028;
  vec3 s=vec3(texture(uSharp,suv-ca).r,texture(uSharp,suv).g,texture(uSharp,suv+ca).b);
  float rim=smoothstep(.55,1.03,len);s=s*mix(1.5,.24,rim*rim);s+=far*.1;
  float lip=smoothstep(.42,.95,len)*smoothstep(.0,.85,n.y);s+=blur*lip*.75+vec3(.03,.03,.034)*lip;
  vec3 N=normalize(vec3(n*1.5,max(.2,h0)));float sp=pow(max(0.,dot(N,normalize(vec3(-.5,-.68,.55)))),260.);s+=vec3(2.6,2.5,2.4)*sp*(.35+uFlash*3.);
  c=mix(c,s*(1.-.3*fk)+fogC*.3*fk,m);
 }
 vec3 g=tone(c);o=vec4(g*(1.-fr.a)+fr.rgb*(1.+uFlash*.8)+gr,1.);
}`;

const P = {};
function ensurePrograms() {
  if (P.final) return;
  P.drop = program(dropVS, dropFS); P.cap = program(capVS, capFS); P.light = program(lightVS, lightFS); P.rect = program(rectVS, rectFS);
  P.sky = program(FS_TRI, skyFS); P.copy = program(FS_TRI, copyFS); P.scale = program(FS_TRI, scaleFS); P.down = program(FS_TRI, downFS); P.blur = program(FS_TRI, blurFS);
  P.refog = program(FS_TRI, refogFS); P.fogTarget = program(FS_TRI, fogTargetFS); P.micro = program(FS_TRI, microFS); P.frame = program(FS_TRI, frameFS); P.final = program(QUAD_VS, finalFS);
  P.fade = program(FS_TRI, HEAD + 'out vec4 o;void main(){o=vec4(0.);}');
}

// ---- GL plumbing
let instBuf = null, instVAO = null;
function ensureInst() {
  if (instBuf) return;
  instBuf = gl.createBuffer(); instVAO = gl.createVertexArray(); gl.bindVertexArray(instVAO); gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 4, gl.FLOAT, false, STRIDE * 4, i * 16); gl.vertexAttribDivisor(i, 1); }
  gl.bindVertexArray(null);
}
function drawInst(data, n) { if (!n) return; gl.bindVertexArray(instVAO); gl.bindBuffer(gl.ARRAY_BUFFER, instBuf); gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, n * STRIDE), gl.STREAM_DRAW); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n); }
const Q = (max) => ({ d: new Float32Array(max * STRIDE), n: 0, max });
function qp(q, a, b, c, d, e, f, g, h, i = 0, j = 0, k = 0, l = 0) { if (q.n >= q.max) return; const o = q.n * STRIDE, D = q.d; D[o] = a; D[o + 1] = b; D[o + 2] = c; D[o + 3] = d; D[o + 4] = e; D[o + 5] = f; D[o + 6] = g; D[o + 7] = h; D[o + 8] = i; D[o + 9] = j; D[o + 10] = k; D[o + 11] = l; q.n++; }
function target(rt) { gl.bindFramebuffer(gl.FRAMEBUFFER, rt ? rt.fb : null); if (rt) gl.viewport(0, 0, rt.w, rt.h); gl.disable(gl.DEPTH_TEST); gl.disable(gl.SCISSOR_TEST); }

// ---- world state
const qStatic = Q(26000), qErase = Q(6000), qDyn = Q(MAXINST >> 2), qLive = Q(1200);
let farB, sharpB, farL, sharpL, blurA, blurB, litRT, dropS, dropC, fogRT, fogTgt, frameRT, microT;
let ops = [], botTable = [], drops = [], nextId = 1, time = 0;
let cars = [], tram = null, tramT = 0, signals = [], beacons = [];
let shake = 0, shakeJolt = [0, 0], flash = 0, flashes = [], thunder = -1, boltSegs = [], boltT = 30, rip = [0, 0, 0, 0], gust = 0, gustD = 1, gustT = 8, fogRate = 0;
let netStrokes = [], netRun = [];
let gridHead = null, gridNext = null, gridW = 0, gridH = 0, gridCS = 28, GX = 1;
const view = () => VIEWS[S.view] || VIEWS.city;
const tint = () => TINTS[S.tint] || TINTS.blue;
const fscale = () => lerp(.24, 1.6, S.focus);

// ---- the view out of the window: a list of paint operations, drawn in order
function genOps() {
  const R = mulberry((SEED ^ (view().id * 7919)) >>> 0), r = (a, b) => R() * (b - a) + a, u = unit;
  const O = []; let cur = null;
  const rq = () => { if (!cur || cur.t !== 'r') { cur = { t: 'r', q: Q(2600) }; O.push(cur); } return cur.q; };
  const lq = () => { if (!cur || cur.t !== 'l') { cur = { t: 'l', q: Q(5200) }; O.push(cur); } return cur.q; };
  const rect = (cx, cy, hw, hh, c, a = 1, soft = .02) => qp(rq(), cx, cy, hw, hh, c[0], c[1], c[2], a, soft * u);
  const li = (x, y, rb, c, I, kind = 0, ry = rb, an = 0) => qp(lq(), x, y, rb * u, ry * u, c[0] * I, c[1] * I, c[2] * I, kind, an, rb);
  const t = tint(), L = t.lights;
  const mirror = (x, y, rb, c, I, gy, k = .5) => { const d = gy - y; li(x, gy + d * .55 + rb * u * .3, rb * .78, c, I * k, 1, (d / u) * .62 + rb); };
  const tall = monitors().filter(m => m.wh > u * 1.25);
  const below = () => { for (const m of tall) { const n = 3 + (m.ww / u * 6) | 0; for (let i = 0; i < n; i++) { const c = [WARM, COOL, RED, SODIUM, TEAL][(R() * 5) | 0]; const x = m.wx + R() * m.ww, y = r(u * 1.05, m.wh * .98), rb = r(.05, .13); li(x, y, rb * .7, c, r(.08, .3) * L); li(x, y, rb * 2, c, r(.05, .13) * L, 1, rb * .7); } } };

  if (view().id === 0) { // a street of shops, flats above
    const gy = u * .60;
    const rowB = (y0, hMin, hMax, col, prob, tone) => {
      let x = -u * .25;
      while (x < W + u * .25) {
        const bw = r(.16, .52) * u, h = r(hMin, hMax) * u, top = y0 - h;
        rect(x + bw / 2, (top + y0) / 2, bw / 2, h / 2, col.map(v => v * r(.7, 1.4)), 1, .03);
        const cols = Math.max(2, (bw / (r(.05, .08) * u)) | 0), rows = Math.max(3, (h / (r(.052, .08) * u)) | 0), bias = R();
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { if (R() > prob * (bias < .22 ? 2.2 : bias > .78 ? .35 : 1)) continue; const q = R(), c = q < .55 ? WARM : q < .8 ? WHITE : q < .93 ? COOL : TEAL, wx = x + (i + .5 + r(-.12, .12)) / cols * bw, wy = top + (j + .55 + r(-.1, .1)) / rows * h; const I = r(.1, .55) * L * tone; const rb = r(.009, .02) * (R() < .1 ? 1.5 : 1); li(wx, wy, rb, c, I); if (R() < .3) mirror(wx, wy, rb, c, I, gy, .22); }
        if (R() < .65) li(x + bw / 2, top + h * r(.25, .75), bw / u * .72, R() < .6 ? WARM : COOL, r(.018, .05) * L * tone, 1, h / u * .6);
        x += bw + r(-.02, .05) * u;
      }
    };
    rowB(gy - u * .05, .3, .5, [.0085, .0115, .02], .13, .75);
    rowB(gy, .16, .4, [.0048, .0056, .0092], .21, 1.05);
    for (let x = -u * .2; x < W + u * .2;) { // shopfronts and neon
      const w = r(.14, .46) * u, c = [WARM, WHITE, TEAL, PINK, AMBER, COOL, VIOLET, WARM][(R() * 8) | 0], lit = R();
      if (lit < .72) { const I = r(.1, .36) * L, y = gy - r(.04, .06) * u; rect(x + w / 2, y, w / 2, u * r(.03, .045), c.map(v => v * .16 * L), .7, .03); li(x + w / 2, y, w / u * .62, c, I, 1, .05); mirror(x + w / 2, y, w / u * .5, c, I * 1.1, gy, .55); const n = 2 + (w / u * 16) | 0; for (let i = 0; i < n; i++) { const px = x + R() * w, py = y + r(-.02, .018) * u, rb = r(.012, .028); li(px, py, rb, c, r(.35, 1.1) * L); if (R() < .3) mirror(px, py, rb, c, .35 * L, gy, .4); } }
      if (R() < .35) { const y = gy - r(.1, .25) * u, sc = [PINK, TEAL, VIOLET, RED, AMBER][(R() * 5) | 0], sw = r(.03, .1), I = r(.45, 1.3) * L; li(x + r(0, w), y, sw, sc, I, 1, r(.012, .03)); li(x + r(0, w), y, r(.024, .04), sc, I * .7); mirror(x + w / 2, y, sw, sc, I * .45, gy, .55); }
      x += w + r(.0, .12) * u;
    }
    lq();
    for (let x = -u * .1 + r(0, .3) * u; x < W + u * .3; x += r(.48, .86) * u) { // streetlamps
      const y = r(.2, .27) * u, c = R() < .7 ? SODIUM : WHITE, rb = r(.03, .05), I = r(.5, .9) * L;
      li(x, y, rb, c, I); li(x, y, .2, c, .1 * L, 1, .16); mirror(x, y, .045, c, I * .9, gy, .7); li(x, gy + u * .012, .22, c, .13 * L, 1, .024);
    }
    for (let x = r(.3, .9) * u; x < W; x += r(1.1, 2.2) * u) signals.push({ x, y: r(.36, .43) * u, ph: R() * 12, rb: r(.024, .03) });
    below();
  } else if (view().id === 1) { // the far shore, the sea, the esplanade
    const hor = u * .47, gy = u * .63;
    let x = -u * .3; rect(W / 2, hor - u * .012, W / 2 + u * .6, u * .018, [.006, .008, .014], 1, .03);
    while (x < W + u * .3) { const hw = r(.3, 1.1) * u, hh = r(.03, .085) * u; rect(x, hor - hh, hw, hh, [.008, .01, .018], 1, .05); x += hw * r(.8, 1.3); }
    for (let px = -u * .2; px < W + u * .2; px += r(.008, .05) * u) { const y = hor - r(-.002, .04) * u, c = R() < .6 ? AMBER : R() < .7 ? WHITE : COOL, I = r(.3, 1.3) * L, rb = r(.008, .017); li(px, y, rb, c, I); if (R() < .5) li(px, hor + u * .08, rb * 1.3, c, I * .22, 1, .08); }
    for (let i = 0, n = Math.round(W / u * 2.2); i < n; i++) { const bx = R() * W, by = hor + r(.015, .1) * u, c = R() < .5 ? RED : GRN; li(bx, by, r(.012, .02), WHITE, r(.3, .7) * L); li(bx + u * .03, by - u * .012, r(.009, .014), c, r(.5, 1) * L); li(bx, by + u * .06, .012, WHITE, .12 * L, 1, .06); }
    for (let lx = -u * .2 + r(0, .3) * u; lx < W + u * .2; lx += r(.42, .6) * u) { // the sea-front lamps, in a slow curve
      const y = (.255 + .05 * Math.sin(lx / u * .7 + 1)) * u, I = r(.5, .85) * L, rb = r(.028, .042);
      li(lx, y, rb, R() < .5 ? SODIUM : WHITE, I * .85); li(lx, y, .21, SODIUM, .1 * L, 1, .16); li(lx, gy + u * .03, .17, SODIUM, .11 * L, 1, .022); mirror(lx, y, .055, WHITE, I * .5, gy, .62);
    }
    for (let i = 0; i < 3; i++) li(R() * W, hor - r(.02, .06) * u, r(.016, .024), RED, r(.5, 1) * L);
    beacons.push({ x: r(.55, .85) * W, y: hor - u * .1, ph: R() * 6 });
    below();
  } else { // trees, and a road somebody has to drive home on
    const gy = u * .63;
    for (let i = 0, n = Math.round(W / u * 9); i < n; i++) { const x = R() * W, y = r(.26, .58) * u, c = R() < .62 ? AMBER : R() < .75 ? WARM : COOL, I = r(.2, .9) * L * (R() < .25 ? 1.8 : 1), rb = r(.012, .03); li(x, y, rb, c, I); }
    for (let i = 0, n = Math.round(W / u * 5); i < n; i++) { const x = R() * W, y = r(.3, .56) * u; li(x, y, r(.55, 1.2), [.42, .5, .68], r(.05, .12) * Math.max(L, .8), 1, r(.1, .2)); }
    for (let x = r(.5, 1.5) * u; x < W; x += r(1.6, 3) * u) { const y = r(.17, .24) * u, I = r(.9, 1.3) * L; li(x, y, .055, SODIUM, I); li(x, y, .26, SODIUM, .17 * L, 1, .22); li(x, gy + u * .02, .22, SODIUM, .16 * L, 1, .03); mirror(x, y, .06, SODIUM, I * .7, gy, .65); }
    for (let z = 0; z < 3; z++) { // three depths of trunks: the far ones thin and blue-black, the near ones just shapes
      const n = Math.round(W / u * [18, 10, 5][z]); const col = [[.012, .017, .028], [.0045, .0065, .011], [.0014, .0018, .0026]][z], y1 = gy + u * [.005, .025, .055][z];
      for (let i = 0; i < n; i++) { const x = R() * W, hw = r([.008, .016, .03][z], [.016, .035, .066][z]) * u; rect(x, y1 / 2, hw, y1 / 2, col, 1, [.012, .02, .03][z]); if (z && R() < .5) { const by = r(.08, .4) * u, ang = r(.2, .5) * (R() < .5 ? 1 : -1); rect(x + ang * u * .14, by, u * .11, u * .012, col, .85, .025); } }
    }
    lq(); li(W / 2, u * .35, W / u * .6, [.2, .24, .33], .02 * L, 1, .4);
    below();
  }
  return O;
}
function drawOps(rt, far) {
  // far: the blurred plate. sharp: what a drop's tiny lens resolves
  const fs = fscale(), sc = far ? fs : .07 + .05 * fs, scG = far ? (.75 + .25 * fs) : .55, I = far ? Math.pow(fs, -1.25) : 2.6 + 8 / fs;
  target(rt);
  gl.disable(gl.BLEND);
  const sky = P.sky, t = tint(); gl.useProgram(sky.p); gl.uniform2f(sky.u.uRes, rt.w, rt.h); gl.uniform2f(sky.u.uWorld, W, H); gl.uniform1f(sky.u.uU, unit); gl.uniform1f(sky.u.uHor, view().hor); gl.uniform1f(sky.u.uKind, view().id); gl.uniform1f(sky.u.uLit, 0); gl.uniform3fv(sky.u.uTop, t.top); gl.uniform3fv(sky.u.uLow, t.low); gl.uniform3fv(sky.u.uGlow, t.glow); tri();
  gl.enable(gl.BLEND);
  for (const op of ops) {
    if (op.t === 'r') { gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); const p = P.rect; gl.useProgram(p.p); gl.uniform2f(p.u.uW, W, H); gl.uniform1f(p.u.uSoft, far ? .55 + fs : .3); drawInst(op.q.d, op.q.n); }
    else { gl.blendFunc(gl.ONE, gl.ONE); setLight(far ? sc : sc, scG, I, far ? 60 : 90, far); drawInst(op.q.d, op.q.n); }
  }
  gl.disable(gl.BLEND);
}
function setLight(sc, scG, I, hot, far) { const p = P.light; gl.useProgram(p.p); gl.uniform2f(p.u.uW, W, H); gl.uniform1f(p.u.uScale, sc); gl.uniform1f(p.u.uScaleG, scG); gl.uniform1f(p.u.uLens, far ? .32 : 0); gl.uniform1f(p.u.uI, I); gl.uniform1f(p.u.uHot, hot); }
function drawLit() {
  target(litRT); gl.disable(gl.BLEND);
  const sky = P.sky, t = tint(); gl.useProgram(sky.p); gl.uniform2f(sky.u.uRes, litRT.w, litRT.h); gl.uniform2f(sky.u.uWorld, W, H); gl.uniform1f(sky.u.uU, unit); gl.uniform1f(sky.u.uHor, view().hor); gl.uniform1f(sky.u.uKind, view().id); gl.uniform1f(sky.u.uLit, 1); gl.uniform3fv(sky.u.uTop, t.top); gl.uniform3fv(sky.u.uLow, t.low); gl.uniform3fv(sky.u.uGlow, t.glow); tri();
  gl.enable(gl.BLEND); gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
  const p = P.rect; gl.useProgram(p.p); gl.uniform2f(p.u.uW, W, H); gl.uniform1f(p.u.uSoft, 1.2);
  for (const op of ops) if (op.t === 'r') drawInst(op.q.d, op.q.n);
  gl.disable(gl.BLEND);
}
function repaintOutside() { signals = []; beacons = []; ops = genOps(); drawOps(farB, true); drawOps(sharpB, false); drawLit(); }

// ---- water on the glass
function botAt(x) { for (const b of botTable) if (x >= b.x0 && x < b.x1) return b.bot; return botTable.length ? botTable[botTable.length - 1].bot : H; }
const newDrop = (x, y, r, run) => ({ id: nextId++, x, y, r, run: !!run, vx: 0, vy: 0, ph: rnd(TAU), sp: rnd(.6, 1.5), stick: 0, tAcc: 0, tGap: rnd(.5, 2), rc: rnd(12, 21), pop: run ? 1 : 0, sl: rnd(.5, 1.6), px: x, py: y });
function randGlass() { for (let i = 0; i < 20; i++) { const x = rnd(W), y = rnd(unit * .05, H), b = botAt(x); if (y < b) return [x, y]; } return [rnd(W), rnd(unit * .1, unit * .8)]; }
function tinyR(sc) { const q = Math.random(); return sc * (.8 + 2.4 * q * q * q + .5 * Math.random()); }
function pushStatic(x, y, r) { const k = r / .707; qp(qStatic, x, y, Math.max(k, 1 / dropScale()), Math.max(k, 1 / dropScale()) * rnd(.86, 1.14), 0, 1, 0, 0); }
const dropScale = () => W * H > 9e6 ? .5 : W * H > 5e6 ? .66 : .75;
function seedWater() {
  const sc = unit / 1080, a = W * H, nt = Math.min(20000, a * S.rain * .00004 * 90 + 1400) | 0;
  drops = [];
  for (let i = 0; i < nt; i++) { const [x, y] = randGlass(); pushStatic(x, y, tinyR(sc)); }
  const nb = Math.min(maxBeads() * .7, 1200 + a * .00008) | 0;
  for (let i = 0; i < nb; i++) { const [x, y] = randGlass(), q = Math.random(), r = sc * (2.2 + 9.5 * q * q * q); drops.push(newDrop(x, y, r, false)); drops[drops.length - 1].pop = 1; }
}
const maxBeads = () => Math.min(MAXINST >> 3, Math.max(900, W * H * .0006 * (.55 + .9 * S.rain)));
const maxRun = () => (8 + (W / unit) * (6 + 34 * S.rain)) | 0;

function strike(x) {
  if (!LEADER) return;
  const t0 = time, n = 2 + (Math.random() * 3) | 0;
  flashes = []; for (let i = 0; i < n; i++) flashes.push({ t: t0 + rnd(0, .35) * i, a: i === 0 ? 1 : rnd(.55, 1), d: rnd(.05, .13) });
  flashes.push({ t: t0 + rnd(.18, .4), a: rnd(.4, .7), d: rnd(.5, 1.1) });
  thunder = t0 + rnd(.9, 3.2);
  const bx = x !== undefined && x > 0 ? x : rnd(W * .08, W * .92), segs = []; let px = bx, py = -unit * .04, tilt = rnd(-.25, .25), n2 = 16;
  for (let i = 0; i < n2; i++) { const nx = px + rnd(-.09, .09) * unit + tilt * unit * .06, ny = py + rnd(.02, .05) * unit; segs.push(px, py, nx, ny); px = nx; py = ny; if (Math.random() < .25) { const fx = px + rnd(-.16, .16) * unit, fy = py + rnd(.03, .1) * unit; segs.push(px, py, fx, fy); } if (py > unit * .45) break; }
  boltSegs = segs;
}
function tapAt(x, y, k) {
  const u = unit, R = u * .26 * k;
  rip = [x, y, 0, k];
  for (const d of drops) { const dx = d.x - x, dy = d.y - y, l = Math.hypot(dx, dy); if (l > R) continue; const f = 1 - l / R; if (d.r > 1.6 * u / 1080) { if (Math.random() < .35 + .6 * f) d.run = true; d.vx += (dx / (l + 1)) * f * u * .25 * rnd(.4, 1.3); d.vy += (.6 + rnd(0, .6)) * f * u * .55; d.stick = 0; } }
}
function thunderHit() { shake = 1; const sc = unit / 1080; for (const d of drops) if (!d.run && d.r > 2.4 * sc && Math.random() < .34) { d.run = true; d.vy = rnd(.1, .5) * unit; } }
function addStroke(x0, y0, x1, y1, r, sD, sF, kind, record) { qp(qErase, x0, y0, x1, y1, r, sD, sF, kind); if (record && LEADER) netStrokes.push(x0, y0, x1, y1, r, sD, sF, kind); }
function eatBeads(x0, y0, x1, y1, r) {
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy;
  for (let i = drops.length - 1; i >= 0; i--) { const d = drops[i]; const t = L2 > .001 ? clamp(((d.x - x0) * dx + (d.y - y0) * dy) / L2, 0, 1) : 0, qx = x0 + dx * t - d.x, qy = y0 + dy * t - d.y; if (qx * qx + qy * qy < r * r) { drops[i] = drops[drops.length - 1]; drops.pop(); } }
}

function rebuildGrid() {
  const cs = gridCS, gw = Math.ceil(W / cs) + 1, gh = Math.ceil(H / cs) + 1, n = gw * gh;
  if (!gridHead || gridHead.length < n) gridHead = new Int32Array(n);
  gridHead.fill(-1); gridW = gw; gridH = gh; GX = gw;
  if (!gridNext || gridNext.length < drops.length) gridNext = new Int32Array(drops.length * 2 + 16);
  for (let i = 0; i < drops.length; i++) { const d = drops[i]; if (!d) continue; const cx = clamp((d.x / cs) | 0, 0, gw - 1), cy = clamp((d.y / cs) | 0, 0, gh - 1), k = cy * gw + cx; gridNext[i] = gridHead[k]; gridHead[k] = i; }
}

function simWater(dt) {
  const sc = unit / 1080, u = unit, ra = S.rain, area = W * H;
  const pois = (x) => { const i = Math.floor(x); return i + (Math.random() < x - i ? 1 : 0); };
  for (let i = pois(dt * ra * area * .00004); i > 0; i--) { const [x, y] = randGlass(); pushStatic(x, y, tinyR(sc)); }
  if (drops.length < maxBeads()) for (let i = pois(dt * (.15 + ra) * area * .0000042); i > 0; i--) { const [x, y] = randGlass(), q = Math.random(); drops.push(newDrop(x, y, sc * (2.2 + 9.5 * q * q * q), false)); }
  // a new fat drop now and then, from anywhere high on the glass
  let runners = 0; for (const d of drops) if (d.run) runners++;
  if (LEADER && runners < maxRun()) for (let i = pois(dt * (W / u) * (.7 + 4.4 * ra * ra)); i > 0; i--) { const x = rnd(W), y = rnd(u * .05, botAt(x) * .4), q = Math.random(); drops.push(newDrop(x, y, sc * (11 + 15 * q * q), true)); }
  rebuildGrid();
  const windV = S.wind * u * .13 + gust * gustD * u * 1.05, cs = gridCS;
  const deadFlag = -1e8;
  for (let i = 0; i < drops.length; i++) {
    const d = drops[i]; if (d.x === deadFlag) continue;
    d.pop = Math.min(1, d.pop + dt * 11);
    if (!d.run) {
      if (Math.random() < dt * (.14 + .52 * ra) * (ra > .01 ? 1 : 0)) d.r += sc * rnd(0, .75);
      if (!LEADER && d.r > d.rc * sc) d.r = d.rc * sc;
      d.r -= dt * sc * .14 * Math.pow(1 - ra, 3); if (d.r < sc * 1.1) { d.x = deadFlag; continue; }
      if (d.r > d.rc * sc && LEADER && runners < maxRun()) { d.run = true; runners++; }
      d.px = d.x; d.py = d.y; continue;
    }
    // rolling down the glass: stick-slip, a wander that never quite repeats, the wind
    d.ph += dt * d.sp * 3.1;
    if (d.stick > 0) d.stick -= dt; else if (Math.random() < dt * .42) d.stick = rnd(.06, .5) * (1.6 - Math.min(1, d.r / (14 * sc)));
    const rf = d.r / (12 * sc), slip = d.stick > 0 ? .05 : (.55 + .9 * d.sl), vt = (u * .105) * Math.pow(rf, 1.6) * slip * (1 + .55 * Math.sin(d.ph * .71 + d.sp));
    d.vy += (vt - d.vy) * clamp(dt * 7, 0, 1);
    const wander = (Math.sin(d.ph) + .7 * Math.sin(d.ph * 2.3 + d.sl * 4)) * u * .007 * Math.min(1.4, rf);
    d.vx += (wander + windV * Math.min(1.5, rf * .6 + .3) - d.vx) * clamp(dt * 5, 0, 1);
    if (Math.random() < dt * .75) d.vx = rnd(-1, 1) * u * (Math.random() < .25 ? .3 : .12);
    const ox = d.x, oy = d.y;
    d.x += d.vx * dt; d.y += d.vy * dt; d.px = ox; d.py = oy;
    const mv = Math.hypot(d.x - ox, d.y - oy);
    if (mv > .15) qp(qErase, ox, oy, d.x, d.y, d.r * .5, .96, .042, 2);
    d.tAcc += mv;
    if (d.tAcc > d.tGap * sc * (7 + 3 * d.sl)) { // a broken string of beads behind it
      d.tAcc = 0; d.tGap = Math.random() < .2 ? rnd(4, 8) : rnd(.4, 2.2);
      const tr = d.r * rnd(.10, .34), tx = d.x + rnd(-1, 1) * d.r * .25, ty = d.y - d.r * rnd(.8, 1.3);
      if (Math.random() < .86) { pushStatic(tx, ty, tr); const v = Math.max(.1, d.r * d.r * d.r - tr * tr * tr * .9); d.r = Math.cbrt(v); }
    }
    if (d.r < sc * 4.5) { d.run = false; d.rc = rnd(12, 21); }
    // eat whatever is in the way
    const cx = clamp((d.x / cs) | 0, 0, gridW - 1), cy = clamp((d.y / cs) | 0, 0, gridH - 1);
    for (let gy = Math.max(0, cy - 1); gy <= Math.min(gridH - 1, cy + 1); gy++) for (let gx = Math.max(0, cx - 1); gx <= Math.min(gridW - 1, cx + 1); gx++) {
      for (let j = gridHead[gy * GX + gx]; j >= 0; j = gridNext[j]) {
        if (j === i) continue; const b = drops[j]; if (!b || b.x === deadFlag) continue;
        const dx = b.x - d.x, dy = b.y - d.y, rr = d.r + b.r * .9; if (dx * dx + dy * dy > rr * rr) continue;
        if (b.run && b.r > d.r) continue;
        d.r = Math.cbrt(d.r * d.r * d.r + b.r * b.r * b.r); d.vy += u * .012; b.x = deadFlag;
      }
    }
    if (d.y > botAt(d.x) + d.r || d.x < -40 || d.x > W + 40) d.x = deadFlag;
  }
  let w = 0; for (let i = 0; i < drops.length; i++) { const d = drops[i]; if (d.x !== deadFlag) drops[w++] = d; } drops.length = w;
}

function bakeWaterInit() {
  // start already wet: fine beading on the glass and condensation up to its resting level
  applyEdits();
  target(fogRT); gl.disable(gl.BLEND); const p = P.refog; gl.useProgram(p.p); bindTex(0, fogTgt.tex, p.u.uT); gl.uniform2f(p.u.uRes, fogRT.w, fogRT.h); gl.uniform1f(p.u.uAmt, S.fog * 1.5); gl.uniform1f(p.u.uK, 1); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ZERO); tri(); gl.disable(gl.BLEND);
}

function applyEdits() {
  // erase first (running drops wipe the beads they pass), then new beading, then a very slow drying
  if (qErase.n) {
    gl.enable(gl.BLEND); gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    const p = P.cap; gl.useProgram(p.p); gl.uniform2f(p.u.uW, W, H);
    target(dropS); gl.enable(gl.BLEND); gl.uniform1f(p.u.uWhich, 0); drawInst(qErase.d, qErase.n);
    target(fogRT); gl.enable(gl.BLEND); gl.uniform1f(p.u.uWhich, 1); drawInst(qErase.d, qErase.n);
    qErase.n = 0;
  }
  if (qStatic.n) { target(dropS); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); const p = P.drop; gl.useProgram(p.p); gl.uniform2f(p.u.uW, W, H); drawInst(qStatic.d, qStatic.n); qStatic.n = 0; }
  gl.disable(gl.BLEND);
}

// ---- traffic
function spawnCar(l) { const nearL = l === 1, dir = nearL ? 1 : -1, x = dir > 0 ? -rnd(.1, 1) * unit : W + rnd(.1, 1) * unit; return { x, l, dir, v: unit * rnd(.28, .46) * (nearL ? 1.05 : .92), len: unit * rnd(.1, .17), ph: rnd(TAU), hue: Math.random(), br: rnd(.7, 1.2) }; }
function initTraffic() { cars = []; const u = unit; for (let l = 0; l < 2; l++) { let x = rnd(.1, 1) * u; while (x < W) { const c = spawnCar(l); c.x = x; cars.push(c); x += rnd(.55, 1.7) * u; } } tram = null; tramT = rnd(4, 18); }
function simTraffic(dt) {
  if (!S.traffic || !LEADER) return;
  for (let i = 0; i < cars.length; i++) { const c = cars[i]; c.x += c.dir * c.v * dt; if (c.x > W + unit * .5 || c.x < -unit * .5) cars[i] = spawnCar(c.l); }
  const v = view().tram;
  if (tram) { tram.x += tram.dir * unit * v.v * dt; if (tram.dir > 0 ? tram.x > W + unit * v.len : tram.x < -unit * v.len) { tram = null; tramT = rnd(26, 70); } }
  else { tramT -= dt; if (tramT <= 0) { const dir = Math.random() < .5 ? 1 : -1; tram = { x: dir > 0 ? -unit * v.len : W + unit * v.len, dir, ph: Math.random() }; } }
}
function liveLights() {
  qLive.n = 0;
  const u = unit, L = tint().lights, vw = view(), I = (i) => i * L;
  const add = (x, y, rx, ry, c, i, kind = 0, an = 0) => qp(qLive, x, y, rx * u, ry * u, c[0] * i, c[1] * i, c[2] * i, kind, an);
  if (S.traffic) {
    for (const c of cars) {
      const near = c.l === 1, y = u * (near ? vw.near : vw.far), rb = near ? .055 : .036, f = 1 + .18 * Math.sin(time * 9 + c.ph), hx = c.x + c.dir * c.len * .5, tx = c.x - c.dir * c.len * .5;
      const yl = y - u * .014, sep = near ? .017 : .011;
      for (const k of [-1, 1]) { add(hx + k * u * sep, yl, rb, rb, WHITE, I(.78 * f * c.br)); add(tx + k * u * sep * .85, yl + u * .003, rb * .78, rb * .78, RED, I(.72 * c.br)); }
      add(hx + c.dir * u * .17, y + u * .025, .22, .02, WHITE, I(.08), 1); add(hx, y + u * .11, .042, .11, WHITE, I(.2), 1); add(tx, y + u * .1, .036, .1, RED, I(.24), 1); add(c.x, y + u * .004, .15, .05, WARM, I(.03), 1);
    }
    if (tram) {
      const v = vw.tram, y = u * v.y, len = u * v.len;
      for (let i = 0; i < v.n; i++) {
        const k = (i + .5) / v.n, x = tram.x + (k - .5) * len, h = S.view === 'forest' ? 0 : 1;
        if (h) { add(x, y, .058, .036, v.col, I(.68 + .3 * Math.sin(i * 2.3 + tram.ph * 9)), 0); add(x, y + u * .11, .05, .1, v.col, I(.14), 1); }
        else { add(x, y - u * .02, .021, .021, v.col, I(1.1)); add(x, y + u * .08, .025, .06, v.col, I(.2), 1); }
      }
      add(tram.x, y, v.len * .62, .1, v.col, I(.09), 1);
      if (S.view === 'city' && Math.sin(time * 3.1 + tram.ph * 13) * Math.sin(time * 7.7) > .92) { add(tram.x, y - u * .12, .04, .04, [.8, .85, 1], I(3.2)); add(tram.x, y - u * .12, .22, .2, [.6, .7, 1], I(.3), 1); }
    }
  }
  for (const s of signals) { const on = Math.floor((time + s.ph) / 7) % 2 === 0; add(s.x, s.y, s.rb, s.rb, on ? GRN : RED, I(1.15)); add(s.x, s.y + u * .16, .03, .15, on ? GRN : RED, I(.18), 1); }
  for (const b of beacons) { const a = time * .62 + b.ph, sw = Math.pow(Math.max(0, Math.cos(a)), 26); add(b.x, b.y, .028, .028, WHITE, I(.4 + 3.4 * sw)); if (sw > .001) add(b.x + Math.sin(a) * u * .6, b.y + u * .012, .9, .05, WHITE, I(.3 * sw), 1); }
  if (boltSegs.length && flash > .22) {
    const k = flash; for (let i = 0; i < boltSegs.length; i += 4) { const x0 = boltSegs[i], y0 = boltSegs[i + 1], x1 = boltSegs[i + 2], y1 = boltSegs[i + 3], dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) * .5; add((x0 + x1) / 2, (y0 + y1) / 2, l / u * 1.15, .016, [.82, .86, 1], 2.1 * k, 1, Math.atan2(dy, dx)); add((x0 + x1) / 2, (y0 + y1) / 2, l / u * 1.5, .075, [.5, .6, 1], .5 * k, 1, Math.atan2(dy, dx)); }
  }
}

function composeLive() {
  const fs = fscale();
  for (const [dst, src, far] of [[farL, farB, true], [sharpL, sharpB, false]]) {
    target(dst); gl.disable(gl.BLEND);
    let p = P.copy; gl.useProgram(p.p); bindTex(0, src.tex, p.u.uT); gl.uniform4f(p.u.uMul, 1, 1, 1, 1); tri();
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    if (far) setLight(fs, .85 + .22 * fs, Math.pow(fs, -1.25), 40, true); else setLight(.1 + .05 * fs, .6, 3 + 8 / fs, 70, false);
    drawInst(qLive.d, qLive.n);
    if (flash > .002) { const t = tint(), k = flash * (far ? 1.05 : 1.3); p = P.scale; gl.useProgram(p.p); bindTex(0, litRT.tex, p.u.uT); gl.uniform2f(p.u.uRes, dst.w, dst.h); gl.uniform3f(p.u.uMul, t.lit[0] * k, t.lit[1] * k, t.lit[2] * k); tri(); }
    gl.disable(gl.BLEND);
  }
  target(blurA); let p = P.down; gl.useProgram(p.p); bindTex(0, farL.tex, p.u.uT); gl.uniform2f(p.u.uRes, blurA.w, blurA.h); gl.uniform2f(p.u.uPx, 1.3 / blurA.w, 1.3 / blurA.h); tri();
  p = P.blur; gl.useProgram(p.p); gl.uniform2f(p.u.uRes, blurA.w, blurA.h);
  for (let i = 0; i < 3; i++) { target(blurB); bindTex(0, blurA.tex, p.u.uT); gl.uniform2f(p.u.uD, 1.7 / blurA.w, 0); tri(); target(blurA); bindTex(0, blurB.tex, p.u.uT); gl.uniform2f(p.u.uD, 0, 1.7 / blurA.h); tri(); }
}

function composeWater(dt) {
  applyEdits();
  // beading dries slowly; condensation creeps back
  target(dropS); gl.enable(gl.BLEND); gl.blendColor(0, 0, 0, Math.exp(-dt / (58 + 40 * S.rain))); gl.blendFunc(gl.ZERO, gl.CONSTANT_ALPHA); gl.useProgram(P.fade.p); tri(); gl.disable(gl.BLEND);
  target(fogRT); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); let p = P.refog; gl.useProgram(p.p); bindTex(0, fogTgt.tex, p.u.uT); gl.uniform2f(p.u.uRes, fogRT.w, fogRT.h); gl.uniform1f(p.u.uAmt, S.fog * 1.5); gl.uniform1f(p.u.uK, clamp(dt * (.05 + fogRate), 0, 1)); tri(); gl.disable(gl.BLEND);
  fogRate = Math.max(0, fogRate - dt * .4);
  // the frame's water: everything static, plus every bead and rivulet drawn fresh
  target(dropC); p = P.copy; gl.useProgram(p.p); bindTex(0, dropS.tex, p.u.uT); gl.uniform4f(p.u.uMul, 1, 1, 1, 1); tri();
  qDyn.n = 0;
  const sc = unit / 1080, jx = shakeJolt[0], jy = shakeJolt[1];
  const addDrop = (x, y, r, vx, vy, pop, run) => { const sp = run ? Math.min(1, Math.hypot(vx, vy) / (unit * .55)) : 0, rx = r * (1 - .11 * sp), ry = r * (1 + .3 * sp), k = 1 / .707, m = Math.max(1 / dropScale(), 0); qp(qDyn, x + jx, y + jy, Math.max(rx * k, m), Math.max(ry * k, m), sp * .5, Math.min(1, pop)); };
  for (const d of drops) addDrop(d.x, d.y, d.r, d.vx, d.vy, d.pop, d.run);
  if (!LEADER) for (const d of netRun) addDrop(d.x, d.y, d.r, d.vx, d.vy, 1, true);
  if (qDyn.n) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); p = P.drop; gl.useProgram(p.p); gl.uniform2f(p.u.uW, W, H); drawInst(qDyn.d, qDyn.n); gl.disable(gl.BLEND); }
}

function drawFinal(t) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  const p = P.final; gl.useProgram(p.p);
  gl.uniform2f(p.u.uWorld, W, H); gl.uniform1f(p.u.uU, unit); gl.uniform1f(p.u.uTime, t); gl.uniform1f(p.u.uFlash, flash); gl.uniform1f(p.u.uM, unit * .62);
  gl.uniform2f(p.u.uShake, shakeJolt[0] / W * .35, -shakeJolt[1] / H * .35); gl.uniform4f(p.u.uRip, rip[0], rip[1], rip[2], rip[3]);
  const vl = tint().veil; gl.uniform3f(p.u.uVeil, vl[0] * (.55 + S.fog * .75), vl[1] * (.55 + S.fog * .75), vl[2] * (.55 + S.fog * .75));
  bindTex(0, farL.tex, p.u.uFar); bindTex(1, sharpL.tex, p.u.uSharp); bindTex(2, blurA.tex, p.u.uBlur); bindTex(3, dropC.tex, p.u.uDrop); bindTex(4, fogRT.tex, p.u.uFog); bindTex(5, frameRT.tex, p.u.uFrame); bindTex(6, microT.tex, p.u.uNoise);
  gl.disable(gl.BLEND); gl.bindVertexArray(emptyVAO);
  eachView(v => { setView(p.u, v); gl.uniform1f(p.u.uSill, botAt(v.wx + v.ww / 2)); gl.drawArrays(gl.TRIANGLES, 0, 3); });
}

const rts = () => [farB, sharpB, farL, sharpL, blurA, blurB, litRT, dropS, dropC, fogRT, fogTgt, frameRT];

const SCENE = {
  key: 'rainwindow',
  defaults: { view: 'city', tint: 'blue', rain: .6, fog: .44, wind: .15, traffic: true, focus: .5, bolt: 75, tool: 'draw' },
  validate(S) { if (!VIEWS[S.view]) S.view = 'city'; if (!TINTS[S.tint]) S.tint = 'blue'; S.rain = clamp(+S.rain || 0, 0, 1); S.fog = clamp(+S.fog || 0, 0, 1); S.wind = clamp(+S.wind || 0, 0, 1); S.focus = clamp(+S.focus, 0, 1); if (isNaN(S.focus)) S.focus = .5; if (!['draw', 'tap', 'wipe'].includes(S.tool)) S.tool = 'draw'; if (![0, 180, 75, 25].includes(+S.bolt)) S.bolt = 75; S.bolt = +S.bolt; },
  panelTitle: 'Your window', panelSub: 'What it looks out on, and the weather. Saved between visits.',
  hello: 'Draw in the fog with your finger. Tap the glass. Wipe it with your sleeve.',
  tools: [['draw', 'Draw in the fog'], ['tap', 'Tap the glass'], ['wipe', 'Wipe with a sleeve'], null, ['bolt', 'Call lightning', () => { act('bolt', 0, 0, 'down'); }]],
  panel(ui) {
    ui.sel('Outside', 'view', VIEWS);
    ui.sel('Time of night', 'tint', TINTS);
    ui.range('Rain', 'rain', 0, 1, .02, v => Math.round(v * 100) + '%');
    ui.range('Fog on the glass', 'fog', 0, 1, .02, v => Math.round(v * 100) + '%');
    ui.range('Wind', 'wind', 0, 1, .02, v => Math.round(v * 100) + '%');
    ui.range('Outside blur', 'focus', 0, 1, .02, v => Math.round(v * 100) + '%');
    ui.seg('Lightning', 'bolt', [[0, 'Never'], [180, 'Rare'], [75, 'Some'], [25, 'Stormy']]);
    ui.tog('Traffic', 'traffic');
  },
  changed(k) {
    if (k === 'view' || k === 'tint') { repaintOutside(); if (k === 'view' && LEADER) initTraffic(); }
    else if (k === 'focus') { drawOps(farB, true); drawOps(sharpB, false); }
    else if (k === 'fog') fogRate = 1.1;
    else if (k === 'bolt') boltT = Math.min(boltT, S.bolt || 1e9);
  },
  build() {
    ensurePrograms(); ensureInst(); rebake();
    document.getElementById('fade').style.opacity = 1;
    for (const rt of rts()) if (rt) rt.free();
    time = 0; flash = 0; shake = 0; flashes = []; thunder = -1; gust = 0;
    const bw = Math.ceil(W / 2), bh = Math.ceil(H / 2), ds = dropScale();
    farB = makeRT(bw, bh, { float: true }); sharpB = makeRT(bw, bh, { float: true }); farL = makeRT(bw, bh, { float: true }); sharpL = makeRT(bw, bh, { float: true });
    blurA = makeRT(Math.ceil(W / 10), Math.ceil(H / 10), { float: true }); blurB = makeRT(blurA.w, blurA.h, { float: true }); litRT = makeRT(Math.ceil(W / 4), Math.ceil(H / 4), { float: true });
    dropS = makeRT(Math.ceil(W * ds), Math.ceil(H * ds), { float: true }); dropC = makeRT(dropS.w, dropS.h, { float: true });
    fogRT = makeRT(Math.ceil(W / 3), Math.ceil(H / 3), { float: true }); fogTgt = makeRT(Math.ceil(W / 8), Math.ceil(H / 8)); frameRT = makeRT(W, H);
    if (!microT) { microT = makeRT(512, 512); gl.bindTexture(gl.TEXTURE_2D, microT.tex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT); bakeStep(() => { target(microT); gl.disable(gl.BLEND); const p = P.micro; gl.useProgram(p.p); gl.uniform1f(p.u.uN, 34); tri(); }); }
    const mons = monitors(); botTable = mons.map(m => ({ x0: m.wx, x1: m.wx + m.ww, bot: m.wh - .098 * unit }));
    gridCS = 26 * unit / 1080;
    if (LEADER) initTraffic();
    qStatic.n = 0; qErase.n = 0; qDyn.n = 0;
    bakeTiles(frameRT, { tile: 256, cost: 1.2, begin: () => { const p = P.frame; gl.useProgram(p.p); gl.uniform2f(p.u.uWorld, W, H); gl.uniform1f(p.u.uU, unit); const M = new Float32Array(8 * 3); mons.slice(0, 8).forEach((m, i) => M.set([m.wx, m.ww, m.wh], i * 3)); gl.uniform3fv(p.u.uM, M); gl.uniform1i(p.u.uN, Math.min(8, mons.length)); } });
    bakeStep(() => { target(fogTgt); gl.disable(gl.BLEND); const p = P.fogTarget; gl.useProgram(p.p); gl.uniform2f(p.u.uRes, fogTgt.w, fogTgt.h); gl.uniform2f(p.u.uWorld, W, H); gl.uniform1f(p.u.uU, unit); tri(); });
    bakeStep(() => repaintOutside());
    bakeStep(() => { seedWater(); bakeWaterInit(); });
  },
  act(tool, x, y, phase, dx, dy) {
    if (tool === 'bolt') { if (phase === 'down') strike(x || undefined); return; }
    if (tool === 'tap') { if (phase === 'down') tapAt(x, y, 1); return; }
    if (phase === 'up') return;
    const wipe = tool === 'wipe', u = unit, r = (wipe ? .095 : .022) * u, x0 = x - dx, y0 = y - dy;
    addStroke(x0, y0, x, y, r, wipe ? .96 : 1, wipe ? .985 : 1, wipe ? 1 : 0, true);
    eatBeads(x0, y0, x, y, r * .95);
    const L = Math.hypot(dx, dy);
    // what the finger pushed aside gathers at the edge of the stroke and eventually lets go
    if (L > .5 && Math.random() < Math.min(.8, L / (u * (wipe ? .05 : .07)))) {
      const sc = u / 1080, k = Math.random();
      if (wipe) { const t = Math.random(); drops.push(newDrop(lerp(x0, x, t) + rnd(-r, r) * .85, lerp(y0, y, t) + r * rnd(.75, 1), sc * rnd(3, 9.5), Math.random() < .55)); }
      else if (k < .55) { const t = Math.random(), ang = rnd(TAU); drops.push(newDrop(lerp(x0, x, t) + Math.cos(ang) * r * 1.1, lerp(y0, y, t) + Math.sin(ang) * r * 1.1, sc * rnd(2.2, 6), Math.random() < .2)); }
    }
  },
  sim(dt, now) {
    time += dt;
    // lightning: a few strokes on one envelope, thunder arrives later and shakes the water
    if (LEADER) {
      let f = 0; for (const s of flashes) { const a = time - s.t; if (a >= 0) f = Math.max(f, s.a * Math.exp(-a / s.d)); }
      flash = f; if (flashes.length && flashes.every(s => time - s.t > s.d * 6)) flashes = [];
      if (thunder > 0 && time > thunder) { thunder = -1; thunderHit(); }
      if (S.bolt > 0) { boltT -= dt; if (boltT <= 0) { boltT = S.bolt * rnd(.55, 1.45); strike(); } }
      gustT -= dt;
      if (gustT <= 0) { gustT = rnd(9, 30) / (.3 + S.wind); gustD = Math.random() < .6 ? 1 : -1; gust = S.wind > .01 ? .55 + .6 * S.wind : 0; if (gust > 0) pushRivulets(); }
      gust *= Math.exp(-dt / 1.25);
    }
    shake *= Math.exp(-dt * 3.2); shakeJolt[0] = shake > .01 ? Math.sin(time * 71) * shake * 2.6 * unit / 1080 : 0; shakeJolt[1] = shake > .01 ? Math.sin(time * 53 + 1) * shake * 1.7 * unit / 1080 : 0;
    rip[2] += dt * 26; rip[3] *= Math.exp(-dt * 3.1); if (rip[3] < .005) rip[3] = 0;
    simWater(dt);
    if (!LEADER) { for (const d of netRun) { d.x += d.vx * dt; d.y += d.vy * dt; qp(qErase, d.x - d.vx * dt, d.y - d.vy * dt, d.x, d.y, d.r * .5, .96, .042, 2); eatBeads(d.x - d.vx * dt, d.y - d.vy * dt, d.x, d.y, d.r); } }
    simTraffic(dt); liveLights();
  },
  netState() { const st = netStrokes; netStrokes = []; const r = []; for (const d of drops) if (d.run) r.push(Math.round(d.x), Math.round(d.y), +d.r.toFixed(2), Math.round(d.vx), Math.round(d.vy)); return { f: flash, s: shake, g: gust, gd: gustD, c: cars.flatMap(c => [c.x, c.l, c.dir, c.len, c.ph, c.br]), t: tram, r, st, b: flash > .2 ? boltSegs : null, rp: rip[3] > .001 ? rip : null }; },
  netApply(d) {
    flash = d.f; shake = Math.max(shake, d.s); gust = d.g; gustD = d.gd; tram = d.t; if (d.b) boltSegs = d.b; if (d.rp && d.rp[3] > rip[3]) rip = d.rp;
    const cc = []; for (let i = 0; i < d.c.length; i += 6) cc.push({ x: d.c[i], l: d.c[i + 1], dir: d.c[i + 2], len: d.c[i + 3], ph: d.c[i + 4], br: d.c[i + 5] }); cars = cc;
    netRun = []; for (let i = 0; i < d.r.length; i += 5) netRun.push({ x: d.r[i], y: d.r[i + 1], r: d.r[i + 2], vx: d.r[i + 3], vy: d.r[i + 4] });
    for (let i = 0; i < d.st.length; i += 8) { qp(qErase, d.st[i], d.st[i + 1], d.st[i + 2], d.st[i + 3], d.st[i + 4], d.st[i + 5], d.st[i + 6], d.st[i + 7]); eatBeads(d.st[i], d.st[i + 1], d.st[i + 2], d.st[i + 3], d.st[i + 4] * .95); }
  },
  render(now) { const dt = Math.min(.05, now - (SCENE._t || now)); SCENE._t = now; composeLive(); composeWater(dt); drawFinal(now); },
  stats() { let r = 0; for (const d of drops) if (d.run) r++; return `${drops.length} beads, ${r} running; ${cars.length} cars${tram ? ', ' + view().tram.name : ''}; flash ${flash.toFixed(2)}`; },
};
function pushRivulets() {
  // a gust finds a few fat drops and walks them across the join between two monitors
  const mons = monitors(), sc = unit / 1080;
  if (mons.length < 2) return;
  for (let i = 0; i < 4; i++) { const m = mons[1 + ((Math.random() * (mons.length - 1)) | 0)], seam = m.wx, x = seam + gustD * -1 * unit * rnd(.1, .34), y = rnd(unit * .1, Math.min(m.wh, unit) * .55); const d = newDrop(x, y, sc * rnd(11, 18), true); d.vx = gustD * unit * .7; drops.push(d); }
}
