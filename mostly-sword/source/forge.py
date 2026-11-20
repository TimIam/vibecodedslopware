"""Build Slopware's modular arena cast and export the Blender source and GLBs.

Run with blender -b -P forge.py. glTF uses +Y up and the fighter faces +Z.
"""
import bpy
import bmesh
import math
import random
from pathlib import Path
from mathutils import Vector

SOURCE = Path(__file__).resolve().parent
OUT = SOURCE.parent / "assets"
OUT.mkdir(exist_ok=True)
random.seed(1079)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
TAU = math.tau
pi = math.pi
materials = {}


def mat(name, color, metal=0, rough=.65, glow=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.diffuse_color = (*color, 1)
    shader = m.node_tree.nodes.get("Principled BSDF")
    for key, val in {
        "Base Color": (*color, 1), "Metallic": metal, "Roughness": rough,
        "Emission Color": (*color, 1), "Emission Strength": glow,
    }.items():
        shader.inputs[key].default_value = val
    m.use_backface_culling = False
    materials[name] = m
    return name


steel = mat("Blue-steel plate", (.28,.36,.42), .7,.37)
edge = mat("Polished edges", (.68,.76,.78), .72,.25)
shadow = mat("Blackened steel", (.047,.066,.083), .6,.43)
brass = mat("Aged latten", (.62,.34,.087), .63,.37)
mail = mat("Mail", (.115,.132,.129), .65,.55)
dark = mat("Eye slit", (.007,.009,.013), .1,.73)
cloth = mat("Tabard", (.36,.024,.027), 0,.92)
cream = mat("Heraldry", (.75,.60,.35), .12,.64)
leather = mat("Buff leather", (.16,.082,.039), .1,.78)
wood = mat("Charred oak", (.114,.064,.037), 0,.88)
stone = [mat("Ashlar %02d"%i,c) for i,c in enumerate([
    (.16,.135,.117),(.125,.114,.107),(.19,.16,.133),(.14,.13,.127),(.119,.10,.088)])]
paving = [mat("Paving %02d"%i,c) for i,c in enumerate([
    (.235,.207,.175),(.20,.175,.152),(.216,.19,.169),(.19,.178,.159),(.239,.215,.19)])]
carve = mat("Cut limestone", (.345,.278,.206), 0,.82)
gutter = mat("Pitch", (.056,.046,.042), 0,.93)
banner = mat("Arena oxblood", (.23,.024,.027), 0,.92)
fire = mat("Fire amber", (1,.19,.018), 0,.55,3.5)
hot = mat("Fire core", (1,.63,.13), 0,.49,4.5)
coals = mat("Coals", (.70,.084,.012), .04,.67,1.3)

library = {}
bucket = {}


def module(name):
    global col
    col = bpy.data.collections.new(name)
    scene.collection.children.link(col)
    library[name] = col


def pivot(name, pos=(0,0,0), parent=None):
    obj = bpy.data.objects.new(name,None)
    col.objects.link(obj)
    obj.parent = parent
    obj.location = pos
    obj.empty_display_type = 'PLAIN_AXES'
    obj.empty_display_size = .10
    return obj


def solid(parent, material, verts, faces):
    vs, fs = bucket.setdefault(parent, ([],[]))
    n = len(vs)
    vs.extend(verts)
    fs.extend((tuple(i+n for i in face), material) for face in faces)


def flush():
    for p,(verts,faces) in bucket.items():
        mesh = bpy.data.meshes.new(p.name+" geometry")
        mesh.from_pydata(verts, [], [f for f,_ in faces])
        slots = list(dict.fromkeys(m for _,m in faces))
        for m in slots:
            mesh.materials.append(materials[m])
        for poly, (_,m) in zip(mesh.polygons,faces):
            poly.material_index = slots.index(m)
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:])
        bm.to_mesh(mesh)
        bm.free()
        mesh.update()
        obj = bpy.data.objects.new(p.name + "_mesh", mesh)
        col.objects.link(obj)
        obj.parent = p
    bucket.clear()


