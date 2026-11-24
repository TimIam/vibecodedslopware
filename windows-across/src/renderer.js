import { BLDG, VIEW_H, VIEW_W } from './simulation.js';
import { ROOM_TYPES } from './catalog.js';

export class VoyeurRenderer {
  constructor(canvas, sim) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sim = sim;
    this.hoveredAptId = null;
    this.selectedAptId = null;
    this.facadeCache = this._bakeBrickFacade();
    this.crescentCache = this._bakeCrescentMoon();
    this.grainCache = this._bakeSubtleGrain();
  }

  // Pre-bake seamless crescent moon using destination-out so no dark circle shows over the glow halo
  _bakeCrescentMoon() {
    const off = document.createElement('canvas');
    off.width = 64; off.height = 64;
    const c = off.getContext('2d');
    c.fillStyle = '#eaf2ff';
    c.beginPath(); c.arc(32, 32, 16, 0, Math.PI * 2); c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.arc(39, 28, 14.5, 0, Math.PI * 2); c.fill();
    return off;
  }

  // Subtle nocturnal photographic grain overlay (tiled cheaply for distant filmic realism)
  _bakeSubtleGrain() {
    const off = document.createElement('canvas');
    off.width = 160; off.height = 160;
    const c = off.getContext('2d');
    const img = c.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() > 0.5 ? 255 : 0;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v;
      img.data[i + 3] = 7; // ultra-subtle ~2.7% filmic texture
    }
    c.putImageData(img, 0, 0);
    return off;
  }

  // Pre-bake weathered brownstone/urban brick masonry, stone lintels, sills & recessed window cutouts
  _bakeBrickFacade() {
    const off = document.createElement('canvas');
    off.width = BLDG.w + 40;
    off.height = BLDG.h + 40;
    const c = off.getContext('2d');
    const ox = 20, oy = 20;

    c.save();
    c.beginPath();
    c.rect(ox, oy, BLDG.w, BLDG.h);
    for (const apt of this.sim.apartments) {
      for (const rm of apt.rooms) {
        c.rect(ox + (rm.x - BLDG.x), oy + (rm.y - BLDG.y), rm.w, rm.h);
      }
    }
    c.clip('evenodd');

    // Deep atmospheric masonry base
    const baseGrad = c.createLinearGradient(0, oy, 0, oy + BLDG.h);
    baseGrad.addColorStop(0, '#2e2226');
    baseGrad.addColorStop(0.45, '#261c20');
    baseGrad.addColorStop(0.86, '#1d161a');
    baseGrad.addColorStop(1, '#19171e');
    c.fillStyle = baseGrad;
    c.fillRect(ox, oy, BLDG.w, BLDG.h);

    // Weathered individual bricks with organic mortar variation
    const brickH = 6;
    const brickW = 16;
    for (let row = 0; row < Math.ceil((BLDG.lobbyY - BLDG.y) / brickH); row++) {
      const by = oy + row * brickH;
      const stagger = (row % 2) * (brickW / 2);
      for (let bx = ox - stagger; bx < ox + BLDG.w; bx += brickW) {
        const hash = Math.sin(bx * 12.9898 + by * 78.233) * 43758.5453;
        const frac = hash - Math.floor(hash);
        const shade = Math.floor((frac - 0.5) * 20);
        const warmShift = frac > 0.72 ? 5 : 0;
        c.fillStyle = `rgb(${44 + shade + warmShift}, ${31 + Math.floor(shade * 0.65)}, ${34 + Math.floor(shade * 0.65)})`;
        c.fillRect(bx + 1, by + 1, brickW - 1.2, brickH - 1.1);
      }
      c.fillStyle = 'rgba(8, 6, 10, 0.34)';
      c.fillRect(ox, by, BLDG.w, 1);
    }

    // Subtle side edge ambient occlusion & pilaster shadows
    const leftEdge = c.createLinearGradient(ox, 0, ox + 26, 0);
    leftEdge.addColorStop(0, 'rgba(0,0,0,0.42)');
    leftEdge.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = leftEdge; c.fillRect(ox, oy, 26, BLDG.h);

    const rightEdge = c.createLinearGradient(ox + BLDG.w, 0, ox + BLDG.w - 26, 0);
    rightEdge.addColorStop(0, 'rgba(0,0,0,0.42)');
    rightEdge.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = rightEdge; c.fillRect(ox + BLDG.w - 26, oy, 26, BLDG.h);

    // Subtle vertical pilasters between the 3 apartment stacks
    for (let col = 1; col < 3; col++) {
      const gx = ox + BLDG.sideMargin + col * (3 * BLDG.winW + 2 * BLDG.innerPillar) + (col - 1) * BLDG.aptGap;
      const colGrad = c.createLinearGradient(gx, 0, gx + BLDG.aptGap, 0);
      colGrad.addColorStop(0, 'rgba(0,0,0,0.28)');
      colGrad.addColorStop(0.5, 'rgba(255,255,255,0.035)');
      colGrad.addColorStop(1, 'rgba(0,0,0,0.28)');
      c.fillStyle = colGrad;
      c.fillRect(gx, oy, BLDG.aptGap, BLDG.lobbyY - BLDG.y);
    }

    // Ground-floor cut limestone rusticated base
    const lobTop = oy + (BLDG.lobbyY - BLDG.y);
    const stoneGrad = c.createLinearGradient(0, lobTop, 0, oy + BLDG.h);
    stoneGrad.addColorStop(0, '#322e36');
    stoneGrad.addColorStop(1, '#1d1b22');
    c.fillStyle = stoneGrad;
    c.fillRect(ox, lobTop, BLDG.w, oy + BLDG.h - lobTop);
    c.fillStyle = 'rgba(255,255,255,0.09)';
    c.fillRect(ox - 3, lobTop, BLDG.w + 6, 3);
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(ox, lobTop + 3, BLDG.w, 4);
    for (let sy = lobTop + 14; sy < oy + BLDG.h; sy += 14) {
      c.fillStyle = 'rgba(0,0,0,0.28)';
      c.fillRect(ox, sy, BLDG.w, 1);
      for (let sx = ox + ((sy % 28 === 0) ? 0 : 18); sx < ox + BLDG.w; sx += 36) {
        c.fillRect(sx, sy, 1, 14);
      }
    }

    // Architectural stone belt courses on key floors
    for (let f = 0; f < BLDG.floors; f++) {
      const ly = oy + BLDG.topPad + f * BLDG.floorH + BLDG.winH + 3;
      if (f === 0 || f === 3 || f === 7) {
        c.fillStyle = '#403942';
        c.fillRect(ox - 4, ly + 2, BLDG.w + 8, 4);
        c.fillStyle = 'rgba(255,255,255,0.07)';
        c.fillRect(ox - 4, ly + 2, BLDG.w + 8, 1);
        c.fillStyle = 'rgba(0,0,0,0.48)';
        c.fillRect(ox - 2, ly + 6, BLDG.w + 4, 4);
      }
    }

    // Window stone lintels, recessed jambs, sills & subtle rain streaks
    for (const apt of this.sim.apartments) {
      for (const rm of apt.rooms) {
        const wx = ox + (rm.x - BLDG.x);
        const wy = oy + (rm.y - BLDG.y);
        // Keystone lintel above window
        c.fillStyle = '#3e3740';
        c.fillRect(wx - 4, wy - 6, rm.w + 8, 5);
        c.fillStyle = '#4a424d';
        c.fillRect(wx + rm.w * 0.5 - 5, wy - 7, 10, 6);
        c.fillStyle = 'rgba(255,255,255,0.08)';
        c.fillRect(wx - 4, wy - 6, rm.w + 8, 1);
        // Stone sill below window
        c.fillStyle = '#453d46';
        c.fillRect(wx - 4, wy + rm.h, rm.w + 8, 4);
        c.fillStyle = 'rgba(0,0,0,0.52)';
        c.fillRect(wx - 3, wy + rm.h + 4, rm.w + 6, 3);
        const grime = c.createLinearGradient(0, wy + rm.h + 4, 0, wy + rm.h + 15);
        grime.addColorStop(0, 'rgba(6,4,8,0.3)');
        grime.addColorStop(1, 'rgba(6,4,8,0)');
        c.fillStyle = grime;
        c.fillRect(wx, wy + rm.h + 4, rm.w, 11);
      }
    }

    // Ornate rooftop stone cornice
    c.fillStyle = '#3d353e';
    c.fillRect(ox - 10, oy - 12, BLDG.w + 20, 12);
    c.fillStyle = '#524954';
    c.fillRect(ox - 12, oy - 15, BLDG.w + 24, 4);
    c.fillStyle = 'rgba(0,0,0,0.58)';
    c.fillRect(ox - 8, oy, BLDG.w + 16, 7);
    c.fillStyle = '#29232a';
    for (let bx = ox + 6; bx < ox + BLDG.w - 6; bx += 22) {
      c.fillRect(bx, oy - 7, 6, 7);
    }

    c.restore();
    return off;
  }

  render() {
    const ctx = this.ctx;
    const sim = this.sim;

    ctx.clearRect(0, 0, VIEW_W, VIEW_H);

    // 1. Nocturnal sky, clean crescent/harvest moon, clouds & parallax skyline
    this._drawSkyAndSkyline(ctx);

    // 2. World space translated by the spaced-out anti-burn-in camera offset
    ctx.save();
    ctx.translate(-sim.camX, -sim.camY);

    this._drawSideBuildings(ctx);
    this._drawRooftopAndBacking(ctx);

    // Render all 24 multi-window apartments (interiors + avatars + visitors behind brick)
    for (const apt of sim.apartments) {
      for (const rm of apt.rooms) {
        this._drawRoomInterior(ctx, apt, rm);
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(apt.x, apt.y, apt.w, apt.h);
      ctx.clip();
      for (const res of apt.residents) this._drawAvatar(ctx, res);
      for (const v of apt.visitors) this._drawVisitor(ctx, apt, v);
      ctx.restore();
    }

    // Pre-baked weathered brick facade overlay
    ctx.drawImage(this.facadeCache, BLDG.x - 20, BLDG.y - 20);

    // Ground-floor storefronts & warm residential lobby
    this._drawGroundLobby(ctx);

    // Window glass reflections, curtains, blinds, exterior seasonal accents, fire escapes & warm bloom
    this._drawWindowOverlayAndDetails(ctx);
    this._drawFireEscapes(ctx);

    // Sidewalk, realistic wet-asphalt shimmer reflections, streetlamps, traffic & service vehicles
    this._drawStreetAndVehicles(ctx);

    if (sim.ufo) this._drawUFO(ctx, sim.ufo);

    ctx.restore();

    // 3. Atmospheric weather, photographic grain & gentle vignette
    this._drawWeatherAndAtmosphere(ctx);
  }

  _drawSkyAndSkyline(ctx) {
    const sim = this.sim;
    const palettes = {
      winter:    ['#050914', '#0b1428', '#14223d', '#1c2b48'],
      halloween: ['#090512', '#160d26', '#261438', '#331c3d'],
      spring:    ['#060a16', '#0c152b', '#15223d', '#1d2c48'],
      summer:    ['#060b1a', '#0e1832', '#182647', '#243459']
    };
    const p = palettes[sim.season] || palettes.winter;
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H * 0.88);
    grad.addColorStop(0, p[0]);
    grad.addColorStop(0.32, p[1]);
    grad.addColorStop(0.68, p[2]);
    grad.addColorStop(1, p[3]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // Ambient urban horizon haze
    const glow = ctx.createRadialGradient(VIEW_W * 0.5, 760, 120, VIEW_W * 0.5, 760, 960);
    glow.addColorStop(0, sim.season === 'halloween' ? 'rgba(185, 95, 50, 0.17)' : 'rgba(225, 160, 100, 0.14)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 180, VIEW_W, 680);

    if (sim.lightningFlash > 0) {
      ctx.fillStyle = `rgba(215, 232, 255, ${(sim.lightningFlash / 32).toFixed(3)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    ctx.save();
    ctx.translate(-sim.camX * 0.35, -sim.camY * 0.25);

    for (const s of sim.stars) {
      const a = (0.2 + 0.65 * (0.5 + 0.5 * Math.sin(sim.frame * 0.018 + s.phase))) * s.bright;
      ctx.fillStyle = `rgba(218, 232, 255, ${a.toFixed(2)})`;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }

    // Cleanly composited Moon (zero dark disc artifact!)
    const mx = 1390, my = 62;
    const moonHalo = ctx.createRadialGradient(mx, my, 4, mx, my, 82);
    if (sim.season === 'halloween') {
      moonHalo.addColorStop(0, 'rgba(255, 182, 86, 0.38)');
      moonHalo.addColorStop(0.45, 'rgba(240, 130, 45, 0.12)');
      moonHalo.addColorStop(1, 'rgba(255, 140, 40, 0)');
      ctx.fillStyle = moonHalo;
      ctx.beginPath(); ctx.arc(mx, my, 82, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f8c170';
      ctx.beginPath(); ctx.arc(mx, my, 21, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(185, 110, 40, 0.32)';
      ctx.beginPath(); ctx.arc(mx - 6, my - 4, 5, 0, Math.PI * 2); ctx.arc(mx + 7, my + 5, 4, 0, Math.PI * 2); ctx.fill();
    } else {
      moonHalo.addColorStop(0, 'rgba(205, 224, 255, 0.24)');
      moonHalo.addColorStop(0.45, 'rgba(155, 188, 235, 0.08)');
      moonHalo.addColorStop(1, 'rgba(140, 175, 225, 0)');
      ctx.fillStyle = moonHalo;
      ctx.beginPath(); ctx.arc(mx, my, 82, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(this.crescentCache, mx - 32, my - 32);
    }

    for (const cl of sim.clouds) {
      const cg = ctx.createRadialGradient(cl.x + cl.w * 0.5, cl.y, 10, cl.x + cl.w * 0.5, cl.y, cl.w * 0.55);
      cg.addColorStop(0, 'rgba(42, 54, 82, 0.22)');
      cg.addColorStop(1, 'rgba(20, 28, 48, 0)');
      ctx.fillStyle = cg;
      ctx.fillRect(cl.x, cl.y - cl.h, cl.w, cl.h * 2);
    }

    // Distant skyline silhouettes
    for (const b of sim.skyline) {
      const by = 785 - b.h;
      ctx.fillStyle = sim.season === 'halloween' ? '#120d1c' : '#0b111f';
      ctx.fillRect(b.x, by, b.w, b.h + 40);
      for (const d of b.dots) {
        ctx.fillStyle = d.warm
          ? `rgba(248, 206, 132, ${d.alpha.toFixed(2)})`
          : `rgba(155, 205, 248, ${(d.alpha * 0.85).toFixed(2)})`;
        ctx.fillRect(b.x + d.dx, by + d.dy, 4, 6);
      }
      if (b.hasAntenna) {
        ctx.fillStyle = '#182033';
        ctx.fillRect(b.x + b.w * 0.5, by - 36, 2, 36);
        if (Math.floor(sim.frame / 45 + b.x) % 2 === 0) {
          ctx.fillStyle = '#ff3b3b';
          ctx.beginPath(); ctx.arc(b.x + b.w * 0.5 + 1, by - 36, 2.2, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  _drawSideBuildings(ctx) {
    const sim = this.sim;
    const snowy = sim.season === 'winter' || sim.activeWeather() === 'snow';
    for (const sb of sim.sideBuildings) {
      const g = ctx.createLinearGradient(sb.x, sb.y, sb.x, sb.y + sb.h);
      g.addColorStop(0, sb.hue);
      g.addColorStop(1, '#111017');
      ctx.fillStyle = g;
      ctx.fillRect(sb.x, sb.y, sb.w, sb.h);
      // Subtle cornice
      ctx.fillStyle = '#2d2730';
      ctx.fillRect(sb.x - 4, sb.y - 8, sb.w + 8, 8);
      if (snowy) {
        ctx.fillStyle = 'rgba(215, 228, 245, 0.78)';
        ctx.fillRect(sb.x - 4, sb.y - 10, sb.w + 8, 3);
      }
      for (const w of sb.wins) {
        const wx = sb.x + w.rx, wy = sb.y + w.ry;
        // Dark night-glass sky reflection on unlit neighbor windows
        const glass = ctx.createLinearGradient(wx, wy, wx, wy + 46);
        glass.addColorStop(0, '#131a2b');
        glass.addColorStop(1, '#090c14');
        ctx.fillStyle = glass;
        ctx.fillRect(wx, wy, 42, 46);
        if (w.lit) {
          const wg = ctx.createRadialGradient(wx + 21, wy + 16, 4, wx + 21, wy + 24, 34);
          wg.addColorStop(0, w.warm ? 'rgba(242, 186, 108, 0.52)' : 'rgba(130, 188, 238, 0.38)');
          wg.addColorStop(1, w.warm ? 'rgba(120, 74, 38, 0.16)' : 'rgba(50, 82, 125, 0.12)');
          ctx.fillStyle = wg;
          ctx.fillRect(wx + 2, wy + 2, 38, 42);
        }
        ctx.strokeStyle = '#141118'; ctx.lineWidth = 2;
        ctx.strokeRect(wx, wy, 42, 46);
        ctx.fillStyle = 'rgba(16, 14, 20, 0.65)';
        ctx.fillRect(wx, wy + 22, 42, 1.5);
        ctx.fillStyle = '#332d36';
        ctx.fillRect(wx - 2, wy + 46, 46, 3);
      }
    }
  }

  _drawRooftopAndBacking(ctx) {
    const sim = this.sim;
    const snowy = sim.season === 'winter' || sim.activeWeather() === 'snow';

    // Rooftop water tower
    const wtX = BLDG.x + 76, wtY = BLDG.y - 14;
    ctx.strokeStyle = '#1b1f2b'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(wtX + 8, wtY); ctx.lineTo(wtX + 12, wtY - 22);
    ctx.moveTo(wtX + 52, wtY); ctx.lineTo(wtX + 48, wtY - 22);
    ctx.moveTo(wtX + 30, wtY); ctx.lineTo(wtX + 30, wtY - 22);
    ctx.stroke();
    ctx.fillStyle = '#262126';
    ctx.fillRect(wtX + 6, wtY - 64, 48, 42);
    ctx.fillStyle = '#17151a';
    ctx.fillRect(wtX + 6, wtY - 54, 48, 2); ctx.fillRect(wtX + 6, wtY - 40, 48, 2); ctx.fillRect(wtX + 6, wtY - 28, 48, 2);
    ctx.fillStyle = '#1f2430';
    ctx.beginPath();
    ctx.moveTo(wtX + 2, wtY - 64); ctx.lineTo(wtX + 30, wtY - 82); ctx.lineTo(wtX + 58, wtY - 64);
    ctx.closePath(); ctx.fill();
    if (snowy) {
      ctx.strokeStyle = 'rgba(220, 234, 250, 0.85)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(wtX + 4, wtY - 65); ctx.lineTo(wtX + 30, wtY - 82); ctx.lineTo(wtX + 56, wtY - 65); ctx.stroke();
    }

    // Stairwell bulkhead & rooftop steam vent (classic cold-night urban detail!)
    ctx.fillStyle = '#211c22'; ctx.fillRect(BLDG.x + 430, BLDG.y - 44, 120, 32);
    ctx.fillStyle = '#2f2933'; ctx.fillRect(BLDG.x + 426, BLDG.y - 47, 128, 4);
    ctx.fillStyle = '#1d2433'; ctx.fillRect(BLDG.x + 489, BLDG.y - 84, 2, 38);
    if (Math.floor(sim.frame / 42) % 2 === 0) {
      ctx.fillStyle = '#ff3b3b';
      ctx.beginPath(); ctx.arc(BLDG.x + 490, BLDG.y - 84, 3, 0, Math.PI * 2); ctx.fill();
    }

    // Gentle steam wisps rising from rooftop vent pipe in winter/spring/autumn
    const vx = BLDG.x + 792, vy = BLDG.y - 36;
    if (sim.season !== 'summer') {
      for (let i = 0; i < 6; i++) {
        const age = ((sim.frame * 0.25 + i * 18) % 108) / 108;
        const sx = vx + age * 26 + Math.sin(age * 5 + i) * 6;
        const sy = vy - age * 46;
        const alpha = (1 - age) * 0.11;
        ctx.fillStyle = `rgba(210, 224, 245, ${alpha.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(sx, sy, 5 + age * 14, 0, Math.PI * 2); ctx.fill();
      }
    }

    ctx.fillStyle = '#1d222e';
    ctx.fillRect(BLDG.x + 760, BLDG.y - 34, 66, 22);
    ctx.fillRect(BLDG.x + 855, BLDG.y - 26, 44, 14);
    if (snowy) {
      ctx.fillStyle = 'rgba(220, 234, 250, 0.82)';
      ctx.fillRect(BLDG.x - 12, BLDG.y - 17, BLDG.w + 24, 3);
      ctx.fillRect(BLDG.x + 426, BLDG.y - 49, 128, 2.5);
      ctx.fillRect(BLDG.x + 760, BLDG.y - 36, 66, 2.5);
    }

    ctx.fillStyle = '#070910';
    ctx.fillRect(BLDG.x + 2, BLDG.y + 2, BLDG.w - 4, BLDG.h - 4);
  }

  _drawRoomInterior(ctx, apt, rm) {
    const sim = this.sim;
    const { x, y, w, h } = rm;
    const props = ROOM_TYPES[rm.type];
    const lit = rm.light !== 'off';

    let wallCol = '#0d121f';
    let lightGlow = null;
    if (rm.light === 'warm') {
      wallCol = props.wall;
      lightGlow = ['rgba(255, 206, 132, 0.44)', 'rgba(225, 148, 72, 0.14)', 'rgba(25, 16, 10, 0)'];
    } else if (rm.light === 'dim') {
      wallCol = '#1b1d28';
      lightGlow = ['rgba(245, 185, 105, 0.18)', 'rgba(180, 120, 60, 0.06)', 'rgba(0, 0, 0, 0)'];
    } else if (rm.light === 'inspect') {
      wallCol = '#313c4d';
      lightGlow = ['rgba(220, 238, 255, 0.46)', 'rgba(155, 195, 240, 0.16)', 'rgba(0, 0, 0, 0)'];
    } else if (rm.light === 'tv') {
      wallCol = '#182334';
      const p = 0.32 + 0.14 * Math.sin(sim.frame * 0.2 + x);
      lightGlow = [`rgba(120, 200, 255, ${p.toFixed(2)})`, 'rgba(60, 125, 205, 0.12)', 'rgba(0, 0, 0, 0)'];
    } else if (rm.light === 'monitor') {
      wallCol = '#16252f';
      lightGlow = ['rgba(125, 240, 232, 0.30)', 'rgba(55, 145, 155, 0.10)', 'rgba(0, 0, 0, 0)'];
    } else if (rm.light === 'disco') {
      wallCol = '#281736';
      const cols = ['rgba(255,65,205,0.45)', 'rgba(55,225,255,0.45)', 'rgba(255,205,55,0.45)'];
      lightGlow = [cols[Math.floor(sim.frame / 10 + rm.idx) % cols.length], 'rgba(90, 30, 120, 0.14)', 'rgba(0,0,0,0)'];
    } else if (rm.light === 'fire') {
      wallCol = '#472116';
      const f = 0.48 + 0.2 * Math.sin(sim.frame * 0.45);
      lightGlow = [`rgba(255, 115, 32, ${f.toFixed(2)})`, 'rgba(220, 50, 15, 0.2)', 'rgba(0,0,0,0)'];
    } else if (rm.light === 'ufo') {
      wallCol = '#143325';
      lightGlow = ['rgba(75, 255, 150, 0.45)', 'rgba(20, 145, 75, 0.18)', 'rgba(0,0,0,0)'];
    }

    if (sim.season === 'halloween' && apt.decor.spookyGlow && rm.light === 'warm' && rm.idx === 1) {
      lightGlow = ['rgba(198, 102, 255, 0.36)', 'rgba(255, 130, 45, 0.14)', 'rgba(0,0,0,0)'];
    }

    ctx.fillStyle = wallCol;
    ctx.fillRect(x, y, w, h);

    // Subtle interior perspective depth
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - 7, y + 6); ctx.lineTo(x + 7, y + 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.fillRect(x, y, 6, h); ctx.fillRect(x + w - 6, y, 6, h);
    ctx.fillStyle = lit ? props.floor : '#080b12';
    ctx.fillRect(x, y + h - 7, w, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x + 5, y + h - 8, w - 10, 1);

    if (lightGlow) {
      const lx = rm.light === 'tv' ? x + w * 0.78 : (rm.light === 'monitor' ? x + w * 0.72 : x + w * 0.5);
      const ly = rm.light === 'tv' || rm.light === 'monitor' ? y + h * 0.56 : y + 6;
      const rg = ctx.createRadialGradient(lx, ly, 3, lx, ly, w * 0.75);
      rg.addColorStop(0, lightGlow[0]);
      rg.addColorStop(0.55, lightGlow[1]);
      rg.addColorStop(1, lightGlow[2]);
      ctx.fillStyle = rg;
      ctx.fillRect(x, y, w, h);
    }

    if (rm.light === 'warm' || rm.light === 'inspect') {
      ctx.fillStyle = rm.light === 'inspect' ? '#edf6ff' : '#fff0bd';
      ctx.fillRect(x + w * 0.5 - 6, y + 2, 12, 2.5);
    }

    const darkW = lit ? '#453023' : '#121622';
    const midW = lit ? '#634632' : '#171c2b';
    const fab = lit ? '#593d4a' : '#141926';
    const metal = lit ? '#7f8c99' : '#19202e';

    if (rm.type === 'kitchen') {
      ctx.fillStyle = darkW; ctx.fillRect(x + 6, y + 8, 44, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 20, y + 8, 1, 10); ctx.fillRect(x + 35, y + 8, 1, 10);
      ctx.fillStyle = metal; ctx.fillRect(x + 7, y + h - 22, 20, 15);
      ctx.fillStyle = '#181c24'; ctx.fillRect(x + 10, y + h - 18, 14, 8);
      if (rm.light === 'fire') {
        const fh = 11 + Math.sin(sim.frame * 0.4) * 4;
        ctx.fillStyle = '#ff4d1a'; ctx.beginPath(); ctx.ellipse(x + 17, y + h - 24, 9, fh * 0.65, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.ellipse(x + 17, y + h - 23, 5, fh * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      } else if (apt.residents.some(r => r.pose === 'cook' && sim.getRoomAt(apt, r.x) === rm)) {
        ctx.fillStyle = '#ff9233'; ctx.fillRect(x + 12, y + h - 23, 8, 2);
      }
      ctx.fillStyle = midW; ctx.fillRect(x + 27, y + h - 22, 26, 15);
      ctx.fillStyle = lit ? '#b8b0a4' : '#202636'; ctx.fillRect(x + 27, y + h - 23, 26, 2);
      ctx.fillStyle = lit ? '#aebac4' : '#1e2536'; ctx.fillRect(x + 58, y + h - 34, 18, 27);
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x + 58, y + h - 23, 18, 1);
      if (rm.fridgeOpen > 0) {
        const fg = ctx.createLinearGradient(x + 58, 0, x + 36, 0);
        fg.addColorStop(0, 'rgba(220, 246, 255, 0.72)'); fg.addColorStop(1, 'rgba(180, 230, 255, 0)');
        ctx.fillStyle = fg; ctx.fillRect(x + 36, y + h - 32, 22, 24);
      }
    } else if (rm.type === 'living') {
      ctx.fillStyle = lit ? '#6e5844' : '#141826'; ctx.fillRect(x + 18, y + 10, 22, 13);
      ctx.fillStyle = lit ? '#8e7863' : '#192030'; ctx.fillRect(x + 20, y + 12, 18, 9);
      ctx.fillStyle = darkW; ctx.fillRect(x + 9, y + h - 30, 2, 23);
      ctx.fillStyle = lit ? '#f2d08a' : '#1a2030'; ctx.fillRect(x + 6, y + h - 35, 8, 6);
      ctx.fillStyle = fab; ctx.fillRect(x + 15, y + h - 19, 34, 12);
      ctx.fillStyle = lit ? '#6e4e5c' : '#192030'; ctx.fillRect(x + 15, y + h - 24, 34, 6);
      ctx.fillStyle = darkW; ctx.fillRect(x + 58, y + h - 15, 20, 8);
      ctx.fillStyle = '#0d1018'; ctx.fillRect(x + 60, y + h - 28, 16, 12);
      if (rm.tvOn || rm.light === 'tv') {
        ctx.fillStyle = Math.floor(sim.frame / 10) % 2 === 0 ? '#85dcff' : '#b2ebff';
        ctx.fillRect(x + 61, y + h - 27, 14, 10);
      }
    } else if (rm.type === 'bedroom' || rm.type === 'kids') {
      ctx.fillStyle = midW; ctx.fillRect(x + 9, y + h - 20, 18, 13);
      if (lit) { ctx.fillStyle = '#ffdf96'; ctx.fillRect(x + 15, y + h - 27, 6, 5); ctx.fillStyle = darkW; ctx.fillRect(x + 17, y + h - 22, 2, 2); }
      ctx.fillStyle = darkW; ctx.fillRect(x + 39, y + h - 17, 36, 10);
      ctx.fillStyle = lit ? (rm.type === 'kids' ? '#4f7a7a' : '#536885') : '#151c2e'; ctx.fillRect(x + 41, y + h - 20, 32, 8);
      ctx.fillStyle = lit ? '#dfd9cb' : '#20283b'; ctx.fillRect(x + 63, y + h - 22, 9, 4);
      if (rm.type === 'kids') {
        ctx.fillStyle = darkW; ctx.fillRect(x + 39, y + h - 36, 2, 29); ctx.fillRect(x + 73, y + h - 36, 2, 29);
        ctx.fillRect(x + 39, y + h - 31, 36, 4);
        ctx.fillStyle = lit ? '#6e5c82' : '#181e30'; ctx.fillRect(x + 41, y + h - 33, 30, 3);
      }
    } else if (rm.type === 'office') {
      ctx.fillStyle = darkW; ctx.fillRect(x + 8, y + h - 35, 18, 28);
      if (lit) { ctx.fillStyle = '#8c4e4e'; ctx.fillRect(x + 10, y + h - 32, 4, 5); ctx.fillStyle = '#4e788c'; ctx.fillRect(x + 15, y + h - 32, 5, 5); ctx.fillStyle = '#8c7d4e'; ctx.fillRect(x + 10, y + h - 24, 6, 5); }
      ctx.fillStyle = midW; ctx.fillRect(x + 44, y + h - 18, 32, 11);
      ctx.fillStyle = '#0e131c'; ctx.fillRect(x + 49, y + h - 30, 22, 11);
      if (rm.monitorOn || rm.light === 'monitor') { ctx.fillStyle = '#7bf0e6'; ctx.fillRect(x + 50, y + h - 29, 9, 8); ctx.fillRect(x + 61, y + h - 29, 9, 8); }
    } else if (rm.type === 'sewing') {
      ctx.fillStyle = midW; ctx.fillRect(x + 11, y + h - 18, 32, 11);
      ctx.fillStyle = lit ? '#cfd6de' : '#1e2533'; ctx.fillRect(x + 18, y + h - 25, 12, 7);
      if (lit) { ctx.fillStyle = '#ffe99e'; ctx.fillRect(x + 34, y + h - 28, 5, 4); }
      ctx.fillStyle = lit ? '#8c4b32' : '#1c1824'; ctx.fillRect(x + 60, y + h - 15, 11, 8);
      ctx.fillStyle = lit ? '#3f7a4a' : '#13241f'; ctx.beginPath(); ctx.arc(x + 65, y + h - 20, 7, 0, Math.PI * 2); ctx.fill();
    } else if (rm.type === 'studio') {
      ctx.strokeStyle = midW; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 18, y + h - 7); ctx.lineTo(x + 25, y + h - 35); ctx.lineTo(x + 33, y + h - 7); ctx.stroke();
      ctx.fillStyle = lit ? '#e5dec9' : '#1d2433'; ctx.fillRect(x + 16, y + h - 34, 18, 16);
      if (lit) { ctx.fillStyle = '#c85a48'; ctx.fillRect(x + 18, y + h - 31, 10, 7); ctx.fillStyle = '#4e7ea3'; ctx.fillRect(x + 22, y + h - 25, 9, 5); }
      ctx.fillStyle = darkW; ctx.fillRect(x + 54, y + h - 22, 20, 15);
    } else if (rm.type === 'dining') {
      ctx.fillStyle = midW; ctx.fillRect(x + 24, y + h - 18, 36, 11);
      ctx.fillStyle = darkW; ctx.fillRect(x + 16, y + h - 22, 7, 15); ctx.fillRect(x + 61, y + h - 22, 7, 15);
    }

    // --- SEASONAL & HOLIDAY INTERIOR DECORATIONS ---
    // 1. Layered Realistic Pine Christmas Tree (warm twinkling micro-lights)
    if (sim.season === 'winter' && apt.decor.xmasTree === rm.idx) {
      const tx = x + 53, ty = y + h - 7;
      ctx.fillStyle = '#3b2416'; ctx.fillRect(tx - 1.5, ty - 4, 3, 4);
      const pine = lit ? '#194a2d' : '#0f2e1c';
      const pineHi = lit ? '#23633c' : '#143c24';
      // 4 overlapping bough tiers (realistic pine silhouette)
      const tiers = [
        { y: ty - 4, w: 12, h: 10 },
        { y: ty - 11, w: 10, h: 9 },
        { y: ty - 18, w: 7.5, h: 8 },
        { y: ty - 24, w: 4.5, h: 8 }
      ];
      tiers.forEach((tr, ti) => {
        ctx.fillStyle = ti % 2 === 0 ? pine : pineHi;
        ctx.beginPath();
        ctx.moveTo(tx, tr.y - tr.h);
        ctx.lineTo(tx - tr.w, tr.y);
        ctx.lineTo(tx + tr.w, tr.y);
        ctx.closePath(); ctx.fill();
      });
      // Soft golden tree ambient glow
      const tg = ctx.createRadialGradient(tx, ty - 17, 2, tx, ty - 17, 23);
      tg.addColorStop(0, 'rgba(255, 218, 130, 0.36)');
      tg.addColorStop(1, 'rgba(255, 190, 90, 0)');
      ctx.fillStyle = tg; ctx.fillRect(tx - 24, ty - 38, 48, 36);
      // Warm star topper
      ctx.fillStyle = '#fef08a'; ctx.beginPath(); ctx.arc(tx, ty - 33, 1.8, 0, Math.PI * 2); ctx.fill();
      // Subtle twinkling lights
      const tw = Math.floor(sim.frame / 22 + apt.floor) % 4;
      const bulbs = [[-6, -7, '#ffdf85'], [5, -8, '#ef4444'], [-3, -13, '#fef08a'], [4, -15, '#38bdf8'], [-2, -20, '#ef4444'], [2, -22, '#fef08a'], [0, -10, '#4ade80'], [-1, -27, '#fffbeb']];
      bulbs.forEach(([ox, oy, col], i) => {
        ctx.fillStyle = i % 4 === tw ? '#ffffff' : col;
        ctx.fillRect(tx + ox, ty + oy, 1.7, 1.7);
      });
    }

    // 2. Properly Scaled Tabletop Hanukkah Menorah (Hanukkiah) in Jewish households (no tree!)
    if (sim.season === 'winter' && apt.decor.menorah === rm.idx) {
      const mx = x + w * 0.5, my = y + h - 7;
      // Small wooden window table supporting the menorah
      ctx.fillStyle = '#422c20';
      ctx.fillRect(mx - 13, my - 7, 26, 2);
      ctx.fillRect(mx - 10, my - 5, 2, 5);
      ctx.fillRect(mx + 8, my - 5, 2, 5);

      // Soft warm candlelight halo + gentle blue-silver holiday aura
      const mh = ctx.createRadialGradient(mx, my - 15, 2, mx, my - 15, 24);
      mh.addColorStop(0, 'rgba(255, 224, 120, 0.48)');
      mh.addColorStop(0.55, 'rgba(130, 185, 255, 0.14)');
      mh.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = mh; ctx.fillRect(mx - 26, my - 36, 52, 34);

      const base = my - 7;
      ctx.fillStyle = '#eab308';
      ctx.fillRect(mx - 3.5, base - 1.5, 7, 1.5); // base foot
      ctx.fillRect(mx - 0.7, base - 8, 1.4, 6.5); // center stem
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 1.1;
      for (const span of [2.5, 5, 7.5, 10]) {
        ctx.beginPath();
        ctx.arc(mx, base - 7.5, span, 0, Math.PI, false);
        ctx.stroke();
      }
      // 9 delicate candles + flickering golden flames
      const positions = [-10, -7.5, -5, -2.5, 0, 2.5, 5, 7.5, 10];
      positions.forEach((dx, idx) => {
        const isShamash = dx === 0;
        const ch = isShamash ? 5.2 : 3.6;
        const cy = base - 7.5 - ch;
        ctx.fillStyle = isShamash ? '#f8fafc' : (idx % 2 === 0 ? '#93c5fd' : '#e2e8f0');
        ctx.fillRect(mx + dx - 0.55, cy, 1.1, ch);
        const flick = Math.sin(sim.frame * 0.22 + idx * 1.7) * 0.45;
        ctx.fillStyle = '#fef08a';
        ctx.beginPath(); ctx.ellipse(mx + dx, cy - 1.5 + flick * 0.35, 0.9, 1.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f97316';
        ctx.fillRect(mx + dx - 0.4, cy - 1.1, 0.8, 0.9);
      });
    }

    // 3. Halloween Jack-o'-lantern & subtle cutouts
    if (sim.season === 'halloween' && apt.decor.pumpkin === rm.idx) {
      const px = x + 16, py = y + h - 13;
      const ph = ctx.createRadialGradient(px + 5, py + 4, 2, px + 5, py + 4, 18);
      ph.addColorStop(0, 'rgba(255, 145, 30, 0.42)'); ph.addColorStop(1, 'rgba(255, 120, 20, 0)');
      ctx.fillStyle = ph; ctx.fillRect(px - 10, py - 10, 32, 26);
      ctx.fillStyle = '#ea580c';
      ctx.beginPath(); ctx.ellipse(px + 5, py + 4, 6, 4.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#15803d'; ctx.fillRect(px + 4.3, py - 2, 1.6, 2.5);
      ctx.fillStyle = Math.floor(sim.frame / 10 + rm.x) % 2 === 0 ? '#fef08a' : '#facc15';
      ctx.fillRect(px + 2.5, py + 2.5, 1.6, 1.6); ctx.fillRect(px + 6, py + 2.5, 1.6, 1.6); ctx.fillRect(px + 2.5, py + 5.8, 5, 1.2);

      if (apt.floor % 2 === 0) {
        ctx.fillStyle = 'rgba(235, 242, 255, 0.62)';
        ctx.beginPath(); ctx.arc(x + 66, y + 15, 4.5, Math.PI, 0); ctx.lineTo(x + 70.5, y + 22); ctx.lineTo(x + 61.5, y + 22); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#0f172a'; ctx.fillRect(x + 64, y + 14, 1.3, 1.3); ctx.fillRect(x + 67, y + 14, 1.3, 1.3);
      } else {
        ctx.fillStyle = '#09090d';
        ctx.beginPath(); ctx.moveTo(x + 66, y + 16); ctx.lineTo(x + 59, y + 12.5); ctx.lineTo(x + 62.5, y + 18.5); ctx.lineTo(x + 66, y + 17.5); ctx.lineTo(x + 69.5, y + 18.5); ctx.lineTo(x + 73, y + 12.5); ctx.closePath(); ctx.fill();
      }
    }

    if (rm.telescope) {
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x + 48, y + h - 7); ctx.lineTo(x + 54, y + h - 22); ctx.lineTo(x + 60, y + h - 7); ctx.stroke();
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2.8;
      ctx.beginPath(); ctx.moveTo(x + 47, y + h - 20); ctx.lineTo(x + 62, y + h - 26); ctx.stroke();
    }

    if (rm.packageProp) {
      const bx = rm.packageProp.x, by = y + h - 14;
      if (rm.packageProp.isPizza) {
        ctx.fillStyle = '#e5e0d5'; ctx.fillRect(bx - 7, by + 3, 14, 4);
        ctx.fillStyle = '#dc2626'; ctx.fillRect(bx - 4, by + 4, 8, 1.5);
      } else {
        ctx.fillStyle = '#b47b44'; ctx.fillRect(bx - 6, by, 12, 8);
        if (rm.packageProp.opened) {
          ctx.fillStyle = '#d49b63'; ctx.fillRect(bx - 9, by - 3, 5, 2.5); ctx.fillRect(bx + 4, by - 3, 5, 2.5);
          ctx.fillStyle = '#60a5fa'; ctx.fillRect(bx - 2, by - 3, 4, 3);
        } else {
          ctx.fillStyle = '#855528'; ctx.fillRect(bx - 6, by + 3, 12, 1.5);
        }
      }
    }

    if (rm.smoke > 0.04) {
      for (let i = 0; i < 8; i++) {
        const sx = x + 12 + ((i * 11 + sim.frame * 0.4) % (w - 24));
        const sy = y + h - 16 - ((sim.frame * 0.45 + i * 9) % (h - 14));
        ctx.fillStyle = `rgba(175, 182, 195, ${(rm.smoke * 0.34).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(sx, sy, 6 + (i % 4) * 2, 0, Math.PI * 2); ctx.fill();
      }
    }

    if (rm.sparks > 0 && Math.random() < 0.65) {
      ctx.fillStyle = '#fff380';
      ctx.fillRect(x + 12 + Math.random() * 14, y + 18 + Math.random() * 14, 3, 2);
    }

    if (rm.cameraFlash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${(rm.cameraFlash / 13).toFixed(2)})`;
      ctx.fillRect(x, y, w, h);
    }
  }

  _drawAvatar(ctx, res) {
    if (res.hidden) return;
    const sim = this.sim;
    const rm = sim.getRoomAt(res.apt, res.x);
    const inDark = rm.light === 'off';
    const sc = res.scale || 1;
    const x = res.x;
    const y = res.y - res.levitateY;

    const skin = inDark ? '#202636' : res.skin;
    const hair = inDark ? '#10141f' : res.hair;
    const shirt = inDark ? '#181f2e' : res.shirt;
    const pants = inDark ? '#111622' : res.pants;

    if (res.collapsed) {
      ctx.fillStyle = pants; ctx.fillRect(x - 10, y - 4, 11, 4);
      ctx.fillStyle = shirt; ctx.fillRect(x + 1, y - 5, 9, 5);
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(x + 12, y - 3, 3, 0, Math.PI * 2); ctx.fill();
      return;
    }

    if (res.pose === 'sleep' && res.state === 'acting') {
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(x + 9, y - 16, 3.3 * sc, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(x + 10.5, y - 16.5, 3.2 * sc, -Math.PI * 0.6, Math.PI * 0.5); ctx.fill();
      return;
    }

    const isSit = (res.pose === 'sit' || res.pose === 'type' || res.pose === 'sew' || res.pose === 'read' || res.pose === 'slump' || res.pose === 'instrument') && res.state === 'acting';
    const isCrouch = (res.pose === 'unbox' || res.pose === 'crouch' || res.pose === 'yoga') && res.state === 'acting';
    const walkBob = res.state === 'walking' ? Math.abs(Math.sin(res.walkPhase)) * 1.8 : 0;
    const sway = (res.pose === 'sway' || res.pose === 'dance') && res.state === 'acting' ? Math.sin(sim.frame * 0.08 + x) * 1.5 : 0;
    const baseY = y - (isSit ? 2 : 0) + (isCrouch ? 5 : 0) - walkBob;

    if (!inDark) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
      ctx.beginPath(); ctx.ellipse(x + 1.5, y, 5 * sc, 2, 0, 0, Math.PI * 2); ctx.fill();
    }

    // Natural tapered legs
    ctx.strokeStyle = pants;
    ctx.lineWidth = 2.4 * sc;
    ctx.lineCap = 'round';
    const hipY = baseY - 12 * sc;
    if (isSit) {
      ctx.beginPath();
      ctx.moveTo(x - 1, hipY); ctx.lineTo(x + res.facing * 6 * sc, hipY + 2); ctx.lineTo(x + res.facing * 7 * sc, baseY - 1);
      ctx.stroke();
    } else if (res.state === 'walking') {
      const str = Math.sin(res.walkPhase) * 4.5 * sc;
      ctx.beginPath();
      ctx.moveTo(x - 1, hipY); ctx.lineTo(x - 1 + str, baseY - 1);
      ctx.moveTo(x + 1, hipY); ctx.lineTo(x + 1 - str, baseY - 1);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x - 1.8 * sc, hipY); ctx.lineTo(x - 1.8 * sc, baseY - 1);
      ctx.moveTo(x + 1.8 * sc, hipY); ctx.lineTo(x + 1.8 * sc, baseY - 1);
      ctx.stroke();
    }

    // Tapered shoulders/torso with subtle light shading
    const torsoH = 11 * sc;
    const shY = hipY - torsoH;
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.moveTo(x - 4.2 * sc + sway * 0.4, shY + 1);
    ctx.lineTo(x + 4.2 * sc + sway * 0.4, shY + 1);
    ctx.lineTo(x + 3.2 * sc + sway * 0.2, hipY + 1);
    ctx.lineTo(x - 3.2 * sc + sway * 0.2, hipY + 1);
    ctx.closePath(); ctx.fill();

    // Subtle rim highlight from room light (TV/monitor/lamp)
    if (!inDark) {
      ctx.fillStyle = rm.light === 'tv' || rm.light === 'monitor' ? 'rgba(155, 230, 255, 0.22)' : 'rgba(255, 225, 165, 0.18)';
      ctx.fillRect(x + (res.facing > 0 ? 1.5 : -3.5) * sc, shY + 1, 1.6 * sc, torsoH - 1);
    }

    // Arms & activity props
    ctx.strokeStyle = skin;
    ctx.lineWidth = 1.9 * sc;
    if (res.pose === 'argue' || res.pose === 'wave' || res.pose === 'workout') {
      const a = Math.sin(sim.frame * 0.25 + x) * 5 * sc;
      ctx.beginPath();
      ctx.moveTo(x - 3 * sc, shY + 2); ctx.lineTo(x - 7 * sc, shY - 3 + a);
      ctx.moveTo(x + 3 * sc, shY + 2); ctx.lineTo(x + 7 * sc, shY - 3 - a);
      ctx.stroke();
    } else if (res.pose === 'phone') {
      ctx.beginPath();
      ctx.moveTo(x + res.facing * 3 * sc, shY + 2); ctx.lineTo(x + res.facing * 4 * sc, shY - 3);
      ctx.stroke();
    } else if (res.pose === 'type' || res.pose === 'sew' || res.pose === 'cook' || res.pose === 'paint' || res.pose === 'unbox' || res.pose === 'clean') {
      const mv = Math.sin(sim.frame * 0.14) * 1.8;
      ctx.beginPath();
      ctx.moveTo(x + res.facing * 2.5 * sc, shY + 2.5);
      ctx.lineTo(x + res.facing * 7.5 * sc, shY + 5 + mv);
      ctx.stroke();
    } else if (res.pose === 'instrument') {
      ctx.fillStyle = '#8c5330';
      ctx.beginPath(); ctx.ellipse(x + res.facing * 3, shY + 7, 4, 2.5, 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#63381e'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x + res.facing * 3, shY + 7); ctx.lineTo(x + res.facing * 10, shY + 4); ctx.stroke();
    } else if (res.carrying === 'box' || res.carrying === 'pizza') {
      const bx = x + res.facing * 5 * sc;
      ctx.fillStyle = res.carrying === 'pizza' ? '#e5e0d5' : '#b47b44';
      ctx.fillRect(bx - 4, shY + 2, 9, res.carrying === 'pizza' ? 3 : 6);
    } else if (res.carrying === 'plate' || res.carrying === 'mug') {
      ctx.fillStyle = res.carrying === 'plate' ? '#e6e2d5' : '#d6a456';
      ctx.fillRect(x + res.facing * 6 * sc - 2, shY + 4, 5, 2.5);
    } else if (res.carrying === 'rug') {
      ctx.fillStyle = '#6e3235';
      ctx.beginPath(); ctx.roundRect(x - res.facing * 16, baseY - 7, 19, 6, 3); ctx.fill();
    } else if (res.pose === 'dance') {
      const d = Math.sin(sim.frame * 0.18) * 4;
      ctx.beginPath();
      ctx.moveTo(x - 3 * sc, shY + 2); ctx.lineTo(x - 7 * sc, shY - 2 + d);
      ctx.moveTo(x + 3 * sc, shY + 2); ctx.lineTo(x + 7 * sc, shY - 2 - d);
      ctx.stroke();
    } else {
      const armSw = res.state === 'walking' ? Math.sin(res.walkPhase) * 3.5 * sc : 0;
      ctx.beginPath();
      ctx.moveTo(x - 3.5 * sc, shY + 2); ctx.lineTo(x - 3.5 * sc - armSw, shY + 9 * sc);
      ctx.moveTo(x + 3.5 * sc, shY + 2); ctx.lineTo(x + 3.5 * sc + armSw, shY + 9 * sc);
      ctx.stroke();
    }

    const headY = shY - 4.0 * sc;
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(x + sway * 0.5, headY, 3.4 * sc, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hair;
    ctx.beginPath(); ctx.arc(x + sway * 0.5 - res.facing * 0.5, headY - 0.8, 3.5 * sc, Math.PI * 0.85, Math.PI * 2.15); ctx.fill();
  }

  _drawVisitor(ctx, apt, v) {
    const sim = this.sim;
    const x = v.x, y = apt.y + apt.h - 4;
    const bob = v.moving ? Math.abs(Math.sin(v.walkPhase || 0)) * 1.5 : 0;
    const by = y - bob;

    if (v.kind === 'burglar') {
      const fg = ctx.createLinearGradient(x + v.dir * 4, by - 16, x + v.dir * 48, by - 16);
      fg.addColorStop(0, 'rgba(255, 248, 190, 0.52)'); fg.addColorStop(1, 'rgba(255, 240, 150, 0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.moveTo(x + v.dir * 4, by - 16); ctx.lineTo(x + v.dir * 48, by - 28); ctx.lineTo(x + v.dir * 48, by - 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#070a12'; ctx.fillRect(x - 3.5, by - 24, 7, 24);
      ctx.beginPath(); ctx.arc(x, by - 27, 3.5, 0, Math.PI * 2); ctx.fill();
    } else if (v.kind === 'firefighter') {
      ctx.fillStyle = '#1f242d'; ctx.fillRect(x - 4, by - 24, 8, 24);
      ctx.fillStyle = '#facc15'; ctx.fillRect(x - 4, by - 14, 8, 2); ctx.fillRect(x - 4, by - 6, 8, 1.5);
      ctx.fillStyle = '#e5be9e'; ctx.beginPath(); ctx.arc(x, by - 27, 3.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.arc(x, by - 28.5, 4.2, Math.PI, 0); ctx.fill();
      ctx.fillRect(x - 5.5, by - 28.5, 11, 1.8);
      if (!v.moving && v.pose === 'spray') {
        const sg = ctx.createLinearGradient(x - 4, by - 18, x - 34, by - 20);
        sg.addColorStop(0, 'rgba(210, 242, 255, 0.8)'); sg.addColorStop(1, 'rgba(180, 225, 255, 0.12)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.moveTo(x - 4, by - 18); ctx.lineTo(x - 32, by - 24 + Math.sin(sim.frame * 0.5) * 2);
        ctx.lineTo(x - 32, by - 14 + Math.sin(sim.frame * 0.5) * 2); ctx.closePath(); ctx.fill();
      }
    } else if (v.kind === 'police') {
      ctx.fillStyle = '#182847'; ctx.fillRect(x - 3.8, by - 24, 7.6, 24);
      ctx.fillStyle = '#facc15'; ctx.fillRect(x + v.dir * 1.5, by - 19, 1.8, 1.8);
      ctx.fillStyle = '#e5bc9c'; ctx.beginPath(); ctx.arc(x, by - 27, 3.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#12203b'; ctx.fillRect(x - 4, by - 31, 8, 2.5);
    } else if (v.kind === 'detective') {
      const dg = ctx.createLinearGradient(x + v.dir * 4, by - 16, x + v.dir * 38, by - 16);
      dg.addColorStop(0, 'rgba(255, 248, 200, 0.36)'); dg.addColorStop(1, 'rgba(255, 240, 160, 0)');
      ctx.fillStyle = dg;
      ctx.beginPath(); ctx.moveTo(x + v.dir * 4, by - 16); ctx.lineTo(x + v.dir * 38, by - 24); ctx.lineTo(x + v.dir * 38, by - 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2d2824'; ctx.fillRect(x - 3.5, by - 10, 7, 10);
      ctx.fillStyle = '#a69072'; ctx.fillRect(x - 5, by - 24, 10, 16);
      ctx.fillStyle = '#e5bc9c'; ctx.beginPath(); ctx.arc(x, by - 27, 3.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5c4c3c'; ctx.fillRect(x - 5.5, by - 30, 11, 2); ctx.fillRect(x - 3.5, by - 32.5, 7, 2.5);
    } else if (v.kind === 'medic') {
      ctx.fillStyle = '#1e3a5f'; ctx.fillRect(x - 3.8, by - 18, 7.6, 18);
      ctx.fillStyle = '#e2e8f0'; ctx.fillRect(x - 3.8, by - 16, 7.6, 2);
      ctx.fillStyle = '#e5bc9c'; ctx.beginPath(); ctx.arc(x, by - 21, 3.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  _drawGroundLobby(ctx) {
    const sim = this.sim;
    const cx = BLDG.x + BLDG.w * 0.5;
    const ly = BLDG.lobbyY;
    const lh = BLDG.streetY - ly;

    // Left ground-floor storefront: dimly lit late-night Bookshop / Espresso Bar
    const lx = BLDG.x + 56, lw = 280;
    ctx.fillStyle = '#0d1018';
    ctx.fillRect(lx, ly + 12, lw, lh - 14);
    const cafeG = ctx.createRadialGradient(lx + 110, ly + 28, 10, lx + 140, ly + 36, 140);
    cafeG.addColorStop(0, 'rgba(255, 194, 115, 0.28)');
    cafeG.addColorStop(1, 'rgba(30, 20, 14, 0.05)');
    ctx.fillStyle = cafeG; ctx.fillRect(lx + 4, ly + 16, lw - 8, lh - 22);
    // Interior bookshelves & tiny pendant lights
    ctx.fillStyle = '#261b16';
    ctx.fillRect(lx + 16, ly + 22, 72, lh - 28);
    ctx.fillRect(lx + 170, ly + 28, 92, lh - 34);
    for (const px of [lx + 65, lx + 145, lx + 220]) {
      ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(px, ly + 22, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    // Storefront awning + mullions
    ctx.fillStyle = '#2c1e24'; ctx.fillRect(lx - 6, ly + 8, lw + 12, 8);
    ctx.strokeStyle = '#18161f'; ctx.lineWidth = 2.5;
    ctx.strokeRect(lx, ly + 12, lw, lh - 14);
    ctx.fillStyle = '#18161f';
    ctx.fillRect(lx + 96, ly + 12, 3, lh - 14); ctx.fillRect(lx + 190, ly + 12, 3, lh - 14);

    // Right ground-floor storefront: glowing late-night Corner Bodega / Laundromat
    const rx = BLDG.x + BLDG.w - 336, rw = 280;
    ctx.fillStyle = '#0c111a';
    ctx.fillRect(rx, ly + 12, rw, lh - 14);
    const shopG = ctx.createRadialGradient(rx + 140, ly + 26, 10, rx + 140, ly + 36, 145);
    shopG.addColorStop(0, 'rgba(175, 225, 245, 0.24)');
    shopG.addColorStop(1, 'rgba(18, 28, 42, 0.04)');
    ctx.fillStyle = shopG; ctx.fillRect(rx + 4, ly + 16, rw - 8, lh - 22);
    // Faint warm neon "OPEN" sign + interior shelves
    ctx.fillStyle = '#1a2433'; ctx.fillRect(rx + 24, ly + 28, 120, lh - 34);
    ctx.fillStyle = 'rgba(248, 113, 113, 0.65)'; ctx.fillRect(rx + 204, ly + 26, 28, 6);
    ctx.fillStyle = '#1f2b3a'; ctx.fillRect(rx - 6, ly + 8, rw + 12, 8);
    ctx.strokeStyle = '#18161f'; ctx.lineWidth = 2.5;
    ctx.strokeRect(rx, ly + 12, rw, lh - 14);
    ctx.fillStyle = '#18161f';
    ctx.fillRect(rx + 94, ly + 12, 3, lh - 14); ctx.fillRect(rx + 188, ly + 12, 3, lh - 14);

    // Center illuminated residential lobby entrance (unobstructed!)
    ctx.fillStyle = '#16141b';
    ctx.fillRect(cx - 64, ly + 6, 128, lh - 6);
    const lobGlow = ctx.createRadialGradient(cx, ly + 24, 6, cx, ly + 38, 72);
    lobGlow.addColorStop(0, 'rgba(255, 218, 145, 0.72)');
    lobGlow.addColorStop(0.6, 'rgba(215, 142, 65, 0.28)');
    lobGlow.addColorStop(1, 'rgba(40, 22, 12, 0.06)');
    ctx.fillStyle = lobGlow;
    ctx.fillRect(cx - 54, ly + 14, 108, lh - 14);

    // Double glass vestibule doors + brass mullions + house number
    ctx.strokeStyle = '#5c4b3a'; ctx.lineWidth = 2;
    ctx.strokeRect(cx - 26, ly + 18, 26, lh - 18);
    ctx.strokeRect(cx, ly + 18, 26, lh - 18);
    ctx.fillStyle = '#d4b47c';
    ctx.fillRect(cx - 4, ly + 36, 2, 7); ctx.fillRect(cx + 2, ly + 36, 2, 7);

    // Canopy awning
    ctx.fillStyle = '#241b22';
    ctx.fillRect(cx - 72, ly + 4, 144, 10);
    ctx.fillStyle = '#9c7c4e';
    ctx.fillRect(cx - 72, ly + 12, 144, 2);

    // Subtle brass building address "418" on canopy
    ctx.fillStyle = '#f5deb3';
    ctx.font = 'bold 8px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('418', cx, ly + 11);
    ctx.textAlign = 'left';

    // Winter wreath flanking lobby door
    if (sim.season === 'winter') {
      for (const wx of [cx - 42, cx + 42]) {
        ctx.strokeStyle = '#166534'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(wx, ly + 32, 5.5, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ef4444'; ctx.fillRect(wx - 1.5, ly + 36, 3, 2.5);
      }
    }
  }

  _drawWindowOverlayAndDetails(ctx) {
    const sim = this.sim;

    if (sim.season === 'winter') {
      const cols = ['#fde047', '#ef4444', '#38bdf8', '#4ade80', '#fffbeb'];
      for (let lx = BLDG.x + 8; lx < BLDG.x + BLDG.w - 8; lx += 18) {
        const c = cols[(Math.floor(lx / 18) + Math.floor(sim.frame / 32)) % cols.length];
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(lx, BLDG.y + 3 + Math.sin(lx * 0.09) * 2, 1.6, 0, Math.PI * 2); ctx.fill();
      }
    }

    for (const apt of sim.apartments) {
      for (const rm of apt.rooms) {
        const { x, y, w, h } = rm;

        if (rm.curtains) {
          ctx.fillStyle = 'rgba(20, 22, 32, 0.52)';
          ctx.fillRect(x, y, 8, h); ctx.fillRect(x + w - 8, y, 8, h);
        }

        const bh = Math.round(h * rm.blinds);
        if (bh > 2) {
          ctx.fillStyle = 'rgba(18, 22, 32, 0.82)';
          ctx.fillRect(x, y, w, bh);
          ctx.fillStyle = 'rgba(120, 128, 145, 0.24)';
          for (let sy = y + 3; sy < y + bh; sy += 3) ctx.fillRect(x, sy, w, 1);
        }

        if (rm.crimeTape) {
          ctx.fillStyle = '#facc15'; ctx.fillRect(x + 1, y + h - 14, w - 2, 3);
          ctx.fillStyle = '#111827';
          for (let tx = x + 4; tx < x + w - 4; tx += 10) ctx.fillRect(tx, y + h - 14, 4, 3);
        }

        // Subtle exterior night-sky reflection on unlit glass panes!
        if (rm.light === 'off') {
          const refl = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
          refl.addColorStop(0, 'rgba(95, 130, 185, 0.14)');
          refl.addColorStop(0.5, 'rgba(45, 65, 105, 0.04)');
          refl.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = refl; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
        }

        // Window sash, recessed shadow & mullions
        ctx.strokeStyle = '#131017'; ctx.lineWidth = 2.5;
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
        ctx.fillStyle = 'rgba(18, 15, 22, 0.78)';
        ctx.fillRect(x + w * 0.5 - 1, y, 2, h);
        ctx.fillRect(x, y + h * 0.48, w, 2);

        // Glass specular glare
        const sheen = ctx.createLinearGradient(x, y, x + 28, y + 28);
        sheen.addColorStop(0, 'rgba(205, 228, 255, 0.09)');
        sheen.addColorStop(1, 'rgba(205, 228, 255, 0)');
        ctx.fillStyle = sheen;
        ctx.beginPath(); ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + 30, y + 2); ctx.lineTo(x + 2, y + 28); ctx.closePath(); ctx.fill();

        // Seasonal exterior details
        if (sim.season === 'winter' && apt.decor.xmasLights && rm.idx === 1) {
          const cols = ['#fde047', '#ef4444', '#4ade80'];
          for (let gx = x + 5; gx < x + w - 4; gx += 12) {
            ctx.fillStyle = cols[(gx + Math.floor(sim.frame / 28)) % 3];
            ctx.beginPath(); ctx.arc(gx, y + 2.5, 1.4, 0, Math.PI * 2); ctx.fill();
          }
        }
        if (sim.season === 'spring' && apt.decor.flowers === rm.idx) {
          ctx.fillStyle = '#5c3a28'; ctx.fillRect(x + 12, y + h - 4, 44, 6);
          ctx.fillStyle = '#22c55e'; ctx.fillRect(x + 14, y + h - 8, 40, 4);
          ctx.fillStyle = '#f472b6'; ctx.fillRect(x + 18, y + h - 9, 4, 3); ctx.fillRect(x + 38, y + h - 9, 4, 3);
          ctx.fillStyle = '#fde047'; ctx.fillRect(x + 28, y + h - 9, 4, 3);
        }
        if (sim.season === 'summer' && apt.decor.ac === rm.idx) {
          ctx.fillStyle = '#7c8b9c'; ctx.fillRect(x + w - 24, y + h - 14, 21, 14);
          ctx.fillStyle = '#2a3342'; ctx.fillRect(x + w - 21, y + h - 11, 15, 8);
        }
        if (sim.season === 'winter' || sim.activeWeather() === 'snow') {
          ctx.fillStyle = 'rgba(218, 232, 248, 0.72)';
          ctx.fillRect(x - 3, y + h - 1, w + 6, 2.5);
        }

        // Soft additive bloom spilling onto surrounding brick & sill
        const hasMenorahGlow = sim.season === 'winter' && apt.decor.menorah === rm.idx;
        if (rm.light !== 'off' || hasMenorahGlow) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const bgCol = rm.light === 'tv' ? 'rgba(95, 185, 255, 0.14)'
            : rm.light === 'monitor' ? 'rgba(105, 230, 225, 0.12)'
            : rm.light === 'inspect' ? 'rgba(200, 228, 255, 0.18)'
            : rm.light === 'fire' ? 'rgba(255, 95, 25, 0.28)'
            : rm.light === 'ufo' ? 'rgba(60, 255, 135, 0.24)'
            : rm.light === 'disco' ? 'rgba(255, 85, 210, 0.18)'
            : 'rgba(255, 192, 108, 0.15)';
          const sg = ctx.createRadialGradient(x + w * 0.5, y + h * 0.6, 8, x + w * 0.5, y + h * 0.6, w * 0.82);
          sg.addColorStop(0, bgCol); sg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = sg;
          ctx.fillRect(x - 18, y - 10, w + 36, h + 30);
          ctx.restore();
        }
      }

      if (sim.xrayMode) {
        ctx.strokeStyle = 'rgba(110, 231, 183, 0.72)'; ctx.lineWidth = 1.5;
        ctx.strokeRect(apt.x - 4, apt.y - 4, apt.w + 8, apt.h + 8);
        ctx.fillStyle = 'rgba(110, 231, 183, 0.45)';
        for (let i = 0; i < 2; i++) {
          const px = apt.rooms[i].x + apt.rooms[i].w;
          ctx.fillRect(px + 2, apt.y + apt.h - 28, BLDG.innerPillar - 4, 24);
        }
        ctx.fillStyle = 'rgba(8, 14, 24, 0.88)'; ctx.fillRect(apt.x - 4, apt.y - 18, 36, 13);
        ctx.fillStyle = '#6ee7b7'; ctx.font = 'bold 10px ui-monospace, monospace';
        ctx.fillText(apt.id, apt.x, apt.y - 8);
      }

      const activeId = this.hoveredAptId || this.selectedAptId;
      if (apt.id === activeId) {
        ctx.strokeStyle = apt.id === this.selectedAptId ? '#fbbf24' : 'rgba(251, 191, 36, 0.65)';
        ctx.lineWidth = 2; ctx.strokeRect(apt.x - 4, apt.y - 4, apt.w + 8, apt.h + 8);
      }
    }
  }

  _drawFireEscapes(ctx) {
    ctx.strokeStyle = 'rgba(16, 15, 20, 0.92)';
    ctx.fillStyle = 'rgba(14, 13, 18, 0.94)';
    const unitW = 3 * BLDG.winW + 2 * BLDG.innerPillar;
    for (let col = 1; col <= 2; col++) {
      const fx = BLDG.x + BLDG.sideMargin + col * unitW + (col - 1) * BLDG.aptGap - 14;
      const fw = BLDG.aptGap + 28;
      for (let f = 0; f < BLDG.floors; f++) {
        const fy = BLDG.y + BLDG.topPad + f * BLDG.floorH + BLDG.winH + 2;
        ctx.fillRect(fx, fy, fw, 3);
        ctx.lineWidth = 1.4; ctx.strokeRect(fx + 1, fy - 14, fw - 2, 14);
        for (let rx = fx + 7; rx < fx + fw - 4; rx += 7) {
          ctx.beginPath(); ctx.moveTo(rx, fy - 14); ctx.lineTo(rx, fy); ctx.stroke();
        }
        if (f < BLDG.floors - 1) {
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(fx + 10, fy); ctx.lineTo(fx + fw - 10, fy + BLDG.floorH - 12);
          ctx.moveTo(fx + 16, fy); ctx.lineTo(fx + fw - 4, fy + BLDG.floorH - 12);
          ctx.stroke();
        }
      }
    }
  }

  _drawStreetAndVehicles(ctx) {
    const sim = this.sim;
    const snowy = sim.season === 'winter' || sim.activeWeather() === 'snow';
    const wet = sim.activeWeather() === 'rain' || sim.activeWeather() === 'storm' || snowy;

    // Sidewalk & curb with building base shadow
    ctx.fillStyle = snowy ? '#394356' : '#1f222d';
    ctx.fillRect(-140, BLDG.streetY, VIEW_W + 280, 26);
    if (snowy) {
      ctx.fillStyle = 'rgba(220, 234, 248, 0.36)';
      ctx.fillRect(-140, BLDG.streetY, VIEW_W + 280, 6);
    }
    const baseShadow = ctx.createLinearGradient(0, BLDG.streetY, 0, BLDG.streetY + 12);
    baseShadow.addColorStop(0, 'rgba(0,0,0,0.45)'); baseShadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = baseShadow; ctx.fillRect(BLDG.x - 10, BLDG.streetY, BLDG.w + 20, 12);

    ctx.fillStyle = '#14161f';
    ctx.fillRect(-140, BLDG.streetY + 24, VIEW_W + 280, 4);

    // Wet dark asphalt road
    const roadGrad = ctx.createLinearGradient(0, BLDG.streetY + 28, 0, VIEW_H + 30);
    roadGrad.addColorStop(0, '#131722');
    roadGrad.addColorStop(0.55, '#0c0f18');
    roadGrad.addColorStop(1, '#070910');
    ctx.fillStyle = roadGrad;
    ctx.fillRect(-140, BLDG.streetY + 28, VIEW_W + 280, 120);

    // Photorealistic wet-asphalt specular reflections (soft organic water streaks, never crosswalk-like)
    if (wet) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const spots = [
        { x: BLDG.x + 196, w: 190, col: 'rgba(255, 192, 115, 0.055)' },
        { x: BLDG.x + BLDG.w * 0.5, w: 120, col: 'rgba(255, 212, 136, 0.11)' },
        { x: BLDG.x + BLDG.w - 196, w: 190, col: 'rgba(155, 215, 245, 0.055)' }
      ];
      for (const sp of spots) {
        const bg = ctx.createRadialGradient(sp.x, BLDG.streetY + 36, 12, sp.x, BLDG.streetY + 58, sp.w * 0.72);
        bg.addColorStop(0, sp.col);
        bg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bg;
        ctx.fillRect(sp.x - sp.w, BLDG.streetY + 28, sp.w * 2, 86);
      }
      ctx.restore();
    }

    // Road center lane markings
    ctx.fillStyle = 'rgba(205, 172, 82, 0.24)';
    for (let rx = -120; rx < VIEW_W + 140; rx += 64) {
      ctx.fillRect(rx, BLDG.streetY + 62, 30, 2.2);
    }

    // Urban streetlamps placed cleanly FLANKING the lobby (never blocking the front doors!) with soft volumetric glow
    const lamps = [120, 325, 625, 975, 1275, 1480];
    for (const lx of lamps) {
      ctx.fillStyle = '#1b1f2b';
      ctx.fillRect(lx - 2, BLDG.streetY - 76, 4, 80);
      ctx.fillRect(lx - 9, BLDG.streetY - 78, 18, 3.5);
      ctx.fillStyle = '#fff0bd';
      ctx.beginPath(); ctx.arc(lx, BLDG.streetY - 73, 3.8, 0, Math.PI * 2); ctx.fill();

      // Soft radial atmospheric lamp halo + warm ground pool (no hard geometric triangles!)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(lx, BLDG.streetY - 72, 3, lx, BLDG.streetY - 56, 72);
      halo.addColorStop(0, 'rgba(255, 224, 152, 0.32)');
      halo.addColorStop(0.45, 'rgba(255, 188, 102, 0.09)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(lx, BLDG.streetY - 56, 72, 0, Math.PI * 2); ctx.fill();

      const pool = ctx.createRadialGradient(lx, BLDG.streetY + 14, 6, lx, BLDG.streetY + 26, 95);
      pool.addColorStop(0, 'rgba(255, 200, 118, 0.16)');
      pool.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = pool;
      ctx.fillRect(lx - 95, BLDG.streetY - 12, 190, 72);
      ctx.restore();
    }

    // Sidewalk pedestrians
    for (const p of sim.pedestrians) {
      const bob = Math.abs(Math.sin(p.phase)) * 1.5;
      ctx.fillStyle = p.coat; ctx.fillRect(p.x - 3, p.y - 22 - bob, 6, 16);
      ctx.fillStyle = '#141720'; ctx.fillRect(p.x - 2.5, p.y - 7, 2, 7); ctx.fillRect(p.x + 0.5, p.y - 7, 2, 7);
      ctx.fillStyle = '#d9b59a'; ctx.beginPath(); ctx.arc(p.x, p.y - 25 - bob, 3, 0, Math.PI * 2); ctx.fill();
      if (p.umbrella) { ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(p.x, p.y - 29 - bob, 11, Math.PI, 0); ctx.fill(); }
    }

    for (const c of sim.cars) this._drawSedan(ctx, c);
    if (sim.deliveryVan) this._drawDeliveryVan(ctx, sim.deliveryVan);
    if (sim.fireTruck) this._drawFireTruck(ctx, sim.fireTruck);
    if (sim.policeUnit) this._drawPoliceCruiser(ctx, sim.policeUnit);
    if (sim.ambulance) this._drawAmbulance(ctx, sim.ambulance);

    if (sim.season === 'summer' && sim.activeWeather() === 'clear') {
      for (const f of sim.fireflies) {
        f.x += f.vx; if (f.x < 20 || f.x > VIEW_W - 20) f.vx *= -1;
        const a = 0.2 + 0.65 * (0.5 + 0.5 * Math.sin(sim.frame * 0.05 + f.phase));
        ctx.fillStyle = `rgba(225, 255, 130, ${a.toFixed(2)})`;
        ctx.beginPath(); ctx.arc(f.x, f.y + Math.sin(sim.frame * 0.03 + f.phase) * 6, 1.8, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  _drawSedan(ctx, c) {
    const x = c.x, y = c.y, w = c.w;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const hx = c.dir > 0 ? x + w : x;
    const hg = ctx.createLinearGradient(hx, y + 6, hx + c.dir * 95, y + 6);
    hg.addColorStop(0, 'rgba(255, 245, 200, 0.36)'); hg.addColorStop(1, 'rgba(255, 245, 200, 0)');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.moveTo(hx, y + 4); ctx.lineTo(hx + c.dir * 95, y - 5); ctx.lineTo(hx + c.dir * 95, y + 19); ctx.lineTo(hx, y + 10);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    ctx.fillStyle = c.color;
    ctx.beginPath(); ctx.roundRect(x, y, w, 13, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect(x + w * 0.2, y - 8, w * 0.56, 9, 3); ctx.fill();
    ctx.fillStyle = 'rgba(130, 165, 200, 0.32)'; ctx.fillRect(x + w * 0.24, y - 6, w * 0.48, 5);
    ctx.fillStyle = '#090b10';
    ctx.beginPath(); ctx.arc(x + 13, y + 13, 5, 0, Math.PI * 2); ctx.arc(x + w - 13, y + 13, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff5cc'; ctx.fillRect(c.dir > 0 ? x + w - 3 : x, y + 4, 3, 3.5);
    ctx.fillStyle = '#ff2a38'; ctx.fillRect(c.dir > 0 ? x : x + w - 3, y + 4, 3, 3.5);
  }

  _drawDeliveryVan(ctx, dv) {
    const x = dv.x, y = 804, isPizza = dv.isPizza;
    // Soft ground contact shadow + headlights
    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    ctx.beginPath(); ctx.ellipse(x + 53, y + 23, 56, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const hg = ctx.createLinearGradient(x + 106, y + 10, x + 178, y + 10);
    hg.addColorStop(0, 'rgba(255, 242, 198, 0.28)'); hg.addColorStop(1, 'rgba(255, 242, 198, 0)');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.moveTo(x + 106, y + 7); ctx.lineTo(x + 178, y - 2); ctx.lineTo(x + 178, y + 22); ctx.lineTo(x + 106, y + 15); ctx.closePath(); ctx.fill();
    ctx.restore();

    // Shaded dark-slate van body
    const bodyG = ctx.createLinearGradient(0, y - 10, 0, y + 20);
    bodyG.addColorStop(0, isPizza ? '#8c3518' : '#2a3a4f');
    bodyG.addColorStop(1, isPizza ? '#591f0c' : '#182230');
    ctx.fillStyle = bodyG;
    ctx.beginPath(); ctx.roundRect(x, y - 10, 96, 30, 4); ctx.fill();
    ctx.fillStyle = isPizza ? '#7c2d12' : '#243347';
    ctx.beginPath(); ctx.roundRect(x + 76, y - 6, 30, 26, 5); ctx.fill();
    ctx.fillStyle = 'rgba(130, 190, 235, 0.55)'; ctx.fillRect(x + 87, y - 2, 15, 10);

    // Subtle sleek curved smile arrow (authentic delivery van silhouette!)
    if (isPizza) {
      ctx.fillStyle = '#facc15'; ctx.fillRect(x + 42, y - 16, 18, 6);
    } else {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + 24, y + 6);
      ctx.quadraticCurveTo(x + 46, y + 13, x + 66, y + 4);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 62, y + 3.5); ctx.lineTo(x + 67, y + 4); ctx.lineTo(x + 64, y + 8); ctx.stroke();
    }
    ctx.fillStyle = '#090c12';
    ctx.beginPath(); ctx.arc(x + 20, y + 20, 7, 0, Math.PI * 2); ctx.arc(x + 84, y + 20, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#475569';
    ctx.beginPath(); ctx.arc(x + 20, y + 20, 3, 0, Math.PI * 2); ctx.arc(x + 84, y + 20, 3, 0, Math.PI * 2); ctx.fill();

    if (dv.state === 'dropping' && Math.floor(this.sim.frame / 16) % 2 === 0) {
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath(); ctx.arc(x + 2, y + 10, 3.5, 0, Math.PI * 2); ctx.arc(x + 104, y + 10, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    if (dv.lobbyBox) {
      ctx.fillStyle = isPizza ? '#e5e0d5' : '#b47b44';
      ctx.fillRect(dv.lobbyX - 4, BLDG.streetY - 6, 11, isPizza ? 4 : 8);
    }
    if (dv.courier) {
      const c = dv.courier, bob = Math.abs(Math.sin(c.phase)) * 1.5;
      ctx.fillStyle = isPizza ? '#991b1b' : '#1e3a5f';
      ctx.fillRect(c.x - 3.5, BLDG.streetY - 12 - bob, 7, 16);
      if (!isPizza) { ctx.fillStyle = '#38bdf8'; ctx.fillRect(c.x - 3.5, BLDG.streetY - 7 - bob, 7, 4); }
      ctx.fillStyle = '#e5bc9c'; ctx.beginPath(); ctx.arc(c.x, BLDG.streetY - 15 - bob, 3.3, 0, Math.PI * 2); ctx.fill();
      if (c.hasBox) { ctx.fillStyle = isPizza ? '#e5e0d5' : '#b47b44'; ctx.fillRect(c.x + c.dir * 5 - 3, BLDG.streetY - 10 - bob, 10, isPizza ? 4 : 7); }
    }
  }

  _drawFireTruck(ctx, ft) {
    const x = ft.x, y = 798, flash = Math.floor(this.sim.frame / 7) % 2 === 0;
    // Contact shadow + warm headlight cone
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.ellipse(x + 76, y + 27, 78, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const hg = ctx.createLinearGradient(x + 152, y + 14, x + 240, y + 14);
    hg.addColorStop(0, 'rgba(255, 244, 204, 0.34)'); hg.addColorStop(1, 'rgba(255, 244, 204, 0)');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.moveTo(x + 152, y + 10); ctx.lineTo(x + 240, y + 1); ctx.lineTo(x + 240, y + 26); ctx.lineTo(x + 152, y + 19); ctx.closePath(); ctx.fill();
    ctx.restore();

    // Night-shaded crimson engine body + metallic compartments
    const bodyG = ctx.createLinearGradient(0, y - 12, 0, y + 24);
    bodyG.addColorStop(0, '#b52222');
    bodyG.addColorStop(0.55, '#8a1717');
    bodyG.addColorStop(1, '#590e10');
    ctx.fillStyle = bodyG; ctx.beginPath(); ctx.roundRect(x, y - 10, 146, 34, 3); ctx.fill();
    ctx.fillStyle = '#a31d1d'; ctx.beginPath(); ctx.roundRect(x + 112, y - 12, 40, 36, 4); ctx.fill();
    // Equipment roll-up doors
    ctx.fillStyle = 'rgba(180, 195, 210, 0.25)';
    ctx.fillRect(x + 16, y - 2, 24, 18); ctx.fillRect(x + 48, y - 2, 26, 18); ctx.fillRect(x + 82, y - 2, 22, 18);
    ctx.fillStyle = 'rgba(147, 197, 253, 0.55)'; ctx.fillRect(x + 132, y - 7, 16, 13);
    ctx.fillStyle = 'rgba(248, 250, 252, 0.8)'; ctx.fillRect(x + 4, y + 7, 144, 2.5);
    ctx.fillStyle = '#94a3b8'; ctx.fillRect(x + 10, y - 15, 98, 4);
    ctx.fillStyle = '#090c12';
    ctx.beginPath(); ctx.arc(x + 26, y + 24, 8, 0, Math.PI * 2); ctx.arc(x + 126, y + 24, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#64748b';
    ctx.beginPath(); ctx.arc(x + 26, y + 24, 3.5, 0, Math.PI * 2); ctx.arc(x + 126, y + 24, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = flash ? '#ff2a3c' : '#ffffff'; ctx.beginPath(); ctx.arc(x + 126, y - 15, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = flash ? '#ffffff' : '#ff2a3c'; ctx.beginPath(); ctx.arc(x + 16, y - 13, 3.2, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const wg = ctx.createRadialGradient(x + 85, y - 20, 20, x + 85, y - 180, 440);
    wg.addColorStop(0, flash ? 'rgba(255, 35, 45, 0.28)' : 'rgba(255, 220, 195, 0.14)');
    wg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = wg;
    ctx.fillRect(BLDG.x - 40, BLDG.y + 80, BLDG.w + 80, VIEW_H - BLDG.y);
    // Wet asphalt red puddle reflection beneath truck
    const rw = ctx.createRadialGradient(x + 76, y + 36, 10, x + 76, y + 40, 120);
    rw.addColorStop(0, flash ? 'rgba(255, 40, 50, 0.24)' : 'rgba(255, 200, 180, 0.1)');
    rw.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rw; ctx.fillRect(x - 40, y + 24, 240, 56);
    ctx.restore();
  }

  _drawPoliceCruiser(ctx, pu) {
    const x = pu.x, y = 816, redPhase = Math.floor(this.sim.frame / 6) % 2 === 0;
    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    ctx.beginPath(); ctx.ellipse(x + 39, y + 19, 44, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#141c29'; ctx.beginPath(); ctx.roundRect(x, y, 78, 16, 4); ctx.fill();
    ctx.fillStyle = '#cbd5e1'; ctx.beginPath(); ctx.roundRect(x + 18, y - 10, 38, 11, 4); ctx.fill();
    ctx.fillStyle = 'rgba(130, 175, 215, 0.45)'; ctx.fillRect(x + 22, y - 8, 30, 6);
    ctx.fillStyle = '#090c12';
    ctx.beginPath(); ctx.arc(x + 16, y + 16, 6, 0, Math.PI * 2); ctx.arc(x + 62, y + 16, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = redPhase ? '#ff2438' : '#2480ff'; ctx.fillRect(x + 31, y - 14, 14, 4);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pg = ctx.createRadialGradient(x + 38, y - 14, 16, x + 38, y - 170, 460);
    pg.addColorStop(0, redPhase ? 'rgba(255, 32, 58, 0.28)' : 'rgba(38, 128, 255, 0.28)');
    pg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pg;
    ctx.fillRect(BLDG.x - 40, BLDG.y + 60, BLDG.w + 80, VIEW_H - BLDG.y);
    // Wet asphalt crimson/blue reflection beneath cruiser
    const pr = ctx.createRadialGradient(x + 39, y + 26, 8, x + 39, y + 28, 110);
    pr.addColorStop(0, redPhase ? 'rgba(255, 36, 60, 0.24)' : 'rgba(40, 130, 255, 0.24)');
    pr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pr; ctx.fillRect(x - 60, y + 14, 200, 52);
    ctx.restore();
  }

  _drawAmbulance(ctx, am) {
    const x = am.x, y = 804, flash = Math.floor(this.sim.frame / 7) % 2 === 0;
    ctx.fillStyle = '#e2e8f0'; ctx.beginPath(); ctx.roundRect(x, y - 10, 104, 30, 4); ctx.fill();
    ctx.fillStyle = '#dc2626'; ctx.fillRect(x + 2, y + 4, 100, 5);
    ctx.fillRect(x + 34, y - 4, 12, 3); ctx.fillRect(x + 38.5, y - 8, 3, 11);
    ctx.fillStyle = '#93c5fd'; ctx.fillRect(x + 84, y - 5, 16, 10);
    ctx.fillStyle = '#090c12';
    ctx.beginPath(); ctx.arc(x + 20, y + 20, 7, 0, Math.PI * 2); ctx.arc(x + 84, y + 20, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = flash ? '#ff2a3c' : '#ffffff'; ctx.beginPath(); ctx.arc(x + 82, y - 13, 3.8, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const ag = ctx.createRadialGradient(x + 60, y - 14, 16, x + 60, y - 140, 340);
    ag.addColorStop(0, flash ? 'rgba(255, 40, 55, 0.2)' : 'rgba(240, 248, 255, 0.14)');
    ag.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ag; ctx.fillRect(BLDG.x - 40, BLDG.y + 120, BLDG.w + 80, VIEW_H - BLDG.y);
    ctx.restore();
  }

  _drawUFO(ctx, u) {
    if (u.beamAlpha > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const bg = ctx.createLinearGradient(0, u.y, 0, u.room.y + u.room.h);
      bg.addColorStop(0, `rgba(70, 255, 150, ${(u.beamAlpha * 0.42).toFixed(2)})`);
      bg.addColorStop(1, `rgba(40, 225, 120, ${(u.beamAlpha * 0.14).toFixed(2)})`);
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(u.x - 16, u.y + 8); ctx.lineTo(u.x - 52, u.room.y + u.room.h); ctx.lineTo(u.x + 52, u.room.y + u.room.h); ctx.lineTo(u.x + 16, u.y + 8);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#5c6b7a'; ctx.beginPath(); ctx.ellipse(u.x, u.y + 4, 42, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9bb0c2'; ctx.beginPath(); ctx.ellipse(u.x, u.y - 2, 22, 8, 0, Math.PI, 0); ctx.fill();
    const lOff = Math.floor(this.sim.frame / 6) % 5;
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i === lOff ? '#ffffff' : '#4ade80';
      ctx.beginPath(); ctx.arc(u.x - 28 + i * 14, u.y + 5, 2.3, 0, Math.PI * 2); ctx.fill();
    }
  }

  _drawWeatherAndAtmosphere(ctx) {
    const sim = this.sim;
    const w = sim.activeWeather();

    if (w === 'rain' || w === 'storm') {
      const mult = w === 'storm' ? 1.55 : 1;
      ctx.lineWidth = w === 'storm' ? 1.3 : 1;
      for (const r of sim.raindrops) {
        r.y += r.speed * mult; r.x -= r.speed * (w === 'storm' ? 0.36 : 0.16);
        if (r.y > VIEW_H) { r.y = -15; r.x = Math.random() * (VIEW_W + 240); }
        if (r.x < -20) r.x = VIEW_W + 20;
        ctx.strokeStyle = `rgba(180, 210, 245, ${(r.alpha * (w === 'storm' ? 1.3 : 1)).toFixed(2)})`;
        ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - (w === 'storm' ? 4.5 : 2), r.y + r.len); ctx.stroke();
      }
    } else if (w === 'snow') {
      for (const s of sim.snowflakes) {
        s.y += s.speed; s.x += Math.sin(sim.frame * 0.015 + s.drift) * 0.55 - 0.15;
        if (s.y > VIEW_H + 4) { s.y = -4; s.x = Math.random() * VIEW_W; }
        if (s.x < -4) s.x = VIEW_W + 4; if (s.x > VIEW_W + 4) s.x = -4;
        ctx.fillStyle = `rgba(235, 244, 255, ${s.alpha.toFixed(2)})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
    } else if (w === 'leaves') {
      for (const l of sim.leaves) {
        l.y += l.speed; l.x += 1.1 + Math.sin(sim.frame * 0.035 + l.phase) * 0.9;
        if (l.y > VIEW_H + 6) { l.y = -6; l.x = Math.random() * VIEW_W; }
        if (l.x > VIEW_W + 10) l.x = -8;
        ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(sim.frame * 0.04 + l.phase);
        ctx.fillStyle = l.color; ctx.beginPath(); ctx.ellipse(0, 0, l.size, l.size * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }

    // Subtle filmic grain pattern across scene for distant photographic realism
    const pat = ctx.createPattern(this.grainCache, 'repeat');
    if (pat) {
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    // Gentle edge vignette
    const vig = ctx.createRadialGradient(VIEW_W * 0.5, VIEW_H * 0.5, VIEW_W * 0.36, VIEW_W * 0.5, VIEW_H * 0.5, VIEW_W * 0.72);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(2, 4, 10, 0.38)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  hitTestApartment(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = VIEW_W / rect.width;
    const scaleY = VIEW_H / rect.height;
    const wx = (clientX - rect.left) * scaleX + this.sim.camX;
    const wy = (clientY - rect.top) * scaleY + this.sim.camY;
    for (const apt of this.sim.apartments) {
      if (wx >= apt.x - 4 && wx <= apt.x + apt.w + 4 && wy >= apt.y - 4 && wy <= apt.y + apt.h + 4) {
        return apt.id;
      }
    }
    return null;
  }
}
