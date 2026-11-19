import { createClient } from '../vendor/realtime.js';
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
    ['pitch', 1.25]
  ]) {
    result[k] = Number.isFinite(data?.[k]) ? clamp(data[k], -limit, limit) : 0;
  }
  for (const k of ['guard', 'short', 'grab', 'thrust']) result[k] = data?.[k] === true;
  return result;
}
function isState(s) {
  const bounded = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
  const item = (w) => Number.isInteger(w) && w >= 0 && w < 3;
  return (
    s?.solo === false &&
    s.scouting === false &&
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
          'extension'
        ].every((k) => Number.isFinite(p[k])) &&
        bounded(p.hp, 0, 100) &&
        bounded(p.balance, 0, 100)
    ) &&
    Array.isArray(s.loot) &&
    s.loot.length === 2 &&
    s.loot.every((p) => p && item(p.w) && bounded(p.x, -8, 8) && bounded(p.z, -8, 8)) &&
    (s.event === null ||
      (Number.isSafeInteger(s.event?.n) &&
        ['fall', 'hit', 'equip', 'clash'].includes(s.event.type) &&
        Array.isArray(s.event.pos) &&
        s.event.pos.length === 3 &&
        s.event.pos.every(Number.isFinite)))
  );
}
export function openRoom(code, host, callbacks) {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 35 } }
  });
  const channel = client.channel('mostly-sword:v1:' + code, { config: { broadcast: { self: false } } });
  const id = crypto.randomUUID();
  let peer = '',
    connected = false,
    closed = false,
    lastSeen = 0,
    since = performance.now(),
    sequence = 0,
    lastSeq = -1;
  function send(type, value, to = peer) {
    if (connected && !closed)
      channel
        .send({ type: 'broadcast', event: 'duel', payload: { id, to, type, value, seq: ++sequence } })
        .catch(() => {});
  }
  function close() {
    if (closed) return;
    send('bye');
    closed = true;
    clearInterval(timer);
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
  channel.on('broadcast', { event: 'duel' }, ({ payload: m }) => {
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
      if (fresh) callbacks.start();
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
      return;
    }
    if (!peer || m.id !== peer || m.to !== id || !(m.seq > lastSeq)) return;
    lastSeq = m.seq;
    lastSeen = performance.now();
    if (m.type === 'bye') {
      fail('The other fighter left the room.');
      return;
    }
    if (host && m.type === 'input') callbacks.input(controls(m.value));
    if (!host && m.type === 'state' && isState(m.value)) callbacks.state(m.value);
  });
  channel.subscribe((status) => {
    if (closed) return;
    if (status === 'SUBSCRIBED') {
      connected = true;
      since = performance.now();
      callbacks.ready();
      if (!host) send('knock', null, '');
    } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status))
      fail('Room connection lost. Open a new duel to reconnect.');
  });
  const timer = setInterval(() => {
    const now = performance.now();
    if (peer) {
      if (now - lastSeen > 15000) fail('The other fighter disconnected.');
      else send('ping');
    } else if (!connected && now - since > 16000) fail('Could not reach the room server.');
    else if (!host && connected) {
      if (now - since > 9000) fail('No host answered that code. Check the code and try again.');
      else send('knock', null, '');
    }
  }, 750);
  return { close, send };
}
