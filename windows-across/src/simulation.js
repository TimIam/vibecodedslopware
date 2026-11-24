import { APARTMENT_SPECS, BEHAVIOR_CATALOG, ROOM_TYPES } from './catalog.js';

export const VIEW_W = 1600;
export const VIEW_H = 900;

export const BLDG = {
  x: 307,
  y: 110,
  w: 986,
  h: 674, // 20 topPad + 8 * 74 floors + 62 lobby base = 674 -> bottom y = 784
  floors: 8,
  floorH: 74,
  winW: 86,
  winH: 50,
  innerPillar: 14,
  aptGap: 32,
  sideMargin: 32,
  topPad: 20,
  lobbyY: 722,
  streetY: 784
};

export function detectCalendarSeason() {
  const m = new Date().getMonth(); // 0=Jan..11=Dec
  if (m === 11 || m === 0 || m === 1) return 'winter';
  if (m === 9 || m === 10) return 'halloween';
  if (m >= 2 && m <= 4) return 'spring';
  return 'summer';
}

export class VoyeurSimulation {
  constructor() {
    this.frame = 0;
    this.simSpeed = 1;
    this.season = 'winter'; // default showcases both Christmas trees & Hanukkah menorahs right away
    this.weatherMode = 'auto';
    this.xrayMode = false;
    this.simTime = 22 * 60 + 35; // 22:35

    // Anti-burn-in camera: SPACED-OUT, ALMOST IMPERCEPTIBLE shifts (NOT constant!)
    this.burnInProtection = true;
    this.camX = 0;
    this.camY = 0;
    this.camFromX = 0;
    this.camFromY = 0;
    this.camTargetX = 0;
    this.camTargetY = 0;
    this.camState = 'hold'; // 'hold' | 'shifting'
    this.camTimer = 2700;   // ~45s steady hold before first whisper-slow shift
    this.camDuration = 1200; // ~20s ultra-slow glide (almost imperceptible!)

    this.lightningFlash = 0;
    this.lastTicker = 'Quiet winter night · 24 units · 41 residents';
    this.autoEventCooldown = 2900; // ~48s calm night before first natural street/building event

    this.apartments = this._buildApartments();
    this.stars = this._buildStars();
    this.skyline = this._buildSkyline();
    this.sideBuildings = this._buildSideBuildings();
    this.clouds = this._buildClouds();
    this.raindrops = this._buildRain();
    this.snowflakes = this._buildSnow();
    this.leaves = this._buildLeaves();
    this.fireflies = this._buildFireflies();

    // Street entities
    this.cars = [];
    this.pedestrians = [];
    this.fireTruck = null;
    this.policeUnit = null;
    this.ambulance = null;
    this.deliveryVan = null;
    this.ufo = null;
  }

  activeWeather() {
    if (this.weatherMode !== 'auto') return this.weatherMode;
    if (this.season === 'winter') return 'snow';
    if (this.season === 'halloween') return 'leaves';
    if (this.season === 'spring') return 'rain';
    return 'clear';
  }

  _buildApartments() {
    const unitW = 3 * BLDG.winW + 2 * BLDG.innerPillar; // 286px
    return APARTMENT_SPECS.map((spec) => {
      const baseX = BLDG.x + BLDG.sideMargin + spec.col * (unitW + BLDG.aptGap);
      const baseY = BLDG.y + BLDG.topPad + spec.floor * BLDG.floorH;

      const rooms = spec.rooms.map((type, idx) => {
        const isLit = spec.startLit === idx;
        const isTv = isLit && type === 'living' && (spec.id === '8B' || spec.id === '5B' || spec.id === '1A');
        const isMon = (spec.id === '7A' || spec.id === '6A' || spec.id === '4C' || spec.id === '2A') && type === 'office';
        return {
          idx, type,
          x: baseX + idx * (BLDG.winW + BLDG.innerPillar),
          y: baseY,
          w: BLDG.winW,
          h: BLDG.winH,
          light: isMon ? 'monitor' : (isTv ? 'tv' : (isLit ? 'warm' : 'off')),
          lightTimer: 0,
          tvOn: isTv,
          monitorOn: isMon,
          fridgeOpen: 0,
          blinds: 0.08 + (Math.random() < 0.28 ? Math.random() * 0.22 : 0),
          curtains: type === 'living' || type === 'bedroom' || type === 'dining',
          smoke: 0,
          sparks: 0,
          cameraFlash: 0,
          crimeTape: false,
          packageProp: null,
          telescope: false
        };
      });

      // Jewish households & cozy multi-lit defaults
      if (spec.decor.menorah >= 0) {
        rooms[spec.decor.menorah].light = 'dim';
      }

      const apt = {
        ...spec,
        x: baseX, y: baseY, w: unitW, h: BLDG.winH,
        rooms,
        event: null,
        powerOut: 0,
        residents: [],
        visitors: []
      };

      apt.residents = spec.residents.map((r, rIdx) => {
        const rm = rooms[r.startRoom];
        const spots = ROOM_TYPES[rm.type].spots;
        const spotKey = r.startPose === 'sleep' ? 'bed'
          : r.startPose === 'type' ? 'desk'
          : r.startPose === 'sew' ? 'sewing'
          : r.startPose === 'paint' ? 'easel'
          : r.startPose === 'cook' ? 'stove'
          : r.startPose === 'window' ? 'window'
          : (r.startPose === 'sit' || r.startPose === 'read' || r.startPose === 'instrument') ? (rm.type === 'dining' ? 'table' : 'couch')
          : 'center';
        const sx = rm.x + rm.w * (spots[spotKey] ?? 0.5) + (rIdx - 0.5) * 6;
        return {
          ...r,
          apt,
          x: sx,
          y: baseY + BLDG.winH - 4,
          targetX: sx,
          facing: rIdx % 2 === 0 ? 1 : -1,
          speed: (0.48 + Math.random() * 0.18) * (r.scale < 0.8 ? 0.85 : 1),
          state: 'acting',
          activity: r.startActivity,
          pose: r.startPose,
          timer: 280 + Math.floor(Math.random() * 1400),
          carrying: null,
          queue: [],
          walkPhase: Math.random() * 12,
          hidden: false,
          levitateY: 0,
          collapsed: false
        };
      });

      return apt;
    });
  }

