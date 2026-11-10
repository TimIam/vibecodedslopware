// Live rooms over Supabase Realtime (the same public project the Craps table uses). Golfer pose and
// ball position stream on broadcast about 12 times a second; one-off events (falls, sunk putts, shouts,
// ball bonks) are broadcasts too. Nothing is stored anywhere.
//
// Who is here. Supabase presence says who is in the room and carries what rarely changes (name, look).
// It is tightly rationed: about five presence calls per client in half a minute, and going over closes
// the channel. So the score (hole, strokes, falls) does not ride on presence; it goes out as a small
// broadcast when it changes and every few seconds for newcomers, and presence is only touched on
// joining and when the name or look changes.
//
// Rooms. No code is the public mountain. An invite code is a private room, and a private room can be
// locked with a 4-digit PIN. There is no server of ours to check a PIN, so the lock works like this:
// a locked room plays on a channel whose name is a hash of its code and PIN together, and everyone in
// the room also sits in a small lobby channel named by the code alone, saying only "locked" or "open".
// Without the right PIN you can see that the room is locked and nothing else: you never reach the
// channel the game is on. That keeps strangers and wrong guesses out. It is not bank-grade: someone
// who has the code and is willing to try all 10,000 PINs one connection at a time would get in.
const SUPABASE_URL = 'https://dgpfngeqozrbwmjgnzuw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_IEQdSVT6rLr4hyEmQYuHmQ_lTPZruXC';
const PUBLIC = 'mountain';
// Supabase only tells a newcomer who is already there if presence is switched on by name when joining.
const PRESENCE = key => ({ key, enabled: true });
const IDENTITY = ['nm', 'lk'];      // what rides on presence; everything else is the score

// Invite codes: five characters, none that read alike (no I, L, O, 0 or 1).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newCode = () => [...crypto.getRandomValues(new Uint8Array(5))].map(n => ALPHABET[n % ALPHABET.length]).join('');
// Codes are matched in lower case; older, longer room names from invite links still work.
export const cleanCode = s => String(s || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
export const cleanPin = s => { const p = String(s || '').replace(/\D/g, ''); return p.length === 4 ? p : ''; };

let clientP = null;
const getClient = () => clientP || (clientP = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm')
  .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { params: { eventsPerSecond: 40 } } }))
  .catch(e => { clientP = null; throw e; }));

