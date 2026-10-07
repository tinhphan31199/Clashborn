/**
 * AutoBrain — "vị tướng đứng sau": người chơi không micro từng lính.
 * Hệ thống này chạy mỗi tick và ra lệnh cho MỌI unit:
 *
 *  Worker:  địch gần → bỏ chạy về base | không thì đi chiếm mỏ tốt nhất
 *  Soldier: tiến ra giữa → săn Worker địch → push base địch
 *  Archer:  đi sau soldier, bắn theo ưu tiên Tank > Soldier > Worker
 *  Tank:    đi đầu làm khiên, ủi thẳng
 *
 * Quân mới spawn tự ra mặt trận (không có điểm tập kết).
 */
import { BUILDING_DEFS, TILE } from "../data";
import { findPath } from "../astar";
import { World } from "../World";
import { Entity } from "../types";

const REPATH = 1.0; // auto-brain suy nghĩ lại mỗi 1s (đỡ tốn pathfinding)

export function autoTick(world: World, dt: number) {
  const center = { x: (world.map.w * TILE) / 2, y: (world.map.h * TILE) / 2 };
  for (const u of world.entities.values()) {
    if (u.kind !== "unit") continue;
    u.repathTimer -= dt;

    if (u.defId === "worker") {
      workerBrain(world, u, dt);
    } else {
      armyBrain(world, u, dt, center);
    }
  }
}

function workerBrain(world: World, u: Entity, dt: number) {
  void dt;
  // 1. Địch gần (6 tiles) → bỏ chạy về base. Worker không chiến đấu.
  const threat = world.nearestEnemy(u.x, u.y, u.player, 6 * TILE);
  if (threat && threat.defId !== "worker") {
    const base = world.baseOf(u.player);
    if (base) {
      if (u.repathTimer <= 0 || u.path.length === 0) {
        const p = findPath(world.map, u.x, u.y, base.x, base.y);
        u.path = p ?? [];
        u.state = "moving";
        u.targetId = null;
        u.repathTimer = REPATH;
      }
      return;
    }
  }
  // Chạy xong / spawn mới (moving mà hết path) → đứng yên để rolesTick + tripsTick lo.
  if (u.state === "moving" && u.path.length === 0) {
    u.state = "idle";
  }
  // Đang gánh dở mà rảnh (vừa chạy giặc xong / spawn mới) → về base nộp trước.
  // Đang gathering/seeking thì kệ — tripsTick cho gánh đầy CAP rồi mới về.
  if (
    u.job !== "node" && u.carry > 0 && u.state !== "returning" &&
    (u.state === "idle" || (u.state === "moving" && u.path.length === 0))
  ) {
    const base = world.baseOf(u.player);
    u.state = "returning";
    if (base) {
      const p = findPath(world.map, u.x, u.y, base.x, base.y);
      u.path = p ?? [];
    }
    return;
  }
  if (u.job !== "node") return; // chuyến gánh do tripsTick trong economy lái
  // 2. (job node) Đang giữ mỏ → ở yên (income xử lý ở economy).
  if (u.state === "gathering") {
    const node = world.get(u.targetId);
    if (node && node.kind === "building") {
      const d = Math.hypot(node.x - u.x, node.y - u.y);
      if (d < TILE * 4) return; // vẫn đang chiếm tốt
    }
  }
  // 3. Tìm mỏ tốt nhất: ưu tiên mỏ chưa bị địch chiếm, gần, income cao.
  if (u.repathTimer > 0 && u.path.length > 0) return;
  const node = bestNodeFor(world, u);
  if (!node) {
    u.state = "idle";
    u.path = [];
    return;
  }
  const p = findPath(world.map, u.x, u.y, node.x, node.y);
  u.path = p ?? [];
  u.state = "seekingResource";
  u.targetId = node.id;
  u.repathTimer = REPATH * 2;
}

