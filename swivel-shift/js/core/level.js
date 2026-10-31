// Hlvl level record (0x12988 bytes), kept as a mutable byte copy like the original handle.
// Grids are column-major: cell(col,row) at col*256 + row*2 (BG at 0, FG at 0x8000).

export const LEVEL_SIZE = 0x12988;

export class Level {
  constructor(bytes) {
    this.u8 = new Uint8Array(LEVEL_SIZE);
    this.u8.set(bytes.subarray(0, LEVEL_SIZE));
    this.dv = new DataView(this.u8.buffer);
  }
  w(off) { return this.dv.getInt16(off); }
  uw(off) { return this.dv.getUint16(off); }
  setW(off, v) { this.dv.setInt16(off, v); }
  b(off) { return this.u8[off]; }
  setB(off, v) { this.u8[off] = v; }

  // GetBGTile / GetFGTile clamp coordinates to 0..127
  bg(col, row) { col = col < 0 ? 0 : col > 127 ? 127 : col; row = row < 0 ? 0 : row > 127 ? 127 : row; return this.dv.getInt16(col * 256 + row * 2); }
  fg(col, row) { col = col < 0 ? 0 : col > 127 ? 127 : col; row = row < 0 ? 0 : row > 127 ? 127 : row; return this.dv.getInt16(0x8000 + col * 256 + row * 2); }
  setBg(col, row, v) { this.dv.setInt16(col * 256 + row * 2, v); }
  setFg(col, row, v) { this.dv.setInt16(0x8000 + col * 256 + row * 2, v); }

  // Object records at 0x10000 (16 bytes each): +0 active byte, +2 id, +4..+0xb params, +0xc v, +0xe h
  objOff(i) { return 0x10000 + i * 16; }
  // Level info fields #0..#15 (see Level Info doc)
  info(n) { return this.w(0x12074 + n * 2); }

  get startV() { return this.w(0x120f4); }
  get startH() { return this.w(0x120f6); }
  get startDir() { return this.w(0x120f8); }
  get music() { return this.w(0x120fa); }
  get fgTileset() { return this.w(0x120fc); }
  get bgTileset() { return this.w(0x120fe); }
}
