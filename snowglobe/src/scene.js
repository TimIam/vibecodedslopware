// Snow Globe. Each globe is ray traced once (interior miniature, turned base, refraction map), then the
// live parts go on top every frame: flakes through the water lens, the world seen upside-down through
// the glass, reflections on the surface. Globes stand on one long table; a tin train circles behind them.

const SCENES = {
  cabin:     { name: 'Cabin in the pines', def: 0 },
  forest:    { name: 'Deep pine forest', def: 1 },
  lighthouse:{ name: 'Lighthouse on the rocks', def: 2 },
  snowman:   { name: 'Snowman', def: 3 },
  mix:       { name: 'A different one in each', def: -1 },
};
const ROOMS = {
  fire:   { name: 'Firelit room', top: [.007,.0045,.004], mid: [.042,.021,.010], tableA: [.012,.0058,.003], tableB: [.052,.024,.010], key: [.98,.76,.55], fill: [.13,.10,.10], win: [5.5,4.2,2.9], winDir: [-.62,.56,.55], lamp: [1.6,.72,.26], bokeh: [[1,.62,.25],[1,.78,.45],[1,.45,.16],[.95,.55,.3]], glow: [.13,.052,.014], gain: 1.0 },
  tree:   { name: 'Christmas tree lights', top: [.010,.012,.022], mid: [.040,.035,.055], tableA: [.012,.008,.007], tableB: [.05,.03,.022], key: [.82,.82,.95], fill: [.10,.10,.16], win: [4,4.2,5], winDir: [-.5,.62,.6], lamp: [1.0,.3,.25], bokeh: [[1,.2,.15],[.2,.9,.3],[1,.75,.25],[.25,.5,1],[1,.35,.6]], glow: [.10,.06,.09], gain: 1.0 },
  dawn:   { name: 'Snowy window at dawn', top: [.22,.30,.44], mid: [.42,.47,.56], tableA: [.075,.062,.060], tableB: [.20,.17,.16], key: [.72,.74,.82], fill: [.26,.31,.42], win: [3.6,3.9,4.6], winDir: [-.35,.5,.8], lamp: [.6,.55,.5], bokeh: [[1,.95,.85],[.9,.93,1]], glow: [.12,.12,.15], gain: .95 },
  night:  { name: 'Blue winter night', top: [.006,.012,.030], mid: [.020,.040,.095], tableA: [.018,.024,.040], tableB: [.05,.065,.11], key: [.5,.66,1.0], fill: [.06,.09,.19], win: [3,3.9,6], winDir: [-.6,.6,.52], lamp: [1.3,.75,.3], bokeh: [[.4,.65,1],[.65,.8,1],[1,.8,.45]], glow: [.05,.09,.2], gain: 1.0 },
};
const BASES = { walnut: { name: 'Turned walnut', mat: 0 }, lacquer: { name: 'Black lacquer and gold', mat: 1 }, brass: { name: 'Polished brass', mat: 2 }, ceramic: { name: 'Cream ceramic', mat: 3 } };
const SNOWS = { flakes: { name: 'White flakes', glitter: 0, size: 1 }, powder: { name: 'Fine powder', glitter: 0, size: .6 }, glitter: { name: 'Silver glitter', glitter: 1, size: .9 }, gold: { name: 'Gold glitter', glitter: 2, size: .9 } };

const CAM_A = .105, CA = Math.cos(CAM_A), SA = Math.sin(CAM_A); // the camera looks very slightly down at the table
const QX = 1.16, QT = 1.12, QB = 1.62, BACK = 8; // quad extent around a globe, in radii; BACK is the backdrop distance

// ---- the globe bake: one fragment per ray, jittered and accumulated
const SDF = `
const float CA=${CA.toFixed(5)},SA=${SA.toFixed(5)};
vec2 mn(vec2 a,vec2 b){return a.x<b.x?a:b;}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float sdBox(vec3 p,vec3 b){vec3 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);}
float sdCyl(vec3 p,float r,float h){vec2 d=abs(vec2(length(p.xz),p.y))-vec2(r,h);return min(max(d.x,d.y),0.)+length(max(d,0.));}
float sdCaps(vec3 p,vec3 a,vec3 b,float r){vec3 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h)-r;}
float terrainH(vec2 x){return -.50+.13*exp(-dot(x,x)*2.4)+.022*sin(x.x*7.+1.)*sin(x.y*6.);}
float pine(vec3 p,float h,float r,float seed){
 float R=length(p.xz),t=clamp(p.y/h,0.,1.),n=7.+floor(seed*3.);
 float k=fract(t*n),tier=floor(t*n);
 float env=r*(1.03-t)*(1.-.18*t*t);
 float rad=env*(.56+.50*(1.-k)*(1.-k));
 vec3 dir=vec3(p.x/(R+1e-3),tier*1.37+seed*11.,p.z/(R+1e-3));
 float nb=n3(dir*vec3(3.,1.,3.)+seed*7.)*.55+n3(dir*vec3(9.,1.,9.)+2.)*.45;
 rad*=.62+.80*nb;
 float d=max((R-rad)*.5,max(-p.y,p.y-h));
 d+=(n3(p*vec3(46.,30.,46.))-.5)*.022;
 return min(d,sdCyl(p-vec3(0,.02,0),r*.075,.09));}
`;
const MAPS = [
// 0 cabin
`vec2 scene(vec3 p){
 vec2 r=vec2(p.y-terrainH(p.xz),1.);
 vec3 q=p-vec3(-.02,-.385,-.05);q.xz=mat2(.92,.39,-.39,.92)*q.xz;
 float wall=sdBox(q-vec3(0,.075,0),vec3(.205,.085,.14));
 vec3 rf=q-vec3(0,.16,0);float rx=abs(rf.z);float roofT=max(rf.y-.12+rx*.95,max(abs(rf.x)-.245,-rf.y-.01));roofT=max(roofT,-(rf.y-.04+rx*.95));
 float roof=roofT*.7;
 float snowroof=max(max(rf.y-.158+rx*.95,abs(rf.x)-.262+.012*sin(rf.z*40.)),max(-(rf.y-.11+rx*.95),rx-.178))*.7;
 float chim=sdBox(q-vec3(.11,.27,-.05),vec3(.032,.09,.032));
 float win1=sdBox(q-vec3(-.09,.085,.143),vec3(.038,.04,.006));
 float win2=sdBox(q-vec3(.08,.085,.143),vec3(.038,.04,.006));
 float win3=sdBox(q-vec3(.208,.085,.0),vec3(.006,.04,.05));
 float door=sdBox(q-vec3(-.005,.05,.143),vec3(.0,.0,.0));
 r=mn(r,vec2(wall,3.));r=mn(r,vec2(roof,3.5));r=mn(r,vec2(snowroof,1.));r=mn(r,vec2(chim,6.));
 r=mn(r,vec2(min(win1,min(win2,win3)),5.));
 float capC=sdBox(q-vec3(.11,.365,-.05),vec3(.042,.012,.042));r=mn(r,vec2(capC,1.));
 r=mn(r,vec2(pine(p-vec3(-.52,terrainH(vec2(-.52,-.14))-.01,-.14),.72,.24,.3),2.));
 r=mn(r,vec2(pine(p-vec3(.47,terrainH(vec2(.47,-.2))-.01,-.2),.60,.21,.7),2.));
 r=mn(r,vec2(pine(p-vec3(.28,terrainH(vec2(.28,-.48))-.01,-.48),.52,.17,.1),2.));
 r=mn(r,vec2(pine(p-vec3(-.25,terrainH(vec2(-.25,-.52))-.01,-.52),.46,.15,.5),2.));
 r=mn(r,vec2(pine(p-vec3(.52,terrainH(vec2(.52,.22))-.01,.22),.30,.11,.9),2.));
 return r;}`,
// 1 forest
`vec2 scene(vec3 p){
 vec2 r=vec2(p.y-terrainH(p.xz),1.);
 const int N=11;
 vec3 T[N]=vec3[N](vec3(0,-.1,.95),vec3(-.42,-.16,.78),vec3(.42,-.20,.74),vec3(-.2,.3,.56),vec3(.22,.34,.5),vec3(-.62,.2,.5),vec3(.62,.12,.52),vec3(.02,-.55,.72),vec3(-.4,-.48,.62),vec3(.42,-.5,.6),vec3(-.08,.56,.28));
 for(int i=0;i<N;i++){vec2 c=T[i].xy;float h=T[i].z;r=mn(r,vec2(pine(p-vec3(c.x,terrainH(c)-.01,c.y),h,h*.3,fract(float(i)*.37)),2.));}
 float rk=length((p-vec3(-.1,-.33,.48))*vec3(1,1.3,1.))-.1;rk+=.015*sin(p.x*40.)*sin(p.z*37.);r=mn(r,vec2(rk,6.));
 return r;}`,
// 2 lighthouse
`vec2 scene(vec3 p){
 vec3 q=p-vec3(.02,-.28,-.05);
 float isle=p.y-(-.53+.20*exp(-dot(p.xz,p.xz)*3.2)+.03*sin(p.x*9.)*sin(p.z*8.));
 vec2 r=vec2(isle,1.);
 float ty=clamp((q.y+.05)/.78,0.,1.);float tr=mix(.17,.095,ty);
 float tower=max(length(q.xz)-tr,max(-q.y-.05,q.y-.72))*.92;
 r=mn(r,vec2(tower,7.));
 float gal=sdCyl(q-vec3(0,.74,0),.135,.012);r=mn(r,vec2(gal,6.));
 float lamp=sdCyl(q-vec3(0,.80,0),.07,.052);r=mn(r,vec2(lamp,5.));
 float cap=max(length(q.xz)-.09*(1.-clamp((q.y-.85)/.13,0.,1.)),max(.85-q.y,q.y-.98))*.8;r=mn(r,vec2(cap,3.5));
 float rail=max(abs(length(q.xz)-.128)-.004,abs(q.y-.77)-.003);r=mn(r,vec2(rail,6.));
 float hut=sdBox(q-vec3(.3,.0,.12),vec3(.09,.06,.08));r=mn(r,vec2(hut,3.));
 vec3 h=q-vec3(.3,.09,.12);float hr=max(h.y-.06+abs(h.z)*.95,max(abs(h.x)-.11,-h.y))*.7;r=mn(r,vec2(hr,1.));
 float w=sdBox(q-vec3(.3,.01,.2),vec3(.03,.03,.004));r=mn(r,vec2(w,5.));
 float w2=max(length(q.xz-vec2(0.,0.))-tr-.002,max(abs(q.y-.42)-.035,-q.z-.0));w2=max(w2,abs(q.x)-.022);w2=max(w2,tr-.012-length(q.xz));r=mn(r,vec2(w2,5.));
 r=mn(r,vec2(pine(p-vec3(-.46,-.51,.1),.42,.14,.3),2.));
 r=mn(r,vec2(pine(p-vec3(-.56,-.53,-.2),.56,.18,.6),2.));
 float rk=length((p-vec3(.5,-.42,-.15))*vec3(1,1.4,1.))-.14;rk+=.02*sin(p.x*30.)*sin(p.z*27.)*sin(p.y*33.);r=mn(r,vec2(rk,6.));
 float rk2=length((p-vec3(-.25,-.46,.4))*vec3(1,1.5,1.))-.12;rk2+=.02*sin(p.x*33.)*sin(p.z*23.);r=mn(r,vec2(rk2,6.));
 return r;}`,
// 3 snowman
`vec2 scene(vec3 p){
 vec2 r=vec2(p.y-terrainH(p.xz),1.);
 vec3 q=p-vec3(0,-.37,.02);
 float a=length(q-vec3(0,.05,0))-.20,b=length(q-vec3(0,.31,0))-.145,c=length(q-vec3(0,.51,0))-.105;
 float body=smin(smin(a,b,.03),c,.03);r=mn(r,vec2(body,1.2));
 vec3 n=q-vec3(0,.52,.09);float t=clamp(n.z/.13,0.,1.);float carrot=length(n-vec3(0,0,t*.13))-.022*(1.-t);r=mn(r,vec2(carrot*.8,8.));
 float coal=min(length(q-vec3(-.042,.555,.092))-.013,length(q-vec3(.042,.555,.092))-.013);
 for(int i=0;i<3;i++){coal=min(coal,length(q-vec3(0.,.37-float(i)*.075,sqrt(max(0.,.0210-pow(.06-float(i)*.075,2.)))+.005))-.013);}
 r=mn(r,vec2(coal,9.));
 float brim=sdCyl(q-vec3(0,.595,0),.115,.008);float crown=sdCyl(q-vec3(0,.665,0),.072,.07);r=mn(r,vec2(min(brim,crown),9.));
 float band=sdCyl(q-vec3(0,.61,0),.0745,.016);r=mn(r,vec2(band,10.));
 float sc=max(abs(length(q.xz*vec2(1,1))-.115)-.035,abs(q.y-.42)-.022);sc=max(sc,-1.);float tail=sdBox(q-vec3(.07,.33,.1)+vec3(0,0,0),vec3(.028,.075,.008));r=mn(r,vec2(min(sc,tail)*.85,10.));
 float arm1=sdCaps(q,vec3(.13,.33,0),vec3(.33,.46,.03),.009),arm2=sdCaps(q,vec3(-.13,.33,0),vec3(-.31,.5,.05),.009);
 arm1=min(arm1,sdCaps(q,vec3(.27,.42,.02),vec3(.34,.40,.05),.006));arm2=min(arm2,sdCaps(q,vec3(-.26,.44,.04),vec3(-.34,.44,.07),.006));
 r=mn(r,vec2(min(arm1,arm2),11.));
 r=mn(r,vec2(pine(p-vec3(-.5,terrainH(vec2(-.5,-.3))-.01,-.3),.62,.2,.3),2.));
 r=mn(r,vec2(pine(p-vec3(.52,terrainH(vec2(.52,-.25))-.01,-.25),.5,.17,.7),2.));
 r=mn(r,vec2(pine(p-vec3(.15,terrainH(vec2(.15,-.62))-.01,-.62),.42,.14,.1),2.));
 return r;}`,
];

