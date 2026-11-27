// Takes the PNGs icons.html posts (window.saveAll()) and writes them to png/ beside this file.
//   node steam/achievements/save.mjs      (listens on localhost:3192 until stopped)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'png');
fs.mkdirSync(dir, { recursive: true });
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'POST'); res.setHeader('Access-Control-Allow-Headers', '*'); res.setHeader('Access-Control-Allow-Private-Network', 'true'); res.end(); return; }
  const name = decodeURIComponent(req.url.slice(1));
  if (req.method !== 'POST' || !/^[A-Z0-9_]+(_locked)?\.png$/.test(name)) { res.statusCode = 400; res.end('bad'); return; }
  const parts = [];
  req.on('data', d => parts.push(d));
  req.on('end', () => { fs.writeFileSync(path.join(dir, name), Buffer.concat(parts)); res.end('ok'); });
}).listen(3192, '127.0.0.1', () => console.log('saving icons to', dir));
