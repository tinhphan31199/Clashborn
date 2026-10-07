/**
 * Vẽ sprite gốc cây 64x64 (pixel-art, nền trong suốt) ra public/assets/stump-tile.png.
 * Chạy 1 lần: node scripts/gen-stump-sprite.mjs
 * Gốc cây bị đốn: thân cụt + mặt cắt vân gỗ + rễ + cỏ dại.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const W = 64;
const H = 64;

let seed = 777001;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const px = Buffer.alloc(W * H * 4); // trong suốt sẵn (0)
const set = (x, y, r, g, b, a = 255) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  // hòa lên nền trong suốt (ghi đè vì vẽ 1 lớp)
  if (a === 255) { px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; }
  else {
    px[i] = Math.round((px[i] * (255 - a) + r * a) / 255);
    px[i + 1] = Math.round((px[i + 1] * (255 - a) + g * a) / 255);
    px[i + 2] = Math.round((px[i + 2] * (255 - a) + b * a) / 255);
    px[i + 3] = Math.min(255, px[i + 3] + a);
  }
};
const vary = (v, n) => Math.max(0, Math.min(255, Math.round(v + (rnd() - 0.5) * n)));
const disc = (cx, cy, r, fn) => {
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++)
      if (Math.hypot(x - cx, y - cy) <= r) fn(x, y);
};

// 1. Bóng đổ dưới gốc.
disc(32, 52, 20, (x, y) => set(x, y, 0, 0, 0, 40));
// 2. Rễ tỏa 5 hướng.
for (let k = 0; k < 5; k++) {
  const ang = (k / 5) * Math.PI * 2 + 0.4;
  for (let s = 6; s <= 18; s += 1) {
    const x = Math.round(32 + Math.cos(ang) * s);
    const y = Math.round(50 + Math.sin(ang) * s * 0.45);
    set(x, y, vary(74, 10), vary(52, 8), vary(30, 6));
    set(x, y + 1, vary(62, 10), vary(44, 8), vary(26, 6));
  }
}
// 3. Thân cụt (hình thang, vỏ cây nâu sẫm + vệt sáng trái).
for (let y = 26; y <= 50; y++) {
  const wHalf = 10 + ((y - 26) / 24) * 5; // loe ra ở chân
  for (let x = Math.round(32 - wHalf); x <= Math.round(32 + wHalf); x++) {
    const edge = Math.abs(x - 32) / wHalf;
    if (edge > 0.85) set(x, y, vary(58, 8), vary(40, 6), vary(24, 5)); // vỏ tối viền
    else if (x < 30) set(x, y, vary(146, 10), vary(104, 8), vary(58, 6)); // vệt sáng
    else set(x, y, vary(110, 10), vary(76, 8), vary(42, 6)); // vỏ
  }
}
// 4. Mặt cắt ngang (ellipse) + vân gỗ đồng tâm.
for (let y = 18; y <= 28; y++) {
  for (let x = 18; x <= 46; x++) {
    const ex = (x - 32) / 14;
    const ey = (y - 23) / 5.5;
    if (ex * ex + ey * ey <= 1) set(x, y, vary(214, 10), vary(178, 10), vary(120, 8));
  }
}
for (let r = 1; r <= 4; r++) {
  for (let a = 0; a < Math.PI * 2; a += 0.12) {
    const x = Math.round(32 + Math.cos(a) * r * 3.2);
    const y = Math.round(23 + Math.sin(a) * r * 1.25);
    set(x, y, vary(170, 10), vary(134, 10), vary(88, 8));
  }
}
set(32, 23, 150, 116, 72); // lõi
// 5. Viền mặt cắt sẫm.
for (let a = 0; a < Math.PI * 2; a += 0.08) {
  const x = Math.round(32 + Math.cos(a) * 14);
  const y = Math.round(23 + Math.sin(a) * 5.5);
  set(x, y, vary(70, 8), vary(48, 6), vary(28, 5));
}
// 6. Cỏ dại quanh gốc.
for (let n = 0; n < 26; n++) {
  const x = Math.floor(rnd() * W);
  const y = 44 + Math.floor(rnd() * 18);
  const h = 3 + Math.floor(rnd() * 4);
  for (let s = 0; s < h; s++) set(x, y - s, vary(74, 14), vary(140, 14), vary(52, 10));
}

// Encode PNG (RGBA).
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0;
  px.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  let crc = 0xffffffff;
  const table = chunk._t ??= (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  for (const b of td) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  crc = (crc ^ 0xffffffff) >>> 0;
  const cb = Buffer.alloc(4); cb.writeUInt32BE(crc, 0);
  return Buffer.concat([len, td, cb]);
};
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "public", "assets", "stump-tile.png");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
