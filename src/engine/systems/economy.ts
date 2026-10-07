/**
 * EconomySystem — MULTI-RESOURCE edition.
 *  Vàng: node bị chiếm đẻ gold/s (thuế đất, như cũ).
 *  Gỗ/Đá/Nước: worker gánh về base theo chuyến (đốn → gánh → nộp).
 *  Phân vai worker theo Nhu cầu (needs) của War Council mỗi tick.
 */
import { BUILDING_DEFS, TILE, UNIT_DEFS } from "../data";
import { T_FIELD, T_GRASS, T_STONE, T_WATER, T_WOOD } from "../TileMap";
import { findPath } from "../astar";
import { Entity, NeedWeights, WorkerJob } from "../types";
import { World } from "../World";

export const WATER_CAP = 40;
/** Kho lúa tối đa. Lính ăn lúa khi train (soldier 10 · tank 30). */
export const FOOD_CAP = 200;
/** Ngưỡng kho cạn → worker TỰ đi lấy dù tướng không ra lệnh. */
export const SHORTAGE_WOOD = 30; // dưới 1 con archer
export const SHORTAGE_STONE = 15; // sắp không đủ 1 con tank
export const SHORTAGE_WATER = 12;
export const SHORTAGE_FOOD = 20; // không đủ train 2 soldier

/** Dấu hiệu thiếu tài nguyên (dùng cho auto-gather + cảnh báo HUD). */
export function shortages(pl: { wood: number; stone: number; water: number; waterIncome: number; food: number }): {
  wood: boolean;
  stone: boolean;
  water: boolean;
  food: boolean;
} {
  return {
    wood: pl.wood < SHORTAGE_WOOD,
    stone: (pl.stone ?? 0) < SHORTAGE_STONE,
    water: pl.water < SHORTAGE_WATER || (pl.waterIncome < -1 && pl.water < 20),
    food: (pl.food ?? 0) < SHORTAGE_FOOD,
  };
}

/** Nhu cầu hiệu lực = tay tướng chỉnh + máy tự bù khi kho cạn. */
export function effectiveNeeds(pl: {
  needs: NeedWeights;
  wood: number;
  stone: number;
  water: number;
  waterIncome: number;
  food: number;
}): NeedWeights {
  const s = shortages(pl);
  return {
    gold: pl.needs.gold,
    wood: Math.max(pl.needs.wood, s.wood ? 2 : 0),
    stone: Math.max(pl.needs.stone, s.stone ? 2 : 0),
    water: Math.max(pl.needs.water, s.water ? 2 : 0),
    food: Math.max(pl.needs.food, s.food ? 2 : 0),
  };
}
/** mỗi nhịp gánh / sức gánh */
const TAKE = 5;
const CARRY_CAP = 25;
const GATHER_TIME = 1.0;

export function economyTick(world: World, dt: number) {
  rolesTick(world);
  captureTick(world);
  tripsTick(world, dt);
  regrowTick(world, dt);
  incomeTick(world, dt);
}

/** Lúa mọc lại: ruộng đã gặt hồi dần tới trần — khác rừng/đá hết là hết. */
const REGROW_RATE = 1.2;
const REGROW_CAP = 60;
function regrowTick(world: World, dt: number) {
  const { map } = world;
  for (let i = 0; i < map.tiles.length; i++) {
    if (map.tiles[i] !== T_FIELD) continue;
    if (map.rice[i] < REGROW_CAP) map.rice[i] = Math.min(REGROW_CAP, map.rice[i] + REGROW_RATE * dt);
  }
}

// ---------------------------------------------------------- phân vai

