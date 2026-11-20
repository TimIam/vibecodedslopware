import { STEP, weapons, ranks, clamp, neutral, makeRound, tick, bot } from './arena.js';
import { makeYard, frameInput, stepYard, maxFrames, tail } from './yard.js';
import { gripLabel } from './grabs.js';
import { freeHandTarget } from './hands.js';
import { regionNames } from './contact.js';
import { playContact } from './audio.js';
import { createView } from './view.js';
import { guestPrediction } from './prediction.js';
import { makeCode, validCode, openRoom, warmLobby, leaveLobby } from './room.js';

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
  carry = 0,
  prevTime = 0,
  lastEvent = 0,
  hintUntil = 0;
let prediction = guestPrediction(),
  inputAck = 0,
  lastInputSent = -Infinity,
  spacing = 1000 / 24;
let hostTimer,
  hostTime = 0,
  snapshotDue = 0,
  sentEvent = 0;
const keys = new Set();
let drag = null,
  handSequence = 0,
  lungingUntil = 0,
  stick = [0, 0],
  touchGuard = false,
  mouseSecondary = false,
  offhandUntil = 0,
  boutSequence = 0,
  touchRun = false,
  jumpStart = null,
  jumpSequence = 0,
  touchShort = false;
const validInvite = (new URL(location.href).searchParams.get('room') || '').trim().toUpperCase();
let audio = null,
  sound = false;