const BAKE_NOISE = `precision highp sampler3D;uniform sampler3D uN3;
float h13(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
float n3(vec3 p){return textureLod(uN3,p/32.,0.).r;}
float fbm3(vec3 p){return .5*n3(p)+.25*n3(p*2.03+vec3(17.1,9.2,4.7))+.125*n3(p*4.12+vec3(3.3,1.9,8.1))+.0625*n3(p*8.3+vec3(5.,11.,2.));}
`;
let n3Tex = null;
function ensureN3() { if (n3Tex) return; const n = 32, d = new Uint8Array(n * n * n), r = mulberry(77); for (let i = 0; i < d.length; i++) d[i] = r() * 255; n3Tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_3D, n3Tex); gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, n, n, n, 0, gl.RED, gl.UNSIGNED_BYTE, d); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.REPEAT); gl.activeTexture(gl.TEXTURE0); }
function globeBakeFS(mapI) { return HEAD + BAKE_NOISE + SDF + MAPS[mapI] + `
uniform vec2 uJit;uniform float uR,uBase;uniform vec3 uKey,uFill,uWin,uWinDir,uLamp,uTop,uMid;uniform vec3 uTint;
layout(location=0) out vec4 o0;layout(location=1) out vec4 o1;
float sdProfile(vec2 p){ // the turned pedestal, as a polygon in (r,y)
 const int N=14;vec2 v[N]=vec2[N](vec2(0.,-.70),vec2(.66,-.70),vec2(.70,-.74),vec2(.72,-.86),vec2(.76,-.90),vec2(.76,-.94),vec2(.80,-.98),vec2(.86,-1.32),vec2(.93,-1.36),vec2(.93,-1.39),vec2(.985,-1.42),vec2(.985,-1.46),vec2(.96,-1.48),vec2(0.,-1.48));
 float d=dot(p-v[0],p-v[0]),s=1.;for(int i=0,j=N-1;i<N;j=i,i++){vec2 e=v[j]-v[i],w=p-v[i];vec2 b=w-e*clamp(dot(w,e)/dot(e,e),0.,1.);d=min(d,dot(b,b));bvec3 c=bvec3(p.y>=v[i].y,p.y<v[j].y,e.x*w.y>e.y*w.x);if(all(c)||all(not(c)))s=-s;}
 return s*sqrt(d)-.006;}
float base(vec3 p){return sdProfile(vec2(length(p.xz),p.y));}
vec3 baseN(vec3 p){vec2 e=vec2(.0015,-.0015);return normalize(e.xyy*base(p+e.xyy)+e.yyx*base(p+e.yyx)+e.yxy*base(p+e.yxy)+e.xxx*base(p+e.xxx));}
float inner(vec3 p){return length(p)-.985;}
vec2 mapI(vec3 p){vec2 r=scene(p);r.x=max(r.x,inner(p));return r;}
vec3 normalI(vec3 p){vec2 e=vec2(.0018,-.0018);return normalize(e.xyy*mapI(p+e.xyy).x+e.yyx*mapI(p+e.yyx).x+e.yxy*mapI(p+e.yxy).x+e.xxx*mapI(p+e.xxx).x);}
float shadow(vec3 p,vec3 l){float res=1.,t=.012;for(int i=0;i<34;i++){float d=mapI(p+l*t).x;if(length(p+l*t)>.97)break;res=min(res,11.*d/t);t+=clamp(d,.006,.09);if(res<.004||t>1.8)break;}return clamp(res,0.,1.);}
float ao(vec3 p,vec3 n){float s=0.,w=1.;for(int i=1;i<=6;i++){float h=.012+.05*float(i);s+=(h-mapI(p+n*h).x)*w;w*=.72;}return clamp(1.-s*1.5,0.,1.);}
vec3 env(vec3 d){
 float up=d.y*.5+.5;vec3 c=mix(uMid*.7,uTop*1.2+uMid*.3,smoothstep(.2,.9,up));
 vec3 wd=normalize(uWinDir),wr=normalize(cross(vec3(0,1,0),wd)),wu=cross(wd,wr);float f=dot(d,wd);
 if(f>0.){vec2 q=vec2(dot(d,wr),dot(d,wu))/f;vec2 a=abs(q)/vec2(.24,.34);float win=smoothstep(1.,.88,max(a.x,a.y));float bars=smoothstep(.006,.014,abs(q.x))*smoothstep(.006,.014,abs(q.y));c+=uWin*win*(.2+.8*bars)*(.7+.5*smoothstep(-.34,.34,q.y));}
 c+=uLamp*.8*pow(max(0.,dot(d,normalize(vec3(.75,.05,.55)))),24.);
 c+=uWin*.11*exp(-pow((d.x+.58)/.16,2.))*smoothstep(-.35,.25,d.y)*smoothstep(.75,.3,d.y);c+=uLamp*.1*exp(-pow((d.x-.72)/.07,2.))*smoothstep(-.3,.2,d.y);
 return c;}
vec3 woodCol(vec3 p){float r=length(p.xz*vec2(1.,.6)+vec2(.3,.1));float g=sin(r*92.+fbm3(p*vec3(3.,1.,3.))*16.)*.5+.5;float f=fbm3(p*vec3(9.,90.,9.));float c2=fbm3(p*vec3(5.,3.,5.));return mix(vec3(.022,.009,.005),vec3(.105,.048,.020),g*.42+f*.34+c2*.24);}
vec3 shadeBase(vec3 p,vec3 rd){
 vec3 n=baseN(p),l=normalize(uWinDir*vec3(1.,.95,1.)),v=-rd,R=reflect(rd,n);float ndv=max(0.,dot(n,v));
 float F=.04+.96*pow(1.-ndv,5.);vec3 alb;float rough=.2,metal=0.;
 float ring=smoothstep(.006,.0,abs(p.y+.95)-.022);
 ${''}
 if(uBase<.5){alb=woodCol(p);rough=.24;F=mix(F,.5,0.);}
 else if(uBase<1.5){alb=vec3(.012);rough=.05;if(ring>.5||abs(p.y+1.40)<.012){alb=vec3(1.,.72,.3);metal=1.;rough=.14;}}
 else if(uBase<2.5){alb=vec3(.92,.66,.30);metal=1.;rough=.17;}
 else{alb=vec3(.83,.78,.67);rough=.11;if(ring>.5)alb=vec3(.1,.2,.42);}
 float dif=max(0.,dot(n,l))*.9;
 float amb=.55+.45*n.y;float bot=smoothstep(-1.5,-1.3,p.y);
 float glossNoise=rough>.1?fbm3(p*30.)*.05:0.;
 vec3 e=env(normalize(R+glossNoise));
 vec3 c=alb*(1.-metal)*(uKey*dif+uFill*amb)*mix(.55,1.,bot);
 c+=e*(metal>.5?alb:vec3(F))*mix(.55,1.,bot);
 if(uBase<.5)c+=e*F*.35;
 return c;}
vec3 waterFade(float t){return exp(-t*(vec3(1.)-uTint)*1.1);}
vec3 shade(vec3 p,vec2 hit,vec3 rd,float tw){
 vec3 n=normalI(p);float m=hit.y;
 vec3 l=normalize(uWinDir+vec3(0,.28,0));
 float s=shadow(p+n*.008,l),a=ao(p,n);
 float dif=max(0.,dot(n,l));vec3 c=vec3(0);vec3 alb=vec3(.9);float sp=0.;
 float gr=fbm3(p*vec3(38.));
 if(m<1.6){ // snow, slightly crusted
  float mound=fbm3(p*9.);vec3 pn=normalize(n+(vec3(n3(p*70.),n3(p*70.+4.),n3(p*70.+9.))-.5)*.14+(vec3(n3(p*19.),n3(p*19.+4.),n3(p*19.+9.))-.5)*.17);n=pn;dif=max(0.,dot(n,l));
  alb=vec3(.93,.95,.98)*(.94+.1*mound);
  float wrap=max(0.,dot(n,l)*.55+.45);
  c=alb*(uKey*(wrap*.72*(.22+.78*s))+uFill*(.75+.35*n.y)*a*1.15);
  c+=vec3(.05,.09,.17)*(1.-s)*a*.65;
  float sparkle=pow(h13(floor(p*420.)),40.);c+=uKey*sparkle*1.6*s;
 } else if(m<2.5){ // pine boughs, with snow lying on them
  float up=n.y+.24*(fbm3(p*18.)-.5)*2.;float snowm=smoothstep(.34,.62,up);
  float nd=fbm3(p*vec3(65.,18.,65.));vec3 g=mix(vec3(.012,.042,.022),vec3(.05,.13,.055),nd);
  n=normalize(n+(vec3(n3(p*48.),n3(p*48.+4.),n3(p*48.+9.))-.5)*.5);dif=max(0.,dot(n,l));
  c=g*(uKey*dif*s*1.2+uFill*a*.8)+vec3(.05,.08,.03)*max(0.,dot(-n,l))*s*.5;
  vec3 sc=vec3(.92,.95,1.)*(uKey*max(0.,dot(n,l)*.5+.5)*(.4+.6*s)*.8+uFill*a*1.15);
  c=mix(c,sc,snowm);
 } else if(m<3.25){ // timber walls, log courses
  float k=fract(p.y*62.);alb=mix(vec3(.15,.08,.04),vec3(.30,.17,.09),fbm3(p*vec3(30.,90.,30.)));alb*=.55+.45*smoothstep(0.,.18,k)*smoothstep(1.,.8,k);
  c=alb*(uKey*dif*s*1.15+uFill*a);
 } else if(m<4.){ // dark roof / cap
  alb=vec3(.10,.05,.04);c=alb*(uKey*dif*s+uFill*a)+uKey*pow(max(0.,dot(reflect(rd,n),l)),30.)*.25*s;
 } else if(m<5.5){ // glowing windows
  float bars=smoothstep(.0025,.005,abs(fract(p.x*24.+.5)-.5)/24.)*smoothstep(.0025,.005,abs(fract(p.y*24.+.5)-.5)/24.);
  c=vec3(3.4,1.9,.62)*(.35+.65*bars)*(.8+.3*fbm3(p*60.));
 } else if(m<6.5){ // stone
  float st=fbm3(p*46.);alb=mix(vec3(.10,.09,.09),vec3(.34,.31,.29),st);n=normalize(n+(vec3(n3(p*60.),n3(p*60.+4.),n3(p*60.+9.))-.5)*.5);dif=max(0.,dot(n,l));float snow=smoothstep(.55,.85,n.y+st*.3);c=alb*(uKey*dif*s+uFill*a);c=mix(c,vec3(.9)*(uKey*.6*s+uFill*a),snow);
 } else if(m<7.5){ // lighthouse stripes
  float k=smoothstep(.0,.004,abs(fract(p.y*5.3+.02)-.5)-.25);alb=mix(vec3(.82,.80,.76),vec3(.55,.05,.04),k);c=alb*(uKey*dif*s*1.1+uFill*a)+uKey*pow(max(0.,dot(reflect(rd,n),l)),40.)*.3*s;
 } else if(m<8.5){alb=vec3(.85,.28,.03);c=alb*(uKey*dif*s*1.2+uFill*a);
 } else if(m<9.5){alb=vec3(.012);c=alb*(uKey*dif*s+uFill*a)+uKey*pow(max(0.,dot(reflect(rd,n),l)),50.)*.6*s;
 } else if(m<10.5){alb=vec3(.60,.04,.05);float k=sin(p.x*260.)*sin(p.y*300.);alb*=.84+.2*k;c=alb*(uKey*dif*s*1.1+uFill*a);
 } else {alb=vec3(.12,.07,.04);c=alb*(uKey*dif*s+uFill*a);}
 // warm spill from any lit window
 ${mapI < 2 ? 'float w0=length(p-vec3(-.06,-.3,.17));float wg=exp(-w0*w0*11.)*smoothstep(-.3,.6,dot(n,normalize(vec3(-.06,-.3,.17)-p)));' : 'float wg=0.;'}
 ${mapI === 2 ? 'wg=exp(-pow(length(p-vec3(.32,-.27,.14)),2.)*22.)*.5;' : ''}
 if(m<4.)c+=alb*vec3(1.5,.74,.26)*wg*.42;
 return c*waterFade(tw);}
const float MAXT=8.;
void main(){
 vec2 pix=(gl_FragCoord.xy+uJit)/uR-vec2(${QX.toFixed(2)},${QT.toFixed(2)});
 vec3 fw=vec3(0,-SA,-CA),up=vec3(0,CA,-SA),rt=vec3(1,0,0);
 vec3 ro=rt*pix.x+up*(-pix.y)-fw*5.;vec3 rd=fw;
 // the base
 float tb=-1.;{float t=2.5;for(int i=0;i<90;i++){float d=base(ro+rd*t);if(d<.0012){tb=t;break;}t+=d*.92;if(t>MAXT)break;}}
 float b=dot(ro,rd),c=dot(ro,ro)-1.,h=b*b-c;float ts=h>0.?-b-sqrt(h):-1.;
 vec2 sh=vec2(0.);o1=vec4(0.,0.,-2.,0.);
 if(ts>0.&&(tb<0.||ts<tb)){
  vec3 e=ro+rd*ts,n=e,ir=refract(rd,n,1./1.33);
  float t=.004;vec2 hit=vec2(0.);bool got=false;float ex=-2.*dot(e,ir);
  for(int i=0;i<140;i++){vec3 p=e+ir*t;vec2 m=mapI(p);if(m.x<.0009){hit=m;got=true;break;}t+=m.x*.85;if(t>ex)break;}
  if(got){vec3 p=e+ir*t;o0=vec4(shade(p,hit,ir,t),1.);o1=vec4(0.,0.,dot(p,-fw)+0.,1.);}
  else{o0=vec4(0.,0.,0.,0.);vec3 x=e+ir*ex,nx=-x,or=refract(ir,nx,1.33);if(dot(or,or)<.01)or=reflect(ir,nx);
   vec3 cam=vec3(dot(x,rt),dot(x,up),dot(x,-fw)),dir=vec3(dot(or,rt),dot(or,up),dot(or,-fw));
   float dz=min(-.12,dir.z);vec2 q=cam.xy+dir.xy/(-dz)*(${BACK.toFixed(1)}+cam.z);o1=vec4(q.x,-q.y,-2.,1.);}
 } else if(tb>0.){vec3 p=ro+rd*tb;o0=vec4(shadeBase(p,rd),1.);o1=vec4(0.,0.,9.,0.);}
 else{o0=vec4(0.);o1=vec4(0.,0.,-2.,0.);}
}`; }

