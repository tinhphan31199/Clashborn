/**
 * TileMap — địa hình + tài nguyên theo tile.
 *
 *  0 = cỏ (đi được)
 *  1 = nước/hồ (không đi được — lấy nước ở ô bờ kề bên)
 *  2 = ore (giữ tương thích save cũ, không dùng)
 *  3 = rừng 🌲 (đi được, đốn gỗ, có trữ lượng)
 *  4 = đá 🪨 (đi được, khai thác, có trữ lượng)
 */
import { TILE } from "./data";

export const T_GRASS = 0;
export const T_WATER = 1;
export const T_ORE = 2;
export const T_WOOD = 3;
export const T_STONE = 4;

export class TileMap {
  w: number;
  h: number;
  /** terrain per tile */
  tiles: Uint8Array;
  /** ore amount per tile (only meaningful where tiles == T_ORE) */
  ore: Float32Array;
  /** trữ lượng gỗ / đá mỗi tile */
  wood: Float32Array;
  stone: Float32Array;
  /** blocked by buildings per tile */
  blocked: Uint8Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.tiles = new Uint8Array(w * h);
    this.ore = new Float32Array(w * h);
    this.wood = new Float32Array(w * h);
    this.stone = new Float32Array(w * h);
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

  passable(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return false;
    const i = this.idx(tx, ty);
    return this.tiles[i] !== T_WATER && this.blocked[i] === 0;
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
      }
    }
  }

  isRectFree(tx: number, ty: number, tw: number, th: number): boolean {
    for (let y = ty; y < ty + th; y++) {
      for (let x = tx; x < tx + tw; x++) {
        if (!this.inBounds(x, y)) return false;
        const i = this.idx(x, y);
        if (this.tiles[i] === T_WATER || this.blocked[i] !== 0) return false;
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
            this.wood[i] = amount * (0.7 + rand() * 0.6);
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

  /** Ô rừng/đá gần nhất còn trữ lượng (tile đơn vị). */
  nearestHarvest(
    wx: number, wy: number, kind: number, maxTiles = 48
  ): { tx: number; ty: number } | null {
    const stx = this.worldToTile(wx);
    const sty = this.worldToTile(wy);
    let best: { tx: number; ty: number } | null = null;
    let bestD = maxTiles * maxTiles;
    for (let y = Math.max(0, sty - maxTiles); y <= Math.min(this.h - 1, sty + maxTiles); y++) {
      for (let x = Math.max(0, stx - maxTiles); x <= Math.min(this.w - 1, stx + maxTiles); x++) {
        const i = this.idx(x, y);
        if (this.tiles[i] !== kind) continue;
        const left = kind === T_WOOD ? this.wood[i] : this.stone[i];
        if (left <= 0) continue;
        const d = (x - stx) * (x - stx) + (y - sty) * (y - sty);
        if (d < bestD) {
          bestD = d;
          best = { tx: x, ty: y };
        }
      }
    }
    return best;
  }

  /**
   * Chỗ đứng lấy nước: ô đi được kề hồ gần nhất.
   * Trả về {ô đứng} + {ô nước mục tiêu}.
   */
  nearestShore(wx: number, wy: number, maxTiles = 48): { tx: number; ty: number; wtx: number; wty: number } | null {
    const stx = this.worldToTile(wx);
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
