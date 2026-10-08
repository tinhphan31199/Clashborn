/**
 * MonsterSystem — quái dungeon phe MONSTER (7).
 *
 * 3 vành đai khó tăng dần: ngoài slime → giữa orc/skeleton → lõi demon + rồng.
 * Tái dùng combat có sẵn (đánh/đuổi theo mục tiêu); system này chỉ lo:
 * quây quần đúng slot, respawn theo giờ, aggro trong tầm, lôi về hang (leash)
 * kèm hồi máu, scale HP theo thời gian trận.
 */
import { MONSTER, TILE, UNIT_DEFS } from "../data";
import { findPath } from "../astar";
import { dungeonZones, World } from "../World";
import { isSurging } from "./monsterDirector";
import { Entity } from "../types";

interface SlotDef {
  dx: number;
  dy: number;
  defId: string;
  respawn: number;
}

const SLOTS: SlotDef[] = [
  { dx: 10, dy: 0, defId: "slime", respawn: 45 },
  { dx: -10, dy: 0, defId: "slimeblue", respawn: 45 },
  { dx: 0, dy: 10, defId: "slime", respawn: 45 },
  { dx: 0, dy: -10, defId: "slimeblue", respawn: 45 },
  { dx: 8, dy: 8, defId: "slime", respawn: 45 },
  { dx: -8, dy: -8, defId: "slimeblue", respawn: 45 },
  { dx: 6, dy: 0, defId: "orc", respawn: 60 },
  { dx: -6, dy: 0, defId: "orc", respawn: 60 },
  { dx: 0, dy: 6, defId: "skeleton", respawn: 60 },
  { dx: 0, dy: -6, defId: "skeleton", respawn: 60 },
  { dx: 5, dy: -5, defId: "bigslime", respawn: 60 },
  { dx: 0, dy: 0, defId: "demon", respawn: 120 },
  { dx: 4, dy: 2, defId: "dragon", respawn: 180 },
];

const LEASH_TILES = 12;
const AGGRO_TILES = 5;
const BOSS_AGGRO_TILES = 7;

/** Sinh sôi: mỗi 30s thêm quái tới khi đầy hang, đầy thì tràn ra cửa. */
const GROW_EVERY = 30;
const DUNGEON_CAP = 20;
const OVERFLOW_CAP = 8;
const nextGrowAt = new WeakMap<World, number[]>();

/** Quái đẻ thêm: 70% vòng ngoài, 30% vòng giữa (sau phút 10 có demon). */
function growTier(world: World): string {
  const r = world.rand();
  if (world.time > 600 && r < 0.12) return "demon";
  if (r < 0.35) return world.rand() < 0.5 ? "orc" : "skeleton";
  if (r < 0.5) return "bigslime";
  return world.rand() < 0.5 ? "slime" : "slimeblue";
}

/** Giờ được spawn lại của từng slot (reset khi load save — populate lại ngay). */
const respawnAt = new Map<string, number>();

/** Scale HP theo thời gian trận (dungeon càng về sau càng khó). */
export function monsterScale(world: World): number {
  return 1 + Math.min(1, world.time / 600);
}

export function monsterTick(world: World) {
  const zones = dungeonZones();
  // A. giữ quân số + respawn
  zones.forEach((z, zi) => {
    SLOTS.forEach((s, si) => {
      const tx = z.cx + s.dx;
      const ty = z.cy + s.dy;
      const key = `${zi}:${si}`;
      const live = monsterAt(world, tx, ty);
      if (live) return;
      if ((respawnAt.get(key) ?? 0) > world.time) return;
      spawnMonster(world, s.defId, tx, ty);
      respawnAt.set(key, world.time + s.respawn);
    });
    growDungeon(world, zi, z);
  });
  // B. aggro + leash
  for (const e of world.entities.values()) {
    if (e.kind !== "unit" || e.player !== MONSTER) continue;
    const homeX = e.patrolAx;
    const homeY = e.patrolAy;
    const homeWx = world.map.tileToWorldCenter(homeX);
    const homeWy = world.map.tileToWorldCenter(homeY);
    const homeD = Math.hypot(homeWx - e.x, homeWy - e.y) / TILE;
    // Về tới hang → nghỉ + hồi đầy.
    if (homeD < 1.5 && e.state !== "attacking") {
      if (e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.05);
      if (e.state === "moving" && e.path.length === 0) e.state = "idle";
      continue;
    }
    // Lôi về khi đuổi quá xa hang (trừ quái đang đi săn theo lệnh director).
    if (homeD > LEASH_TILES && !isSurging(e.id)) {
      e.targetId = null;
      e.state = "moving";
      e.path = findPath(world.map, e.x, e.y, homeWx, homeWy) ?? [];
      continue;
    }
    // Aggro: con mồi phe người trong tầm (rồng ngửi xa hơn).
    if (e.state === "idle" || (e.state === "moving" && e.path.length === 0)) {
      const range = (e.defId === "dragon" ? BOSS_AGGRO_TILES : AGGRO_TILES) * TILE;
      const prey = nearestPrey(world, e.x, e.y, range);
      if (prey) {
        e.targetId = prey.id;
        e.state = "attacking";
        e.path = [];
      }
    }
  }
}

