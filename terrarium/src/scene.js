// Terrarium. One long glass tank across the monitors, seen from slightly above. The tank is baked (wall, floor,
// soil face, rocks, plants), the animals are real 3D meshes rebuilt each frame: a spine that follows the head,
// four legs with planted feet and IK, and a scale shader. They commute between the lamp, the water and the hide.
// Turtles are their own animal: a rigid shell with a telescoping neck and limbs, and a live pool in place of the dish.

const SPECIES = {
  // prof is [t, half height, half width] down the body as fractions of length, snout (0) to tail tip (1)
  gecko:  { name: 'Leopard gecko', len: .40, prof: [[0,.012,.014],[.025,.022,.030],[.05,.031,.048],[.085,.040,.066],[.11,.039,.062],[.14,.034,.043],[.20,.047,.066],[.32,.055,.086],[.43,.052,.078],[.50,.045,.054],[.57,.050,.056],[.67,.045,.049],[.80,.031,.033],[.93,.014,.015],[1,.003,.003]], leg: .62, head: 1, walk: 1, scale: 4.2, gloss: .42, eye: [.62,.62,.55], tb: 1 },
  beardie:{ name: 'Bearded dragon', len: .50, prof: [[0,.012,.016],[.025,.024,.034],[.055,.033,.054],[.09,.041,.070],[.12,.043,.077],[.15,.038,.058],[.22,.047,.094],[.33,.054,.114],[.43,.047,.094],[.50,.033,.050],[.65,.023,.029],[.85,.012,.013],[1,.002,.002]], leg: .78, head: 1.05, walk: .85, scale: 5, gloss: .32, eye: [.55,.36,.10], tb: 2 },
  anole:  { name: 'Green anole', len: .46, prof: [[0,.006,.007],[.03,.011,.014],[.06,.016,.021],[.09,.021,.028],[.115,.021,.026],[.14,.018,.021],[.20,.025,.030],[.30,.029,.034],[.37,.026,.030],[.42,.017,.019],[.60,.010,.011],[.85,.005,.005],[1,.001,.001]], leg: .74, head: .85, walk: 1.5, scale: 2.2, gloss: .55, eye: [.40,.24,.07], tb: 0 },
  skink:  { name: 'Blue-tongued skink', len: .52, prof: [[0,.012,.014],[.025,.024,.032],[.055,.036,.052],[.09,.045,.066],[.12,.047,.066],[.16,.051,.072],[.27,.062,.086],[.40,.064,.090],[.52,.059,.078],[.62,.050,.062],[.78,.032,.036],[.92,.014,.014],[1,.003,.003]], leg: .34, head: 1.0, walk: .65, scale: 6.5, gloss: .82, eye: [.16,.10,.06], tb: 0, tongue: 1 },
  // turtles: len is the shell, everything else is a fraction of it
  box:    { name: 'Box turtle', turtle: 1, len: .215, wid: .78, dome: .50, rim: .095, neck: .50, head: .26, leg: .085, limb: 1, walk: .22, swim: .2, gloss: .62, scale: 5.5, eye: [.74,.17,.05], pad: .072, claws: 4 },
  slider: { name: 'Red-eared slider', turtle: 1, len: .24, wid: .80, dome: .30, rim: .08, neck: .52, head: .24, leg: .07, limb: .78, walk: .30, swim: .36, gloss: .86, scale: 4.5, eye: [.74,.60,.12], pad: .095, claws: 5, web: 1 },
};
// lizard anatomy for the mesh: belly flatness, how square the cross-section is, where the head ends and how far the jaw
// flares, the eye, where the shoulders and hips sit, limb and toe sizes; all fractions of body length
const ANAT = {
  gecko:   { flat: .58, sq: .80, headEnd: .14, jaw: .13, eyeT: .066, eyeR: .0145, sh: .20, hip: .45, arm: .022, thigh: .028, toe: .046, toeR: .0046, pad: 0 },
  beardie: { flat: .50, sq: .74, headEnd: .15, jaw: .20, eyeT: .068, eyeR: .0110, sh: .21, hip: .45, arm: .019, thigh: .025, toe: .052, toeR: .0050, pad: 0, spikes: 1 },
  anole:   { flat: .80, sq: .92, headEnd: .14, jaw: .08, eyeT: .060, eyeR: .0098, sh: .19, hip: .385, arm: .013, thigh: .017, toe: .062, toeR: .0030, pad: 1, dewlap: 1 },
  skink:   { bh: .8, flat: .60, sq: .80, headEnd: .14, jaw: .10, eyeT: .056, eyeR: .0080, sh: .20, hip: .54, arm: .021, thigh: .025, toe: .026, toeR: .0055, pad: 0 },
};
for (const k in ANAT) SPECIES[k].an = ANAT[k];
const HABITATS = { desert: { name: 'Desert sandstone' }, jungle: { name: 'Tropical forest floor' } };
const LIGHTS = { day: { name: 'Lamps on', k: 1 }, dusk: { name: 'Dusk', k: .55 }, night: { name: 'Night, moon lamp', k: 0 }, cycle: { name: 'Day and night cycle', k: 1 } };

const KZ = .36, CY = Math.sqrt(1 - KZ * KZ); // the camera looks down about 21 degrees
// ---- lamps, shared by everything baked
const LAMP = `uniform vec4 uLamps[10];uniform int uNL;uniform vec3 uAmb;uniform float uU;
vec3 lampAt(vec2 p){vec3 s=vec3(0.);for(int i=0;i<uNL;i++){vec4 L=uLamps[i];float dy=max(.02,(p.y-L.y)/uU);float spread=(.20+.62*dy)*uU;float dx=(p.x-L.x)/spread;float beam=exp(-dx*dx*1.1);s+=vec3(1.9,1.28,.72)*L.z*beam/(1.+dy*dy*1.3);}return s;}
vec3 tone(vec3 c){c=c/(1.+c*.18);return pow(max(c,vec3(0)),vec3(1./2.2));}`;

// the tank itself: lid, cork or stone wall, floor, soil face behind the front glass, cabinet below
const tankFS = HEAD + NOISE + LAMP + `
uniform vec2 uWorld;uniform float uYB,uYF,uHab,uDown;out vec4 o;
const mat2 ROT=mat2(.8,.6,-.6,.8);
float rf(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*vn(p);p=ROT*p*2.07+vec2(13.1,7.7);a*=.5;}return s;}
float ridge(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*(1.-abs(2.*vn(p)-1.));p=ROT*p*2.1+vec2(13.1,7.7);a*=.5;}return s;}
float h(vec2 p){vec2 q=p/uU;
 if(uHab<.5){vec2 w=q+.05*vec2(rf(q*3.+1.),rf(q*3.+6.));float st=w.y*19.+1.8*rf(w*vec2(2.,5.));float ledge=smoothstep(.0,.3,abs(fract(st)-.5))*smoothstep(.45,.62,rf(w*vec2(3.,6.)+11.));float big=rf(w*vec2(1.5,2.5)+3.);float crag=ridge(w*vec2(5.,10.));return big*.95+ledge*.10+crag*.22+.09*rf(w*60.);}
 vec2 w=q+.09*vec2(rf(q*3.),rf(q*3.+5.));return ridge(w*vec2(6.,3.2))*.95+.28*rf(w*30.)+.5*rf(q*1.8);}
vec3 wall(vec2 p){float e=1.8;float h0=h(p),hx=h(p+vec2(e,0)),hy=h(p+vec2(0,e));float hk=uHab<.5?.040:.034;vec3 n=normalize(vec3((h0-hx)*uU*hk/e*2.,(h0-hy)*uU*hk/e*2.,1.));
 vec3 alb=uHab<.5?mix(vec3(.17,.082,.038),vec3(.46,.25,.11),rf(p/uU*vec2(4.,22.))*1.15)*(.65+.55*h0):mix(vec3(.014,.010,.007),vec3(.075,.045,.022),smoothstep(.2,.85,h0));
 // light rakes down the wall from the lid: walk toward it through the height field to find what shadows us
 vec2 ld=normalize(vec2(.18,-1.));float sh=1.;for(int i=1;i<=9;i++){float t=float(i)*.022*uU;float dh=h(p+ld*t)-h0-t/uU*1.75;sh=min(sh,1.-smoothstep(.0,.13,dh));}
 vec3 lit=lampAt(p);float lam=max(0.,dot(n,normalize(vec3(.12,-.74,.6))));
 vec3 c=alb*(uAmb*.62*(.4+.8*h0)+lit*(.08+1.25*lam)*(.14+.86*sh));
 float dpt=smoothstep(uYB-.34*uU,uYB,p.y);c*=mix(1.,.46,dpt*dpt);return c;}
vec3 grain(vec2 p,float s,vec3 a,vec3 b){vec2 v=voro(p/s);float e=smoothstep(.0,.18,v.y-v.x);float id=h12(floor(p/s+.5));return mix(a,b,fract(id*7.))*(.52+.5*e+.25*(.5-v.x));}
vec3 floorC(vec2 p){float z=(p.y-uYB)/(uYF-uYB);
 float s=mix(2.3,3.2,z)*uU/1080.;vec2 st=p*vec2(1.,1./mix(.42,.8,z));
 vec3 c;float lumps=fbm(p/uU*vec2(5.,16.));
 if(uHab<.5){vec3 A=vec3(.40,.25,.12),B=vec3(.66,.47,.26);c=grain(st,s,A,B);c=mix(c,grain(st+7.,s*1.8,A*.7,B*.82),smoothstep(.45,.7,fbm(p/uU*7.)));c*=.68+.68*lumps;
  float pebble=smoothstep(.5,.72,vn(st/(s*8.)+3.))*step(.975,h12(floor(st/(s*7.))));c=mix(c,c*.5,pebble);}
 else{vec3 A=vec3(.030,.020,.012),B=vec3(.12,.075,.040);c=grain(st,s*1.1,A,B)*(.55+.9*lumps);
  float bark=smoothstep(.56,.78,fbm(st/(s*22.)+9.));c=mix(c,grain(st*vec2(.5,1.),s*2.,vec3(.05,.03,.015),vec3(.20,.12,.06)),bark);}
 vec3 lit=lampAt(vec2(p.x,mix(uYB,uYF,.4)));float ky=.32+.86*(1.-abs(z-.45));
 c*=uAmb*.9+lit*ky;
 float gl=pow(fbm(p/uU*vec2(9.,28.)+3.),3.);if(uHab>.5)c+=lit*gl*.11;
 c*=mix(.34,1.,smoothstep(.0,.2,z));c*=.86+.32*rf(p/uU*vec2(3.,8.)+9.);
 return c;}
vec3 soilFace(vec2 p){float t=(p.y-uYF)/(uU*.985-uYF);float s=2.2*uU/1080.;
 vec3 c;float depth=fbm(p/uU*vec2(6.,14.));
 if(uHab<.5){vec3 A=vec3(.16,.09,.045),B=vec3(.42,.27,.14);float layers=rf(vec2(p.x/uU*1.4,p.y/uU*52.));float sp=h12(floor(p));c=mix(A,B,layers*layers*2.)*(.75+.5*sp*sp);c=mix(c,c*vec3(.55,.5,.5),smoothstep(.5,.7,rf(vec2(p.x/uU*2.2,p.y/uU*34.)+7.)));}
 else{c=grain(p,s*1.1,vec3(.016,.011,.008),vec3(.075,.05,.030))*(.5+.9*depth);
  float clay=smoothstep(.70,.82,t);if(clay>0.){vec2 v=voro(p/(uU*.021));float b=smoothstep(.62,.20,v.x);vec3 pel=mix(vec3(.05,.03,.02),vec3(.36,.19,.10),b)*(.6+.8*b);c=mix(c,pel,clay);}
  float root=smoothstep(.04,.0,abs(fbm(p/uU*vec2(10.,3.)+1.)-.5))*smoothstep(.72,.3,t);c=mix(c,vec3(.3,.26,.2)*.6,root*.75);}
 vec3 lit=lampAt(vec2(p.x,uYF));c*=(uAmb*.82+lit*.30)*exp(-t*1.1);
 c*=mix(.46,1.,smoothstep(.0,.05,t));
 return c;}
vec3 cabinet(vec2 p){float t=(p.y-uU)/uU;vec2 q=p/uU;float g=fbm(q*vec2(2.,60.)+1.);float rings=sin(q.y*30.+fbm(q*vec2(1.4,6.))*14.)*.5+.5;vec3 c=mix(vec3(.018,.010,.006),vec3(.060,.033,.018),rings*.5+g*.5);float pnl=abs(mod(p.x+uU*.3,uU*.6)-uU*.3)/uU;c*=mix(.46,1.,smoothstep(.002,.006,pnl));c*=exp(-t*3.2);c+=vec3(.5,.34,.2)*.20*exp(-t*16.);return c;}
void main(){vec2 p=gl_FragCoord.xy;vec3 c;
 float lid=.058*uU;
 if(p.y<lid){float k=p.y/lid;float bars=smoothstep(.34,.4,abs(fract(p.x/(uU*.013))-.5));vec3 g=mix(vec3(.018),vec3(.05),fbm(p/uU*vec2(40.)));c=g*(bars*.6+.45);c+=lampAt(vec2(p.x,lid*1.1))*.12*(1.-bars)*k;for(int i=0;i<uNL;i++){vec2 q=(p-vec2(uLamps[i].x,lid*.72))/vec2(.052*uU,.021*uU);float b=exp(-dot(q,q)*1.2);c+=vec3(3.,1.8,.8)*b*uLamps[i].z;float hood=smoothstep(1.7,1.,length(q*vec2(.82,1.)));c*=mix(1.,.5,hood*(1.-b));}}
 else if(p.y<uYB)c=wall(p);
 else if(p.y<uYF)c=floorC(p);
 else if(p.y<uU*.985)c=soilFace(p);
 else if(p.y<uU)c=vec3(.012,.012,.014)+vec3(.05)*exp(-(p.y-uU*.985)/(.003*uU));
 else c=cabinet(p);
 float lidsh=exp(-(p.y-lid)/(.025*uU));if(p.y>lid&&p.y<uYB){c*=1.-.72*lidsh;for(int i=0;i<uNL;i++){vec2 q=(p-vec2(uLamps[i].x,lid*.75))/vec2(.34*uU,.33*uU);float g=exp(-dot(q,q));c+=vec3(.55,.32,.14)*g*.10*uLamps[i].z;}}
 c=tone(c*uDown)+vec3((h12(p+1.3)-.5)/255.);
 o=vec4(c,1);}`;

// real 3D rock and driftwood, ray traced once per object
const BN = `precision highp sampler3D;uniform sampler3D uN3;float n3(vec3 p){return textureLod(uN3,p/32.,0.).r;}float fbm3(vec3 p){return .5*n3(p)+.25*n3(p*2.03+vec3(17.1,9.2,4.7))+.125*n3(p*4.12+vec3(3.3,1.9,8.1))+.0625*n3(p*8.3+vec3(5.,11.,2.));}`;
let n3Tex = null;
function ensureN3() { if (n3Tex) return; const n = 32, d = new Uint8Array(n * n * n), r = mulberry(77); for (let i = 0; i < d.length; i++) d[i] = r() * 255; n3Tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_3D, n3Tex); gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, n, n, n, 0, gl.RED, gl.UNSIGNED_BYTE, d); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.REPEAT); gl.activeTexture(gl.TEXTURE0); }
const rockFS = HEAD + BN + LAMP + `
uniform vec2 uJit,uOrg,uRad;uniform float uR,uFloorY,uS,uKind,uHab,uCut,uH;out vec4 o;
const float KZ=${KZ.toFixed(4)},CY=${CY.toFixed(4)};
float dHole(vec3 p){vec3 q=(p-vec3(.0,.06,uRad.y*.72))/vec3(.60,.60,uRad.y*.9);return (length(q)-1.)*.5;}
float map(vec3 p){
 float d;
 if(uKind<.5||uKind>1.5){
  vec3 q=p/vec3(1.,uH,uRad.y);float l=length(q);d=(l-1.)*min(uH,uRad.y);
  float big=fbm3(p*vec3(3.1,4.3,3.1)+uS*40.);float strata=uHab<.5?abs(fract(p.y*5.5+big*2.2)-.5)*.13:0.;
  d+=(big-.5)*.42-strata+(fbm3(p*13.+uS*9.)-.5)*.055;
  if(uKind>1.5)d=max(d,-dHole(p));
 } else {
  float bend=.12*sin(p.x*2.2+uS*30.)+.07*sin(p.x*5.3+uS*60.);vec3 q=p-vec3(0.,uH+bend,0.);float rr=uH*(.82+.22*sin(p.x*3.+uS*9.))*(1.-.14*p.x*p.x);float r=length(q.yz)-rr;d=max(r,abs(p.x)-.96);float g=fbm3(vec3(p.x*2.,q.y*16.,q.z*16.)+uS*20.);d+=(g-.5)*.05;
 }
 return max(d,-p.y);}
vec3 nor(vec3 p){vec2 e=vec2(.0035,-.0035);return normalize(e.xyy*map(p+e.xyy)+e.yyx*map(p+e.yyx)+e.yxy*map(p+e.yxy)+e.xxx*map(p+e.xxx));}
float shadow(vec3 p,vec3 l){float res=1.,t=.02;for(int i=0;i<22;i++){float d=map(p+l*t);res=min(res,9.*d/t);t+=clamp(d,.012,.16);if(res<.01||t>2.6)break;}return clamp(res,0.,1.);}
float ao(vec3 p,vec3 n){float s=0.,w=1.;for(int i=1;i<=5;i++){float h=.02+.075*float(i);s+=(h-map(p+n*h))*w;w*=.65;}return clamp(1.-s*1.5,0.,1.);}
void main(){
 vec2 sc=gl_FragCoord.xy+uJit+uOrg;
 float pz=(sc.y-uFloorY)/KZ/uR,px=(sc.x-uOrg.x)/uR-1.34;vec3 rd=vec3(0.,-KZ,-CY);vec3 ro=vec3(px,0.,pz)-rd*4.;
 float t=.2,hit=-1.;for(int i=0;i<70;i++){vec3 p=ro+rd*t;float d=map(p);if(d<.0016){hit=t;break;}t+=d*.82;if(t>9.)break;}
 if(hit<0.){o=vec4(0.);return;}
 vec3 p=ro+rd*hit;
 if(uCut>.5&&uKind>1.5&&dHole(p)<.014){o=vec4(0.);return;}
 vec3 n=nor(p);n=normalize(n+(vec3(n3(p*48.+3.),n3(p*48.+13.),n3(p*48.+23.))-.5)*.34+(vec3(n3(p*140.+1.),n3(p*140.+11.),n3(p*140.+21.))-.5)*.18);vec3 L=normalize(vec3(.1,.94,.32));float s=shadow(p+n*.012,L),a=ao(p,n);
 vec3 lit=lampAt(vec2(sc.x,sc.y));
 float big=fbm3(p*vec3(4.,8.,4.)+uS*20.),fine=fbm3(p*38.+uS*5.);vec3 alb;
 if(uKind>.5&&uKind<1.5){float g=fbm3(vec3(p.x*3.,p.y*42.,p.z*42.)+uS*30.);float fur=fbm3(vec3(p.x*9.,p.y*120.,p.z*120.));alb=mix(vec3(.04,.025,.015),vec3(.30,.20,.12),g*g*2.6)*(.55+.9*fur);n=normalize(n+vec3(0.,(g-.5)*1.1,(fur-.5)*.6));}
 else if(uHab<.5){float st=abs(fract(p.y*5.5+big*2.2)-.5);alb=mix(vec3(.19,.095,.045),vec3(.58,.36,.18),big*1.1)*(.52+.7*smoothstep(.0,.14,st));alb*=.62+.76*fine;}
 else{alb=mix(vec3(.075,.07,.065),vec3(.26,.24,.21),big*1.1)*(.7+.6*fine);float mo=smoothstep(.42,.68,n.y*.5+big*.68);alb=mix(alb,mix(vec3(.012,.028,.006),vec3(.08,.13,.022),fine*1.6),mo);}
 float dif=max(0.,dot(n,L));
 vec3 c=alb*(uAmb*(.46+.6*n.y)*a*1.1+lit*(.14*a+1.3*dif*(.12+.88*s)));
 if(uKind>1.5&&dHole(p)<.03)c*=.05;
 c*=mix(.42,1.,smoothstep(.0,.3,p.y));
 o=vec4(tone(c),1.);}`;

