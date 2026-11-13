// Pull the HLSL that ANGLE/D3D11 makes from one bake shader, so tools/test/fxc.py can compile it and show the real error.
// node hlsl.mjs http://localhost:3289/desert-chase/chase.html BUSH_FS bush.hlsl   then   python fxc.py bush.hlsl
// (Blender ships a Python: "C:/Program Files/Blender Foundation/Blender 5.1/5.1/python/bin/python.exe" -I fxc.py ...)
import { createRequire } from 'node:module'; import fs from 'node:fs';
const require = createRequire('C:/Projects/vibecodedslopware/package.json');
const { chromium } = require('playwright-core');
const [url, name, out] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
await page.goto(url);
await page.waitForFunction(() => window.__saver && window.__saver.SCENE.debug().gpu, null, { timeout: 60000 });
const r = await page.evaluate((n) => { const gl = document.getElementById('c').getContext('webgl2'); const ext = gl.getExtension('WEBGL_debug_shaders'); const src = window.__saver.SCENE.debug().src[n]; const sh = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(sh, src); gl.compileShader(sh); return { ok: gl.getShaderParameter(sh, gl.COMPILE_STATUS), log: gl.getShaderInfoLog(sh), hlsl: ext ? ext.getTranslatedShaderSource(sh) : 'noext' }; }, name);
fs.writeFileSync(out, r.hlsl); console.log(r.ok, r.log, r.hlsl.length);
await browser.close();