// ---- backdrop and table, baked once
const bgFS = HEAD + NOISE + `
uniform vec2 uWorld;uniform float uHorizon,uU;uniform vec3 uTop,uMid,uTableA,uTableB,uGlow,uKey,uFill;uniform float uGain,uTrainZ;
uniform int uN;uniform vec4 uG[16];uniform vec2 uLight;
out vec4 o;
vec3 back(vec2 p){
 float g=smoothstep(-.05*uU,uHorizon,p.y);vec3 c=mix(uTop,uMid,g*g);
 float a=fbm(p/uU*vec2(1.1,1.5)+3.),b=fbm(p/uU*2.3+vec2(7.,2.));
 c*=.78+.42*a;c+=uGlow*smoothstep(.42,.82,b)*.8*g*g;
 return c;}
vec3 wood(vec2 p,float z){
 float blur=clamp(abs(z)/uU*.34,0.,1.);
 vec2 q=vec2(p.x,z)/uU;
 float plank=floor(q.y*.42+.4);float k=fract(q.y*.42+.4);float seam=smoothstep(.0,.0025+blur*.03,k)*smoothstep(1.,.9975-blur*.03,k);
 q.x+=plank*7.31;q.y+=plank*3.7;
 float warp=fbm(q*vec2(.35,1.1));float rings=sin((q.y*11.+warp*15.)+plank*2.)*.5+.5;
 float fine=fbm(q*vec2(14.,120.));float med=fbm(q*vec2(2.,20.)+9.);
 float t=mix(rings*.5+med*.5,.5,blur*.75);
 vec3 c=mix(uTableA,uTableB,t);c*=mix(.70+.6*fine,1.,blur);c*=mix(.45,1.,seam);
 return c;}
void main(){
 vec2 p=gl_FragCoord.xy;vec3 c;
 float bl=0.;
 if(p.y<uHorizon){c=back(p);
  float dh=uHorizon-p.y;c*=mix(.76,1.,smoothstep(0.,.05*uU,dh));
 } else {
  float yc=uG[0].y+uG[0].z*1.48*${CA.toFixed(4)};
  float z=(yc-p.y)/${SA.toFixed(4)};
  c=wood(p,z);
  float g=(p.y-uHorizon)/max(1.,H0());
  // lacquer: at this grazing angle the table mirrors the room
  float d=p.y-uHorizon;vec2 mir=vec2(p.x,uHorizon-d*.95);
  vec3 r=vec3(0);for(int i=0;i<8;i++){float a=float(i)*2.4,rr=sqrt((float(i)+.5)/8.)*(14.+d*.22);r+=back(mir+vec2(cos(a)*rr*.45,sin(a)*rr));}r/=8.;
  float F=mix(.55,.08,smoothstep(0.,.5*uU,d))*(.74+.5*fbm(p/uU*vec2(5.,60.)));
  c=c*(uFill*.8+uKey*.8)+r*F*1.05;
  c=mix(c,back(vec2(p.x,uHorizon-2.))*.5,exp(-d/(.012*uU))*.5);
  // shadows and caustics from every globe
  for(int i=0;i<uN;i++){vec4 G=uG[i];vec2 q=vec2(p.x-G.x,p.y-(G.y+G.z*1.47))/G.z;
   float e=length(q/vec2(.985,.125));float ao=exp(-max(0.,e-1.)*1.5);c*=1.-.86*ao;
   vec2 s=q-vec2(uLight.x*.95,.02+uLight.y*.02);float sd=length(s/vec2(1.5,.16));float shad=exp(-sd*sd*.65);c*=1.-.74*shad;
   vec2 cq=q-vec2(uLight.x*1.15,.025);float ca=exp(-dot(cq/vec2(.40,.042),cq/vec2(.40,.042))*.75);float core=exp(-dot(cq/vec2(.14,.016),cq/vec2(.14,.016))*.8);
   float rip=.75+.5*fbm(q*vec2(5.,30.)+float(i)*7.);c+=uKey*vec3(1.1,.98,.8)*(ca*.13+core*.5)*rip;
  }
  // the toy train's little track
  float tz=(p.y-uTrainZ)/uU;float rail=exp(-pow(tz/.0016,2.))*.8+exp(-pow((tz+.0075)/.0016,2.))*.5;
  float tie=smoothstep(.34,.2,abs(fract(p.x/uU/.013)-.5))*smoothstep(.009,.007,abs(tz+.0036));
  c=mix(c,c*.46+vec3(.012,.008,.005),tie*.92);c=mix(c,vec3(.13,.115,.10)*(uFill+uKey*.8),clamp(rail,0.,1.)*.9);
  c*=1.-.35*exp(-pow((tz-.002)/.0045,2.));
 }
 c*=uGain;c=c/(1.+c*.14);c=pow(max(c,vec3(0)),vec3(1./2.2));
 c+=(h12(p+1.3)-.5)/255.;
 o=vec4(c,1);}`.replace('H0()', '1.');

