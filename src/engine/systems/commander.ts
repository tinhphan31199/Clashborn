/**
 * FieldCommander — agent chỉ huy quân lính như tướng thật.
 *
 * Đọc 2 thứ: tài nguyên phe mình (gold/income, quy mô quân) + yêu cầu của
 * người chơi (slider Thủ↔Công, trọng tâm mỏ, học thuyết) rồi ra lệnh theo
 * squad: giữ nhà / giữ đất / quấy kinh tế địch / tổng đẩy base.
 *
 * Lệnh đi qua field có sẵn của unit (state attackMoving + path + repathTimer)
 * nên combatTick vẫn lo đánh nhau, workerBrain không bị ảnh hưởng.
 * Chạy cho CẢ 2 phe (AI cũng đánh như người).
 */
import { BUILDING_DEFS, TILE } from "../data";
import { findPath } from "../astar";
import { Entity, MapFocus, PlayerId } from "../types";
import { World } from "../World";

export type Posture = "DEFEND" | "HOLD" | "HARASS" | "PUSH";

interface Brain {
  t: number;
  posture: Posture;
}

const brains = new Map<PlayerId, Brain>();
const THINK = 1.0;

const POWER: Record<string, number> = { soldier: 1, archer: 1.2, tank: 2.5 };

export function postureOf(player: PlayerId): Posture {
  return brains.get(player)?.posture ?? "HOLD";
}

export function commanderTick(world: World, dt: number) {
  for (const pl of world.players) {
    if (!pl.alive) continue;
    let b = brains.get(pl.id);
    if (!b) {
      b = { t: 0, posture: "HOLD" };
      brains.set(pl.id, b);
    }
    b.t -= dt;
    if (b.t > 0) continue;
    b.t = THINK;
    think(world, pl.id, b);
  }
}

function armyOf(world: World, player: PlayerId): Entity[] {
  return world.unitsOf(player).filter((u) => u.defId !== "worker");
}

function force(units: Entity[]): number {
  let s = 0;
  for (const u of units) {
    s += (POWER[u.defId] ?? 1) * Math.max(0.2, u.hp / u.maxHp);
  }
  return s;
}

function centroid(units: Entity[]): { x: number; y: number } | null {
  if (units.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const u of units) {
    x += u.x;
    y += u.y;
  }
  return { x: x / units.length, y: y / units.length };
}

/** Điểm đánh theo trọng tâm mỏ mà tướng chọn. */
function focusPoint(world: World, player: PlayerId, focus: MapFocus): { x: number; y: number } {
  const cx = (world.map.w * TILE) / 2;
  const cy = (world.map.h * TILE) / 2;
  const mine = (want: string): Entity | null => {
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const n of world.nodes()) {
      if (n.defId !== want) continue;
      const d = Math.hypot(n.x - cx, n.y - cy);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  };
  // near = mỏ gần nhà mình nhất
  if (focus === "near") {
    const base = world.baseOf(player);
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const n of world.nodes()) {
      if (n.defId !== "node_near" || !base) continue;
      const d = Math.hypot(n.x - base.x, n.y - base.y);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    if (best) return { x: best.x, y: best.y };
  } else if (focus === "mid") {
    // mid = mỏ giữa gần nhà mình nhất
    const base = world.baseOf(player);
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const n of world.nodes()) {
      if (n.defId !== "node_mid" || !base) continue;
      const d = Math.hypot(n.x - base.x, n.y - base.y);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    if (best) return { x: best.x, y: best.y };
  } else if (focus === "center") {
    const c = mine("node_center");
    if (c) return { x: c.x, y: c.y };
  }
  return { x: cx, y: cy };
}

function order(world: World, u: Entity, x: number, y: number, retreat: boolean) {
  const p = findPath(world.map, u.x, u.y, x, y);
  if (p && p.length > 0) {
    u.path = p;
  } else {
    u.path = [];
  }
  // Rút lui vẫn đánh trả trên đường về (attackMoving), không chạy chay.
  u.state = retreat ? "moving" : "attackMoving";
  u.targetId = null;
  u.repathTimer = 1.5;
}

