/**
 * MovementSystem — follows A* waypoint paths + separation steering
 * so units don't stack on top of each other.
 * Production: separation uses the World spatial hash (O(k) neighbours),
 * patrol ping-pong, arrival drains into the unit's order queue via Game.
 */
import { UNIT_DEFS, TILE } from "../data";
import { findPath } from "../astar";
import { Entity } from "../types";
import { World } from "../World";
import { isParched } from "./economy";

export function movementTick(world: World, dt: number) {
  const units: Entity[] = [];
  for (const e of world.entities.values()) if (e.kind === "unit") units.push(e);

  for (const u of units) {
    if (u.path.length === 0) {
      // Patrol with no path (e.g. after combat interrupt): re-path to other end.
      if (u.state === "patrolling") {
        const tx = u.patrolToB ? u.patrolBx : u.patrolAx;
        const ty = u.patrolToB ? u.patrolBy : u.patrolAy;
        const p = findPath(world.map, u.x, u.y, tx, ty);
        if (p && p.length > 0) u.path = p;
        else {
          u.patrolToB = !u.patrolToB;
        }
      }
      continue;
    }
    const def = UNIT_DEFS[u.defId];
    const wp = u.path[0];
    const dx = wp.x - u.x;
    const dy = wp.y - u.y;
    const d = Math.hypot(dx, dy);
    // Khát nước: chậm 30%.
    const weakMul = isParched(world, u.player) ? 0.7 : 1;
    const step = def.speed * TILE * dt * weakMul;

    // Separation via spatial hash: only neighbours within ~48px.
    let sx = 0;
    let sy = 0;
    const neighbours = world.queryRadius(u.x, u.y, 48, { kind: "unit", excludeId: u.id });
    for (const o of neighbours) {
      const ox = u.x - o.x;
      const oy = u.y - o.y;
      const od = Math.hypot(ox, oy);
      const minD = def.radius + UNIT_DEFS[o.defId].radius + 3;
      if (od < minD && od > 0.01) {
        const push = (minD - od) / minD;
        sx += (ox / od) * push;
        sy += (oy / od) * push;
      }
    }

    if (d <= Math.max(step, 3)) {
      u.path.shift();
      if (u.path.length === 0) onArrive(world, u);
    } else {
      const nx = dx / d;
      const ny = dy / d;
      const px = u.x + nx * step + sx * 90 * dt;
      const py = u.y + ny * step + sy * 90 * dt;
      // Quy tắc sắt: không bao giờ bước vào ô có đồ vật (nước/rừng/đá/nhà).
      // Thử: cả đẩy separation → chỉ theo path → đứng yên chờ.
      if (world.map.passable(world.map.worldToTile(px), world.map.worldToTile(py))) {
        u.x = px;
        u.y = py;
      } else if (
        world.map.passable(world.map.worldToTile(u.x + nx * step), world.map.worldToTile(u.y + ny * step))
      ) {
        // Bỏ đẩy ngang, chỉ đi theo đường path.
        u.x += nx * step;
        u.y += ny * step;
      }
      // else: kẹt cứng giữa đám đông/vật cản → đứng yên, tick sau đường thoáng đi tiếp.
      u.facing = Math.atan2(ny, nx);
    }
  }
}

function onArrive(world: World, u: Entity) {
  switch (u.state) {
    case "moving":
      // Game.tick will pop the next queued order if any.
      if (u.orderQueue.length === 0 && !(u as unknown as { _nextOrder?: unknown })._nextOrder) {
        u.state = "idle";
      } else {
        u.state = "idle"; // sentinel: Game.resolveQueuedOrder picks it up
      }
      break;
    case "attackMoving":
      if (u.targetId == null) {
        u.state = u.orderQueue.length > 0 ? "idle" : "idle";
      }
      break;
    case "patrolling": {
      // Reached one end → head to the other.
      u.patrolToB = !u.patrolToB;
      const tx = u.patrolToB ? u.patrolBx : u.patrolAx;
      const ty = u.patrolToB ? u.patrolBy : u.patrolAy;
      const p = findPath(world.map, u.x, u.y, tx, ty);
      u.path = p ?? [];
      break;
    }
    default:
      // gathering/returning/repairing arrival handled by economyTick (path empty = act).
      break;
  }
}
