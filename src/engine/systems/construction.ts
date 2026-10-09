/**
 * ConstructionSystem — BỘ MÁY THI HÀNH xây dựng (không quyết gì cả).
 *
 * Mọi quyết định xây (xây gì / khi nào / ở đâu / ai xây) là của AGENT
 * (overseer: luật chuỗi nhà→farm + chọn đất qua placement + lệnh build).
 * Ở đây chỉ có:
 *  - startSite: cắm móng theo lệnh (trừ tiền, đặt nhà, châm lửa).
 *  - driveSite: thợ đứng cạnh thì đẩy tiến độ 15s → xong.
 *  - completeSite: khánh thành (nhà tặng 2 nông dân + nối chuỗi farm).
 */
import { BUILDING_DEFS, BUILD_RATE, BUILD_TIME, MAX_BUILDERS_PER_SITE, TILE } from "../data";
import { Entity, PlayerId } from "../types";
import { World } from "../World";
import { chooseSite } from "./placement";
import { issueOrder } from "./workOrders";

/** Công trình đã xong của phe này (nhà/mỏ/base...). */
export function finishedBuildings(world: World, player: PlayerId, defId: string): Entity[] {
  const out: Entity[] = [];
  for (const e of world.entities.values()) {
    if (e.kind === "building" && e.defId === defId && e.player === player && !e.underConstruction) {
      out.push(e);
    }
  }
  return out;
}

/** Có móng loại này đang xây dở không (tránh khởi công trùng). */
function underConstruction(world: World, player: PlayerId, defId: string): boolean {
  for (const e of world.entities.values()) {
    if (e.kind === "building" && e.defId === defId && e.player === player && e.underConstruction) {
      return true;
    }
  }
  return false;
}

export function constructionTick(world: World, dt: number) {
  for (const pl of world.players) {
    if (!pl.alive) continue;
    // Chỉ đẩy tiến độ các móng đang xây — khởi công là việc của agent.
    for (const e of world.entities.values()) {
      if (e.kind !== "building" || e.player !== pl.id || !e.underConstruction) continue;
      if (!BUILDABLE.has(e.defId)) continue;
      driveSite(world, e, dt);
    }
  }
}

/** Các defId xây được (móng cần thợ, agent khởi công). */
export const BUILDABLE = new Set(["house", "farm", "tower", "market", "well"]);

/** Móng xây dở của phe này (để agent giữ nhịp 1 công trình/lần). */
export function unfinishedSites(world: World, player: PlayerId): Entity[] {
  const out: Entity[] = [];
  for (const e of world.entities.values()) {
    if (e.kind !== "building" || e.player !== player || !e.underConstruction) continue;
    if (!BUILDABLE.has(e.defId)) continue;
    out.push(e);
  }
  return out;
}

/** Thợ đang xây móng này (repairing + ngắm đúng móng). Tối đa MAX_BUILDERS_PER_SITE. */
export function buildersOf(world: World, site: Entity): Entity[] {
  const out: Entity[] = [];
  for (const u of world.unitsOf(site.player)) {
    if (u.defId === "worker" && u.state === "repairing" && u.targetId === site.id) out.push(u);
  }
  return out;
}

/** Các móng của phe này đang thiếu thợ — agent cử tới cho đủ tốp. */
export function sitesNeedingBuilders(world: World, player: PlayerId): Entity[] {
  const out: Entity[] = [];
  for (const e of world.entities.values()) {
    if (e.kind !== "building" || e.player !== player || !e.underConstruction) continue;
    if (!BUILDABLE.has(e.defId)) continue;
    if (buildersOf(world, e).length >= MAX_BUILDERS_PER_SITE) continue;
    out.push(e);
  }
  return out;
}

/**
 * Khởi công 1 móng tại ô CHỈ ĐỊNH (agent đã chọn đất qua placement).
 * Trừ tiền, cắm nhà, châm lửa. Trả null khi thiếu tiền/đất/đặt hụt —
 * tiền đã trừ được hoàn lại.
 */
export function startSite(
  world: World, player: PlayerId, defId: string, tx: number, ty: number
): Entity | null {
  const pl = world.player(player);
  const def = BUILDING_DEFS[defId];
  if (pl.wood < (def.wood ?? 0) || (pl.stone ?? 0) < (def.stone ?? 0)) return null;
  if (!world.map.isRectFree(tx, ty, def.w, def.h)) return null;

  pl.wood -= def.wood ?? 0;
  pl.stone -= def.stone ?? 0;
  const e = world.spawnBuilding(defId, player, tx, ty);
  if (!e) {
    // Đặt hụt (hiếm) → trả tiền lại.
    pl.wood += def.wood ?? 0;
    pl.stone += def.stone ?? 0;
    return null;
  }
  e.underConstruction = true;
  e.buildProgress = 0;
  e.hp = Math.max(10, Math.floor(e.maxHp * 0.1)); // móng yếu, dễ bị phá
  world.addEffect({
    kind: "spark", x1: e.x, y1: e.y, x2: e.x, y2: e.y,
    ttl: 0.8, maxTtl: 0.8, color: "#fbbf24",
  });
  return e;
}

