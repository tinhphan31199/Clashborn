/**
 * Vẽ sprite cây táo 64x64 (pixel-art, nền trong suốt) ra public/assets/apple-tree.png.
 * Chạy 1 lần: node scripts/gen-apple-sprite.mjs
 * Tán lá tròn + táo đỏ + thân nâu — cùng họ với tree.png có sẵn.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const W = 64;
const H = 64;

let seed = 31337;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const px = Buffer.alloc(W * H * 4);
const set = (x, y, r, g, b, a = 255) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
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

// 1. Bóng đổ.
disc(32, 56, 18, (x, y) => set(x, y, 0, 0, 0, 40));
// 2. Thân nâu (hơi nghiêng).
for (let y = 34; y <= 56; y++) {
  const cx = 32 + Math.round((y - 34) * 0.15);
  for (let x = cx - 3; x <= cx + 3; x++) {
    const edge = Math.abs(x - cx) / 3;
    if (edge > 0.8) set(x, y, vary(70, 8), vary(48, 6), vary(28, 5));
    else if (x < cx) set(x, y, vary(140, 10), vary(98, 8), vary(54, 6));
    else set(x, y, vary(106, 10), vary(72, 8), vary(40, 6));
  }
}
// 3. Tán lá 3 lớp (ngoài sẫm → trong sáng).
disc(32, 24, 21, (x, y) => set(x, y, vary(44, 10), vary(102, 12), vary(40, 10)));
disc(30, 21, 15, (x, y) => set(x, y, vary(58, 10), vary(132, 12), vary(50, 10)));
disc(28, 18, 9, (x, y) => set(x, y, vary(88, 10), vary(168, 12), vary(66, 10)));
// 4. Táo đỏ (~14 quả, né viền tán).
let placed = 0;
let guard = 0;
while (placed < 14 && guard++ < 200) {
  const x = 14 + Math.floor(rnd() * 36);
  const y = 8 + Math.floor(rnd() * 30);
  if (Math.hypot(x - 32, y - 24) > 18) continue;
  set(x, y, vary(214, 12), vary(48, 10), vary(48, 10));
  set(x + 1, y, vary(196, 12), vary(42, 10), vary(42, 10));
  set(x, y + 1, vary(178, 12), vary(40, 10), vary(40, 10));
  set(x, y - 1, vary(246, 12), vary(150, 12), vary(150, 12)); // điểm sáng
  placed++;
}
// 5. Cỏ dưới gốc.
for (let n = 0; n < 20; n++) {
  const x = 12 + Math.floor(rnd() * 40);
  const y = 52 + Math.floor(rnd() * 10);
  const h = 2 + Math.floor(rnd() * 3);
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
const out = join(here, "..", "public", "assets", "apple-tree.png");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
