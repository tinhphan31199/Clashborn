/**
 * TileMap — địa hình + tài nguyên theo tile.
 *
 *  0 = cỏ (đi được)
 *  1 = nước/hồ (không đi được — lấy nước ở ô bờ kề bên)
 *  2 = ore (giữ tương thích save cũ, không dùng)
 *  3 = rừng 🌲 (cấm đi, đốn gỗ, có trữ lượng)
 *  4 = đá 🪨 (cấm đi, khai thác, có trữ lượng)
 *  5 = ruộng 🌾 (cấm đi, gặt lúa — lúa tự mọc lại)
 *  6 = gốc cây (cấm đi, cây bị đốn sạch — 30s mọc lại thành cây)
 */
import { TILE } from "./data";

export const T_GRASS = 0;
export const T_WATER = 1;
export const T_ORE = 2;
export const T_WOOD = 3;
export const T_STONE = 4;
export const T_FIELD = 5;
export const T_STUMP = 6;
/** Gốc cây mọc lại thành cây sau từng này giây. */
export const STUMP_REGROW_TIME = 30;
/** Lúa đạt mức này mới CHÍN VÀNG, gặt được = 3 gáo nước (20/gáo). Ruộng mới khô rang. */
export const RICE_RIPE_AT = 60;
export const RICE_POUR = 20;

