// Rooms. Friends find each other through Supabase Realtime (the same public project the Craps table
// and Par for the Curse use): presence says who is in the room, broadcast carries the lobby and the
// handshake. The game itself then runs over direct WebRTC data channels from each guest to the host,
// which is much quicker than going through a server. If a direct line cannot be opened (strict
// firewalls on both ends and no relay), the same messages fall back to Supabase broadcast, slower but
// playable. Nothing is stored anywhere.
//
// The host is whoever has been in the room longest. Only the host runs the match.
const SUPABASE_URL = 'https://dgpfngeqozrbwmjgnzuw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_IEQdSVT6rLr4hyEmQYuHmQ_lTPZruXC';
const LIBS = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm', 'https://esm.sh/@supabase/supabase-js@2.45.4?bundle'];
const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];

// Invite codes: five characters, none that read alike (no I, L, O, 0 or 1).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newCode = () => [...crypto.getRandomValues(new Uint8Array(5))].map(n => ALPHABET[n % ALPHABET.length]).join('');
export const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
export const cleanName = s => String(s || '').toUpperCase().replace(/[^A-Z0-9 .!?'-]/g, '').trim().slice(0, 10);

let clientP = null;
async function loadLib() {
  let err = null;
  for (const u of LIBS) { try { return await import(u); } catch (e) { err = e; console.warn('could not load', u, e); } }
  throw Object.assign(new Error('Could not download the multiplayer library. An ad blocker or firewall may be in the way.'), { cause: err });
}
const getClient = () => clientP || (clientP = loadLib()
  .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { params: { eventsPerSecond: 40 }, timeout: 20000 } }))
  .catch(e => { clientP = null; throw e; }));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// The relay for players who cannot reach each other directly. Without it (local dev, or the keys
// unset) direct connections still work for most home networks.
let iceP = null;
const getIce = () => iceP || (iceP = Promise.race([
  fetch('/api/turn').then(r => (r.ok ? r.json() : null)).then(j => STUN.concat(j && Array.isArray(j.iceServers) ? j.iceServers : [])).catch(() => STUN),
  sleep(2500).then(() => STUN),
]));

