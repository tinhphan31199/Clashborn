/**
 * WorkOrders — CỔNG LỆNH duy nhất cho worker (chuẩn engine).
 *
 * Luật sở hữu:
 *  - Agent (overseer) + rolesTick + workerBrain chỉ được RA LỆNH qua
 *    issueOrder() — cấm tự set state/path/targetId của worker lẻ tẻ.
 *  - Systems (construction/economy/movement/combat) THI HÀNH state hiện tại,
 *    không giật worker đang bận việc của nhau (repairing do agent sở hữu).
 *
 *  build    → tới đứng cạnh móng và xây (repairing). false khi hết chỗ đứng.
 *  takeJob  → đổi vai (job), đứng chờ phân công (idle, xóa path/target).
 *  fleeTo   → bỏ chạy về điểm hẹn (moving).
 *  returnTo → gánh hàng về điểm nộp (returning).
 *  seekTile → tới ô tài nguyên (seekingResource + target tile).
 *  seekNode → tới mỏ vàng (seekingResource + targetId).
 *  release  → xong việc, về idle tay trắng chờ lệnh mới.
 */
import { findPath } from "../astar";
import { Entity, WorkerJob } from "../types";
import { World } from "../World";

export type WorkOrder =
  | { kind: "build"; siteId: number }
  | { kind: "takeJob"; job: WorkerJob }
  | { kind: "fleeTo"; x: number; y: number }
  | { kind: "returnTo"; x: number; y: number }
  | { kind: "seekTile"; x: number; y: number; tx: number; ty: number }
  | { kind: "seekNode"; nodeId: number; x: number; y: number }
  | { kind: "release" };

/**
 * Bản năng worker cấu hình sẵn: lính mới sinh khi agent chưa có lệnh nào
 * (đầu game, plan hết hạn...) thì nhận vai này rồi hành xử như worker
 * thường (trốn địch, giữ mỏ/gánh theo vai).
 */
export const WORKER_INSTINCT: { job: WorkerJob } = { job: "node" };

export function issueOrder(world: World, u: Entity, order: WorkOrder): boolean {
  switch (order.kind) {
    case "build": {
      const site = world.get(order.siteId);
      if (!site || site.kind !== "building" || !site.underConstruction) return false;
      const stand = standNearSite(world, u, site);
      if (!stand) return false;
      u.state = "repairing";
      u.targetId = site.id;
      u.path = findPath(world.map, u.x, u.y, stand.x, stand.y) ?? [];
      return true;
    }
    case "takeJob": {
      u.job = order.job;
      u.state = "idle";
      u.path = [];
      u.targetId = null;
      return true;
    }
    case "fleeTo": {
      u.state = "moving";
      u.targetId = null;
      u.path = findPath(world.map, u.x, u.y, order.x, order.y) ?? [];
      return true;
    }
    case "returnTo": {
      u.state = "returning";
      u.path = findPath(world.map, u.x, u.y, order.x, order.y) ?? [];
      return true;
    }
    case "seekTile": {
      u.state = "seekingResource";
      u.targetX = order.tx;
      u.targetY = order.ty;
      u.path = findPath(world.map, u.x, u.y, order.x, order.y) ?? [];
      return true;
    }
    case "seekNode": {
      u.state = "seekingResource";
      u.targetId = order.nodeId;
      u.path = findPath(world.map, u.x, u.y, order.x, order.y) ?? [];
      return true;
    }
    case "release": {
      u.state = "idle";
      u.path = [];
      u.targetId = null;
      return true;
    }
  }
}

/** Ô cỏ kề công trình gần thợ nhất (điểm đứng xây). */
function standNearSite(world: World, u: Entity, site: Entity): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let ty = site.ty - 1; ty <= site.ty + site.th; ty++) {
    for (let tx = site.tx - 1; tx <= site.tx + site.tw; tx++) {
      const edge = tx === site.tx - 1 || tx === site.tx + site.tw || ty === site.ty - 1 || ty === site.ty + site.th;
      if (!edge) continue;
      if (!world.map.inBounds(tx, ty) || !world.map.passable(tx, ty)) continue;
      const cx = world.map.tileToWorldCenter(tx);
      const cy = world.map.tileToWorldCenter(ty);
      const d = Math.hypot(cx - u.x, cy - u.y);
      if (d < bestD) {
        bestD = d;
        best = { x: cx, y: cy };
      }
    }
  }
  return best;
}