function think(world: World, player: PlayerId, b: Brain) {
  const pl = world.player(player);
  const enemy = player === 0 ? 1 : 0;
  const mine = armyOf(world, player);
  const foe = armyOf(world, enemy);
  if (mine.length === 0) return;

  const myForce = force(mine);
  const foeForce = force(foe);
  const base = world.baseOf(player);
  const enemyBase = world.baseOf(enemy);

  // Địch mò tới nhà?
  let threatNearBase = false;
  if (base) {
    threatNearBase = world
      .queryRadius(base.x, base.y, 12 * TILE, { kind: "unit" })
      .some((e) => e.player !== player && e.player >= 0 && e.defId !== "worker");
  }
  const baseDanger = base ? 1 - base.hp / base.maxHp : 0;

  // Nghèo thì thủ, không nướng quân.
  const broke = pl.income < 5 && myForce < 3;
  const pushTime = 200 - pl.defAtk * 140;
  const wantPush =
    !broke &&
    (myForce > foeForce * 1.3 + 1 || (world.time > pushTime && myForce >= 4));

  let posture: Posture;
  if ((threatNearBase && foeForce * 1.1 > myForce) || baseDanger > 0.25) {
    posture = "DEFEND";
  } else if (wantPush && enemyBase) {
    posture = "PUSH";
  } else if (pl.defAtk > 0.65 && mine.length >= 2) {
    posture = "HARASS";
  } else {
    posture = "HOLD";
  }
  const changed = posture !== b.posture;
  b.posture = posture;

  const c = centroid(mine);
  const fp = focusPoint(world, player, pl.focus);
  // Hướng tiến quân (để tank đi trước, archer lùi sau).
  let dx = 0;
  let dy = -1;
  if (c) {
    const gx = posture === "PUSH" && enemyBase ? enemyBase.x : posture === "DEFEND" && base ? base.x : fp.x;
    const gy = posture === "PUSH" && enemyBase ? enemyBase.y : posture === "DEFEND" && base ? base.y : fp.y;
    const d = Math.hypot(gx - c.x, gy - c.y) || 1;
    dx = (gx - c.x) / d;
    dy = (gy - c.y) / d;
  }

  // Mục tiêu quấy: worker địch hở sườn gần nhất.
  let harassTarget: Entity | null = null;
  if ((posture === "HARASS" || posture === "HOLD") && c) {
    let bestD = Infinity;
    for (const e of world.unitsOf(enemy)) {
      if (e.defId !== "worker") continue;
      const escort = world.queryRadius(e.x, e.y, 5 * TILE, { kind: "unit" })
        .filter((o) => o.player === enemy && o.defId !== "worker").length;
      const d = Math.hypot(e.x - c.x, e.y - c.y) + escort * 8 * TILE;
      if (d < bestD) {
        bestD = d;
        harassTarget = e;
      }
    }
  }
  const raiders = harassTarget
    ? mine.filter((u) => u.defId === "soldier").slice(0, 3)
    : [];
  const raiderIds = new Set(raiders.map((u) => u.id));

  for (const u of mine) {
    // Đang đánh / đang xây / đang chạy theo lệnh mới → không giật.
    if (u.state === "attacking" || u.state === "repairing") continue;
    const idleish =
      u.state === "idle" || ((u.state === "attackMoving" || u.state === "moving") && u.path.length === 0);

    // Lính yếu máu mà địch đông quanh → rút về base.
    let retreat = false;
    if (u.hp < u.maxHp * 0.35) {
      const near = world.queryRadius(u.x, u.y, 6 * TILE, { kind: "unit" })
        .filter((e) => e.player !== player && e.player >= 0 && e.defId !== "worker").length;
      retreat = near > 0 && base !== null;
    }

    if (!idleish && !changed && !retreat) continue;

    if (retreat && base) {
      order(world, u, base.x, base.y, true);
      continue;
    }
    if (raiderIds.has(u.id) && harassTarget) {
      order(world, u, harassTarget.x, harassTarget.y, false);
      continue;
    }
    // Điểm tập kết theo thế trận + vai trò (tank trước, archer sau, soldier cánh).
    let gx: number;
    let gy: number;
    if (posture === "PUSH" && enemyBase) {
      gx = enemyBase.x;
      gy = enemyBase.y;
    } else if (posture === "DEFEND" && base) {
      gx = base.x + (fp.x - base.x) * 0.35;
      gy = base.y + (fp.y - base.y) * 0.35;
    } else {
      gx = fp.x;
      gy = fp.y;
    }
    const side = (u.id % 5) - 2;
    if (u.defId === "tank") {
      gx += dx * 2 * TILE;
      gy += dy * 2 * TILE;
    } else if (u.defId === "archer") {
      gx -= dx * 2.5 * TILE;
      gy -= dy * 2.5 * TILE;
    } else {
      gx += -dy * side * TILE * 1.2;
      gy += dx * side * TILE * 1.2;
    }
    order(world, u, gx, gy, false);
  }
}