def loft(p,m,layers, n=12, phase=0):
    # Each horizontal elliptical section is (z, x-radius, y-radius, x, y).
    verts = []
    for z,rx,ry,*shift in layers:
        x,y = shift or (0,0)
        verts.extend((x+rx*math.cos(a*TAU/n+phase),y+ry*math.sin(a*TAU/n+phase),z) for a in range(n))
    faces = [tuple(range(n-1,-1,-1)),tuple(range(len(verts)-n,len(verts)))]
    for k in range(len(layers)-1):
        for j in range(n):
            a = k*n+j
            b = k*n+(j+1)%n
            faces.append((a,b,b+n,a+n))
    solid(p,m,verts,faces)


def ball(p,m,x,y,z,rx,ry,rz,n=10):
    loft(p,m,[(z+rz*h,rx*s,ry*s,x,y) for h,s in [(-1,.12),(-.71,.72),(0,1),(.71,.72),(1,.12)]],n)


def cuboid(p,m,cx,cy,cz,sx,sy,sz,rz=0):
    def point(x,y,z):
        return (cx+x*math.cos(rz)-y*math.sin(rz), cy+x*math.sin(rz)+y*math.cos(rz), cz+z)
    verts = [point(x*sx*.5,y*sy*.5,z*sz*.5) for z in [-1,1] for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    solid(p,m,verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])


def shaft(p,m,a,b,r1,r2=None,n=9):
    a,b = Vector(a),Vector(b)
    direction=(b-a).normalized()
    u=direction.cross(Vector((1,0,0)) if abs(direction.x)<.9 else Vector((0,1,0))).normalized()
    v=direction.cross(u)
    verts=[tuple(c+radius*(u*math.cos(i*TAU/n)+v*math.sin(i*TAU/n))) for c,radius in [(a,r1),(b,r1 if r2 is None else r2)] for i in range(n)]
    solid(p,m,verts,[tuple(range(n)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)])


def panel(p,m,outline,y,depth):
    # Points in X/Z seen from the front.
    vs=[(x,y+d,z) for d in (0,depth) for x,z in outline]
    n=len(outline)
    solid(p,m,vs,[tuple(range(n)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)])


module("knight")
root = pivot("Knight")
hips=pivot("Hips",(0,0,.91),root)
chest=pivot("Chest",(0,0,.13),hips)
head=pivot("Head",(0,0,.54),chest)
loft(hips,mail,[(-.12,.16,.115),(.03,.203,.14),(.14,.164,.125)])
# Overlapping steel faulds over a dark padded arming doublet.
for i in range(3):
    z=-.095+i*.065
    loft(hips,steel,[(z,.228-i*.016,.171-i*.009),(z+.055,.208-i*.015,.148-i*.006)],14)
    loft(hips,brass,[(z,.227-i*.016,.1715-i*.009),(z+.009,.228-i*.016,.172-i*.009)],14)
loft(chest,mail,[(-.025,.162,.135),(.26,.249,.166),(.39,.212,.149),(.51,.128,.106)],12)
loft(chest,steel,[(.02,.181,.153),(.08,.186,.162),(.26,.255,.187),(.34,.252,.169),(.42,.175,.128)],12)
loft(chest,brass,[(.024,.183,.155),(.044,.187,.159)],12)
loft(chest,shadow,[(.405,.173,.138),(.48,.132,.123),(.50,.112,.106)],12)
loft(chest,edge,[(.484,.137,.128),(.499,.132,.121)],12)
# The cloth panels remain distinct for per-player team colors.
def drape(center,sections,width,base):
    vs=[]
    for z,y in sections:
        vs.extend([(center-width,y+.012,z),(center-width*.45,y,z+.003),
                   (center+width*.15,y-.005,z-.005),(center+width,y+.008,z+.009)])
    fs=[(j*4+i,j*4+i+1,(j+1)*4+i+1,(j+1)*4+i) for j in range(len(sections)-1) for i in range(3)]
    solid(base,cloth,vs,fs)