// moss and the water dish: painted as lit height fields
const objVS = HEAD + `layout(location=0)in vec4 iA;layout(location=1)in vec4 iB;uniform vec2 uWorld;out vec2 vP;out vec2 vW;flat out vec4 vB;const vec2 Q[4]=vec2[4](vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(1,1));
void main(){vec2 c=Q[gl_VertexID];vP=c;vB=iB;vec2 w=iA.xy+c*iA.zw;vW=w;gl_Position=vec4(w.x/uWorld.x*2.-1.,w.y/uWorld.y*2.-1.,0,1);}`;
const objFS = HEAD + NOISE + LAMP + `in vec2 vP;in vec2 vW;flat in vec4 vB;uniform float uHab,uCut,uDown;out vec4 o;
vec4 vI(vec2 p){vec2 ip=floor(p),fp=fract(p);float f1=9.,f2=9.;vec2 id=vec2(0.),rel=vec2(0.);for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(i,j),r=g+h22(ip+g)-fp;float d=dot(r,r);if(d<f1){f2=f1;f1=d;id=ip+g;rel=r;}else if(d<f2)f2=d;}return vec4(sqrt(f2)-sqrt(f1),h12(id),-rel);}
float hgt(vec2 p,float s,float kind){if(kind>4.5)return 1.;float r=length(p*vec2(1.,1.3));float base=max(0.,1.-r*r);float n=fbm(p*2.6+s*40.)*.6+fbm(p*8.+s*70.)*.22;
 if(kind>.5&&kind<1.5){float rp=length(p*vec2(1.,1.15))+(fbm(p*3.+s*33.)-.5)*.95+(fbm(p*11.+s*7.)-.5)*.3;return max(0.,1.-rp*rp)*(.4+.9*n);}if(kind<.5){base=sqrt(base);base=min(base,.82+.1*n);return base*(.55+.72*n);}
 if(kind>1.5&&kind<2.5){base=pow(base,.45);return base*(.72+.5*n);}
 return base*(.5+.8*n);}
void main(){vec2 p=vP;float s=vB.x,kind=vB.y;float h0=hgt(p,s,kind);float a=smoothstep(.0,.05,h0);if(a<.004)discard;
 float e=.016;float hx=hgt(p+vec2(e,0),s,kind),hy=hgt(p+vec2(0,e),s,kind);vec3 n=normalize(vec3((h0-hx)/e*.23,(h0-hy)/e*.23,1.));
 vec3 lit=lampAt(vW+vec2(0,uU*.05));float top=clamp(.55-n.y*1.2+.2,0.,1.);float ao=mix(.42,1.,smoothstep(-.9,.45,-p.y));vec3 c;
 if(kind<.5||kind>1.5&&kind<2.5){
  vec3 A=uHab<.5?vec3(.33,.19,.10):vec3(.13,.13,.12),B=uHab<.5?vec3(.72,.50,.27):vec3(.34,.33,.31);
  float m=fbm(p*5.+s*11.);float cr=smoothstep(.0,.05,abs(fbm(p*vec2(4.,9.)+s*31.)-.5)-.015);vec3 alb=mix(A,B,m)*mix(.46,1.,cr);
  if(uHab<.5){float st=abs(fract(p.y*5.+fbm(p*3.+s)*1.3)-.5);alb*=.78+.5*smoothstep(.0,.28,st);}
  float sp=fbm(p*38.+s*3.);alb*=.74+.52*sp;c=alb*(uAmb+lit*(.3+1.15*top));
  if(uHab>.5){float mo=smoothstep(.5,.72,top*.75+fbm(p*6.+s*17.)*.62);c=mix(c,mix(vec3(.05,.10,.02),vec3(.16,.26,.05),fbm(p*30.))*(uAmb*1.2+lit*1.05*top),mo);}
  c*=ao;
  if(kind>1.5){vec2 hp=(p-vec2(.02,.34))/vec2(.55,.48);float hole=length(hp);float m2=smoothstep(1.,.86,hole);c=mix(c,vec3(.006,.005,.004),m2);c*=1.-.45*smoothstep(1.4,1.,hole);if(uCut>.5){a*=1.-m2;}}
 } else if(kind<1.5){ // moss cushion
  float fine=fbm(p*60.+s*9.);vec3 alb=mix(vec3(.018,.04,.008),vec3(.11,.17,.03),fine*1.3);c=alb*(uAmb*1.2+lit*(.34+.85*top))*(.5+.8*h0);
 } else if(kind<3.5){ // driftwood
  float g=fbm(vec2(p.x*3.+s*5.,p.y*22.));float deep=smoothstep(.34,.3,fbm(vec2(p.x*5.,p.y*40.)+s));vec3 alb=mix(vec3(.13,.085,.05),vec3(.44,.30,.19),g);alb*=mix(1.,.35,deep);float roundY=-p.y;c=alb*(uAmb+lit*(.3+.9*smoothstep(-.9,.9,roundY)));c*=mix(.5,1.,smoothstep(-1.,.3,roundY));
 } else if(kind>4.5){ // the turtle pool: bed, bank and wet stones, baked; the water itself is live
  float M=1.42;vec2 q=p*M;float a0=atan(q.y,q.x);float r=length(q)*(1.+.08*sin(2.*a0+s*6.2832)+.05*sin(3.*a0+s*9.)+.03*sin(5.*a0+s*17.));
  float rj=r+.05*(fbm(p*vec2(9.,5.)+s*21.)-.5);vec3 lit0=lampAt(vec2(vW.x,uU*.8));float grain0=fbm(p*vec2(120.,40.)+s*5.);
  // fine pebble bed, greening and darkening toward the deep middle
  float deep=smoothstep(1.,.34,r);vec4 pv=vI(p*vec2(58.,17.)+s*11.);float peb=smoothstep(.0,.16,pv.x);vec3 bedA=uHab<.5?vec3(.28,.21,.13):vec3(.09,.08,.065),bedB=uHab<.5?vec3(.56,.46,.32):vec3(.24,.20,.15);
  vec3 bed=mix(bedA,bedB,pv.y*.75+grain0*.3)*(.74+.34*peb);float alg=smoothstep(.45,.72,fbm(p*vec2(11.,4.)+s*3.)+deep*.15);bed=mix(bed,bed*vec3(.46,.70,.46),alg*.8);
  vec3 cw=bed*(uAmb*.85+lit0*.56)*exp(-deep*vec3(2.0,1.0,.82));
  cw*=mix(1.,.72,smoothstep(.72,1.,r)); // a little darker where the bank's shadow falls in
  // the bank: dark wet sand or mud with rounded stones bedded in it
  float wet=smoothstep(1.34,1.02,rj);
  vec3 soil=uHab<.5?mix(vec3(.26,.16,.08),vec3(.54,.38,.21),grain0):mix(vec3(.022,.016,.010),vec3(.09,.06,.035),grain0);soil=mix(soil,soil*vec3(.42,.38,.34),wet);
  vec3 bk=soil*(uAmb*.85+lit0*(.42+.5*smoothstep(-.9,.5,-p.y)));
  vec2 st=p*vec2(19.,5.)+s*30.;vec4 ve=vI(st);float ring=smoothstep(.985,1.04,r)*smoothstep(1.32,1.15,rj+.16*(ve.y-.5));float d1=length(ve.zw);float stone=smoothstep(.48,.34,d1*(.8+.5*ve.y))*step(.42,ve.y)*ring;
  float nz=sqrt(max(0.,1.-d1*d1*5.));float top=clamp(.5-ve.w*2.+nz*.28,0.,1.);
  vec3 sA=uHab<.5?vec3(.24,.18,.13):vec3(.10,.10,.09),sB=uHab<.5?vec3(.58,.47,.34):vec3(.28,.28,.25);vec3 sc=mix(sA,sB,fbm(st*6.)*.8+ve.y*.3)*(uAmb*.9+lit0*(.2+1.0*top))*mix(1.,.62,wet*.5);
  bk*=1.-.5*smoothstep(.62,.42,d1)*step(.42,ve.y)*ring*(1.-stone); // contact shadow round each stone
  bk=mix(bk,sc,stone);
  c=mix(cw,bk,smoothstep(.99,1.015,r));
  a=smoothstep(1.4,1.25,r);
 } else { // the water dish, a shallow stone bowl
  float r=length(p);vec3 stone=mix(vec3(.10,.085,.07),vec3(.34,.30,.26),fbm(p*22.+s));c=stone*(uAmb+lit*.75)*mix(.55,1.,clamp(.5-p.y*.9,0.,1.));float w=smoothstep(.76,.70,r);float depth=smoothstep(.76,.2,r);vec3 bed=mix(vec3(.05,.04,.03),vec3(.12,.10,.08),fbm(p*9.+s))*(uAmb+lit*.5);vec3 sky=mix(vec3(.02,.03,.04),lit*.20+uAmb*.2,clamp(.55-p.y*.8,0.,1.));float F=.15+.45*pow(clamp(r/.76,0.,1.),3.);vec3 water=mix(bed*(1.-.4*depth),sky,F);float rimL=smoothstep(.70,.74,r)*smoothstep(.78,.74,r);c=mix(c,water,w);c+=lit*rimL*.12;c*=mix(.4,1.,smoothstep(.0,.24,1.-r));a=smoothstep(1.,.96,r);
 }
 c*=vB.z;
 o=vec4(tone(c*uDown)*a,a);}`;

// leaves: pothos hearts, fern pinnae, straps, stems
const leafVS = HEAD + `layout(location=0)in vec4 iA;layout(location=1)in vec4 iB;layout(location=2)in vec4 iC;uniform vec2 uWorld;out vec2 vP;out vec2 vW;flat out vec4 vB;flat out vec4 vC;const vec2 Q[4]=vec2[4](vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(1,1));
void main(){vec2 c=Q[gl_VertexID];vP=c;vB=iB;vC=iC;vec2 r=vec2(c.x*iA.z,c.y*iA.w);vec2 d=iC.xy;vec2 w=iA.xy+vec2(r.x*d.y+r.y*d.x,-r.x*d.x+r.y*d.y);w+=vec2(iB.w,iB.w)*vec2(.55,1.);vW=w;gl_Position=vec4(w.x/uWorld.x*2.-1.,w.y/uWorld.y*2.-1.,0,1);}`;
const leafFS = HEAD + NOISE + LAMP + `in vec2 vP;in vec2 vW;flat in vec4 vB;flat in vec4 vC;uniform float uBlur,uDown;out vec4 o;
void main(){float ty=vB.x,tint=vB.y,seed=vB.z;float x=vP.x,v=(vP.y+1.)*.5;float w;
 if(ty<.5)w=(1.08*sqrt(max(0.,sin(3.1416*pow(v,.62))))-(.28*smoothstep(.22,.0,v)))*(1.-.14*v);
 else if(ty<1.5)w=.94*pow(max(0.,sin(3.1416*v)),.6);
 else if(ty<2.5)w=.92*smoothstep(0.,.06,v)*pow(max(0.,1.-v),.32);
 else w=.5;
 float d=abs(x)/max(.0001,w);float edge=mix(.018,.32,uBlur);float a=smoothstep(1.,1.-edge,d)*step(0.,v)*step(v,1.);if(a<.003)discard;
 if(vC.z>.5){o=vec4(0,0,0,a*.30*vC.w);return;}
 float folded=x*x*.5;vec3 n=normalize(vec3(x*.86+(.5-v)*.18,(v-.5)*.3,1.));
 float h=(fract(seed*73.)-.5);
 float mid=smoothstep(.05,.01,abs(x)),vein=smoothstep(.90,.99,sin((v*17.-abs(x)*5.)+seed*9.)*.5+.5)*smoothstep(.0,.12,abs(x));
 float mott=fbm(vP*vec2(5.,12.)+seed*30.);
 vec3 dark=vec3(.012,.048,.012),light=vec3(.10,.27,.05);
 if(tint>1.5&&tint<2.5){dark=vec3(.022,.08,.022);light=vec3(.20,.44,.09);}
 else if(tint>2.5&&tint<3.5){dark=vec3(.10,.08,.04);light=vec3(.42,.30,.12);}
 else if(tint>3.5){dark=vec3(.05,.10,.05);light=vec3(.24,.38,.20);}
 vec3 alb=mix(dark,light,mott*.8+.15+h*.3);
 if(ty<.5){float vr=smoothstep(.62,.84,fbm(vP*vec2(4.,9.)+seed*11.));alb=mix(alb,vec3(.40,.42,.14),vr*.5);alb=mix(alb,alb*.7,smoothstep(.0,.1,d)*smoothstep(1.,.86,d)*.0);}
 alb=mix(alb,alb*1.5+vec3(.015,.03,.0),mid*.5);alb*=mix(1.,1.32,vein*.5);alb*=.92+.26*smoothstep(.8,.2,d);
 vec3 lit=lampAt(vW);float ld=max(0.,dot(n,normalize(vec3(.1,-.75,.55))));
 float keel=x>0.?1.:.62;float baseD=mix(.26,1.,smoothstep(.0,.55,v));
 alb*=.76+.3*sin(v*6.+seed*8.)*.2;if(tint>3.5||tint>2.5&&tint<3.5){alb=mix(alb,alb*vec3(1.45,1.1,.55)+vec3(.02,.01,0.),smoothstep(.72,1.,v));}
 vec3 c=alb*(uAmb*.7+lit*(.12+.85*ld)*keel)*baseD;
 c+=alb*vec3(1.1,1.5,.6)*lit*.22*(1.-ld)*baseD;
 float sp=pow(max(0.,dot(n,normalize(vec3(.12,-.6,.8)))),40.);c+=lit*sp*(ty<1.5?.16:.10);
 c*=vC.w;
 o=vec4(tone(c*uDown)*a,a);}`;

// the live animals
const meshVS = HEAD + `layout(location=0)in vec3 aP;layout(location=1)in vec3 aN;layout(location=2)in vec2 aU;layout(location=3)in vec2 aM;uniform vec4 uView;uniform float uYB,uD,uTime;out vec3 vP;out vec3 vN;out vec2 vU;out vec2 vM;
void main(){vP=aP;vN=aN;vU=aU;vM=aM;float wy=min(aP.y,0.);float cam=aP.z*${CY.toFixed(4)}+aP.y*${KZ.toFixed(4)};vec2 s=vec2(aP.x+sin(aP.z*.031+uTime*2.1)*wy*.05,uYB+aP.z*${KZ.toFixed(4)}-(aP.y-wy*.28)*${CY.toFixed(4)});gl_Position=vec4((s.x-uView.x)/uView.y*2.-1.,1.-s.y/uView.z*2.,-cam/(uD*2.)*.9,1.);}`;
const meshFS = HEAD + NOISE + `in vec3 vP;in vec3 vN;in vec2 vU;in vec2 vM;uniform vec3 uBaseC,uAltC,uBelly,uKey,uAmb,uEye,uSkin,uSkin2,uGnd;uniform vec4 uAn;uniform float uScale,uGloss,uPat,uLen,uTime;out vec4 o;
vec3 voroId(vec2 p){vec2 ip=floor(p),fp=fract(p);float f1=9.,f2=9.;vec2 id=vec2(0.);for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(i,j),r=g+h22(ip+g)-fp;float d=dot(r,r);if(d<f1){f2=f1;f1=d;id=ip+g;}else if(d<f2)f2=d;}return vec3(sqrt(f2)-sqrt(f1),h12(id),sqrt(f1));}
// a scale cell: distance to its centre, to its border, a hash; rel is the point from the centre, cen the centre
vec3 cellS(vec2 p,float jit,out vec2 rel,out vec2 cen){vec2 ip=floor(p);float f1=9.,f2=9.;vec2 br=vec2(0),bc=vec2(0),bi=vec2(0);for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 c=ip+vec2(i,j),o=c+.5+vec2(.5*mod(c.y,2.)-.25,0.)+(h22(c)-.5)*jit,r=o-p;float d=dot(r,r);if(d<f1){f2=f1;f1=d;br=r;bc=o;bi=c;}else if(d<f2)f2=d;}rel=-br;cen=bc;return vec3(sqrt(f1),sqrt(f2)-sqrt(f1),h12(bi+.5));}
// bump from a height in world px, by surface gradient
vec3 bumpN(vec3 N,float h){vec3 px=dFdx(vP),py=dFdy(vP);float hx=dFdx(h),hy=dFdy(h);vec3 r1=cross(py,N),r2=cross(N,px);float det=dot(px,r1);vec3 g=sign(det)*(hx*r1+hy*r2);return normalize(abs(det)*N-g);}
vec3 bumped(vec3 N,float h,float k){vec3 dp=vec3(dFdx(h),dFdy(h),0.);vec3 g=dFdx(vP)*dp.y-dFdy(vP)*dp.x;vec3 c1=cross(dFdx(vP),dFdy(vP));float side=sign(dot(normalize(c1),N));return normalize(N+cross(g,N)*(-side)/max(.5,length(c1))*k);}
// carapace plates: five vertebrals and four costals a side as a mirrored Voronoi, a ring of marginals round the edge. d is the distance to the plate's own border
void scute(vec2 q,out float d,out float id,out vec2 cen){vec2 p=vec2(q.x,abs(q.y));p+=.014*vec2(sin(p.y*17.+q.x*6.),sin(p.x*19.+1.));float rho=length(p);const float M=.86;
 if(rho>M){float a=atan(p.y,p.x);const float n=11.;float f=a/3.14159*n,i=floor(f);float s=min(f-i,1.-(f-i))*3.14159/n*rho;d=min(s,min(rho-M,1.04-rho));id=10.+i;float a2=(i+.5)/n*3.14159;cen=vec2(cos(a2),sin(a2))*.93;return;}
 const vec2 S[9]=vec2[9](vec2(.68,.0),vec2(.35,.0),vec2(.02,.0),vec2(-.31,.0),vec2(-.64,.0),vec2(.53,.42),vec2(.19,.54),vec2(-.15,.54),vec2(-.50,.42));
 int n=0;float b=1e9;for(int i=0;i<9;i++){vec2 r=p-S[i];float dd=dot(r,r);if(dd<b){b=dd;n=i;}}
 d=1e9;for(int i=0;i<9;i++){if(i==n)continue;vec2 m=.5*(S[i]+S[n]),e=normalize(S[n]-S[i]);d=min(d,dot(p-m,e));}
 d=min(d,M-rho);id=float(n);cen=S[n];}
void main(){int m=int(vM.x+.02);float aoV=clamp(1.-(vM.x-float(m))/.9,0.,1.);float light=vM.y;vec3 N=normalize(vN),V=normalize(vec3(0.,.36,.933));vec3 L=normalize(vec3(.06,.86,.44));vec3 c;
 if(m==0){ // lizard skin: each scale modelled and coloured on its own, lit by the lamp with a soft wrap, the sky and the sand's bounce
  float s=vU.x,t=s/uLen,rr=uLen*.06,a=vU.y/rr,aa=abs(a),sc=uScale;
  vec2 q=vec2(s,vU.y)/sc,rel,cen,r2,c2;float jit=uPat<.5?.8:uPat<1.5?.7:uPat<2.5?.8:.3;vec3 C=cellS(q,jit,rel,cen);float id=C.z;
  float fw=fwidth(q.x)+fwidth(q.y),fine=smoothstep(1.2,.4,fw),edge=smoothstep(0.,.09+fw*.4,C.y),dome=sqrt(max(0.,1.-C.x*C.x*2.6));float h;
  if(uPat<.5){vec3 T=cellS(q*.36+7.3,.9,r2,c2);float tub=step(.5,T.z)*step(aa,1.75)*smoothstep(.12,.2,t)*smoothstep(.95,.7,t)*sqrt(max(0.,1.-T.x*T.x*4.5));h=dome*.5*edge+tub*1.7;}
  else if(uPat<1.5){float keel=1.-smoothstep(0.,.2,abs(rel.y));vec3 T=cellS(q*.4+3.1,.9,r2,c2);h=(dome*.55+keel*dome*.55)*edge+step(.6,T.z)*step(aa,2.)*sqrt(max(0.,1.-T.x*T.x*7.))*1.5;}
  else if(uPat<2.5){h=dome*.55*edge;}
  else{h=(.3+.7*clamp(.5+rel.x*1.15,0.,1.))*edge;} // skink: smooth plates whose back edges overlap the next row
  h*=fine;vec3 Nf=bumpN(N,h*sc*.2);
  // colour is decided at the scale's own centre, so pattern edges follow the scales like the real thing
  vec2 cp=cen*sc;float ct=cp.x/uLen,ca=abs(cp.y/rr);float belly=smoothstep(1.8,2.5,ca),hk=smoothstep(uAn.x,uAn.x*.7,ct);
  float n1=fbm(cp/(uLen*.03)),n2=fbm(cp/(uLen*.011)+5.3);vec3 alb;
  if(uPat<.5){ // leopard gecko: warm yellow, paler flanks, black spots, a paler tail
   vec3 base=mix(uBaseC,uBaseC*vec3(1.1,1.05,.88)+.03,smoothstep(1.1,1.8,ca));base=mix(base,vec3(.60,.53,.40),smoothstep(.5,.57,ct)*.35);base*=.92+.16*n2;
   vec2 rD,cD;vec3 Dt=cellS(cp/(uLen*.03),.9,rD,cD);float rad=.24+.2*h12(cD*1.7)+.12*(fbm(cp/(uLen*.01))-.5);
   vec2 rE,cE;vec3 Et=cellS(cp/(uLen*.013)+5.,.9,rE,cE);
   float sp=step(.3,h12(cD*3.1+.7))*smoothstep(rad+.04,rad-.03,Dt.x)+hk*step(.4,h12(cE*2.3))*smoothstep(.34,.27,Et.x);
   alb=mix(base,uAltC,clamp(sp,0.,1.)*step(ca,2.1));
  } else if(uPat<1.5){ // bearded dragon: sandy, pale paired ovals down the back, darker flank blotches, a dark beard
   vec3 base=uBaseC*(.82+.34*n1);float ov=smoothstep(.6,.72,fbm(vec2(ct*30.,ca*2.4)+3.))*step(.15,ct)*step(ct,.55)*smoothstep(1.25,.55,ca);
   base=mix(base,base*.42,smoothstep(.48,.6,fbm(vec2(ct*22.,ca*1.7)+11.))*step(ca,2.)*.9);base=mix(base,base*.6,smoothstep(1.3,1.6,ca)*smoothstep(2.,1.7,ca)*step(.15,ct)*.7);base=mix(base,vec3(.70,.52,.30),ov*.7);base=mix(base,uAltC,smoothstep(.54,.62,n1)*smoothstep(1.,1.5,ca)*step(ca,2.1)*.75);
   alb=mix(base,vec3(.09,.08,.07),hk*smoothstep(1.9,2.4,ca)*.85);
  } else if(uPat<2.5){ // green anole: emerald with fine pale flecks, a pale lip line, browner toward the tail tip
   vec3 base=mix(uBaseC,uAltC,smoothstep(.45,.7,n1)*.6);base=mix(base,base*vec3(1.5,.85,.6),smoothstep(.55,1.,ct)*.55);base+=vec3(.04,.06,.02)*step(.82,id);
   alb=mix(base,vec3(.58,.60,.48),hk*smoothstep(.16,.02,abs(ca-uAn.z+.15))*.8);
  } else { // blue-tongued skink: silvery tan crossed by broad dark bands, ragged scale by scale; a dark stripe behind the eye
   float bd=smoothstep(.1,.45,sin(ct*58.+n1*2.2+id*.7))*step(.13,ct)*step(ca,2.05);alb=mix(uBaseC*(.84+.32*n2),uAltC,bd*.92);
   alb=mix(alb,uAltC,smoothstep(.17,.1,ct)*smoothstep(.45,.15,abs(ca-1.25))*step(uAn.y*.8,ct)*.85);
  }
  alb=mix(alb,uBelly*(.9+.15*n2),belly);alb*=.95+.1*id;
  // the head: mouth line rising to the jaw corner, pale lip scales, nostrils, ear openings
  float mA=uAn.z-.22*smoothstep(0.,uAn.y*1.4,t),hm=smoothstep(uAn.y*1.7,uAn.y*1.35,t)*step(.006,t);
  float mouth=smoothstep(.06+fwidth(a)*1.5,.0,abs(aa-mA))*hm,lip=smoothstep(.0,.05,mA-aa)*smoothstep(.32,.12,mA-aa)*hm;
  float nos=smoothstep(1.,.55,length(vec2((t-.014)/.006,(aa-.72)/.2)));
  float ear=smoothstep(1.,.6,length(vec2((t-uAn.y-uAn.w*3.2)/(uAn.w*.85),(aa-1.55)/.24)));
  alb=mix(alb,mix(alb,uBelly,.5),lip*.6);alb=mix(alb,vec3(.025,.018,.015),max(mouth*.9,max(nos,ear*.85)));
  float sock=smoothstep(2.4,1.1,length(vec2((t-uAn.y)*uLen,(aa-1.1)*rr))/(uAn.w*uLen));
  // light: GGX lobe per scale, a warm wrap where light bleeds through skin, sky from above and sand bounce from below
  float cav=mix(.62,1.,mix(1.,edge,fine)),ao=aoV*(1.-.3*sock);vec3 H=normalize(L+V);float ndl=dot(Nf,L),ndv=max(dot(Nf,V),.04);
  float rough=clamp((1.-uGloss)*(.85+.3*id),.3,.95),a2=rough*rough*rough*rough,dd=max(dot(normalize(N+Nf),H),0.);dd=dd*dd*(a2-1.)+1.;float D=a2/(3.1416*dd*dd);
  float Fs=.04+.96*pow(1.-max(dot(V,H),0.),5.),spec=min(D*Fs*.32*max(ndl,0.),12.),diff=max(ndl,0.),wrap=max(0.,(dot(N,L)+.5)/1.5)-diff;
  vec3 sky=uAmb*(.6+.4*Nf.y)*1.15,bounce=uGnd*(uKey*light*.22+uAmb*.6)*(.5-.5*Nf.y);
  vec3 R=reflect(-V,Nf);float Fe=.04+.96*pow(1.-ndv,5.);vec3 env=mix(uGnd*(uKey*light*.12+uAmb*.4),uAmb*1.5+uKey*light*.12,smoothstep(-.25,.5,R.y));
  c=alb*((sky+bounce)*ao*cav+uKey*light*(diff*mix(.45,1.,ao)+wrap*vec3(1.,.5,.3)*.35));
  c+=uKey*light*spec*cav*mix(.3,1.,ao)+env*Fe*(1.-rough)*ao*cav*.9;
 } else if(m==1){ // eye: vU is the point on the ball seen down its axis; fibrous iris, slit or round pupil, a wet cornea
  vec2 q=vU;float r=length(q),ang=atan(q.y,q.x);float fib=fbm(vec2(ang*7.,r*5.))*.6+fbm(q*18.)*.4;vec3 iris=uEye*(.45+.95*fib);
  if(uPat<.5)iris=mix(iris*1.15,vec3(.04),smoothstep(.55,.62,fbm(q*11.+2.))*.55);
  iris*=mix(1.,.5,smoothstep(.5,.85,r));
  float pup=uPat<.5?smoothstep(.1,.06,abs(q.x)/max(.05,sqrt(max(0.,1.-q.y*q.y/.8)))):smoothstep(.36,.31,r);
  iris=mix(iris,vec3(.005),pup);iris=mix(iris,vec3(.01),smoothstep(.84,.98,r));
  float ndv=max(0.,dot(N,V));vec3 H=normalize(L+V);float sp=pow(max(0.,dot(N,H)),600.)*6.+pow(max(0.,dot(N,H)),60.)*.25;vec3 R=reflect(-V,N);
  c=iris*(uAmb*1.2+uKey*light*.55)*mix(.7,1.,ndv);c+=uKey*light*sp+(uAmb*1.4+uKey*light*.1)*smoothstep(-.1,.7,R.y)*(.04+.96*pow(1.-ndv,5.))*.8;
 } else if(m==2){ // tongue: the skink's is famously blue
  c=(uPat>2.5&&uPat<3.5?vec3(.06,.12,.46):vec3(.6,.22,.22))*(uAmb+uKey*light)+uKey*light*pow(max(0.,dot(N,normalize(L+V))),60.)*.5;
 } else if(m==3){ // cricket: tan body, dark head, glossy
  float ndl=max(0.,dot(N,L));float s=vU.x;vec3 alb=mix(vec3(.05,.035,.02),vec3(.27,.17,.08),smoothstep(.0,.55,s))*(.8+.5*sin(s*50.));float ndv=max(0.,N.z);c=alb*(uAmb+uKey*light*ndl*1.1)+uKey*light*pow(max(0.,dot(N,normalize(L+V))),40.)*.4;
 } else if(m==4){ // cricket legs, antennae
  c=vec3(.14,.09,.05)*(uAmb+uKey*light*max(0.,dot(N,L)));
 } else if(m==5){ // carapace: polygon scutes with their growth rings, pattern per species, a clear glossy coat
  float d,id;vec2 cen;scute(vU,d,id,cen);float aa=fwidth(vU.x)+fwidth(vU.y);float groove=smoothstep(.003,.019+aa,d);
  vec2 rel=vec2(vU.x,abs(vU.y))-cen;float ang=atan(rel.y,rel.x),rad=length(rel),idh=h11(id*.317+3.);
  float rings=.5+.5*sin(d*(uPat<4.5?215.:150.)+fbm(vU*6.)*2.5);float areola=smoothstep(.06,.16,rad);vec3 alb;
  if(uPat<4.5){float ray=sin(ang*(5.+mod(id,3.))+id*2.1+fbm(vU*11.)*3.);float streak=smoothstep(.3,.85,ray)*smoothstep(.04,.24,rad)*(.55+.45*smoothstep(.4,.7,fbm(vU*19.+id)));alb=mix(uBaseC,uAltC,clamp(streak,0.,1.));alb=mix(alb,uAltC*.6,.35*(1.-areola));}
  else{float vein=sin((vU.x*.7+abs(vU.y)*1.25+id*.41)*23.+fbm(vU*7.)*7.5);float streak=smoothstep(.58,.97,vein)*step(id,8.5)*smoothstep(.0,.05,d);alb=mix(uBaseC,uAltC,streak*.9);alb*=.75+.35*smoothstep(.3,.7,fbm(vU*14.+id*3.));}
  alb*=mix(.76,1.12,rings)*(.8+.36*idh);alb=mix(alb*(length(vU)>.86?.3:.16),alb,groove);alb*=mix(.74,1.,smoothstep(.0,.05,d));
  float rho=length(vU);float h=smoothstep(.0,.06,d)*.75+rings*.04+fbm(vU*70.)*.018;vec3 Nf=bumped(N,h,2.4);
  float ndl=max(0.,dot(Nf,L)),wrap=dot(N,L)*.5+.5,ao=mix(.5,1.,smoothstep(1.02,.7,rho));vec3 H=normalize(L+V);float ndv=max(0.,dot(N,V)),F=.04+.96*pow(1.-ndv,5.);float ndh=max(0.,dot(normalize(mix(N,Nf,.4)),H));float sp=pow(ndh,110.)*uGloss*.85*(.35+.9*smoothstep(.35,.75,fbm(vU*9.+vec2(0.,id))))+pow(ndh,18.)*uGloss*.12;
  c=alb*(uAmb*ao*1.25+uKey*light*(ndl*.85+wrap*.22)*ao+uGnd*(uKey*light*.2+uAmb*.5)*(.5-.5*Nf.y)*ao);c+=uKey*light*sp*groove;c+=uAmb*F*.55*(.4+uGloss)*min(1.,light);
 } else if(m==6||m==7){ // turtle skin: 6 neck, legs and tail with px uv, 7 head with uv (0..1 along, angle round)
  bool head=m==7;vec2 cu=head?vec2(vU.x*11.,vU.y*3.3):vU/(uScale*1.5);vec3 v=voroId(cu+vec2(.5*floor(cu.y),0.));float bump=smoothstep(.0,.46,v.x);vec3 alb=uSkin*(.62+.75*v.y);
  if(uPat<4.5){vec3 b=voroId(cu*.42+9.);float fl=smoothstep(.45,.2,b.z)*step(.45,b.y);alb=mix(alb,uSkin2*(.8+.5*b.y),fl*(head?.92:.7));if(head){float pale=smoothstep(.35,.05,abs(abs(vU.y)-3.));alb=mix(alb,uSkin2*.75,pale*.4);}}
  else{float st=head?sin(vU.y*5.+vU.x*2.):sin(vU.y*.42+vU.x*.018);st=smoothstep(.76,.96,st+.14*(fbm(cu*.5)-.5));alb=mix(alb,uSkin2,st*(head?.85:.65));if(head){float ear=smoothstep(.16,.07,abs(vU.x-.33))*smoothstep(.62,.32,abs(abs(vU.y)-1.75));alb=mix(alb,vec3(.66,.055,.03),ear);}}
  if(head)alb=mix(alb,vec3(.15,.12,.08),smoothstep(.86,.95,vU.x)*smoothstep(2.6,1.8,abs(vU.y)));
  float belly=smoothstep(-.2,-.75,N.y);alb=mix(alb,uBelly*(.7+.5*v.y),belly*.75);alb=mix(alb,alb*.4,smoothstep(.2,.0,v.x)*.65);
  vec3 Nf=bumped(N,bump*.5,1.1);float ndl=max(0.,dot(Nf,L)),wrap=dot(N,L)*.5+.5,ao=mix(.5,1.,smoothstep(-.8,.1,N.y));vec3 H=normalize(L+V);float sp=pow(max(0.,dot(Nf,H)),60.)*.5,ndv=max(0.,dot(N,V));
  c=alb*(uAmb*ao*(.6+.4*Nf.y)*1.15+uKey*light*(ndl*.72+wrap*.22)*ao+uGnd*(uKey*light*.22+uAmb*.6)*(.5-.5*Nf.y));c+=uKey*light*sp*.45*bump;c+=alb*vec3(1.,.55,.3)*uKey*light*.12*pow(1.-ndv,2.);
 } else if(m==8){ // plastron: pale horn, seams, a few dark blotches
  vec2 q=vU;float seam=min(abs(q.y)*1.1,min(abs(q.x-.55),min(abs(q.x-.16),min(abs(q.x+.2),abs(q.x+.58)))));float gr=smoothstep(.005,.022,seam);float bl=smoothstep(.55,.7,fbm(q*5.+3.));vec3 alb=mix(uBelly,uBelly*.34,bl*(uPat<4.5?.8:.55))*(.78+.34*fbm(q*22.));alb=mix(alb*.4,alb,gr);
  float ndl=max(0.,dot(N,L)),wrap=dot(N,L)*.5+.5;c=alb*(uAmb*1.1+uKey*light*(ndl*.6+wrap*.42));c+=uKey*light*pow(max(0.,dot(N,normalize(L+V))),40.)*.22;
 } else if(m==9){ // claws and beak tip
  float ndl=max(0.,dot(N,L));c=vec3(.085,.07,.05)*(uAmb+uKey*light*(ndl*.9+.2))+uKey*light*pow(max(0.,dot(N,normalize(L+V))),50.)*.5;
 } else if(m==10){ // inside of the mouth
  c=vec3(.42,.16,.15)*(uAmb*1.2+uKey*light*.5);
 } else if(m==11){ // strawberry: red, glossy, seeds
  vec3 v=voroId(vU*vec2(7.,4.));float seed=smoothstep(.24,.14,v.z)*step(.25,v.y);vec3 alb=mix(vec3(.62,.035,.03),vec3(.78,.09,.05),fbm(vU*3.));alb=mix(alb,vec3(.86,.60,.16),seed);alb=mix(alb,vec3(.88,.70,.42),smoothstep(.0,-.4,vU.x));
  float h=smoothstep(.14,.0,v.z)*step(.25,v.y)*-.5;vec3 Nf=bumped(N,h,1.);float ndl=max(0.,dot(Nf,L));c=alb*(uAmb*1.2+uKey*light*(ndl*.8+.28));c+=uKey*light*pow(max(0.,dot(Nf,normalize(L+V))),90.)*1.4;
 } else if(m==13){ // anole dewlap: thin pink-red skin in rows of pale scales, glowing when lit through
  float rows=smoothstep(.55,.9,sin(vU.x*2.6+vU.y*.5)*.5+.5)*smoothstep(.4,.6,fbm(vU*.9));vec3 alb=mix(vec3(.58,.08,.07),vec3(.80,.62,.50),rows*.55)*(.85+.3*fbm(vU*.4));vec3 Nn=N*(gl_FrontFacing?1.:-1.);
  c=alb*(uAmb*1.2+uKey*light*(abs(dot(Nn,L))*.55+.5));c+=uKey*light*pow(max(0.,dot(Nn,normalize(L+V))),50.)*.25;
 } else { // lettuce: frilled leaf, pale ribs
  float a=vU.y,r=vU.x;float rib=smoothstep(.09,.0,abs(fract(a*2.4+r*.6)-.5))*smoothstep(1.,.25,r);vec3 alb=mix(vec3(.07,.24,.035),vec3(.30,.47,.10),smoothstep(.15,1.,r)*.75+fbm(vec2(r*4.,a*3.)+vP.xz*.03)*.45);alb=mix(alb,vec3(.56,.68,.30),rib*.5);
  vec3 Nf=normalize(N*(gl_FrontFacing?1.:-1.));Nf=normalize(Nf+vec3(sin(a*7.+r*18.)*.35,0.,cos(a*5.+r*13.)*.35));float ndl=abs(dot(Nf,L));c=alb*(uAmb*1.25+uKey*light*(ndl*.85+.18));c+=alb*vec3(.9,1.,.4)*uKey*light*.2*(1.-ndl);c+=uKey*light*pow(max(0.,dot(Nf,normalize(L+V))),40.)*.18;
 }
 // below the waterline: tinted, dimmed, faintly shimmering; right at it a thin bright meniscus
 if(vP.y<0.){float k=exp(vP.y/(uLen*.075));c=mix(c*vec3(.20,.34,.30)+vec3(.006,.012,.012),c,k);c*=.93+.12*sin(vP.x*.08+uTime*2.)*sin(vP.z*.11-uTime*1.7);}
 if(uPat>3.5)c+=uKey*.07*exp(-abs(vP.y)/1.6);
 c=c/(1.+c*.18);o=vec4(pow(max(c,vec3(0)),vec3(1./2.2)),1.);}`;

