'use strict';
// Generates a 128x64 PNG icon: 4 Pokemon sprites in a 2×2 grid on a GB-green background.
// No external dependencies — decodes the existing media/sprites/front/*.png files directly.

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const W = 128, H = 64;
const BG = [0x0f, 0x38, 0x0f]; // GB darkest green background
const SEP = [0x30, 0x62, 0x30]; // GB dark green separator line

// 2×2 grid: each cell is 64×32, sprites are 28×28 with 2px padding
const CELL_W = 64, CELL_H = 32;
const SPRITE_SZ = 28;
const PAD = (CELL_H - SPRITE_SZ) / 2; // 2px top/bottom, 18px left/right → centre sprite

// The four sprites to feature (ids of iconic Gen 1 Pokemon)
const SLOTS = [
  { id: 6,  pos: [0,      0]      },  // Charizard — top-left
  { id: 3,  pos: [CELL_W, 0]      },  // Venusaur  — top-right
  { id: 9,  pos: [0,      CELL_H] },  // Blastoise — bottom-left
  { id: 25, pos: [CELL_W, CELL_H] },  // Pikachu   — bottom-right
];

// ---- Canvas (RGB, initialised to background colour) ----
const canvas = Array.from({ length: H }, () =>
  Array.from({ length: W }, () => [...BG])
);

function setPixel(x, y, r, g, b) {
  x = x | 0; y = y | 0;
  if (x >= 0 && x < W && y >= 0 && y < H) {
    canvas[y][x][0] = r;
    canvas[y][x][1] = g;
    canvas[y][x][2] = b;
  }
}

// ---- Minimal PNG decoder (handles RGB + RGBA, all filter types) ----
function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(filePath) {
  const buf = fs.readFileSync(filePath);

  const SIG = [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== SIG[i]) throw new Error(`Not a PNG: ${filePath}`);
  }

  let width = 0, height = 0, colorType = 0;
  let palette = [];        // PLTE: array of [r,g,b]
  let palAlpha = [];       // tRNS: alpha per palette entry
  const idatBufs = [];
  let pos = 8;

  while (pos < buf.length) {
    const len  = buf.readUInt32BE(pos); pos += 4;
    const type = buf.slice(pos, pos + 4).toString('ascii'); pos += 4;
    const data = buf.slice(pos, pos + len); pos += len;
    pos += 4; // skip CRC

    if (type === 'IHDR') {
      width     = data.readUInt32BE(0);
      height    = data.readUInt32BE(4);
      colorType = data[9]; // 3=indexed, 2=RGB, 6=RGBA
    } else if (type === 'PLTE') {
      for (let i = 0; i < len; i += 3) {
        palette.push([data[i], data[i+1], data[i+2]]);
      }
    } else if (type === 'tRNS') {
      // For indexed PNGs: alpha value per palette entry
      for (let i = 0; i < len; i++) palAlpha.push(data[i]);
    } else if (type === 'IDAT') {
      idatBufs.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  // bpp for the filter reconstruction step
  const bpp = colorType === 6 ? 4 : colorType === 4 ? 2 : colorType === 3 ? 1 : 3;
  const stride = width * bpp;
  const raw    = zlib.inflateSync(Buffer.concat(idatBufs));

  const pixels = []; // pixels[y][x] = [r, g, b, a]
  let rawPos = 0;
  let prevRow = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const filter  = raw[rawPos++];
    const rowData = new Uint8Array(stride);

    for (let i = 0; i < stride; i++) {
      const byte = raw[rawPos++];
      const a = i >= bpp ? rowData[i - bpp] : 0;
      const b = prevRow[i];
      const c = i >= bpp ? prevRow[i - bpp] : 0;

      switch (filter) {
        case 0: rowData[i] = byte;                                      break;
        case 1: rowData[i] = (byte + a)              & 0xff;            break;
        case 2: rowData[i] = (byte + b)              & 0xff;            break;
        case 3: rowData[i] = (byte + ((a + b) >> 1)) & 0xff;           break;
        case 4: rowData[i] = (byte + paethPredictor(a, b, c)) & 0xff;  break;
        default: rowData[i] = byte;
      }
    }

    const row = [];
    for (let x = 0; x < width; x++) {
      if (colorType === 3) {
        // Indexed: look up palette entry
        const idx  = rowData[x];
        const rgb  = palette[idx] || [0, 0, 0];
        const alpha = palAlpha[idx] !== undefined ? palAlpha[idx] : 255;
        row.push([rgb[0], rgb[1], rgb[2], alpha]);
      } else if (colorType === 6) {
        const o = x * 4;
        row.push([rowData[o], rowData[o+1], rowData[o+2], rowData[o+3]]);
      } else {
        const o = x * 3;
        row.push([rowData[o], rowData[o+1], rowData[o+2], 255]);
      }
    }
    pixels.push(row);
    prevRow = rowData;
  }

  return { width, height, pixels };
}