/** Chia worker: giữ mỏ vàng + gánh gỗ/đá/nước theo needs (tay chỉnh + máy tự bù khi cạn). */
function rolesTick(world: World) {
  for (const pl of world.players) {
    if (!pl.alive) continue;
    const workers = world.unitsOf(pl.id).filter((u) => u.defId === "worker");
    if (workers.length === 0) continue;

    const needs = effectiveNeeds(pl);
    const nodeTarget = needs.gold === 0 ? 1 : needs.gold === 2 ? 4 : 2;
    const slots = Math.max(0, workers.length - nodeTarget);
    const wts = [needs.wood, needs.stone, needs.water, needs.food];
    const sum = wts[0] + wts[1] + wts[2] + wts[3];
    const jobs: WorkerJob[] = ["wood", "stone", "water", "food"];
    const desired: Record<WorkerJob, number> = { node: 0, wood: 0, stone: 0, water: 0, food: 0 };
    desired.node = Math.min(nodeTarget, workers.length);
    if (sum === 0) {
      // Không cần gì → tất cả giữ mỏ cho có việc.
      desired.node = workers.length;
    } else {
      let assigned = 0;
      const order = [0, 1, 2, 3].sort((a, b) => wts[b] - wts[a]);
      for (const i of order) {
        const c = Math.floor((slots * wts[i]) / sum);
        desired[jobs[i]] = c;
        assigned += c;
      }
      // phần lẻ cho việc cần nhất
      let k = 0;
      while (assigned < slots && k < 4) {
        desired[jobs[order[k % 3]]]++;
        assigned++;
        k++;
      }
    }

    const count: Record<WorkerJob, number> = { node: 0, wood: 0, stone: 0, water: 0, food: 0 };
    for (const u of workers) count[u.job]++;

    // Chuyển những worker rảnh (không gánh, không chạy giặc) sang việc thiếu.
    // Chuyển những worker rảnh sang việc thiếu.
    // Đang đi/gánh thì không giật (kẻo cuốc xa mãi không tới).
    // Chỉ tỉa khi vai hiện tại thừa người.
    const over: Record<WorkerJob, boolean> = { node: false, wood: false, stone: false, water: false, food: false };
    for (const j of ["node", "wood", "stone", "water", "food"] as WorkerJob[]) {
      over[j] = count[j] > desired[j];
    }
    for (const u of workers) {
      if (u.carry > 0) continue;
      if (!reassignable(u, over[u.job])) continue;
      // tìm việc đang thiếu nhất
      let want: WorkerJob | null = null;
      let bestGap = 0;
      for (const j of ["node", "wood", "stone", "water", "food"] as WorkerJob[]) {
        const gap = desired[j] - count[j];
        if (gap > bestGap) {
          bestGap = gap;
          want = j;
        }
      }
      if (want && want !== u.job) {
        count[u.job]--;
        count[want]++;
        u.job = want;
        u.state = "idle";
        u.path = [];
        u.targetId = null;
      }
    }
  }
}

/**
 * Worker rảnh để đổi việc:
 * - idle / spawn mới (moving hết path): luôn nhận việc mới.
 * - đang gặt tại chỗ mà vai thừa người: cho chuyển (tỉa dần).
 * - đang đi đường / đang gánh: không giật.
 */
function reassignable(u: Entity, overstaffed: boolean): boolean {
  if (u.state === "idle") return true;
  if (u.state === "moving" && u.path.length === 0) return true;
  if (u.state === "gathering" && overstaffed) return true;
  return false;
}

// ---------------------------------------------------------- giữ mỏ vàng

function captureTick(world: World) {
  for (const n of world.nodes()) {
    const def = BUILDING_DEFS[n.defId];
    if (!def) continue;
    const r = def.captureRadius * TILE;
    let blue = 0;
    let red = 0;
    for (const u of world.queryRadius(n.x, n.y, r, { kind: "unit" })) {
      if (u.defId !== "worker") continue;
      if (u.player === 0) blue++;
      else if (u.player === 1) red++;
    }
    if (blue === 0 && red === 0) continue;
    if (blue > red && n.player !== 0) {
      n.player = 0;
      world.addEffect({
        kind: "spark", x1: n.x, y1: n.y, x2: n.x, y2: n.y,
        ttl: 0.6, maxTtl: 0.6, color: "#3b82f6",
      });
    } else if (red > blue && n.player !== 1) {
      n.player = 1;
      world.addEffect({
        kind: "spark", x1: n.x, y1: n.y, x2: n.x, y2: n.y,
        ttl: 0.6, maxTtl: 0.6, color: "#ef4444",
      });
    }
    for (const u of world.queryRadius(n.x, n.y, r, { kind: "unit" })) {
      if (u.defId !== "worker" || u.job !== "node") continue;
      if (u.player === n.player && u.state !== "moving") {
        u.state = "gathering";
        u.targetId = n.id;
        u.path = [];
      }
    }
  }
}