const blobVS = HEAD + W2C + `layout(location=0)in vec4 iA;uniform vec4 uView;out vec2 vP;const vec2 Q[4]=vec2[4](vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(1,1));void main(){vec2 c=Q[gl_VertexID];vP=c;gl_Position=w2c(iA.xy+c*iA.zw,.0,uView);}`;
const blobFS = HEAD + `in vec2 vP;out vec4 o;void main(){float r=dot(vP,vP);float a=exp(-r*2.7)-.067;o=vec4(0.,0.,0.,max(a,0.)*.56);}`;
const picFS = HEAD + `in vec2 vW;uniform sampler2D uT;uniform vec2 uWorld;uniform vec3 uTint;uniform float uPremult;out vec4 o;void main(){vec4 c=texture(uT,vW/uWorld);c.rgb*=uTint;o=uPremult>.5?c:vec4(c.rgb,1);}`;
const fogFS = HEAD + NOISE + `in vec2 vW;uniform vec4 uView;uniform float uTime,uFog,uU;uniform vec2 uWorld;uniform sampler2D uT;out vec4 o;
void main(){vec2 v=(vW-vec2(uView.x,0.))/uView.yz;float aspect=uView.y/uView.z;vec2 q=(v-.5)*vec2(aspect,1.);float vig=smoothstep(.5,1.2,length(q*vec2(.72,1.)));
 float m=fbm(vW/uU*vec2(1.8,4.)+vec2(uTime*.02,uTime*.01));float m2=fbm(vW/uU*vec2(3.5,6.)-vec2(uTime*.03,0.));float inTank=smoothstep(uU*.99,uU*.97,vW.y);float fog=uFog*inTank*smoothstep(.3,.95,m*.7+m2*.5+.12*(1.-v.y));float a=fog*.16;
 vec2 p=vW;float band=p.x*.8+p.y*.55;float st=smoothstep(.0,.5,sin(band*.0021+.6)*.5+.5)*smoothstep(.62,1.,sin(band*.0013+2.)*.5+.5);float smudge=fbm(p*.0075+3.);vec3 add=vec3(.72,.74,.78)*fog*.11;add+=vec3(.9,.86,.8)*(.038*st*(.5+smudge));
 float g=(h12(vW+fract(uTime)*311.)-.5)*.05;add+=vec3(max(g,0.));float va=vig*.46;o=vec4(add,clamp(a+va+max(-g,0.),0.,1.));}`;
const dropVS = HEAD + W2C + `layout(location=0)in vec4 iA;uniform vec4 uView;out vec2 vP;out vec2 vC;const vec2 Q[4]=vec2[4](vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(1,1));void main(){vec2 c=Q[gl_VertexID];vP=c;vC=iA.xy;vec2 s=vec2(iA.z,iA.z*iA.w);gl_Position=w2c(iA.xy+c*s,0.,uView);}`;
const dropFS = HEAD + `in vec2 vP;in vec2 vC;uniform sampler2D uT;uniform vec2 uWorld;uniform float uR;out vec4 o;void main(){float r=length(vP);if(r>1.)discard;float nz=sqrt(1.-r*r);vec2 n=vP;vec2 p=vC-vP*min(70.,uR*14.);vec3 b=texture(uT,p/uWorld).rgb;float e=smoothstep(1.,.86,r);float sp=pow(max(0.,dot(normalize(vec3(n.x,n.y,nz)),normalize(vec3(-.3,-.6,.74)))),90.);float dark=mix(.42,1.08,nz);o=vec4((b*dark+vec3(1.)*sp*.8)*e,e);}`;
// the turtle pool's water, live: a refracted, caustic-lit bed drawn under the animals, then a surface drawn over them with a depth test so the shell breaks through it
const POOLF = `uniform vec4 uPool;uniform float uS;float poolRf(vec2 q){float a=atan(q.y,q.x);return length(q)*(1.+.08*sin(2.*a+uS*6.2832)+.05*sin(3.*a+uS*9.)+.03*sin(5.*a+uS*17.));}`;
const poolVS = HEAD + W2C + `uniform vec4 uRect,uView;uniform float uYB,uD;out vec2 vW;const vec2 Q[4]=vec2[4](vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(1,1));void main(){vec2 w=uRect.xy+Q[gl_VertexID]*uRect.zw;vW=w;float cam=(w.y-uYB)/${KZ.toFixed(4)}*${CY.toFixed(4)};gl_Position=w2c(w,-cam/(uD*2.)*.9,uView);}`;
const poolBedFS = HEAD + NOISE + POOLF + `in vec2 vW;uniform sampler2D uT;uniform vec2 uWorld;uniform vec3 uTint;uniform float uTime,uU;out vec4 o;
void main(){vec2 q=(vW-uPool.xy)/uPool.zw;float r=poolRf(q);if(r>1.)discard;float t=uTime,dp=smoothstep(1.,.45,r);vec2 wp=vW/uU;
 vec2 d=vec2(vn(wp*11.+vec2(t*.7,t*.5)),vn(wp*11.+vec2(-t*.6,t*.4)+7.))-.5;d+=.6*(vec2(vn(wp*27.+vec2(t*1.3,0.)),vn(wp*27.+vec2(0.,t*1.1)+3.))-.5);
 vec3 c=texture(uT,(vW+d*uU*.020*dp)/uWorld).rgb;
 vec2 cp=wp*vec2(40.,104.);vec2 v1=voro(cp+vec2(t*.5,t*.35)),v2=voro(cp*1.27+vec2(-t*.4,t*.45)+5.);float ca=pow(max(0.,1.-(v1.y-v1.x)*3.2),7.)*.6+pow(max(0.,1.-(v2.y-v2.x)*3.2),7.)*.4;ca*=dp*smoothstep(.3,.75,vn(wp*vec2(7.,20.)+t*.1));
 c*=1.+ca*.55;c+=vec3(.05,.07,.05)*ca;
 float e0=smoothstep(1.,.965,r);o=vec4(c*uTint*e0,e0);}`;
const poolTopFS = HEAD + NOISE + POOLF + `in vec2 vW;uniform vec4 uLamps[10];uniform vec4 uRip[28];uniform int uNL,uNR;uniform vec3 uTint;uniform float uTime,uU,uYB,uDay;out vec4 o;
float chop(vec2 p){return vn(p+vec2(uTime*.5,uTime*.33))+.5*vn(p*2.3-vec2(uTime*.7,-uTime*.2)+4.);}
void main(){vec2 q=(vW-uPool.xy)/uPool.zw;float r=poolRf(q);if(r>1.)discard;vec2 xz=vec2(vW.x,(vW.y-uYB)/${KZ.toFixed(4)});
 vec2 g=vec2(0.);float rim=0.;for(int i=0;i<uNR;i++){vec4 R=uRip[i];vec2 d=xz-R.xy;float l=length(d)+.001,w=uU*.012*(1.+R.z/(uU*.18)),x=(l-R.z)/w,e=exp(-x*x);g+=d/l*R.w*e*sin(x*3.);rim+=R.w*e*max(0.,cos(x*3.));}
 vec2 ch=xz/uU*vec2(14.,9.);float e0=.04,h0=chop(ch);g+=vec2(chop(ch+vec2(e0,0.))-h0,chop(ch+vec2(0.,e0))-h0)/e0*.045;
 vec3 N=normalize(vec3(-g.x*.9,1.,-g.y*.9));vec3 V=normalize(vec3(0.,${KZ.toFixed(4)},${CY.toFixed(4)}));float ndv=max(0.,dot(N,V)),F=.02+.98*pow(1.-ndv,5.);
 vec3 sp=vec3(0.),refl=vec3(0.);for(int i=0;i<uNL;i++){vec4 L0=uLamps[i];float dx=(L0.x-vW.x)/uU;vec3 L=normalize(vec3(dx,.62,-.34));vec3 H=normalize(L+V);sp+=vec3(1.,.84,.62)*L0.z*pow(max(0.,dot(N,H)),700.)*3.2;refl+=vec3(1.,.74,.44)*L0.z*exp(-dx*dx*2.2);}
 refl*=.62*uDay;refl+=vec3(.05,.06,.075);sp*=uDay;
 float foam=smoothstep(.95,.995,r)*smoothstep(.6,.8,vn(xz/uU*vec2(36.,22.)+vec2(uTime*.2,0.)))*.5;float a=clamp(F*1.3+.10+.3*clamp(rim,0.,1.)+foam*.25,0.,.95);
 vec3 c=refl*F*1.4*uTint+vec3(.022,.04,.042)*.1*uTint+vec3(.82,.86,.86)*(.34*clamp(rim,0.,1.)+foam*.2)*(.4+.6*uDay)+sp;
 float e2=smoothstep(1.,.985,r);o=vec4(c*e2,a*e2);}`;
const P = {};
function ensurePrograms() { if (P.tank) return; P.tank = program(FS_TRI, tankFS); P.rock = program(FS_TRI, rockFS); P.obj = program(objVS, objFS); P.leaf = program(leafVS, leafFS); P.mesh = program(meshVS, meshFS); P.blob = program(blobVS, blobFS); P.pic = program(QUAD_VS, picFS); P.fog = program(QUAD_VS, fogFS); P.drop = program(dropVS, dropFS); P.poolBed = program(poolVS, poolBedFS); P.poolTop = program(poolVS, poolTopFS); }

// ---- world state
let bgRT = null, fgRT = null, lamps = [], rocks = [], yB = 0, yF = 0, depth = 0, bask = null, cave = null, dish = null, lizards = [], crickets = [], drops = [], humidity = .18, time = 0, dayK = 1, dayTarget = 1, tapK = 0, mistT = 0, autoMist = 40, autoFeed = 90;
const floorY = (z) => yB + z * KZ;
function alt(x, z) { let h = 0; for (const r of rocks) { if (r === cave) continue; const dx = (x - r.x) / r.rx, dz = (z - r.z) / r.rz; const d = dx * dx + dz * dz; if (d < 4) h = Math.max(h, r.h * Math.exp(-d * 1.05)); } return h; }
function lampK(x) { let s = 0; for (const L of lamps) { const dx = (x - L.x) / (unit * .52); s += L.p * Math.exp(-dx * dx * 1.1); } return clamp(s, .0, 1.5); }

const V = new Float32Array(160000 * 10), I = new Uint32Array(700000); let vN = 0, iN = 0, mVAO, mVB, mIB, blobBuf, blobVAO, dropBuf, dropVAO;
function pushV(x, y, z, nx, ny, nz, u, v, m, l) { const k = vN * 10; V[k] = x; V[k + 1] = y; V[k + 2] = z; V[k + 3] = nx; V[k + 4] = ny; V[k + 5] = nz; V[k + 6] = u; V[k + 7] = v; V[k + 8] = m; V[k + 9] = l; return vN++; }
function ringIdx(a, b, sides) { for (let s = 0; s < sides; s++) { const a0 = a + s, a1 = a + s + 1, b0 = b + s, b1 = b + s + 1; I[iN++] = a0; I[iN++] = b0; I[iN++] = a1; I[iN++] = b0; I[iN++] = b1; I[iN++] = a1; } }
// a tube through points, each with a radius (or [up, side] radii), lit by one number
function tube(pts, radii, sides, mat, light, uvFn) {
  let prev = -1;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2], tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    let sx = -tz, sz = tx, sy = 0, sl = Math.hypot(sx, sz); if (sl < .01) { sx = 1; sz = 0; sl = 1; } sx /= sl; sz /= sl;
    const ux = sy * tz - sz * ty, uy = sz * tx - sx * tz, uz = sx * ty - sy * tx;
    const r = radii[i], rv = Array.isArray(r) ? r[0] : r, rh = Array.isArray(r) ? r[1] : r, idx = vN;
    for (let s = 0; s <= sides; s++) {
      const a2 = s / sides * TAU - Math.PI, cc = Math.cos(a2), ss = Math.sin(a2);
      const nx = ux * cc * rh + sx * ss * rv, ny = uy * cc * rh + sy * ss * rv, nz = uz * cc * rh + sz * ss * rv, nl = Math.hypot(nx, ny, nz) || 1;
      const uv = uvFn ? uvFn(i, a2, Math.max(rv, rh)) : [i / (pts.length - 1), a2];
      pushV(p[0] + ux * cc * rv + sx * ss * rh, p[1] + uy * cc * rv + sy * ss * rh, p[2] + uz * cc * rv + sz * ss * rh, nx / nl, ny / nl, nz / nl, uv[0], uv[1], mat, light);
    }
    if (prev >= 0) ringIdx(prev, idx, sides);
    prev = idx;
  }
}
function sphere(cx, cy, cz, r, mat, light, axisX, axisZ) {
  const n = 10, base = vN;
  for (let j = 0; j <= n; j++) { const th = Math.PI * j / n, st = Math.sin(th), ct = Math.cos(th); for (let i = 0; i <= n * 2; i++) { const ph = TAU * i / (n * 2), x = st * Math.cos(ph), y = ct, z = st * Math.sin(ph); const ux = x * axisZ - z * axisX, uz = x * axisX + z * axisZ; pushV(cx + ux * r, cy + y * r, cz + uz * r, ux, y, uz, x, -y, mat, light); } }
  for (let j = 0; j < n; j++) ringIdx(base + j * (n * 2 + 1), base + (j + 1) * (n * 2 + 1), n * 2);
}
function profile(sp, t) { const p = sp.prof; for (let i = 1; i < p.length; i++) if (t <= p[i][0]) { const k = (t - p[i - 1][0]) / (p[i][0] - p[i - 1][0]), e = k * k * (3 - 2 * k); return [lerp(p[i - 1][1], p[i][1], e), lerp(p[i - 1][2], p[i][2], e)]; } return [.002, .002]; }

