/**
 * ConstructionSystem — CHUỖI BẮT BUỘC: nhà ở trước, farm sau.
 *
 *  1. Nhà (50 gỗ): BẮT BUỘC đầu tiên — đủ gỗ là khởi công ngay, không chờ.
 *     Base chỉ nuôi 6 dân, mỗi nhà +7 (tối đa 2 → 20). Xong nhà tặng 2 nông dân.
 *  2. Farm (100 gỗ + 25 đá): chỉ xây khi đã có nhà. Có farm rồi thì mọi tài
 *     nguyên CHỈ nộp vào farm (mất farm mới về base). Nộp tại farm +25%.
 *
 * Móng (underConstruction) yếu, cần thợ đứng cạnh xây 15s. Thợ chết/bỏ chạy
 * thì tick sau cử thợ khác — load save cũng tự cử lại nên không cần serialize.
 */
import { BUILDING_DEFS, BUILD_TIME, FARM_WOOD_STOCK, MAX_FARMS, MAX_HOUSES, TILE } from "../data";
import { findPath } from "../astar";
import { Entity, PlayerId } from "../types";
import { World } from "../World";

/** Thợ đang xây móng nào (không serialize — load xong tự cử lại). */
const builders = new Map<number, number>();

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
  // Dọn thợ của móng đã mất (bị phá).
  for (const siteId of [...builders.keys()]) {
    const s = world.get(siteId);
    if (!s || s.kind !== "building" || !s.underConstruction) builders.delete(siteId);
  }
  for (const pl of world.players) {
    if (!pl.alive) continue;
    // A. đẩy tiến độ các móng đang xây
    let working = 0;
    for (const e of world.entities.values()) {
      if (e.kind !== "building" || e.player !== pl.id || !e.underConstruction) continue;
      if (e.defId !== "house" && e.defId !== "farm") continue;
      working++;
      driveSite(world, e, dt);
    }
    // B. khởi công mới (1 công trình/lần)
    if (working === 0) maybeStart(world, pl.id);
  }
}

function maybeStart(world: World, player: PlayerId) {
  const pl = world.player(player);
  const houses = finishedBuildings(world, player, "house").length;
  const farms = finishedBuildings(world, player, "farm").length;
  const base = world.baseOf(player);
  if (!base) return;

  let defId: string | null = null;
  const workers = world.unitsOf(player).filter((u) => u.defId === "worker").length;
  const houseCost = BUILDING_DEFS.house.wood ?? 0;
  const farmCostW = BUILDING_DEFS.farm.wood ?? 0;
  const farmCostS = BUILDING_DEFS.farm.stone ?? 0;
  const housesTotal = houses + (underConstruction(world, player, "house") ? 1 : 0);
  if (housesTotal === 0 && pl.wood >= houseCost && workers >= 1) {
    // BẮT BUỘC: chưa có nhà nào thì đủ gỗ là xây ngay, không chờ gì hết.
    defId = "house";
  } else if (houses < MAX_HOUSES && pl.wood >= houseCost &&
      (pl.supplyUsed >= pl.supplyCap - 2 ||
       (world.time > 150 && houses === 0 && workers >= 3))) {
    // Nhà 2 khi sắp đầy pop (nhà 1 đã có từ bước bắt buộc trên).
    defId = "house";
  } else if (
    houses >= 1 &&
    farms < MAX_FARMS &&
    (pl.wood >= FARM_WOOD_STOCK ||
     (world.time > 300 && farms === 0 && pl.wood >= farmCostW)) &&
    pl.wood >= farmCostW &&
    (pl.stone ?? 0) >= farmCostS
  ) {
    // Farm CHỈ xây khi đã có nhà: gỗ dư HOẶC sau 5:00 chưa có farm nào.
    defId = "farm";
  }
  if (!defId) return;

  const def = BUILDING_DEFS[defId];
  const spot = findSpotNearBase(world, base, def.w, def.h);
  if (!spot) return; // hết đất quanh base → để sau

  pl.wood -= def.wood ?? 0;
  pl.stone -= def.stone ?? 0;
  const e = world.spawnBuilding(defId, player, spot.tx, spot.ty);
  if (!e) {
    // Đặt hụt (hiếm) → trả tiền lại.
    pl.wood += def.wood ?? 0;
    pl.stone += def.stone ?? 0;
    return;
  }
  e.underConstruction = true;
  e.buildProgress = 0;
  e.hp = Math.max(10, Math.floor(e.maxHp * 0.1)); // móng yếu, dễ bị phá
  world.addEffect({
    kind: "spark", x1: e.x, y1: e.y, x2: e.x, y2: e.y,
    ttl: 0.8, maxTtl: 0.8, color: "#fbbf24",
  });
}