async function channelName(room, pin) {
  if (!pin) return 'pftc:' + room;
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`pftc|${room}|${pin}`));
  return 'pftc:' + room + ':' + [...new Uint8Array(d)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const roomError = code => Object.assign(new Error(code), { code });
const othersIn = (ch, me) => Object.entries(ch.presenceState()).filter(([k]) => k !== me).map(([, metas]) => metas[metas.length - 1] || {});
const pickKeys = (o, keys, yes = true) => Object.fromEntries(Object.entries(o).filter(([k]) => keys.includes(k) === yes));

// joinRoom('mountain' | code, pin, presence). Rejects with .code 'pin-needed' or 'pin-wrong' when a
// locked room keeps you out; any other failure means multiplayer is unavailable.
export async function joinRoom(room, pin, presence) {
  const client = await getClient();
  const me = 'g' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
  room = cleanCode(room) || PUBLIC; pin = room === PUBLIC ? '' : cleanPin(pin);
  let leaving = false, inRoom = false, locked = false;
  const drop = async c => { if (!c) return; c.dead = true; try { await c.untrack(); } catch (e) {} try { await client.removeChannel(c); } catch (e) {} };

  // The presence ration: three calls in hand, one more every fifteen seconds.
  let tokens = 3, lastRefill = performance.now();
  const spend = () => {
    const now = performance.now(), n = Math.floor((now - lastRefill) / 15000);
    if (n > 0) { tokens = Math.min(3, tokens + n); lastRefill += n * 15000; }
    if (tokens < 1) return false;
    tokens--; return true;
  };

  // The lobby: is anyone here, and is the room locked?
  let lobby = null, lockedThere = false;
  if (room !== PUBLIC) {
    lobby = client.channel('pftc-lobby:' + room, { config: { presence: PRESENCE(me) } });
    let first = null; const firstSync = new Promise(r => { first = r; });
    lobby.on('presence', { event: 'sync' }, () => first());
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('room lobby timed out')), 8000);
      lobby.subscribe(s => {
        if (s === 'SUBSCRIBED') { clearTimeout(t); res(); if (inRoom && spend()) lobby.track({ lock: locked ? 1 : 0 }).catch(() => {}); }
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { clearTimeout(t); rej(new Error('room lobby ' + s)); }
      });
    });
    await Promise.race([firstSync, sleep(2500)]);
    const there = othersIn(lobby, me);
    lockedThere = there.some(m => m.lock === 1);
    if (lockedThere && !pin) { await drop(lobby); throw roomError('pin-needed'); }
    // An open room that already has people in it stays open: a PIN typed by a late arrival is dropped.
    locked = lockedThere || (!!pin && !there.some(m => m.lock === 0));
    if (!locked) pin = '';
  }

  const name = await channelName(room, pin);
  const peers = new Map();
  const cbs = { join: [], leave: [], event: [], connection: [] };
  const emit = (k, ...a) => { for (const f of cbs[k]) { try { f(...a); } catch (e) { console.error(e); } } };
  let mine = { ...presence }, connected = false, synced = false, ch = null;
  let sentId = '', sentScore = '', lastScore = 0, wantScore = true;
  const peer = id => { let p = peers.get(id); if (!p) { p = { id, presence: {}, live: {}, state: null, prev: null, t: 0, prevT: 0 }; peers.set(id, p); } return p; };
  const identity = () => pickKeys(mine, IDENTITY);
  const trackIdentity = force => {
    const id = JSON.stringify(identity());
    if (!connected || !inRoom || (!force && id === sentId) || !spend()) return;
    sentId = id; ch.track(identity()).catch(() => {});
  };

  function openChannel() {
    const c = ch = client.channel(name, { config: { presence: PRESENCE(me), broadcast: { self: false } } });
    c.on('presence', { event: 'sync' }, () => {
      synced = true;
      const state = c.presenceState(), seen = new Set();
      for (const [key, metas] of Object.entries(state)) {
        if (key === me) continue;
        const m = metas[metas.length - 1]; if (!m) continue;
        seen.add(key);
        const p = peer(key); const { presence_ref, ...rest } = m; p.presence = Object.assign({}, rest, p.live); p.seen = performance.now();
        if (!p.joined) { p.joined = true; wantScore = true; emit('join', p); }
      }
      for (const id of [...peers.keys()]) { const p = peers.get(id); if (!seen.has(id) && p.joined && performance.now() - p.t > 4000) { peers.delete(id); emit('leave', p); } }
    });
    c.on('broadcast', { event: 'st' }, ({ payload }) => {
      if (!payload || typeof payload.p !== 'string' || payload.p === me || !payload.s) return;
      const p = peer(payload.p);
      p.prev = p.state; p.prevT = p.t; p.state = payload.s; p.t = performance.now();
    });
    c.on('broadcast', { event: 'sc' }, ({ payload }) => {
      if (!payload || typeof payload.p !== 'string' || payload.p === me || !payload.q || typeof payload.q !== 'object') return;
      const p = peer(payload.p); p.live = payload.q; Object.assign(p.presence, payload.q);
    });
    c.on('broadcast', { event: 'ev' }, ({ payload }) => {
      if (!payload || typeof payload.p !== 'string' || payload.p === me) return;
      emit('event', peer(payload.p), payload);
    });
    c.subscribe(status => {
      if (c !== ch || c.dead) return;
      const was = connected; connected = status === 'SUBSCRIBED';
      if (connected) { wantScore = true; trackIdentity(true); }
      if (was !== connected) emit('connection', connected);
      // The server closed the channel on us (it does that for going over a ration): open a fresh one.
      if (status === 'CLOSED' && !leaving && inRoom) setTimeout(async () => { if (c !== ch || leaving) return; await drop(c); openChannel(); }, 5000);
    });
  }
  openChannel();

  if (lockedThere) {
    // Someone is in the locked room. With the right PIN this is their channel and they are on it.
    const until = performance.now() + 6000; let quiet = 0;
    while (performance.now() < until && !othersIn(ch, me).length) { await sleep(150); if (synced && (quiet += 150) > 2500) break; }
    if (!othersIn(ch, me).length) { leaving = true; await drop(ch); await drop(lobby); throw roomError('pin-wrong'); }
  }
  inRoom = true;
  trackIdentity(true);
  if (lobby && spend()) lobby.track({ lock: locked ? 1 : 0 }).catch(() => {});

  window.addEventListener('pagehide', () => { leaving = true; try { ch.untrack(); client.removeChannel(ch); if (lobby) { lobby.untrack(); client.removeChannel(lobby); } } catch (e) {} });
  setInterval(() => {
    const now = performance.now();
    // Drop peers that stop streaming (closed tab without a clean leave).
    for (const [id, p] of peers) if (p.t && now - p.t > 15000) { peers.delete(id); emit('leave', p); }
    if (!connected || !inRoom) return;
    // The score: when it changes (at most every two seconds), and every eight seconds for newcomers.
    const q = pickKeys(mine, IDENTITY, false), js = JSON.stringify(q);
    if ((js !== sentScore || wantScore || now - lastScore > 8000) && now - lastScore > 1900) {
      sentScore = js; lastScore = now; wantScore = false;
      ch.send({ type: 'broadcast', event: 'sc', payload: { p: me, q } }).catch(() => {});
    }
    trackIdentity(false);
  }, 1000);

  return {
    me, peers, room, pin, locked,
    connected: () => connected,
    on(k, f) { cbs[k].push(f); },
    state(s) { if (connected) ch.send({ type: 'broadcast', event: 'st', payload: { p: me, s } }).catch(() => {}); },
    event(e) { if (connected) ch.send({ type: 'broadcast', event: 'ev', payload: { ...e, p: me } }).catch(() => {}); },
    // Name and look reach presence (rationed); the rest is the score and goes out by broadcast.
    presence(patch) { Object.assign(mine, patch); },
  };
}
