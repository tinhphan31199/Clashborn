/**
 * FieldCommander — QUÂN SƯ chiến lược của từng phe.
 *
 * Mỗi giây (THINK) thu thập tin tình báo đầy đủ về ĐỊCH (quân số từng loại,
 * mỏ đang giữ + thu nhập, tháp/farm, máu base, khát nước, đầy pop, áp lực
 * sang phần ta, xu hướng mạnh/yếu) + tình ta, rồi định thế trận squad:
 * giữ nhà / giữ đất / quấy kinh tế địch / tổng đẩy base.
 *
 * Lệnh đi qua field có sẵn của unit (state attackMoving + path + repathTimer)
 * nên combatTick vẫn lo đánh nhau, workerBrain không bị ảnh hưởng.
 * Chạy cho CẢ 2 phe (AI cũng đánh như người).
 */
import { BUILDING_DEFS, TILE, isCritterDef } from "../data";
import { findPath } from "../astar";
import { Entity, MapFocus, PlayerId } from "../types";
import { World } from "../World";
import { isParched, SHORTAGE_FOOD } from "./economy";

export type Posture = "DEFEND" | "HOLD" | "HARASS" | "PUSH";

interface Brain {
  t: number;
  posture: Posture;
  /** lực địch nhịp trước (đo xu hướng mạnh/yếu). */
  lastFoe: number;
  /** câu đánh giá mới nhất cho HUD. */
  report: string;
}

const brains = new Map<PlayerId, Brain>();
const THINK = 1.0;

const POWER: Record<string, number> = { soldier: 1, archer: 1.2, tank: 2.5 };

export function postureOf(player: PlayerId): Posture {
  return brains.get(player)?.posture ?? "HOLD";
}

/** Đánh giá mới nhất của quân sư về địch (cho HUD đọc). */
export function strategyOf(player: PlayerId): string {
  return brains.get(player)?.report ?? "Quân sư chưa có tin tức.";
}

export function commanderTick(world: World, dt: number) {
  for (const pl of world.players) {
    if (!pl.alive) continue;
    let b = brains.get(pl.id);
    if (!b) {
      b = { t: 0, posture: "HOLD", lastFoe: 0, report: "" };
      brains.set(pl.id, b);
    }
    b.t -= dt;
    if (b.t > 0) continue;
    b.t = THINK;
    think(world, pl.id, b);
  }
}

function armyOf(world: World, player: PlayerId): Entity[] {
  // Mạo hiểm giả đi nhiệm vụ riêng, commander không giật.
  return world.unitsOf(player).filter((u) => u.defId !== "worker" && u.defId !== "adventurer");
}

function force(units: Entity[]): number {
  let s = 0;
  for (const u of units) {
    s += (POWER[u.defId] ?? 1) * Math.max(0.2, u.hp / u.maxHp);
  }
  return s;
}

/** Nửa map phe này (dấu của base so với tâm). Đơn vị ở nửa kia = sang phần địch. */
function homeSide(world: World, player: PlayerId): number {
  const base = world.baseOf(player);
  const cx = (world.map.w * TILE) / 2;
  const cy = (world.map.h * TILE) / 2;
  if (!base) return 1;
  return Math.sign(base.x - cx + (base.y - cy)) || 1;
}

/** Tin tình báo đầy đủ về địch mà quân sư cần để quyết. */
interface EnemyIntel {
  myForce: number;
  foeForce: number;
  soldier: number;
  archer: number;
  tank: number;
  foeWorkers: number;
  foeNodes: number;
  foeIncome: number;
  foeTowers: number;
  foeFarms: number;
  foeParched: boolean;
  myParched: boolean;
  foeCapped: boolean;
  /** địch đang ở nửa ta: số lượng + lực. */
  foeHalfCount: number;
  foeHalfForce: number;
  /** địch gần base ta nhất (tiles), Infinity nếu không có. */
  threatTiles: number;
  /** lực địch tăng/giảm từ nhịp trước (âm = đang yếu đi). */
  foeTrend: number;
  /** % máu base địch còn lại, -1 nếu đã mất. */
  foeBasePct: number;
}