const NODES = 64;
function newLizard(sp, x, z) {
  const L = sp.len * unit * S.size, seg = L / (NODES - 1), nx = new Float32Array(NODES), nz = new Float32Array(NODES), ny = new Float32Array(NODES), dir = Math.random() < .5 ? 1 : -1;
  for (let i = 0; i < NODES; i++) { nx[i] = x - dir * i * seg; nz[i] = z + Math.sin(i * .14) * seg * 3; ny[i] = alt(nx[i], nz[i]) + bodyH(sp, L); }
  const liz = { sp, L, seg, nx, ny, nz, h: dir > 0 ? 0 : Math.PI, speed: 0, state: 'pause', t: rnd(1, 4), warm: rnd(.3, .9), hunger: rnd(.2, .7), thirst: rnd(.1, .5), tx: x, tz: z, phase: rnd(TAU), lookX: 0, tongue: 0, gulp: 0, legs: [] };
  const sh = sp.an ? sp.an.sh : .19, hp = sp.an ? sp.an.hip : .445;
  for (const [i, tt, side] of [[0, sh, -1], [1, sh, 1], [2, hp, -1], [3, hp, 1]]) { const k = (tt * (NODES - 1)) | 0; liz.legs.push({ t: tt, side, foot: [nx[k], alt(nx[k], nz[k]), nz[k] + side * L * .10], from: [0, 0, 0], to: [0, 0, 0], k: 1, idx: i }); }
  return liz;
}
const bodyH = (sp, L) => L * (.047 + .032 * sp.leg) * (sp.an && sp.an.bh || 1);
function pickTarget(l, x, z) { l.tx = clamp(x, 80, W - 80); l.tz = clamp(z, depth * .46, depth * .92); }
function think(l, dt) {
  const head = [l.nx[0], l.nz[0]], day = dayK > .35, p = lampK(head[0]) * dayK;
  l.warm = clamp(l.warm + (p > .6 ? dt * .034 : -dt * .012) * (1 + .4 * (1 - dayK)), 0, 1); l.hunger = clamp(l.hunger + dt * .006, 0, 1); l.thirst = clamp(l.thirst + dt * .004, 0, 1);
  l.t -= dt; const dTarget = Math.hypot(l.tx - head[0], l.tz - head[1]);
  if (l.state === 'bolt') { if (dTarget < l.L * .3 || l.t < 0) { l.state = 'pause'; l.t = rnd(4, 9); } return; }
  // hunting beats everything except panic
  const prey = crickets.filter(c => !c.dead && c.state !== 'fall').map(c => [Math.hypot(c.x - head[0], c.z - head[1]), c]).sort((a, b) => a[0] - b[0])[0];
  if (prey && prey[0] < unit * (l.hunger > .15 ? 1.15 : .3) && day) { const c = prey[1]; l.prey = c; l.tx = c.x; l.tz = c.z; l.state = prey[0] < l.L * .12 ? 'strike' : 'hunt'; return; } else if (l.state === 'hunt' || l.state === 'strike') { l.state = 'pause'; l.t = rnd(1, 3); l.prey = null; }
  if (l.state === 'walk' || l.state === 'bask' || l.state === 'drink' || l.state === 'hide') {
    if (dTarget < l.L * .14) { if (l.state === 'walk') { l.state = 'pause'; l.t = rnd(1.5, 7); } else { l.state = 'rest-' + l.state; l.t = l.state === 'rest-bask' ? rnd(18, 50) : l.state === 'rest-drink' ? rnd(4, 9) : rnd(25, 80); if (l.state === 'rest-drink') l.thirst = 0; } }
    return;
  }
  if (l.state.startsWith('rest') && l.t > 0) { if (l.state === 'rest-hide' && day && Math.random() < dt * .02) l.t = 0; else if (l.state === 'rest-bask' && l.warm > .94) l.t = 0; return; }
  if (l.state === 'pause' && l.t > 0) return;
  // what next?
  if (!day && cave) { pickTarget(l, cave.x + rnd(-.1, .1) * cave.rx, cave.z + rnd(-.1, .08) * cave.rz); l.state = 'hide'; return; }
  if (l.warm < .36 && bask) { pickTarget(l, bask.x + rnd(-.4, .4) * bask.rx, bask.z + rnd(-.1, .18) * bask.rz); l.state = 'bask'; return; }
  if (l.thirst > .68 && dish) { pickTarget(l, dish.x + rnd(-.2, .2) * dish.rx, dish.z + dish.rz * .95); l.state = 'drink'; return; }
  if (cave && Math.random() < .10) { pickTarget(l, cave.x, cave.z + rnd(-.05, .12) * cave.rz); l.state = 'hide'; return; }
  // otherwise wander, often a long way, so they cross between screens
  const span = Math.random() < .45 ? rnd(.5, 1.5) * unit : rnd(.15, .55) * unit; pickTarget(l, head[0] + (Math.random() < .5 ? -1 : 1) * span, rnd(depth * .46, depth * .92)); l.state = 'walk';
}
function stepLizard(l, dt) {
  // in a popup pane the leader drives the head and netApply delivers it; only the body and legs are worked out here
  if (LEADER) { think(l, dt);
  let spd = 0; const moving = ['walk', 'hunt', 'strike', 'bask', 'drink', 'hide', 'bolt'].includes(l.state), base = l.L * .38 * l.sp.walk;
  if (moving) {
    const hx = l.nx[0], hz = l.nz[0], d = Math.hypot(l.tx - hx, l.tz - hz) || 1, want = Math.atan2(l.tz - hz, l.tx - hx);
    if (d > l.L * .08) l.h += clamp(angDiff(want, l.h), -dt * 2.6, dt * 2.6);
    // reptile gait: walk in fits and starts, sprint at prey or when spooked
    l.burst = (l.burst === undefined ? rnd(.5, 1.4) : l.burst) - dt; if (l.burst < -.4) l.burst = rnd(.6, 2.2);
    spd = base * (l.state === 'bolt' ? 3.4 : l.state === 'strike' ? 2.4 : l.state === 'hunt' ? 1.3 : (l.burst > 0 ? 1 : .05));
    spd *= sstep(.05, .45, Math.abs(Math.cos(angDiff(want, l.h))) + .4);
  }
  l.speed = lerp(l.speed, spd, 1 - Math.exp(-dt * 7));
  l.nx[0] += Math.cos(l.h) * l.speed * dt; l.nz[0] += Math.sin(l.h) * l.speed * dt;
  l.nx[0] = clamp(l.nx[0], 20, W - 20); l.nz[0] = clamp(l.nz[0], depth * .34, depth);
  if (dish) { const dx = l.nx[0] - dish.x, dz = (l.nz[0] - dish.z) * (dish.rx / dish.rz), d = Math.hypot(dx, dz); if (d < dish.rx * 1.22) { const k = dish.rx * 1.22 / (d || 1); l.nx[0] = dish.x + dx * k; l.nz[0] = dish.z + dz * k * (dish.rz / dish.rx); } }
  }
  l.phase += l.speed / l.L * dt * 12;
  // settle onto the belly when still
  l.low = ra(l.low || 0, l.speed < l.L * .03 ? 1 : 0, 2.2, dt);
  const bh = bodyH(l.sp, l.L) * (1 - .3 * l.low);
  l.ny[0] = alt(l.nx[0], l.nz[0]) + bh * 1.08 + (l.state === 'rest-bask' ? bh * .26 : 0);
  for (let i = 1; i < NODES; i++) {
    let dx = l.nx[i] - l.nx[i - 1], dz = l.nz[i] - l.nz[i - 1]; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    l.nx[i] = l.nx[i - 1] + dx * l.seg; l.nz[i] = l.nz[i - 1] + dz * l.seg;
    const g = alt(l.nx[i], l.nz[i]), low = i > NODES * .55 ? lerp(0, bh * .92, (i - NODES * .55) / (NODES * .45)) : 0;
    l.ny[i] = lerp(l.ny[i], g + bh * (1 - .55 * i / NODES) - low, .25);
  }
  // legs
  const stride = l.L * .135;
  for (const leg of l.legs) {
    const k = (leg.t * (NODES - 1)) | 0, hx = l.nx[k], hz = l.nz[k], tx = l.nx[Math.max(0, k - 3)] - l.nx[Math.min(NODES - 1, k + 3)], tz = l.nz[Math.max(0, k - 3)] - l.nz[Math.min(NODES - 1, k + 3)], tl = Math.hypot(tx, tz) || 1, fx = tx / tl, fz = tz / tl, sx = -fz, sz = fx;
    const reach = l.L * (.165 * l.sp.leg + .06);
    const idealX = hx + sx * leg.side * reach + fx * stride * .22, idealZ = hz + sz * leg.side * reach + fz * stride * .22;
    if (leg.k >= 1) {
      const d = Math.hypot(leg.foot[0] - idealX, leg.foot[2] - idealZ);
      const partner = l.legs[(leg.idx + 2) % 4], diag = partner.k >= 1;
      if (d > stride && diag && l.legs[leg.idx ^ 1].k >= 1) { leg.k = 0; leg.from = leg.foot.slice(); leg.to = [idealX + fx * stride * .55, 0, idealZ + fz * stride * .55]; leg.to[1] = alt(leg.to[0], leg.to[2]); }
    } else { leg.k = Math.min(1, leg.k + dt * Math.max(7, l.speed / l.L * 13)); const e = leg.k; leg.foot = [lerp(leg.from[0], leg.to[0], e), lerp(leg.from[1], leg.to[1], e) + Math.sin(e * Math.PI) * l.L * .035, lerp(leg.from[2], leg.to[2], e)]; }
  }
  // blink now and then; eyes shut while sleeping in the hide or dozing under the lamp
  l.blinkT = (l.blinkT ?? rnd(1, 6)) - dt; if (l.blinkT < 0) { l.blinkT = rnd(2.5, 9); l.blinkK = .2; }
  if (l.blinkK > 0) l.blinkK -= dt;
  const asleep = l.state === 'rest-hide' || (l.state === 'rest-bask' && l.warm > .75 && Math.sin(time * .07 + l.phase) > .55);
  l.lid = ra(l.lid || 0, asleep || l.blinkK > 0 ? 1 : 0, l.blinkK > 0 ? 38 : 2.5, dt);
  // anoles flash the dewlap with a few push-ups
  if (l.sp.an && l.sp.an.dewlap) {
    if (!(l.disp > 0) && ['pause', 'rest-bask', 'rest-drink'].includes(l.state) && Math.random() < dt * .045) l.disp = 2.8;
    if (l.disp > 0) l.disp -= dt; const e = l.disp > 0 ? Math.sin(Math.min(1, (2.8 - l.disp) / 2.8) * Math.PI) : 0;
    l.dew = ra(l.dew || 0, e > .25 ? 1 : 0, 10, dt); l.bob = e > 0 ? Math.max(0, Math.sin((2.8 - l.disp) * 7.5)) * e : 0;
  }
  if (l.tongue > 0) l.tongue -= dt; if (l.gulp > 0) l.gulp -= dt;
  if (Math.random() < dt * .12 && l.tongue <= 0 && l.sp.tongue) l.tongue = .55;
  if (l.state === 'strike' && l.prey && Math.hypot(l.prey.x - l.nx[0], l.prey.z - l.nz[0]) < l.L * .05) { l.prey.dead = true; l.hunger = Math.max(0, l.hunger - .42); l.gulp = 1.1; l.prey = null; l.state = 'pause'; l.t = rnd(2, 5); }
}
// ---- lizard meshes: a body skinned from rings round the spine, two-bone legs with real hands and feet, lidded eyes
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const madd = (P, A, a, B, b) => [P[0] + A[0] * a + B[0] * b, P[1] + A[1] * a + B[1] * b, P[2] + A[2] * a + B[2] * b];
// rings: tight at the snout so it rounds off, then even down to the tail tip
const RING_T = (() => { const a = [0, .004, .010, .018, .027, .037]; for (let t = .048; t < .995; t += .0118) a.push(t); a.push(1); return a; })();
const LSIDES = 24;
function nodeAt(l, t) { const f = clamp(t, 0, 1) * (NODES - 1), i = Math.min(NODES - 2, f | 0), k = f - i; return [lerp(l.nx[i], l.nx[i + 1], k), lerp(l.ny[i], l.ny[i + 1], k), lerp(l.nz[i], l.nz[i + 1], k)]; }
// the body's centre, axes and radii at t, with the sway, display bob and breathing folded in
function lizFrame(l, t, ex) {
  const P = nodeAt(l, t), A = nodeAt(l, t - .014), B = nodeAt(l, t + .014);
  const f = norm3([A[0] - B[0], A[1] - B[1], A[2] - B[2]]), s = norm3([-f[2], 0, f[0]]), u = cross3(s, f);
  const w = ex.sway(t); P[0] += s[0] * w; P[2] += s[2] * w; P[1] += ex.lift(t);
  const tip = .034, pf = profile(l.sp, Math.max(t, tip)), k = t < tip ? Math.sqrt(Math.max(0, 1 - (1 - t / tip) ** 2)) : 1, sw = ex.swell(t);
  return { P, f, s, u, rv: pf[0] * l.L * k * sw, rh: pf[1] * l.L * k * sw, t };
}
// a point on the skin: a squarish section with a flatter belly; in the head the top flattens and the jaw flares
function ringPt(fr, a, an) {
  const ca = Math.cos(a), sa = Math.sin(a), hk = sstep(an.headEnd, an.headEnd * .5, fr.t), pw = (v) => Math.sign(v) * Math.pow(Math.abs(v), an.sq);
  const x = pw(sa) * fr.rh * (1 + an.jaw * hk * Math.exp(-(((ca + .18) / .5) ** 2)));
  const y = pw(ca) * fr.rv * (ca < 0 ? an.flat + (1 - an.flat) * .3 * hk : 1 - .22 * hk);
  return madd(fr.P, fr.s, x, fr.u, y);
}
function smoothNormals(v0, i0) {
  for (let v = v0; v < vN; v++) { const k = v * 10; V[k + 3] = 0; V[k + 4] = 0; V[k + 5] = 0; }
  for (let i = i0; i < iN; i += 3) {
    const a = I[i] * 10, b = I[i + 1] * 10, c = I[i + 2] * 10;
    const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2], wx = V[c] - V[a], wy = V[c + 1] - V[a + 1], wz = V[c + 2] - V[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    V[a + 3] += nx; V[a + 4] += ny; V[a + 5] += nz; V[b + 3] += nx; V[b + 4] += ny; V[b + 5] += nz; V[c + 3] += nx; V[c + 4] += ny; V[c + 5] += nz;
  }
}
function lizBody(l, ex, light, an) {
  const v0 = vN, i0 = iN, rr = l.L * .06, row = LSIDES + 1; let prev = -1, f0 = null, f1 = null;
  for (const t of RING_T) {
    const fr = lizFrame(l, t, ex), idx = vN; if (t === 0) f0 = fr.f; f1 = fr.f;
    for (let q = 0; q <= LSIDES; q++) {
      const a = q / LSIDES * TAU - Math.PI, p = ringPt(fr, a, an);
      const ao = .3 + .7 * sstep(0, l.L * .032, p[1] - gnd(p[0], p[2]));
      pushV(p[0], p[1], p[2], 0, 0, 0, t * l.L, a * rr, (1 - ao) * .9, light);
    }
    if (prev >= 0) ringIdx(prev, idx, LSIDES); prev = idx;
  }
  smoothNormals(v0, i0);
  const rings = RING_T.length;
  for (let r = 0; r < rings; r++) { const a = (v0 + r * row) * 10, b = (v0 + r * row + LSIDES) * 10; for (let c = 3; c < 6; c++) { const s = V[a + c] + V[b + c]; V[a + c] = s; V[b + c] = s; } }
  // which way is out: the middle of the back must face up
  const top = (v0 + (rings >> 1) * row + (LSIDES >> 1)) * 10, sign = V[top + 4] >= 0 ? 1 : -1;
  for (let v = v0; v < vN; v++) { const k = v * 10, n = Math.hypot(V[k + 3], V[k + 4], V[k + 5]) || 1; V[k + 3] *= sign / n; V[k + 4] *= sign / n; V[k + 5] *= sign / n; }
  for (let q = 0; q <= LSIDES; q++) { let k = (v0 + q) * 10; V[k + 3] = f0[0]; V[k + 4] = f0[1]; V[k + 5] = f0[2]; k = (v0 + (rings - 1) * row + q) * 10; V[k + 3] = -f1[0]; V[k + 4] = -f1[1]; V[k + 5] = -f1[2]; }
}
// two-bone IK: the elbow or knee for a limb from A to B, bending toward the pole
function ik2(A, B, l1, l2, pole) {
  const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], dl = Math.hypot(d[0], d[1], d[2]) || 1, dn = [d[0] / dl, d[1] / dl, d[2] / dl];
  const D = Math.min(dl, (l1 + l2) * .999), a = (l1 * l1 - l2 * l2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, l1 * l1 - a * a)), pd = dot3(pole, dn);
  const p = norm3([pole[0] - dn[0] * pd, pole[1] - dn[1] * pd, pole[2] - dn[2] * pd]);
  return [A[0] + dn[0] * a + p[0] * h, A[1] + dn[1] * a + p[1] * h, A[2] + dn[2] * a + p[2] * h];
}
function lizLeg(l, leg, ex, light, an) {
  const L = l.L, front = leg.idx < 2, fr = lizFrame(l, leg.t, ex), sd = leg.side, S = [fr.s[0] * sd, 0, fr.s[2] * sd], rr = L * .06;
  const root = madd(fr.P, S, fr.rh * .58, fr.u, -fr.rv * .22), rootIn = madd(fr.P, S, fr.rh * .12, fr.u, -fr.rv * .12);
  const F = leg.foot, toeR = an.toeR * L, toeL = an.toe * L;
  // front feet point forward and out, hind feet out and a little back
  const th = front ? .6 : 1.6, dir = norm3([fr.f[0] * Math.cos(th) + S[0] * Math.sin(th), 0, fr.f[2] * Math.cos(th) + S[2] * Math.sin(th)]);
  const palm = [F[0] + dir[0] * toeL * .04, F[1] + toeR * .8, F[2] + dir[2] * toeL * .04];
  const wrist = [palm[0] - dir[0] * toeL * .2, palm[1] + toeR * 1.5, palm[2] - dir[2] * toeL * .2];
  const reach = L * (.165 * l.sp.leg + .06), D0 = Math.hypot(Math.max(reach - fr.rh * .58, L * .02), bodyH(l.sp, L) - fr.rv * .22 - toeR * 2.3);
  const l1 = D0 * (front ? .56 : .58), l2 = D0 * (front ? .52 : .54);
  const pole = front ? [fr.u[0] * .3 - fr.f[0] * .55 + S[0] * .8, fr.u[1] * .3, fr.u[2] * .3 - fr.f[2] * .55 + S[2] * .8] : [fr.u[0] * .32 + fr.f[0] * .45 + S[0] * .85, fr.u[1] * .32, fr.u[2] * .32 + fr.f[2] * .45 + S[2] * .85];
  const J = ik2(root, wrist, l1, l2, pole), r0 = (front ? an.arm : an.thigh) * L, ua = leg.t * L, va = 1.5 * rr * sd;
  tube([rootIn, root, lerp3(root, J, .5), J, lerp3(J, wrist, .5), wrist, palm], [r0 * 1.55, r0 * 1.2, r0 * .95, r0 * .72, r0 * .62, r0 * .52, toeR * 1.15], 10, 0, light, (i, a2, r) => [ua + i * r0 * 1.3, va + a2 * r]);
  const p0 = norm3(cross3(dir, [0, 1, 0])), pk = Math.sign(p0[0] * S[0] + p0[2] * S[2]) || 1, perp = [p0[0] * pk, 0, p0[2] * pk];
  ellW(palm, dir, [0, 1, 0], perp, toeL * .19, toeR * .85, toeL * .16, .25, light, () => [ua, va], 5, 10);
  const lens = front ? [.5, .78, .95, .9, .62] : [.42, .66, .86, 1.0, .64], spread = front ? .95 : .85, curl = leg.k < 1 ? Math.sin(leg.k * Math.PI) * toeR * 2.4 : 0;
  for (let j = 0; j < 5; j++) {
    const ang = lerp(-spread, spread, j / 4) + (!front && j === 4 ? .3 : 0), ca = Math.cos(ang), sa = Math.sin(ang);
    const td = [dir[0] * ca + perp[0] * sa, 0, dir[2] * ca + perp[2] * sa], len = toeL * lens[j];
    const b = [palm[0] + td[0] * toeL * .13, palm[1] - toeR * .15, palm[2] + td[2] * toeL * .13];
    const P1 = [b[0] + td[0] * len * .3, b[1] + toeR * .85, b[2] + td[2] * len * .3], P2 = [b[0] + td[0] * len * .66, b[1] + toeR * .3 - curl * .5, b[2] + td[2] * len * .66], P3 = [b[0] + td[0] * len, b[1] - toeR * .2 - curl, b[2] + td[2] * len];
    tube([b, P1, P2, P3], [toeR, toeR * .9, toeR * (an.pad ? .95 : .72), toeR * (an.pad ? 1.1 : .52)], 6, .3, light, (i, a2, r) => [ua + i * 3, va + a2 * r]);
    tube([P3, [P3[0] + td[0] * toeR * 1.8, P3[1] - toeR * .6, P3[2] + td[2] * toeR * 1.8]], [toeR * .42, toeR * .05], 5, 9, light);
  }
}
// an eyeball whose uv is the point on it as seen down its own axis, so the iris and pupil land facing out
function eyeBall(C, e, f, r, light) {
  const fx = norm3([f[0] - e[0] * dot3(f, e), f[1] - e[1] * dot3(f, e), f[2] - e[2] * dot3(f, e)]); let qy = cross3(e, fx); if (qy[1] < 0) qy = [-qy[0], -qy[1], -qy[2]];
  const n = 9, m = 18, base = vN;
  for (let j = 0; j <= n; j++) { const th = Math.PI * j / n, st = Math.sin(th), ct = Math.cos(th), k = ct >= 0 ? 1 : 1 / Math.max(.05, st); for (let i = 0; i <= m; i++) { const ph = TAU * i / m, cp = Math.cos(ph), sp = Math.sin(ph); const d = [e[0] * ct + (fx[0] * cp + qy[0] * sp) * st, e[1] * ct + (fx[1] * cp + qy[1] * sp) * st, e[2] * ct + (fx[2] * cp + qy[2] * sp) * st]; pushV(C[0] + d[0] * r, C[1] + d[1] * r, C[2] + d[2] * r, d[0], d[1], d[2], cp * st * k, sp * st * k, 1, light); } }
  for (let j = 0; j < n; j++) ringIdx(base + j * (m + 1), base + (j + 1) * (m + 1), m);
  return { fx, qy };
}
function lizEyes(l, ex, light, an) {
  const fr = lizFrame(l, an.eyeT, ex), re = an.eyeR * l.L, rr = l.L * .06;
  for (const sd of [-1, 1]) {
    const aE = sd * 1.24, surf = ringPt(fr, aE, an), S = [fr.s[0] * sd, fr.s[1] * sd, fr.s[2] * sd];
    const e = norm3([S[0] * .86 + fr.u[0] * .4 + fr.f[0] * .1, S[1] * .86 + fr.u[1] * .4 + fr.f[1] * .1, S[2] * .86 + fr.u[2] * .4 + fr.f[2] * .1]);
    const C = [surf[0] - e[0] * re * .3, surf[1] - e[1] * re * .3, surf[2] - e[2] * re * .3], { fx, qy } = eyeBall(C, e, fr.f, re, light), uv = [an.eyeT * l.L, aE * rr];
    // a rim of lid skin round the eye, and an upper lid that drops to blink or sleep
    const ring = []; for (let k = 0; k <= 18; k++) { const a = k / 18 * TAU, ca = Math.cos(a), sa = Math.sin(a); ring.push([C[0] + e[0] * re * .4 + (fx[0] * ca + qy[0] * sa) * re * .9, C[1] + e[1] * re * .4 + (fx[1] * ca + qy[1] * sa) * re * .9, C[2] + e[2] * re * .4 + (fx[2] * ca + qy[2] * sa) * re * .9]); }
    tube(ring, ring.map(() => re * .15), 6, 0, light, () => uv);
    capW(C, qy, fx, re * 1.06, lerp(.5, 1.75, l.lid || 0), 0, light, uv);
  }
}
// bearded dragon spines: the fringe down each flank, the beard, the spikes behind the jaw, two rows down the back
function lizSpikes(l, ex, light, an) {
  const L = l.L, rr = L * .06;
  const cone = (fr, a, len, r, back, out) => {
    const p = ringPt(fr, a, an), sa = Math.sin(a), ca = Math.cos(a);
    const d = norm3([fr.s[0] * sa * out + fr.u[0] * ca - fr.f[0] * back, fr.s[1] * sa * out + fr.u[1] * ca - fr.f[1] * back, fr.s[2] * sa * out + fr.u[2] * ca - fr.f[2] * back]);
    const b = [p[0] - d[0] * r, p[1] - d[1] * r, p[2] - d[2] * r];
    tube([b, [b[0] + d[0] * len * .5, b[1] + d[1] * len * .5, b[2] + d[2] * len * .5], [b[0] + d[0] * len, b[1] + d[1] * len, b[2] + d[2] * len]], [r, r * .5, r * .05], 5, .1, light, () => [fr.t * L, Math.sign(a) * Math.min(Math.abs(a), 1.45) * rr]);
  };
  const R = mulberry(77); for (let t = .17; t < .45; t += .0085 + R() * .006) { const fr = lizFrame(l, t, ex), k = (1 - Math.abs(t - .31) * 2.2) * (.55 + R() * .7); for (const sd of [-1, 1]) { cone(fr, sd * (1.86 + R() * .14), L * .018 * k, L * .005 * k, .3 + R() * .35, 1.25); if (R() < .45) cone(fr, sd * (1.62 + R() * .1), L * .01 * k, L * .0035 * k, .4, 1.1); } }
  for (let t = .045; t < .14; t += .007) { const fr = lizFrame(l, t, ex); for (let k = 0; k < 4; k++) { const a = (R() < .5 ? -1 : 1) * (2.35 + R() * .75); cone(fr, a, L * (.006 + R() * .007), L * .0028, .25, .7); } }
  for (const [t, a, k] of [[.095, 1.25, 1.1], [.108, 1.5, 1.35], [.118, 1.75, 1.25], [.128, 2.0, 1], [.10, .95, .75], [.088, 1.9, .9], [.112, 2.25, .8]]) { const fr = lizFrame(l, t, ex); for (const sd of [-1, 1]) cone(fr, sd * a, L * .03 * k, L * .0072 * k, .6, 1.1); }
  for (let t = .16; t < .5; t += .02) { const fr = lizFrame(l, t, ex); for (const sd of [-1, 1]) cone(fr, sd * .55, L * .009, L * .0034, .6, .6); }
}
// the anole's dewlap: a thin fan of throat skin
function lizDewlap(l, ex, light, an) {
  const d = l.dew || 0; if (d < .03) return; const L = l.L, n = 10, b0 = vN;
  for (let k = 0; k <= n; k++) {
    const t = lerp(.03, .15, k / n), fr = lizFrame(l, t, ex), p = ringPt(fr, Math.PI, an), drop = L * .062 * d * Math.pow(Math.sin(Math.PI * k / n), .75) * (1 - .35 * k / n);
    pushV(p[0], p[1] + 1, p[2], fr.s[0], 0, fr.s[2], k * 6, 0, 13, light);
    pushV(p[0] + fr.f[0] * drop * .2, p[1] - drop, p[2] + fr.f[2] * drop * .2, fr.s[0], 0, fr.s[2], k * 6, drop, 13, light);
  }
  for (let k = 0; k < n; k++) { const a = b0 + k * 2; I[iN++] = a; I[iN++] = a + 1; I[iN++] = a + 2; I[iN++] = a + 1; I[iN++] = a + 3; I[iN++] = a + 2; }
}
function buildLizardMesh(l) {
  const an = l.sp.an, L = l.L, sway = l.speed > 1 ? clamp(l.speed / L * 7, 0, 1) : 0;
  const litK = (x) => Math.min(1.25, (lampK(x) + .05) * dayK) + .08;
  const light = litK(l.nx[8]) * (cave && Math.hypot((l.nx[8] - cave.x) / cave.rx, (l.nz[8] - cave.z) / cave.rz) < .85 ? .18 : 1);
  // leopard geckos twitch the tail tip while they stalk
  const tw = l.state === 'hunt' && l.sp === SPECIES.gecko ? Math.sin(time * 16) * L * .016 : 0, bob = l.bob || 0, ph = l.phase;
  const ex = {
    sway: (t) => sway * Math.sin(t * 20.8 - ph) * L * .013 * (.5 + t * 1.2) + tw * sstep(.74, 1, t),
    lift: (t) => bob * L * .034 * sstep(.5, .06, t),
    swell: (t) => (1 + .022 * Math.sin(time * 1.9 + ph) * sstep(.14, .24, t) * sstep(.5, .36, t)) * (l.gulp > 0 ? 1 + .09 * Math.sin(l.gulp * 7) * Math.exp(-(((t - .14) / .05) ** 2)) : 1),
  };
  lizBody(l, ex, light, an);
  for (const leg of l.legs) lizLeg(l, leg, ex, light, an);
  lizEyes(l, ex, light, an);
  if (an.spikes) lizSpikes(l, ex, light, an);
  if (an.dewlap) lizDewlap(l, ex, light, an);
  if (l.tongue > 0 || l.state === 'strike') {
    const fr = lizFrame(l, .012, ex), m = madd(fr.P, fr.u, -fr.rv * .3, fr.f, 0), fx = fr.f[0], fz = fr.f[2], ext = l.state === 'strike' ? L * .08 : L * .10 * Math.sin(Math.min(1, l.tongue / .55) * Math.PI);
    tube([m, [m[0] + fx * ext * .5, m[1] - 1.5, m[2] + fz * ext * .5], [m[0] + fx * ext, m[1] - 3, m[2] + fz * ext]], [L * .006, L * .005, L * .0025], 6, 2, light);
  }
}
function buildCricketMesh(c) {
  const light = Math.min(1.25, (lampK(c.x) + .05) * dayK) + .08, base = alt(c.x, c.z) + c.y, cl = unit * .014 * c.s, a = c.a, fx = Math.cos(a), fz = Math.sin(a), sx = -fz, sz = fx, H = base + cl * .28, B = (t, y) => [c.x - fx * cl * t, H + y * cl, c.z - fz * cl * t];
  tube([B(-.95, .02), B(-.65, .08), B(-.1, .12), B(.6, .05), B(1.1, -.08), B(1.5, -.2)], [cl * .11, cl * .25, cl * .32, cl * .30, cl * .18, cl * .03], 7, 3, light, (i) => [i / 5, 0]);
  const hop = c.state === 'hop' ? .65 : 0;
  for (const s of [-1, 1]) { const hip = B(.5, .1), side = (k) => [fz * -1 * k * s * cl, 0, fx * k * s * cl]; const knee = [hip[0] + side(.58)[0] - fx * cl * .35, H + cl * (.85 + hop), hip[2] + side(.58)[2] - fz * cl * .35], foot = [hip[0] + side(.65)[0] - fx * cl * 1.45, base + cl * .05, hip[2] + side(.65)[2] - fz * cl * 1.45]; tube([hip, knee, foot], [cl * .08, cl * .06, cl * .02], 4, 4, light); for (const off of [-.25, .3]) { const hi = B(off, .08), ft = [hi[0] + side(.75)[0], base + cl * .02, hi[2] + side(.75)[2]]; tube([hi, ft], [cl * .05, cl * .02], 4, 4, light); }
    const head = B(-1, .04), tip = [head[0] + fx * cl * 1.6 + side(.5)[0], H + cl * .6, head[2] + fz * cl * 1.6 + side(.5)[2]]; tube([head, tip], [cl * .02, cl * .008], 3, 4, light); }
}
function stepCrickets(dt) {
  for (const c of crickets) {
    if (c.state === 'fall') { c.vy -= unit * 1.6 * dt; c.y += c.vy * dt; if (c.y <= 0) { c.y = 0; c.state = 'still'; c.t = rnd(.3, 2); } continue; }
    if (c.state === 'hop') { c.vy -= unit * 1.6 * dt; c.y += c.vy * dt; c.x += Math.cos(c.a) * c.spd * dt; c.z += Math.sin(c.a) * c.spd * dt; if (c.y <= 0) { c.y = 0; c.state = 'still'; c.t = rnd(.8, 5); } }
    else if (c.state === 'still') { c.t -= dt; if (c.t <= 0) { const scared = lizards.some(l => Math.hypot(l.nx[0] - c.x, l.nz[0] - c.z) < unit * .35) || turtles.some(t => Math.hypot(t.x - c.x, t.z - c.z) < unit * .1); if (scared || Math.random() < .8) { c.state = 'hop'; c.vy = unit * rnd(.32, .55); c.spd = unit * rnd(.2, .55); c.a = scared ? c.a + Math.PI + rnd(-.6, .6) : rnd(TAU); } else { c.t = rnd(1, 4); } } }
    c.x = clamp(c.x, 40, W - 40); c.z = clamp(c.z, depth * .38, depth * .97);
  }
  crickets = crickets.filter(c => !c.dead);
}
function dropCricket(x, screenY) { const z = clamp((screenY - yB) / KZ, depth * .46, depth * .9); const c = { x, z, y: clamp(floorY(z) - screenY, unit * .15, unit * .72), vy: 0, a: rnd(TAU), s: rnd(.85, 1.25), state: 'fall', spd: 0, t: 0 }; crickets.push(c); if (crickets.length > 24) crickets.shift(); }
function spawnDrops(cx, cy, n) { for (let i = 0; i < n; i++) { const a = rnd(TAU), rr = rnd(0, 1) * rnd(0, 1) * unit * .46; const r = rnd(1, 3) * rnd(1, 3.2) * unit / 1080; drops.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, r, vy: 0, hold: rnd(.4, 8) }); } if (drops.length > 2600) drops.splice(0, drops.length - 2600); }
function stepDrops(dt) {
  for (const d of drops) { d.hold -= dt; if (d.r > unit / 1080 * 2.4 && d.hold < 0 && d.vy === 0) d.vy = unit * rnd(.06, .3); if (d.vy > 0) { d.y += d.vy * dt; d.vy *= Math.exp(-dt * .2); d.r -= dt * .1; } d.r -= dt * .012; }
  drops = drops.filter(d => d.r > .35 && d.y < unit);
}

