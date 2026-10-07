/**
 * CombatSystem — AUTO-BATTLER edition.
 * - Worker (range 0) không bao giờ đánh.
 * - Mục tiêu chọn theo ưu tiên từng loại lính (World.pickTargetFor).
 * - Archer bắn tên (projectile), còn lại hitscan. Tank splash nhẹ.
 * - Veterancy giữ lại: 4 kills ★ (+15%), 8 kills ★★ (+30% + hồi máu).
 */
import { BUILDING_DEFS, TILE, UNIT_DEFS } from "../data";
import { findPath } from "../astar";
import { Entity } from "../types";
import { World } from "../World";
import { isParched } from "./economy";

export function combatTick(world: World, dt: number) {
  updateProjectiles(world, dt);
  baseDefenseTick(world, dt);

  for (const u of world.entities.values()) {
    if (u.kind !== "unit") continue;
    const def = UNIT_DEFS[u.defId];
    if (!def) continue;
    if (u.attackCooldown > 0) u.attackCooldown -= dt;
    if (def.range <= 0) continue;

    const vetMul = u.vetLevel === 2 ? 1.3 : u.vetLevel === 1 ? 1.15 : 1;
    const weakMul = isParched(world, u.player) ? 0.7 : 1; // khát nước: yếu 30%
    const rangePx = def.range * TILE;
    const sightPx = def.sight * TILE;

    let target = world.get(u.targetId);
    if (target && target.hp <= 0) {
      world.removeEntity(target.id);
      target = undefined;
      u.targetId = null;
    }

    if (u.state === "attacking") {
      if (!target) {
        u.state = "idle";
        continue;
      }
      const d = Math.hypot(target.x - u.x, target.y - u.y);
      if (d <= rangePx) {
        u.path.length = 0;
        u.facing = Math.atan2(target.y - u.y, target.x - u.x);
        fireAt(world, u, target, def.cooldown, def.damage * vetMul * weakMul);
      } else {
        // Truy đuổi (tank chậm, archer giữ khoảng cách nhờ range lớn).
        u.repathTimer -= dt;
        if (u.path.length === 0 || u.repathTimer <= 0) {
          const p = findPath(world.map, u.x, u.y, target.x, target.y);
          if (p) u.path = p;
          u.repathTimer = 0.5;
        }
      }
    } else {
      // Rảnh → nhặt mục tiêu theo ưu tiên. Đứng yên cũng tự vệ trong range.
      const scan = u.state === "idle" && u.path.length === 0 ? Math.max(rangePx, sightPx * 0.5) : sightPx;
      const enemy = world.priorityEnemy(u, scan);
      if (enemy) {
        u.targetId = enemy.id;
        u.state = "attacking";
        u.path.length = 0;
      }
    }
  }
}

/** Base tự vệ (pháo 🏰): range 7, dmg 25 — để rush không ăn chùa, turtle có cửa. */
const BASE_RANGE_PX = 7 * TILE;
const BASE_DMG = 25;
const BASE_CD = 1.2;

function baseDefenseTick(world: World, dt: number) {
  for (const b of world.entities.values()) {
    if (b.kind !== "building" || b.defId !== "base") continue;
    if (b.attackCooldown > 0) b.attackCooldown -= dt;
    if (b.attackCooldown > 0) continue;
    const victim = world.queryRadius(b.x, b.y, BASE_RANGE_PX).filter(
      (e) => e.kind === "unit" && e.player !== b.player && e.player >= 0
    )[0];
    if (!victim) continue;
    b.attackCooldown = BASE_CD;
    b.facing = 0;
    world.addEffect({
      kind: "tracer", x1: b.x, y1: b.y - 20, x2: victim.x, y2: victim.y,
      ttl: 0.12, maxTtl: 0.12, color: "#ff9d4d",
    });
    damageEntity(world, victim, BASE_DMG);
  }
}