drape(0,[(.397,-.124),(.30,-.177),(.21,-.187),(.06,-.168),(-.01,-.15)],.085,chest)
drape(0,[(.10,-.144),(.01,-.162),(-.12,-.174),(-.30,-.168)],.097,hips)
for side in (-1,1):
    shaft(chest,cream,(.071*side,-.183,.234),(.020*side,-.192,.271),.007,.004,5)
    shaft(chest,cream,(.059*side,-.179,.282),(.005*side,-.191,.253),.007,.004,5)
shaft(chest,cream,(0,-.187,.308),(0,-.197,.193),.010,.004,6)
loft(hips,leather,[(.075,.209,.164),(.121,.201,.159)],14)
cuboid(hips,brass,0,-.165,.096,.065,.02,.048)
cuboid(hips,leather,0,-.177,.096,.039,.01,.027)
# The visor is assembled from overlapping plates and a recessed eye aperture.
loft(head,shadow,[(-.016,.107,.107),(.05,.133,.120),(.192,.153,.140),(.244,.134,.120),(.267,.107,.097)],16)
loft(head,steel,[(.118,.153,.145),(.19,.158,.147),(.244,.140,.129),(.295,.097,.091),(.326,.020,.025)],16)
loft(head,edge,[(.184,.158,.148),(.197,.16,.148)],16)
loft(head,steel,[(.015,.103,.116,0,-.02),(.058,.144,.145,0,-.012),(.112,.157,.177,0,-.014),(.145,.154,.151,0,-.016)],16)
for sign in [-1,1]:
    vs=[(0,-.178,.173),(.074*sign,-.161,.164),(.126*sign,-.130,.149),(.137*sign,-.122,.130),(.068*sign,-.161,.143),(0,-.18,.147)]
    solid(head,dark,vs,[tuple(range(6))])
    shaft(head,brass,(.122*sign,-.09,.125),(.135*sign,-.07,.145),.019,.019,9)
    for j in range(3):
        x=(.045+j*.022)*sign
        shaft(head,dark,(x,-.175+j*.009,.081),(x,-.17+j*.009,.107),.004,.004,5)
shaft(head,edge,(0,-.179,.151),(0,-.144,.054),.009,.003,6)
for sign,letter in [(-1,"R"),(1,"L")]:
    arm=pivot("UpperArm"+letter,(sign*.269,0,.37),chest)
    elbow=pivot("Forearm"+letter,(sign*.051,0,-.287),arm)
    hand=pivot("Hand"+letter,(sign*.012,0,-.243),elbow)
    shaft(arm,mail,(0,0,0),(sign*.049,0,-.26),.093,.063,12)
    for i in range(3):
        z=-.10+i*.063
        loft(arm,steel,[(z,.132-i*.011,.131-i*.011,sign*.008,0),
                (z+.044,.120-i*.016,.121-i*.016,sign*.01,0),
                (z+.077,.08-i*.014,.087-i*.014,0,0)],12)
        loft(arm,brass,[(z-.002,.132-i*.011,.132-i*.011,sign*.009,0),
                (z+.009,.133-i*.011,.132-i*.011,sign*.009,0)],12)
    shaft(arm,steel,(sign*.03,0,-.137),(sign*.048,0,-.246),.078,.065,10)
    ball(elbow,shadow,0,0,.013,.077,.075,.074)
    ball(elbow,steel,sign*.034,.003,.008,.070,.082,.071)
    shaft(elbow,steel,(0,0,-.036),(sign*.01,0,-.206),.069,.049,10)
    for z,r in [(-.184,.055),(-.202,.053)]:
        shaft(elbow,brass,(sign*.011,0,z),(sign*.011,0,z-.008),r,r,10)
    loft(hand,steel,[(-.057,.045,.054),(.018,.055,.060),(.052,.060,.066)],10)
    ball(hand,leather,0,-.012,-.082,.045,.053,.057)
    for j in range(4):
        ball(hand,steel,(j-1.5)*.018,-.047,-.067,.012,.024,.025,7)
    thigh=pivot("Thigh"+letter,(sign*.119,.005,-.024),hips)
    shin=pivot("Shin"+letter,(sign*.024,0,-.425),thigh)
    shaft(thigh,mail,(0,0,-.035),(sign*.02,0,-.385),.10,.074,11)
    shaft(thigh,steel,(sign*.002,0,-.079),(sign*.023,0,-.331),.097,.073,10)
    for i in range(3):
        z=-.044-i*.049
        loft(thigh,steel,[(z-.044,.101-i*.005,.099-i*.004,sign*.007,-.025),
                       (z,.096-i*.005,.094-i*.004,sign*.007,-.025)],10)
    ball(shin,shadow,0,0,0,.078,.080,.073)
    ball(shin,steel,0,-.041,.004,.082,.072,.064)
    shaft(shin,steel,(0,0,-.056),(0,-.006,-.335),.075,.050,11)
    for z in [-.12,-.23]:
        shaft(shin,leather,(0,0,z),(0,0,z-.019),.076 if z>-.20 else .061,.075 if z>-.20 else .06,10)
    loft(shin,leather,[(-.46,.073,.141,0,-.062),(-.43,.077,.144,0,-.064),(-.39,.062,.101,0,-.045)],12)
    for i in range(4):
        ball(shin,steel,0,.001-i*.044,-.381-i*.008,.061-i*.004,.062-i*.004,.053-i*.009,10)
