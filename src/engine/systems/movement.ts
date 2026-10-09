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

/**
 * Đồng hồ kẹt của từng lính (không serialize — chỉ là cảm nhận tạm thời).
 * Lính có path mà đứng yên: 3s tìm đường lại, 6s lách ra ô thoáng kề bên.
 */
const stuck = new WeakMap<Entity, { x: number; y: number; t: number; repathed: boolean }>();

function trackStuck(u: Entity, dt: number): { t: number; repathed: boolean } {
  const s = stuck.get(u);
  if (!s || Math.hypot(u.x - s.x, u.y - s.y) > 4) {
    const fresh = { x: u.x, y: u.y, t: 0, repathed: false };
    stuck.set(u, fresh);
    return fresh;
  }
  s.t += dt;
  return s;
}

function clearStuck(u: Entity) {
  stuck.delete(u);
}

export function movementTick(world: World, dt: number) {
  const units: Entity[] = [];
  for (const e of world.entities.values()) if (e.kind === "unit") units.push(e);

  for (const u of units) {
    if (u.path.length === 0) {
      clearStuck(u);
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
    // Bỏ waypoint thối: mục tiêu nằm trong ô vật cản (đường cũ từ trước khi
    // cây mọc/nhà xây). Bỏ hết mà rỗng thì coi như tới nơi.
    let guard = 0;
    while (u.path.length > 0 && guard++ < 8) {
      const w0 = u.path[0];
      if (world.map.passable(world.map.worldToTile(w0.x), world.map.worldToTile(w0.y))) break;
      u.path.shift();
    }
    if (u.path.length === 0) {
      clearStuck(u);
      onArrive(world, u);
      continue;
    }
    // Kẹt cứng (đứng yên mà vẫn còn path): 3s tìm đường lại, 6s lách ra.
    const st = trackStuck(u, dt);
    if (st.t > 6) {
      clearStuck(u);
      sidestep(world, u);
      continue;
    }
    if (st.t > 3 && !st.repathed) {
      st.repathed = true;
      const goal = u.path[u.path.length - 1];
      const p = findPath(world.map, u.x, u.y, goal.x, goal.y);
      if (p && p.length > 0) u.path = p;
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
      } else {
        // Trượt tường: tách bước theo trục (trục chính trước) để khỏi kẹt góc
        // khi path làm mượt cắt chéo qua mép vật cản.
        const xOk = world.map.passable(world.map.worldToTile(u.x + nx * step), world.map.worldToTile(u.y));
        const yOk = world.map.passable(world.map.worldToTile(u.x), world.map.worldToTile(u.y + ny * step));
        if (Math.abs(nx) >= Math.abs(ny)) {
          if (xOk) u.x += nx * step;
          else if (yOk) u.y += ny * step;
        } else {
          if (yOk) u.y += ny * step;
          else if (xOk) u.x += nx * step;
        }
      }
      u.facing = Math.atan2(ny, nx);
    }
  }
}

/**
 * Lách kẹt: bước sang ô thoáng kề bên (ưu tiên hướng về đích), giữ nguyên path.
 * Chỉ bước vào ô ĐI ĐƯỢC nên không bao giờ xuyên vật cản.
 */
function sidestep(world: World, u: Entity) {
  const tx = world.map.worldToTile(u.x);
  const ty = world.map.worldToTile(u.y);
  const goal = u.path[u.path.length - 1];
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  // Hướng về đích trước để không đi lùi.
  dirs.sort((a, b) => {
    const da = goal ? Math.hypot(tx + a[0] - world.map.worldToTile(goal.x), ty + a[1] - world.map.worldToTile(goal.y)) : 0;
    const db = goal ? Math.hypot(tx + b[0] - world.map.worldToTile(goal.x), ty + b[1] - world.map.worldToTile(goal.y)) : 0;
    return da - db;
  });
  for (const [dx, dy] of dirs) {
    if (!world.map.passable(tx + dx, ty + dy)) continue;
    u.x = world.map.tileToWorldCenter(tx + dx);
    u.y = world.map.tileToWorldCenter(ty + dy);
    return;
  }
  // Bốn bề toàn vật cản (hiếm): bỏ path, brain tick sau cử lại.
  u.path = [];
  onArrive(world, u);
}

function onArrive(world: World, u: Entity) {  switch (u.state) {
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
