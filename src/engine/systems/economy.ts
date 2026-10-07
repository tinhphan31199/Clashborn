/**
 * EconomySystem — MULTI-RESOURCE edition.
 *  Vàng: node bị chiếm đẻ gold/s (thuế đất, như cũ).
 *  Gỗ/Đá/Nước: worker gánh về base theo chuyến (đốn → gánh → nộp).
 *  Phân vai worker theo Nhu cầu (needs) của War Council mỗi tick.
 */
import { BUILDING_DEFS, TILE, UNIT_DEFS } from "../data";
import { T_GRASS, T_STONE, T_WATER, T_WOOD } from "../TileMap";
import { findPath } from "../astar";
import { Entity, WorkerJob } from "../types";
import { World } from "../World";

export const WATER_CAP = 40;
/** mỗi nhịp gánh / sức gánh */
const TAKE = 5;
const CARRY_CAP = 25;
const GATHER_TIME = 1.0;

export function economyTick(world: World, dt: number) {
  rolesTick(world);
  captureTick(world);
  tripsTick(world, dt);
  incomeTick(world, dt);
}

// ---------------------------------------------------------- phân vai

/** Chia worker: giữ mỏ vàng + gánh gỗ/đá/nước theo needs. */
function rolesTick(world: World) {
  for (const pl of world.players) {
    if (!pl.alive) continue;
    const workers = world.unitsOf(pl.id).filter((u) => u.defId === "worker");
    if (workers.length === 0) continue;

    const nodeTarget = pl.needs.gold === 0 ? 1 : pl.needs.gold === 2 ? 4 : 2;
    const slots = Math.max(0, workers.length - nodeTarget);
    const wts = [pl.needs.wood, pl.needs.stone, pl.needs.water];
    const sum = wts[0] + wts[1] + wts[2];
    const jobs: WorkerJob[] = ["wood", "stone", "water"];
    const desired: Record<WorkerJob, number> = { node: 0, wood: 0, stone: 0, water: 0 };
    desired.node = Math.min(nodeTarget, workers.length);
    if (sum === 0) {
      // Không cần gì → tất cả giữ mỏ cho có việc.
      desired.node = workers.length;
    } else {
      let assigned = 0;
      const order = [0, 1, 2].sort((a, b) => wts[b] - wts[a]);
      for (const i of order) {
        const c = Math.floor((slots * wts[i]) / sum);
        desired[jobs[i]] = c;
        assigned += c;
      }
      // phần lẻ cho việc cần nhất
      let k = 0;
      while (assigned < slots && k < 3) {
        desired[jobs[order[k % 3]]]++;
        assigned++;
        k++;
      }
    }

    const count: Record<WorkerJob, number> = { node: 0, wood: 0, stone: 0, water: 0 };
    for (const u of workers) count[u.job]++;

    // Chuyển những worker rảnh (không gánh, không chạy giặc) sang việc thiếu.
    for (const u of workers) {
      if (u.carry > 0) continue;
      if (!reassignable(world, u)) continue;
      // tìm việc đang thiếu nhất
      let want: WorkerJob | null = null;
      let bestGap = 0;
      for (const j of ["node", "wood", "stone", "water"] as WorkerJob[]) {
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

/** Worker rảnh để đổi việc: đứng yên/khai thác, không gánh hàng, không chạy giặc. */
function reassignable(world: World, u: Entity): boolean {
  if (u.state === "idle" || u.state === "gathering" || u.state === "seekingResource") return true;
  if (u.state === "moving" && u.path.length === 0) return true; // spawn mới / chạy xong
  // moving có path: đang chạy giặc → kiểm tra còn giặc không
  const threat = world.nearestEnemy(u.x, u.y, u.player, 6 * TILE);
  return !threat;
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
      if (u.path.length > 0) continue;
      const base = world.baseOf(u.player);
      if (base && Math.hypot(base.x - u.x, base.y - u.y) < 5 * TILE) {
        deposit(world, u, res);
      } else if (base) {
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

    // Đang đi → kệ.
    if (u.state === "seekingResource" && u.path.length > 0) continue;

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
    // Rảnh → tìm nguồn.
    if (u.state === "idle") sendToSource(world, u, res);
  }
}

function deposit(world: World, u: Entity, res: WorkerJob) {
  const pl = world.player(u.player);
  if (u.carryType === "wood") pl.wood += Math.floor(u.carry);
  else if (u.carryType === "stone") pl.stone += Math.floor(u.carry);
  else if (u.carryType === "water") pl.water = Math.min(WATER_CAP, pl.water + u.carry);
  u.carry = 0;
  u.state = "idle";
  u.path = [];
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
    // Múc ở ô nước mục tiêu (đứng bờ bên cạnh).
    u.carryType = "water";
    const take = Math.min(TAKE, CARRY_CAP - u.carry);
    u.carry += take; // hồ không cạn
  } else {
    const kind = res === "wood" ? T_WOOD : T_STONE;
    const store = res === "wood" ? world.map.wood : world.map.stone;
    if (world.map.tileAt(tx, ty) !== kind || store[world.map.idx(tx, ty)] <= 0) {
      sendToSource(world, u, res);
      return;
    }
    const i = world.map.idx(tx, ty);
    const take = Math.min(TAKE, store[i], CARRY_CAP - u.carry);
    store[i] -= take;
    u.carry += take;
    u.carryType = res;
    if (store[i] <= 0) world.map.tiles[i] = T_GRASS; // đốn sạch → cỏ
  }
  world.addEffect({
    kind: "spark", x1: u.x, y1: u.y, x2: u.x, y2: u.y,
    ttl: 0.3, maxTtl: 0.3,
    color: res === "wood" ? "#4ade80" : res === "stone" ? "#a8a29e" : "#38bdf8",
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
  const kind = res === "wood" ? T_WOOD : T_STONE;
  const store = res === "wood" ? world.map.wood : world.map.stone;
  return world.map.tileAt(u.targetX, u.targetY) === kind && store[world.map.idx(u.targetX, u.targetY)] > 0;
}

/** Tìm nguồn gần nhất cho job. Không có → đứng yên chờ. */
export function sendToSource(world: World, u: Entity, res: WorkerJob) {
  if (res === "water") {
    const shore = world.map.nearestShore(u.x, u.y);
    if (!shore) {
      u.state = "idle";
      return;
    }
    u.targetX = shore.wtx;
    u.targetY = shore.wty;
    u.state = "seekingResource";
    const p = findPath(
      world.map, u.x, u.y,
      world.map.tileToWorldCenter(shore.tx), world.map.tileToWorldCenter(shore.ty)
    );
    u.path = p ?? [];
    return;
  }
  const kind = res === "wood" ? T_WOOD : T_STONE;
  const spot = world.map.nearestHarvest(u.x, u.y, kind);
  if (!spot) {
    u.state = "idle"; // cạn kiệt → chờ (needs sẽ điều sang việc khác nếu đổi)
    u.path = [];
    return;
  }
  u.targetX = spot.tx;
  u.targetY = spot.ty;
  u.state = "seekingResource";
  const p = findPath(
    world.map, u.x, u.y,
    world.map.tileToWorldCenter(spot.tx), world.map.tileToWorldCenter(spot.ty)
  );
  u.path = p ?? [];
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
