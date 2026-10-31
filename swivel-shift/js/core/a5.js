// Initialised application globals (the relocated A5 world, rebuilt from the original's DATA 0 resource).
// Used for static tables and strings the original keeps in its globals.

import { pstr } from '../rsrc.js';

let bytes = null, base = 0;

export async function loadA5(dir = 'data/') {
  const [bin, meta] = await Promise.all([fetch(dir + 'a5.bin'), fetch(dir + 'a5.json')]);
  bytes = new Uint8Array(await bin.arrayBuffer());
  base = (await meta.json()).a5;
}
export const a5b = (off) => bytes[base + off];
export const a5w = (off) => ((bytes[base + off] << 24) >> 16) | bytes[base + off + 1];
export const a5l = (off) => (bytes[base + off] << 24) | (bytes[base + off + 1] << 16) | (bytes[base + off + 2] << 8) | bytes[base + off + 3];
export const a5pstr = (off) => pstr(bytes, base + off);
