// Builds a simple 3D model for an imported ornament. Origin is the hanging point (top centre).
// asset: { model: 'lathe'|'inflate'|'flat', heightIn, widthIn, profile:[r per row, 0..1 of half-width],
//          field:{w,h,data:[0..1]} (inflate), _tex: THREE.Texture of the cutout }
import * as THREE from 'three';

const texCache = new Map();
export function assetTexture(asset) {
  if (asset._tex) return asset._tex;
  if (!asset._img) return null;
  const t = new THREE.Texture(asset._img); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; t.anisotropy = 4;
  asset._tex = t; return t;
}

export function buildCustomMesh(asset) {
  const H = asset.heightIn, W = asset.widthIn, tex = assetTexture(asset);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.1, alphaTest: 0.4, side: THREE.DoubleSide, transparent: false });
  let geo;
  if (asset.model === 'lathe' && asset.profile?.length > 2) {
    const n = asset.profile.length;
    const pts = [new THREE.Vector2(0, 0)];
    for (let i = 0; i < n; i++) pts.push(new THREE.Vector2(Math.max(0.01, asset.profile[i] * W / 2), -(i + 0.5) / n * H));
    pts.push(new THREE.Vector2(0, -H));
    geo = new THREE.LatheGeometry(pts, 40);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / W, 1 + p.getY(i) / H);
    mat.alphaTest = 0; // lathe silhouette already matches the photo
  } else if (asset.model === 'inflate' && asset.field) {
    const { w, h, data } = asset.field, thick = Math.min(W, H) * 0.16;
    const front = new THREE.PlaneGeometry(W, H, w - 1, h - 1), p = front.attributes.position;
    for (let i = 0; i < p.count; i++) { const ix = i % w, iy = Math.floor(i / w); p.setZ(i, thick * Math.sqrt(data[iy * w + ix] || 0)); }
    front.computeVertexNormals(); front.translate(0, -H / 2, 0);
    const back = front.clone(); back.scale(1, 1, -1);
    const g = new THREE.Group(); g.add(new THREE.Mesh(front, mat), new THREE.Mesh(back, mat)); return g;
  } else {
    geo = new THREE.PlaneGeometry(W, H); geo.translate(0, -H / 2, 0);
  }
  return new THREE.Mesh(geo, mat);
}
export { texCache };