const COMMON_V = HEAD + W2C;
const pictureFS = HEAD + `in vec2 vW;uniform sampler2D uT;uniform vec2 uWorld;out vec4 o;void main(){o=vec4(texture(uT,vW/uWorld).rgb,1);}`;

// bokeh discs: additive, slightly onion-ringed like a real lens
const bokehVS = COMMON_V + `layout(location=0)in vec4 iA;layout(location=1)in vec4 iC;uniform vec4 uView;uniform float uFlip,uHorizon;out vec2 vP;out vec4 vC;const vec2 Q[4]=vec2[4](vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(1,1));
void main(){vec2 c=Q[gl_VertexID];vP=c;vC=iC;vec2 w=iA.xy;vec2 s=vec2(iA.z);if(uFlip>.5){w.y=uHorizon+(uHorizon-w.y)*.55+iA.z*.2;s.y*=2.2;s.x*=1.0;vC.a*=.05;}gl_Position=w2c(w+c*s,0.,uView);}`;
const bokehFS = HEAD + `in vec2 vP;in vec4 vC;uniform float uFlip;out vec4 o;void main(){float r=length(vP);if(uFlip>.5){o=vec4(vC.rgb*vC.a*exp(-r*r*3.2),0.);return;}float a=vP.y*.6+vP.x*.25;float e=smoothstep(1.,.93,r);float rim=smoothstep(.62,1.,r);float k=(.36+.40*rim*rim*rim)*e;k*=1.+.035*sin(r*19.+a*2.);o=vec4(vC.rgb*k*vC.a,0.);}`;

// the composited globe: interior + live world through the water + glass
const globeVS = COMMON_V + `uniform vec4 uView,uBox;uniform vec3 uRot;out vec2 vQ;const vec2 Q[4]=vec2[4](vec2(0,0),vec2(1,0),vec2(0,1),vec2(1,1));
void main(){vec2 c=Q[gl_VertexID];vQ=c;vec2 w=uBox.xy+c*uBox.zw;gl_Position=w2c(w,0.,uView);}`;
const ENV = `uniform vec3 uTop,uMid,uWin,uWinDir,uLamp;
vec3 env(vec3 d){
 float up=d.y*.5+.5;vec3 c=mix(uMid*.7,uTop*1.2+uMid*.3,smoothstep(.2,.9,up));
 vec3 wd=normalize(uWinDir+vec3(-.35,.42,-.5)),wr=normalize(cross(vec3(0,1,0),wd)),wu=cross(wd,wr);float f=dot(d,wd);
 if(f>0.){vec2 q=vec2(dot(d,wr),dot(d,wu))/f;vec2 a=abs(q)/vec2(.15,.22);float win=smoothstep(1.,.72,max(a.x,a.y));float bars=smoothstep(.004,.012,abs(q.x))*smoothstep(.004,.012,abs(q.y));c+=uWin*win*(.25+.75*bars)*(.5+.9*smoothstep(-.22,.22,q.y))*4.5;c+=uWin*.34*exp(-dot(q,q)*5.5);}
 c+=uLamp*pow(max(0.,dot(d,normalize(vec3(.75,.05,.55)))),30.);
 c+=uLamp*.35*pow(max(0.,dot(d,normalize(vec3(-.2,-.5,.8)))),14.);
 return c;}`;
const globeFS = HEAD + NOISE + ENV + `in vec2 vQ;uniform sampler2D uI,uX,uBehind;uniform vec4 uBox;uniform vec3 uC;uniform vec2 uWorld;uniform vec3 uTint;uniform float uWob,uTime,uR,uSpin;uniform float uMode;
out vec4 o;
const float QX=${QX.toFixed(2)},QT=${QT.toFixed(2)};
void main(){
 vec2 uv=vQ;vec4 I=texture(uI,uv),X=texture(uX,uv);
 vec2 pix=vQ*uBox.zw/uR-vec2(QX,QT);
 float r=length(pix);
 if(uMode<.5){ // what is behind the surface
  vec3 c=I.rgb;float cover=I.a;float inSphere=X.a;
  vec2 q=X.xy;
  if(uWob>.001)q+=uWob*.14*vec2(sin(pix.y*5.+uTime*7.),cos(pix.x*6.+uTime*9.));
  vec2 wp=uC.xy+q*uR;
  vec3 b=texture(uBehind,wp/uWorld).rgb;b=pow(b,vec3(2.2));
  float rim=smoothstep(.62,1.,r);b*=mix(1.,.34,rim*rim);
  vec3 lin=c+(1.-cover)*inSphere*b*uTint;
  float alpha=clamp(cover+(1.-cover)*inSphere,0.,1.);
  float edge=smoothstep(1.+1.6/uR,1.-.4/uR,r);
  float glassOnly=step(r,1.)*inSphere;
  float solid=smoothstep(4.,8.,X.z)*cover;o=vec4(lin,max(solid,alpha*edge));
  o.rgb=pow(max(o.rgb/(1.+o.rgb*.14)*1.,vec3(0)),vec3(1./2.2));
  o.rgb*=1.;
 } else { // the surface
  float inS=step(.0001,X.a+.0);float edge=smoothstep(1.+1.2/uR,1.-1.2/uR,r);
  float occ=smoothstep(.0,.4,X.a+.35*step(.5,I.a)*step(X.z,5.));
  if(X.z>5.||r>1.03){o=vec4(0.);return;}
  float nz=sqrt(max(0.,1.-r*r));vec3 n=vec3(pix.x,-pix.y,nz);
  vec3 cam=vec3(0,0,1);
  float F=.03+.97*pow(1.-max(0.,nz),5.);
  vec3 Rl=reflect(vec3(0,0,-1),normalize(n));
  // tilt the reflection into world orientation
  vec3 e=env(normalize(vec3(Rl.x,Rl.y*.995+Rl.z*.105,Rl.z*.995-Rl.y*.105)));
  float smear=fbm(pix*14.)*.8+.2;
  vec3 add=e*F*2.6;
  // the far surface reflects the window a second time, inverted and dim
  vec3 R2=normalize(vec3(-Rl.x*.75,-Rl.y*.75,max(.1,abs(Rl.z))));add+=env(R2)*.006*(.5+.5*nz);
  // a clean rim of light right at the edge, and dark glass just inside it
  add+=(min(uMid*1.5,vec3(.16))+vec3(.05))*pow(r,28.)*.9;
  float bub=0.;
  float a=edge*(1.-exp(-dot(add,vec3(.33))*.0));
  add+=uWin*.012*exp(-dot(pix-vec2(-.42,-.46),pix-vec2(-.42,-.46))*3.2);float darken=pow(r,7.)*.46*edge;
  o=vec4(pow(add/(1.+add*.28),vec3(1./2.2))*edge*(1.+0.*smear),darken+0.*a);
 }
}`;