/** Chọn mỏ: điểm = income - phạt khoảng cách - phạt nếu địch đông + xu hướng focus. */
function bestNodeFor(world: World, u: Entity) {
  const focus = world.player(u.player).focus;
  const defAtk = world.player(u.player).defAtk;
  let best: Entity | null = null;
  let bestScore = -Infinity;
  for (const n of world.nodes()) {
    const def = BUILDING_DEFS[n.defId];
    if (!def) continue;
    const d = Math.hypot(n.x - u.x, n.y - u.y) / TILE;
    const enemyWorkers = world
      .queryRadius(n.x, n.y, def.captureRadius * TILE, { kind: "unit" })
      .filter((e) => e.player !== u.player && e.player >= 0).length;
    const friendly = world
      .queryRadius(n.x, n.y, def.captureRadius * TILE, { kind: "unit", player: u.player }).length;
    if (friendly >= 3) continue; // mỏ này đủ người rồi
    const ownedBonus = n.player === u.player ? 2 : n.player < 0 ? 1 : -3;
    // B3: trọng tâm tài nguyên. Thủ (defAtk thấp) sợ trung tâm.
    const isNear = n.defId === "node_near";
    const isMid = n.defId === "node_mid";
    const isCenter = n.defId === "node_center";
    let focusBonus = 0;
    if (focus === "near") focusBonus = isNear ? 8 : isMid ? 0 : -4;
    else if (focus === "mid") focusBonus = isMid ? 8 : 2;
    else if (focus === "center") focusBonus = isCenter ? 10 : isMid ? 3 : -2;
    if (defAtk < 0.3 && isCenter) focusBonus -= 6;
    // Map 96 rộng: phạt khoảng cách nhẹ hơn, thu nhập nặng hơn.
    // Trung tâm giàu nhưng tử địa — trừ khi tướng chỉ đích danh.
    let greedBonus = 0;
    if (isCenter && focus !== "center") greedBonus -= 12;
    const score =
      def.income * 2.5 - d * 0.4 - enemyWorkers * 6 + ownedBonus + focusBonus + greedBonus + world.rand() * 2;
    if (score > bestScore) {
      bestScore = score;
      best = n;
    }
  }
  return best;
}

function armyBrain(
  world: World, u: Entity, dt: number, center: { x: number; y: number }
) {
  void dt;
  // Đang đánh → combat system lo. Brain chỉ lo khi rảnh.
  if (u.state === "attacking") return;
  // Vừa spawn (idle tại base) → brain dưới tự đưa ra mặt trận.
  const pl = world.players.find((p) => p.id === u.player);
  const enemyBase = world.baseOf(u.player === 0 ? 1 : 0);

  // Có địch trong sight → để combatTick nhặt (ưu tiên theo loại lính).
  const sightPx = 7 * TILE;
  const seen = world.priorityEnemy(u, sightPx);
  if (seen) return; // combatTick sẽ chuyển sang attacking

  if (u.repathTimer > 0 && u.path.length > 0) return;

  // B2: slider Thủ↔Công đổi cách đánh.
  // defAtk cao → push sớm với ít quân; thấp → ôm tuyến thủ gần nhà.
  const defAtk = pl ? pl.defAtk : 0.5;
  const pushSize = Math.round(6 - defAtk * 4); // 6 (thủ) … 2 (công)
  const pushTime = 200 - defAtk * 140; // 200s … 60s

  // Tank đi đầu: tiến thẳng; Archer đi sau: tiến chậm hơn (giữ khoảng cách).
  // Quân spawn ra đi thẳng mặt trận, không qua điểm tập kết.
  let dest = center;
  if (pl) {
    const base = world.baseOf(u.player);
    if (defAtk < 0.3 && base) {
      // Thủ: giữ tuyến phòng ngự giữa base và trung tâm (trừ khi quân áp đảo).
      const armySize = world.unitsOf(u.player).filter((a) => a.defId !== "worker").length;
      if (armySize < 10) {
        dest = {
          x: base.x + (center.x - base.x) * 0.35,
          y: base.y + (center.y - base.y) * 0.35,
        };
      } else if (enemyBase) {
        dest = { x: enemyBase.x, y: enemyBase.y };
      }
    } else if (enemyBase) {
      // Đã qua giữa map (sang nửa địch) hoặc quân đông / trận lâu → push base.
      // Tránh kẹt lanh quanh tâm do separation jitter.
      const pastMid =
        u.player === 0
          ? u.x + u.y > center.x + center.y + TILE * 2
          : u.x + u.y < center.x + center.y - TILE * 2;
      const armySize = world.unitsOf(u.player).filter((a) => a.defId !== "worker").length;
      const push = pastMid || armySize >= pushSize || world.time > pushTime;
      dest = push ? { x: enemyBase.x, y: enemyBase.y } : center;
    }
  }
  // Offset đội hình: tank trước, archer sau, soldier giữa.
  const lane = (u.id % 5 - 2) * TILE * 1.2;
  let p = findPath(world.map, u.x, u.y, dest.x + lane, dest.y);
  if (!p || p.length === 0) {
    // Đã tới nơi (đứng ngay tâm) → push thẳng base địch, không đứng chơi.
    if (enemyBase && (dest.x !== enemyBase.x || dest.y !== enemyBase.y)) {
      p = findPath(world.map, u.x, u.y, enemyBase.x, enemyBase.y);
    }
  }
  if (p && p.length > 0) {
    u.path = p;
    u.state = "attackMoving";
  } else if (enemyBase) {
    // Kẹt đường thì đánh bộ sang hướng địch (separation sẽ đẩy dần).
    u.state = "attackMoving";
    u.repathTimer = REPATH;
  }
  u.repathTimer = REPATH;
}
