// Proximity voice chat. Opt-in: nothing here runs until the player turns voice on, and two golfers are
// only connected once both have. Audio goes straight between browsers (WebRTC, one connection per pair,
// at most four); the room's broadcast channel only carries the handshake. Each voice is played through
// a gain and a pan that main.js sets from where that golfer stands, so people fade with distance.
//
// Public STUN servers are always used. Two players who are both behind strict (symmetric) NATs or a
// firewall that blocks UDP need a TURN relay as well: /api/turn hands out short-lived credentials for
// one when the site has a Cloudflare TURN key, and nothing when it has not, in which case those two
// players simply do not connect.
const TURN_URL = '/api/turn';
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }];
export const VOICE = { near: 4, far: 45 };      // full volume inside near metres, silent beyond far
export const voiceGain = d => { const k = Math.min(1, Math.max(0, 1 - (d - VOICE.near) / (VOICE.far - VOICE.near))); return k * k; };

const okSdp = d => d && typeof d.sdp === 'string' && d.sdp.length < 20000;

export class Voice {
  // send(to, data): put a handshake message on the room channel. me: my id in the room.
  constructor(send, me) {
    this.send = send; this.me = me;
    this.volume = 1;              // the voice chat slider
    this.on = false; this.mic = null; this.muted = false; this.denied = false;
    this.links = new Map();       // peer id -> { pc, gain, pan, el, ... }
    this.ctx = null;
    this.ice = ICE; this.relay = false; this.iceUntil = 0;
  }
  // Ask the site for relay credentials (they last a few hours; ask again after one). Any failure leaves
  // the public servers, which is how it worked before there was a relay.
  async loadIce() {
    if (performance.now() < this.iceUntil) return;
    this.iceUntil = performance.now() + 60 * 60 * 1000;
    try {
      const r = await fetch(TURN_URL, { cache: 'no-store' });
      const d = r.ok ? await r.json() : null;
      const extra = (d && Array.isArray(d.iceServers) ? d.iceServers : []).filter(s => s && Array.isArray(s.urls) && s.urls.length && s.urls.every(u => typeof u === 'string')).slice(0, 4);
      this.relay = extra.some(s => typeof s.credential === 'string');
      this.ice = this.relay ? ICE.concat(extra) : ICE;
    } catch (e) { this.ice = ICE; this.relay = false; this.iceUntil = performance.now() + 60 * 1000; }
  }
  get supported() { return typeof RTCPeerConnection === 'function'; }
  get hasMic() { return !!this.mic; }
  // Turn voice on. Asks the browser for the microphone; without one you can still listen.
  async enable() {
    if (!this.supported) return false;
    this.on = true;
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    await Promise.all([this.loadIce(), this.mic ? null : this.askMic()]);
    return true;
  }
  async askMic() {
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      this.denied = false;
      const track = this.mic.getAudioTracks()[0];
      track.enabled = !this.muted;
      for (const l of this.links.values()) { const tx = l.pc.getTransceivers()[0]; if (tx) tx.sender.replaceTrack(track).catch(() => {}); }
    } catch (e) { this.mic = null; this.denied = true; }
    return !!this.mic;
  }
  setMuted(m) { this.muted = !!m; if (this.mic) for (const t of this.mic.getAudioTracks()) t.enabled = !this.muted; }
  disable() {
    this.on = false;
    for (const id of [...this.links.keys()]) this.drop(id, true);
    if (this.mic) { for (const t of this.mic.getTracks()) t.stop(); this.mic = null; }
  }
  // main.js says who should be connected: golfers in the room who have voice on too.
  want(id, yes) {
    const l = this.links.get(id);
    if (!yes || !this.on) { if (l) this.drop(id, true); return; }
    if (l) {
      // A link that never got through: the side that calls tries again a few times.
      const stuck = l.pc.connectionState === 'failed' || (l.pc.connectionState !== 'connected' && performance.now() - l.born > 20000);
      if (stuck) { const tries = l.tries; this.drop(id, true); if (this.me < id && tries < 3) this.call(id, tries + 1); else this.gaveUp = (this.gaveUp || new Set()).add(id); }
      return;
    }
    if (this.gaveUp && this.gaveUp.has(id)) return;
    if (this.me < id) this.call(id, 0);     // the smaller id calls, the other waits to be called
  }
  link(id, tries = 0) {
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const l = { pc, tries, born: performance.now(), out: [], inq: [], gain: null, pan: null, an: null, el: null, buf: null };
    pc.onicecandidate = e => {
      if (!e.candidate) return;
      l.out.push(e.candidate.toJSON());
      if (!l.flush) l.flush = setTimeout(() => { l.flush = 0; if (this.links.get(id) === l && l.out.length) this.send(id, { t: 'ice', c: l.out.splice(0, 30) }); }, 200);
    };
    pc.ontrack = e => this.play(l, e.streams[0] || new MediaStream([e.track]));
    this.links.set(id, l);
    return l;
  }
  async call(id, tries) {
    const l = this.link(id, tries);
    try {
      const tx = l.pc.addTransceiver('audio', { direction: 'sendrecv' });
      if (this.mic) await tx.sender.replaceTrack(this.mic.getAudioTracks()[0]);
      await l.pc.setLocalDescription(await l.pc.createOffer());
      this.send(id, { t: 'offer', sdp: l.pc.localDescription.sdp });
    } catch (e) { this.drop(id); }
  }
  // A handshake message from a peer. Everything in it is checked before it is used.
  async signal(id, d) {
    if (!this.on || !d || typeof d !== 'object') return;
    let l = this.links.get(id);
    try {
      if (d.t === 'offer' && okSdp(d)) {
        if (l) this.drop(id);
        l = this.link(id);
        await l.pc.setRemoteDescription({ type: 'offer', sdp: d.sdp });
        const tx = l.pc.getTransceivers()[0];
        if (tx) { tx.direction = 'sendrecv'; if (this.mic) await tx.sender.replaceTrack(this.mic.getAudioTracks()[0]); }
        await l.pc.setLocalDescription(await l.pc.createAnswer());
        this.send(id, { t: 'answer', sdp: l.pc.localDescription.sdp });
        this.drain(l);
      } else if (d.t === 'answer' && okSdp(d) && l && l.pc.signalingState === 'have-local-offer') {
        await l.pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
        this.drain(l);
      } else if (d.t === 'ice' && Array.isArray(d.c) && l) {
        for (const c of d.c.slice(0, 40)) if (c && typeof c.candidate === 'string' && c.candidate.length < 600) l.inq.push({ candidate: c.candidate, sdpMid: typeof c.sdpMid === 'string' ? c.sdpMid.slice(0, 16) : null, sdpMLineIndex: Number.isInteger(c.sdpMLineIndex) ? c.sdpMLineIndex : null });
        this.drain(l);
      } else if (d.t === 'bye' && l) this.drop(id);
    } catch (e) { this.drop(id); }
  }
  drain(l) { if (!l.pc.remoteDescription) return; for (const c of l.inq.splice(0)) l.pc.addIceCandidate(c).catch(() => {}); }
  play(l, stream) {
    // Chrome only feeds a remote stream into Web Audio if it is also attached to a media element.
    l.el = new Audio(); l.el.muted = true; l.el.srcObject = stream; l.el.play().catch(() => {});
    if (!this.ctx) { l.el.muted = false; return; }
    const src = this.ctx.createMediaStreamSource(stream);
    l.gain = this.ctx.createGain(); l.gain.gain.value = 0;
    l.an = this.ctx.createAnalyser(); l.an.fftSize = 256; l.buf = new Uint8Array(l.an.fftSize);
    src.connect(l.an); src.connect(l.gain);
    if (this.ctx.createStereoPanner) { l.pan = this.ctx.createStereoPanner(); l.gain.connect(l.pan).connect(this.ctx.destination); }
    else l.gain.connect(this.ctx.destination);
  }
  // How loud and where: distance in metres, pan from -1 (left) to 1 (right).
  place(id, dist, pan = 0) {
    const l = this.links.get(id); if (!l || !l.gain) return;
    const t = this.ctx.currentTime;
    l.vol = voiceGain(dist);
    l.gain.gain.setTargetAtTime(l.vol * this.volume, t, 0.08);
    if (l.pan) l.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)) * 0.7, t, 0.08);
  }
  // Is this golfer making noise right now (for the little speaker over their head)?
  talking(id) {
    const l = this.links.get(id); if (!l || !l.an) return false;
    l.an.getByteTimeDomainData(l.buf);
    let peak = 0; for (let i = 0; i < l.buf.length; i += 4) peak = Math.max(peak, Math.abs(l.buf[i] - 128));
    return peak > 6;
  }
  connected(id) { const l = this.links.get(id); return !!l && l.pc.connectionState === 'connected'; }
  count() { let n = 0; for (const l of this.links.values()) if (l.pc.connectionState === 'connected') n++; return n; }
  drop(id, tell) {
    const l = this.links.get(id); if (!l) return;
    this.links.delete(id);
    clearTimeout(l.flush);
    try { l.pc.ontrack = l.pc.onicecandidate = null; l.pc.close(); } catch (e) {}
    try { if (l.gain) l.gain.disconnect(); if (l.pan) l.pan.disconnect(); if (l.el) { l.el.srcObject = null; } } catch (e) {}
    if (tell) this.send(id, { t: 'bye' });
  }
}