// flakes: instanced, drawn after the interior and before the glass
const flakeVS = COMMON_V + `layout(location=0)in vec4 iA;layout(location=1)in vec4 iB;uniform vec4 uView;uniform vec4 uBox;uniform float uR;uniform sampler2D uX;out vec2 vP;out vec3 vC;out float vA;const vec2 Q[4]=vec2[4](vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(1,1));
void main(){vec2 c=Q[gl_VertexID];vec2 d=iB.xy;float s=iA.z;float l=length(d);vec2 t=l>.5?d/l:vec2(1,0),nn=vec2(-t.y,t.x);vec2 off=t*c.x*(s+l*.5)+nn*c.y*s;vP=c;
 vec2 uv=(iA.xy-uBox.xy)/uBox.zw;vec4 X=textureLod(uX,uv,0.);float behind=(X.z>iB.z+.01)?0.:1.;float inside=X.a;
 vC=vec3(iB.w);vA=iA.w*behind*inside;gl_Position=w2c(iA.xy+off,0.,uView);}`;
const flakeFS = HEAD + `in vec2 vP;in vec3 vC;in float vA;uniform vec3 uFC;uniform float uGlit;out vec4 o;void main(){float r=length(vP);float a=smoothstep(1.,.2,r);vec3 c=uFC*vC;o=vec4(c,1.)*a*vA;}`;

// the little train: painted tin, drawn once to a sprite
const trainFS = HEAD + NOISE + `
uniform vec2 uRes;uniform vec3 uKey,uFill;layout(location=0) out vec4 o;
float sdBox(vec3 p,vec3 b){vec3 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);}
float cylZ(vec3 p,float r,float h){vec2 d=abs(vec2(length(p.xy),p.z))-vec2(r,h);return min(max(d.x,d.y),0.)+length(max(d,0.));}
float cylX(vec3 p,float r,float h){vec2 d=abs(vec2(length(p.yz),p.x))-vec2(r,h);return min(max(d.x,d.y),0.)+length(max(d,0.));}
float cylY(vec3 p,float r,float h){vec2 d=abs(vec2(length(p.xz),p.y))-vec2(r,h);return min(max(d.x,d.y),0.)+length(max(d,0.));}
vec2 mn(vec2 a,vec2 b){return a.x<b.x?a:b;}
vec2 wheels(vec3 p,float x0,float x1,float r){vec2 d=vec2(1e3,6.);for(int i=0;i<2;i++){float x=mix(x0,x1,float(i));d=mn(d,vec2(cylZ(p-vec3(x,r,.105),r,.012),6.));}return d;}
vec2 car(vec3 p,float x0,vec3 col){vec3 q=p-vec3(x0,0,0);vec2 d=vec2(sdBox(q-vec3(0,.215,0),vec3(.27,.135,.098))-.01,3.);d=mn(d,vec2(sdBox(q-vec3(0,.08,0),vec3(.29,.022,.104)),6.));
 float roof=max(length(q.yz-vec2(.20,0.))-.165,max(.345-q.y,abs(q.x)-.30));d=mn(d,vec2(roof,4.));
 for(int i=0;i<5;i++){d=mn(d,vec2(sdBox(q-vec3(-.2+float(i)*.1,.25,.104),vec3(.034,.047,.004)),5.));}
 d=mn(d,wheels(q,-.17,.17,.052));return d;}
vec2 map(vec3 p){
 vec3 q=p-vec3(-.42,0,0);
 vec2 d=vec2(cylX(q-vec3(.07,.205,0),.098,.27),1.);
 d=mn(d,vec2(sdBox(q-vec3(.31,.245,0),vec3(.115,.16,.112))-.008,1.));
 d=mn(d,vec2(sdBox(q-vec3(.31,.425,0),vec3(.14,.016,.125)),4.));
 d=mn(d,vec2(sdBox(q-vec3(.31,.28,.116),vec3(.05,.06,.004)),5.));
 d=mn(d,vec2(cylY(q-vec3(-.13,.355,0),.032,.075),4.));
 d=mn(d,vec2(cylY(q-vec3(-.13,.435,0),.056,.018),2.));
 d=mn(d,vec2(cylY(q-vec3(.08,.32,0),.042,.035),2.));
 d=mn(d,vec2(cylX(q-vec3(-.215,.205,0),.102,.012),2.));
 d=mn(d,vec2(cylX(q-vec3(.0,.205,0),.102,.009),2.));d=mn(d,vec2(cylX(q-vec3(.17,.205,0),.102,.009),2.));
 d=mn(d,vec2(sdBox(q-vec3(.1,.08,0),vec3(.38,.022,.105)),6.));
 for(int i=0;i<3;i++){d=mn(d,vec2(cylZ(q-vec3(-.17+float(i)*.2,.075,.105),.075,.012),6.));}
 d=mn(d,vec2(cylZ(q-vec3(.34,.055,.105),.052,.012),6.));
 d=mn(d,vec2(sdBox(q-vec3(.09,.08,.122),vec3(.2,.008,.006)),2.));
 float cc=max(sdBox(q-vec3(-.33,.08,0),vec3(.075,.05,.09)),dot(q-vec3(-.40,.03,0),normalize(vec3(.6,-.8,0))));
 d=mn(d,vec2(cc,7.));
 d=mn(d,car(p,.42,vec3(0)));d=mn(d,car(p,1.08,vec3(0)));
 return d;}
vec3 nor(vec3 p){vec2 e=vec2(.002,0);return normalize(vec3(map(p+e.xyy).x-map(p-e.xyy).x,map(p+e.yxy).x-map(p-e.yxy).x,map(p+e.yyx).x-map(p-e.yyx).x));}
void main(){
 vec2 uv=(gl_FragCoord.xy)/uRes;vec2 w=vec2(uv.x*2.3-.9,(1.-uv.y)*.62-.02);
 vec3 ro=vec3(w,3.);ro.y+=.30;vec3 rd=normalize(vec3(0,-.10,-1));float t=.5;vec2 hit=vec2(-1.);
 for(int i=0;i<90;i++){vec2 m=map(ro+rd*t);if(m.x<.0015){hit=m;break;}t+=m.x;if(t>6.)break;}
 if(hit.y<0.){o=vec4(0);return;}
 vec3 p=ro+rd*t,n=nor(p),L=normalize(vec3(-.5,.72,.6));float dif=max(0.,dot(n,L)),amb=.6+.4*n.y;float m=hit.y;vec3 alb;float gl1=.4;
 if(m<1.5)alb=vec3(.42,.04,.03);else if(m<2.5){alb=vec3(.85,.6,.2);gl1=1.;}else if(m<3.5){alb=vec3(.07,.20,.14);}else if(m<4.5){alb=vec3(.02);}else if(m<5.5){o=vec4(pow(vec3(3.,1.75,.6),vec3(1./2.2)),1.);return;}else if(m<6.5){alb=vec3(.035);}else{alb=vec3(.50,.05,.03);}
 vec3 R=reflect(rd,n);float sp=pow(max(0.,dot(R,L)),40.);float F=.04+.96*pow(1.-max(0.,dot(-rd,n)),5.);
 vec3 c=alb*(uKey*dif+uFill*amb*1.5)+uKey*sp*gl1*.7+mix(uFill*.8,uKey*.5,.4)*F;
 c*=.62+.5*smoothstep(.04,.5,p.y);c*=vec3(1.05,.97,.86);
 c=c/(1.+c*.14);o=vec4(pow(c,vec3(1./2.2)),1.);}`;
