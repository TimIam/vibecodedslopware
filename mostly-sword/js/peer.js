// The existing room carries signaling and can carry the duel while ICE is
// negotiating or when a network blocks peer traffic. Only seated peers signal.
export function openPeerLink(caller, signal, receive) {
  if (typeof RTCPeerConnection !== 'function') return null;
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }]
  });
  let dc,
    closed = false,
    lastDirect = 0;
  let queued = Promise.resolve();
  const candidates = [];
  function close() {
    if (closed) return;
    closed = true;
    dc?.close();
    pc.close();
  }
  function wire(channel) {
    if (closed || dc || channel.label !== 'duel') {
      channel.close();
      return;
    }
    dc = channel;
    dc.onopen = () => {
      lastDirect = performance.now();
    };
    dc.onmessage = ({ data }) => {
      if (typeof data !== 'string' || data.length > 20000) return;
      let packet;
      try {
        packet = JSON.parse(data);
      } catch {
        return;
      }
      lastDirect = performance.now();
      receive(packet);
    };
    dc.onclose = close;
    dc.onerror = close;
  }
  pc.ondatachannel = ({ channel }) => wire(channel);
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') close();
  };
  pc.onicecandidate = ({ candidate }) => {
    if (!closed && candidate) signal({ candidate: candidate.toJSON() });
  };
  async function negotiate(message) {
    if (closed) return;
    if (message?.candidate) {
      if (pc.remoteDescription) await pc.addIceCandidate(message.candidate);
      else if (candidates.length < 64) candidates.push(message.candidate);
      return;
    }
    if (message?.description?.type !== (caller ? 'answer' : 'offer') || pc.remoteDescription) return;
    await pc.setRemoteDescription(message.description);
    for (const candidate of candidates.splice(0)) await pc.addIceCandidate(candidate);
    if (!caller) {
      await pc.setLocalDescription(await pc.createAnswer());
      if (!closed) signal({ description: pc.localDescription.toJSON() });
    }
  }
  if (caller) {
    wire(pc.createDataChannel('duel', { ordered: false, maxRetransmits: 0 }));
    queued = (async () => {
      await pc.setLocalDescription(await pc.createOffer());
      if (!closed) signal({ description: pc.localDescription.toJSON() });
    })().catch(close);
  }
  return {
    get open() {
      return !closed && dc?.readyState === 'open';
    },
    check(now) {
      if (this.open && now - lastDirect > 2400) close();
    },
    signal(message) {
      queued = queued.then(() => negotiate(message)).catch(close);
    },
    write(packet) {
      if (!this.open) return false;
      // Drop superseded frames rather than stacking them on a congested path.
      if (dc.bufferedAmount > 12 * 1024) return true;
      try {
        dc.send(JSON.stringify(packet));
        return true;
      } catch {
        close();
        return false;
      }
    },
    close
  };
}