// ---------------------------------------------------------- chuyến gánh

/** Worker job wood/stone/water: đi lấy → gánh về base → nộp kho. */
function tripsTick(world: World, dt: number) {
  for (const u of world.entities.values()) {
    if (u.kind !== "unit" || u.defId !== "worker") continue;
    if (u.job === "node") continue;
    const res = u.job; // 'wood' | 'stone' | 'water'

    // Đang gánh → về base nộp.
    if (u.state === "returning") {
      const base = world.baseOf(u.player);
      // Nộp theo khoảng cách TRƯỚC: đường về đông, waypoint cuối kẹt vẫn nộp được.
      if (base && Math.hypot(base.x - u.x, base.y - u.y) < 5 * TILE) {
        deposit(world, u, res);
        continue;
      }
      if (u.path.length > 0) {
        // Chống kẹt: 3s không tới thì tìm đường lại (phá thế cân bằng separation).
        u.gatherTimer += dt;
        if (u.gatherTimer > 3 && base) {
          u.gatherTimer = 0;
          const rp = findPath(world.map, u.x, u.y, base.x, base.y);
          u.path = rp ?? [];
        }
        continue;
      }
      if (base) {
        const p = findPath(world.map, u.x, u.y, base.x, base.y);
        u.path = p ?? [];
        if (u.path.length === 0) deposit(world, u, res); // kẹt vẫn nộp
      } else {
        u.state = "idle";
      }
      continue;
    }

    // Đang khai thác → nhịp gánh.
    if (u.state === "gathering" && u.targetId == null) {
      gatherAt(world, u, res, dt);
      continue;
    }
    if (u.state === "gathering" && u.targetId != null) continue; // giữ mỏ (lỡ job đổi sau)

    // Đang đi → kệ, nhưng tới gần mục tiêu thì coi như tới nơi
    // (đông worker chụm 1 điểm hay kẹt waypoint cuối do separation).
    if (u.state === "seekingResource" && u.path.length > 0) {
      const tcx = world.map.tileToWorldCenter(u.targetX);
      const tcy = world.map.tileToWorldCenter(u.targetY);
      if (Math.hypot(tcx - u.x, tcy - u.y) < TILE * 1.2) {
        u.path = [];
      } else {
        // Kẹt giữa đường quá 3s → tìm đường lại.
        u.gatherTimer += dt;
        if (u.gatherTimer > 3) {
          u.gatherTimer = 0;
          sendToSource(world, u, res);
          continue;
        }
        continue;
      }
    }

    // Tới nơi (hết path) → bắt đầu khai thác nếu còn hàng.
    if (u.state === "seekingResource" && u.path.length === 0) {
      if (sourceLeft(world, u, res)) {
        u.state = "gathering";
        u.gatherTimer = 0;
      } else {
        sendToSource(world, u, res); // cạn → tìm chỗ khác
      }
      continue;
    }
    // Rảnh → tìm nguồn (tôn trọng thời gian nghỉ khi vừa tìm hụt).
    if (u.state === "idle") {
      u.repathTimer -= dt;
      if (u.repathTimer <= 0) sendToSource(world, u, res);
    }
  }
}

/** Worker có đứng gần ô (tx,ty) trong bán kính r tiles không? */
function nearTile(world: World, u: Entity, tx: number, ty: number, r: number): boolean {
  const dx = Math.abs(world.map.worldToTile(u.x) - tx);
  const dy = Math.abs(world.map.worldToTile(u.y) - ty);
  return dx <= r && dy <= r;
}

