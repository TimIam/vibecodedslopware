// node tools/test/ppm2png.mjs in.ppm out.png [scale]   (binary P6 only; nearest-neighbour upscale)
import fs from 'fs';
import zlib from 'zlib';
const [src, dst, scaleArg] = process.argv.slice(2);
const scale = Number(scaleArg || 3);
const buf = fs.readFileSync(src);
let pos = 0;
const token = () => { while (buf[pos] === 10 || buf[pos] === 32) pos++; let s = ''; while (buf[pos] !== 10 && buf[pos] !== 32) s += String.fromCharCode(buf[pos++]); return s; };
if (token() !== 'P6') throw new Error('not a P6 ppm');
const w = Number(token()), h = Number(token()); token(); pos++;
const W = w * scale, H = h * scale, raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  const o = y * (W * 3 + 1);
  raw[o] = 0;
  const sy = Math.floor(y / scale);
  for (let x = 0; x < W; x++) { const i = pos + (sy * w + Math.floor(x / scale)) * 3; raw[o + 1 + x * 3] = buf[i]; raw[o + 2 + x * 3] = buf[i + 1]; raw[o + 3 + x * 3] = buf[i + 2]; }
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(dst, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