// ---- Composite a decoded sprite into the canvas ----
function blitSprite(sprite, dstX, dstY, dstW, dstH) {
  const scaleX = sprite.width  / dstW;
  const scaleY = sprite.height / dstH;

  for (let y = 0; y < dstH; y++) {
    const srcY = Math.min(sprite.height - 1, Math.floor(y * scaleY));
    for (let x = 0; x < dstW; x++) {
      const srcX = Math.min(sprite.width - 1, Math.floor(x * scaleX));
      const [r, g, b, a] = sprite.pixels[srcY][srcX];
      if (a > 64) { // skip (near-)transparent pixels
        setPixel(dstX + x, dstY + y, r, g, b);
      }
    }
  }
}

// ---- Draw each sprite slot ----
const spritesDir = path.join(__dirname, '..', 'media', 'sprites', 'front');

for (const { id, pos: [qx, qy] } of SLOTS) {
  const file = path.join(spritesDir, `${id}.png`);
  if (!fs.existsSync(file)) {
    console.warn(`  [skip] sprite ${id}.png not found`);
    continue;
  }
  const sprite = decodePng(file);
  // Centre the sprite horizontally within its cell
  const padX = Math.floor((CELL_W - SPRITE_SZ) / 2);
  const padY = Math.floor((CELL_H - SPRITE_SZ) / 2);
  blitSprite(sprite, qx + padX, qy + padY, SPRITE_SZ, SPRITE_SZ);
}

// ---- 1-pixel separator cross between quadrants ----
for (let x = 0; x < W; x++) { if (CELL_H - 1 < H) canvas[CELL_H - 1][x] = [...SEP]; }
for (let y = 0; y < H; y++) { canvas[y][CELL_W - 1] = [...SEP]; }

// ---- PNG encoding (no external dependencies) ----
function u32be(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}
function crc32(buf) {
  let crc = 0xffffffff;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  for (const byte of buf) crc = (crc >>> 8) ^ t[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const tb = Buffer.from(type, 'ascii');
  return Buffer.concat([u32be(data.length), tb, data, u32be(crc32(Buffer.concat([tb, data])))]);
}

const rows = [];
for (let y = 0; y < H; y++) {
  const row = [0]; // filter byte = None
  for (let x = 0; x < W; x++) row.push(...canvas[y][x]);
  rows.push(Buffer.from(row));
}
const compressed = zlib.deflateSync(Buffer.concat(rows), { level: 9 });

const sig  = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
const ihdr = chunk('IHDR', Buffer.concat([u32be(W), u32be(H), Buffer.from([8, 2, 0, 0, 0])]));
const idat = chunk('IDAT', compressed);
const iend = chunk('IEND', Buffer.alloc(0));

const out = path.join(__dirname, '..', 'media', 'icon.png');
fs.writeFileSync(out, Buffer.concat([sig, ihdr, idat, iend]));
console.log('icon.png written:', out);