flush()

# Padded kit on the same joint pivots as the plate harness. The web rig can
# change coverage by exchanging the two mesh children of each pivot.
module("kit")
kitroot = pivot("PaddedKit")
kit_joints = {}
for name in ["Hips", "Chest", "Head"] + [
    part + side for side in ("R", "L")
    for part in ("UpperArm", "Forearm", "Hand", "Thigh", "Shin")
]:
    original = bpy.data.objects[name]
    kit_joints[name] = pivot("Padded" + name, original.location,
                             kit_joints.get(original.parent.name, kitroot))

linen = mat("Undyed linen", (.44, .35, .24), 0, .94)
hose = mat("Wool hose", (.119, .099, .082), 0, .96)
skin = mat("Complexion", (.54, .31, .19), 0, .8)
hair = mat("Chestnut hair", (.084, .043, .024), 0, .92)
stitch = mat("Waxed seam", (.25, .17, .1), 0, .96)
hips, chest, head = (kit_joints[n] for n in ("Hips", "Chest", "Head"))
loft(hips, cloth, [(-.16,.203,.148),(-.10,.206,.148),(.06,.183,.137),(.14,.169,.128)], 16)
loft(hips, leather, [(.06,.187,.14),(.10,.183,.14)], 16)
cuboid(hips, brass, 0,-.142,.08,.041,.012,.03)
loft(chest, cloth, [(-.03,.167,.132),(.11,.179,.146),(.27,.224,.156),
                   (.36,.211,.143),(.43,.157,.114),(.47,.102,.088)], 16)
loft(chest, linen, [(.425,.133,.107),(.48,.094,.086),(.51,.079,.076)], 14)
for sign in [-1,1]:
    for i in range(1,4):
        x = sign*i*.033
        shaft(chest, stitch, (x,-.137+.008*i,.06),(x*1.12,-.158+.006*i,.28),.0035,.0035,5)
    for i in range(3):
        shaft(chest, linen,(sign*.022,-.142+.009*i,.32+i*.031),
              (-sign*.018,-.139+.009*i,.337+i*.031),.0035,.0035,5)
loft(head,skin,[(-.045,.072,.067),(.015,.073,.068),(.046,.085,.088,0,-.014),
                (.094,.112,.103),(.17,.122,.11),(.232,.113,.104),(.261,.071,.078)],16)