const spriteVS = COMMON_V + `uniform vec4 uView,uBox;uniform float uFlipX;out vec2 vUV;const vec2 Q[4]=vec2[4](vec2(0,0),vec2(1,0),vec2(0,1),vec2(1,1));void main(){vec2 c=Q[gl_VertexID];vUV=c;gl_Position=w2c(uBox.xy+c*uBox.zw,0.,uView);}`;
const spriteFS = HEAD + `in vec2 vUV;uniform sampler2D uT;uniform float uLod,uDim;out vec4 o;void main(){vec4 c=textureLod(uT,vUV,uLod)*.5;c+=textureLod(uT,vUV+vec2(.0014,.004),uLod+.4)*.25;c+=textureLod(uT,vUV-vec2(.0014,.004),uLod+.4)*.25;c.rgb*=uDim;o=c;}`;
const puffVS = bokehVS;
const puffFS = HEAD + NOISE + `in vec2 vP;in vec4 vC;out vec4 o;void main(){float r=length(vP);float n=fbm(vP*2.2+vC.rg*9.);float a=smoothstep(1.,.1,r)*smoothstep(.25,.7,n+.3*(1.-r));a*=vC.a;o=vec4(vec3(.92,.90,.88)*a,a);}`;
const finishFS = HEAD + NOISE + `in vec2 vW;uniform vec4 uView;uniform float uTime;out vec4 o;void main(){vec2 v=(vW-vec2(uView.x,0.))/uView.yz;float aspect=uView.y/uView.z;vec2 q=(v-.5)*vec2(aspect,1.);float vig=smoothstep(.45,1.2,length(q*vec2(.72,1.)));float a=vig*.42;float g=(h12(vW+fract(uTime)*311.)-.5)*.05;o=vec4(vec3(max(g,0.)),a+max(-g,0.));}`;

const P = {};
function ensurePrograms() {
  if (P.bg) return;
  P.bg = program(FS_TRI, bgFS); P.picture = program(QUAD_VS, pictureFS);
  P.bokeh = program(bokehVS, bokehFS); P.globe = program(globeVS, globeFS); P.flake = program(flakeVS, flakeFS);
  P.train = program(FS_TRI, trainFS); P.sprite = program(spriteVS, spriteFS); P.puff = program(puffVS, puffFS); P.finish = program(QUAD_VS, finishFS);
  P.map = [];
}
const mapProg = (i) => P.map[i] || (P.map[i] = program(FS_TRI, globeBakeFS(i)));

// ---- world
let globes = [], bgRT = null, behindRT = null, trainRT = null, horizon = 0, trainY = 0, trainX = 0, trainSpeed = 0, puffs = [], bokeh = [], bokehBuf, bokehVAO, flakeBuf, flakeVAO, puffBuf, puffVAO, time = 0, autoT = 0, thump = 0, whistle = 0;
const MAXFLK = 12000;
const flakeData = new Float32Array(MAXFLK * 8);

// where a point inside the water appears on the glass: bisection along the refracted entry ray, as a table
const LUT_N = 56, LUT = new Float32Array(LUT_N * LUT_N);
(() => { const n = 1.33; for (let j = 0; j < LUT_N; j++) for (let i = 0; i < LUT_N; i++) { const r = i / (LUT_N - 1), z = j / (LUT_N - 1) * 2 - 1; let lo = 0, hi = .9995; const f = (rho) => { const ti = Math.asin(rho), tt = Math.asin(rho / n), d = ti - tt; return rho - (Math.sqrt(1 - rho * rho) - z) * Math.tan(d); }; for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (f(m) < r) lo = m; else hi = m; } LUT[j * LUT_N + i] = (lo + hi) / 2; } })();
function apparent(r, z) { const x = clamp(r, 0, 1) * (LUT_N - 1), y = clamp((z + 1) / 2, 0, 1) * (LUT_N - 1), xi = Math.min(LUT_N - 2, x | 0), yi = Math.min(LUT_N - 2, y | 0), fx = x - xi, fy = y - yi, a = LUT[yi * LUT_N + xi], b = LUT[yi * LUT_N + xi + 1], c = LUT[(yi + 1) * LUT_N + xi], d = LUT[(yi + 1) * LUT_N + xi + 1]; return lerp(lerp(a, b, fx), lerp(c, d, fx), fy); }
const terrainH = (x, z) => -.50 + .13 * Math.exp(-(x * x + z * z) * 2.4) + .022 * Math.sin(x * 7 + 1) * Math.sin(z * 6);

function room() { return ROOMS[S.room] || ROOMS.fire; }
function makeFlakes(g, n) {
  g.n = n; g.p = new Float32Array(n * 3); g.v = new Float32Array(n * 3); g.st = new Uint8Array(n); g.k = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { let x, y, z; do { x = rnd(-1, 1); y = rnd(-.45, .95); z = rnd(-1, 1); } while (x * x + y * y + z * z > .85); g.p[i * 3] = x; g.p[i * 3 + 1] = y; g.p[i * 3 + 2] = z; { const u = Math.random(); g.k[i * 3] = .42 + 1.5 * u * u * u; } g.k[i * 3 + 1] = rnd(TAU); g.k[i * 3 + 2] = rnd(.6, 1.4); }
  g.E = .9;
}
function flakeCount() { return Math.round(S.snow * (SNOWS[S.snowType].size < .8 ? 1.7 : 1)); }
function layoutGlobes() {
  const mons = monitors();
  const out = []; const names = ['cabin', 'lighthouse', 'snowman', 'forest'];
  let idx = 0;
  for (const m of mons) {
    const cnt = +S.perScreen; const cellW = m.ww / cnt;
    for (let i = 0; i < cnt; i++) {
      const R = Math.min(unit * .30 * S.globeSize, cellW * .40), cx = m.wx + cellW * (i + .5), cy = unit * .43 + (unit * .30 - R) * 1.42;
      const name = S.scene === 'mix' ? names[idx % names.length] : S.scene; idx++;
      out.push({ cx, cy, R, name });
    }
  }
  return out;
}
function setRoomU(u) { const r = room(); const f = (n, v) => { if (u[n]) gl.uniform3fv(u[n], v); }; f('uKey', r.key); f('uFill', r.fill); f('uWin', r.win); f('uWinDir', r.winDir); f('uLamp', r.lamp); f('uTop', r.top); f('uMid', r.mid); f('uTableA', r.tableA); f('uTableB', r.tableB); f('uGlow', r.glow); if (u.uGain) gl.uniform1f(u.uGain, r.gain); }
const JIT = [[.5,.5],[.25,.25],[.75,.75],[.75,.25],[.25,.75],[.5,.1],[.1,.5],[.9,.5],[.5,.9],[.15,.1],[.85,.9],[.1,.9],[.9,.1],[.35,.6],[.65,.4],[.5,.35]];
const tintOf = () => ({ clear: [.97, .985, 1], blue: [.56, .78, 1], amber: [1, .80, .45], rose: [1, .68, .78] }[S.water] || [.97, .985, 1]);
function queueGlobeBake(g) {
  const m = SCENES[g.name].def, PR = () => mapProg(m), tint = tintOf();
  const pw = Math.ceil((2 * QX) * g.R), ph = Math.ceil((QT + QB) * g.R);
  g.box = [g.cx - QX * g.R, g.cy - QT * g.R, pw, ph]; g.w = pw; g.h = ph;
  // accumulate jittered color and a single map; resolved by dividing in the compositor
  g.rt = makeRT(pw, ph, { float: true, attachments: 2 });
  g.rs = makeRT(pw, ph, { float: true, attachments: 2 });
  const passes = 16;
  bakeTiles(g.rt, { tile: 96, passes, cost: 7, blend: true, begin: (pass) => {
    const p = PR(); gl.useProgram(p.p); gl.uniform1i(p.u.uN3, 5); gl.uniform2f(p.u.uJit, JIT[pass][0] - .5, JIT[pass][1] - .5); gl.uniform1f(p.u.uR, g.R); gl.uniform1f(p.u.uBase, BASES[S.base].mat); setRoomU(p.u); gl.uniform3fv(p.u.uTint, tint);
  } });
  bakeStep(() => { // resolve: average the color; the map is rebuilt without jitter
    gl.bindFramebuffer(gl.FRAMEBUFFER, g.rs.fb); gl.viewport(0, 0, pw, ph); gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
    const p = P.resolve || (P.resolve = program(FS_TRI, HEAD + `uniform sampler2D uA;uniform float uN;layout(location=0) out vec4 o;layout(location=1) out vec4 o1;void main(){vec4 a=texelFetch(uA,ivec2(gl_FragCoord.xy),0)/uN;o=a;o1=vec4(0.);}`));
    gl.useProgram(p.p); bindTex(0, g.rt.texs[0], p.u.uA); gl.uniform1f(p.u.uN, passes); gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]); tri(); gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, g.rt.fb); gl.viewport(0, 0, pw, ph); gl.clear(gl.COLOR_BUFFER_BIT);
  });
  bakeTiles(g.rt, { tile: 128, passes: 1, cost: 7, begin: () => { const p = PR(); gl.useProgram(p.p); gl.uniform1i(p.u.uN3, 5); gl.uniform2f(p.u.uJit, 0, 0); gl.uniform1f(p.u.uR, g.R); gl.uniform1f(p.u.uBase, BASES[S.base].mat); setRoomU(p.u); gl.uniform3fv(p.u.uTint, tint); } });
  g.colorT = () => g.rs.texs[0]; g.mapT = () => g.rt.texs[1];
}