// ---- turtles. A rigid shell that never bends, with a telescoping neck, a jaw and four stumpy limbs doing all the moving.
// The body frame is forward (F), up (U), right (R); y=0 in that frame is the plane of the plastron.
let turtles = [], foods = [], ripples = [], pool = null, builtTurtle = false, snackFlip = 0;
function poolR(x, z) { const dx = (x - pool.x) / pool.rx, dz = (z - pool.z) / pool.rz, a = Math.atan2(dz, dx), s = pool.s; return Math.hypot(dx, dz) * (1 + .08 * Math.sin(2 * a + s * TAU) + .05 * Math.sin(3 * a + s * 9) + .03 * Math.sin(5 * a + s * 17)); }
const poolDep = (r) => pool.depth * sstep(1, .45, r);
// the floor a turtle stands on: rocks as usual, the pool bed where there is water
function gnd(x, z) { if (!pool) return alt(x, z); const r = poolR(x, z), a = alt(x, z); return r > 1.3 ? a : lerp(a, 0, sstep(1.25, .95, r)) - poolDep(r); }
const addRipple = (x, z, a) => { if (!pool || poolR(x, z) > 1) return; ripples.push({ x, z, r: 0, a }); if (ripples.length > 28) ripples.shift(); };
const ra = (cur, tgt, rate, dt) => cur + (tgt - cur) * (1 - Math.exp(-dt * rate));

function tFrame(t) {
  const ch = Math.cos(t.h), sh = Math.sin(t.h), cp = Math.cos(t.pitch), sp = Math.sin(t.pitch), cr = Math.cos(t.roll), sr = Math.sin(t.roll);
  t.F = [ch * cp, sp, sh * cp]; const U0 = [-ch * sp, cp, -sh * sp], s0 = [-sh, 0, ch];
  t.R = [s0[0] * cr + U0[0] * sr, U0[1] * sr, s0[2] * cr + U0[2] * sr];
  t.U = [U0[0] * cr - s0[0] * sr, U0[1] * cr, U0[2] * cr - s0[2] * sr];
}
const bodyToWorld = (t, a, b, c) => [t.x + t.F[0] * a + t.U[0] * b + t.R[0] * c, t.y + t.F[1] * a + t.U[1] * b + t.R[1] * c, t.z + t.F[2] * a + t.U[2] * b + t.R[2] * c];
const dirToWorld = (t, a, b, c) => [t.F[0] * a + t.U[0] * b + t.R[0] * c, t.F[1] * a + t.U[1] * b + t.R[1] * c, t.F[2] * a + t.U[2] * b + t.R[2] * c];
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

function newTurtle(sp, x, z) {
  const L = sp.len * unit * S.size, W2 = L * sp.wid;
  const t = { turtle: 1, sp, L, W: W2, x, z, y: 0, h: Math.random() < .5 ? 0 : Math.PI, pitch: 0, roll: 0, speed: 0, gait: rnd(1), state: 'pause', t: rnd(2, 5), warm: rnd(.35, .9), hunger: rnd(.2, .7), thirst: rnd(.1, .5), tx: x, tz: z, swim: 0, neck: .55, legK: 1, tail: 1, hinge: 0, limp: 0, splay: 0, jaw: 0, hy: 0, hp: .1, hp2: 0, hyT: 0, hpT: .1, lookT: rnd(1, 3), blink: 0, blinkT: rnd(2, 7), blinkLeft: 0, half: 0, bob: 0, bobLeft: 0, bobT: rnd(5, 14), gP: rnd(9), gular: .5, burst: rnd(2, 5), pauseLen: 1.5, wakeT: 0, wNeck: .55, wLeg: 1, wTail: 1, wHinge: 0, wLimp: 0, wSplay: 0, wJaw: 0, wHalf: 0, move: false, aim: null, food: null, bit: false, peek: 0, peeked: false, splash: 0, legs: [] };
  tFrame(t); t.y = gnd(x, z) + L * sp.leg;
  // diagonal pairs: front right with hind left, front left with hind right
  for (const [front, side, pair] of [[1, 1, 0], [1, -1, 1], [0, 1, 1], [0, -1, 0]]) { const leg = { front, side, pair, foot: [0, 0, 0], from: [0, 0, 0], sw: false, last: 0 }; const fp = turtleFootIdeal(t, leg); leg.foot = [fp[0], gnd(fp[0], fp[1]) + 1, fp[1]]; leg.from = leg.foot.slice(); t.legs.push(leg); }
  return t;
}
// where a foot wants to be on the ground, from the pose: standing, tucked, limp or splayed for basking
function turtleFootIdeal(t, leg, ahead = 0) {
  const L = t.L, W2 = t.W, front = leg.front, side = leg.side, hipX = (front ? .33 : -.33) * L;
  let bx = (front ? .41 : -.40) * L, bz = side * (front ? .57 : .55) * W2; const tk = 1 - t.legK;
  bx = lerp(bx, hipX * .62, tk); bz = lerp(bz, side * .20 * W2, tk);
  const limp = t.limp; bx += limp * (front ? .05 : -.05) * L; bz += side * limp * .14 * W2;
  if (!front && t.splay > 0) { bx = lerp(bx, -.72 * L, t.splay); bz = lerp(bz, side * .36 * W2, t.splay); }
  const ch = Math.cos(t.h), sh = Math.sin(t.h);
  return [t.x + ch * (bx + ahead) - sh * bz, t.z + sh * (bx + ahead) + ch * bz];
}
const footY = (t, x, z) => Math.max(gnd(x, z) + 1, t.y - t.L * (lerp(t.sp.leg + .09, .03, t.limp)));
const foodAlive = (f) => f && !f.dead && (f.isCricket ? true : f.bites > 0);
const foodY = (f) => f.isCricket ? alt(f.x, f.z) + (f.y || 0) + unit * .008 : f.ground + f.y + unit * .018;
const foodRad = (f) => f.isCricket ? 0 : (f.kind === 0 ? unit * .026 : unit * .05) * (.55 + .45 * (f.bites / f.maxB));
function reachExt(t, f) { const d = Math.hypot(f.x - t.x, f.z - t.z); return clamp((d - foodRad(f) - .42 * t.L - t.sp.head * t.L * .95) / (t.sp.neck * t.L), .25, 1.3); }
const turtleStop = (t, f) => t.L * (.42 + t.sp.neck * .78 + t.sp.head * .85) + (f ? foodRad(f) : 0);
function nearestFood(t) {
  let best = null, bd = 1e9;
  for (const f of foods) { if (f.fall || f.bites <= 0) continue; const d = Math.hypot(f.x - t.x, f.z - t.z); if (d < bd) { bd = d; best = f; } }
  if (best) return best;
  if (t.hunger < .12) return null;
  for (const c of crickets) { if (c.dead || c.state === 'fall') continue; const d = Math.hypot(c.x - t.x, c.z - t.z); if (d < unit * 1.1 && d < bd) { bd = d; best = c; } }
  if (best) best.isCricket = true;
  return best;
}
function biteFood(t, f) {
  if (f.isCricket) { const d = Math.hypot(f.x - t.x, f.z - t.z); if (d < turtleStop(t, f) * 1.22) { f.dead = true; t.hunger = Math.max(0, t.hunger - .3); t.food = null; } return; }
  f.bites--; f.bitA.push(Math.atan2(t.z - f.z, t.x - f.x) + rnd(-.5, .5)); t.hunger = Math.max(0, t.hunger - .14); if (f.ground < 0) addRipple(f.x, f.z, .7);
  if (f.bites <= 0) { f.dead = true; foods = foods.filter(x => x !== f); t.food = null; }
}
function startleTurtle(t) { t.state = 'retract'; t.t = .85; t.food = null; t.peek = 0; t.peeked = false; }

function thinkTurtle(t, dt) {
  const day = dayK > .35, p = lampK(t.x) * dayK, st = t.state, L = t.L;
  t.warm = clamp(t.warm + (p > .6 ? dt * .034 : -dt * .012), 0, 1); t.hunger = clamp(t.hunger + dt * .006, 0, 1); t.thirst = clamp(t.thirst + dt * .004, 0, 1);
  t.wNeck = .62; t.wLeg = 1; t.wTail = 1; t.wHinge = 0; t.wLimp = 0; t.wSplay = 0; t.wJaw = 0; t.wHalf = 0; t.move = false; t.aim = null; t.fastNeck = false;
  t.t -= dt;
  // pulled in: head first, then legs and tail, the hinge shuts, and a long wary wait
  if (st === 'retract') { const e = .85 - t.t; t.wNeck = 0; t.fastNeck = true; t.wLeg = e > .2 ? .02 : 1; t.wTail = e > .2 ? 0 : 1; t.wHinge = e > .25 ? 1 : 0; t.wHalf = 1; if (t.t < 0) { t.state = 'wary'; t.t = rnd(9, 18); } return; }
  if (st === 'wary') { t.wNeck = 0; t.wLeg = .02; t.wTail = 0; t.wHinge = 1; t.wHalf = 1; if (t.t < 0) { t.state = 'peek'; t.peek = 0; t.t = rnd(2.5, 4.5); } return; }
  if (st === 'peek') {
    t.wHalf = .2; t.lookWide = true;
    if (t.peek === 0) { t.wNeck = .24; t.wLeg = .05; t.wTail = .15; t.wHinge = .55; if (t.t < 0) { if (Math.random() < .4 && !t.peeked) { t.peeked = true; t.peek = -1; t.t = rnd(1.2, 2.2); } else { t.peek = 1; t.t = rnd(2.5, 4.5); } } }
    else if (t.peek === -1) { t.wNeck = .04; t.wLeg = .03; t.wTail = 0; t.wHinge = .9; t.fastNeck = true; if (t.t < 0) { t.peek = 0; t.t = rnd(2, 3.5); } }
    else if (t.peek === 1) { t.wNeck = .5; t.wLeg = .42; t.wTail = .5; t.wHinge = .15; if (t.t < 0) { t.peek = 2; t.t = rnd(2, 3.5); } }
    else { t.wNeck = .78; if (t.t < 0) { t.state = 'pause'; t.t = rnd(2, 5); } }
    return;
  }
  // eating: walk over, crane at it, lunge, chew, repeat
  if (st === 'crane') { const f = t.food; if (!foodAlive(f)) { t.food = null; t.state = 'pause'; t.t = rnd(1, 3); return; } t.aim = [f.x, foodY(f), f.z]; t.wNeck = reachExt(t, f) * .92; if (t.t < 0) { t.state = 'bite'; t.t = t.biteLen = f.isCricket ? .42 : .62; t.bit = false; } return; }
  if (st === 'bite') { const f = t.food; if (foodAlive(f)) t.aim = [f.x, foodY(f), f.z]; const b = 1 - t.t / t.biteLen, ext = foodAlive(f) ? reachExt(t, f) : .8; t.wNeck = ext * (1 + .34 * Math.sin(Math.PI * Math.min(1, b * 1.15))); t.fastNeck = true; t.wJaw = b < .62 ? 1 : 0; if (b > .6 && !t.bit) { t.bit = true; if (foodAlive(f)) biteFood(t, f); t.gulp = 1; } if (t.t < 0) { t.state = 'chew'; t.t = rnd(1.2, 1.9); } return; }
  if (st === 'chew') { t.wNeck = .82; t.hpT = .14; t.wJaw = .2 + .24 * Math.sin(time * 13); if (t.t < 0) { t.wJaw = 0; if (foodAlive(t.food)) { t.state = 'crane'; t.t = rnd(.5, 1.1); } else { t.food = null; t.state = 'pause'; t.t = rnd(2, 5); } } return; }
  if (st === 'toFood' || st === 'hunt') {
    const f = t.food; if (!foodAlive(f) || !day) { t.food = null; t.state = 'pause'; t.t = rnd(1, 3); return; }
    t.tx = f.x; t.tz = f.z; t.aim = [f.x, foodY(f), f.z]; t.wNeck = .8;
    const d = Math.hypot(f.x - t.x, f.z - t.z); if (d < turtleStop(t, f)) { t.state = 'crane'; t.t = st === 'hunt' ? .3 : rnd(.9, 1.7); } else t.move = true;
    return;
  }
  // anything edible nearby beats everything except fright
  if (day && st !== 'rest-hide') { const f = nearestFood(t); if (f) { t.food = f; t.state = f.isCricket ? 'hunt' : 'toFood'; return; } }
  if (t.state !== st) return;
  if (!day && (st === 'walk' || st === 'swim')) { t.state = 'pause'; t.t = 0; return; }
  const dT = Math.hypot(t.tx - t.x, t.tz - t.z);
  if (st === 'swim') {
    t.thirst = Math.max(0, t.thirst - dt * .08); t.move = true; t.wNeck = .7; t.hpT = .12;
    if (t.t < 0) { const side = t.x < pool.x ? -1 : 1, nx = pool.x + (Math.random() < .35 ? -side : side) * pool.rx * rnd(1.25, 1.5); pickTarget(t, nx, rnd(depth * .55, depth * .9)); t.state = 'walk'; return; }
    if (dT < L * .25) { const opp = t.x < pool.x ? 1 : -1; t.tx = clamp(pool.x + opp * pool.rx * rnd(.35, .62), 80, W - 80); t.tz = pool.z + rnd(-.42, .42) * pool.rz; }
    return;
  }
  if (st === 'walk' || st === 'bask' || st === 'hide') {
    t.move = true;
    if (dT < L * .22) { if (st === 'walk') { t.state = 'pause'; t.t = rnd(1.5, 6); } else { t.state = 'rest-' + st; t.t = st === 'bask' ? rnd(18, 50) : rnd(25, 80); t.splayPick = Math.random() < .6; } }
    return;
  }
  if (st === 'rest-bask') { t.wNeck = 1.05; t.wLeg = .4; t.wLimp = 1; t.wSplay = t.splayPick ? 1 : 0; t.wHalf = .62; t.wTail = 1.2; t.hpT = -.08; if (t.t < 0 || t.warm > .94) { t.state = 'pause'; t.t = rnd(2, 4); } return; }
  if (st === 'rest-hide') { t.wNeck = day ? .22 : 0; t.wLeg = day ? .4 : .05; t.wTail = day ? .3 : 0; t.wHinge = day ? 0 : .8; t.wHalf = day ? .4 : 1; if (t.t < 0 || (day && Math.random() < dt * .03)) { t.state = 'pause'; t.t = rnd(1, 3); } return; }
  if (st === 'pause' && t.t > 0) { t.wNeck = .85; t.lookWide = true; return; }
  // what next?
  t.lookWide = false;
  if (!day && cave) { pickTarget(t, cave.x + rnd(-.1, .1) * cave.rx, cave.z + rnd(-.1, .08) * cave.rz); t.state = 'hide'; return; }
  if (t.warm < .36 && bask) { pickTarget(t, bask.x + rnd(-.32, .32) * bask.rx, bask.z + rnd(-.05, .2) * bask.rz); t.state = 'bask'; return; }
  if (pool && (t.thirst > .55 || Math.random() < .3)) { t.tx = pool.x + rnd(-.5, .5) * pool.rx; t.tz = pool.z + rnd(-.4, .4) * pool.rz; t.state = 'swim'; t.t = rnd(16, 34); return; }
  if (cave && Math.random() < .08) { pickTarget(t, cave.x, cave.z + rnd(-.05, .12) * cave.rz); t.state = 'hide'; return; }
  const span = Math.random() < .5 ? rnd(.6, 1.6) * unit : rnd(.2, .55) * unit; pickTarget(t, t.x + (Math.random() < .5 ? -1 : 1) * span, rnd(depth * .46, depth * .92)); t.state = 'walk';
}