function driveSite(world: World, site: Entity, dt: number) {
  const builders = buildersOf(world, site);
  if (builders.length === 0) return; // chưa có thợ — agent (overseer) cử tới ở nhịp sau

  // Địch tới gần thợ nào thì thợ đó bỏ chạy, còn lại xây tiếp.
  // Agent cử bù khi an toàn.
  const hw = (site.tw * TILE) / 2;
  const hh = (site.th * TILE) / 2;
  let arrived = 0;
  for (const b of builders) {
    if (world.nearestEnemy(b.x, b.y, b.player, 4 * TILE)) {
      issueOrder(world, b, { kind: "release" });
      continue;
    }
    // Tới nơi = đứng sát mép móng (tính từ mép, không tính từ tâm —
    // móng 3x3 đứng góc chéo vẫn tới). Chưa tới mà hết đường thì đi lại
    // (có cooldown kẻo spam A* mỗi tick khi chỗ đứng không tới được).
    const dx = Math.max(Math.abs(b.x - site.x) - hw, 0);
    const dy = Math.max(Math.abs(b.y - site.y) - hh, 0);
    if (Math.hypot(dx, dy) > 1.2 * TILE) {
      b.repathTimer -= dt;
      if (b.path.length === 0 && b.repathTimer <= 0) {
        b.repathTimer = 2;
        issueOrder(world, b, { kind: "build", siteId: site.id });
      }
      continue;
    }
    arrived++;
  }
  if (arrived === 0) return; // thợ đang đi tới / vừa bỏ chạy hết
  // Càng đông thợ càng nhanh (diminishing): 1 thợ 15s · 2 thợ ~9s · 3 thợ ~7s.
  const rate = BUILD_RATE[Math.min(arrived, MAX_BUILDERS_PER_SITE)] ?? 1;
  const before = site.buildProgress;
  site.buildProgress += (dt * rate) / BUILD_TIME;
  if (Math.floor(site.buildProgress * 15) !== Math.floor(before * 15)) {
    world.addEffect({
      kind: "spark", x1: site.x, y1: site.y, x2: site.x, y2: site.y,
      ttl: 0.3, maxTtl: 0.3, color: "#fdba74",
    });
  }
  if (site.buildProgress >= 1) completeSite(world, site, builders);
}

function completeSite(world: World, site: Entity, builders: Entity[]) {
  site.underConstruction = false;
  site.buildProgress = 1;
  site.hp = site.maxHp;
  for (const b of builders) {
    if (world.get(b.id) === b) issueOrder(world, b, { kind: "release" });
  }
  // Nhà xong: +2 nông dân miễn phí dọn vào ở (spawn quanh nhà mới,
  // greetNewborn chia việc theo lệnh mới nhất của agent).
  if (site.defId === "house") {
    for (let i = 0; i < 2; i++) {
      const s = world.findSpawnNear(site.x + (i === 0 ? -TILE : TILE), site.y);
      const u = world.spawnUnit("worker", site.player, s.x, s.y);
      void u;
      world.addEffect({
        kind: "spark", x1: u.x, y1: u.y, x2: u.x, y2: u.y,
        ttl: 0.6, maxTtl: 0.6, color: "#7CFC00",
      });
    }
    // CHUỖI: thợ vừa xây nhà xong đi xây farm tiếp (khỏi chờ nhịp sau).
    // Đất do agent chọn (placement) — chưa đủ tiền/đất thì agent lo ở nhịp sau.
    const farmsTotal =
      finishedBuildings(world, site.player, "farm").length +
      (underConstruction(world, site.player, "farm") ? 1 : 0);
    if (farmsTotal === 0) {
      const spot = chooseSite(world, site.player, "farm");
      const farm = spot ? startSite(world, site.player, "farm", spot.tx, spot.ty) : null;
      const first = builders.find((b) => world.get(b.id) === b && b.carry === 0);
      if (farm && first) {
        issueOrder(world, first, { kind: "build", siteId: farm.id });
      }
    }
  }
  world.recomputeSupply(); // nhà xong → cap tăng ngay
  world.addEffect({
    kind: "spark", x1: site.x, y1: site.y, x2: site.x, y2: site.y,
    ttl: 0.8, maxTtl: 0.8, color: "#7CFC00",
  });
}