  _buildStars() {
    return Array.from({ length: 120 }, () => ({
      x: -140 + Math.random() * (VIEW_W + 280),
      y: -30 + Math.random() * 240,
      phase: Math.random() * Math.PI * 2,
      size: Math.random() < 0.18 ? 2 : 1.2,
      bright: 0.25 + Math.random() * 0.75
    }));
  }

  _buildClouds() {
    return Array.from({ length: 9 }, (_, i) => ({
      x: -200 + i * 240 + Math.random() * 90,
      y: 25 + Math.random() * 110,
      w: 180 + Math.random() * 200,
      h: 26 + Math.random() * 28,
      speed: 0.04 + Math.random() * 0.05
    }));
  }

  _buildSkyline() {
    const out = [];
    let sx = -180;
    while (sx < VIEW_W + 180) {
      const w = 48 + Math.floor(Math.random() * 76);
      const h = 140 + Math.floor(Math.random() * 260);
      const dots = [];
      for (let dy = 14; dy < h - 18; dy += 14) {
        for (let dx = 8; dx < w - 10; dx += 12) {
          if (Math.random() < 0.24) {
            dots.push({ dx, dy, warm: Math.random() < 0.68, alpha: 0.18 + Math.random() * 0.28 });
          }
        }
      }
      out.push({ x: sx, w, h, dots, hasAntenna: Math.random() < 0.22 });
      sx += w - 6;
    }
    return out;
  }