/** Sinh sôi + tràn hang: 30s đẻ thêm 1 con tới khi đầy, đầy thì tràn ra cửa. */
function growDungeon(world: World, zi: number, z: { x: number; y: number; w: number; h: number; cx: number; cy: number }) {
  let timers = nextGrowAt.get(world);
  if (!timers) {
    timers = [];
    nextGrowAt.set(world, timers);
  }
  if ((timers[zi] ?? 0) > world.time) return;
  timers[zi] = world.time + GROW_EVERY;

  const inside = (tx: number, ty: number) =>
    tx >= z.x && tx < z.x + z.w && ty >= z.y && ty < z.y + z.h;
  // Quái nhà trong hang vs quái tràn của RIÊNG hang này (nhà ở cửa ngoài gần đó).
  const zcx = (z.x + z.w / 2) * TILE;
  const zcy = (z.y + z.h / 2) * TILE;
  let pop = 0;
  let overflow = 0;
  for (const e of world.entities.values()) {
    if (e.kind !== "unit" || e.player !== MONSTER) continue;
    if (inside(e.patrolAx, e.patrolAy)) pop++;
    else if (Math.hypot(e.patrolAx * TILE - zcx, e.patrolAy * TILE - zcy) < 25 * TILE) overflow++;
  }
  if (pop < DUNGEON_CAP) {
    // Còn chỗ: đẻ thêm trong hang.
    const spot = freeSpot(world, z);
    if (spot) spawnMonster(world, growTier(world), spot.tx, spot.ty);
  } else if (overflow < OVERFLOW_CAP) {
    // Đầy hang: tràn ra cửa (điểm xuất phát = cửa, ở đó luôn).
    const door = doorSpot(world, z);
    if (door) spawnMonster(world, growTier(world), door.tx, door.ty);
  }
}

/** Ô trống trong hang (đi được, không ai đứng). */
function freeSpot(world: World, z: { x: number; y: number; w: number; h: number; cx: number; cy: number }): { tx: number; ty: number } | null {
  for (let k = 0; k < 20; k++) {
    const tx = z.x + 1 + Math.floor(world.rand() * (z.w - 2));
    const ty = z.y + 1 + Math.floor(world.rand() * (z.h - 2));
    if (!world.map.passable(tx, ty)) continue;
    const cx = world.map.tileToWorldCenter(tx);
    const cy = world.map.tileToWorldCenter(ty);
    const crowded = world.queryRadius(cx, cy, TILE, { kind: "unit" }).length > 0;
    if (!crowded) return { tx, ty };
  }
  return null;
}

/** Ô trống ngay ngoài cửa hang (quái tràn ra đứng đây). */
function doorSpot(world: World, z: { x: number; y: number; w: number; h: number; cx: number; cy: number }): { tx: number; ty: number } | null {
  const midX = z.x + Math.floor(z.w / 2);
  const southDoor = z.cy < world.map.h / 2;
  // Cửa chính (cạnh quay về tâm map) + cửa hông.
  const cands = southDoor
    ? [{ tx: midX, ty: z.y + z.h + 1 }, { tx: z.x - 1, ty: z.y + Math.floor(z.h / 2) }]
    : [{ tx: midX, ty: z.y - 1 }, { tx: z.x + z.w, ty: z.y + Math.floor(z.h / 2) }];
  for (const c of cands) {
    if (!world.map.inBounds(c.tx, c.ty) || !world.map.passable(c.tx, c.ty)) continue;
    return c;
  }
  return null;
}

function monsterAt(world: World, tx: number, ty: number): Entity | null {
  for (const e of world.entities.values()) {
    if (e.kind === "unit" && e.player === MONSTER && e.patrolAx === tx && e.patrolAy === ty) {
      return e;
    }
  }
  return null;
}

function nearestPrey(world: World, x: number, y: number, rangePx: number): Entity | null {
  let best: Entity | null = null;
  let bestD = rangePx * rangePx;
  for (const e of world.queryRadius(x, y, rangePx)) {
    if (e.kind !== "unit") continue;
    if (e.player !== 0 && e.player !== 1) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function spawnMonster(world: World, defId: string, tx: number, ty: number) {
  const def = UNIT_DEFS[defId];
  if (!def) return;
  const x = world.map.tileToWorldCenter(tx);
  const y = world.map.tileToWorldCenter(ty);
  const e = world.spawnUnit(defId, MONSTER, x, y);
  const mult = monsterScale(world);
  e.hp = e.maxHp = Math.round(def.hp * mult);
  e.patrolAx = tx;
  e.patrolAy = ty;
  e.state = "idle";
  e.path = [];
  e.targetId = null;
}