function stepTurtle(t, dt) {
  thinkTurtle(t, dt);
  const L = t.L, sp = t.sp, st = t.state;
  const water = pool ? poolDep(poolR(t.x, t.z)) : 0, sub = L * (.08 + sp.dome * .18), swimT = sstep(sub * .9, sub * 1.7, water), wasSwim = t.swim;
  t.swim = ra(t.swim, swimT, 2.2, dt); if ((wasSwim < .5) !== (t.swim < .5)) { addRipple(t.x, t.z, 1); addRipple(t.x + Math.cos(t.h) * L * .4, t.z + Math.sin(t.h) * L * .4, .8); }
  // steering, in short bouts with pauses: the shell is heavy
  const swimming = t.swim > .5; let spd = 0, turning = 0;
  if (t.move) {
    const dx = t.tx - t.x, dz = t.tz - t.z, d = Math.hypot(dx, dz) || 1, want = Math.atan2(dz, dx), off = angDiff(want, t.h), rate = swimming ? 1.2 : .85;
    if (d > L * .14) t.h += clamp(off, -dt * rate, dt * rate); turning = Math.abs(off);
    t.burst -= dt; if (t.burst < -t.pauseLen) { t.burst = rnd(2.4, 6.5); t.pauseLen = rnd(.8, 3); }
    const rest = t.burst < 0 && !swimming && st !== 'hunt' && st !== 'toFood';
    if (rest) { t.wNeck = .9; t.lookWide = true; } else t.lookWide = false;
    const base = L * (swimming ? sp.swim : sp.walk);
    spd = rest ? 0 : base * sstep(.2, .9, Math.cos(clamp(off, -1.5, 1.5)) + .35);
  }
  t.speed = ra(t.speed, spd, swimming ? 2.5 : 5, dt);
  // gait: the phase runs with distance, diagonal pairs swing in turn, one pair always planted and pushing
  const walking = t.move && !swimming, swingInFlight = t.legs.some(l => l.sw);
  let rate = t.speed / (.30 * L); if (walking && turning > .22 && t.burst >= 0) rate = Math.max(rate, .55); if (!walking && swingInFlight) rate = Math.max(rate, .8);
  t.gait = (t.gait + rate * dt) % 1;
  const push = walking ? .62 + .58 * Math.pow(Math.sin(TAU * t.gait), 2) : 1, strokeK = swimming ? .72 + .5 * Math.pow(Math.sin(TAU * t.gait), 2) : 1;
  t.x += Math.cos(t.h) * t.speed * dt * push * strokeK; t.z += Math.sin(t.h) * t.speed * dt * push * strokeK;
  t.x = clamp(t.x, 40, W - 40); t.z = clamp(t.z, depth * .40, depth * .90);
  // pose
  t.neck = ra(t.neck, t.wNeck, t.fastNeck ? (t.wNeck < t.neck ? 14 : 16) : (t.wNeck < t.neck ? 4 : 1.3), dt);
  t.legK = ra(t.legK, t.wLeg, t.wLeg < t.legK ? 7 : 1.1, dt); t.tail = ra(t.tail, t.wTail, t.wTail < t.tail ? 7 : 1.3, dt); t.hinge = ra(t.hinge, t.wHinge, 5, dt); t.limp = ra(t.limp, t.wLimp, .9, dt); t.splay = ra(t.splay, t.wSplay, .7, dt); t.jaw = ra(t.jaw, t.wJaw, 18, dt); t.half = ra(t.half, t.wHalf, 3, dt);
  // the shell's stance: sits on the ground when pulled in, carried on the legs otherwise, floats in water
  const G = (bx, bz) => gnd(t.x + Math.cos(t.h) * bx - Math.sin(t.h) * bz, t.z + Math.sin(t.h) * bx + Math.cos(t.h) * bz);
  const gF = G(L * .36, 0), gB = G(-L * .36, 0), gL = G(0, -t.W * .42), gR = G(0, t.W * .42), g0 = lerp((gF + gB + gL + gR) / 4, Math.max(G(0, 0), (gF + gB + gL + gR) / 4), .35);
  const yWalk = g0 + lerp(L * .012, sp.leg * L, t.legK), bob = Math.sin(time * 1.7) * unit * .0035, yFloat = -sub + bob;
  const moveK = walking ? clamp(t.speed / (L * sp.walk * .6), 0, 1) : 0;
  const gaitPitch = Math.sin(TAU * 2 * t.gait) * .018 * moveK, gaitRoll = Math.sin(TAU * t.gait) * .034 * moveK, gaitLift = Math.pow(Math.sin(TAU * 2 * t.gait), 2) * L * .006 * moveK;
  const pitchG = clamp(Math.atan2(gF - gB, L * .72), -.42, .42), rollG = clamp(Math.atan2(gR - gL, t.W * .84), -.2, .2);
  const yTgt = lerp(yWalk + gaitLift, yFloat, t.swim), pTgt = lerp(pitchG + gaitPitch, .07 + .025 * Math.sin(TAU * 2 * t.gait), t.swim), rTgt = lerp(rollG + gaitRoll, Math.sin(TAU * t.gait) * .04, t.swim);
  t.y = ra(t.y, yTgt, t.legK < .5 ? 9 : 5, dt); t.pitch = ra(t.pitch, pTgt, 5, dt); t.roll = ra(t.roll, rTgt, 6, dt); tFrame(t);
  // head: aim at food, otherwise look around
  t.lookT -= dt; if (t.lookT < 0) { t.lookT = rnd(1.5, 4); const wide = t.lookWide || st === 'pause' || st === 'peek'; t.hyT = rnd(-1, 1) * (wide ? .85 : .32); t.hpT = st === 'swim' ? rnd(.04, .18) : rnd(-.1, .34); }
  if (t.aim) { const O = bodyToWorld(t, .42 * L, (sp.rim + .02) * L, 0), d = [t.aim[0] - O[0], t.aim[1] - O[1], t.aim[2] - O[2]], f = d[0] * t.F[0] + d[1] * t.F[1] + d[2] * t.F[2], r = d[0] * t.R[0] + d[1] * t.R[1] + d[2] * t.R[2], u = d[0] * t.U[0] + d[1] * t.U[1] + d[2] * t.U[2]; t.hyT = clamp(Math.atan2(r, f), -1.3, 1.3); t.hpT = clamp(Math.atan2(u, Math.hypot(f, r)), -.85, .7); }
  const headRate = t.aim ? 3.2 : 1.4;
  t.hy = ra(t.hy, t.hyT * clamp(t.neck * 1.6, 0, 1), headRate, dt); t.hp = ra(t.hp, t.hpT, headRate, dt); t.hp2 = ra(t.hp2, st === 'chew' ? .12 : st === 'bite' ? -.1 : 0, 6, dt);
  // blinks are slow and the throat never quite stops
  t.blinkT -= dt; if (t.blinkT < 0 && t.blinkLeft <= 0) { t.blinkLeft = 1.05; t.blinkT = rnd(3, 9); } if (t.blinkLeft > 0) t.blinkLeft -= dt;
  const bk = t.blinkLeft > 0 ? Math.sin(Math.PI * (1 - t.blinkLeft / 1.05)) : 0; t.blink = Math.max(bk, t.half);
  t.gP += dt * (st === 'rest-bask' ? 1.1 : 2.1); t.gular = .5 + .5 * Math.sin(t.gP * TAU) ; if (t.gulp > 0) t.gulp -= dt;
  // occasional head bobs when it is standing about
  t.bobT -= dt; if (t.bobT < 0 && t.neck > .5 && (st === 'pause' || st === 'rest-bask' || st === 'peek')) { t.bobT = rnd(6, 15); t.bobLeft = 1.5; } if (t.bobLeft > 0) { t.bobLeft -= dt; t.bob = Math.sin((1 - t.bobLeft / 1.5) * TAU * 3) * L * .045 * Math.min(1, t.bobLeft * 3); } else t.bob = 0;
  // feet
  const stride = .135 * L, posing = t.legK < .9 || t.limp > .08 || t.splay > .05;
  for (const leg of t.legs) {
    const front = leg.front, side = leg.side, p = (t.gait + leg.pair * .5) % 1, sw = .42;
    if (t.swim > .08) {
      // paddling: a long power stroke out to the side, a feathered recovery tucked in
      const ps = p < .55, cyc = ps ? Math.cos(Math.PI * p / .55) : -Math.cos(Math.PI * (p - .55) / .45), range = (front ? .30 : .22) * L;
      const out = ps ? .2 : .07, sideW = (front ? .5 : .46) * t.W + L * out * (front ? 1 : .8), dip = ps ? -.08 : -.03, tuck = 1 - t.legK;
      const fb = bodyToWorld(t, (front ? .34 : -.36) * L + cyc * range * (1 - tuck), lerp(L * dip, L * .04, tuck), side * lerp(sideW, .22 * t.W, tuck));
      for (let q = 0; q < 6 && pool && poolR(fb[0], fb[2]) > .9; q++) { fb[0] = lerp(fb[0], t.x, .22); fb[2] = lerp(fb[2], t.z, .22); }
      const stroke = t.speed > L * .08 || t.move; const land = turtleFootIdeal(t, leg), ground = [land[0], gnd(land[0], land[1]) + 1, land[1]];
      const dest = (stroke || tuck > .4) ? lerp3(ground, fb, Math.min(1, t.swim * 1.4)) : lerp3(ground, bodyToWorld(t, (front ? .4 : -.4) * L, -L * .06, side * .7 * t.W), Math.min(1, t.swim * 1.4));
      leg.foot = lerp3(leg.foot, dest, 1 - Math.exp(-dt * 12)); leg.sw = false;
      if (t.swim > .5 && stroke && p < leg.last) addRipple(leg.foot[0], leg.foot[2], .55);
      leg.last = p;
      continue;
    }
    if (walking && !posing) {
      if (p < sw) {
        if (!leg.sw) { leg.sw = true; leg.from = leg.foot.slice(); }
        const e = sstep(0, 1, p / sw), fp = turtleFootIdeal(t, leg, stride * .78), gy = footY(t, fp[0], fp[1]);
        leg.foot = [lerp(leg.from[0], fp[0], e), lerp(leg.from[1], gy, e) + Math.sin(e * Math.PI) * L * .07, lerp(leg.from[2], fp[1], e)];
      } else { leg.sw = false; leg.foot[1] = ra(leg.foot[1], footY(t, leg.foot[0], leg.foot[2]), 16, dt); }
      leg.last = p;
      continue;
    }
    // standing still or changing pose: no gait, the foot just settles toward where the pose wants it
    if (leg.sw) { const fp = turtleFootIdeal(t, leg); const e = sstep(0, 1, Math.min(1, (p < sw ? p / sw : 1))), gy = footY(t, fp[0], fp[1]); leg.foot = [lerp(leg.from[0], fp[0], e), lerp(leg.from[1], gy, e) + Math.sin(e * Math.PI) * L * .07, lerp(leg.from[2], fp[1], e)]; if (p >= sw - .001) leg.sw = false; }
    else if (posing) { const fp = turtleFootIdeal(t, leg), rate2 = t.legK < .5 ? 8 : 2.2; leg.foot[0] = ra(leg.foot[0], fp[0], rate2, dt); leg.foot[2] = ra(leg.foot[2], fp[1], rate2, dt); leg.foot[1] = ra(leg.foot[1], footY(t, leg.foot[0], leg.foot[2]), 16, dt); }
    else leg.foot[1] = ra(leg.foot[1], footY(t, leg.foot[0], leg.foot[2]), 16, dt);
    leg.last = p;
  }
  // wake: rings off the nose while under way, a little more when it speeds up
  if (t.swim > .4 && pool) { t.wakeT -= dt * (t.speed / (L * .4) + .25); if (t.wakeT < 0) { t.wakeT = 1; addRipple(t.x + Math.cos(t.h) * L * .55, t.z + Math.sin(t.h) * L * .55, .5); } }
}
function stepRipples(dt) { for (const r of ripples) { r.r += dt * unit * .13; r.a *= Math.exp(-dt * 1.15); } ripples = ripples.filter(r => r.a > .03); }
function stepFoods(dt) { for (const f of foods) { if (f.fall) { f.vy -= unit * 1.6 * dt; f.y += f.vy * dt; if (f.y <= 0) { f.y = 0; f.fall = false; if (f.ground < 0) addRipple(f.x, f.z, 1); } } } }
function dropSnack(x, screenY) {
  const z = clamp((screenY - yB) / KZ, depth * .46, depth * .92), ground = Math.max(gnd(x, z), pool && poolR(x, z) < .98 ? 0 : -1e9), kind = (snackFlip++) % 2, maxB = kind === 0 ? 4 : 5;
  foods.push({ x, z, ground, y: clamp(floorY(z) - screenY, unit * .18, unit * .7), vy: 0, fall: true, kind, bites: maxB, maxB, a: rnd(TAU), bitA: [], bob: rnd(9) }); if (foods.length > 8) foods.shift();
}