function gatherIntel(world: World, player: PlayerId, b: Brain): EnemyIntel {
  const enemy = player === 0 ? 1 : 0;
  const mine = armyOf(world, player);
  const foeArmy = armyOf(world, enemy);
  const myForce = force(mine);
  const foeForce = force(foeArmy);
  let soldier = 0;
  let archer = 0;
  let tank = 0;
  let foeWorkers = 0;
  for (const u of world.unitsOf(enemy)) {
    if (u.defId === "soldier") soldier++;
    else if (u.defId === "archer") archer++;
    else if (u.defId === "tank") tank++;
    else if (u.defId === "worker") foeWorkers++;
  }
  let foeNodes = 0;
  let foeIncome = 0;
  for (const n of world.nodes()) {
    if (n.player !== enemy) continue;
    foeNodes++;
    foeIncome += BUILDING_DEFS[n.defId]?.income ?? 0;
  }
  let foeTowers = 0;
  let foeFarms = 0;
  for (const e of world.entities.values()) {
    if (e.kind !== "building" || e.player !== enemy || e.underConstruction) continue;
    if (e.defId === "tower") foeTowers++;
    else if (e.defId === "farm") foeFarms++;
  }
  const foeBase = world.baseOf(enemy);
  const base = world.baseOf(player);
  const cx = (world.map.w * TILE) / 2;
  const cy = (world.map.h * TILE) / 2;
  const side = homeSide(world, player);
  let foeHalfCount = 0;
  let foeHalfForce = 0;
  let threatTiles = Infinity;
  for (const u of foeArmy) {
    const s = Math.sign(u.x - cx + (u.y - cy)) || 0;
    if (s === side) {
      foeHalfCount++;
      foeHalfForce += (POWER[u.defId] ?? 1) * Math.max(0.2, u.hp / u.maxHp);
    }
    if (base) {
      const d = Math.hypot(u.x - base.x, u.y - base.y) / TILE;
      if (d < threatTiles) threatTiles = d;
    }
  }
  const foeTrend = foeForce - b.lastFoe;
  b.lastFoe = foeForce;
  const foe = world.players.find((p) => p.id === enemy);
  return {
    myForce,
    foeForce,
    soldier,
    archer,
    tank,
    foeWorkers,
    foeNodes,
    foeIncome,
    foeTowers,
    foeFarms,
    foeParched: isParched(world, enemy),
    myParched: isParched(world, player),
    foeCapped: (foe?.supplyUsed ?? 0) >= (foe?.supplyCap ?? 999),
    foeHalfCount,
    foeHalfForce,
    threatTiles,
    foeTrend,
    foeBasePct: foeBase ? foeBase.hp / foeBase.maxHp : -1,
  };
}

