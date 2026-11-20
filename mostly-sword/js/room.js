import { createClient } from '../vendor/realtime.js';
import { packState, unpackState } from './packets.js';
import { openPeerLink } from './peer.js';
import { clamp, neutral } from './arena.js';

// This is the same public Realtime project used by the site's other multiplayer games.
const url = 'https://dgpfngeqozrbwmjgnzuw.supabase.co';
const key = 'sb_publishable_IEQdSVT6rLr4hyEmQYuHmQ_lTPZruXC';
const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const makeCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => alphabet[b % alphabet.length]).join('');
export const validCode = (s) => /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(s);
function controls(data) {
  const result = neutral();
  for (const [k, limit] of [
    ['fwd', 1],
    ['side', 1],
    ['yaw', 1.75],
    ['offYaw', 1.75],
    ['offPitch', 1.25],
    ['pitch', 1.25]
  ]) {
    result[k] = Number.isFinite(data?.[k]) ? clamp(data[k], -limit, limit) : 0;
  }
  for (const k of ['guard', 'short', 'offhand', 'thrust', 'run', 'crouch']) result[k] = data?.[k] === true;
  for (const k of ['leftId', 'rightId', 'swapId', 'boutId', 'clientTick'])
    result[k] = Number.isSafeInteger(data?.[k]) && data[k] > 0 ? data[k] : 0;
  result.jumpId = Number.isSafeInteger(data?.jumpId) && data.jumpId > 0 ? data.jumpId : 0;
  result.jumpPower = Number.isFinite(data?.jumpPower) ? clamp(data.jumpPower, 0, 1) : 0;
  return result;
}
function isState(s) {
  const bounded = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
  const item = (w) => Number.isInteger(w) && w >= 0 && w < 3;
  return (
    s?.solo === false &&
    Number.isSafeInteger(s.inputAck) &&
    s.inputAck >= 0 &&
    s.scouting === false &&
    Number.isSafeInteger(s.boutId) &&
    s.boutId > 0 &&
    [-1, 0, 1].includes(s.winner) &&
    Number.isInteger(s.round) &&
    bounded(s.round, 1, 3) &&
    Array.isArray(s.score) &&
    s.score.length === 2 &&
    s.score.every((v) => Number.isInteger(v) && bounded(v, 0, 2)) &&
    Array.isArray(s.p) &&
    s.p.length === 2 &&
    s.p.every(
      (p) =>
        p &&
        item(p.weapon) &&
        [p.right, p.left].every((w) => w === -1 || item(w)) &&
        [p.gripL, p.gripR, p.offhand].every((flag) => typeof flag === 'boolean') &&
        Number.isInteger(p.armor) &&
        bounded(p.armor, 0, 2) &&
        Array.isArray(p.wounds) &&
        p.wounds.length === 6 &&
        p.wounds.every((w) => bounded(w, 0, 100)) &&
        [
          'x',
          'z',
          'face',
          'vx',
          'vz',
          'yaw',
          'pitch',
          'walk',
          'stun',
          'recoil',
          'down',
          'extension',
          'torso',
          'offYaw',
          'offPitch',
          'offTorso',
          'wy',
          'wp',
          'vy',
          'torsoSpeed',
          'offWY',
          'offWP',
          'offTorsoSpeed',
          'bind',
          'landing',
          'thrustTime',
          'fatigue',
          'cooldown',
          'rollSide',
          'recovery',
          'height',
          'bend'
        ].every((k) => Number.isFinite(p[k])) &&
        bounded(p.hp, 0, 100) &&
        bounded(p.balance, 0, 100)
    ) &&
    Array.isArray(s.loot) &&
    s.loot.length <= 4 &&
    s.loot.every((p) => p && (item(p.w) || p.w === -1) && bounded(p.x, -8, 8) && bounded(p.z, -8, 8)) &&
    (s.event === null ||
      (Number.isSafeInteger(s.event?.n) &&
        ['fall', 'hit', 'equip', 'clash'].includes(s.event.type) &&
        (!['fall', 'hit'].includes(s.event.type) ||
          (Number.isInteger(s.event.region) &&
            bounded(s.event.region, 0, 5) &&
            ['cut', 'impact'].includes(s.event.kind) &&
            ['plate', 'cloth'].includes(s.event.surface))) &&
        Array.isArray(s.event.pos) &&
        s.event.pos.length === 3 &&
        s.event.pos.every(Number.isFinite)))
  );
}
// Start the existing room socket while the player reads or enters the code.
function roomClient() {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 35 } }
  });
}
let warmClient;
export function warmLobby() {
  if (warmClient) return;
  warmClient = roomClient();
  warmClient.realtime.connect();
}
export function leaveLobby() {
  warmClient?.realtime.disconnect();
  warmClient = null;
}
export function openRoom(code, host, callbacks) {
  const client = warmClient || roomClient();
  warmClient = null;
  const channel = client.channel('mostly-sword:v5:' + code, { config: { broadcast: { self: false } } });
  const id = crypto.randomUUID();
  let peer = '',
    connected = false,
    closed = false,
    lastSeen = 0,
    since = performance.now();
  let sequence = 0,
    lastFrame = -1,
    link,
    pingAt = 0,
    rtt = null;
  function relay(packet) {
    if (connected && !closed)
      channel.send({ type: 'broadcast', event: 'duel', payload: packet }).catch(() => {});
  }
  function send(type, value, to = peer) {
    if (closed) return;
    const packet = { id, to, type, value: type === 'state' ? packState(value) : value, seq: ++sequence };
    if (
      peer &&
      ['input', 'state', 'ping', 'pong', 'bye'].includes(type) &&
      link?.write(packet) &&
      type !== 'bye'
    )
      return;
    relay(packet);
  }
  function close() {
    if (closed) return;
    send('bye');
    closed = true;
    clearInterval(timer);
    link?.close();
    client
      .removeChannel(channel)
      .finally(() => client.realtime.disconnect())
      .catch(() => {});
  }
  function fail(reason) {
    if (!closed) {
      close();
      callbacks.error(reason);
    }
  }
  function startLink() {
    if (closed || link) return;
    try {
      link = openPeerLink(!host, (data) => send('rtc', data), receive);
    } catch {
      link = null;
    }
  }
  function receive(m) {
    if (closed || !m || typeof m.id !== 'string' || m.id === id || (m.to && m.to !== id)) return;
    if (host && m.type === 'knock') {
      if (peer && peer !== m.id) {
        send('full', null, m.id);
        return;
      }
      const fresh = !peer;
      peer = m.id;
      lastSeen = performance.now();
      send('seat', null);
      if (fresh) {
        callbacks.start();
      }
      return;
    }
    if (!host && !peer && m.type === 'full') {
      fail('That duel already has two fighters.');
      return;
    }
    if (!host && !peer && m.type === 'seat') {
      peer = m.id;
      lastSeen = performance.now();
      callbacks.start();
      // Some browsers start a networking process the first time WebRTC is
      // used. Let the relay deliver the first playable frame before doing so.
      requestAnimationFrame(() => requestAnimationFrame(startLink));
      setTimeout(startLink, 1500);
      return;
    }
    if (!peer || m.id !== peer || m.to !== id) return;
    lastSeen = performance.now();
    if (m.type === 'rtc') {
      startLink();
      link?.signal(m.value);
      return;
    }
    if (m.type === 'bye') {
      fail('The other fighter left the room.');
      return;
    }
    if (m.type === 'ping') {
      send('pong', m.value);
      return;
    }
    if (m.type === 'pong' && m.value === pingAt) {
      rtt = Math.round(lastSeen - pingAt);
      return;
    }
    // Control traffic uses a separate ordering domain. A delayed relay ping
    // cannot invalidate a newer direct-path gameplay frame, or vice versa.
    if (!Number.isSafeInteger(m.seq) || m.seq <= lastFrame) return;
    if (host && m.type === 'input') {
      lastFrame = m.seq;
      callbacks.input(controls(m.value));
    }
    if (!host && m.type === 'state') {
      const state = unpackState(m.value);
      if (isState(state)) {
        lastFrame = m.seq;
        callbacks.state(state);
      }
    }
  }
  channel.on('broadcast', { event: 'duel' }, ({ payload }) => receive(payload));
  channel.subscribe((status) => {
    if (closed) return;
    if (status === 'SUBSCRIBED') {
      connected = true;
      since = performance.now();
      if (!peer) {
        callbacks.ready();
        if (!host) send('knock', null, '');
      }
    } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
      connected = false;
      if (!link?.open) fail('Room connection lost. Open a new duel to reconnect.');
    }
  });
  const timer = setInterval(() => {
    const now = performance.now();
    if (peer) {
      link?.check(now);
      if (now - lastSeen > 15000) fail('The other fighter disconnected.');
      else if (now - pingAt >= 1000) {
        pingAt = now;
        send('ping', now);
      }
    } else if (!connected && now - since > 16000) fail('Could not reach the room server.');
    else if (!host && connected) {
      if (now - since > 9000) fail('No host answered that code. Check the code and try again.');
      else send('knock', null, '');
    }
  }, 350);
  return {
    close,
    send,
    get fast() {
      return Boolean(link?.open);
    },
    get rtt() {
      return rtt;
    }
  };
}
