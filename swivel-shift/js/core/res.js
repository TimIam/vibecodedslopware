// Resource Manager emulation and Harry's face loaders (Load1EncFaceFromCicn / LoadEncFaceSetFromPICT ...).

import { ResFile, strList, pstr } from '../rsrc.js';
import { decodePICT, decodeHrSp, decodeCicnBitmap, Face, Bitmap } from '../gfx.js';

export const Res = {
  app: null, graphics: null, sounds: null, music: null, titles: null,
  world: null,          // current world file (Episode 1 or a custom world)
  useWorld: false,      // SetResWorldFile / RestoreResWorldFile
  pictCache: new Map(),
  onFace: null,         // called for every face loaded (drives the startup loading bar)
};

// fetch(url) -> ArrayBuffer, reporting (bytesSoFar, totalBytes) as it arrives
export async function fetchBytes(url, onProgress) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Could not load ' + url);
  const total = +r.headers.get('Content-Length') || 0;
  if (!onProgress || !r.body || !total) {
    const buf = await r.arrayBuffer();
    if (onProgress) onProgress(buf.byteLength, buf.byteLength);
    return buf;
  }
  // (a host may compress on the fly: Content-Length is then the compressed size, so it only guides the
  // progress and the data is whatever actually arrives)
  const chunks = [], reader = r.body.getReader();
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    n += value.length;
    onProgress(Math.min(n, total), total);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  onProgress(total, total);
  return out.buffer;
}
const fetchRes = async (url, onProgress) => new ResFile(await fetchBytes(url, onProgress), url);

// The title file comes first (it has the startup picture); the rest load behind the loading bar.
// track(name) returns the progress callback for that file.
export async function openTitleFile(base = 'data/') { Res.titles = await fetchRes(base + 'titles.rsrc'); }
export async function openResourceFiles(base = 'data/', track = () => undefined) {
  const files = ['app', 'sounds', 'music', 'graphics'];
  [Res.app, Res.sounds, Res.music, Res.graphics] = await Promise.all(files.map((f) => fetchRes(base + f + '.rsrc', track(f))));
  if (!Res.titles) await openTitleFile(base);
}
const faceLoaded = (f) => { if (f && Res.onFace) Res.onFace(); return f; };

export function setWorldFile(rf) { Res.world = rf; Res.pictCache.clear(); }

// Search order: (world, if SetResWorldFile active) -> Graphics -> Music -> Sounds -> Titles -> app
export function chain() {
  const c = [];
  if (Res.useWorld && Res.world) c.push(Res.world);
  c.push(Res.graphics, Res.music, Res.sounds, Res.titles, Res.app);
  return c.filter(Boolean);
}
export function getResource(type, id) {
  for (const f of chain()) { const d = f.get(type, id); if (d) return d; }
  return null;
}
export function setResWorldFile() { Res.useWorld = true; }
export function restoreResWorldFile() { Res.useWorld = false; }

export function getPicture(id) {
  const key = (Res.useWorld ? 'w' : '') + id;
  if (Res.pictCache.has(key)) return Res.pictCache.get(key);
  const d = getResource('PICT', id);
  const bm = d ? decodePICT(d) : null;
  Res.pictCache.set(key, bm);
  return bm;
}

export function getIndString(listId, index) {
  const d = getResource('STR#', listId);
  const l = strList(d);
  return l[index - 1] || '';
}
export function getStringList(listId) { return strList(getResource('STR#', listId)); }

// ---------------------------------------------------------------- faces
function hrsp(id) {
  if (!id) return null;
  const d = getResource('HrSp', id);
  return d ? decodeHrSp(d) : null;
}

// Load1EncFaceFromCicn(cicnID, buildMask, hrspID)
export function load1EncFaceFromCicn(cicnId, mask, hrspId) {
  const f = hrsp(hrspId);
  if (f) return faceLoaded(f);
  const d = getResource('cicn', cicnId);
  if (!d) return null;
  return faceLoaded(Face.fromBitmap(decodeCicnBitmap(d)));
}

// Load1EncFaceFromPICT(pictID, buildMask, hrspID)
export function load1EncFaceFromPICT(pictId, mask, hrspId) {
  const f = hrsp(hrspId);
  if (f) return faceLoaded(f);
  const bm = getPicture(pictId);
  return bm ? faceLoaded(Face.fromBitmap(bm)) : null;
}

// LoadEncFaceSetFromPICT(pict, count, w, h, cols, maskFrom, maskTo, hrspBase)
export function loadEncFaceSetFromPICT(pictId, count, w, h, cols, maskFrom, maskTo, hrspBase) {
  const faces = new Array(count).fill(null);
  if (hrspBase) {
    for (let i = 0; i < count; i++) faces[i] = hrsp(hrspBase + i);
    if (faces.every(Boolean)) { faces.forEach(faceLoaded); return faces; }
  }
  const bm = getPicture(pictId);
  if (!bm) return faces;
  for (let i = 0; i < count; i++) {
    if (faces[i]) continue;
    const col = i % cols, row = (i / cols) | 0;
    const f = Face.fromBitmap(bm.sub(col * w, row * h, w, h));
    f.w = w; f.h = h;
    faces[i] = f;
  }
  faces.forEach(faceLoaded);
  return faces;
}

// SATGetFace(cicnID): a plain SAT face from a cicn (pixels + mask)
export function satGetFace(id) {
  const d = getResource('cicn', id);
  if (!d) return null;
  return Face.fromBitmap(decodeCicnBitmap(d));
}

export { Bitmap, pstr };