loft(head,hair,[(.186,.124,.112,0,.009),(.23,.119,.114),(.268,.095,.094),(.289,.032,.052)],16)
for sign in [-1,1]:
    ball(head,skin,sign*.117,.002,.123,.019,.025,.034)
    shaft(head,hair,(sign*.018,-.112,.173),(sign*.078,-.095,.18),.006,.006,6)
    ball(head,dark,sign*.050,-.104,.153,.014,.005,.005)
    shaft(head,hair,(sign*.111,.004,.192),(sign*.113,.006,.13),.017,.012,8)
ball(head,skin,0,-.111,.129,.021,.024,.03)
shaft(head,stitch,(-.026,-.097,.083),(.026,-.097,.083),.003,.003,6)
for sign, side in [(-1,"R"),(1,"L")]:
    arm, elbow, hand, thigh, shin = (kit_joints[n+side] for n in ("UpperArm","Forearm","Hand","Thigh","Shin"))
    ball(arm,cloth,0,0,-.014,.095,.091,.085)
    shaft(arm,linen,(0,0,-.045),(sign*.048,0,-.282),.085,.061,12)
    ball(elbow,linen,0,0,0,.064,.062,.061)
    shaft(elbow,linen,(0,0,0),(sign*.012,0,-.208),.065,.047,12)
    for z in [-.145,-.185]:
        shaft(elbow,stitch,(sign*.009,0,z),(sign*.010,0,z-.012),.055,.053,12)
    loft(hand,leather,[(-.071,.042,.044),(-.022,.048,.051),(.041,.049,.047)],10)
    for j in range(4):
        ball(hand,leather,(j-1.5)*.017,-.032,-.070,.012,.020,.029,8)
    ball(hand,leather,sign*.035,-.032,-.042,.020,.022,.033)
    shaft(thigh,hose,(0,0,-.008),(sign*.023,0,-.422),.101,.069,12)
    ball(shin,hose,0,0,0,.073,.069,.076)
    shaft(shin,hose,(0,0,-.024),(0,0,-.345),.068,.045,12)
    shaft(shin,leather,(0,0,-.240),(0,-.004,-.407),.061,.052,12)
    loft(shin,leather,[(-.455,.066,.132,0,-.054),(-.428,.069,.135,0,-.056),(-.393,.055,.081,0,-.026)],12)
flush()

for item in ["sword","mace","poleaxe"]:
    module(item)
    p=pivot(item.capitalize())
    if item=="sword":
        loft(p,leather,[(-.15,.032,.026),(-.125,.029,.022),(.15,.025,.022),(.17,.033,.026)],10)
        for j in range(12):
            z=-.13+j*.024
            loft(p,shadow,[(z,.030,.026),(z+.005,.030,.026)],10)
        ball(p,brass,0,0,-.164,.047,.027,.048)
        panel(p,steel,[(-.207,.124),(-.202,.154),(-.063,.190),(0,.198),(.06,.190),(.202,.154),(.207,.124),(.052,.155),(-.052,.155)],-.019,.038)
        for s in [-1,1]: ball(p,brass,s*.205,0,.142,.019,.024,.022,8)
        zs=[(.175,.045,.016),(.26,.048,.016),(.88,.035,.012),(1.09,.022,.009),(1.23,.001,.001)]
        vs=[v for z,w,d in zs for v in [(0,-d,z),(w,0,z),(0,d,z),(-w,0,z)]]
        for i in range(4):
            for j in range(4): solid(p,edge if i%2 else steel,[vs[j*4+i],vs[j*4+(i+1)%4],vs[(j+1)*4+(i+1)%4],vs[(j+1)*4+i]],[(0,1,2,3)])
    elif item=="mace":
        loft(p,wood,[(-.15,.025,.025),(.1,.031,.031),(.54,.032,.032),(.68,.039,.039)],12)
        for j in range(10):
            z=-.14+j*.023
            loft(p,leather,[(z,.031,.031),(z+.018,.031,.031)],10)
        loft(p,brass,[(.48,.043,.043),(.51,.044,.044)],12)
        loft(p,shadow,[(.50,.036,.036),(.56,.069,.069),(.71,.074,.074),(.81,.043,.043)],12)
        for i in range(7):
            a=i*TAU/7
            vs=[(r*math.cos(a)-w*math.sin(a),r*math.sin(a)+w*math.cos(a),z) for w in (-.009,.009) for r,z in [(.038,.52),(.104,.57),(.125,.68),(.107,.75),(.04,.795)]]
            solid(p,steel,vs,[(0,1,2,3,4),(5,6,7,8,9)]+[(j,(j+1)%5,(j+1)%5+5,j+5) for j in range(5)])
        ball(p,brass,0,0,.811,.033,.033,.034)
    else:
        loft(p,wood,[(-.51,.024,.024),(-.46,.028,.028),(1.13,.029,.029),(1.31,.025,.025)],10)
        for z in [-.50,-.47,.64,.67,1.025,1.20]:
            loft(p,brass,[(z,.034,.034),(z+.019,.034,.034)],10)
        for j in range(17):
            z=-.19+j*.026
            loft(p,leather,[(z,.031,.031),(z+.019,.031,.031)],10)
        panel(p,steel,[(-.045,1.17),(-.133,1.21),(-.229,1.305),(-.262,1.215),(-.27,1.105),(-.229,1.04),(-.149,1.10),(-.045,1.105),(.047,1.11),(.146,1.034),(.122,1.14),(.06,1.20)],-.02,.04)
        panel(p,edge,[(-.229,1.305),(-.262,1.215),(-.27,1.105),(-.229,1.04),(-.239,1.12),(-.238,1.21)],-.022,.044)
        loft(p,steel,[(1.19,.039,.038),(1.34,.041,.023),(1.60,.001,.001)],4,pi/4)
    flush()