// ---- turtle meshes
function ellW(C, A, B, D, ra2, rb, rd, mat, light, uv, n = 8, m = 14) {
  const base = vN;
  for (let j = 0; j <= n; j++) { const th = Math.PI * j / n, st = Math.sin(th), ct = Math.cos(th); for (let i = 0; i <= m; i++) { const ph = TAU * i / m, x = st * Math.cos(ph), y = ct, z = st * Math.sin(ph); const px = C[0] + A[0] * x * ra2 + B[0] * y * rb + D[0] * z * rd, py = C[1] + A[1] * x * ra2 + B[1] * y * rb + D[1] * z * rd, pz = C[2] + A[2] * x * ra2 + B[2] * y * rb + D[2] * z * rd; const n0 = norm3([A[0] * x / ra2 + B[0] * y / rb + D[0] * z / rd, A[1] * x / ra2 + B[1] * y / rb + D[1] * z / rd, A[2] * x / ra2 + B[2] * y / rb + D[2] * z / rd]); const u2 = uv ? uv(x, y, z, th, ph) : [x, z]; pushV(px, py, pz, n0[0], n0[1], n0[2], u2[0], u2[1], mat, light); } }
  for (let j = 0; j < n; j++) ringIdx(base + j * (m + 1), base + (j + 1) * (m + 1), m);
}
// a spherical cap around an axis, used for the eyelids
function capW(C, axis, up2, r, thetaMax, mat, light, uv) {
  const a = norm3(axis), u = norm3(cross3(a, up2)), v = cross3(a, u), n = 6, m = 16, base = vN;
  for (let j = 0; j <= n; j++) { const th = thetaMax * j / n, st = Math.sin(th), ct = Math.cos(th); for (let i = 0; i <= m; i++) { const ph = TAU * i / m, nx = a[0] * ct + (u[0] * Math.cos(ph) + v[0] * Math.sin(ph)) * st, ny = a[1] * ct + (u[1] * Math.cos(ph) + v[1] * Math.sin(ph)) * st, nz = a[2] * ct + (u[2] * Math.cos(ph) + v[2] * Math.sin(ph)) * st; pushV(C[0] + nx * r, C[1] + ny * r, C[2] + nz * r, nx, ny, nz, uv[0], uv[1], mat, light); } }
  for (let j = 0; j < n; j++) ringIdx(base + j * (m + 1), base + (j + 1) * (m + 1), m);
}
// the carapace once per species at unit size: dome, flared margin and a lip curling under, normals by finite difference
function shellGeo(sp) {
  if (sp.geo) return sp.geo;
  const rs = [0, .06, .14, .24, .36, .48, .6, .72, .8, .86, .9, .93, .96, .985, 1, 1.008, 1.0, .94, .86], I = 72, J = rs.length - 1, W2 = sp.wid, rim = sp.rim, H = sp.dome;
  const dome = (r, c) => { const k = Math.pow(Math.max(0, 1 - Math.pow(r / 1.02, 2.4)), .58); return H * k * (1 - .1 * c * r); };
  const pos = (j, i) => {
    const th = i / I * TAU, c = Math.cos(th), s = Math.sin(th), r = rs[j], under = j >= 15;
    const serr = sp.web && r >= .9 && c < -.05 ? 1 + .018 * Math.abs(Math.sin(th * 11)) : 1;
    const rr = Math.min(r, 1.01) * serr, x = rr * c * .5, z = rr * s * W2 * .5 * (1 - .05 * c);
    let y; if (under) y = rim - (j === 15 ? .012 : .022); else { const keel = sp.web ? 0 : .018 * (1 - r * r) * Math.exp(-s * s * r * r * 30); y = r < .84 ? rim + dome(r, c) + keel : rim + dome(.84, c) * Math.pow(Math.max(0, 1 - (r - .84) / .16), 1.3) + (sp.web ? .012 * sstep(.86, 1, r) * (c < 0 ? 1 : .3) : 0); }
    return [x, y, z, r * c, r * s];
  };
  const P = []; for (let j = 0; j <= J; j++) for (let i = 0; i <= I; i++) P.push(pos(j, i));
  const at = (j, i) => P[clamp(j, 0, J) * (I + 1) + ((i + I) % I)];
  const N = []; for (let j = 0; j <= J; j++) for (let i = 0; i <= I; i++) { const dA = at(j, i + 1), dB = at(j, i - 1), dC = at(j + 1, i), dD = at(j - 1, i); const a = [dA[0] - dB[0], dA[1] - dB[1], dA[2] - dB[2]], b = [dC[0] - dD[0], dC[1] - dD[1], dC[2] - dD[2]]; let n = norm3(cross3(a, b)); const p = at(j, i), out = [p[0], p[1] - .1, p[2]]; if (j === 0) n = [0, 1, 0]; else if (j >= 15) n = [n[0], -Math.abs(n[1]), n[2]]; else if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = [-n[0], -n[1], -n[2]]; N.push(n); }
  return sp.geo = { P, N, I, J };
}
function buildTurtleMesh(t) {
  tFrame(t);
  const L = t.L, W2 = t.W, sp = t.sp, geo = shellGeo(sp), F = t.F, U = t.U, R = t.R, B = (a, b, c) => bodyToWorld(t, a * L, b * L, c * W2);
  const litK = Math.min(1.25, (lampK(t.x) + .05) * dayK) + .08, inCave = cave && Math.hypot((t.x - cave.x) / cave.rx, (t.z - cave.z) / cave.rz) < .85;
  const light = litK * (inCave ? .18 : 1), lowLight = light * .62;
  const base = vN;
  for (let k = 0; k < geo.P.length; k++) { const p = geo.P[k], n = geo.N[k], a = p[0] * L, b = p[1] * L, c = p[2] * L; pushV(t.x + F[0] * a + U[0] * b + R[0] * c, t.y + F[1] * a + U[1] * b + R[1] * c, t.z + F[2] * a + U[2] * b + R[2] * c, F[0] * n[0] + U[0] * n[1] + R[0] * n[2], F[1] * n[0] + U[1] * n[1] + R[1] * n[2], F[2] * n[0] + U[2] * n[1] + R[2] * n[2], p[3], p[4], 5, light); }
  for (let j = 0; j < geo.J; j++) ringIdx(base + j * (geo.I + 1), base + (j + 1) * (geo.I + 1), geo.I);
  // plastron, hinged on the box turtle so it can shut
  { const J2 = 6, I2 = 56, b0 = vN, hinge = sp.web ? t.hinge * .15 : t.hinge, ps = [0, .35, .6, .78, .9, .965, 1];
    for (let j = 0; j <= J2; j++) for (let i = 0; i <= I2; i++) { const th = i / I2 * TAU, c = Math.cos(th), s = Math.sin(th), r = ps[j] * .985, a = r * c * .5 * L, zz = r * s * W2 * .5 * .94, edge = r * r, yy = (sp.rim * .55 * edge * edge + .008) * L; const liftMax = sp.rim * .42 * L * hinge; let lift = 0; if (a > .1 * L) lift = (a - .1 * L) / (.4 * L) * liftMax; else if (a < -.17 * L) lift = (-.17 * L - a) / (.33 * L) * liftMax * .35; const nOut = r * r; const nw = norm3([F[0] * c * nOut * .8 + U[0] * (-1 + nOut * .4) + R[0] * s * nOut * .8, F[1] * c * nOut * .8 + U[1] * (-1 + nOut * .4) + R[1] * s * nOut * .8, F[2] * c * nOut * .8 + U[2] * (-1 + nOut * .4) + R[2] * s * nOut * .8]); const w = bodyToWorld(t, a, yy + lift, zz); pushV(w[0], w[1], w[2], nw[0], nw[1], nw[2], r * c, r * s, 8, lowLight * 1.15); }
    for (let j = 0; j < J2; j++) ringIdx(b0 + j * (I2 + 1), b0 + (j + 1) * (I2 + 1), I2); }
  // soft dark body filling the gap between the shells
  ellW(B(0, .115, 0), F, U, R, .44 * L, .1 * L, .44 * W2, 6, lowLight * .55, (x, y, z) => [(x + 1) * L * .3, z * L * .3]);
  // neck: telescopes out of the shell along a bent line
  const cp = Math.cos(t.hp), sn = Math.sin(t.hp), cy = Math.cos(t.hy), sy = Math.sin(t.hy), nd = [cy * cp, sn, sy * cp], neckY = sp.rim + .02, ext = t.neck, len = sp.neck;
  const O = [.42, neckY, 0], RB = [.09, neckY * .85, 0], tipB = [lerp(RB[0], O[0] + nd[0] * len, ext), lerp(RB[1], O[1] + nd[1] * len, ext) + t.bob / L, lerp(RB[2], O[2] + nd[2] * len, ext) * (L / W2)];
  const A0 = [.02, neckY * .9, 0], neckPts = [], neckRad = [], ns = 9;
  for (let i = 0; i <= ns; i++) { const k = i / ns, q = lerp3(lerp3(A0, O, k), lerp3(O, tipB, k), k); neckPts.push(B(q[0], q[1], q[2])); const r = lerp(.098, .084, k) * L * (1 + .07 * Math.sin(i * 2.6) * (1 - k * .6)); neckRad.push([r * .92, r * 1.1]); }
  tube(neckPts, neckRad, 10, 6, light * .92, (i, a2, r) => [i * r * 1.6, a2 * r]);
  const tip = B(tipB[0], tipB[1], tipB[2]);
  // head frame
  const hpTot = t.hp + t.hp2, cph = Math.cos(hpTot), snh = Math.sin(hpTot), hF = norm3(dirToWorld(t, cy * cph, snh, sy * cph)), hR = norm3([-hF[2], 0, hF[0]]), hU = norm3(cross3(hR, hF));
  const HL = sp.head * L, hw = HL * .37, hh = HL * .31, Pt = (a, b, c) => [tip[0] + hF[0] * a * HL + hU[0] * b * hh + hR[0] * c * hw, tip[1] + hF[1] * a * HL + hU[1] * b * hh + hR[1] * c * hw, tip[2] + hF[2] * a * HL + hU[2] * b * hh + hR[2] * c * hw];
  { const ts = [-.05, .16, .42, .68, .88, .98, 1.04], up = [.72, .95, 1, .84, .6, .42, .18], sd = [.7, 1, 1, .78, .5, .3, .12], pts = ts.map((a, i) => Pt(a, i > 3 ? .1 : .06, 0)), rads = ts.map((a, i) => [up[i] * hh, sd[i] * hw]); tube(pts, rads, 12, 7, light, (i, a2) => [i / (ts.length - 1), a2]); }
  // lower jaw, hinged; the lunge and the chewing are all here
  const jawA = t.jaw * .62, jd = [hF[0] * Math.cos(jawA) - hU[0] * Math.sin(jawA), hF[1] * Math.cos(jawA) - hU[1] * Math.sin(jawA), hF[2] * Math.cos(jawA) - hU[2] * Math.sin(jawA)], jb = Pt(.2, -.68, 0);
  { const pts = [], rads = [], ks = [0, .32, .62, .86, 1.0], rk = [.62, .66, .6, .42, .14]; ks.forEach((k, i) => { pts.push([jb[0] + jd[0] * HL * k * .8, jb[1] + jd[1] * HL * k * .8, jb[2] + jd[2] * HL * k * .8]); rads.push([rk[i] * hh * .5, rk[i] * hw * .92]); }); tube(pts, rads, 10, 7, light, (i, a2) => [.5 + i * .1, a2 + Math.PI]); }
  if (t.jaw > .05) ellW(Pt(.4, -.34, 0), hF, hU, hR, HL * .28 * Math.min(1, t.jaw * 2.5), hh * .34, hw * .6, 10, light, null, 5, 10);
  // throat, pulsing, swelling after a swallow
  const gulp = t.gulp > 0 ? t.gulp : 0, throat = hh * (.62 + .16 * t.gular + .3 * gulp);
  ellW(Pt(.14, -.62, 0), hF, hU, hR, HL * .24, throat * .75, hw * .78, 7, light, (x, y, z, th) => [.28, th * 2], 6, 12);
  // eyes with real lids: the lower lid rises to shut a turtle's eye
  const blink = t.blink;
  for (const s of [-1, 1]) {
    const e = hw * .34, Cc = Pt(.6, .46, s * .86), out = norm3([hR[0] * s * .9 + hF[0] * .34 + hU[0] * .28, hR[1] * s * .9 + hF[1] * .34 + hU[1] * .28, hR[2] * s * .9 + hF[2] * .34 + hU[2] * .28]);
    const upv = norm3([hU[0] - out[0] * (hU[0] * out[0] + hU[1] * out[1] + hU[2] * out[2]), hU[1] - out[1] * (hU[0] * out[0] + hU[1] * out[1] + hU[2] * out[2]), hU[2] - out[2] * (hU[0] * out[0] + hU[1] * out[1] + hU[2] * out[2])]), rt = cross3(upv, out);
    ellW(Cc, rt, out, upv, e, e, e, 1, light, (x, y, z) => [x, z], 8, 14);
    capW(Cc, upv, out, e * 1.2, lerp(.42, 1.42, blink), 7, light, [.6, 1.6 * s]);
    capW(Cc, [-upv[0], -upv[1], -upv[2]], out, e * 1.17, lerp(.74, 2.0, blink), 7, light, [.58, 2.2 * s]);
  }
  for (const s of [-1, 1]) ellW(Pt(1, .3, s * .22), hF, hU, hR, hw * .08, hw * .08, hw * .08, 10, light * .3, null, 4, 6);
  // tail
  { const out2 = clamp(t.tail, 0, 1.2), a0 = B(-.46, .075, 0), d = dirToWorld(t, -1, -.28, .08 * Math.sin(time * .9)), Lt = L * (sp.web ? .24 : .17) * out2, pts = [], rads = []; for (let i = 0; i <= 6; i++) { const k = i / 6; pts.push([a0[0] + d[0] * Lt * k, a0[1] + d[1] * Lt * k, a0[2] + d[2] * Lt * k]); rads.push(lerp(.06, .006, k) * L); } tube(pts, rads, 7, 6, lowLight, (i, a2, r) => [i * r * 2, a2 * r]); }
  // limbs: stumpy, scaly, clawed
  const up0 = [0, 1, 0];
  for (const leg of t.legs) {
    const front = leg.front, s2 = leg.side, hip = B(front ? .33 : -.33, .07, s2 * .34), Ft = leg.foot, sideDir = norm3([R[0] * s2, 0, R[2] * s2]);
    const kneeOut = lerp(.06, front ? .19 : .16, t.legK) * L, kneeUp = lerp(.03, .08, t.legK) * L * (1 - t.limp * .7), mid = lerp3(hip, Ft, .52), knee = [mid[0] + sideDir[0] * kneeOut, Math.max(hip[1], Ft[1]) + kneeUp, mid[2] + sideDir[2] * kneeOut];
    const pts = [], rads = [], r0 = (front ? .1 : .115) * L * sp.limb, r1 = .062 * L * sp.limb;
    for (let i = 0; i <= 8; i++) { const k = i / 8; pts.push(lerp3(lerp3(hip, knee, k), lerp3(knee, Ft, k), k)); rads.push(lerp(r0, r1, k * k * .4 + k * .6)); }
    tube(pts, rads, 9, 6, lowLight * 1.2, (i, a2, r) => [i * r * 1.4 + 333, a2 * r]);
    const fa = front ? [F[0] * .72 + R[0] * s2 * .7, F[2] * .72 + R[2] * s2 * .7] : [-F[0] * .5 + R[0] * s2 * .86, -F[2] * .5 + R[2] * s2 * .86], fl = Math.hypot(fa[0], fa[1]) || 1, fd = [fa[0] / fl, 0, fa[1] / fl], fs = [-fd[2], 0, fd[0]], padL = sp.pad * L, flat = t.swim > .5 ? .22 : .42;
    const C = [Ft[0], Ft[1] + padL * flat * .9, Ft[2]];
    ellW(C, fd, up0, fs, padL * 1.15, padL * flat, padL * .92, 6, lowLight * 1.25, (x, y, z) => [(x + 1) * padL * .8 + 111, z * padL * .8]);
    const n = sp.claws; for (let c = 0; c < n; c++) { const fan = n > 1 ? lerp(-.72, .72, c / (n - 1)) : 0, ca = Math.cos(fan), sa = Math.sin(fan), dir = [fd[0] * ca + fs[0] * sa, fd[2] * ca + fs[2] * sa], b0 = [C[0] + dir[0] * padL * .86, C[1] - padL * flat * .2, C[2] + dir[1] * padL * .86], cl = L * (front ? .055 : .042) * (sp.web && front ? 1.5 : 1), e0 = [b0[0] + dir[0] * cl, b0[1] - cl * .32, b0[2] + dir[1] * cl]; tube([b0, [lerp(b0[0], e0[0], .55), b0[1] - cl * .06, lerp(b0[2], e0[2], .55)], e0], [L * .018, L * .013, L * .003], 5, 9, light); }
  }
}
function buildFoodMesh(f) {
  const light = Math.min(1.25, (lampK(f.x) + .05) * dayK) + .08, yy = f.ground + f.y + (f.ground >= 0 && f.ground < 1e-3 ? .5 : 0) + (f.ground === 0 && !f.fall ? Math.sin(time * 1.5 + f.bob) * unit * .002 : 0), k = f.bites / f.maxB;
  if (f.kind === 0) { // strawberry on its side, smaller with every bite
    const s = unit * .03 * (.42 + .58 * k), cx = Math.cos(f.a), cz = Math.sin(f.a), P0 = (a, y2) => [f.x + cx * a * s, yy + y2 * s, f.z + cz * a * s], ks = [-1.05, -.7, -.15, .4, .85, 1.05], rr = [.3, .9, 1.12, .95, .55, .05], pts = ks.map((a, i) => P0(a, rr[i] * .9)), rads = rr.map(r => [r * s * .86, r * s]);
    tube(pts, rads, 14, 11, light, (i, a2, r) => [i / 5 * 2, a2 * 1.4]);
    const stem = P0(-1.12, .62), ax = [-cx, 0, -cz]; ellW(stem, ax, [0, 1, 0], [-cz, 0, cx], s * .28, s * .2, s * .46, 12, light, (x, y, z, th, ph) => [.8, ph], 5, 10);
  } else { // a frilled lettuce leaf lying flat, bitten from the side the turtle came from
    const n = 10, m = 96, base = vN, R0 = unit * .07 * (.5 + .5 * k), ca = Math.cos(f.a), sa = Math.sin(f.a);
    for (let j = 0; j <= n; j++) for (let i = 0; i <= m; i++) { const th = i / m * TAU, r0 = j / n; let cut = 1; for (const b of f.bitA) cut *= 1 - .55 * Math.pow(Math.max(0, Math.cos(th - b)), 5); const w = (.84 + .1 * Math.sin(th * 2 + f.bob) + .05 * Math.sin(th * 5 + f.bob * 2) + .018 * Math.sin(th * 17)) * cut, r = R0 * r0 * w * (1 + .16 * Math.cos(th)), x2 = Math.cos(th), z2 = Math.sin(th), fr = r0 * r0 * r0 * R0 * (.09 * Math.sin(th * 9 + f.bob * 3) + .05 * Math.sin(th * 15 + 1.4)); pushV(f.x + x2 * r * ca - z2 * r * .62 * sa, yy + R0 * .05 + fr + R0 * .04 * r0 * r0, f.z + x2 * r * sa + z2 * r * .62 * ca, 0, 1, 0, r0, th, 12, light); }
    for (let j = 0; j < n; j++) ringIdx(base + j * (m + 1), base + (j + 1) * (m + 1), m);
  }
}
function turtlePose(t) { const fp = []; for (const l of t.legs) fp.push(l.foot[0], l.foot[1], l.foot[2]); return [t.x, t.z, t.y, t.h, t.pitch, t.roll, t.swim, t.neck, t.hy, t.hp, t.hp2, t.jaw, t.blink, t.legK, t.tail, t.hinge, t.limp, t.gular, t.bob, t.gulp || 0, t.state, ...fp]; }
function applyTurtlePose(t, a) { [t.x, t.z, t.y, t.h, t.pitch, t.roll, t.swim, t.neck, t.hy, t.hp, t.hp2, t.jaw, t.blink, t.legK, t.tail, t.hinge, t.limp, t.gular, t.bob, t.gulp, t.state] = a; t.legs.forEach((l, i) => { l.foot = [a[21 + i * 3], a[22 + i * 3], a[23 + i * 3]]; }); }

