// Classic Mac OS resource fork parser.
// A ResFile maps type -> id -> {name, data: Uint8Array}.

export class ResFile {
  constructor(buf, label = '') {
    this.label = label;
    this.types = new Map();
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (u8.length < 16) return;
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const dataOff = dv.getUint32(0), mapOff = dv.getUint32(4);
    const tlOff = mapOff + dv.getUint16(mapOff + 24);
    const nlOff = mapOff + dv.getUint16(mapOff + 26);
    const ntypes = dv.getUint16(tlOff) + 1;
    for (let t = 0; t < ntypes; t++) {
      const p = tlOff + 2 + t * 8;
      const type = macRoman(u8.subarray(p, p + 4));
      const cnt = dv.getUint16(p + 4) + 1;
      const refOff = tlOff + dv.getUint16(p + 6);
      const m = new Map();
      for (let i = 0; i < cnt; i++) {
        const q = refOff + i * 12;
        const id = dv.getInt16(q);
        const noff = dv.getUint16(q + 2);
        const off = dv.getUint32(q + 4) & 0xffffff;
        let name = null;
        if (noff !== 0xffff) {
          const n = nlOff + noff;
          name = macRoman(u8.subarray(n + 1, n + 1 + u8[n]));
        }
        const d = dataOff + off;
        const len = dv.getUint32(d);
        m.set(id, { name, data: u8.subarray(d + 4, d + 4 + len) });
      }
      this.types.set(type, m);
    }
  }
  get(type, id) {
    const m = this.types.get(type);
    const r = m && m.get(id);
    return r ? r.data : null;
  }
  getNamed(type, name) {
    const m = this.types.get(type);
    if (m) for (const r of m.values()) if (r.name === name) return r.data;
    return null;
  }
  ids(type) {
    const m = this.types.get(type);
    return m ? [...m.keys()].sort((a, b) => a - b) : [];
  }
}

// Resource chain: later-opened files are searched first (like UseResFile + CurResFile).
export class ResChain {
  constructor() { this.files = []; }
  push(f) { this.files.unshift(f); }
  remove(f) { this.files = this.files.filter(x => x !== f); }
  get(type, id) {
    for (const f of this.files) { const d = f.get(type, id); if (d) return d; }
    return null;
  }
  get1(file, type, id) { return file ? file.get(type, id) : null; }
}

const MAC_ROMAN_HI =
  'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø' +
  '¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ';

export function macRoman(bytes) {
  let s = '';
  for (const b of bytes) s += b < 128 ? String.fromCharCode(b) : MAC_ROMAN_HI[b - 128];
  return s;
}

export function pstr(u8, off = 0) {
  return macRoman(u8.subarray(off + 1, off + 1 + u8[off]));
}

// STR# resource -> array of strings (index 1-based in Mac API; we return 0-based array)
export function strList(data) {
  if (!data) return [];
  const n = (data[0] << 8) | data[1];
  const out = [];
  let p = 2;
  for (let i = 0; i < n; i++) { out.push(pstr(data, p)); p += 1 + data[p]; }
  return out;
}

export async function loadResFile(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('failed to load ' + url);
  return new ResFile(await r.arrayBuffer(), url);
}
