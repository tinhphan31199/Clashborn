/**
 * Vẽ sprite ruộng lúa CHÍN VÀNG 64x64 ra public/assets/field-ripe.png.
 * Chạy 1 lần: node scripts/gen-field-sprite.mjs
 * Phong cách khớp tile cỏ/nước có sẵn: nền bùn + dải nước + hàng mạ.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const W = 64;
const H = 64;

// RNG deterministic để sprite ổn định giữa các lần gen.
let seed = 909090;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const px = Buffer.alloc(W * H * 4);
const set = (x, y, r, g, b, a = 255) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
};
const vary = (v, n) => Math.max(0, Math.min(255, Math.round(v + (rnd() - 0.5) * n)));

// 1. Nền bùn ruộng.
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    set(x, y, vary(150, 14), vary(112, 12), vary(58, 10));
  }
}
// 2. Dải nước bóng (ngang, mỗi 8px) — phản chiếu trời.
for (let y = 0; y < H; y++) {
  if (y % 8 === 5 || y % 8 === 6) {
    for (let x = 0; x < W; x++) {
      set(x, y, vary(168, 10), vary(140, 10), vary(84, 10));
    }
  }
}
// 3. Luống bờ (dọc mỗi 16px, sẫm hơn).
for (let x = 15; x < W; x += 16) {
  for (let y = 0; y < H; y++) {
    set(x, y, vary(104, 8), vary(78, 8), vary(40, 6));
    set(x + 1, y, vary(116, 8), vary(88, 8), vary(44, 6));
  }
}
// 4. Hàng mạ: cụm 2x3 xanh-vàng, lệch xen kẽ mỗi hàng.
for (let row = 2; row < H; row += 8) {
  const off = (row / 8) % 2 === 0 ? 2 : 6;
  for (let x = off; x < W; x += 8) {
    const jx = x + Math.floor(rnd() * 3) - 1;
    // thân lúa chín (vàng rơm)
    set(jx, row, vary(196, 10), vary(158, 12), vary(52, 10));
    set(jx + 1, row, vary(196, 10), vary(158, 12), vary(52, 10));
    set(jx, row + 1, vary(160, 10), vary(124, 12), vary(44, 10));
    set(jx + 1, row + 1, vary(160, 10), vary(124, 12), vary(44, 10));
    // bông lúa vàng rủ xuống
    set(jx - 1, row + 2, vary(232, 10), vary(190, 10), vary(70, 10));
    set(jx, row + 2, vary(240, 10), vary(202, 10), vary(80, 10));
    set(jx + 1, row + 2, vary(232, 10), vary(190, 10), vary(70, 10));
    set(jx, row + 3, vary(214, 10), vary(172, 10), vary(60, 10));
    // đọt sáng
    set(jx, row - 1, vary(246, 10), vary(214, 10), vary(110, 10));
  }
}
// 5. Lấm tấm nhiễu cho đỡ phẳng.
for (let n = 0; n < 260; n++) {
  const x = Math.floor(rnd() * W);
  const y = Math.floor(rnd() * H);
  const i = (y * W + x) * 4;
  px[i] = vary(px[i], 12); px[i + 1] = vary(px[i + 1], 12); px[i + 2] = vary(px[i + 2], 12);
}

// Encode PNG nhỏ gọn (color type 6 = RGBA).
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0; // filter None
  px.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  // CRC32
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
const out = join(here, "..", "public", "assets", "field-ripe.png");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