module("arena")
arena = pivot("Arena")


def wedge(p,m,r1,r2,a1,a2,z0,z1,steps=1):
    vs=[]
    for z in [z0,z1]:
        for r in [r1,r2]:
            vs.extend((r*math.cos(a),r*math.sin(a),z) for a in [a1+(a2-a1)*j/steps for j in range(steps+1)])
    n=steps+1
    fs=[(0,n,3*n,2*n),(n-1,2*n-1,4*n-1,3*n-1)]
    for i in range(steps):
        fs.extend([(i,i+1,n+i+1,n+i),(i+2*n,i+1+2*n,i+1+3*n,i+3*n),
                   (i,i+1,i+1+2*n,i+2*n),(n+i,n+i+1,3*n+i+1,3*n+i)])
    solid(p,m,vs,fs)


def ring(p,m,r1,r2,z,depth=.012):
    wedge(p,m,r1,r2,0,TAU,z-depth,z,96)


loft(arena,gutter,[(-.35,11.8,11.8),(-.024,11.8,11.8)],96)
loft(arena,stone[3],[(-.18,1.0,1.0),(.001,1.,1.)],64)
# Broken-joint radial courses run out from the stamped guild seal.
for course in range(19):
    inner=1.007+course*.53
    outer=inner+.515
    count=max(10,round(TAU*(inner+outer)*.5/1.25))
    angle=(course%2)*pi/count
    for i in range(count):
        a1=angle+i*TAU/count+.010/inner
        a2=angle+(i+1)*TAU/count-.010/inner
        wedge(arena,random.choice(paving),inner,outer,a1,a2,-.034,random.uniform(-.007,.002),3)

for r in [1.0,1.09,4.68,7.83,8.03]:
    ring(arena,brass if r in [1.0,4.68,7.83] else shadow,r-.017,r+.017,.009)
for i in range(32):
    a=i*TAU/32
    for r in [4.68,7.93]:
        wedge(arena,carve,r-.075,r+.075,a-.012,a+.012,.004,.012,2)
for i in range(12):
    a=i*TAU/12
    def mark(r,t): return (r*math.cos(a+t),r*math.sin(a+t),.011)
    solid(arena,brass,[mark(.31,-.14),mark(.77,0),mark(.31,.14),mark(.20,0)],[(0,1,2,3)])
ring(arena,brass,.18,.209,.012)


def at(a,t,r,z):
    return (r*math.cos(a)-t*math.sin(a),r*math.sin(a)+t*math.cos(a),z)