function fireAt(world: World, attacker: Entity, target: Entity, cooldown: number, damage: number) {
  if (attacker.attackCooldown > 0) return;
  attacker.attackCooldown = cooldown;
  const def = UNIT_DEFS[attacker.defId];

  if (def.projectileSpeed > 0) {
    world.spawnProjectile({
      player: attacker.player,
      x: attacker.x,
      y: attacker.y,
      targetId: target.id,
      tx: target.x,
      ty: target.y,
      speed: def.projectileSpeed,
      damage,
      splash: def.splash,
      bonusVsBuilding: def.bonusVsBuilding,
      attackerId: attacker.id,
      color: "#ffd34d",
      ttl: 3,
    });
    return;
  }

  // Tank splash ngay cả khi đánh gần.
  if (def.splash > 0) {
    const victims = world.queryRadius(target.x, target.y, def.splash).filter(
      (v) => v.player !== attacker.player && v.player >= 0 && (v.kind === "unit" || v.kind === "building")
    );
    for (const v of victims) damageEntity(world, v, damage, attacker);
    world.addEffect({
      kind: "explosion", x1: target.x, y1: target.y, x2: target.x, y2: target.y,
      ttl: 0.25, maxTtl: 0.25, color: "#ff7b2d",
    });
    return;
  }

  world.addEffect({
    kind: "tracer",
    x1: attacker.x, y1: attacker.y, x2: target.x, y2: target.y,
    ttl: 0.12, maxTtl: 0.12, color: "#ffd34d",
  });
  damageEntity(world, target, damage, attacker);
}

function updateProjectiles(world: World, dt: number) {
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const pr = world.projectiles[i];
    const live = world.get(pr.targetId);
    const tx = live ? live.x : pr.tx;
    const ty = live ? live.y : pr.ty;
    const dx = tx - pr.x;
    const dy = ty - pr.y;
    const d = Math.hypot(dx, dy);
    const step = pr.speed * dt;
    pr.ttl -= dt;
    if (d <= Math.max(step, 6) || pr.ttl <= 0) {
      const t = world.get(pr.targetId);
      const attacker = world.get(pr.attackerId);
      if (t) damageEntity(world, t, pr.damage, attacker ?? undefined);
      else {
        world.addEffect({
          kind: "explosion", x1: tx, y1: ty, x2: tx, y2: ty,
          ttl: 0.2, maxTtl: 0.2, color: "#6b5a43",
        });
      }
      world.projectiles.splice(i, 1);
    } else {
      pr.x += (dx / d) * step;
      pr.y += (dy / d) * step;
    }
  }
}

/** Sát thương có giáp + bonus công trình + veterancy. */
export function damageEntity(world: World, target: Entity, amount: number, attacker?: Entity) {
  const armor =
    target.kind === "unit"
      ? UNIT_DEFS[target.defId]?.armor ?? 0
      : BUILDING_DEFS[target.defId]?.armor ?? 0;
  let final = amount - armor;
  if (attacker && target.kind === "building") {
    const bonus = UNIT_DEFS[attacker.defId]?.bonusVsBuilding ?? 0;
    final = final * (1 + bonus);
  }
  final = Math.max(1, Math.round(final));
  target.hp -= final;

  if (target.hp <= 0) {
    const big = target.kind === "building";
    world.addEffect({
      kind: "explosion",
      x1: target.x, y1: target.y, x2: target.x, y2: target.y,
      ttl: big ? 0.7 : 0.4, maxTtl: big ? 0.7 : 0.4,
      color: big ? "#ff7b2d" : "#ffb02d",
    });
    if (attacker && attacker.kind === "unit") {
      attacker.kills++;
      const next = attacker.kills >= 8 ? 2 : attacker.kills >= 4 ? 1 : 0;
      if (next > attacker.vetLevel) {
        attacker.vetLevel = next;
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + attacker.maxHp * 0.25);
        world.addEffect({
          kind: "spark", x1: attacker.x, y1: attacker.y, x2: attacker.x, y2: attacker.y,
          ttl: 0.5, maxTtl: 0.5, color: "#fff06a",
        });
      }
    }
    world.removeEntity(target.id);
  }
}

export function clearCombatCaches() {
  // Không còn cache toàn cục.
}