  _buildSideBuildings() {
    const makeNeighbor = (x, y, w, h, cols, rows, hue) => {
      const wins = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          wins.push({
            rx: 24 + c * 74,
            ry: 32 + r * 76,
            lit: Math.random() < 0.28,
            warm: Math.random() < 0.75,
            timer: 800 + Math.floor(Math.random() * 2600)
          });
        }
      }
      return { x, y, w, h, hue, wins };
    };
    return [
      makeNeighbor(-68, 175, 360, 609, 4, 7, '#1d181e'),
      makeNeighbor(1308, 152, 360, 632, 4, 7, '#1a1921')
    ];
  }

  _buildRain() {
    return Array.from({ length: 240 }, () => ({
      x: Math.random() * VIEW_W,
      y: Math.random() * VIEW_H,
      len: 10 + Math.random() * 14,
      speed: 7 + Math.random() * 5,
      alpha: 0.1 + Math.random() * 0.18
    }));
  }

  _buildSnow() {
    return Array.from({ length: 190 }, () => ({
      x: Math.random() * VIEW_W,
      y: Math.random() * VIEW_H,
      r: 0.9 + Math.random() * 1.9,
      speed: 0.55 + Math.random() * 0.95,
      drift: Math.random() * Math.PI * 2,
      alpha: 0.35 + Math.random() * 0.5
    }));
  }

  _buildLeaves() {
    const colors = ['#d97706', '#c2410c', '#eab308', '#9a3412', '#b45309'];
    return Array.from({ length: 55 }, () => ({
      x: Math.random() * VIEW_W,
      y: Math.random() * VIEW_H,
      speed: 0.8 + Math.random() * 0.9,
      phase: Math.random() * Math.PI * 2,
      size: 2.5 + Math.random() * 2.5,
      color: colors[Math.floor(Math.random() * colors.length)]
    }));
  }

  _buildFireflies() {
    return Array.from({ length: 28 }, () => ({
      x: 40 + Math.random() * (VIEW_W - 80),
      y: 660 + Math.random() * 140,
      phase: Math.random() * Math.PI * 2,
      vx: (Math.random() - 0.5) * 0.35
    }));
  }

  getRoomAt(apt, x) {
    let best = apt.rooms[0], bestDist = Infinity;
    for (const r of apt.rooms) {
      const d = Math.abs(x - (r.x + r.w * 0.5));
      if (d < bestDist) { bestDist = d; best = r; }
    }
    return best;
  }

  roomSpotX(apt, roomType, spotName) {
    const r = apt.rooms.find(rm => rm.type === roomType) || apt.rooms[0];
    const ratio = ROOM_TYPES[r.type].spots[spotName] ?? 0.5;
    return { room: r, x: r.x + r.w * ratio };
  }

  pickRoutineChain(res) {
    const apt = res.apt;
    const has = (t) => apt.rooms.some(r => r.type === t);

    // Filter matching solo behaviors from our 100+ catalog
    const eligible = BEHAVIOR_CATALOG.solo.filter(b => {
      if (!has(b.room)) return false;
      if (b.winterMenorahOnly && !(this.season === 'winter' && apt.decor.menorah >= 0)) return false;
      if (b.winterTreeOnly && !(this.season === 'winter' && apt.decor.xmasTree >= 0)) return false;
      if (res.scale < 0.8 && (b.id === 'cook_stove' || b.id === 'work_monitor' || b.id === 'make_coffee' || b.id === 'iron_clothes')) return false;
      return true;
    });

    // Build realistic multi-room continuity chains (cook -> carry plate -> eat/watch TV)
    const roll = Math.random();
    if (roll < 0.28 && has('kitchen') && has('living') && res.scale >= 0.85) {
      return [
        { room: 'kitchen', spot: 'fridge', pose: 'reach', label: 'Getting ingredients from fridge', dur: [140, 240], fridge: true },
        { room: 'kitchen', spot: 'stove', pose: 'cook', label: 'Cooking dinner at stove', dur: [420, 740], carryAfter: 'plate' },
        { room: 'living', spot: 'couch', pose: 'sit', label: 'Eating & watching late-night TV', dur: [820, 1450], tv: true, dropCarry: true }
      ];
    }
    if (roll < 0.44 && has('kitchen') && has('living')) {
      return [
        { room: 'kitchen', spot: 'counter', pose: 'cook', label: 'Brewing warm tea', dur: [180, 320], carryAfter: 'mug' },
        { room: 'living', spot: 'window', pose: 'window', label: 'Sipping tea by the window', dur: [440, 820], dropCarry: true }
      ];
    }
    if (roll < 0.55 && has('kitchen') && has('dining') && res.scale >= 0.85) {
      return [
        { room: 'kitchen', spot: 'stove', pose: 'cook', label: 'Plating a late meal', dur: [280, 480], carryAfter: 'plate' },
        { room: 'dining', spot: 'table', pose: 'sit', label: 'Eating quietly at dining table', dur: [600, 1080], dropCarry: true }
      ];
    }
    if (roll < 0.64 && apt.residents.length >= 2 && has('living')) {
      const socialLabel = BEHAVIOR_CATALOG.social[Math.floor(Math.random() * BEHAVIOR_CATALOG.social.length)];
      return [{ room: 'living', spot: 'center', pose: Math.random() < 0.4 ? 'sway' : 'sit', label: socialLabel, dur: [540, 960] }];
    }
    if (roll < 0.70 && has('living')) {
      const qLabel = BEHAVIOR_CATALOG.quirky[Math.floor(Math.random() * BEHAVIOR_CATALOG.quirky.length)];
      return [{ room: 'living', spot: 'center', pose: 'window', label: qLabel, dur: [320, 560] }];
    }

    const chosen = eligible[Math.floor(Math.random() * eligible.length)] || BEHAVIOR_CATALOG.solo[0];
    return [{ ...chosen }];
  }

  setTicker(msg) {
    this.lastTicker = msg;
  }

  hasEmergencyArriving() {
    return (this.fireTruck && this.fireTruck.state === 'arriving')
      || (this.policeUnit && this.policeUnit.state === 'arriving')
      || (this.ambulance && this.ambulance.state === 'arriving');
  }

  triggerEvent(kind, preferredAptId = null) {
    const weighted = ['delivery', 'delivery', 'pizza', 'fire', 'murder', 'medical', 'argument', 'burglary', 'ufo', 'fuse', 'disco', 'blackout', 'telescope'];
    if (kind === 'random') kind = weighted[Math.floor(Math.random() * weighted.length)];

    const available = this.apartments.filter(a => !a.event);
    if (!available.length) return;

    let apt = preferredAptId ? available.find(a => a.id === preferredAptId) : null;
    if (!apt) {
      if (kind === 'argument' || kind === 'murder') {
        const c = available.filter(a => a.residents.length >= 2);
        apt = c[Math.floor(Math.random() * c.length)];
      } else if (kind === 'fire') {
        const c = available.filter(a => a.rooms.some(r => r.type === 'kitchen'));
        apt = c[Math.floor(Math.random() * c.length)];
      } else if (kind === 'ufo') {
        const c = available.filter(a => a.floor === 0);
        apt = c[Math.floor(Math.random() * c.length)];
      } else if (kind === 'burglary') {
        const c = available.filter(a => a.residents.length === 1);
        apt = c[Math.floor(Math.random() * c.length)];
      } else if (kind === 'medical') {
        const c = available.filter(a => a.residents.length >= 2);
        apt = c[Math.floor(Math.random() * c.length)];
      }
      if (!apt) apt = available[Math.floor(Math.random() * available.length)];
    }

    const lobbyX = BLDG.x + BLDG.w * 0.5;

    if (kind === 'delivery' || kind === 'pizza') {
      if (this.deliveryVan) return;
      const entryRoom = apt.col === 0 ? apt.rooms[2] : apt.rooms[0];
      const unboxRoom = apt.rooms[1];
      const isPizza = kind === 'pizza';
      apt.event = { type: 'delivery', isPizza, stage: 0, timer: 240, entryRoom, unboxRoom, res: apt.residents[0] };
      this.deliveryVan = {
        x: -170,
        targetX: lobbyX - 115,
        lobbyX,
        isPizza,
        state: 'arriving',
        apt,
        courier: null,
        lobbyBox: false
      };
      this.setTicker(isPizza
        ? `Street: Late-night pizza delivery pulling up for APT ${apt.id}`
        : `Street: Delivery van pulling up with parcel for APT ${apt.id}`);
    } else if (kind === 'fire') {
      const k = apt.rooms.find(r => r.type === 'kitchen') || apt.rooms[0];
      const safeRoom = apt.rooms.find(r => r !== k) || apt.rooms[1];
      apt.event = { type: 'fire', stage: 0, timer: 210, room: k, safeRoom };
      k.light = 'fire'; k.smoke = 0.55;
      apt.residents.forEach((r, i) => {
        r.queue = []; r.targetX = k.x + 36 + i * 14;
        r.activity = 'Stove catches fire — calling 911!'; r.pose = 'wave';
      });
      this.setTicker(`APT ${apt.id}: Kitchen fire breaks out!`);
    } else if (kind === 'murder') {
      const [r0, r1, r2] = apt.rooms;
      apt.event = { type: 'murder', stage: 0, timer: 160, r0, r1, r2 };
      r1.light = 'warm';
      apt.residents[0].queue = []; apt.residents[0].targetX = r1.x + 28; apt.residents[0].activity = 'Sudden violent struggle!'; apt.residents[0].pose = 'argue';
      if (apt.residents[1]) {
        apt.residents[1].queue = []; apt.residents[1].targetX = r1.x + 54; apt.residents[1].activity = 'Struggle in living room!'; apt.residents[1].pose = 'argue';
      }
      this.setTicker(`APT ${apt.id}: Sudden struggle breaks out in living room...`);
    } else if (kind === 'medical') {
      const liv = apt.rooms[1];
      apt.event = { type: 'medical', stage: 0, timer: 170, room: liv };
      liv.light = 'warm';
      apt.residents[0].queue = []; apt.residents[0].targetX = liv.x + 34; apt.residents[0].collapsed = true; apt.residents[0].activity = 'Sudden medical emergency';
      if (apt.residents[1]) {
        apt.residents[1].queue = []; apt.residents[1].targetX = liv.x + 56; apt.residents[1].pose = 'phone'; apt.residents[1].activity = 'Calling ambulance on phone!';
      }
      this.setTicker(`APT ${apt.id}: Emergency call placed — ambulance dispatched`);
    } else if (kind === 'argument') {
      const liv = apt.rooms[1], otherRoom = apt.rooms[2];
      apt.event = { type: 'argument', stage: 0, timer: 300, liv, otherRoom };
      apt.residents.slice(0, 2).forEach((r, i) => {
        r.queue = []; r.targetX = liv.x + (i === 0 ? 28 : 58); r.activity = 'Heated argument'; r.pose = 'argue';
      });
      liv.light = 'warm';
      this.setTicker(`APT ${apt.id}: Heated argument erupts`);
    } else if (kind === 'burglary') {
      apt.rooms.forEach(rm => { rm.light = 'off'; rm.tvOn = false; rm.monitorOn = false; });
      apt.residents.forEach(r => {
        r.queue = []; r.x = apt.rooms[2].x + apt.rooms[2].w * 0.66; r.targetX = r.x;
        r.pose = 'sleep'; r.activity = 'Sleeping (unaware of intruder)';
      });
      apt.visitors = [{
        kind: 'burglar', x: apt.rooms[0].x + 16, targetX: apt.rooms[1].x + 62,
        dir: 1, speed: 0.65, pose: 'search'
      }];
      apt.event = { type: 'burglary', timer: 520 };
      this.setTicker(`APT ${apt.id}: Flashlight sweeps darkened apartment...`);
    } else if (kind === 'ufo') {
      const targetRoom = apt.rooms[1], victim = apt.residents[0];
      victim.queue = []; victim.targetX = targetRoom.x + targetRoom.w * 0.5;
      victim.activity = 'Pulled toward eerie green beam!'; victim.pose = 'wave';
      apt.event = { type: 'ufo', timer: 420, room: targetRoom, victim };
      this.ufo = { apt, room: targetRoom, x: targetRoom.x + targetRoom.w * 0.5, y: -50, targetY: 46, beamAlpha: 0 };
      this.setTicker(`APT ${apt.id}: Unexplained green beam descends on rooftop!`);
    } else if (kind === 'fuse') {
      apt.event = { type: 'fuse', timer: 320 };
      apt.powerOut = 300;
      apt.rooms[0].sparks = 50;
      apt.rooms.forEach(rm => { rm.light = 'off'; rm.tvOn = false; rm.monitorOn = false; });
      apt.residents.forEach(r => { r.queue = []; r.targetX = apt.rooms[0].x + 28; r.activity = 'Checking blown breaker box'; r.pose = 'reach'; });
      this.setTicker(`APT ${apt.id}: Fuse blown — unit plunges dark`);
    } else if (kind === 'disco') {
      const liv = apt.rooms[1];
      apt.event = { type: 'disco', timer: 420, room: liv };
      liv.light = 'disco';
      apt.residents.forEach((r, i) => {
        r.queue = []; r.targetX = liv.x + 24 + i * 20; r.activity = 'Late-night living room party'; r.pose = 'dance';
      });
      this.setTicker(`APT ${apt.id}: Late-night music & strobe lights`);
    } else if (kind === 'blackout') {
      const floorIdx = apt.floor;
      const floorApts = this.apartments.filter(a => a.floor === floorIdx && !a.event);
      floorApts.forEach(fa => {
        fa.event = { type: 'fuse', timer: 240 };
        fa.powerOut = 230;
        fa.rooms[0].sparks = 30;
        fa.rooms.forEach(rm => { rm.light = 'off'; rm.tvOn = false; rm.monitorOn = false; });
      });
      this.setTicker(`Floor ${8 - floorIdx}: Brief power flicker knocks out entire floor`);
    } else if (kind === 'telescope') {
      const liv = apt.rooms[1];
      liv.telescope = true;
      liv.light = 'dim';
      apt.event = { type: 'telescope', timer: 420, room: liv };
      apt.residents[0].queue = [];
      apt.residents[0].targetX = liv.x + liv.w * 0.52;
      apt.residents[0].pose = 'window';
      apt.residents[0].activity = 'Peering right back across street with telescope';
      this.setTicker(`APT ${apt.id}: Neighbor sets up telescope aimed back at you...`);
    }
  }

  // Advance simulation by 1 tick
  step() {
    this.frame++;
    this.simTime += 0.015;
    if (this.simTime >= 24 * 60) this.simTime -= 24 * 60;

    // 1. Spaced-out, almost imperceptible anti-burn-in camera shift!
    if (this.burnInProtection) {
      this.camTimer--;
      if (this.camState === 'hold' && this.camTimer <= 0) {
        this.camState = 'shifting';
        this.camFromX = this.camX;
        this.camFromY = this.camY;
        // Pick a fresh offset at least 26px away horizontally so pixels truly rotate out
        let nextX = (Math.random() * 2 - 1) * 48;
        if (Math.abs(nextX - this.camX) < 24) nextX = this.camX > 0 ? -36 : 36;
        this.camTargetX = nextX;
        this.camTargetY = (Math.random() * 2 - 1) * 11;
        this.camDuration = 1260; // ~21 seconds ultra-gentle glide
        this.camTimer = this.camDuration;
      } else if (this.camState === 'shifting') {
        const t = 1 - Math.max(0, this.camTimer) / this.camDuration;
        // Quintic smoothstep: imperceptible acceleration & deceleration
        const ease = t * t * t * (t * (t * 6 - 15) + 10);
        this.camX = this.camFromX + (this.camTargetX - this.camFromX) * ease;
        this.camY = this.camFromY + (this.camTargetY - this.camFromY) * ease;
        if (this.camTimer <= 0) {
          this.camX = this.camTargetX;
          this.camY = this.camTargetY;
          this.camState = 'hold';
          this.camTimer = 2800 + Math.floor(Math.random() * 1800); // ~46–76s rock-steady hold
        }
      }
    } else {
      this.camX += (0 - this.camX) * 0.06;
      this.camY += (0 - this.camY) * 0.06;
    }

    // 2. Clouds & Storm Lightning
    for (const cl of this.clouds) {
      cl.x += cl.speed;
      if (cl.x > VIEW_W + 240) cl.x = -cl.w - 180;
    }
    if (this.activeWeather() === 'storm' && Math.random() < 0.003) {
      this.lightningFlash = 16;
    }
    if (this.lightningFlash > 0) this.lightningFlash--;

    // 3. Neighboring brownstones gently toggle occasional lights
    for (const sb of this.sideBuildings) {
      for (const w of sb.wins) {
        w.timer--;
        if (w.timer <= 0) {
          w.lit = Math.random() < 0.3;
          w.timer = 1400 + Math.floor(Math.random() * 3400);
        }
      }
    }

    // 4. Street traffic & occasional quiet pedestrians
    if (Math.random() < 0.0035 && this.cars.length < 3) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const palette = ['#2f3845', '#522c2c', '#2a3c52', '#474338', '#3c4552', '#5c5448'];
      this.cars.push({
        x: dir === 1 ? -140 : VIEW_W + 140,
        y: dir === 1 ? 854 : 828,
        dir,
        speed: (2.2 + Math.random() * 1.4) * dir,
        w: 62 + Math.floor(Math.random() * 14),
        color: palette[Math.floor(Math.random() * palette.length)]
      });
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      this.cars[i].x += this.cars[i].speed;
      if (this.cars[i].x < -220 || this.cars[i].x > VIEW_W + 220) this.cars.splice(i, 1);
    }

    if (Math.random() < 0.0022 && this.pedestrians.length < 2) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.pedestrians.push({
        x: dir === 1 ? -40 : VIEW_W + 40,
        y: 804,
        dir,
        speed: (0.42 + Math.random() * 0.2) * dir,
        coat: ['#2b3445', '#423638', '#333d38', '#4f4438'][Math.floor(Math.random() * 4)],
        umbrella: this.activeWeather() === 'rain' || this.activeWeather() === 'storm',
        phase: Math.random() * 10
      });
    }
    for (let i = this.pedestrians.length - 1; i >= 0; i--) {
      const p = this.pedestrians[i];
      p.x += p.speed;
      p.phase += 0.14;
      if (p.x < -80 || p.x > VIEW_W + 80) this.pedestrians.splice(i, 1);
    }

    // 5. Street service & emergency vehicles
    if (this.deliveryVan) {
      const dv = this.deliveryVan;
      if (dv.state === 'arriving') {
        dv.x += Math.min(2.6, dv.targetX - dv.x);
        if (Math.abs(dv.targetX - dv.x) < 1.5) {
          dv.x = dv.targetX; dv.state = 'dropping';
          dv.courier = { x: dv.x + 86, targetX: dv.lobbyX + 4, hasBox: true, dir: 1, returning: false, phase: 0 };
        }
      } else if (dv.state === 'dropping' && dv.courier) {
        const c = dv.courier, dx = c.targetX - c.x;
        if (Math.abs(dx) > 1.5) {
          c.x += Math.sign(dx) * 0.9; c.dir = Math.sign(dx); c.phase += 0.2;
        } else if (!c.returning) {
          c.hasBox = false; c.returning = true; dv.lobbyBox = true; c.targetX = dv.x + 76;
          const apt = dv.apt;
          if (apt.event && apt.event.type === 'delivery' && apt.event.stage === 0) {
            apt.event.stage = 1; apt.event.timer = 150;
            const er = apt.event.entryRoom;
            apt.event.res.queue = [];
            apt.event.res.targetX = apt.col === 0 ? er.x + er.w - 14 : er.x + 14;
            apt.event.res.activity = dv.isPizza ? 'Answering door for pizza' : 'Checking door for delivery';
            apt.event.res.pose = 'stand'; er.light = 'warm';
            this.setTicker(`APT ${apt.id}: ${dv.isPizza ? 'Pizza' : 'Package'} left at entrance — checking door`);
          }
        } else { dv.courier = null; dv.state = 'leaving'; }
      } else if (dv.state === 'leaving') {
        dv.x += 2.6;
        if (dv.x > VIEW_W + 180) this.deliveryVan = null;
      }
    }

    if (this.fireTruck) {
      const ft = this.fireTruck;
      if (ft.state === 'arriving') {
        ft.x += Math.min(3.1, ft.targetX - ft.x);
        if (Math.abs(ft.targetX - ft.x) < 2) { ft.x = ft.targetX; ft.state = 'parked'; }
      } else if (ft.state === 'leaving') {
        ft.x += 2.6;
        if (ft.x > VIEW_W + 220) this.fireTruck = null;
      }
    }

    if (this.policeUnit) {
      const pu = this.policeUnit;
      if (pu.state === 'arriving') {
        pu.x += Math.min(3.4, pu.targetX - pu.x);
        if (Math.abs(pu.targetX - pu.x) < 2) { pu.x = pu.targetX; pu.state = 'parked'; }
      } else if (pu.state === 'leaving') {
        pu.x += 2.9;
        if (pu.x > VIEW_W + 180) this.policeUnit = null;
      }
    }

    if (this.ambulance) {
      const am = this.ambulance;
      if (am.state === 'arriving') {
        am.x += Math.min(3.2, am.targetX - am.x);
        if (Math.abs(am.targetX - am.x) < 2) { am.x = am.targetX; am.state = 'parked'; }
      } else if (am.state === 'leaving') {
        am.x += 2.7;
        if (am.x > VIEW_W + 190) this.ambulance = null;
      }
    }

    // 6. Calm rare-event director
    this.autoEventCooldown--;
    if (this.autoEventCooldown <= 0) {
      this.triggerEvent('random');
      this.autoEventCooldown = 2900 + Math.floor(Math.random() * 2400);
    }

    // 7. Update all 24 apartments & 43 residents
    for (const apt of this.apartments) {
      if (apt.powerOut > 0) apt.powerOut--;
      for (const rm of apt.rooms) {
        if (rm.fridgeOpen > 0) rm.fridgeOpen--;
        if (rm.sparks > 0) rm.sparks--;
        if (rm.cameraFlash > 0) rm.cameraFlash--;
        if (rm.smoke > 0 && (!apt.event || apt.event.type !== 'fire' || apt.event.stage >= 2)) {
          rm.smoke = Math.max(0, rm.smoke - 0.006);
        }
      }

      for (const v of apt.visitors) {
        const dx = v.targetX - v.x;
        if (Math.abs(dx) > 1.2) {
          v.x += Math.sign(dx) * Math.min(Math.abs(dx), v.speed);
          v.dir = Math.sign(dx);
          v.walkPhase = (v.walkPhase || 0) + 0.18;
          v.moving = true;
        } else v.moving = false;
      }

      if (apt.event) {
        this._stepApartmentEvent(apt);
      }

      for (const res of apt.residents) {
        if (res.hidden || res.collapsed) continue;
        const dx = res.targetX - res.x;
        if (Math.abs(dx) > 1.2) {
          res.x += Math.sign(dx) * Math.min(Math.abs(dx), res.speed);
          res.facing = Math.sign(dx);
          res.walkPhase += 0.16;
          res.state = 'walking';
          if (apt.powerOut <= 0 && (!apt.event || apt.event.type === 'argument' || apt.event.type === 'delivery')) {
            const curRoom = this.getRoomAt(apt, res.x);
            if (curRoom.light === 'off') curRoom.light = 'warm';
          }
        } else {
          res.state = 'acting';
          if (!apt.event) {
            res.timer--;
            if (res.timer <= 0) {
              if (res.currentStep && res.currentStep.carryAfter) res.carrying = res.currentStep.carryAfter;
              if (res.queue.length === 0) res.queue = this.pickRoutineChain(res);
              const next = res.queue.shift();
              res.currentStep = next;
              const { room, x } = this.roomSpotX(apt, next.room, next.spot);
              res.targetX = x + (Math.random() * 10 - 5);
              res.pose = next.pose;
              res.activity = next.label;
              res.timer = next.dur[0] + Math.floor(Math.random() * (next.dur[1] - next.dur[0]));
              if (next.dropCarry) res.carrying = null;
              if (next.fridge) room.fridgeOpen = 110;
              if (next.toggleBlinds) room.blinds = room.blinds > 0.25 ? 0.08 : 0.42;
              if (apt.powerOut <= 0) {
                room.tvOn = !!next.tv;
                if (next.monitor) room.monitorOn = true;
                room.light = next.dimRoom
                  ? (apt.decor.menorah === room.idx && this.season === 'winter' ? 'dim' : 'off')
                  : (next.tv ? 'tv' : (next.monitor ? 'monitor' : 'warm'));
              }
            }
          }
        }
      }

      if (!apt.event && apt.powerOut <= 0) {
        for (const rm of apt.rooms) {
          const occupied = apt.residents.some(r => !r.hidden && this.getRoomAt(apt, r.x) === rm);
          if (!occupied) {
            rm.lightTimer++;
            if (rm.lightTimer > 320 && rm.light !== 'off') {
              rm.light = (this.season === 'winter' && apt.decor.menorah === rm.idx) ? 'dim' : 'off';
              rm.tvOn = false;
              rm.lightTimer = 0;
            }
          } else rm.lightTimer = 0;
        }
      }
    }
  }

  _stepApartmentEvent(apt) {
    const ev = apt.event;
    ev.timer--;

    if (ev.type === 'delivery') {
      if (ev.stage === 1 && ev.res.state === 'acting') {
        if (this.deliveryVan && this.deliveryVan.apt === apt) this.deliveryVan.lobbyBox = false;
        ev.stage = 2; ev.timer = 280;
        ev.res.carrying = ev.isPizza ? 'pizza' : 'box';
        ev.res.targetX = ev.unboxRoom.x + ev.unboxRoom.w * 0.48;
        ev.res.activity = ev.isPizza ? 'Carrying pizza box to living room' : 'Carrying parcel to living room';
        ev.unboxRoom.light = 'warm';
      } else if (ev.stage === 2 && ev.res.state === 'acting') {
        ev.stage = 3; ev.timer = 260;
        ev.res.carrying = null; ev.res.pose = 'unbox';
        ev.res.activity = ev.isPizza ? 'Opening pizza box' : 'Opening delivered package!';
        ev.unboxRoom.packageProp = { x: ev.res.x + ev.res.facing * 12, opened: false, isPizza: ev.isPizza };
        this.setTicker(`APT ${apt.id}: ${ev.res.name} is opening their ${ev.isPizza ? 'pizza' : 'delivery'}`);
      } else if (ev.stage === 3) {
        if (ev.timer === 140 && ev.unboxRoom.packageProp) {
          ev.unboxRoom.packageProp.opened = true;
          ev.res.activity = ev.isPizza ? 'Grabbing a hot slice' : 'Inspecting new item from box';
          ev.res.pose = 'reach';
        }
        if (ev.timer <= 0) {
          ev.unboxRoom.packageProp = null; ev.res.timer = 110; apt.event = null;
        }
      }
    } else if (ev.type === 'fire') {
      if (ev.stage === 0) {
        ev.room.smoke = Math.min(1, ev.room.smoke + 0.015);
        if (ev.timer === 130) {
          apt.residents.forEach((r, i) => {
            r.targetX = ev.safeRoom.x + 28 + i * 16; r.activity = 'Retreating from kitchen smoke'; r.pose = 'phone';
          });
          ev.safeRoom.light = 'warm';
        }
        if (ev.timer <= 0) {
          ev.stage = 1; ev.timer = 220;
          this.fireTruck = { x: -200, targetX: Math.max(320, Math.min(1080, apt.x + 40)), state: 'arriving', apt };
          this.setTicker(`APT ${apt.id}: Fire truck pulls up outside!`);
        }
      } else if (ev.stage === 1) {
        ev.room.smoke = Math.min(1, ev.room.smoke + 0.01);
        if (this.fireTruck && this.fireTruck.state === 'parked' && apt.visitors.length === 0) {
          apt.visitors.push(
            { kind: 'firefighter', x: ev.safeRoom.x + 42, targetX: ev.room.x + 44, dir: ev.room.x < ev.safeRoom.x ? -1 : 1, speed: 0.62, pose: 'spray' },
            { kind: 'firefighter', x: ev.safeRoom.x + 26, targetX: ev.room.x + 62, dir: ev.room.x < ev.safeRoom.x ? -1 : 1, speed: 0.56, pose: 'stand' }
          );
          this.setTicker(`APT ${apt.id}: Firefighters enter to extinguish stove`);
        }
        if (ev.timer <= 0) {
          ev.stage = 2; ev.timer = 240; ev.room.light = 'warm';
          apt.residents.forEach(r => { r.activity = 'Watching firefighters ventilate kitchen'; r.pose = 'stand'; });
          this.setTicker(`APT ${apt.id}: Fire extinguished — ventilating smoke`);
        }
      } else if (ev.stage === 2) {
        if (ev.timer === 90) apt.visitors.forEach(v => { v.pose = 'stand'; v.targetX = ev.safeRoom.x + 44; });
        if (ev.timer <= 0) {
          apt.visitors = [];
          if (this.fireTruck && this.fireTruck.apt === apt) this.fireTruck.state = 'leaving';
          apt.event = null; apt.residents.forEach(r => r.timer = 90);
          this.setTicker(`APT ${apt.id}: Fire truck departs — scene safe`);
        }
      }
    } else if (ev.type === 'murder') {
      if (ev.stage === 0 && ev.timer <= 0) {
        ev.stage = 1; ev.timer = 240; ev.r1.light = 'dim'; ev.r0.light = 'dim';
        if (apt.residents[1]) { apt.residents[1].hidden = true; apt.residents[1].activity = '(Victim)'; }
        apt.residents[0].carrying = 'rug'; apt.residents[0].targetX = ev.r0.x + 22;
        apt.residents[0].activity = 'Dragging rolled rug across rooms...';
        this.setTicker(`APT ${apt.id}: Silhouette drags heavy rolled rug across rooms...`);
      } else if (ev.stage === 1 && ev.timer <= 0) {
        ev.stage = 2; ev.timer = 160; apt.residents[0].carrying = null; apt.residents[0].hidden = true; apt.residents[0].activity = '(Fled scene)';
        ev.r0.light = 'off'; ev.r1.light = 'off';
        this.policeUnit = { x: -150, targetX: Math.max(330, Math.min(1140, apt.x + 70)), state: 'arriving', apt };
        this.setTicker(`APT ${apt.id}: Police cruiser arrives on scene`);
      } else if (ev.stage === 2 && ev.timer <= 0) {
        ev.stage = 3; ev.timer = 520;
        apt.rooms.forEach(rm => { rm.light = 'inspect'; rm.crimeTape = true; });
        apt.visitors = [
          { kind: 'detective', x: ev.r0.x + 30, targetX: ev.r1.x + 38, dir: 1, speed: 0.48, pose: 'inspect', wayIdx: 0, waypoints: [ev.r1.x + 38, ev.r0.x + 28, ev.r2.x + 40, ev.r1.x + 56] },
          { kind: 'police', x: ev.r2.x + 48, targetX: ev.r1.x + 64, dir: -1, speed: 0.52, pose: 'notes', wayIdx: 0, waypoints: [ev.r1.x + 64, ev.r2.x + 32, ev.r0.x + 54] }
        ];
        this.setTicker(`APT ${apt.id}: Police & detectives inspecting rooms`);
      } else if (ev.stage === 3) {
        for (const v of apt.visitors) {
          if (!v.moving && this.frame % 105 === 0) {
            v.wayIdx = (v.wayIdx + 1) % v.waypoints.length; v.targetX = v.waypoints[v.wayIdx];
          }
          if (v.kind === 'detective' && !v.moving && this.frame % 75 === 0) {
            this.getRoomAt(apt, v.x).cameraFlash = 12;
          }
        }
        if (ev.timer <= 0) {
          apt.visitors = [];
          apt.rooms.forEach(rm => { rm.crimeTape = false; rm.light = 'off'; });
          if (this.policeUnit && this.policeUnit.apt === apt) this.policeUnit.state = 'leaving';
          apt.residents.forEach((r, idx) => {
            r.hidden = false; r.x = apt.rooms[Math.min(idx + 1, 2)].x + 42; r.targetX = r.x;
            r.pose = 'sleep'; r.activity = 'Unit quiet after investigation'; r.timer = 320;
          });
          apt.event = null;
          this.setTicker(`APT ${apt.id}: Inspectors depart — scene cleared`);
        }
      }
    } else if (ev.type === 'medical') {
      if (ev.stage === 0 && ev.timer <= 0) {
        ev.stage = 1; ev.timer = 260;
        this.ambulance = { x: -160, targetX: Math.max(330, Math.min(1120, apt.x + 60)), state: 'arriving', apt };
        this.setTicker(`APT ${apt.id}: Ambulance pulls up outside`);
      } else if (ev.stage === 1) {
        if (this.ambulance && this.ambulance.state === 'parked' && apt.visitors.length === 0) {
          apt.visitors.push({ kind: 'medic', x: ev.room.x + 16, targetX: ev.room.x + 40, dir: 1, speed: 0.6, pose: 'crouch' });
          this.setTicker(`APT ${apt.id}: Paramedic assisting resident inside`);
        }
        if (ev.timer <= 0) {
          apt.residents[0].collapsed = false; apt.residents[0].pose = 'sit'; apt.residents[0].activity = 'Recovering on sofa';
          apt.visitors = [];
          if (this.ambulance && this.ambulance.apt === apt) this.ambulance.state = 'leaving';
          apt.event = null; apt.residents.forEach(r => r.timer = 140);
          this.setTicker(`APT ${apt.id}: Ambulance departs — resident stabilized`);
        }
      }
    } else if (ev.type === 'argument') {
      if (ev.stage === 0 && ev.timer <= 140) {
        ev.stage = 1;
        if (apt.residents[1]) {
          apt.residents[1].targetX = ev.otherRoom.x + 44; apt.residents[1].activity = 'Stormed into next room'; apt.residents[1].pose = 'window';
        }
        apt.residents[0].activity = 'Cooling off after argument'; apt.residents[0].pose = 'window';
      }
      if (ev.timer <= 0) { apt.event = null; apt.residents.forEach(r => r.timer = 120); }
    } else if (ev.type === 'fuse') {
      if (ev.timer <= 0) {
        apt.rooms[0].light = 'warm'; apt.rooms[1].light = 'warm';
        apt.event = null; apt.residents.forEach(r => r.timer = 120);
      }
    } else if (ev.type === 'disco') {
      if (ev.timer <= 0) { ev.room.light = 'warm'; apt.event = null; apt.residents.forEach(r => r.timer = 120); }
    } else if (ev.type === 'burglary') {
      const b = apt.visitors[0];
      if (b && !b.moving) b.targetX = b.dir > 0 ? apt.rooms[0].x + 18 : apt.rooms[1].x + 64;
      if (ev.timer <= 0) {
        apt.visitors = []; apt.event = null; apt.residents.forEach(r => r.timer = 160);
        this.setTicker(`APT ${apt.id}: Intruder slips back into the night`);
      }
    } else if (ev.type === 'ufo') {
      if (this.ufo) {
        if (ev.timer > 330) { this.ufo.y += (this.ufo.targetY - this.ufo.y) * 0.06; this.ufo.beamAlpha = Math.min(1, this.ufo.beamAlpha + 0.03); }
        else if (ev.timer > 100) { this.ufo.beamAlpha = 0.85 + Math.sin(this.frame * 0.22) * 0.15; ev.room.light = 'ufo'; ev.victim.levitateY = Math.min(18, ev.victim.levitateY + 0.14); }
        else { this.ufo.beamAlpha = Math.max(0, this.ufo.beamAlpha - 0.035); this.ufo.y -= 1.4; ev.victim.levitateY = Math.max(0, ev.victim.levitateY - 0.35); ev.room.light = 'warm'; }
      }
      if (ev.timer <= 0) {
        ev.victim.levitateY = 0; ev.victim.timer = 140; apt.event = null; this.ufo = null;
        this.setTicker(`APT ${apt.id}: Unexplained beam vanishes into night sky`);
      }
    } else if (ev.type === 'telescope') {
      if (ev.timer <= 0) {
        ev.room.telescope = false; apt.event = null; apt.residents[0].timer = 140;
      }
    }
  }
}