/** Tìm đất cỏ trống quanh base (xoắn ốc, xa dần). */
function findSpotNearBase(
  world: World, base: Entity, w: number, h: number
): { tx: number; ty: number } | null {
  for (let r = 1; r <= 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = base.tx + dx;
        const ty = base.ty + dy;
        if (world.map.isRectFree(tx, ty, w, h)) return { tx, ty };
      }
    }
  }
  return null;
}

function driveSite(world: World, site: Entity, dt: number) {
  let builder: Entity | null | undefined = world.get(builders.get(site.id));
  if (!builder || builder.kind !== "unit" || builder.defId !== "worker" ||
      !(builder.state === "repairing" && builder.targetId === site.id)) {
    builder = assignBuilder(world, site);
    if (builder) builders.set(site.id, builder.id);
    else builders.delete(site.id);
  }
  if (!builder) return;

  // Địch tới gần → thả thợ chạy (workerBrain lo), tick sau cử lại.
  if (world.nearestEnemy(builder.x, builder.y, builder.player, 4 * TILE)) {
    builder.state = "idle";
    builder.targetId = null;
    builders.delete(site.id);
    return;
  }

  const half = (Math.max(site.tw, site.th) * TILE) / 2;
  if (Math.hypot(site.x - builder.x, site.y - builder.y) > half + 1.2 * TILE) return; // đang đi tới
  // Đứng cạnh → xây.
  const before = site.buildProgress;
  site.buildProgress += dt / BUILD_TIME;
  if (Math.floor(site.buildProgress * 15) !== Math.floor(before * 15)) {
    world.addEffect({
      kind: "spark", x1: site.x, y1: site.y, x2: site.x, y2: site.y,
      ttl: 0.3, maxTtl: 0.3, color: "#fdba74",
    });
  }
  if (site.buildProgress >= 1) completeSite(world, site, builder);
}

/** Thợ rảnh gần nhất (tay trắng, không gánh, đang làm việc dở cũng được giật). */
function assignBuilder(world: World, site: Entity): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const u of world.unitsOf(site.player)) {
    if (u.defId !== "worker" || u.carry > 0) continue;
    if (u.state !== "idle" && u.state !== "gathering" && u.state !== "seekingResource") continue;
    if ([...builders.values()].includes(u.id)) continue;
    const d = Math.hypot(site.x - u.x, site.y - u.y);
    if (d < bestD) {
      bestD = d;
      best = u;
    }
  }
  if (!best) return null;
  const stand = standNearSite(world, best, site);
  if (!stand) return null;
  best.state = "repairing";
  best.targetId = site.id;
  best.path = findPath(world.map, best.x, best.y, stand.x, stand.y) ?? [];
  return best;
}

/** Ô cỏ kề công trình gần thợ nhất. */
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

function completeSite(world: World, site: Entity, builder: Entity) {
  site.underConstruction = false;
  site.buildProgress = 1;
  site.hp = site.maxHp;
  builders.delete(site.id);
  if (builder && world.get(builder.id) === builder) {
    builder.state = "idle";
    builder.targetId = null;
    builder.path = [];
  }
  // Nhà xong: +2 nông dân miễn phí dọn vào ở (spawn quanh nhà mới).
  if (site.defId === "house") {
    for (let i = 0; i < 2; i++) {
      const s = world.findSpawnNear(site.x + (i === 0 ? -TILE : TILE), site.y);
      const u = world.spawnUnit("worker", site.player, s.x, s.y);
      u.job = "node";
      world.addEffect({
        kind: "spark", x1: u.x, y1: u.y, x2: u.x, y2: u.y,
        ttl: 0.6, maxTtl: 0.6, color: "#7CFC00",
      });
    }
  }
  world.recomputeSupply(); // nhà xong → cap tăng ngay
  world.addEffect({
    kind: "spark", x1: site.x, y1: site.y, x2: site.x, y2: site.y,
    ttl: 0.8, maxTtl: 0.8, color: "#7CFC00",
  });
}