function deposit(world: World, u: Entity, res: WorkerJob) {
  const pl = world.player(u.player);
  if (u.carryType === "wood") pl.wood += Math.floor(u.carry);
  else if (u.carryType === "stone") pl.stone += Math.floor(u.carry);
  else if (u.carryType === "water") pl.water = Math.min(WATER_CAP, pl.water + u.carry);
  else if (u.carryType === "food") pl.food = Math.min(FOOD_CAP, pl.food + Math.floor(u.carry));
  u.carry = 0;
  u.state = "idle";
  u.path = [];
  u.gatherTimer = 0;
  world.addEffect({
    kind: "spark", x1: u.x, y1: u.y, x2: u.x, y2: u.y,
    ttl: 0.3, maxTtl: 0.3, color: "#7CFC00",
  });
}

function gatherAt(world: World, u: Entity, res: WorkerJob, dt: number) {
  u.gatherTimer += dt;
  if (u.gatherTimer < GATHER_TIME) return;
  u.gatherTimer = 0;
  const tx = u.targetX;
  const ty = u.targetY;
  if (res === "water") {
    // Múc ở ô nước mục tiêu (đứng bờ bên cạnh). Trôi bờ thì quay lại.
    const dx = Math.abs(world.map.worldToTile(u.x) - tx);
    const dy = Math.abs(world.map.worldToTile(u.y) - ty);
    if (dx > 2 || dy > 2 || world.map.tileAt(tx, ty) !== T_WATER) {
      sendToSource(world, u, res);
      return;
    }
    u.carryType = "water";
    const take = Math.min(TAKE, CARRY_CAP - u.carry);
    u.carry += take; // hồ không cạn
  } else {
    // Bị đẩy khỏi bờ (separation) → đi lại cho đúng ô kề bên.
    const dx = Math.abs(world.map.worldToTile(u.x) - tx);
    const dy = Math.abs(world.map.worldToTile(u.y) - ty);
    if (dx > 1 || dy > 1) {
      sendToSource(world, u, res);
      return;
    }
    const kind = res === "wood" ? T_WOOD : res === "stone" ? T_STONE : T_FIELD;
    const store = res === "wood" ? world.map.wood : res === "stone" ? world.map.stone : world.map.rice;
    if (world.map.tileAt(tx, ty) !== kind || store[world.map.idx(tx, ty)] <= 0) {
      sendToSource(world, u, res);
      return;
    }
    const i = world.map.idx(tx, ty);
    const take = Math.min(TAKE, store[i], CARRY_CAP - u.carry);
    store[i] -= take;
    u.carry += take;
    u.carryType = res;
    if (store[i] <= 0) {
      if (res === "food") {
        // Ruộng gặt sạch vẫn là ruộng — lúa mọc lại sau (xem regrowTick).
      } else {
        world.map.tiles[i] = T_GRASS; // đốn sạch → cỏ
      }
    }
  }
  world.addEffect({
    kind: "spark", x1: u.x, y1: u.y, x2: u.x, y2: u.y,
    ttl: 0.3, maxTtl: 0.3,
    color: res === "wood" ? "#4ade80" : res === "stone" ? "#a8a29e" : res === "food" ? "#fbbf24" : "#38bdf8",
  });
  if (u.carry >= CARRY_CAP) {
    const base = world.baseOf(u.player);
    u.state = "returning";
    if (base) {
      const p = findPath(world.map, u.x, u.y, base.x, base.y);
      u.path = p ?? [];
    }
  }
}

function sourceLeft(world: World, u: Entity, res: WorkerJob): boolean {
  if (res === "water") return world.map.tileAt(u.targetX, u.targetY) === T_WATER;
  const kind = res === "wood" ? T_WOOD : res === "stone" ? T_STONE : T_FIELD;
  const store = res === "wood" ? world.map.wood : res === "stone" ? world.map.stone : world.map.rice;
  if (world.map.tileAt(u.targetX, u.targetY) !== kind) return false;
  if (store[world.map.idx(u.targetX, u.targetY)] <= 0) return false;
  // Phải đứng ở ô kề bên (không bao giờ đứng trong ô tài nguyên).
  const dx = Math.abs(world.map.worldToTile(u.x) - u.targetX);
  const dy = Math.abs(world.map.worldToTile(u.y) - u.targetY);
  return dx <= 1 && dy <= 1;
}