export class TileMap {
  w: number;
  h: number;
  /** terrain per tile */
  tiles: Uint8Array;
  /** ore amount per tile (only meaningful where tiles == T_ORE) */
  ore: Float32Array;
  /** trữ lượng gỗ / đá / lúa mỗi tile */
  wood: Float32Array;
  stone: Float32Array;
  rice: Float32Array;
  /** máu tối đa của cây (để vẽ HP bar) */
  woodMax: Float32Array;
  /** đếm ngược gốc cây mọc lại (chỉ nghĩa khi tiles == T_STUMP) */
  stumpTimer: Float32Array;
  /** blocked by buildings per tile */
  blocked: Uint8Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.tiles = new Uint8Array(w * h);
    this.ore = new Float32Array(w * h);
    this.wood = new Float32Array(w * h);
    this.stone = new Float32Array(w * h);
    this.rice = new Float32Array(w * h);
    this.woodMax = new Float32Array(w * h);
    this.stumpTimer = new Float32Array(w * h);
    this.blocked = new Uint8Array(w * h);
  }

  idx(tx: number, ty: number): number {
    return ty * this.w + tx;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }

  tileAt(tx: number, ty: number): number {
    if (!this.inBounds(tx, ty)) return T_WATER;
    return this.tiles[this.idx(tx, ty)];
  }

  /**
   * Quy tắc di chuyển: ô có đồ vật thì CẤM đi.
   * Cỏ đi được · nước/hồ, rừng, đá, nhà (blocked) đều không đi được.
   * Worker khai thác rừng/đá/nước bằng cách đứng ở ô cỏ kề bên.
   */
  passable(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return false;
    const i = this.idx(tx, ty);
    const t = this.tiles[i];
    return t !== T_WATER && t !== T_WOOD && t !== T_STONE && t !== T_FIELD && t !== T_STUMP && this.blocked[i] === 0;
  }

  worldToTile(wx: number): number {
    return Math.floor(wx / TILE);
  }

  tileToWorldCenter(t: number): number {
    return t * TILE + TILE / 2;
  }

  setBlockedRect(tx: number, ty: number, tw: number, th: number, v: number) {
    for (let y = ty; y < ty + th; y++)
      for (let x = tx; x < tx + tw; x++)
        if (this.inBounds(x, y)) this.blocked[this.idx(x, y)] = v;
  }

  /** Xóa tài nguyên/quanh điểm đặt base-node để không kẹt địa hình. */
  clearArea(cx: number, cy: number, r: number) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (!this.inBounds(x, y)) continue;
        const i = this.idx(x, y);
        if (this.tiles[i] !== T_WATER) this.tiles[i] = T_GRASS;
        this.wood[i] = 0;
        this.stone[i] = 0;
        this.rice[i] = 0;
        this.woodMax[i] = 0;
        this.stumpTimer[i] = 0;
      }
    }
  }

  isRectFree(tx: number, ty: number, tw: number, th: number): boolean {
    for (let y = ty; y < ty + th; y++) {
      for (let x = tx; x < tx + tw; x++) {
        if (!this.inBounds(x, y)) return false;
        const i = this.idx(x, y);
        const t = this.tiles[i];
        // Nhà chỉ đặt trên cỏ trống (không đè nước/rừng/đá).
        if (t !== T_GRASS || this.blocked[i] !== 0) return false;
      }
    }
    return true;
  }

  /** Rải rừng/đá đối xứng đã mirror ở ngoài — chỉ đặt khi ô còn cỏ. */
  scatterWood(rand: () => number, cx: number, cy: number, radius: number, amount: number) {
    for (let y = Math.floor(cy - radius); y <= cy + radius; y++) {
      for (let x = Math.floor(cx - radius); x <= cx + radius; x++) {
        if (!this.inBounds(x, y)) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d <= radius && rand() > d / (radius + 1) - 0.15) {
          const i = this.idx(x, y);
          if (this.tiles[i] === T_GRASS) {
            this.tiles[i] = T_WOOD;
            const full = amount * (0.7 + rand() * 0.6);
            this.wood[i] = full;
            this.woodMax[i] = full;
          }
        }
      }
    }
  }

  scatterStone(rand: () => number, cx: number, cy: number, radius: number, amount: number) {
    for (let y = Math.floor(cy - radius); y <= cy + radius; y++) {
      for (let x = Math.floor(cx - radius); x <= cx + radius; x++) {
        if (!this.inBounds(x, y)) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d <= radius && rand() > d / (radius + 1) - 0.15) {
          const i = this.idx(x, y);
          if (this.tiles[i] === T_GRASS) {
            this.tiles[i] = T_STONE;
            this.stone[i] = amount * (0.7 + rand() * 0.6);
          }
        }
      }
    }
  }

  /** Rải ruộng lúa (đối xứng đã mirror ở ngoài). Lúa tự mọc lại nên amount là trần. */
  scatterField(rand: () => number, cx: number, cy: number, radius: number, amount: number) {
    for (let y = Math.floor(cy - radius); y <= cy + radius; y++) {
      for (let x = Math.floor(cx - radius); x <= cx + radius; x++) {
        if (!this.inBounds(x, y)) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d <= radius && rand() > d / (radius + 1) - 0.15) {
          const i = this.idx(x, y);
          if (this.tiles[i] === T_GRASS) {
            this.tiles[i] = T_FIELD;
            this.rice[i] = 0; // ruộng mới khô — phải tưới mới có lúa
            void amount;
          }
        }
      }
    }
  }
  /** Giữ tương thích (không còn dùng ore). */
  scatterOre(
    rand: () => number,
    clusters: { cx: number; cy: number; radius: number; amount: number }[]
  ) {
    void rand;
    void clusters;
  }

  /** Nearest tile with ore amount > 0 to a world position. */
  nearestOre(wx: number, wy: number, maxTiles = 40): { tx: number; ty: number } | null {
    void wx;
    void wy;
    void maxTiles;
    return null;
  }

  /**
   * Chỗ đứng khai thác rừng/đá/ruộng: ô cỏ ĐI ĐƯỢC kề ô tài nguyên còn hàng gần nhất.
   * Trả về {ô đứng} + {ô tài nguyên}. Worker không bao giờ bước vào ô tài nguyên.
   * exclude: bỏ qua 1 ô tài nguyên (khi đường tới đó bị kẹt) để thử chỗ khác.
   */
  nearestHarvestStand(
    wx: number, wy: number, kind: number, maxTiles = 48,
    exclude?: { tx: number; ty: number }
  ): { tx: number; ty: number; rtx: number; rty: number } | null {
    const stx = this.worldToTile(wx);
    const sty = this.worldToTile(wy);
    const store = kind === T_WOOD ? this.wood : kind === T_STONE ? this.stone : this.rice;
    let best: { tx: number; ty: number; rtx: number; rty: number } | null = null;
    let bestD = maxTiles * maxTiles;
    for (let y = Math.max(0, sty - maxTiles); y <= Math.min(this.h - 1, sty + maxTiles); y++) {
      for (let x = Math.max(0, stx - maxTiles); x <= Math.min(this.w - 1, stx + maxTiles); x++) {
        const i = this.idx(x, y);
        if (this.tiles[i] !== kind) continue;
        if (exclude && x === exclude.tx && y === exclude.ty) continue;
        const left = store[i];
        if (left <= 0) continue;
        if (kind === T_FIELD && left < RICE_RIPE_AT) continue; // lúa xanh chưa gặt được
        // ô đứng: cỏ kề bên gần worker nhất
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const sx = x + dx;
            const sy = y + dy;
            if (!this.passable(sx, sy)) continue;
            const d = (sx - stx) * (sx - stx) + (sy - sty) * (sy - sty);
            if (d < bestD) {
              bestD = d;
              best = { tx: sx, ty: sy, rtx: x, rty: y };
            }
          }
        }
      }
    }
    return best;
  }
  /**
   * Ruộng đang khát (chưa đầy): ô đứng kề bên gần nhất để tới tưới.
   * Trả về {ô đứng} + {ô ruộng}.
   */
  nearestThirstyStand(
    wx: number, wy: number, maxTiles = 48
  ): { tx: number; ty: number; rtx: number; rty: number } | null {
    const stx = this.worldToTile(wx);
    const sty = this.worldToTile(wy);
    let best: { tx: number; ty: number; rtx: number; rty: number } | null = null;
    let bestD = maxTiles * maxTiles;
    for (let y = Math.max(0, sty - maxTiles); y <= Math.min(this.h - 1, sty + maxTiles); y++) {
      for (let x = Math.max(0, stx - maxTiles); x <= Math.min(this.w - 1, stx + maxTiles); x++) {
        const i = this.idx(x, y);
        if (this.tiles[i] !== T_FIELD) continue;
        if (this.rice[i] >= RICE_RIPE_AT) continue; // đầy/chín rồi, khỏi tưới
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const sx = x + dx;
            const sy = y + dy;
            if (!this.passable(sx, sy)) continue;
            const d = (sx - stx) * (sx - stx) + (sy - sty) * (sy - sty);
            if (d < bestD) {
              bestD = d;
              best = { tx: sx, ty: sy, rtx: x, rty: y };
            }
          }
        }
      }
    }
    return best;
  }

  nearestShore(wx: number, wy: number, maxTiles = 48): { tx: number; ty: number; wtx: number; wty: number } | null {    const stx = this.worldToTile(wx);
    const sty = this.worldToTile(wy);
    let best: { tx: number; ty: number; wtx: number; wty: number } | null = null;
    let bestD = maxTiles * maxTiles;
    for (let y = Math.max(0, sty - maxTiles); y <= Math.min(this.h - 1, sty + maxTiles); y++) {
      for (let x = Math.max(0, stx - maxTiles); x <= Math.min(this.w - 1, stx + maxTiles); x++) {
        if (this.tiles[this.idx(x, y)] !== T_WATER) continue;
        // tìm ô bờ đi được kề bên
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const sx = x + dx;
          const sy = y + dy;
          if (!this.passable(sx, sy)) continue;
          const d = (sx - stx) * (sx - stx) + (sy - sty) * (sy - sty);
          if (d < bestD) {
            bestD = d;
            best = { tx: sx, ty: sy, wtx: x, wty: y };
          }
          break; // 1 ô bờ là đủ cho mỗi ô nước
        }
      }
    }
    return best;
  }
}

/** Deterministic-ish RNG (mulberry32). Pass a seed for reproducible maps. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
