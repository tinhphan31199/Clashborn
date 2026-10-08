/**
 * MonsterDirector — agent điều khiển phe quái (7) như một thế lực có chủ ý.
 *
 * Cách chạy (mỗi 2s nghĩ 1 lần):
 *  1. THỦ HANG (mặc định): quái ở yên slot — do monsterTick lo (aggro gần,
 *     lôi về khi đuổi xa, hồi máu tại hang).
 *  2. ĐI SĂN THEO ĐỢT: từ phút 5, mỗi 4 phút gom tối đa 4 quái vòng
 *     ngoài/giữa đánh úp cụm worker của phe yếu hơn (ưu tiên phe đang thắng
 *     để cân bằng game). Hết 45s hoặc đi quá xa thì tan đàn về hang.
 *  3. VỆ BOSS: rồng/demon bị đánh thì quái cùng dungeon co về bảo vệ boss.
 *  4. RÚT QUÂN: quái dưới 30% máu trong đợt săn thì bỏ về hang hồi máu.
 *
 * Lệnh đi qua field có sẵn (state + path + targetId) nên combatTick lo nốt
 * phần đánh. surgeSet cho monsterTick biết con nào đang đi săn để khỏi lôi về.
 */
import { TILE } from "../data";
import { findPath } from "../astar";
import { World } from "../World";
import { Entity, PlayerId } from "../types";

const THINK = 2.0;
const SURGE_START_AT = 300; // phút 5 mới đi săn đợt đầu
const SURGE_EVERY = 240; // mỗi 4 phút 1 đợt
const SURGE_LAST = 45; // mỗi đợt tối đa 45s
const SURGE_MAX_DIST = 40; // đi xa hang quá thì tan đàn
const PACK_SIZE = 4;

const thinkAt = new Map<string, number>();
let nextSurgeAt = SURGE_START_AT;
let surgeUntil = 0;
const surging = new Set<number>();

/** Có đợt săn đang diễn ra không (HUD báo động). */
export function surgeActive(world: World): boolean {
  return world.time < surgeUntil && surging.size > 0;
}

/** monsterTick gọi để khỏi lôi quái đang đi săn về hang. */
export function isSurging(id: number): boolean {
  return surging.has(id);
}

export function directorTick(world: World, dt: number) {
  const t = (thinkAt.get("all") ?? 0) - dt;
  thinkAt.set("all", t);
  if (t > 0) return;
  thinkAt.set("all", THINK);

  // Tan đàn hết giờ.
  if (world.time >= surgeUntil) surging.clear();

  defendBoss(world);
  regroupWounded(world);

  if (world.time >= nextSurgeAt && world.time >= surgeUntil) {
    nextSurgeAt = world.time + SURGE_EVERY;
    startSurge(world);
  }
  // Quái đi lạc quá xa (kẹt/bị lùa) → ép về.
  for (const id of [...surging]) {
    const u = world.get(id);
    if (!u || u.player !== 7) {
      surging.delete(id);
      continue;
    }
    const homeD = Math.hypot(u.patrolAx * TILE - u.x, u.patrolAy * TILE - u.y) / TILE;
    if (homeD > SURGE_MAX_DIST) {
      surging.delete(id);
      u.targetId = null;
      u.state = "moving";
      u.path = findPath(
        world.map, u.x, u.y,
        world.map.tileToWorldCenter(u.patrolAx),
        world.map.tileToWorldCenter(u.patrolAy)
      ) ?? [];
    }
  }
}

/** Boss (rồng, demon) bị đánh → quái cùng dungeon co về bảo vệ. */
function defendBoss(world: World) {
  for (const u of world.entities.values()) {
    if (u.kind !== "unit" || u.player !== 7) continue;
    if (u.defId !== "dragon" && u.defId !== "demon") continue;
    if (u.hp >= u.maxHp) continue;
    const foeNear = world.queryRadius(u.x, u.y, 8 * TILE, { kind: "unit" })
      .some((e) => (e.player === 0 || e.player === 1));
    if (!foeNear) continue;
    // Gọi viện: quái cùng dungeon (trong 20 ô) tới chỗ boss.
    for (const v of world.queryRadius(u.x, u.y, 20 * TILE, { kind: "unit" })) {
      if (v.player !== 7 || v.id === u.id) continue;
      if (v.state === "attacking") continue;
      v.targetId = null;
      v.state = "attackMoving";
      v.path = findPath(world.map, v.x, v.y, u.x, u.y) ?? [];
    }
  }
}

/** Quái yếu máu trong đợt săn → bỏ về hang hồi máu. */
function regroupWounded(world: World) {
  for (const id of [...surging]) {
    const u = world.get(id);
    if (!u) {
      surging.delete(id);
      continue;
    }
    if (u.hp < u.maxHp * 0.3) {
      surging.delete(id);
      u.targetId = null;
      u.state = "moving";
      u.path = findPath(
        world.map, u.x, u.y,
        world.map.tileToWorldCenter(u.patrolAx),
        world.map.tileToWorldCenter(u.patrolAy)
      ) ?? [];
    }
  }
}

/** Mở đợt săn: tối đa 4 quái ngoài/giữa đánh úp worker phe yếu hơn. */
function startSurge(world: World) {
  // Phe yếu hơn (ít lực quân) là mồi — ưu tiên đánh phe đang thắng để cân game.
  const forceOf = (p: PlayerId): number => {
    let s = 0;
    for (const u of world.unitsOf(p)) {
      if (u.defId === "worker") continue;
      s += Math.max(0.2, u.hp / u.maxHp);
    }
    return s;
  };
  const prey: PlayerId = forceOf(0) <= forceOf(1) ? 0 : 1;
  // Cụm worker đông nhất của con mồi.
  let target: Entity | null = null;
  let bestScore = -1;
  for (const w of world.unitsOf(prey)) {
    if (w.defId !== "worker") continue;
    const crowd = world.queryRadius(w.x, w.y, 4 * TILE, { kind: "unit" })
      .filter((e) => e.player === prey && e.defId === "worker").length;
    const escort = world.queryRadius(w.x, w.y, 5 * TILE, { kind: "unit" })
      .filter((e) => e.player === prey && e.defId !== "worker").length;
    const score = crowd * 2 - escort * 3;
    if (score > bestScore) {
      bestScore = score;
      target = w;
    }
  }
  if (!target) return;
  // Gom quái vòng ngoài/giữa (không động boss) gần mục tiêu nhất.
  const pack = [...world.entities.values()]
        .filter((e) =>
          e.kind === "unit" && e.player === 7 &&
          e.defId !== "dragon" && e.defId !== "demon" &&
          e.state !== "attacking" && !surging.has(e.id)
        )
        .sort((a, b) =>
          Math.hypot(a.x - target!.x, a.y - target!.y) -
          Math.hypot(b.x - target!.x, b.y - target!.y)
        )
        .slice(0, PACK_SIZE);
  if (pack.length === 0) return;
  surgeUntil = world.time + SURGE_LAST;
  for (const u of pack) {
    surging.add(u.id);
    u.targetId = target!.id;
    u.state = "attacking";
    u.path = [];
  }
}