def block(m,a,t,r,z,w,d,h):
    x,y,_=at(a,t,r,z)
    cuboid(arena,m,x,y,z,d,w,h,a)


def arcade(m,a,rad,depth,low,high,ang1,ang2,spring):
    vs=[]
    for rr in [rad,rad+depth]:
        for radius,ang in [(low,ang1),(low,ang2),(high,ang2),(high,ang1)]:
            vs.append(at(a,math.cos(ang)*radius,rr,spring+math.sin(ang)*radius))
    solid(arena,m,vs,[(0,1,2,3),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])


# Recessed galleries with stone voussoirs, grilles, column drums, and corbels.
for i in range(16):
    a=i*TAU/16
    rad=10.05
    ring_width=2*rad*math.tan(pi/16)
    for j in range(9):
        z=.24+j*.48
        # Dark arcade recesses are backed by masonry. Keep an open skyline.
        block(random.choice(stone),a,0,rad+.82,z,ring_width+.12,.4,.473)
    for sign in [-1,1]:
        for j in range(6):
            block(carve if j==0 else stone[(i+j)%5],a,sign*1.64,rad,z:=.20+j*.4,.80,.55,.39)
    for j in range(11):
        arcade(carve if j==5 else stone[(j+i)%5],a,rad-.28,.56,1.24,1.56,pi*j/11+.004,pi*(j+1)/11-.004,2.09)
    for t in [-.92,-.61,-.305,0,.305,.61,.92]:
        top=2.09+math.sqrt(max(0,1.24**2-t*t))
        shaft(arena,shadow,at(a,t,rad+.13,.13),at(a,t,rad+.13,top),.027,.027,6)
    for z in [.47,1.57,2.32]:
        block(shadow,a,0,rad+.12,z,2.44,.064,.060)
    for z,w,d,h in [(.14,1,.93,.28),(.36,.84,.73,.16),(2.73,.63,.65,.14),(3.42,.95,.92,.20),(3.56,1.05,1.02,.11)]:
        block(carve,a,ring_width*.5,rad,z,w,d,h)
    for j in range(7):
        block(stone[(i+j)%5],a,ring_width*.5,rad,.58+j*.413,.70,.64,.40)
    for j in range(4):
        block(stone[(i+j)%5],a,(j-1.5)*ring_width/4,rad,3.86,ring_width/4-.016,.58,.52)
    block(carve,a,0,rad,4.17,ring_width+.04,.84,.14)
    for j in [-1,0,1]:
        block(stone[(i+j)%5],a,j*1.29,rad,4.52,.70,.64,.59)
    if i%4 in [1,3]:
        # Split-tail standards and appliqued eight-pointed sun.
        vy=[(-.48,3.88),(.48,3.88),(.43,1.30),(.20,1.05),(0,1.26),(-.22,1.05),(-.42,1.32)]
        vs=[at(a,t,rad-.41+.035*math.cos(t*12),z) for t,z in vy]
        solid(arena,banner,vs,[tuple(range(len(vs)))])
        shaft(arena,brass,at(a,-.56,rad-.44,3.92),at(a,.56,rad-.44,3.92),.03,.03)
        for s in [-1,1]:
            block(cream,a,s*.377,rad-.458,2.58,.017,.01,2.45)
        for j in range(8):
            angle=j*TAU/8
            vs=[at(a,r*math.cos(angle+b),rad-.46,2.83+r*math.sin(angle+b)) for r,b in [(.08,-.28),(.345 if j%2==0 else .23,0),(.08,.28),(.04,0)]]
            solid(arena,cream,vs,[(0,1,2,3)])
    if i%2==0:
        # Eight oil braziers. Placement also documented for runtime light rigs.
        x,y,z=at(a,0,8.93,0)
        loft(arena,carve,[(0,.43,.43,x,y),(.13,.43,.43,x,y),(.22,.33,.33,x,y),(.30,.30,.30,x,y)],8,pi/8)
        loft(arena,shadow,[(.26,.26,.26,x,y),(.41,.21,.21,x,y),(1.18,.11,.11,x,y),(1.33,.17,.17,x,y),(1.38,.26,.26,x,y)],8)
        loft(arena,brass,[(1.35,.23,.23,x,y),(1.40,.28,.28,x,y),(1.46,.29,.29,x,y)],10)
        loft(arena,shadow,[(1.39,.20,.20,x,y),(1.50,.36,.36,x,y),(1.64,.41,.41,x,y)],12)
        loft(arena,coals,[(1.61,.37,.37,x,y),(1.66,.33,.33,x,y)],12)
        for j in range(9):
            phase=j*TAU/9
            dx,dy=math.cos(phase),math.sin(phase)
            shaft(arena,shadow,(x+.28*dx,y+.28*dy,1.48),(x+.40*dx,y+.40*dy,1.77),.024,.015,6)
        for j in range(8):
            phase=j*TAU/8
            dx,dy=math.cos(phase),math.sin(phase)
            v=random.uniform(.15,.26) if j else .02
            ztop=random.uniform(2.02,2.27)
            loft(arena,fire if j%3 else hot,[(1.64,.105,.11,x+v*dx,y+v*dy),(1.75,.13,.12,x+v*dx,y+v*dy),
                      (1.90,.080,.077,x+v*dx+.023,y+v*dy),(ztop,.005,.006,x+v*dx+.079,y+v*dy-.033)],6)
        for j in range(9):
            u,v=(random.uniform(-.18,.20) for _ in range(2))
            k=random.uniform(2.17,2.55)
            shaft(arena,hot,(x+u,y+v,k),(x+u+.009,y+v,k+.022),.008,.003,4)
