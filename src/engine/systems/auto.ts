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
import { commanderTick } from "./commander";
import { nearestDropoff } from "./economy";
import { issueOrder } from "./workOrders";
import { World } from "../World";
import { Entity } from "../types";

const REPATH = 1.0; // auto-brain suy nghĩ lại mỗi 1s (đỡ tốn pathfinding)

export function autoTick(world: World, dt: number) {
  for (const u of world.entities.values()) {
    if (u.kind !== "unit") continue;
    u.repathTimer -= dt;

    if (u.defId === "worker") {
      workerBrain(world, u, dt);
    }
  }
  // Quân chiến đấu do FieldCommander lái theo squad (thay armyBrain rời rạc).
  commanderTick(world, dt);
}

function workerBrain(world: World, u: Entity, dt: number) {
  void dt;
  // 1. Địch gần (6 tiles) → bỏ chạy về base. Worker không chiến đấu.
  const threat = world.nearestEnemy(u.x, u.y, u.player, 6 * TILE);
  if (threat && threat.defId !== "worker") {
    const base = world.baseOf(u.player);
    if (base) {
      if (u.repathTimer <= 0 || u.path.length === 0) {
        issueOrder(world, u, { kind: "fleeTo", x: base.x, y: base.y });
        u.repathTimer = REPATH;
      }
      return;
    }
  }
  // Thợ đang xây (repairing) do agent sở hữu — không giật đi việc khác.
  // (Chạy giặc ở trên vẫn được: móng thiếu thợ thì agent cử lại.)
  if (u.state === "repairing") return;
  // Chạy xong / spawn mới (moving mà hết path) → đứng yên để rolesTick + tripsTick lo.
  if (u.state === "moving" && u.path.length === 0) {
    u.state = "idle";
  }
  // Đang gánh dở mà rảnh (vừa chạy giặc xong / spawn mới) → về điểm nộp
  // gần nhất (có farm thì về farm, chưa có mới về base) nộp trước.
  // Đang gathering/seeking thì kệ — tripsTick cho gánh đầy CAP rồi mới về.
  // Ngoại lệ: worker lúa gánh NƯỚC đi tưới thì kệ (không phải hàng nộp kho).
  if (
    u.job !== "node" && u.carry > 0 && u.state !== "returning" &&
    !(u.job === "food" && u.carryType === "water") &&
    (u.state === "idle" || (u.state === "moving" && u.path.length === 0))
  ) {
    const drop = nearestDropoff(world, u.player, u.x, u.y) ?? world.baseOf(u.player);
    if (drop) {
      issueOrder(world, u, { kind: "returnTo", x: drop.x, y: drop.y });
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
  issueOrder(world, u, { kind: "seekNode", nodeId: node.id, x: node.x, y: node.y });
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