function tone(type, surface) {
  if (sound && audio) playContact(audio, type, surface);
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
  mouseSecondary = false;
  offhandUntil = 0;
  touchRun = false;
  jumpStart = null;
  touchShort = false;
  stick = [0, 0];
  lungingUntil = 0;
  $('stick').firstElementChild.style.transform = '';
}
function closeRoom() {
  clearInterval(hostTimer);
  const old = room;
  room = null;
  old?.close();
}
function menu(message = '', lobby = false) {
  closeRoom();
  if (lobby) warmLobby();
  else leaveLobby();
  mode = 'menu';
  yardWorker?.terminate();
  yardWorker = null;
  show('yardPanel', false);
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
  game.p[1].right = game.p[1].weapon = 2;
}
function message(s, duration = 2) {
  $('message').textContent = s;
  show('message', true);
  hintUntil = performance.now() + duration * 1000;
}
function begin(solo, round = 1, gear = null) {
  mode = solo ? 'solo' : 'online';
  game = makeRound(round, solo, gear?.weapon ?? 0);
  prediction = guestPrediction();
  inputAck = 0;
  lastInputSent = -Infinity;
  if (host && !solo) game.boutId = ++boutSequence;
  if (gear) Object.assign(game.p[0], { right: gear.right, left: gear.left });
  if (round === 1) scores = [0, 0];
  resultShown = false;
  scoreCounted = false;
  lastEvent = 0;
  latest = previous = null;
  carry = 0;
  clearInterval(hostTimer);
  if (!solo && host) {
    hostTime = performance.now();
    snapshotDue = hostTime;
    sentEvent = 0;
    hostTimer = setInterval(() => runHost(performance.now()), STEP * 1000);
  }
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
      if (value.boutId === game.boutId) remote = value;
    },
    state(state) {
      if (mode !== 'online') return;
      if (state.round !== game.round || (resultShown && state.winner < 0)) {
        begin(false, state.round);
      }
      if (Array.isArray(state.score)) scores = state.score;
      previous = latest?.boutId === state.boutId ? latest : null;
      if (previous) spacing += (clamp(performance.now() - arrival, 8, 90) - spacing) * 0.25;
      latest = state;
      arrival = performance.now();
      game = state;
      prediction.accept(state);
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
let clip = [],
  yardState = 'live',
  cursor = 0,
  yardWorker = null,
  comparisons = [];
const weaponChoice = () => $('yardWeapon').selectedIndex,
  armorChoice = () => $('yardArmor').selectedIndex;
function resetYard(state) {
  game = makeYard(weaponChoice(), armorChoice());
  cursor = 0;
  lastEvent = 0;
  carry = 0;
  yardState = state;
  clearInputs();
  show('message', false);
  canvas.focus({ preventScroll: true });
  paintBench();
}
function paintBench() {
  const recording = yardState === 'recording',
    playing = yardState === 'playing',
    stopped = yardState === 'paused';
  setHudText('record', recording ? 'Stop recording' : 'Record drag');
  $('replay').disabled = !clip.length || recording;
  $('yardPause').disabled = !(playing || stopped);
  $('yardStep').disabled = !stopped || cursor >= clip.length + tail;
  $('yardHit').disabled = recording || !comparisons[weaponChoice()]?.firstHit;
  $('yardWeapon').disabled = $('yardArmor').disabled = recording;
  setHudText('yardPause', stopped ? 'Resume' : 'Pause');
  const time = (cursor * STEP).toFixed(2) + ' s';
  setHudText(
    'yardClock',
    recording
      ? 'REC · ' + time
      : playing
        ? 'Replay · ' + time
        : stopped
          ? 'Paused · ' + time
          : yardState === 'done'
            ? 'End · ' + time
            : ''
  );
}
function compareTake() {
  yardWorker?.terminate();
  comparisons = [];
  show('yardResults', !!clip.length);
  for (const td of $('yardResults').querySelectorAll('td')) td.textContent = '…';
  if (!clip.length) return;
  const worker = new Worker(new URL('./yard-worker.js', import.meta.url), { type: 'module' });
  yardWorker = worker;
  worker.onmessage = ({ data: r }) => {
    if (worker !== yardWorker) return;
    if (r.ready) {
      worker.postMessage({ clip, armor: armorChoice() });
      return;
    }
    comparisons[r.weapon] = r;
    const cells = $('yardResults').tBodies[0].rows[r.weapon].cells;
    [r.start, r.reverse, r.settle].forEach((value, i) => (cells[i + 1].textContent = value ?? '—'));
    paintBench();
    if (comparisons.filter(Boolean).length === 3) {
      worker.terminate();
      yardWorker = null;
    }
  };
  worker.onerror = () => {
    if (worker === yardWorker) {
      setHudText('yardContact', 'Timing comparison unavailable. Replay is ready.');
      worker.terminate();
      yardWorker = null;
    }
  };
}
function finishRecording() {
  cursor = clip.length;
  yardState = 'ready';
  compareTake();
  paintBench();
  setHudText(
    'yardContact',
    clip.length ? 'Take saved. Choose a weapon and replay.' : 'No movement recorded.'
  );
}
function yardEvent(serial) {
  const e = game.event;
  if (game.serial !== serial && e?.type === 'hit') {
    game.marker = e;
    setHudText('yardContact', e.part + ' → ' + e.piece + ' · ' + regionNames[e.region]);
  }
}
function replayFrame() {
  if (cursor >= clip.length + tail) return;
  const serial = game.serial;
  stepYard(game, frameInput(clip, cursor++));
  yardEvent(serial);
  if (cursor >= clip.length + tail) yardState = 'done';
}
function yardTick() {
  if (yardState === 'playing') replayFrame();
  else if (['live', 'recording', 'ready'].includes(yardState)) {
    const serial = game.serial;
    if (yardState === 'recording') {
      clip.push({ ...input });
      cursor++;
    }
    stepYard(game, input);
    yardEvent(serial);
    if (yardState === 'recording' && cursor >= maxFrames) finishRecording();
  }
  paintBench();
}
$('practice').onclick = () => {
  local = 0;
  host = false;
  begin(true);
  mode = 'yard';
  clip = [];
  comparisons = [];
  $('yardPanel').open = !matchMedia('(max-width:650px),(max-height:540px)').matches;
  show('yardPanel', true);
  show('yardResults', false);
  resetYard('live');
  updateHud();
  setHudText('yardContact', 'Record a drag and reverse it to compare weapons.');
};
$('record').onclick = () => {
  if (yardState === 'recording') {
    finishRecording();
    return;
  }
  yardWorker?.terminate();
  yardWorker = null;
  comparisons = [];
  clip = [];
  show('yardResults', false);
  resetYard('recording');
  setHudText('yardContact', 'Drag on the arena. Stop when finished (6 s max).');
};
$('replay').onclick = () => {
  resetYard('playing');
  setHudText('yardContact', 'Replaying the recorded take.');
};
$('yardPause').onclick = () => {
  yardState = yardState === 'paused' ? 'playing' : 'paused';
  paintBench();
};
$('yardStep').onclick = () => {
  replayFrame();
  paintBench();
};
$('yardHit').onclick = () => {
  const frame = comparisons[weaponChoice()]?.firstHit;
  if (!frame) return;
  resetYard('paused');
  while (cursor < frame) replayFrame();
  paintBench();
};
$('yardWeapon').onchange = () => {
  resetYard('live');
  setHudText(
    'yardContact',
    clip.length ? 'Replay the take with this weapon.' : 'Drag on the arena to steer.'
  );
};
$('yardArmor').onchange = () => {
  $('yardWeapon').onchange();
  compareTake();
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
  paused = mode === 'solo' || mode === 'yard';
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
function cut(secondary = false) {
  const yaw = secondary ? 'offYaw' : 'yaw';
  const cutSide = input[yaw] >= 0 ? -1 : 1;
  input[yaw] = cutSide * 1.52;
  input[secondary ? 'offPitch' : 'pitch'] = cutSide === 1 ? 0.08 : 0.37;
}
function steer(secondary, dx, dy) {
  const yaw = secondary ? 'offYaw' : 'yaw',
    pitch = secondary ? 'offPitch' : 'pitch';
  input[yaw] = clamp(input[yaw] + dx, -1.75, 1.75);
  input[pitch] = clamp(input[pitch] + dy, -0.95, 1.24);
}
function releaseJump() {
  if (jumpStart === null) return;
  input.jumpId = ++jumpSequence;
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
  'KeyQ',
  'KeyX',
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
    e.target.closest('button,a,input,select,summary')
  )
    return;
  e.preventDefault();
  keys.add(e.code);
  if (!e.repeat && e.code === 'KeyJ') cut();
  if (!e.repeat && e.code === 'KeyE') activateHand('rightId');
  if (!e.repeat && e.code === 'KeyQ') activateHand('leftId');
  if (!e.repeat && e.code === 'KeyX') activateHand('swapId');
  if (!e.repeat && e.code === 'KeyF') lungingUntil = performance.now() + 200;
  if (!e.repeat && e.code === 'Space') jumpStart = performance.now();
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Space') releaseJump();
});
canvas.oncontextmenu = (e) => e.preventDefault();
function activateHand(id) {
  input[id] = ++handSequence;
  input.boutId = game.boutId;
  sendGuestInput();
}
canvas.onpointerdown = (e) => {
  if (mode === 'menu' || resultShown) return;
  canvas.setPointerCapture(e.pointerId);
  canvas.focus();
  if (e.pointerType === 'mouse') mouseSecondary = Boolean(e.buttons & 2);
  drag = {
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    sx: e.clientX,
    sy: e.clientY,
    moved: false,
    secondary: mouseSecondary
  };
};
canvas.onpointermove = (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  if (e.pointerType === 'mouse') {
    mouseSecondary = Boolean(e.buttons & 2);
    drag.secondary ||= mouseSecondary;
  }
  const dx = e.pointerType === 'mouse' && e.movementX ? e.movementX : e.clientX - drag.x,
    dy = e.pointerType === 'mouse' && e.movementY ? e.movementY : e.clientY - drag.y;
  if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) drag.moved = true;
  const dual = game.p[local].left >= 0 && game.p[local].right >= 0;
  if (mouseSecondary && dual) steer(true, -dx * 0.024, -dy * 0.017);
  if (!(mouseSecondary && dual) || e.buttons & 1) steer(false, -dx * 0.024, -dy * 0.017);
  drag.x = e.clientX;
  drag.y = e.clientY;
};
canvas.onpointerup = (e) => {
  if (drag?.id === e.pointerId) {
    if (!drag.moved && !drag.secondary && e.button !== 2) cut();
    if (!drag.moved && drag.secondary && game.p[local].left >= 0 && game.p[local].right >= 0) {
      cut(true);
      offhandUntil = performance.now() + 165;
    }
    drag = null;
  }
  if (e.pointerType === 'mouse') mouseSecondary = false;
};
canvas.onpointercancel = () => {
  drag = null;
  mouseSecondary = false;
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
    if (['leftId', 'rightId', 'swapId'].includes(kind)) activateHand(kind);
    if (kind === 'offhand') {
      mouseSecondary = true;
      offhandUntil = performance.now() + 165;
      cut(true);
    }
    if (kind === 'thrust') lungingUntil = performance.now() + 200;
  };
  button.onlostpointercapture = () => {
    if (kind === 'guard') touchGuard = false;
    if (kind === 'offhand') mouseSecondary = false;
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
  const dual = game.p[local].right >= 0 && game.p[local].left >= 0;
  steer(
    mouseSecondary && dual,
    (held('ArrowLeft') - held('ArrowRight')) * dt * 5,
    (held('ArrowUp') - held('ArrowDown')) * dt * 4
  );
  input.guard = touchGuard || keys.has('KeyK') || (mouseSecondary && !dual);
  input.offhand = (mouseSecondary || performance.now() < offhandUntil) && dual;
  input.boutId = game.boutId;
  input.short = touchShort || keys.has('KeyR');
  input.run = touchRun || keys.has('ShiftLeft') || keys.has('ShiftRight');
  input.crouch = jumpStart !== null || keys.has('ControlLeft') || keys.has('ControlRight');
  input.thrust = performance.now() < lungingUntil;
}
function sendGuestInput() {
  if (mode !== 'online' || host || !room || !game.boutId || resultShown) return;
  readInput(0);
  room.send('input', input);
  lastInputSent = performance.now();
}
// Edge-triggered controls can leave before the next rendering or network tick.
// Mouse motion is coalesced to the fastest cadence of the current path.
for (const event of [
  'keydown',
  'keyup',
  'pointerdown',
  'pointerup',
  'pointermove',
  'pointercancel',
  'blur'
]) {
  window.addEventListener(event, (e) => {
    if (mode !== 'online' || host || !room || (e.code && !usedKeys.includes(e.code))) return;
    if (e.repeat || (event === 'pointermove' && !drag && !stick.some(Boolean))) return;
    if (event === 'pointermove' && performance.now() - lastInputSent < (room.fast ? 12 : 42)) return;
    if (['KeyQ', 'KeyE', 'KeyX'].includes(e.code) && event === 'keydown') return;
    sendGuestInput();
  });
}
const coarseControls = matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0;
function handHint(p, other) {
  const hints = new Map();
  for (const [side, slot, key] of [
    ['L', 'left', 'Q'],
    ['R', 'right', 'E']
  ]) {
    if (p[slot] >= 0) continue;
    const target = freeHandTarget(game, local, side);
    const action = p['grip' + side]
      ? 'release grip'
      : target?.part
        ? 'grab ' + gripLabel(target)
        : target
          ? 'take ' + weapons[target.w].name
          : '';
    if (!action) continue;
    const control = coarseControls ? slot : key;
    hints.set(action, hints.has(action) ? hints.get(action) + ' / ' + control : control);
  }
  return (
    [...hints].map(([action, keys]) => keys + ' to ' + action).join(' · ') ||
    (game.scouting ? 'Choose your gear, then enter the sun seal.' : '')
  );
}
function setHudText(id, value) {
  const element = $(id);
  if (element.textContent !== value) element.textContent = value;
}
function updateHud() {
  const network = $('network');
  network.hidden = mode !== 'online';
  if (!network.hidden)
    setHudText(
      'network',
      (room?.fast ? 'Peer link' : 'Relay') + (room?.rtt != null ? ' · ' + room.rtt + ' ms' : '')
    );
  const p = game.p[local],
    o = game.p[1 - local];
  setHudText('myName', local === 0 ? 'You · Moss' : 'You · Rust');
  setHudText(
    'foeName',
    mode === 'yard'
      ? 'Practice dummy'
      : mode === 'solo'
        ? ranks[Math.min(2, Math.floor((game.round - 1) / 2))]
        : local === 0
          ? 'Rust'
          : 'Moss'
  );
  $('myHp').value = p.hp;
  $('foeHp').value = o.hp;
  $('balance').value = p.balance;
  const worst = Math.max(...p.wounds);
  setHudText('condition', worst >= 20 ? 'Wounded ' + regionNames[p.wounds.indexOf(worst)] : '');
  setHudText(
    'round',
    mode === 'yard'
      ? 'Practice yard'
      : mode === 'solo'
        ? 'Abyss · ' + game.round + ' / 5'
        : 'Duel · ' + scores[local] + ' – ' + scores[1 - local]
  );
  setHudText(
    'weapon',
    'L · ' +
      (p.gripL ? 'Holding ' + gripLabel(p.grabL) : weapons[p.left]?.name || 'Free') +
      '   /   R · ' +
      (p.gripR ? 'Holding ' + gripLabel(p.grabR) : weapons[p.right]?.name || 'Free') +
      (p.guard ? ' · Guard' : p.short ? ' · Short grip' : '') +
      (p.recovery > 1.5
        ? ' · Knocked down'
        : p.recovery > 0
          ? ' · Getting up'
          : p.height > 0.01
            ? ' · Airborne'
            : p.running
              ? ' · Running'
              : p.bend > 0.55
                ? ' · Crouched'
                : '') +
      (p.exhausted ? ' · Winded' : '')
  );
  document.querySelector('[data-press="offhand"]').hidden = !(p.left >= 0 && p.right >= 0);
  setHudText('equipHint', handHint(p, o));
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
    begin(solo, complete ? 1 : game.round + 1, solo && !complete ? game.p[0] : null);
  };
}
// Interpolate remote transforms between host snapshots, keeping all hits on the host.
function displayState(now) {
  if (!latest || mode !== 'online' || host) return game;
  const u = clamp((now - arrival) / spacing, 0, 1);
  return {
    ...game,
    p: game.p.map((p, i) => {
      if (i === local && prediction.fighter) return prediction.fighter;
      if (!previous) return p;
      const old = previous.p[i],
        res = { ...p };
      for (const k of [
        'x',
        'z',
        'yaw',
        'pitch',
        'torso',
        'offYaw',
        'offPitch',
        'offTorso',
        'walk',
        'down',
        'recoil',
        'height',
        'bend',
        'vx',
        'vz'
      ])
        res[k] = old[k] + (p[k] - old[k]) * u;
      if (old.recovery >= p.recovery) res.recovery = old.recovery + (p.recovery - old.recovery) * u;
      const d = p.face - old.face;
      res.face = old.face + Math.atan2(Math.sin(d), Math.cos(d)) * u;
      return res;
    })
  };
}
// Authority runs on its own fixed-step clock. A slow draw need not delay the
// next simulation step or hold a confirmed hit until another screen refresh.
function runHost(now) {
  if (!host || mode !== 'online' || !room || now <= hostTime) return;
  const elapsed = Math.min(0.1, (now - hostTime) / 1000);
  hostTime = now;
  readInput(elapsed);
  carry += elapsed;
  while (carry >= STEP) {
    tick(game, [input, remote]);
    inputAck = Math.max(inputAck, remote.clientTick || 0);
    carry -= STEP;
  }
  if (!scoreCounted && game.winner >= 0) {
    scores[game.winner]++;
    scoreCounted = true;
  }
  if (now >= snapshotDue || game.serial !== sentEvent) {
    const period = 1000 / (room.fast ? 60 : 24);
    snapshotDue = now >= snapshotDue ? Math.max(now + 1, snapshotDue + period) : now + period;
    sentEvent = game.serial;
    room.send('state', { ...game, score: scores, inputAck });
  }
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
    if (mode === 'online' && host) runHost(performance.now());
    else readInput(dt);
    if (mode === 'yard') {
      carry += dt;
      while (carry >= STEP) {
        carry -= STEP;
        yardTick();
      }
    }
    if (mode === 'solo') {
      carry += dt;
      while (carry >= STEP) {
        tick(game, [input, bot(game)]);
        carry -= STEP;
      }
      if (!scoreCounted && game.winner >= 0) {
        scores[game.winner]++;
        scoreCounted = true;
      }
    }
    if (mode === 'online' && room && !host) {
      const interval = room.fast ? 1 / 60 : 1 / 24;
      if (now - arrival < 250) input.clientTick = prediction.step(input, dt);
      if (now - lastInputSent >= interval * 1000 - 1) sendGuestInput();
    }
    if (game.event && game.event.n !== lastEvent) {
      lastEvent = game.event.n;
      view.burst(game.event);
      tone(game.event.type, game.event.surface);
      if (game.event.type === 'clash') message('Steel on steel', 0.55);
      if (game.event.type === 'summon') message($('foeName').textContent + ' enters the pit', 1.85);
      if (mode !== 'yard' && game.event.type === 'hit' && Number.isInteger(game.event.region)) {
        const region = regionNames[game.event.region];
        const contact =
          game.event.surface === 'plate' ? 'armor struck' : game.event.kind === 'cut' ? 'cut' : 'impact';
        message(
          (game.event.target === local ? 'Your ' : 'Rival’s ') +
            region +
            ' · ' +
            (game.event.part ? game.event.part + ' on ' + game.event.piece : contact),
          0.85
        );
      }
    }
    if (game.winner >= 0 && game.p[1 - game.winner].down > 0.85 && !resultShown) finish();
    if (hintUntil < now) show('message', false);
    updateHud();
  }
  view.draw(displayState(now), mode === 'menu' ? 'menu' : 'play', local, dt, now / 1000);
  requestAnimationFrame(frame);
}
try {
  if (validCode(validInvite)) warmLobby();
  view = await createView(canvas);
  $('practice').disabled = $('solo').disabled = $('online').disabled = false;
  if (validCode(validInvite)) {
    $('code').value = validInvite;
    menu('Your invite is ready. Select Join to enter.', true);
  } else menu();
  requestAnimationFrame(frame);
} catch (e) {
  console.error(e);
  $('notice').textContent = 'The 3D arena could not load. Enable WebGL in your browser and reload.';
}