const SCENE = {
  key: 'snowglobe',
  defaults: { scene: 'mix', room: 'fire', base: 'walnut', snowType: 'flakes', water: 'clear', snow: 1900, perScreen: 1, globeSize: 1, train: true, auto: 45, tool: 'shake' },
  validate(S) { for (const [k, t] of [['scene', SCENES], ['room', ROOMS], ['base', BASES], ['snowType', SNOWS]]) if (!t[S[k]]) S[k] = this.defaults[k]; },
  panelTitle: 'Your globes', panelSub: 'Drag a globe to shake it. Saved between visits.',
  hello: 'Drag a globe to shake it. A hard enough shake rattles the whole shelf.',
  tools: [['shake', 'Shake'], ['thump', 'Thump the table'], null, ['all', 'Shake them all', () => { act('all', 0, 0, 'down'); }], ['whistle', 'Blow the whistle', () => { act('whistle', 0, 0, 'down'); }]],
  panel(ui) {
    ui.sel('Inside the glass', 'scene', SCENES);
    ui.sel('The room', 'room', ROOMS);
    ui.sel('Pedestal', 'base', BASES);
    ui.sel('What falls', 'snowType', SNOWS);
    ui.seg('Water', 'water', [['clear', 'Clear'], ['blue', 'Blue'], ['amber', 'Amber'], ['rose', 'Rose']]);
    ui.range('Amount of snow', 'snow', 800, 7000, 100);
    ui.seg('Globes per screen', 'perScreen', [[1, 'One'], [2, 'Two'], [3, 'Three']]);
    ui.range('Globe size', 'globeSize', .6, 1, .05, v => Math.round(v * 100) + '%');
    ui.seg('Shake it for me', 'auto', [[0, 'Never'], [90, '90s'], [45, '45s'], [20, '20s']]);
    ui.tog('The little train', 'train');
  },
  changed(k) { if (['scene', 'room', 'base', 'water', 'perScreen', 'globeSize'].includes(k)) SCENE.build(); else if (k === 'snow' || k === 'snowType') { const n = flakeCount(); for (const g of globes) makeFlakes(g, n); } },
  build() {
    ensurePrograms(); ensureN3(); rebake();
    document.getElementById('fade').style.opacity = 1;
    for (const g of globes) { g.rt && g.rt.free(); g.rs && g.rs.free(); }
    if (bgRT) bgRT.free(); if (behindRT) behindRT.free();
    globes = layoutGlobes(); const n = flakeCount();
    for (const g of globes) { makeFlakes(g, n); g.sx = 0; g.sy = 0; g.svx = 0; g.svy = 0; }
    horizon = unit * .66; trainY = unit * .776; trainSpeed = unit * .085;
    const R = mulberry(SEED + 5);
    bgRT = makeRT(W, H); behindRT = makeRT(Math.ceil(W / 2), Math.ceil(H / 2));
    for (const g of globes) queueGlobeBake(g);
    const room_ = room();
    bakeTiles(bgRT, { tile: 256, cost: 1.4, begin: () => {
      const p = P.bg; gl.useProgram(p.p); gl.uniform2f(p.u.uWorld, W, H); gl.uniform1f(p.u.uHorizon, horizon); gl.uniform1f(p.u.uU, unit); setRoomU(p.u); gl.uniform1f(p.u.uTrainZ, trainY);
      const G = new Float32Array(16 * 4); globes.slice(0, 16).forEach((g, i) => G.set([g.cx, g.cy, g.R, 0], i * 4)); gl.uniform4fv(p.u.uG, G); gl.uniform1i(p.u.uN, Math.min(16, globes.length));
      const d = room_.winDir; gl.uniform2f(p.u.uLight, -d[0] / Math.hypot(d[0], d[2]), .5);
    } });
    if (trainRT) trainRT.free();
    trainRT = makeRT(1440, 400, { mips: true });
    bakeTiles(trainRT, { tile: 200, cost: 3, begin: () => { const p = P.train; gl.useProgram(p.p); gl.uniform2f(p.u.uRes, 1440, 400); setRoomU(p.u); } });
    bakeStep(() => { gl.bindTexture(gl.TEXTURE_2D, trainRT.tex); gl.generateMipmap(gl.TEXTURE_2D); });
    // bokeh over the backdrop
    const N = Math.round(W / unit * 17);
    bokeh = [];
    for (let i = 0; i < N; i++) { const c = room_.bokeh[(R() * room_.bokeh.length) | 0]; const big = R(); bokeh.push({ x: R(W), y: R(.02, .60) * unit, r: lerp(.022, .085, big * big) * unit, c, a: R(.05, .42) * (S.room === 'dawn' ? .3 : 1), ph: R(TAU), sp: R(.18, 1.2) }); }
    const swag = unit * 1.15, cnt = Math.round(W / (unit * .062));
    for (let i = 0; i < cnt; i++) { const x = i / cnt * W + R(-6, 6), u = (x / swag) % 1, y = (.13 + .06 * Math.sin(x / unit * .9 + 1) + .22 * 4 * u * (1 - u)) * unit, c = room_.bokeh[(R() * room_.bokeh.length) | 0]; bokeh.push({ x, y, r: unit * .021, c: [c[0], c[1], c[2]], a: R(.5, .95) * (S.room === 'dawn' ? .12 : 1), ph: R(TAU), sp: R(.3, 1.4) }); }
    if (H > unit * 1.12) for (let i = 0, nf = Math.round(W / unit * 13); i < nf; i++) { const c = room_.bokeh[(R() * room_.bokeh.length) | 0], big = R(); bokeh.push({ x: R(W), y: R(unit * 1.08, H * 1.02), r: lerp(.05, .135, big * big) * unit, c, a: R(.025, .13) * (S.room === 'dawn' ? .4 : 1), ph: R(TAU), sp: R(.1, .5) }); }
    if (!bokehBuf) {
      bokehBuf = gl.createBuffer(); bokehVAO = gl.createVertexArray(); gl.bindVertexArray(bokehVAO); gl.bindBuffer(gl.ARRAY_BUFFER, bokehBuf);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(0, 1); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(1, 1);
      flakeBuf = gl.createBuffer(); flakeVAO = gl.createVertexArray(); gl.bindVertexArray(flakeVAO); gl.bindBuffer(gl.ARRAY_BUFFER, flakeBuf); gl.bufferData(gl.ARRAY_BUFFER, flakeData.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(0, 1); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(1, 1);
      puffBuf = gl.createBuffer(); puffVAO = gl.createVertexArray(); gl.bindVertexArray(puffVAO); gl.bindBuffer(gl.ARRAY_BUFFER, puffBuf);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(0, 1); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(1, 1);
      gl.bindVertexArray(null);
    }
    if (LEADER) trainX = W * .18;
  },
  act(tool, x, y, phase, dx, dy) {
    if (tool === 'all') { globes.forEach((g, i) => setTimeout(() => shakeGlobe(g, rnd(-1, 1) * 1.1, rnd(-1, 1) * .8, 1), i * 110)); return; }
    if (tool === 'whistle') { whistle = 1.6; for (let i = 0; i < 14; i++) spawnPuff(1.6); return; }
    if (tool === 'thump') { if (phase !== 'down') return; thump = 1; globes.forEach(g => { const d = Math.abs(g.cx - x) / unit; setTimeout(() => shakeGlobe(g, rnd(-.4, .4), -.9 * Math.exp(-d * .35), .75 * Math.exp(-d * .35)), d * 140); }); return; }
    const g = globes.find(g => Math.hypot(g.cx - x, g.cy - y) < g.R * 1.5);
    if (!g) return;
    if (phase === 'down') { g.held = true; }
    if (phase === 'up') { g.held = false; }
    if (phase === 'drag') { g.svx += dx * 22; g.svy += dy * 22; const m = Math.hypot(dx, dy) / unit * 60; if (m > .05) { shakeGlobe(g, dx / (Math.abs(dx) + Math.abs(dy) + 1e-3) * m, dy / (Math.abs(dx) + Math.abs(dy) + 1e-3) * m, Math.min(1, m)); } }
  },
  sim(dt, now) {
    time += dt; thump *= Math.exp(-dt * 6);
    if (S.auto > 0) { autoT += dt; if (autoT > S.auto) { autoT = 0; if (LEADER) { const g = globes[(Math.random() * globes.length) | 0]; shakeGlobe(g, rnd(-1, 1), rnd(-.6, .6), rnd(.7, 1.0)); } } }
    for (const g of globes) stepGlobe(g, dt);
    if (S.train) {
      if (LEADER) { trainX += trainSpeed * dt * (whistle > 0 ? 1.5 : 1); const len = trainLen(); if (trainX > W + len * .4) trainX = -len * 1.05; }
      whistle = Math.max(0, whistle - dt);
      for (const f of puffs) { f.t += dt; f.y -= f.vy * dt; f.x += f.vx * dt; f.vy *= Math.exp(-dt * .6); }
      puffs = puffs.filter(f => f.t < f.life);
      if (Math.random() < dt * 5.5) spawnPuff(1);
    }
  },
  netState() { return { tx: trainX, w: whistle, g: globes.map(g => [g.sx, g.sy, g.E, g.shake || 0]) }; },
  netApply(d) { trainX = d.tx; whistle = d.w; d.g.forEach((v, i) => { const g = globes[i]; if (g) { if (v[2] > g.E + .05) { g.E = v[2]; } g.sx = v[0]; g.sy = v[1]; } }); },
  render(now) { renderAll(now); },
  stats() { return `${globes.length} globes · ${globes.reduce((a, g) => a + g.n, 0)} flakes · train ${Math.round(trainX)}`; },
};
const trainLen = () => unit * .40;
function spawnPuff(k) { const L = trainLen(); puffs.push({ x: trainX + L * .84, y: trainY - L * .165, vx: rnd(-.02, .02) * unit, vy: rnd(.06, .10) * unit, t: 0, life: rnd(1.4, 3.2), r: rnd(.008, .014) * unit * k, ph: Math.random() }); }
function shakeGlobe(g, dx, dy, m) {
  g.E = Math.min(1.6, g.E + m * .9); g.svx += dx * unit * .6; g.svy += dy * unit * .6; g.shake = 1;
  const ax = dx * m * 2.4, ay = -dy * m * 2.4;
  for (let i = 0; i < g.n; i++) { const k = g.k[i * 3]; g.v[i * 3] -= ax * rnd(.5, 1.5) * k; g.v[i * 3 + 1] -= ay * rnd(.5, 1.5) * k + rnd(0, .5) * m; g.v[i * 3 + 2] += rnd(-1, 1) * m * 1.5; if (g.st[i] && Math.random() < .45 + m * .5) { g.st[i] = 0; g.v[i * 3 + 1] += rnd(.25, 1.0) * m; } }
}
function stepGlobe(g, dt) {
  // the jar, on a spring
  const k = 130, c = 13; g.svx += (-k * g.sx - c * g.svx) * dt; g.svy += (-k * g.sy - c * g.svy) * dt; g.sx += g.svx * dt; g.sy += g.svy * dt;
  g.sx = clamp(g.sx, -g.R * .22, g.R * .22); g.sy = clamp(g.sy, -g.R * .12, g.R * .12);
  g.E *= Math.exp(-dt / 4.5); g.shake = (g.shake || 0) * Math.exp(-dt * 2.4);
  const E = g.E, p = g.p, v = g.v, n = g.n, st = g.st, K = g.k, tt = time * .7;
  const fall = SNOWS[S.snowType].size < .8 ? .045 : .075;
  const drag = Math.min(1, dt * 2.6);
  for (let i = 0; i < n; i++) {
    if (st[i]) continue;
    const j = i * 3; let x = p[j], y = p[j + 1], z = p[j + 2];
    // slow swirl from shaking, a whisper of circulation when still
    const q = .05 + E * .95, a = q * .48;
    let fx = -z * a + Math.sin(y * 3.1 + tt) * .17 * q + Math.sin(z * 4.2 - tt * 1.2) * .08 * q;
    let fy = (Math.sin(x * 2.7 + tt * .9) * .15 + Math.cos(z * 3.3 + tt * .6) * .13) * q;
    let fz = x * a + Math.sin(y * 2.9 - tt * 1.1) * .16 * q + Math.sin(x * 4.1 + tt) * .08 * q;
    const fl = K[j] * fall * (1 + .3 * Math.sin(time * 1.7 + K[j + 1]));
    fy -= fl * (1 - Math.min(.92, E * 1.1));
    fx += Math.sin(time * 1.1 + K[j + 1]) * .016; fz += Math.cos(time * .9 + K[j + 1] * 2) * .016;
    v[j] += (fx - v[j]) * drag; v[j + 1] += (fy - v[j + 1]) * drag; v[j + 2] += (fz - v[j + 2]) * drag;
    x += v[j] * dt; y += v[j + 1] * dt; z += v[j + 2] * dt;
    const r2 = x * x + y * y + z * z;
    if (r2 > .925) { const f = Math.sqrt(.925 / r2); x *= f; y *= f; z *= f; const nx = x / .96, ny = y / .96, nz = z / .96, vn = v[j] * nx + v[j + 1] * ny + v[j + 2] * nz; if (vn > 0) { v[j] -= vn * nx * 1.3; v[j + 1] -= vn * ny * 1.3; v[j + 2] -= vn * nz * 1.3; } }
    const h = terrainH(x, z);
    if (y < h + .006) { y = h + .006; if (E < .28) st[i] = 1; else { v[j + 1] = Math.abs(v[j + 1]) * .7 + E * .2; } }
    p[j] = x; p[j + 1] = y; p[j + 2] = z;
  }
}
function fillFlakes(g) {
  const glit = SNOWS[S.snowType].glitter, sz = SNOWS[S.snowType].size * g.R / 324 * 3.3, p = g.p, v = g.v, K = g.k; let m = 0; const R = g.R;
  const ox = g.cx + g.sx, oy = g.cy + g.sy;
  for (let i = 0; i < g.n && m < MAXFLK; i++) {
    const j = i * 3, x = p[j], y = p[j + 1], z = p[j + 2];
    const cy_ = y * CA - z * SA, cz = y * SA + z * CA, r = Math.hypot(x, cy_);
    const rp = apparent(r, cz), f = r > 1e-5 ? rp / r : 1, sx = x * f, sy = cy_ * f;
    if (rp > .975) continue;
    const blur = Math.abs(cz) * 1.5;
    const tumble = Math.sin(time * 2.2 * K[j + 2] + K[j + 1]);
    const lite = g.st[i] ? .6 : glit ? (.14 + 2.9 * Math.pow(Math.abs(tumble), 26)) : (.45 + .55 * Math.pow(Math.abs(tumble), 7) + .22 * Math.max(0, cz));
    const lit2 = S.room === 'dawn' ? Math.max(lite, .92) : lite; const size = sz * K[j] * (1 + blur * .55) * (glit ? .8 : 1);
    const px = v[j] * R * .06, py = -(v[j + 1] * CA - v[j + 2] * SA) * R * .06, motion = (g.E > .25 && !g.st[i]) ? 1 : 0;
    const k = m * 8; flakeData[k] = ox + sx * R; flakeData[k + 1] = oy - sy * R; flakeData[k + 2] = size; flakeData[k + 3] = clamp((1 - blur * .48) * .85, .10, .95);
    flakeData[k + 4] = px * motion; flakeData[k + 5] = py * motion; flakeData[k + 6] = cz; flakeData[k + 7] = lit2; m++;
  }
  return m;
}
function drawBackdropTo(v, flipOnly) {
  gl.disable(gl.BLEND);
  let p = P.picture; gl.useProgram(p.p); setView(p.u, v); gl.uniform2f(p.u.uWorld, W, H); bindTex(0, bgRT.tex, p.u.uT); tri();
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  p = P.bokeh; gl.useProgram(p.p); setView(p.u, v); gl.uniform1f(p.u.uHorizon, horizon);
  gl.bindVertexArray(bokehVAO); gl.bindBuffer(gl.ARRAY_BUFFER, bokehBuf);
  const d = new Float32Array(bokeh.length * 8);
  bokeh.forEach((b, i) => { const a = b.a * (.72 + .28 * Math.sin(time * b.sp + b.ph)); d.set([b.x, b.y, b.r, 0, b.c[0], b.c[1], b.c[2], a], i * 8); });
  gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
  gl.uniform1f(p.u.uFlip, 0); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, bokeh.length);
  gl.uniform1f(p.u.uFlip, 1); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, bokeh.length);
  if (S.train) drawTrain(v);
}
function drawTrain(v) {
  const L = trainLen(), h = L * (400 / 1440) * (.62 / .62);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const p = P.sprite; gl.useProgram(p.p); setView(p.u, v);
  // the train runs to the right; the sprite was drawn nose-left, so it is mirrored
  const bob = Math.sin(time * 19) * .4;
  const hh = L * 400 / 1440 * 1.0;
  gl.uniform4f(p.u.uBox, trainX + L, trainY - hh * .985 + bob, -L, hh); bindTex(0, trainRT.tex, p.u.uT); gl.uniform1f(p.u.uLod, 1.6); gl.uniform1f(p.u.uDim, .88);
  gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  if (puffs.length) {
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const q = P.puff; gl.useProgram(q.p); setView(q.u, v); gl.uniform1f(q.u.uFlip, 0);
    const d = new Float32Array(puffs.length * 8);
    puffs.forEach((f, i) => { const t = f.t / f.life; d.set([f.x, f.y, f.r * (1 + t * 3.4), 0, f.ph, f.ph * .7, 0, (1 - t) * .42], i * 8); });
    gl.bindVertexArray(puffVAO); gl.bindBuffer(gl.ARRAY_BUFFER, puffBuf); gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, puffs.length);
  }
  gl.disable(gl.BLEND);
}
function renderAll(t) {
  // what the water looks at: backdrop, lights and train, at half size
  gl.bindFramebuffer(gl.FRAMEBUFFER, behindRT.fb); gl.viewport(0, 0, behindRT.w, behindRT.h); gl.disable(gl.DEPTH_TEST);
  drawBackdropTo({ wx: 0, ww: W, wh: H }, false);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  eachView(v => {
    drawBackdropTo(v, false);
    for (const g of globes) {
      if (g.cx + g.R * 1.3 < v.wx || g.cx - g.R * 1.3 > v.wx + v.ww) continue;
      drawGlobe(v, g, t);
    }
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const p = P.finish; gl.useProgram(p.p); setView(p.u, v); gl.uniform1f(p.u.uTime, t); gl.bindVertexArray(emptyVAO); tri(); gl.disable(gl.BLEND);
  });
}
function drawGlobe(v, g, t) {
  const p = P.globe, ox = g.sx, oy = g.sy, box = [g.box[0] + ox, g.box[1] + oy, g.box[2], g.box[3]];
  gl.useProgram(p.p); setView(p.u, v); gl.uniform4fv(p.u.uBox, box); gl.uniform3f(p.u.uC, g.cx + ox, g.cy + oy, g.R); gl.uniform2f(p.u.uWorld, W, H); gl.uniform3fv(p.u.uTint, tintOf()); gl.uniform1f(p.u.uR, g.R); gl.uniform1f(p.u.uWob, g.shake || 0); gl.uniform1f(p.u.uTime, t); setRoomU(p.u);
  bindTex(0, g.colorT(), p.u.uI); bindTex(1, g.mapT(), p.u.uX); bindTex(2, behindRT.tex, p.u.uBehind);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.uniform1f(p.u.uMode, 0);
  gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  // flakes
  const m = fillFlakes(g);
  const q = P.flake; gl.useProgram(q.p); setView(q.u, v); gl.uniform4fv(q.u.uBox, box); gl.uniform1f(q.u.uR, g.R); bindTex(1, g.mapT(), q.u.uX);
  const r = room(), glit = SNOWS[S.snowType].glitter;
  const fc = glit === 2 ? [1.0, .78, .32] : glit === 1 ? [.86, .9, 1] : [Math.min(1, .55 + r.key[0] * .45), Math.min(1, .55 + r.key[1] * .45), Math.min(1, .55 + r.key[2] * .45)];
  gl.uniform3fv(q.u.uFC, fc);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.bindVertexArray(flakeVAO); gl.bindBuffer(gl.ARRAY_BUFFER, flakeBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, flakeData.subarray(0, m * 8)); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, m);
  // glass
  gl.useProgram(p.p); gl.uniform1f(p.u.uMode, 1); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.disable(gl.BLEND);
}