const SCENE = {
  key: 'terrarium',
  defaults: { species: 'gecko', habitat: 'desert', light: 'cycle', count: 0, size: 1, plants: 1, autoMist: true, autoFeed: true, glass: true, tool: 'feed' },
  validate(s) { if (!SPECIES[s.species]) s.species = 'gecko'; if (s.tool === 'snack' && !SPECIES[s.species].turtle) s.tool = 'feed'; if (!HABITATS[s.habitat]) s.habitat = 'desert'; if (!LIGHTS[s.light]) s.light = 'cycle'; },
  panelTitle: 'Your tank', panelSub: 'Click inside the tank to use the tool below. Saved between visits.',
  hello: 'Drop a cricket, mist the glass, or tap it and watch them bolt for the hide.',
  get tools() { const turtle = SPECIES[S.species] && SPECIES[S.species].turtle; return [['feed', 'Drop a cricket'], ...(turtle ? [['snack', 'Strawberry or lettuce']] : []), ['mist', 'Mist'], ['tap', 'Tap the glass'], null, ['lamp', 'Lamp on/off', () => { act('lamp', 0, 0, 'down'); }]]; },
  panel(ui) {
    ui.sel('Species', 'species', SPECIES);
    ui.range('How many (0 is one per screen)', 'count', 0, 6, 1, v => v === 0 ? 'auto' : v);
    ui.sel('Habitat', 'habitat', HABITATS);
    ui.sel('Lighting', 'light', LIGHTS);
    ui.range('Plants', 'plants', 0, 1.6, .1, v => Math.round(v * 100) + '%');
    ui.seg('Reptile size', 'size', [[.8, 'Small'], [1, 'Normal'], [1.3, 'Big']]);
    ui.tog('Keeper mists on a timer', 'autoMist');
    ui.tog('Keeper drops crickets on a timer', 'autoFeed');
    ui.tog('Reflections on the glass', 'glass');
  },
  changed(k) {
    if (['habitat', 'plants'].includes(k)) SCENE.build();
    else if (k === 'species') { const tm = !!SPECIES[S.species].turtle; if (!tm && S.tool === 'snack') S.tool = 'feed'; if (tm !== builtTurtle) SCENE.build(); else spawnLizards(); buildTools(); }
    else if (k === 'count' || k === 'size') spawnLizards();
    else if (k === 'light') updateDayTarget();
  },
  build() {
    ensurePrograms(); ensureN3(); rebake(); document.getElementById('fade').style.opacity = 1;
    if (bgRT) bgRT.free(); if (fgRT) fgRT.free();
    yB = unit * .695; yF = unit * .915; depth = (yF - yB) / KZ;
    bgRT = makeRT(W, H); fgRT = makeRT(W, H);
    const mons = monitors(), R = mulberry(SEED + 11);
    lamps = []; for (const m of mons) lamps.push({ x: m.wx + m.ww * R(.42, .58), y: unit * .05, p: 1 });
    bask = { x: W * .20, z: depth * .40, rx: unit * .36, rz: depth * .34, h: unit * .19, kind: 0, s: R() };
    if (mons.length > 1) bask.x = lamps[0].x + unit * .03; lamps[0].x = bask.x + unit * .03; lamps[0].p = 1.1;
    dish = { x: mons.length > 2 ? mons[1].wx + mons[1].ww * .42 : W * .55, z: depth * .46, rx: unit * .16, rz: unit * .16 / .36 * .36, kind: 4, h: 0, s: R() };
    // turtles get a real pool instead of the dish. With more than one monitor it straddles the last seam, so a swim crosses screens
    builtTurtle = !!SPECIES[S.species].turtle; pool = null;
    if (builtTurtle) { dish = null; const seam = mons.length > 1 ? mons[mons.length - 1].wx : W * .56; pool = { x: seam, z: depth * .70, rx: unit * (mons.length > 1 ? .72 : .44), rz: depth * .27, depth: unit * .085, s: R() }; }
    cave = { x: mons.length > 1 ? mons[mons.length - 1].wx + mons[mons.length - 1].ww * .68 : W * .84, z: depth * .40, rx: unit * .27, rz: depth * .25, h: unit * .22, kind: 2, s: R() };
    if (mons.length === 1) lamps.push({ x: cave.x, y: unit * .05, p: .62 });
    rocks = [bask, cave];
    const hab = S.habitat === 'desert' ? 0 : 1;
    const objs = [], fg = [], leaves = [], fleaves = [], logs = [];
    const obj = (list, x, y, w, h, s, kind, shade) => list.push(x, y, w, h, s, kind, shade, 0);
    const add = (o, list = objs) => { const h = o.h || o.ry || 0; obj(list, o.x, floorY(o.z) - h * .47, o.rx, o.rh || h * .62, o.s, o.kind, o.shade || 1); };
    const placedX = (x, w) => rocks.every(r => Math.abs(r.x - x) > r.rx + w + unit * .04) && !(pool && Math.abs(x - pool.x) < pool.rx * 1.2 + w);
    // scattered rock through every monitor
    for (const m of mons) for (let i = 0, n = 2 + (R() * 3 | 0); i < n; i++) { const w = R(.07, .2) * unit, x = m.wx + R(.04, .96) * m.ww; if (!placedX(x, w)) continue; const r = { x, z: R(.3, .55) * depth, rx: w, rz: w * R(.7, 1.2), h: w * R(.5, 1.1), kind: 0, s: R() }; rocks.push(r); }
    rocks.sort((a, b) => a.z - b.z);
    // moss on the jungle floor, sticks and pebbles in the sand
    if (hab) for (let i = 0, n = W / unit * 16; i < n; i++) { const x = R(W), z = R(.08, .62) * depth, w = R(.025, .095) * unit; obj(objs, x, floorY(z) - w * .13, w, w * .34, R(), 1, 1); }
    // a long weathered log along the back of each monitor
    for (const m of mons) { const w = Math.min(m.ww * .36, unit * .55); logs.push({ x: m.wx + m.ww * R(.3, .7), z: depth * R(.14, .24), rx: w, rz: w * .25, h: unit * R(.05, .08), kind: 1, s: R() }); }
    if (dish) obj(objs, dish.x, floorY(dish.z) - unit * .002, dish.rx, dish.rx * .37, dish.s, 4, 1);
    if (pool) obj(objs, pool.x, floorY(pool.z), pool.rx * 1.42, pool.rz * KZ * 1.42, pool.s, 5, 1);
    const solids = [...logs, ...rocks.map(r => r)].sort((a, b) => a.z - b.z), rRTs = [];
    // plants: back layer behind the animals, front layer in front of them
    const leaf = (L, x, y, len, wid, a, type, tint, seed, shade, sh) => { const dx = Math.cos(a), dy = Math.sin(a), cx = x + dx * len * .5, cy = y + dy * len * .5; if (L === leaves && Math.abs(cx - cave.x) < cave.rx * .95 && cy > floorY(cave.z) - cave.h * 1.2) return; if (pool && ((L === fleaves && Math.abs(x - pool.x) < pool.rx * 1.12) || (L === leaves && cy > yB && poolR(x, (y - yB) / KZ) < 1.34))) return; if (sh) { L.push(cx + 9, cy + 15, wid * 1.05, len * .5, type, tint, seed, 0, dx, dy, 1, sh); } L.push(cx, cy, wid, len * .5, type, tint, seed, 0, dx, dy, 0, shade); };
    const fern = (L, x, y, sc, shade) => { const fronds = 9 + R(6) | 0; for (let f = 0; f < fronds; f++) { const base = -Math.PI / 2 + R(-1.25, 1.25), len = R(.22, .36) * unit * sc, seg = 18; let px = x, py = y, a = base; const curl = (base < -Math.PI / 2 ? -1 : 1) * R(.03, .09); for (let i = 0; i < seg; i++) { const t = i / seg, st = len / seg, wid = (1 - t) * unit * .058 * sc + 2.5; leaf(L, px, py, st * 1.25, 2.2, a, 3, 1, R(), shade, 0); for (const sd of [-1, 1]) leaf(L, px, py, wid, st * .34, a + sd * R(1.1, 1.4), 1, 2, R(), shade * (.75 + R(.35)), .4); px += Math.cos(a) * st; py += Math.sin(a) * st; a += curl; } } };
    const pothos = (L, x, y, dir, sc, shade, maxLen) => { let px = x, py = y, a = Math.PI / 2 + dir * .4, steps = (maxLen / (unit * .05)) | 0; for (let i = 0; i < steps; i++) { const st = unit * .05 * sc; leaf(L, px, py, st * 1.06, 2.5, a, 3, 3, R(), shade, 0); const side = i % 2 ? 1 : -1, sz = unit * R(.045, .08) * sc; leaf(L, px, py, sz, sz * .62, a + side * R(.65, 1.3), 0, 2, R(), shade * R(.75, 1.05), .55); px += Math.cos(a) * st; py += Math.sin(a) * st; a += R(-.22, .22) + (Math.PI / 2 - a) * .08; } };
    const strap = (L, x, y, n, sc, shade, tint) => { for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + lerp(-1.32, 1.32, (i + R(.2, .8)) / n), len = R(.17, .3) * unit * sc * (1 - Math.abs(a + Math.PI / 2) * .24); leaf(L, x, y, len, unit * R(.014, .024) * sc, a, 2, tint, R(), shade * R(.72, 1.08), .55); } };
    const grass = (L, x, y, sc, shade, tint) => { for (let i = 0, n = 24 + R(30) | 0; i < n; i++) { const a = -Math.PI / 2 + R(-.75, .75), len = R(.06, .17) * unit * sc; leaf(L, x + R(-24, 24), y, len, R(1.2, 3), a, 2, tint, R(), shade * R(.7, 1.1), 0); } };
    const pl = S.plants, each = W / unit;
    if (hab) {
      for (let i = 0, n = each * 2.2 * pl; i < n; i++) { const x = R(W); pothos(leaves, x, unit * .058, R() < .5 ? -1 : 1, 1, R(.72, 1), R(.25, .62) * unit); }
      for (let i = 0, n = each * 2.3 * pl; i < n; i++) fern(leaves, R(W), floorY(depth * R(.05, .3)), R(.9, 1.6), R(.7, 1));
      for (let i = 0, n = each * 1.8 * pl; i < n; i++) strap(leaves, R(W), floorY(depth * R(.1, .35)), 15, R(.9, 1.5), R(.75, 1), 1);
      for (let i = 0, n = each * 1.6 * pl; i < n; i++) fern(fleaves, R(W), yF + unit * R(-.015, .01), R(.75, 1.15), R(.32, .55));
      for (let i = 0, n = each * 1.2 * pl; i < n; i++) pothos(fleaves, R(W), unit * .058, R() < .5 ? -1 : 1, 1.35, R(.32, .5), R(.15, .3) * unit);
    } else {
      for (let i = 0, n = each * 1.3 * pl; i < n; i++) { const x = R(W), y = floorY(depth * R(.1, .34)); strap(leaves, x, y, 12 + R(16), R(.45, .85), R(.75, 1), 4); strap(leaves, x + R(-12, 12), y, 9, R(.3, .5), R(.7, 1), 4); }
      for (let i = 0, n = each * 7 * pl; i < n; i++) grass(leaves, R(W), floorY(depth * R(.05, .5)), R(.6, 1.1), R(.75, 1), 3);
      for (let i = 0, n = each * .7 * pl; i < n; i++) strap(fleaves, R(W), yF + unit * R(-.012, .01), 10, R(.45, .7), R(.36, .55), 4);
      for (let i = 0, n = each * 1.6 * pl; i < n; i++) grass(fleaves, R(W), yF + unit * R(-.01, .012), R(.7, 1.05), R(.4, .75), 3);
    }
    // bake
    const setLamp = (p) => { gl.useProgram(p.p); gl.uniform1f(p.u.uU, unit); const a = new Float32Array(40); lamps.forEach((L, i) => a.set([L.x, L.y, L.p, 0], i * 4)); gl.uniform4fv(p.u.uLamps, a); gl.uniform1i(p.u.uNL, lamps.length); gl.uniform3fv(p.u.uAmb, hab ? [.13, .15, .12] : [.13, .115, .10]); if (p.u.uDown) gl.uniform1f(p.u.uDown, 1); if (p.u.uHab !== undefined) gl.uniform1f(p.u.uHab, hab); if (p.u.uWorld) gl.uniform2f(p.u.uWorld, W, H); };
    bakeTiles(bgRT, { tile: 200, cost: 5, begin: () => { setLamp(P.tank); gl.uniform1f(P.tank.u.uYB, yB); gl.uniform1f(P.tank.u.uYF, yF); } });
    const JIT = [[0, 0], [.5, .25], [-.25, .5], [-.5, -.25], [.25, -.5], [.4, .45]];
    const compose = (rt, x, y, cut, tgt) => { const p = P.compose; gl.bindFramebuffer(gl.FRAMEBUFFER, tgt.fb); gl.viewport(0, 0, W, H); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.useProgram(p.p); gl.uniform4f(p.u.uB, x, y, rt.w, rt.h); gl.uniform2f(p.u.uW, W, H); bindTex(0, rt.tex, p.u.uT); gl.uniform1f(p.u.uN, JIT.length); gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.disable(gl.BLEND); gl.bindFramebuffer(gl.FRAMEBUFFER, null); };
    const bakeSolid = (r, tgt, cut) => { const sc = r.rx, w = Math.ceil(sc * 2.68), h = Math.ceil(r.h * (r.kind === 1 ? 3.2 : 1.45) + r.rz * KZ * 2.5), x = Math.floor(r.x - sc * 1.34), y = Math.floor(floorY(r.z) + r.rz * KZ * 1.25 - h); const rt = makeRT(w, h, { float: true }); rt.ox = x; rt.oy = y;
      bakeTiles(rt, { tile: 128, passes: JIT.length, cost: 6, blend: true, begin: (pass) => { const p = P.rock; setLamp(p); gl.uniform1i(p.u.uN3, 5); gl.uniform2f(p.u.uJit, JIT[pass][0], JIT[pass][1]); gl.uniform2f(p.u.uOrg, x, y); gl.uniform2f(p.u.uRad, 1, r.rz / sc); gl.uniform1f(p.u.uR, sc); gl.uniform1f(p.u.uFloorY, floorY(r.z)); gl.uniform1f(p.u.uS, r.s); gl.uniform1f(p.u.uKind, r.kind); gl.uniform1f(p.u.uCut, cut ? 1 : 0); gl.uniform1f(p.u.uH, r.h / sc); } });
      bakeStep(() => { compose(rt, x, y, cut, tgt); rt.free(); }); };
    if (!P.compose) P.compose = program(HEAD + `uniform vec4 uB;uniform vec2 uW;out vec2 vUV;const vec2 Q[4]=vec2[4](vec2(0,0),vec2(1,0),vec2(0,1),vec2(1,1));void main(){vec2 c=Q[gl_VertexID];vUV=c;vec2 w=uB.xy+c*uB.zw;gl_Position=vec4(w.x/uW.x*2.-1.,w.y/uW.y*2.-1.,0,1);}`, HEAD + `in vec2 vUV;uniform sampler2D uT;uniform float uN;out vec4 o;void main(){o=texture(uT,vUV)/uN;}`);
    const contact = []; for (const r of [...rocks, ...logs]) contact.push(r.x, floorY(r.z) + r.rz * KZ * .35, r.rx * 1.25, r.rz * KZ * 1.9);
    bakeStep(() => { gl.bindFramebuffer(gl.FRAMEBUFFER, bgRT.fb); gl.viewport(0, 0, W, H); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); const p = P.contact || (P.contact = program(HEAD + `layout(location=0)in vec4 iA;uniform vec2 uW;out vec2 vP;const vec2 Q[4]=vec2[4](vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(1,1));void main(){vec2 c=Q[gl_VertexID];vP=c;vec2 w=iA.xy+c*iA.zw;gl_Position=vec4(w.x/uW.x*2.-1.,w.y/uW.y*2.-1.,0,1);}`, HEAD + `in vec2 vP;out vec4 o;void main(){float r=dot(vP,vP);o=vec4(0.,0.,0.,max(0.,exp(-r*2.2)-.11)*1.0);}`)); gl.useProgram(p.p); gl.uniform2f(p.u.uW, W, H); const b = gl.createBuffer(), v = gl.createVertexArray(); gl.bindVertexArray(v); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(contact), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0); gl.vertexAttribDivisor(0, 1); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, contact.length / 4); gl.bindVertexArray(null); gl.deleteBuffer(b); gl.deleteVertexArray(v); gl.disable(gl.BLEND); gl.bindFramebuffer(gl.FRAMEBUFFER, null); });
    for (const r of solids) bakeSolid(r, bgRT, false);
    bakeSolid(cave, fgRT, true);
    const qVAO = () => { const buf = gl.createBuffer(), v = gl.createVertexArray(); return { buf, v }; };
    const drawInst = (rt, prog, data, stride, attrs, setup) => { gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fb); gl.viewport(0, 0, rt.w, rt.h); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.DEPTH_TEST); setLamp(prog); if (setup) setup(); const b = gl.createBuffer(), v = gl.createVertexArray(); gl.bindVertexArray(v); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); attrs.forEach((a, i) => { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, a, gl.FLOAT, false, stride * 4, i * 16); gl.vertexAttribDivisor(i, 1); }); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, data.length / stride); gl.bindVertexArray(null); gl.deleteBuffer(b); gl.deleteVertexArray(v); gl.disable(gl.BLEND); gl.bindFramebuffer(gl.FRAMEBUFFER, null); };
    bakeStep(() => drawInst(bgRT, P.obj, objs, 8, [4, 4], () => { gl.uniform1f(P.obj.u.uCut, 0); }));
    bakeStep(() => drawInst(bgRT, P.leaf, leaves, 12, [4, 4, 4], () => { gl.uniform1f(P.leaf.u.uBlur, 0); }));
    bakeStep(() => drawInst(fgRT, P.obj, fg, 8, [4, 4], () => { gl.uniform1f(P.obj.u.uCut, 1); }));
    bakeStep(() => drawInst(fgRT, P.leaf, fleaves, 12, [4, 4, 4], () => { gl.uniform1f(P.leaf.u.uBlur, 1); }));
    if (!mVAO) {
      mVAO = gl.createVertexArray(); mVB = gl.createBuffer(); mIB = gl.createBuffer(); gl.bindVertexArray(mVAO); gl.bindBuffer(gl.ARRAY_BUFFER, mVB); gl.bufferData(gl.ARRAY_BUFFER, V.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 40, 24); gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 40, 32);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mIB); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, I.byteLength, gl.DYNAMIC_DRAW);
      blobBuf = gl.createBuffer(); blobVAO = gl.createVertexArray(); gl.bindVertexArray(blobVAO); gl.bindBuffer(gl.ARRAY_BUFFER, blobBuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0); gl.vertexAttribDivisor(0, 1);
      dropBuf = gl.createBuffer(); dropVAO = gl.createVertexArray(); gl.bindVertexArray(dropVAO); gl.bindBuffer(gl.ARRAY_BUFFER, dropBuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0); gl.vertexAttribDivisor(0, 1);
      gl.bindVertexArray(null);
    }
    spawnLizards(); updateDayTarget(); drops = []; crickets = []; foods = []; ripples = [];
  },
  act(tool, x, y, phase, dx, dy) {
    if (tool === 'lamp') { S.lightOff = !S.lightOff; updateDayTarget(); return; }
    if (tool === 'feed') { if (phase === 'down') dropCricket(x, y); return; }
    if (tool === 'snack') { if (phase === 'down' && turtles.length) dropSnack(x, y); return; }
    if (tool === 'mist') { if (phase === 'down' || (phase === 'drag' && Math.random() < .5)) { humidity = Math.min(1.2, humidity + .22); spawnDrops(x, y, 90); mistT = 1; } return; }
    if (tool === 'tap') { if (phase !== 'down') return; tapK = 1; for (const t of turtles) if (Math.abs(t.x - x) < unit * 1.1) startleTurtle(t); for (const l of lizards) { const d = Math.abs(l.nx[0] - x); if (d < unit * 1.1) { if (cave && Math.random() < .55) pickTarget(l, cave.x, cave.z + rnd(-.1, .12) * cave.rz); else pickTarget(l, l.nx[0] + (l.nx[0] > x ? 1 : -1) * rnd(.5, 1.1) * unit, rnd(depth * .46, depth * .92)); l.state = 'bolt'; l.t = 5; } } for (const c of crickets) if (Math.abs(c.x - x) < unit && c.state !== 'fall') { c.state = 'hop'; c.vy = unit * .5; c.spd = unit * .5; c.a = rnd(TAU); } return; }
  },
  sim(dt, now) {
    time += dt; const cyc = S.light === 'cycle' && !S.lightOff; if (cyc) dayTarget = Math.sin(time * .021) > -.28 ? 1 : .05; dayK = lerp(dayK, dayTarget, 1 - Math.exp(-dt * .9));
    humidity = lerp(humidity, .16, 1 - Math.exp(-dt / 70)); tapK *= Math.exp(-dt * 6); mistT *= Math.exp(-dt * 1.2);
    if (LEADER) {
      if (S.autoMist) { autoMist -= dt; if (autoMist < 0) { autoMist = rnd(70, 160); humidity = Math.min(1, humidity + .4); for (const m of monitors()) spawnDrops(m.wx + m.ww * rnd(.2, .8), unit * rnd(.2, .55), 40); mistT = 1; } }
      if (S.autoFeed) { autoFeed -= dt; if (autoFeed < 0) { autoFeed = rnd(60, 180); if (dayK > .4 && crickets.length < 8) for (let i = 0; i < 3; i++) dropCricket(rnd(W * .08, W * .92), unit * .2); } }
      for (const l of lizards) stepLizard(l, dt);
      for (const t of turtles) stepTurtle(t, dt);
      stepCrickets(dt); stepFoods(dt); stepRipples(dt);
    } else for (const l of lizards) stepLizard(l, dt);
    stepDrops(dt);
  },
  netState() { return { T: turtles.map(turtlePose), F: foods.map(f => [f.x, f.z, f.ground, f.y, f.kind, f.bites, f.maxB, f.a, f.bitA]), R: ripples.map(r => [r.x, r.z, r.r, r.a]), L: lizards.map(l => [l.nx[0], l.nz[0], l.h, l.speed, l.state]), C: crickets.map(c => [c.x, c.z, c.y, c.a, c.s, c.state]), hum: humidity, day: dayTarget }; },
  netApply(d) { if (d.T) d.T.forEach((a, i) => { if (turtles[i]) applyTurtlePose(turtles[i], a); }); if (d.F) foods = d.F.map(a => ({ x: a[0], z: a[1], ground: a[2], y: a[3], kind: a[4], bites: a[5], maxB: a[6], a: a[7], bitA: a[8], fall: false, bob: 0 })); if (d.R) ripples = d.R.map(r => ({ x: r[0], z: r[1], r: r[2], a: r[3] })); d.L.forEach((a, i) => { const l = lizards[i]; if (!l) return; l.nx[0] = a[0]; l.nz[0] = a[1]; l.h = a[2]; l.speed = a[3]; l.state = a[4]; l.t = 99; l.tx = a[0] + Math.cos(a[2]) * unit; l.tz = a[1] + Math.sin(a[2]) * unit; }); crickets = d.C.map(c => ({ x: c[0], z: c[1], y: c[2], a: c[3], s: c[4], state: c[5] })); humidity = d.hum; dayTarget = d.day; },
  render(now) { renderAll(now); },
  place(i, x, z, h) { const t = turtles[i]; if (!t) return; t.x = x; t.z = z; if (h !== undefined) t.h = h; t.y = gnd(x, z) + t.L * t.sp.leg; t.tx = x; t.tz = z; tFrame(t); for (const l of t.legs) { const fp = turtleFootIdeal(t, l); l.foot = [fp[0], gnd(fp[0], fp[1]) + 1, fp[1]]; l.from = l.foot.slice(); l.sw = false; } },
  get lizards() { return lizards; }, get turtles() { return turtles; }, get bask() { return bask; }, get cave() { return cave; }, get foods() { return foods; }, get pool() { return pool; }, get ripples() { return ripples; },
  stats() { return `${[...lizards, ...turtles].map(l => l.state).join(', ')} · ${foods.length ? foods.length + ' snacks · ' : ''}${crickets.length} crickets · humidity ${Math.round(humidity * 100)}%`; },
};
function spawnLizards() {
  const n = S.count > 0 ? S.count : Math.max(1, monitors().length), sp = SPECIES[S.species], R = mulberry(SEED + 7); lizards = []; turtles = [];
  for (let i = 0; i < n; i++) { const x = W * ((i + .5) / n) + R(-.05, .05) * unit, z = R(.55, .85) * depth; if (sp.turtle) { let xs = x, zs = z; if (pool && poolR(xs, zs) < 1.12) { zs = depth * .44; xs = clamp(pool.x + (i % 2 ? 1 : -1) * pool.rx * .85, 100, W - 100); } turtles.push(newTurtle(sp, xs, zs)); } else lizards.push(newLizard(sp, x, z)); }
}
function updateDayTarget() { const li = LIGHTS[S.light]; dayTarget = S.lightOff ? .05 : li.k === 1 ? 1 : Math.max(.05, li.k); if (S.light === 'night') dayTarget = .05; }

function drawPool(p, v, t, tint) {
  gl.useProgram(p.p); setView(p.u, v); const hy = pool.rz * KZ * 1.02, hx = pool.rx * 1.02;
  gl.uniform4f(p.u.uRect, pool.x, floorY(pool.z), hx * 1.2, hy * 1.2); gl.uniform4f(p.u.uPool, pool.x, floorY(pool.z), pool.rx, pool.rz * KZ); gl.uniform1f(p.u.uS, pool.s); gl.uniform1f(p.u.uYB, yB); gl.uniform1f(p.u.uD, depth); gl.uniform1f(p.u.uTime, t); gl.uniform1f(p.u.uU, unit); gl.uniform3fv(p.u.uTint, tint);
  if (p === P.poolBed) { gl.uniform2f(p.u.uWorld, W, H); bindTex(0, bgRT.tex, p.u.uT); }
  else { const a = new Float32Array(40); lamps.forEach((L, i) => a.set([L.x, L.y, L.p, 0], i * 4)); gl.uniform4fv(p.u.uLamps, a); gl.uniform1i(p.u.uNL, lamps.length); gl.uniform1f(p.u.uDay, dayK); const r = new Float32Array(28 * 4), n = Math.min(ripples.length, 28); for (let i = 0; i < n; i++) r.set([ripples[i].x, ripples[i].z, ripples[i].r, ripples[i].a], i * 4); gl.uniform4fv(p.u.uRip, r); gl.uniform1i(p.u.uNR, n); }
  gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
function drawPic(v, tex, premult, tint) { const p = P.pic; gl.useProgram(p.p); setView(p.u, v); gl.uniform2f(p.u.uWorld, W, H); bindTex(0, tex, p.u.uT); gl.uniform3fv(p.u.uTint, tint); gl.uniform1f(p.u.uPremult, premult ? 1 : 0); tri(); }
function renderAll(t) {
  gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  // the room's light on everything, day through moonlight
  const K = dayK, tint = [lerp(.18, 1, K), lerp(.20, 1, K), lerp(.32, 1, K)];
  vN = 0; iN = 0; const sp = SPECIES[S.species];
  for (const l of lizards) buildLizardMesh(l); for (const t of turtles) buildTurtleMesh(t); for (const c of crickets) buildCricketMesh(c); for (const f of foods) buildFoodMesh(f);
  // contact shadows
  const blobs = [];
  for (const l of lizards) {
    for (let i = 2; i < NODES - 3; i += 2) { const t2 = i / (NODES - 1), pf = profile(l.sp, t2); const sy = floorY(l.nz[i]) - alt(l.nx[i], l.nz[i]); blobs.push(l.nx[i], sy + l.L * .008, Math.max(pf[1] * l.L * 1.4, l.seg * 2.3), pf[1] * l.L * .62 + l.L * .004); if (t2 < .7) blobs.push(l.nx[i], sy + l.L * .004, pf[1] * l.L * .95, pf[1] * l.L * .34); }
    for (const g of l.legs) blobs.push(g.foot[0], floorY(g.foot[2]) - alt(g.foot[0], g.foot[2]), l.L * .045, l.L * .016);
  }
  for (const c of crickets) { const sy = floorY(c.z) - alt(c.x, c.z); blobs.push(c.x, sy, unit * .018 * c.s, unit * .007 * c.s); }
  for (const t of turtles) {
    // a wide soft shadow plus a tight dark contact under the shell; in the pool it falls on the bed, fainter
    const ch = Math.cos(t.h), sh = Math.sin(t.h), rot = Math.abs(ch), rxS = lerp(t.W * .5, t.L * .5, rot), rzS = lerp(t.L * .5, t.W * .5, rot), g0 = gnd(t.x, t.z), sy = floorY(t.z) - g0 * CY;
    blobs.push(t.x, sy + t.L * .01, rxS * 1.5, rzS * KZ * 1.75); if (t.swim < .5) { const low = 1 - clamp((t.y - g0) / (t.L * .2), 0, 1); blobs.push(t.x, sy + t.L * .012, rxS * (.98 + .1 * low), rzS * KZ * (1.18 + .1 * low)); if (t.legK > .3) for (const l of t.legs) blobs.push(l.foot[0], floorY(l.foot[2]) - l.foot[1] * CY, t.L * .1, t.L * .045); }
  }
  for (const f of foods) { if (f.ground < 0 || f.fall) continue; const sy = floorY(f.z) - f.ground; blobs.push(f.x, sy, unit * .05, unit * .018); }
  const blobArr = new Float32Array(blobs);
  gl.bindVertexArray(mVAO); gl.bindBuffer(gl.ARRAY_BUFFER, mVB); gl.bufferSubData(gl.ARRAY_BUFFER, 0, V.subarray(0, vN * 10)); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mIB); gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, I.subarray(0, iN));
  gl.bindVertexArray(blobVAO); gl.bindBuffer(gl.ARRAY_BUFFER, blobBuf); gl.bufferData(gl.ARRAY_BUFFER, blobArr, gl.DYNAMIC_DRAW);
  const dropArr = new Float32Array(drops.length * 4); drops.forEach((d, i) => { const st = d.vy > 0 ? 1.45 : 1.05; dropArr[i * 4] = d.x; dropArr[i * 4 + 1] = d.y; dropArr[i * 4 + 2] = d.r; dropArr[i * 4 + 3] = st; });
  gl.bindVertexArray(dropVAO); gl.bindBuffer(gl.ARRAY_BUFFER, dropBuf); gl.bufferData(gl.ARRAY_BUFFER, dropArr, gl.DYNAMIC_DRAW);
  gl.bindVertexArray(null);
  eachView(v => {
    gl.clear(gl.DEPTH_BUFFER_BIT); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    drawPic(v, bgRT.tex, false, tint);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (pool) drawPool(P.poolBed, v, t, tint);
    let p = P.blob; gl.useProgram(p.p); setView(p.u, v); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.bindVertexArray(blobVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, blobs.length / 4);
    gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
    p = P.mesh; gl.useProgram(p.p); setView(p.u, v); gl.uniform1f(p.u.uYB, yB); gl.uniform1f(p.u.uD, depth); gl.uniform1f(p.u.uTime, t);
    const c = colorsFor(sp); gl.uniform3fv(p.u.uSkin, c.sk || [.2, .2, .2]); gl.uniform3fv(p.u.uSkin2, c.sk2 || [.2, .2, .2]); gl.uniform3fv(p.u.uEye, sp.eye); gl.uniform3fv(p.u.uBaseC, c.a); gl.uniform3fv(p.u.uAltC, c.b); gl.uniform3fv(p.u.uBelly, c.b2); gl.uniform1f(p.u.uScale, sp.scale * unit / 1080); gl.uniform1f(p.u.uGloss, sp.gloss); gl.uniform1f(p.u.uPat, c.pat); gl.uniform1f(p.u.uLen, (lizards[0] && lizards[0].L) || (turtles[0] && turtles[0].L) || 400);
    const an = sp.an || { headEnd: 0, eyeT: 0, eyeR: 0 }; gl.uniform4f(p.u.uAn, an.headEnd, an.eyeT, 1.95, an.eyeR); gl.uniform3fv(p.u.uGnd, S.habitat === 'jungle' ? [.16, .13, .08] : [.48, .36, .22]);
    gl.uniform3fv(p.u.uKey, [1.45 * K + .06, 1.05 * K + .08, .68 * K + .17]); gl.uniform3fv(p.u.uAmb, [.15 * K + .025, .15 * K + .03, .135 * K + .055]);
    gl.bindVertexArray(mVAO); gl.drawElements(gl.TRIANGLES, iN, gl.UNSIGNED_INT, 0);
    if (pool) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.depthFunc(gl.LEQUAL); drawPool(P.poolTop, v, t, tint); gl.depthMask(true); gl.depthFunc(gl.LESS); }
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    drawPic(v, fgRT.tex, true, tint);
    if (drops.length) { const q = P.drop; gl.useProgram(q.p); setView(q.u, v); gl.uniform2f(q.u.uWorld, W, H); bindTex(0, bgRT.tex, q.u.uT); gl.uniform1f(q.u.uR, 4); gl.bindVertexArray(dropVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, drops.length); }
    const f = P.fog; gl.useProgram(f.p); setView(f.u, v); gl.uniform1f(f.u.uTime, t); gl.uniform1f(f.u.uFog, clamp(humidity + mistT * .2, 0, 1)); gl.uniform1f(f.u.uU, unit); gl.uniform2f(f.u.uWorld, W, H); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
  });
}
const colorsFor = (sp) => sp === SPECIES.box ? { a: [.058, .040, .024], b: [.74, .50, .11], b2: [.74, .60, .32], pat: 4, sk: [.115, .082, .052], sk2: [.86, .46, .10] } : sp === SPECIES.slider ? { a: [.085, .125, .042], b: [.60, .60, .18], b2: [.84, .74, .36], pat: 5, sk: [.12, .18, .065], sk2: [.74, .70, .22] } : sp === SPECIES.gecko ? { a: [.70, .46, .12], b: [.030, .026, .022], b2: [.80, .70, .52], pat: 0 } : sp === SPECIES.beardie ? { a: [.52, .30, .12], b: [.19, .09, .035], b2: [.72, .60, .40], pat: 1 } : sp === SPECIES.anole ? { a: [.085, .23, .045], b: [.15, .30, .06], b2: [.66, .68, .52], pat: 2 } : { a: [.44, .37, .27], b: [.075, .05, .034], b2: [.64, .58, .44], pat: 3 };