flush()

for name, collection in library.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in collection.all_objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+".glb")), use_selection=True,
        export_format='GLB', export_animations=False, export_cameras=False, export_lights=False,
        export_yup=True, export_texcoords=False, export_tangents=False)

# Stage the editable assembly with all modules visible for artists.
library["knight"].objects.get("Knight").location=(-.9,-.7,0)
kitroot.location=(-2.0,-.7,0)
for i,name in enumerate(["sword","mace","poleaxe"]):
    obj=next(o for o in library[name].objects if o.parent is None)
    obj.location=(.8+i*.61,-.35,.52 if name=="poleaxe" else .18)

def lamp(name,pos,power,color,kind="POINT",size=1):
    light=bpy.data.lights.new(name,kind)
    light.energy=power
    light.color=color
    if kind=="AREA": light.shape='DISK'; light.size=size
    else: light.shadow_soft_size=size
    obj=bpy.data.objects.new(name,light)
    scene.collection.objects.link(obj)
    obj.location=pos
    if kind=="AREA":
        obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat('-Z','Y').to_euler()
    return obj
for i in range(8):
    a=i*TAU/8
    lamp("Brazier light %02d"%i,(8.93*math.cos(a),8.93*math.sin(a),2.2),330,(1,.38,.10),size=.32)
lamp("Cool vault",(-3,-5,8),1750,(.67,.78,1),"AREA",8)
lamp("Reflected fire",(4,1,4),1100,(1,.58,.24),"AREA",6)
world=bpy.data.worlds.new("Undercroft")
world.color=(.065,.061,.080)
scene.world=world
cam_data=bpy.data.cameras.new("Asset study")
cam=bpy.data.objects.new("Asset study",cam_data)
scene.collection.objects.link(cam)
cam.location=(3.95,-7.8,3.3)
cam.rotation_euler=(Vector((0,0,1.06))-cam.location).to_track_quat('-Z','Y').to_euler()
cam_data.lens=48
scene.camera=cam
scene.render.resolution_x,scene.render.resolution_y,scene.render.resolution_percentage=1200,750,100
bpy.ops.object.select_all(action='DESELECT')
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
        area.spaces.active.shading.color_type='MATERIAL'
        area.spaces.active.overlay.show_overlays=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/"Undercroft.blend"),compress=True)