/** Tìm nguồn gần nhất cho job. Không có → đứng yên chờ. */
export function sendToSource(world: World, u: Entity, res: WorkerJob) {
  if (res === "water") {
    const shore = world.map.nearestShore(u.x, u.y);
    if (!shore) {
      u.state = "idle";
      u.repathTimer = 2;
      return;
    }
    const p0 = findPath(
      world.map, u.x, u.y,
      world.map.tileToWorldCenter(shore.tx), world.map.tileToWorldCenter(shore.ty)
    );
    if ((!p0 || p0.length === 0) && !nearTile(world, u, shore.wtx, shore.wty, 2)) {
      u.state = "idle"; // bờ kẹt đường → nghỉ rồi thử lại
      u.repathTimer = 2;
      return;
    }
    u.targetX = shore.wtx;
    u.targetY = shore.wty;
    u.state = "seekingResource";
    u.path = p0 ?? [];
    return;
  }
  const kind = res === "wood" ? T_WOOD : res === "stone" ? T_STONE : T_FIELD;
  // Đứng ở ô cỏ kề bên để khai thác — không bước vào ô rừng/đá/ruộng.
  // Thử tối đa 3 điểm: chỗ cũ kẹt đường thì đổi chỗ khác, tránh lặp A* vô hạn.
  let exclude: { tx: number; ty: number } | undefined;
  if (u.targetX !== 0 || u.targetY !== 0) exclude = { tx: u.targetX, ty: u.targetY };
  for (let attempt = 0; attempt < 3; attempt++) {
    const spot = world.map.nearestHarvestStand(u.x, u.y, kind, 48, exclude);
    if (!spot) {
      u.state = "idle"; // cạn kiệt → chờ (needs sẽ điều sang việc khác nếu đổi)
      u.path = [];
      u.repathTimer = 2; // nghỉ 2s rồi tìm lại, đỡ spam A*
      return;
    }
    const p = findPath(
      world.map, u.x, u.y,
      world.map.tileToWorldCenter(spot.tx), world.map.tileToWorldCenter(spot.ty)
    );
    if (p && p.length > 0) {
      u.targetX = spot.rtx;
      u.targetY = spot.rty;
      u.state = "seekingResource";
      u.path = p;
      return;
    }
    exclude = { tx: spot.rtx, ty: spot.rty }; // kẹt đường → thử mỏ khác
  }
  u.state = "idle";
  u.path = [];
  u.repathTimer = 2;
}

// ---------------------------------------------------------- thu nhập

function incomeTick(world: World, dt: number) {
  for (const p of world.players) {
    p.income = 0;
    p.waterIncome = 0;
  }
  const mult = suddenDeathActive(world) ? 2 : 1;

  const upkeep = new Map<number, number>();
  for (const u of world.entities.values()) {
    if (u.kind !== "unit") continue;
    upkeep.set(u.player, (upkeep.get(u.player) ?? 0) + (UNIT_DEFS[u.defId]?.waterUse ?? 0.1));
  }

  for (const e of world.entities.values()) {
    if (e.kind !== "building") continue;
    const def = BUILDING_DEFS[e.defId];
    if (!def) continue;
    if (e.player !== 0 && e.player !== 1) continue;
    const p = world.players.find((p) => p.id === e.player);
    if (!p) continue;
    if (def.income) {
      const gain = def.income * mult * dt;
      p.ore += gain;
      p.income += def.income * mult;
    }
    if (def.water) {
      p.water = Math.min(WATER_CAP, p.water + def.water * mult * dt);
      p.waterIncome += def.water * mult;
    }
  }
  for (const p of world.players) {
    const use = upkeep.get(p.id) ?? 0;
    p.water = Math.max(0, p.water - use * dt);
    p.waterIncome -= use;
  }
}

/** Phe này có đang khát nước không (yếu 30%)? */
export function isParched(world: World, player: number): boolean {
  const p = world.players.find((p) => p.id === player);
  return !!p && p.water <= 0;
}

/** Export để Game dùng cho sudden-death bleed. */
export function suddenDeathActive(world: World): boolean {
  return world.time >= 10 * 60;
}

/** Giữ API cũ (không còn dùng ore-trip). */
export function sendToOre(): void {
  // No-op: workerBrain + rolesTick tự phân việc.
}