export async function openRoom(code, name) {
  const client = await getClient();
  const me = 'p' + Math.random().toString(36).slice(2, 10);
  const ch = client.channel('pafo:' + code.toLowerCase(), { config: { presence: { key: me, enabled: true }, broadcast: { self: false } } });
  const cbs = {};
  const on = (k, f) => { (cbs[k] || (cbs[k] = [])).push(f); };
  const emit = (k, ...a) => { for (const f of cbs[k] || []) { try { f(...a); } catch (e) { console.error(e); } } };
  const members = new Map(), links = new Map(), relayAt = {};
  let hostId = null, left = false, tracked = false;

  const send = (k, d, to) => { if (!left) ch.send({ type: 'broadcast', event: 'm', payload: { k, f: me, to, d } }).catch(() => {}); };
  const relay = (key, gap, k, d, to) => { const now = performance.now(); if (now - (relayAt[key] || 0) < gap) return; relayAt[key] = now; send(k, d, to); };
  const direct = (id, str) => { const l = links.get(id); if (!l || !l.open || l.dc.bufferedAmount > 60000) return false; try { l.dc.send(str); return true; } catch (e) { return false; } };
  // Quick, loss-tolerant messages: the direct line when there is one, otherwise the relay at a gentler rate.
  const fast = (k, d, to) => { if (!direct(to, JSON.stringify({ k, d }))) relay(k + to, 66, k, d, to); };
  const fastAll = (k, d) => {
    const str = JSON.stringify({ k, d });
    let need = false;
    for (const id of members.keys()) if (id !== me && !direct(id, str)) need = true;
    if (need) relay(k, 85, k, d);
  };

  function handle(m) {
    if (!m || typeof m.k !== 'string' || (m.to && m.to !== me)) return;
    if (m.k === 'rtc') return onRtc(m.f, m.d);
    emit('msg', m.k, m.d, m.f);
  }
  ch.on('broadcast', { event: 'm' }, ({ payload }) => handle(payload));

  // ---- direct lines: every guest calls the host
  function closeLink(id) {
    const l = links.get(id);
    if (!l) return;
    links.delete(id); l.open = false; clearTimeout(l.timer);
    try { l.dc && l.dc.close(); } catch (e) {}
    try { l.pc.close(); } catch (e) {}
    emit('link', id, false);
  }
  async function makeLink(id, caller) {
    if (typeof RTCPeerConnection !== 'function') return null;      // no WebRTC here: the relay carries everything
    const l = { id, pc: null, dc: null, open: false, queue: [], tries: 0, timer: 0 };
    links.set(id, l);
    const ice = await getIce();
    if (left || links.get(id) !== l) return null;
    const pc = l.pc = new RTCPeerConnection({ iceServers: ice });
    pc.onicecandidate = e => { if (e.candidate) send('rtc', { ice: e.candidate.toJSON() }, id); };
    const wire = dc => {
      l.dc = dc;
      dc.onopen = () => { l.open = true; clearTimeout(l.timer); emit('link', id, true); };
      dc.onclose = () => { if (l.open) { l.open = false; emit('link', id, false); } };
      dc.onmessage = e => { try { const m = JSON.parse(e.data); m.f = id; m.to = me; handle(m); } catch (err) {} };
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState !== 'failed' || links.get(id) !== l) return;
      closeLink(id);
      if (caller && !left && hostId === id) setTimeout(() => { if (!left && hostId === id && !links.has(id) && members.has(id)) makeLink(id, true); }, 1500);
    };
    if (caller) {
      wire(pc.createDataChannel('g', { ordered: false, maxRetransmits: 0 }));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send('rtc', { sdp: pc.localDescription.toJSON() }, id);
      // no answer or no route: try once more from scratch, then leave it to the relay
      l.timer = setTimeout(() => { if (!l.open && links.get(id) === l) { closeLink(id); if (!left && hostId === id && members.has(id) && !makeLink.retried) { makeLink.retried = true; makeLink(id, true); } } }, 12000);
    } else pc.ondatachannel = e => wire(e.channel);
    return l;
  }
  async function onRtc(from, d) {
    if (!d || left) return;
    try {
      let l = links.get(from);
      if (d.sdp && d.sdp.type === 'offer') {
        if (hostId !== me) return;
        if (l) closeLink(from);
        l = await makeLink(from, false);
        if (!l) return;
        await l.pc.setRemoteDescription(d.sdp);
        const ans = await l.pc.createAnswer();
        await l.pc.setLocalDescription(ans);
        send('rtc', { sdp: l.pc.localDescription.toJSON() }, from);
        for (const c of l.queue.splice(0)) await l.pc.addIceCandidate(c).catch(() => {});
      } else if (d.sdp && l && l.pc) {
        await l.pc.setRemoteDescription(d.sdp);
        for (const c of l.queue.splice(0)) await l.pc.addIceCandidate(c).catch(() => {});
      } else if (d.ice && l) {
        if (l.pc && l.pc.remoteDescription) await l.pc.addIceCandidate(d.ice).catch(() => {}); else l.queue.push(d.ice);
      }
    } catch (e) { console.warn('rtc', e); }
  }

  // ---- who is here
  function sync() {
    const state = ch.presenceState();
    members.clear();
    for (const [key, metas] of Object.entries(state)) {
      const m = metas[metas.length - 1];
      if (m && Number.isFinite(m.jt)) members.set(key, { id: key, nm: cleanName(m.nm) || 'PLAYER', jt: m.jt });
    }
    if (!tracked || !members.has(me)) return;      // not on the roll ourselves yet
    const first = [...members.values()].sort((a, b) => a.jt - b.jt || (a.id < b.id ? -1 : 1))[0];
    if (first.id !== hostId) { hostId = first.id; for (const id of [...links.keys()]) closeLink(id); emit('host', hostId); }
    for (const id of [...links.keys()]) if (!members.has(id)) closeLink(id);
    if (hostId !== me && !links.has(hostId)) makeLink(hostId, true).catch(e => { console.warn('direct link', e); closeLink(hostId); });
    emit('members');
  }
  let firstSync = null; const synced = new Promise(r => { firstSync = r; });
  ch.on('presence', { event: 'sync' }, () => { firstSync(); sync(); });

  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('Could not reach the room server. Check your connection and try again.')), 20000);
    ch.subscribe((s, err) => {
      if (s === 'SUBSCRIBED') { clearTimeout(t); res(); }
      else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { if (tracked) emit('down'); else { clearTimeout(t); rej(new Error('The room server said no' + (err ? ': ' + err.message : '') + '.')); } }
      else if (s === 'CLOSED' && tracked && !left) emit('down');
    });
  });
  // Join time decides who hosts. Clocks differ between computers, so never claim to be earlier than
  // anyone already here.
  await Promise.race([synced, sleep(1500)]);
  let jt = Date.now();
  for (const metas of Object.values(ch.presenceState())) for (const m of metas) if (Number.isFinite(m.jt) && m.jt >= jt) jt = m.jt + 1;
  tracked = true;
  await ch.track({ nm: cleanName(name) || 'PLAYER', jt });
  sync();

  return {
    me, code, members, on, send, fast, fastAll,
    get hostId() { return hostId; },
    get isHost() { return hostId === me; },
    linked: id => !!(links.get(id) && links.get(id).open),
    async leave() {
      if (left) return;
      left = true;
      for (const id of [...links.keys()]) closeLink(id);
      try { await ch.untrack(); } catch (e) {}
      try { await client.removeChannel(ch); } catch (e) {}
    },
  };
}
