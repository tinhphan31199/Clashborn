/**
 * CritterSystem — thú rừng trung lập (phe -1): lợn rừng, cừu, gà.
 * Không ai đánh chúng, chúng cũng không đánh ai: chỉ đi lang thang trong
 * rừng và hoảng chạy khi lính (không phải worker) tới gần.
 */
import { TILE } from "../data";
import { findPath } from "../astar";
import { NEUTRAL } from "../types";
import { World } from "../World";

const WANDER_CHANCE = 0.02; // mỗi tick khi đang đứng yên
const SCARE_TILES = 3;
const WANDER_TILES = 4;

export function critterTick(world: World) {
  for (const e of world.entities.values()) {
    if (e.kind !== "unit" || e.player !== NEUTRAL) continue;

    // Hoảng: lính chiến tới gần → chạy ngược hướng.
    if (e.state === "idle" || e.state === "moving") {
      let sx = 0;
      let sy = 0;
      let found = false;
      for (const o of world.queryRadius(e.x, e.y, SCARE_TILES * TILE, { kind: "unit" })) {
        if ((o.player === 0 || o.player === 1) && o.defId !== "worker") {
          const d = Math.hypot(e.x - o.x, e.y - o.y) || 1;
          sx += (e.x - o.x) / d;
          sy += (e.y - o.y) / d;
          found = true;
        }
      }
      if (found) {
        const tx = e.x + (sx / Math.hypot(sx, sy)) * WANDER_TILES * TILE;
        const ty = e.y + (sy / Math.hypot(sx, sy)) * WANDER_TILES * TILE;
        const p = findPath(world.map, e.x, e.y, tx, ty);
        if (p && p.length > 0) {
          e.path = p;
          e.state = "moving";
          continue;
        }
      }
    }

    // Rảnh thì đi dạo loanh quanh trong rừng.
    if (e.state === "idle" && e.path.length === 0 && world.rand() < WANDER_CHANCE) {
      const tx = world.map.worldToTile(e.x) + Math.floor(world.rand() * 9) - 4;
      const ty = world.map.worldToTile(e.y) + Math.floor(world.rand() * 9) - 4;
      if (!world.map.inBounds(tx, ty) || !world.map.passable(tx, ty)) continue;
      const p = findPath(
        world.map, e.x, e.y,
        world.map.tileToWorldCenter(tx), world.map.tileToWorldCenter(ty)
      );
      if (p && p.length > 0) {
        e.path = p;
        e.state = "moving";
      }
    }
    if (e.state === "moving" && e.path.length === 0) e.state = "idle";
  }
}
