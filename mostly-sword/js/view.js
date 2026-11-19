import * as T from '../vendor/three.js';
import { blade, clamp, weapons } from './arena.js';
import { startFall } from './fall.js';
const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const up = v(0, 1, 0);
const lengths = [1.23, 0.845, 1.6];
function aimJoint(joint, child, target) {
  const dir = joint.parent.worldToLocal(target.clone()).sub(joint.position).normalize();
  joint.quaternion.setFromUnitVectors(child.position.clone().normalize(), dir);
  joint.updateWorldMatrix(false, true);
}
function reach(rig, side, goal) {
  const arm = rig['UpperArm' + side],
    elbow = rig['Forearm' + side],
    hand = rig['Hand' + side];
  const origin = arm.getWorldPosition(v()),
    delta = goal.clone().sub(origin),
    len = delta.length();
  delta.normalize();
  const a = elbow.position.length(),
    b = hand.position.length(),
    d = clamp(len, 0.04, a + b - 0.001);
  const axial = (a * a - b * b + d * d) / (2 * d);
  const outward = v(side === 'R' ? -1 : 1, -0.68, -0.5).applyQuaternion(rig.root.quaternion);
  outward.addScaledVector(delta, -outward.dot(delta)).normalize();
  const mid = origin
    .clone()
    .addScaledVector(delta, axial)
    .addScaledVector(outward, Math.sqrt(Math.max(0, a * a - axial * axial)));
  aimJoint(arm, elbow, mid);
  aimJoint(elbow, hand, goal);
}
export async function createView(canvas) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.13;
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(41, 1, 0.07, 64);
  scene.background = new T.Color(0x262b2b);
  scene.fog = new T.FogExp2(0x333537, 0.047);
  // Soft studio strips give polished armor recognizable reflections inside the stone ring.
  const studio = new T.Scene();
  studio.background = new T.Color(0x343835);
  for (const [x, y, z, w, h, color] of [
    [-3, 4, 2, 3, 5, 0xffe6bb],
    [4, 3, -4, 1.5, 6, 0xc0d8ef],
    [0, 6, 0, 5, 2, 0xffffff]
  ]) {
    const panel = new T.Mesh(
      new T.PlaneGeometry(w, h),
      new T.MeshBasicMaterial({ color, side: T.DoubleSide })
    );
    panel.position.set(x, y, z);
    panel.lookAt(0, 0, 0);
    studio.add(panel);
  }
  const pmrem = new T.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio, 0.04).texture;
  pmrem.dispose();
  scene.add(new T.HemisphereLight(0xc3d2d6, 0x64513f, 0.95));
  const key = new T.DirectionalLight(0xffddab, 2.2);
  key.position.set(-6, 10, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, far: 32 });
  key.shadow.normalBias = 0.025;
  scene.add(key);
  const rim = new T.DirectionalLight(0xaacde6, 2.1);
  rim.position.set(4, 5, -5);
  scene.add(rim);
  const loader = new T.GLTFLoader();
  const [arena, knight, ...equipment] = await Promise.all(
    ['arena', 'knight', ...weapons.map((w) => w.mesh)].map(
      async (name) =>
        (await loader.loadAsync(new URL('../assets/' + name + '.glb', import.meta.url).href)).scene
    )
  );
  arena.traverse((o) => {
    if (o.isMesh) {
      o.receiveShadow = true;
    }
  });
  scene.add(arena);
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 64;
  const ctx = glowCanvas.getContext('2d'),
    grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,225,156,.68)');
  grad.addColorStop(0.19, 'rgba(255,166,65,.32)');
  grad.addColorStop(1, 'rgba(255,135,30,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const glowMap = new T.CanvasTexture(glowCanvas),
    fires = [];
  for (let i = 0; i < 8; i++) {
    const ang = (i * Math.PI) / 4,
      x = 8.93 * Math.cos(ang),
      z = 8.93 * Math.sin(ang);
    const sprite = new T.Sprite(
      new T.SpriteMaterial({
        map: glowMap,
        transparent: true,
        blending: T.AdditiveBlending,
        depthWrite: false
      })
    );
    sprite.position.set(x, 2.13, z);
    scene.add(sprite);
    fires.push(sprite);
    if (i % 2 === 0) {
      const lamp = new T.PointLight(0xffa33d, 42, 7, 2);
      lamp.position.set(x, 2.65, z);
      scene.add(lamp);
    }
  }
  function makeRig(i) {
    const root = knight.clone(true);
    scene.add(root);
    const rig = { root };
    root.traverse((o) => {
      rig[o.name] = o;
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      const tint = (m) => {
        if (m.name !== 'Tabard') return m;
        const cloth = m.clone();
        cloth.color.set(i ? 0x963d33 : 0x527956);
        return cloth;
      };
      o.material = Array.isArray(o.material) ? o.material.map(tint) : tint(o.material);
    });
    rig.gear = equipment.map((model) => {
      const copy = model.clone(true);
      copy.traverse((m) => {
        if (m.isMesh) m.castShadow = true;
      });
      scene.add(copy);
      return copy;
    });
    return rig;
  }
  const rigs = [makeRig(0), makeRig(1)],
    drops = [];
  for (let i = 0; i < 2; i++) {
    const set = equipment.map((model) => {
      const m = model.clone(true);
      scene.add(m);
      return m;
    });
    drops.push(set);
  }
  const sparkGeo = new T.BufferGeometry(),
    sparks = [],
    positions = new Float32Array(24 * 3);
  sparkGeo.setAttribute('position', new T.BufferAttribute(positions, 3));
  sparkGeo.setDrawRange(0, 0);
  const sparkCloud = new T.Points(
    sparkGeo,
    new T.PointsMaterial({ color: 0xffd58e, size: 0.055, transparent: true, depthWrite: false })
  );
  sparkCloud.frustumCulled = false;
  scene.add(sparkCloud);
  const seal = new T.Mesh(
    new T.RingGeometry(1.17, 1.195, 80),
    new T.MeshBasicMaterial({
      color: 0xffd28a,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      side: T.DoubleSide
    })
  );
  seal.rotation.x = -Math.PI / 2;
  seal.position.y = 0.035;
  scene.add(seal);
  const moon = new T.Color(0x1b2328),
    hall = new T.Color(0x333537);
  function burst(e) {
    if (e.type === 'equip') return;
    for (let i = 0; i < (e.type === 'clash' ? 18 : 8); i++)
      sparks.push({
        pos: v(...e.pos),
        vel: v((Math.random() - 0.5) * 3, Math.random() * 2.8, (Math.random() - 0.5) * 3),
        life: 0.16 + Math.random() * 0.22
      });
  }
  function pose(p, i, now, dt) {
    const rig = rigs[i],
      root = rig.root;
    if (p.down > 0) {
      if (!rig.fall) rig.fall = startFall(rig, rig.gear, p);
      rig.fall.update(dt);
      return;
    }
    if (rig.fall) {
      rig.fall.reset();
      rig.fall = null;
    }
    const speed = Math.min(1, Math.hypot(p.vx, p.vz));
    root.position.set(p.x, 0, p.z);
    root.rotation.set(0, p.face, 0);
    rig.Hips.position.y =
      0.91 - 0.05 * speed + 0.022 * Math.sin(p.walk * 2) * speed - 0.18 * (p.stun ? 1 : 0);
    rig.Hips.rotation.set(-0.1 * p.recoil, 0, 0.14 * (p.stun ? 1 : 0));
    rig.Chest.rotation.set(0.08 + p.recoil * 0.21, p.yaw * 0.12, 0.03 * Math.sin(p.walk) * speed);
    rig.Head.rotation.set(-0.04 - p.recoil * 0.14, -p.yaw * 0.1, 0);
    for (const [k, sign] of [
      ['L', 1],
      ['R', -1]
    ]) {
      const stride = Math.sin(p.walk) * sign * speed;
      rig['Thigh' + k].rotation.set(-0.15 + stride * 0.52 - 0.43 * (p.stun ? 1 : 0), 0, sign * 0.11);
      rig['Shin' + k].rotation.x = 0.25 + Math.max(0, -stride) * 0.52 + 0.69 * (p.stun ? 1 : 0);
    }
    root.updateMatrixWorld(true);
    const [h, t] = blade(p),
      hand = v(...h),
      tip = v(...t),
      dir = tip.clone().sub(hand).normalize();
    reach(rig, 'R', hand);
    const leftGoal =
      p.short || p.guard || p.weapon === 2
        ? hand.clone().addScaledVector(dir, p.short ? 0.24 : 0.1)
        : root.localToWorld(v(0.29, 1.05 + 0.035 * Math.sin(now * 2), 0.25));
    reach(rig, 'L', leftGoal);
    rig.gear.forEach((m, k) => {
      m.visible = k === p.weapon;
      if (m.visible) {
        m.position.copy(hand);
        m.quaternion.setFromUnitVectors(up, dir);
        const scale = weapons[k].reach / lengths[k];
        m.scale.setScalar(scale);
        if (p.short) m.position.addScaledVector(dir, -weapons[k].reach * 0.29);
      }
    });
  }
  const watch = v(),
    focus = v();
  let lastMode = '',
    cw = 0,
    ch = 0;
  function draw(g, mode, local, dt, now) {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (w !== cw || h !== ch) {
      cw = w;
      ch = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const abyss = g.solo && mode !== 'menu';
    scene.fog.density = abyss ? 0.092 : 0.047;
    scene.fog.color.copy(abyss ? moon : hall);
    key.intensity = abyss ? 1.35 : 2.2;
    seal.visible = abyss && g.scouting;
    if (seal.visible) seal.material.opacity = 0.57 + 0.33 * Math.sin(now * 2.5);
    for (let i = 0; i < 2; i++) {
      pose(g.p[i], i, now, dt);
      const visible = !(i === 1 && seal.visible);
      rigs[i].root.visible = visible;
      if (!visible) for (const m of rigs[i].gear) m.visible = false;
      drops[i].forEach((m, k) => {
        const drop = g.loot[i];
        m.visible = drop?.w === k && mode !== 'menu';
        if (m.visible) {
          m.position.set(drop.x, 0.12, drop.z);
          m.rotation.set(0.12, 0.36 + i, Math.PI * 0.49);
          m.scale.setScalar(0.89);
        }
      });
    }
    fires.forEach((s, i) => s.scale.setScalar(1.7 + Math.sin(now * 7 + i) * 0.1));
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      if (s.life < 0) sparks.splice(i, 1);
      else {
        s.vel.y -= dt * 6;
        s.pos.addScaledVector(s.vel, dt);
      }
    }
    sparks.slice(-24).forEach((s, i) => s.pos.toArray(positions, i * 3));
    sparkGeo.setDrawRange(0, Math.min(24, sparks.length));
    sparkGeo.attributes.position.needsUpdate = true;
    const menu = mode === 'menu',
      p = g.p[local],
      o = g.p[1 - local];
    let eye, target;
    if (menu) {
      const orbit = 0.09 * Math.sin(now * 0.13);
      eye = v(3.8 + orbit, 1.46, 3.33 - orbit);
      target = v(0, 1.04, 0);
      camera.filmOffset = camera.aspect > 1.1 ? -6 : 0;
    } else {
      camera.filmOffset = 0;
      const dx = Math.sin(p.face),
        dz = Math.cos(p.face),
        wide = camera.aspect < 0.95 ? 1.26 : 1;
      eye = v(p.x - dx * 3.4 * wide + dz * 0.78, 2.16, p.z - dz * 3.4 * wide - dx * 0.78);
      const r = Math.hypot(eye.x, eye.z);
      if (r > 9.15) {
        eye.x *= 9.15 / r;
        eye.z *= 9.15 / r;
      }
      target = v(p.x + (o.x - p.x) * 0.46, 1.02, p.z + (o.z - p.z) * 0.46);
    }
    if (lastMode !== mode) {
      watch.copy(eye);
      focus.copy(target);
      lastMode = mode;
    }
    watch.lerp(eye, 1 - Math.exp(-dt * 7));
    focus.lerp(target, 1 - Math.exp(-dt * 10));
    camera.position.copy(watch);
    camera.lookAt(focus);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
  return { draw, burst };
}
