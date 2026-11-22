import { STEP, weapons, ranks, clamp, neutral, makeRound, nearby, tick, bot } from './arena.js';
import { createView } from './view.js';
import { makeCode, validCode, openRoom } from './room.js';

const $ = (id) => document.getElementById(id),
  canvas = $('arena');
const show = (id, visible) => {
  $(id).hidden = !visible;
};
let mode = 'menu',
  local = 0,
  game = makeRound(),
  room = null,
  host = false,
  view,
  paused = false;
let remote = neutral(),
  input = neutral(),
  scores = [0, 0],
  scoreCounted = false,
  resultShown = false;
let latest = null,
  previous = null,
  arrival = 0,
  netClock = 0,
  carry = 0,
  prevTime = 0,
  lastEvent = 0,
  hintUntil = 0;
const keys = new Set();
let drag = null,
  cutSide = 1,
  grabbingUntil = 0,
  lungingUntil = 0,
  stick = [0, 0],
  touchGuard = false,
  touchRun = false,
  jumpStart = null,
  jumpSequence = 0,
  touchShort = false;
const validInvite = (new URL(location.href).searchParams.get('room') || '').trim().toUpperCase();
let audio = null,
  sound = false;
function tone(type) {
  if (!sound || !audio) return;
  const t = audio.currentTime,
    notes =
      type === 'clash'
        ? [832, 1426, 2149]
        : type === 'equip'
          ? [330, 495]
          : type === 'fall'
            ? [90, 56]
            : [128, 72];
  for (const [i, hz] of notes.entries()) {
    const osc = audio.createOscillator(),
      gain = audio.createGain();
    osc.type = type === 'clash' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(hz, t);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(35, hz * (type === 'clash' ? 0.91 : 0.54)),
      t + 0.16
    );
    gain.gain.setValueAtTime(0.1 / (i + 1), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.23);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  }
}
$('sound').onclick = async () => {
  sound = !sound;
  if (sound) {
    audio ??= new AudioContext();
    await audio.resume();
    tone('equip');
  }
  $('sound').textContent = sound ? 'Sound on' : 'Sound off';
  $('sound').setAttribute('aria-pressed', String(sound));
};
function clearInputs() {
  keys.clear();
  input = neutral();
  remote = neutral();
  drag = null;
  touchGuard = false;
  touchRun = false;
  jumpStart = null;
  touchShort = false;
  stick = [0, 0];
  grabbingUntil = lungingUntil = 0;
  $('stick').firstElementChild.style.transform = '';
}
function closeRoom() {
  const old = room;
  room = null;
  old?.close();
}
function menu(message = '', lobby = false) {
  closeRoom();
  mode = 'menu';
  local = 0;
  paused = false;
  clearInputs();
  latest = previous = null;
  canvas.blur();
  $('stage').className = 'menu';
  show('intro', true);
  show('choices', !lobby);
  show('lobby', lobby);
  show('roomForm', true);
  show('invite', false);
  for (const id of ['hud', 'result', 'gear', 'message', 'exit', 'touch']) show(id, false);
  $('notice').textContent = message;
  game = makeRound();
  game.p[0].x = -0.79;
  game.p[0].z = 0.18;
  game.p[0].face = 1.9;
  game.p[1].x = 0.74;
  game.p[1].z = -0.27;
  game.p[1].face = -1.12;
  game.p[1].weapon = 2;
}
function message(s, duration = 2) {
  $('message').textContent = s;
  show('message', true);
  hintUntil = performance.now() + duration * 1000;
}
function begin(solo, round = 1, loadout = 0) {
  mode = solo ? 'solo' : 'online';
  game = makeRound(round, solo, loadout);
  if (round === 1) scores = [0, 0];
  resultShown = false;
  scoreCounted = false;
  lastEvent = 0;
  latest = previous = null;
  carry = netClock = 0;
  clearInputs();
  $('stage').className = 'playing';
  show('intro', false);
  show('result', false);
  for (const id of ['hud', 'gear', 'exit']) show(id, true);
  show('touch', matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
  canvas.focus({ preventScroll: true });
  message(solo ? 'Step onto the sun seal to summon your rival.' : 'Duel · first to two', 3.8);
  updateHud();
}
function connect(isHost, code) {
  closeRoom();
  host = isHost;
  local = isHost ? 0 : 1;
  $('notice').textContent = 'Connecting to the room…';
  show('roomForm', false);
  show('invite', false);
  let active;
  const callbacks = {
    ready() {
      if (room !== active) return;
      show('invite', host);
      $('inviteCode').textContent = code;
      $('notice').textContent = host ? 'Waiting for a second fighter.' : 'Looking for the host…';
    },
    start() {
      if (room === active) begin(false);
    },
    error(msg) {
      if (room === active) menu(msg, true);
    },
    input(value) {
      remote = value;
    },
    state(state) {
      if (mode !== 'online') return;
      if (state.round !== game.round || (resultShown && state.winner < 0)) {
        begin(false, state.round);
      }
      if (Array.isArray(state.score)) scores = state.score;
      previous = latest;
      latest = state;
      arrival = performance.now();
      game = structuredClone(state);
    }
  };
  try {
    active = openRoom(code, host, callbacks);
    room = active;
  } catch {
    menu('The room service could not open. Try again.', true);
  }
}
$('solo').onclick = () => {
  local = 0;
  begin(true);
};
$('online').onclick = () => menu('Share a room code or join a friend.', true);
$('back').onclick = () => menu();
$('host').onclick = () => connect(true, makeCode());
$('joinForm').onsubmit = (e) => {
  e.preventDefault();
  const code = $('code').value.trim().toUpperCase();
  if (validCode(code)) connect(false, code);
  else $('notice').textContent = 'Enter the six-character code from the host.';
};
$('copy').onclick = async () => {
  const url = new URL(location.href);
  url.searchParams.set('room', $('inviteCode').textContent);
  try {
    await navigator.clipboard.writeText(url.href);
    $('notice').textContent = 'Invite link copied. Waiting for your rival.';
  } catch {
    $('notice').textContent = 'Share this room code with your rival.';
  }
};
$('helpBtn').onclick = () => {
  clearInputs();
  paused = mode === 'solo';
  $('help').showModal();
};
$('closeHelp').onclick = () => $('help').close();
$('help').onclose = () => {
  paused = false;
  if (mode !== 'menu') canvas.focus();
};
$('exit').onclick = $('leave').onclick = () => menu();
window.addEventListener('pagehide', closeRoom);
window.addEventListener('blur', () => {
  clearInputs();
});
function cut() {
  cutSide = input.yaw >= 0 ? -1 : 1;
  input.yaw = cutSide * 1.52;
  input.pitch = cutSide === 1 ? 0.08 : 0.37;
}
function releaseJump() {
  if (jumpStart === null) return;
  input.jumpId=++jumpSequence;
  input.jumpPower = clamp((performance.now() - jumpStart) / 420, 0, 1);
  jumpStart = null;
}
const usedKeys = [
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyJ',
  'KeyK',
  'KeyE',
  'Space',
  'KeyF',
  'KeyR',
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown'
];
window.addEventListener('keydown', (e) => {
  if (
    mode === 'menu' ||
    $('help').open ||
    resultShown ||
    !usedKeys.includes(e.code) ||
    e.target.closest('button,a,input')
  )
    return;
  e.preventDefault();
  keys.add(e.code);
  if (!e.repeat && e.code === 'KeyJ') cut();
  if (!e.repeat && e.code === 'KeyE') grabbingUntil = performance.now() + 200;
  if (!e.repeat && e.code === 'KeyF') lungingUntil = performance.now() + 200;
  if (!e.repeat && e.code === 'Space') jumpStart = performance.now();
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Space') releaseJump();
});
canvas.oncontextmenu = (e) => e.preventDefault();
canvas.onpointerdown = (e) => {
  if (mode === 'menu' || resultShown) return;
  canvas.setPointerCapture(e.pointerId);
  canvas.focus();
  if (e.pointerType === 'mouse') touchGuard = Boolean(e.buttons & 2);
  drag = {
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    sx: e.clientX,
    sy: e.clientY,
    moved: false,
    guard: touchGuard
  };
};
canvas.onpointermove = (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  if (e.pointerType === 'mouse') {
    touchGuard = Boolean(e.buttons & 2);
    drag.guard ||= touchGuard;
  }
  const dx = e.clientX - drag.x,
    dy = e.clientY - drag.y;
  if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) drag.moved = true;
  input.yaw = clamp(input.yaw - dx * 0.019, -1.75, 1.75);
  input.pitch = clamp(input.pitch - dy * 0.013, -0.95, 1.24);
  drag.x = e.clientX;
  drag.y = e.clientY;
};
canvas.onpointerup = (e) => {
  if (drag?.id === e.pointerId) {
    if (!drag.moved && !drag.guard && e.button !== 2) cut();
    drag = null;
  }
  if (e.pointerType === 'mouse') touchGuard = false;
};
canvas.onpointercancel = () => {
  drag = null;
  touchGuard = false;
};
const pad = $('stick');
function moveStick(e) {
  const r = pad.getBoundingClientRect(),
    x = ((e.clientX - r.left) / r.width) * 2 - 1,
    y = ((e.clientY - r.top) / r.height) * 2 - 1;
  const div = Math.max(1, Math.hypot(x, y));
  stick = [x / div, -y / div];
  pad.firstElementChild.style.transform = 'translate(' + stick[0] * 25 + 'px,' + -stick[1] * 25 + 'px)';
}
pad.onpointerdown = (e) => {
  pad.setPointerCapture(e.pointerId);
  moveStick(e);
};
pad.onpointermove = (e) => {
  if (pad.hasPointerCapture(e.pointerId)) moveStick(e);
};
pad.onlostpointercapture = () => {
  stick = [0, 0];
  pad.firstElementChild.style.transform = '';
};
document.querySelectorAll('[data-press]').forEach((button) => {
  const kind = button.dataset.press;
  button.onpointerdown = (e) => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    if (kind === 'guard') touchGuard = true;
    if (kind === 'run') touchRun = true;
    if (kind === 'jump') jumpStart = performance.now();
    if (kind === 'short') touchShort = true;
    if (kind === 'cut') cut();
    if (kind === 'grab') grabbingUntil = performance.now() + 200;
    if (kind === 'thrust') lungingUntil = performance.now() + 200;
  };
  button.onlostpointercapture = () => {
    if (kind === 'guard') touchGuard = false;
    if (kind === 'run') touchRun = false;
    if (kind === 'jump') jumpStart = null;
    if (kind === 'short') touchShort = false;
  };
  if (kind === 'jump') button.onpointerup = releaseJump;
});
function readInput(dt) {
  const held = (k) => Number(keys.has(k));
  input.fwd = clamp(held('KeyW') - held('KeyS') + stick[1], -1, 1);
  input.side = clamp(held('KeyD') - held('KeyA') + stick[0], -1, 1);
  input.yaw = clamp(input.yaw + (held('ArrowLeft') - held('ArrowRight')) * dt * 5, -1.75, 1.75);
  input.pitch = clamp(input.pitch + (held('ArrowUp') - held('ArrowDown')) * dt * 4, -0.95, 1.24);
  input.guard = touchGuard || keys.has('KeyK');
  input.short = touchShort || keys.has('KeyR');
  input.run = touchRun || keys.has('ShiftLeft') || keys.has('ShiftRight');
  input.crouch = jumpStart !== null || keys.has('ControlLeft') || keys.has('ControlRight');
  input.grab = performance.now() < grabbingUntil;
  input.thrust = performance.now() < lungingUntil;
}
function updateHud() {
  const p = game.p[local],
    o = game.p[1 - local];
  $('myName').textContent = local === 0 ? 'You · Moss' : 'You · Rust';
  $('foeName').textContent =
    mode === 'solo'
      ? ranks[Math.min(2, Math.floor((game.round - 1) / 2))]
      : local === 0
        ? 'Rust'
        : 'Moss';
  $('myHp').value = p.hp;
  $('foeHp').value = o.hp;
  $('balance').value = p.balance;
  $('round').textContent =
    mode === 'solo'
      ? 'Abyss · ' + game.round + ' / 5'
      : 'Duel · ' + scores[local] + ' – ' + scores[1 - local];
  $('weapon').textContent =
    weapons[p.weapon].name +
    (p.guard ? ' · Guard' : p.short ? ' · Short grip' : '') +
    (p.height > 0.01 ? ' · Airborne' : p.running ? ' · Running' : p.bend > 0.55 ? ' · Crouched' : '') +
    (p.exhausted ? ' · Winded' : '');
  const item = nearby(game, p);
  $('equipHint').textContent = item
    ? (matchMedia('(pointer:coarse)').matches ? 'Swap' : 'E to swap') + ' · ' + weapons[item.w].name
    : game.scouting
      ? 'Choose your gear, then enter the sun seal.'
      : '';
}
function finish() {
  resultShown = true;
  show('message', false);
  show('result', true);
  show('touch', false);
  show('exit', false);
  const won = game.winner === local,
    solo = mode === 'solo',
    complete = solo ? !won || game.round >= 5 : Math.max(...scores) >= 2;
  $('resultTitle').textContent = solo
    ? won
      ? complete
        ? 'The pit is yours.'
        : 'Bout won. Single dent.'
      : 'Down in the Abyss.'
    : complete
      ? won
        ? 'Duel won.'
        : 'Duel lost.'
      : won
        ? 'Round won.'
        : 'Round lost.';
  $('resultText').textContent = solo
    ? won
      ? complete
        ? 'You survived all five bouts.'
        : 'Keep your weapon for the next challenger.'
      : 'Your run ended in bout ' + game.round + ' of 5.'
    : 'Moss ' + scores[0] + ' · Rust ' + scores[1] + (host ? '' : '. Waiting for the host.');
  $('again').textContent = complete
    ? solo
      ? 'New run'
      : 'Rematch'
    : solo
      ? 'Face next challenger'
      : 'Next round';
  show('again', solo || host);
  $('again').onclick = () => {
    begin(solo, complete ? 1 : game.round + 1, solo && !complete ? game.p[0].weapon : 0);
  };
}
// Interpolate remote transforms between host snapshots, keeping all hits on the host.
function displayState(now) {
  if (!previous || !latest || mode !== 'online' || host || latest.round !== previous.round) return game;
  const u = clamp((now - arrival) / 83, 0, 1);
  return {
    ...game,
    p: game.p.map((p, i) => {
      const old = previous.p[i],
        res = { ...p };
      for (const k of ['x', 'z', 'yaw', 'pitch', 'walk', 'down', 'recoil', 'height', 'bend', 'vx', 'vz'])
        res[k] = old[k] + (p[k] - old[k]) * u;
      const d = p.face - old.face;
      res.face = old.face + Math.atan2(Math.sin(d), Math.cos(d)) * u;
      return res;
    })
  };
}
function frame(now) {
  const dt = Math.min(0.09, Math.max(0, (now - prevTime) / 1000));
  prevTime = now;
  if (mode === 'menu') {
    game.p[0].yaw = -0.4 + 0.3 * Math.sin(now * 0.00055);
    game.p[0].pitch = 0.64 + 0.07 * Math.sin(now * 0.00075);
    game.p[1].yaw = 0.13 + 0.25 * Math.sin(now * 0.00065);
    game.p[1].pitch = 0.9 + 0.11 * Math.sin(now * 0.0006);
  } else if (!paused) {
    readInput(dt);
    if (mode === 'solo' || host) {
      carry += dt;
      while (carry >= STEP) {
        tick(game, [input, mode === 'solo' ? bot(game) : remote]);
        carry -= STEP;
      }
      if (!scoreCounted && game.winner >= 0) {
        scores[game.winner]++;
        scoreCounted = true;
      }
    }
    if (mode === 'online' && room) {
      netClock += dt;
      if (netClock >= 1 / 12) {
        netClock %= 1 / 12;
        room.send(host ? 'state' : 'input', host ? { ...game, score: scores } : input);
      }
    }
    if (game.event && game.event.n !== lastEvent) {
      lastEvent = game.event.n;
      view.burst(game.event);
      tone(game.event.type);
      if (game.event.type === 'clash') message('Steel on steel', 0.55);
      if (game.event.type === 'summon') message($('foeName').textContent + ' enters the pit', 1.85);
    }
    if (game.winner >= 0 && game.p[1 - game.winner].down > 0.85 && !resultShown) finish();
    if (hintUntil < now) show('message', false);
    updateHud();
  }
  view.draw(displayState(now), mode === 'menu' ? 'menu' : 'play', local, dt, now / 1000);
  requestAnimationFrame(frame);
}
try {
  view = await createView(canvas);
  menu();
  $('solo').disabled = $('online').disabled = false;
  if (validCode(validInvite)) {
    $('code').value = validInvite;
    menu('Your invite is ready. Select Join to enter.', true);
  }
  requestAnimationFrame(frame);
} catch (e) {
  console.error(e);
  $('notice').textContent = 'The 3D arena could not load. Enable WebGL in your browser and reload.';
}
