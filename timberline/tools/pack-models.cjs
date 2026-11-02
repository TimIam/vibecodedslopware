// Packs assets/models/*.glb into assets/web/*.js modules (base64) so hosts that
// don't serve .glb can still deliver the Blender models. Run: node tools/pack-models.cjs
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'assets', 'models'), out = path.join(__dirname, '..', 'assets', 'web');
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(src).filter((f) => f.endsWith('.glb'))) {
  const b64 = fs.readFileSync(path.join(src, f)).toString('base64');
  fs.writeFileSync(path.join(out, f.replace('.glb', '.js')), `export default "${b64}";\n`);
  console.log(f, (b64.length / 1024).toFixed(0) + ' KB');
}
