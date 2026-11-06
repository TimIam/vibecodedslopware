/* Original code/SVG cat; no GIF or third-party cat image. */
(() => {
  'use strict';
  window.createCaseOdleWinCat = ({ getAudioContext, onNext }) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'win-cat-dialog';
    dialog.setAttribute('aria-labelledby', 'win-cat-title');
    dialog.innerHTML = `<div class="win-cat-controls"><h2 id="win-cat-title">Solved! Kitty time.</h2><button type="button" class="win-cat-next">Next puzzle</button><button type="button" class="win-cat-close" aria-label="Close celebration">Close</button></div>
      <div class="win-cat-stage" aria-hidden="true"><div class="win-cat-sprite">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <title>Original black cat</title>
        <path class="cat-outline" d="M144 153C184 149 184 112 166 116C154 118 170 133 150 133" fill="none" stroke-width="12"/>
        <path class="cat-outline" d="M63 105Q43 125 53 168Q46 185 65 185H137Q154 185 147 168Q156 125 136 105Z"/>
        <path class="cat-outline" d="M49 78L43 18Q43 12 50 16L80 41Q100 33 120 41L150 16Q157 12 157 18L151 78Q160 115 131 125Q100 136 69 125Q40 115 49 78Z"/>
        <path d="M52 30L57 62L72 47ZM148 30L143 62L128 47Z" fill="#6b344b"/>
        <path d="M63 70Q75 58 90 70Q85 90 72 85Q64 82 63 70Z" class="cat-eye"/>
        <path d="M110 70Q125 58 137 70Q136 82 128 85Q115 90 110 70Z" class="cat-eye"/>
        <ellipse cx="78" cy="73" rx="3" ry="11" class="cat-pupil"/><ellipse cx="122" cy="73" rx="3" ry="11" class="cat-pupil"/>
        <circle cx="72" cy="68" r="2.2" class="cat-highlight"/><circle cx="116" cy="68" r="2.2" class="cat-highlight"/>
        <path d="M94 96H106L100 102Z" fill="#db8ea3"/>
        <path d="M100 102V107Q91 116 84 107M100 107Q109 116 116 107" stroke="#9a7889" stroke-width="2" fill="none"/>
        <path d="M67 96L32 90M67 104L29 108M133 96L168 90M133 104L171 108M76 151V178M124 151V178" stroke="#8b8597" stroke-width="2" fill="none"/>
      </svg></div></div>`;
    document.body.appendChild(dialog);
    const stage = dialog.querySelector('.win-cat-stage');
    const sprite = dialog.querySelector('.win-cat-sprite');
    const closeButton = dialog.querySelector('.win-cat-close');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let active = false, frame = 0, timer = 0, finish = null, epoch = 0;
    let loop = null, meow = null, gain = null, bufferPromise = null, previousFocus = null;
    let state = null;

    const stopNode = node => { if (!node) return; try { node.stop(); } catch {} try { node.disconnect(); } catch {} };
    function stopAudio() {
      stopNode(loop); stopNode(meow); loop = meow = null;
      if (gain) { gain.disconnect(); gain = null; }
    }
    function soundBuffer(ac) {
      if (!bufferPromise) bufferPromise = fetch('oinky.m4a').then(r => {
        if (!r.ok) throw new Error('Oinky audio unavailable');
        return r.arrayBuffer();
      }).then(bytes => ac.decodeAudioData(bytes)).catch(() => { bufferPromise = null; return null; });
      return bufferPromise;
    }
    function playLoop(id) {
      const ac = getAudioContext();
      if (!ac || ac.state !== 'running') return;
      soundBuffer(ac).then(buffer => {
        if (!buffer || !active || epoch !== id || document.hidden || dialog.dataset.phase === 'final') return;
        gain = ac.createGain(); gain.gain.value = 0.85; gain.connect(ac.destination);
        loop = ac.createBufferSource(); loop.buffer = buffer; loop.loop = true;
        loop.connect(gain); loop.start();
      });
    }
    function playMeow() {
      const ac = getAudioContext();
      if (!ac || ac.state !== 'running' || document.hidden || !active) return;
      // One quiet original synthesized meow, with a voiced pitch and moving formants.
      const duration = 0.58, buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * duration), ac.sampleRate);
      const samples = buffer.getChannelData(0); let phase = 0;
      for (let i = 0; i < samples.length; i++) {
        const t = i / ac.sampleRate, u = t / duration;
        const hz = 390 + 180 * Math.sin(Math.PI * Math.min(1, u * 1.4)) - 120 * u;
        phase += 2 * Math.PI * hz / ac.sampleRate;
        const envelope = Math.min(1, t / 0.035) * Math.pow(1 - u, 1.1);
        samples[i] = (Math.sin(phase) + 0.4 * Math.sin(phase * 2) + 0.18 * Math.sin(phase * 3)) * envelope * 0.18;
      }
      gain = ac.createGain(); gain.gain.value = 0.8; gain.connect(ac.destination);
      meow = ac.createBufferSource(); meow.buffer = buffer; meow.connect(gain); meow.start();
    }
    function bounds() { return { width: stage.clientWidth, height: stage.clientHeight }; }
    function draw() {
      sprite.style.width = sprite.style.height = `${state.size}px`;
      sprite.style.transform = `translate(${state.x}px,${state.y}px) rotate(${state.angle}deg)`;
    }
    function placeFinalPose() {
      const b = bounds(); state.size = Math.max(1, Math.min(b.width, b.height) * 0.93);
      state.x = (b.width - state.size) / 2; state.y = (b.height - state.size) / 2; state.angle = 0;
      draw();
    }
    function finale() {
      if (!active || dialog.dataset.phase === 'final') return;
      cancelAnimationFrame(frame); frame = 0; clearTimeout(timer); timer = 0;
      stopAudio();
      sprite.style.removeProperty('--neon'); dialog.dataset.phase = 'final'; placeFinalPose();
      // The final pose is front-facing and stationary; neither hue nor position changes again.
      playMeow();
    }
    function tick(now) {
      if (!active || document.hidden) return cancel();
      if (reduced.matches) return finale();
      const dt = Math.min(0.04, Math.max(0, (now - state.last) / 1000)); state.last = now;
      const b = bounds();
      const small = Math.max(58, Math.min(145, Math.min(b.width, b.height) * 0.2));
      const target = state.bounces < 8 ? small : Math.min(b.width, b.height) * (state.bounces === 8 ? 0.5 : 0.85);
      state.size += (target - state.size) * Math.min(1, dt * 13);
      const maxX = Math.max(0, b.width - state.size), maxY = Math.max(0, b.height - state.size);
      state.x += state.vx * dt; state.y += state.vy * dt;
      let hit = false;
      if (state.x < 0) { state.x = 0; state.vx = Math.abs(state.vx); hit = true; }
      else if (state.x > maxX) { state.x = maxX; state.vx = -Math.abs(state.vx); hit = true; }
      if (state.y < 0) { state.y = 0; state.vy = Math.abs(state.vy); hit = true; }
      else if (state.y > maxY) { state.y = maxY; state.vy = -Math.abs(state.vy); hit = true; }
      if (hit && now - state.lastBounce > 170) {
        state.lastBounce = now; state.bounces++;
        if (state.bounces >= 10) return finale();
      }
      state.angle += dt * 610;
      state.hue = (state.hue + dt * 105) % 360;
      sprite.style.setProperty('--neon', `hsl(${state.hue} 100% 65%)`);
      draw(); frame = requestAnimationFrame(tick);
    }
    function cancel() {
      epoch++; active = false;
      cancelAnimationFrame(frame); frame = 0; clearTimeout(timer); timer = 0;
      stopAudio();
      if (dialog.open) dialog.close();
      const resolve = finish; finish = null; if (resolve) resolve();
      if (previousFocus?.isConnected && !document.hidden) previousFocus.focus({ preventScroll: true });
      previousFocus = null;
    }
    function start() {
      cancel(); if (document.hidden) return Promise.resolve();
      const id = ++epoch; active = true; previousFocus = document.activeElement;
      dialog.dataset.phase = reduced.matches ? 'calm' : 'bounce';
      dialog.showModal(); closeButton.focus({ preventScroll: true });
      const b = bounds(), small = Math.max(58, Math.min(145, Math.min(b.width, b.height) * 0.2));
      state = { x: b.width * 0.2, y: b.height * 0.2, size: small, vx: Math.max(360, b.width * 0.9), vy: Math.max(330, b.height * 1.25), angle: 0, hue: 160, bounces: 0, lastBounce: -1000, last: performance.now() };
      sprite.style.setProperty('--neon', '#38ffcf');
      const result = new Promise(resolve => { finish = resolve; });
      if (reduced.matches) {
        state.x = (b.width - small) / 2; state.y = (b.height - small) / 2; draw();
        // Static pose and fixed color throughout; one approved audio loop, then the final pose.
        timer = setTimeout(finale, 2344);
      } else { draw(); frame = requestAnimationFrame(tick); }
      playLoop(id); return result;
    }
    closeButton.addEventListener('click', cancel);
    dialog.querySelector('.win-cat-next').addEventListener('click', () => { cancel(); onNext(); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
    dialog.addEventListener('close', () => { if (active) cancel(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
    window.addEventListener('pagehide', cancel);
    reduced.addEventListener('change', () => { if (active) finale(); });
    window.addEventListener('resize', () => { if (active && dialog.dataset.phase === 'final') placeFinalPose(); });
    return { start, cancel };
  };
})();