/** Câu đánh giá ngắn của quân sư cho HUD. */
function intelSummary(intel: EnemyIntel, posture: Posture): string {
  const parts: string[] = [];
  if (intel.soldier > 0) parts.push(`${intel.soldier}⚔`);
  if (intel.archer > 0) parts.push(`${intel.archer}🏹`);
  if (intel.tank > 0) parts.push(`${intel.tank}🛡`);
  const flags: string[] = [];
  if (intel.foeParched) flags.push("khát💧");
  if (intel.foeCapped) flags.push("đầy pop");
  if (intel.foeTowers > 0) flags.push(`${intel.foeTowers}🗼`);
  if (intel.foeHalfCount > 0) flags.push(`tràn sang ${intel.foeHalfCount}`);
  if (intel.foeTrend < -1) flags.push("đang yếu đi");
  else if (intel.foeTrend > 1) flags.push("đang mạnh lên");
  const workerBit = intel.foeWorkers > 0 ? ` · ${intel.foeWorkers}👷` : "";
  const intent =
    posture === "DEFEND" ? "→ thủ nhà"
    : posture === "PUSH" ? "→ tổng đẩy!"
    : posture === "HARASS" ? "→ quấy kinh tế"
    : "→ giữ tuyến";
  return `Địch ${parts.join("") || "trống"}${workerBit} · ${intel.foeNodes} mỏ +${intel.foeIncome}/s${flags.length > 0 ? " · " + flags.join(", ") : ""} ${intent}`;
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
  const intel = gatherIntel(world, player, b);
  const myForce = intel.myForce;
  const foeForce = intel.foeForce;
  const base = world.baseOf(player);
  const enemyBase = world.baseOf(enemy);
  if (mine.length === 0) {
    // Không còn quân — vẫn cập nhật đánh giá cho HUD.
    b.report = intelSummary(intel, b.posture);
    return;
  }

  const baseDanger = base ? 1 - base.hp / base.maxHp : 0;

  // Nghèo thì thủ, không nướng quân.
  const broke = pl.income < 5 && myForce < 3;
  // Ta khát nước / base xước thì không tổng đẩy ẩu.
  const caution = intel.myParched || baseDanger > 0.15;
  const pushTime = 200 - pl.defAtk * 140;
  const endgame = world.time > 540; // sudden death cận kề → đánh nhanh thắng nhanh
  const wantPush =
    !broke &&
    (myForce > foeForce * 1.3 + 1 ||
      (world.time > pushTime && myForce >= 4) ||
      (intel.foeParched && myForce >= foeForce) || // địch khát → đánh lúc yếu
      (intel.foeCapped && myForce > foeForce) || // địch đầy pop, không tiếp viện được
      (intel.foeBasePct >= 0 && intel.foeBasePct < 0.3 && myForce >= 3) || // base địch thoi thóp → kết liễu
      (endgame && myForce >= 3));

  // Địch mò tới nhà (trong 12 ô) hoặc tràn sang nửa ta đông hơn?
  const overrun = intel.foeHalfCount >= 2 && intel.foeHalfForce > myForce * 1.2 + 1;
  let posture: Posture;
  if ((intel.threatTiles < 12 && foeForce * 1.1 > myForce) || baseDanger > 0.25 || overrun) {
    posture = "DEFEND";
  } else if (wantPush && !caution && enemyBase) {
    posture = "PUSH";
  } else if (pl.defAtk > 0.65 && mine.length >= 2) {
    posture = "HARASS";
  } else {
    posture = "HOLD";
  }
  const changed = posture !== b.posture;
  b.posture = posture;
  b.report = intelSummary(intel, posture);

  const c = centroid(mine);
  const fp = focusPoint(world, player, pl.focus);
  // Mục tiêu quấy: worker địch hở sườn gần nhất — ưu tiên thợ đang giữ
  // mỏ của địch (đánh vào thu nhập), trừ điểm nếu có lính hộ tống.
  let harassTarget: Entity | null = null;
  if ((posture === "HARASS" || posture === "HOLD") && c) {
    let bestD = Infinity;
    for (const e of world.unitsOf(enemy)) {
      if (e.defId !== "worker") continue;
      const escort = world.queryRadius(e.x, e.y, 5 * TILE, { kind: "unit" })
        .filter((o) => o.player === enemy && o.defId !== "worker").length;
      let d = Math.hypot(e.x - c.x, e.y - c.y) + escort * 8 * TILE;
      for (const n of world.nodes()) {
        if (n.player !== enemy) continue;
        const nd = BUILDING_DEFS[n.defId];
        if (nd && Math.hypot(e.x - n.x, e.y - n.y) < nd.captureRadius * TILE) {
          d -= 6 * TILE;
          break;
        }
      }
      if (d < bestD) {
        bestD = d;
        harassTarget = e;
      }
    }
  }
  // Điểm hẹn theo thế trận: PUSH → base địch · DEFEND → tuyến nhà ·
  // HARASS có mục tiêu thì tới thẳng chỗ nó · còn lại theo trọng tâm tướng chọn.
  const goalX =
    posture === "PUSH" && enemyBase ? enemyBase.x
    : posture === "DEFEND" && base ? base.x + (fp.x - base.x) * 0.35
    : posture === "HARASS" && harassTarget ? harassTarget.x
    : fp.x;
  const goalY =
    posture === "PUSH" && enemyBase ? enemyBase.y
    : posture === "DEFEND" && base ? base.y + (fp.y - base.y) * 0.35
    : posture === "HARASS" && harassTarget ? harassTarget.y
    : fp.y;
  // Hướng tiến quân (để tank đi trước, archer lùi sau).
  let dx = 0;
  let dy = -1;
  if (c) {
    const d = Math.hypot(goalX - c.x, goalY - c.y) || 1;
    dx = (goalX - c.x) / d;
    dy = (goalY - c.y) / d;
  }

  const raiders = harassTarget
    ? mine.filter((u) => u.defId === "soldier").slice(0, 3)
    : [];
  const raiderIds = new Set(raiders.map((u) => u.id));

  // Đói thịt: cử tối đa 2 soldier rảnh đi săn thú gần nhất.
  let huntTarget: Entity | null = null;
  let hunterIds = new Set<number>();
  if ((pl.food ?? 0) < SHORTAGE_FOOD && c) {
    const hunters = mine
      .filter((u) => u.defId === "soldier" && !raiderIds.has(u.id) &&
        (u.state === "idle" || (u.state === "attackMoving" && u.path.length === 0)))
      .slice(0, 2);
    if (hunters.length > 0) {
      let bestD = Infinity;
      for (const e of world.entities.values()) {
        if (e.kind !== "unit" || !isCritterDef(e.defId)) continue;
        const d = Math.hypot(e.x - c.x, e.y - c.y);
        if (d < bestD) {
          bestD = d;
          huntTarget = e;
        }
      }
      if (huntTarget) hunterIds = new Set(hunters.map((u) => u.id));
    }
  }

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
    // Thủ nhà mà còn lảng vảng bên phần địch → gọi về tuyến thủ.
    const mySide = homeSide(world, player);
    const uSide = Math.sign(u.x - (world.map.w * TILE) / 2 + (u.y - (world.map.h * TILE) / 2)) || 0;
    const recall = posture === "DEFEND" && base !== null && uSide !== 0 && uSide !== mySide;

    if (!idleish && !changed && !retreat && !recall) continue;

    if (retreat && base) {
      order(world, u, base.x, base.y, true);
      continue;
    }
    if (recall && base) {
      order(world, u, goalX, goalY, false);
      continue;
    }
    if (raiderIds.has(u.id) && harassTarget) {
      order(world, u, harassTarget.x, harassTarget.y, false);
      continue;
    }
    if (hunterIds.has(u.id) && huntTarget) {
      u.targetId = huntTarget.id;
      u.state = "attacking";
      u.path = findPath(world.map, u.x, u.y, huntTarget.x, huntTarget.y) ?? [];
      u.repathTimer = 1.5;
      continue;
    }
    // Điểm tập kết theo thế trận + vai trò (tank trước, archer sau, soldier cánh).
    // HARASS có mục tiêu thì cả squad tới chỗ nó (raiders đi trước đã tách ở trên).
    let gx: number;
    let gy: number;
    if (posture === "PUSH" && enemyBase) {
      gx = enemyBase.x;
      gy = enemyBase.y;
    } else if (posture === "DEFEND" && base) {
      gx = base.x + (fp.x - base.x) * 0.35;
      gy = base.y + (fp.y - base.y) * 0.35;
    } else if (posture === "HARASS" && harassTarget) {
      gx = harassTarget.x;
      gy = harassTarget.y;
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
