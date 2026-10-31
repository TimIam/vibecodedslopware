// InitFaces (seg 1 +0xc2f8): shared faces for props, desks, hazards and fire pipes, plus the two
// generic sprite draw procs (USERTINTABLESPRITEDRAWPROC / NOSCALEDRAWPROC, seg 3).

import { G } from './state.js';
import { load1EncFaceFromCicn, loadEncFaceSetFromPICT, satGetFace } from '../core/res.js';
import { register } from './hooks.js';

export const Faces = {
  deskH: [],        // g_8212: cicn 301..305 (64x32 desks)
  deskV: [],        // g_823a: cicn 311..315 (32x64 desks)
  deskMaskH: null,  // g_8262: cicn 300 (mask source)
  deskMaskV: null,  // g_8266: cicn 310
  f724: null,       // cicn 2001
  hazard: null,     // g_f728: cicn 3001
  dartboard: [],    // g_f72c..g_f738: cicn 1019/1029/1039/1049
  firePipe: [],     // g_f73c..g_f748: cicn 4201..4204
  mailProp: [],     // g_f74c..g_f758: cicn 1609/1619/1629/1639
  particles: null,  // g_f75c: PICT 170, 32 faces of 4x4
  f720: null,       // SATGetFace(200)
  f718: null, f71c: null, // SATGetFace(498 / 499)
};

// Per-object tint: level info(0) is the level-wide tint; otherwise the object record's word +4
// (the same field doors and exits use for their parameter) selects one of the 16 tints.
export function userTintDrawProc(face, s, blit) {
  const tint = G.level.info(0);
  if (!s) return tint ? blit(1, tint) : blit(0, 0);
  const scale = s.scaleH !== 256 ? s.scaleH << 5 : 0;
  if (tint) return blit(1, tint + scale);
  if (s.param >= 0) {
    let t = G.level.w(G.level.objOff(s.param) + 4);
    if (t) {
      if (t < -1 || t > 15) t = 0;
      return blit(1, t + scale);
    }
  }
  return blit(0, scale);
}

export function noScaleDrawProc(face, s, blit) {
  const tint = G.level.info(0);
  return tint ? blit(1, tint) : blit(0, 0);
}

const tintable = (f) => { if (f) f.drawProc = userTintDrawProc; return f; };

export function initFaces() {
  Faces.f718 = satGetFace(498);
  Faces.f71c = satGetFace(499);
  for (let i = 0; i < 5; i++) Faces.deskH[i] = load1EncFaceFromCicn(301 + i, false, 6001 + i);
  for (let i = 0; i < 5; i++) Faces.deskV[i] = load1EncFaceFromCicn(311 + i, false, 6011 + i);
  Faces.deskMaskH = load1EncFaceFromCicn(300, true, 6021);
  Faces.deskMaskV = load1EncFaceFromCicn(310, true, 6022);
  Faces.f724 = load1EncFaceFromCicn(2001, false, 6031);
  Faces.hazard = load1EncFaceFromCicn(3001, false, 6032);
  // dartboards: 1039/1049 are tinted first in the original, then 1019/1029 - all four end up tintable
  [1019, 1029, 1039, 1049].forEach((id, i) => { Faces.dartboard[i] = tintable(load1EncFaceFromCicn(id, false, 6034 + i)); });
  for (let i = 0; i < 4; i++) Faces.firePipe[i] = tintable(load1EncFaceFromCicn(4201 + i, false, 6041 + i));
  [1609, 1619, 1629, 1639].forEach((id, i) => { Faces.mailProp[i] = tintable(load1EncFaceFromCicn(id, false, 6051 + i)); });
  Faces.particles = loadEncFaceSetFromPICT(170, 32, 4, 4, 8, 0, 0, 0);
  Faces.f720 = satGetFace(200);
}

export function propFace(id) {
  switch (id) {
    case 1019: return Faces.dartboard[0];
    case 1029: return Faces.dartboard[1];
    case 1039: return Faces.dartboard[2];
    case 1049: return Faces.dartboard[3];
    case 1609: return Faces.mailProp[0];
    case 1619: return Faces.mailProp[1];
    case 1629: return Faces.mailProp[2];
    case 1639: return Faces.mailProp[3];
  }
  return null;
}
export const hazardFace = () => Faces.hazard;
export const firePipeFace = (id) => Faces.firePipe[id - 4201];

register({ propFace, hazardFace, firePipeFace });
