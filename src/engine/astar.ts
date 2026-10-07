/**
 * A* pathfinding on the TileMap grid.
 * 8-directional with corner-cutting prevention. Returns world-pixel waypoints.
 */
import { TileMap } from "./TileMap";
import { TILE } from "./data";
import { Vec2 } from "./types";

class BinaryHeap<T> {
  items: T[] = [];
  constructor(private score: (t: T) => number) {}
  get size() {
    return this.items.length;
  }
  push(t: T) {
    this.items.push(t);
    this.bubbleUp(this.items.length - 1);
  }
  pop(): T | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last !== undefined) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }
  private bubbleUp(i: number) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.score(this.items[i]) >= this.score(this.items[p])) break;
      [this.items[i], this.items[p]] = [this.items[p], this.items[i]];
      i = p;
    }
  }
  private bubbleDown(i: number) {
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let s = i;
      if (l < this.items.length && this.score(this.items[l]) < this.score(this.items[s])) s = l;
      if (r < this.items.length && this.score(this.items[r]) < this.score(this.items[s])) s = r;
      if (s === i) break;
      [this.items[i], this.items[s]] = [this.items[s], this.items[i]];
      i = s;
    }
  }
}

interface Node {
  x: number;
  y: number;
  f: number;
  g: number;
  parent: Node | null;
}

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/**
 * Find a path from world (sx,sy) to world (gx,gy).
 * If the goal tile is blocked, searches outward for the nearest passable tile.
 * Returns null when unreachable.
 */
export function findPath(map: TileMap, sx: number, sy: number, gx: number, gy: number): Vec2[] | null {
  let gtx = map.worldToTile(gx);
  let gty = map.worldToTile(gy);
  const stx = map.worldToTile(sx);
  const sty = map.worldToTile(sy);

  if (!map.inBounds(stx, sty)) return null;

  // Nudge goal to nearest passable tile (spiral search).
  // Nhớ goal gốc có bị kẹt không: nếu kẹt thì điểm cuối là TÂM Ô THOÁNG,
  // không phải tọa độ gốc (kẻo lính đòi bước vào nhà/cây/đá rồi kẹt mãi).
  const goalBlocked = !map.passable(gtx, gty);
  if (goalBlocked) {
    const found = nearestPassable(map, gtx, gty, 6);
    if (!found) return null;
    gtx = found.x;
    gty = found.y;
  }
  if (stx === gtx && sty === gty) return [];

  const W = map.w;
  const H = map.h;
  const gScore = new Float32Array(W * H).fill(Infinity);
  const closed = new Uint8Array(W * H);
  const open = new BinaryHeap<Node>((n) => n.f);

  const h = (x: number, y: number) => {
    const dx = Math.abs(x - gtx);
    const dy = Math.abs(y - gty);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };

  const start: Node = { x: stx, y: sty, f: h(stx, sty), g: 0, parent: null };
  open.push(start);
  gScore[sty * W + stx] = 0;

  let end: Node | null = null;
  let iterations = 0;

  while (open.size > 0 && iterations++ < 40000) {
    const cur = open.pop()!;
    const ci = cur.y * W + cur.x;
    if (closed[ci]) continue;
    closed[ci] = 1;
    if (cur.x === gtx && cur.y === gty) {
      end = cur;
      break;
    }
    for (const [dx, dy, cost] of DIRS) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!map.inBounds(nx, ny) || !map.passable(nx, ny)) continue;
      // no corner cutting on diagonals
      if (dx !== 0 && dy !== 0) {
        if (!map.passable(cur.x + dx, cur.y) || !map.passable(cur.x, cur.y + dy)) continue;
      }
      const ni = ny * W + nx;
      if (closed[ni]) continue;
      const ng = cur.g + cost;
      if (ng < gScore[ni]) {
        gScore[ni] = ng;
        open.push({ x: nx, y: ny, f: ng + h(nx, ny), g: ng, parent: cur });
      }
    }
  }

  if (!end) return null;

  // Reconstruct, then smooth: keep waypoints, drop the start tile.
  const tiles: { x: number; y: number }[] = [];
  let n: Node | null = end;
  while (n) {
    tiles.push({ x: n.x, y: n.y });
    n = n.parent;
  }
  tiles.reverse();

  const pts: Vec2[] = tiles.slice(1).map((t) => ({
    x: map.tileToWorldCenter(t.x),
    y: map.tileToWorldCenter(t.y),
  }));
  // Chỉ thêm điểm đích chính xác khi nó đi được.
  // Goal kẹt (trong nhà/cây/đá/nước) thì dừng ở tâm ô thoáng kề bên.
  if (!goalBlocked) pts.push({ x: gx, y: gy });
  return smoothPath(map, { x: sx, y: sy }, pts);
}

function nearestPassable(map: TileMap, tx: number, ty: number, radius: number) {
  for (let r = 1; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = tx + dx;
        const y = ty + dy;
        if (map.passable(x, y)) return { x, y };
      }
    }
  }
  return null;
}

/** Line-of-sight smoothing over tile centers. */
function smoothPath(map: TileMap, start: Vec2, pts: Vec2[]): Vec2[] {
  if (pts.length <= 1) return pts;
  const out: Vec2[] = [];
  let anchor = start;
  let i = 0;
  while (i < pts.length) {
    // find farthest point visible from anchor
    let j = pts.length - 1;
    while (j > i && !lineClear(map, anchor, pts[j])) j--;
    out.push(pts[j]);
    anchor = pts[j];
    i = j + 1;
  }
  return out;
}

function lineClear(map: TileMap, a: Vec2, b: Vec2): boolean {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.ceil(dist / (TILE / 2));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (!map.passable(map.worldToTile(x), map.worldToTile(y))) return false;
  }
  return true;
}
