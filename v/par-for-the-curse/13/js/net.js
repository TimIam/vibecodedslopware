// Live rooms over Supabase Realtime (the same public project the Craps table uses). Slow state
// (name, look, hole, strokes) rides on presence; golfer pose and ball position stream on broadcast
// about 12 times a second; one-off events (falls, sunk putts, shouts, ball bonks) are broadcasts too.
// Nothing is stored anywhere.
const SUPABASE_URL = 'https://dgpfngeqozrbwmjgnzuw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_IEQdSVT6rLr4hyEmQYuHmQ_lTPZruXC';

export async function joinRoom(room, presence) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { params: { eventsPerSecond: 40 } } });
  const me = 'g' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
  const ch = client.channel('pftc:' + room, { config: { presence: { key: me }, broadcast: { self: false } } });
  const peers = new Map();
  const cbs = { join: [], leave: [], event: [], connection: [] };
  const emit = (k, ...a) => { for (const f of cbs[k]) { try { f(...a); } catch (e) { console.error(e); } } };
  let mine = { ...presence }, connected = false, slowTimer = 0, lastSlow = 0;
  const peer = id => { let p = peers.get(id); if (!p) { p = { id, presence: {}, state: null, prev: null, t: 0, prevT: 0 }; peers.set(id, p); } return p; };

  ch.on('presence', { event: 'sync' }, () => {
    const state = ch.presenceState(), seen = new Set();
    for (const [key, metas] of Object.entries(state)) {
      if (key === me) continue;
      const m = metas[metas.length - 1]; if (!m) continue;
      seen.add(key);
      const p = peer(key); const { presence_ref, ...rest } = m; p.presence = rest; p.seen = performance.now();
      if (!p.joined) { p.joined = true; emit('join', p); }
    }
    for (const id of [...peers.keys()]) { const p = peers.get(id); if (!seen.has(id) && p.joined && performance.now() - p.t > 4000) { peers.delete(id); emit('leave', p); } }
  });
  ch.on('broadcast', { event: 'st' }, ({ payload }) => {
    if (!payload || typeof payload.p !== 'string' || payload.p === me || !payload.s) return;
    const p = peer(payload.p);
    p.prev = p.state; p.prevT = p.t; p.state = payload.s; p.t = performance.now();
  });
  ch.on('broadcast', { event: 'ev' }, ({ payload }) => {
    if (!payload || typeof payload.p !== 'string' || payload.p === me) return;
    emit('event', peer(payload.p), payload);
  });
  ch.subscribe(status => {
    const was = connected; connected = status === 'SUBSCRIBED';
    if (connected) ch.track(mine).catch(() => {});
    if (was !== connected) emit('connection', connected);
  });
  window.addEventListener('pagehide', () => { try { ch.untrack(); client.removeChannel(ch); } catch (e) {} });
  // Drop peers that stop streaming (closed tab without a clean leave).
  setInterval(() => {
    const now = performance.now();
    for (const [id, p] of peers) if (p.t && now - p.t > 15000) { peers.delete(id); emit('leave', p); }
  }, 3000);

  return {
    me, peers,
    connected: () => connected,
    on(k, f) { cbs[k].push(f); },
    state(s) { if (connected) ch.send({ type: 'broadcast', event: 'st', payload: { p: me, s } }).catch(() => {}); },
    event(e) { if (connected) ch.send({ type: 'broadcast', event: 'ev', payload: { ...e, p: me } }).catch(() => {}); },
    presence(patch) {
      Object.assign(mine, patch);
      if (slowTimer) return;
      slowTimer = setTimeout(() => { slowTimer = 0; lastSlow = performance.now(); if (connected) ch.track(mine).catch(() => {}); }, Math.max(0, 600 - (performance.now() - lastSlow)));
    },
  };
}
