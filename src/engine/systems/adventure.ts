/**
 * AdventureSystem — mạo hiểm giả (15% khi spawn worker).
 *
 * Vòng đời: tới công hội nhận nhiệm vụ (rank F→SS theo level) → đi săn quái
 * đúng cấp → về hội trả nhiệm vụ lấy vàng → lên cấp (máu + sao veteran) →
 * nhận nhiệm vụ rank cao hơn. Tất cả tự động, 2 phe đều có.
 *
 * Lệnh đi qua field có sẵn (state + path + targetId) nên combatTick lo nốt
 * phần đánh; commander/workerBrain/overseer đều bỏ qua adventurer.
 */
import { TILE } from "../data";
import { findPath } from "../astar";
import { World } from "../World";
import { AdventureQuest, Entity, PlayerId } from "../types";

const THINK = 1.0;
const thinkAt = new Map<PlayerId, number>();

const RANKS = ["F", "E", "D", "C", "B", "A", "S", "SS"] as const;

/** Template nhiệm vụ theo rank: cấp quái tối thiểu, số con, vàng, exp. */
const QUESTS: Record<string, { tier: number; count: number; gold: number; exp: number }> = {
  F: { tier: 1, count: 1, gold: 30, exp: 50 },
  E: { tier: 1, count: 2, gold: 45, exp: 60 },
  D: { tier: 2, count: 2, gold: 80, exp: 100 },
  C: { tier: 2, count: 3, gold: 130, exp: 150 },
  B: { tier: 3, count: 1, gold: 200, exp: 250 },
  A: { tier: 3, count: 2, gold: 320, exp: 400 },
  S: { tier: 4, count: 1, gold: 500, exp: 700 },
  SS: { tier: 4, count: 2, gold: 800, exp: 1000 },
};

const TIER: Record<string, number> = {
  slime: 1, slimeblue: 1,
  bigslime: 2, orc: 2, skeleton: 2,
  demon: 3, dragon: 4,
};

export function adventurerLevel(u: Entity): number {
  return u.advLevel || 1;
}

const expNeed = (lv: number) => lv * 100;

function rankOfLevel(lv: number): string {
  return RANKS[Math.min(Math.max(lv, 1), 8) - 1];
}

function findGuild(world: World): Entity | null {
  for (const e of world.entities.values()) {
    if (e.kind === "building" && e.defId === "guild") return e;
  }
  return null;
}

function standNear(world: World, tx: number, ty: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = tx + dx;
      const y = ty + dy;
      if (!world.map.inBounds(x, y) || !world.map.passable(x, y)) continue;
      const cx = world.map.tileToWorldCenter(x);
      const cy = world.map.tileToWorldCenter(y);
      const d = Math.abs(dx) + Math.abs(dy);
      if (d < bestD) {
        bestD = d;
        best = { x: cx, y: cy };
      }
    }
  }
  return best;
}

function goTo(world: World, u: Entity, x: number, y: number, attacking: boolean) {
  const p = findPath(world.map, u.x, u.y, x, y);
  if (p && p.length > 0) {
    u.path = p;
    u.state = attacking ? "attackMoving" : "moving";
  } else {
    u.state = "idle"; // hết budget tìm đường → đứng yên thử lại tick sau
    u.path = [];
  }
  if (!attacking) u.targetId = null;
  u.repathTimer = 1.5;
}

export function adventureTick(world: World, dt: number) {
  // Think chung mỗi giây (đơn vị tự xử khi rảnh như commander).
  const t = (thinkAt.get(-99) ?? 0) - dt;
  thinkAt.set(-99, t);
  const doThink = t <= 0;
  if (doThink) thinkAt.set(-99, THINK);

  const guild = findGuild(world);
  for (const u of world.entities.values()) {
    if (u.kind !== "unit" || u.defId !== "adventurer") continue;
    // Về hội thì hồi máu dần (mỗi tick, không cần think).
    if (guild && Math.hypot(guild.x - u.x, guild.y - u.y) < 4 * TILE && u.hp < u.maxHp) {
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.1 * dt);
    }
    // Máu thấp khi đi săn → về hội nghỉ (kể cả đang đánh cũng rút).
    if (u.quest && u.quest.phase === "hunt" && u.hp < u.maxHp * 0.4) {
      u.quest.phase = "rest";
      u.targetId = null;
    }
    if (u.state === "attacking") continue;
    // Lạc trạng thái (moving mà hết path do hụt tìm đường) → về idle để ra lệnh lại.
    if (u.state === "moving" && u.path.length === 0) u.state = "idle";
    // Gặp lính ĐỊCH hoặc boss quá sức thì chạy — chỉ săn quái đúng tầm.
    if (true) {
      let fx = 0;
      let fy = 0;
      let found = false;
      const myTier = u.quest ? u.quest.needTier : 1;
      const hunting = u.targetId !== null;
      for (const o of world.queryRadius(u.x, u.y, 7 * TILE, { kind: "unit" })) {
        if (o.player !== 0 && o.player !== 1) {
          // Quái quá sức (boss/demon với quest thấp) cũng né.
          if (o.player !== 7) continue;
          // Đang đi đường (chưa săn) thì né mọi quái để khỏi kẹt đánh nhau.
          if (!hunting && o.id !== u.targetId) continue;
          if ((TIER[o.defId] ?? 0) < Math.max(3, myTier + 1)) continue;
        } else if (o.player === u.player) continue;
        const d = Math.hypot(u.x - o.x, u.y - o.y) || 1;
        fx += (u.x - o.x) / d;
        fy += (u.y - o.y) / d;
        found = true;
      }
      if (found && u.path.length === 0) {
        const m = Math.hypot(fx, fy) || 1;
        goTo(world, u, u.x + (fx / m) * 4 * TILE, u.y + (fy / m) * 4 * TILE, false);
        continue;
      }
      if (found) continue;
    }
    if (!doThink && !(u.state === "idle" && u.path.length === 0)) continue;

    const q = u.quest;
    // Chưa có nhiệm vụ → tới hội nhận.
    if (!q) {
      if (!guild) continue;
      const near = Math.hypot(guild.x - u.x, guild.y - u.y) < 3 * TILE;
      if (near) {
        const rank = rankOfLevel(adventurerLevel(u));
        const tpl = QUESTS[rank];
        u.quest = {
          rank, needTier: tpl.tier, needCount: tpl.count,
          log: [], rewardGold: tpl.gold, rewardExp: tpl.exp, phase: "hunt",
        };
        u.state = "idle";
        u.path = [];
      } else if (u.state === "idle" && u.path.length === 0) {
        const s = standNear(world, guild.tx + 1, guild.ty + 1);
        if (s) goTo(world, u, s.x, s.y, false);
      }
      continue;
    }

    // Đủ kill → về hội trả.
    const done = q.log.filter((id) => (TIER[id] ?? 0) >= q.needTier).length;
    if (done >= q.needCount) q.phase = "return";
    if (q.phase === "return") {
      if (!guild) continue;
      if (Math.hypot(guild.x - u.x, guild.y - u.y) < 3 * TILE) {
        turnIn(world, u, q);
      } else if (u.state === "idle" && u.path.length === 0) {
        const s = standNear(world, guild.tx + 1, guild.ty + 1);
        if (s) goTo(world, u, s.x, s.y, false);
      }
      continue;
    }

    // Máu thấp khi đi săn → về hội nghỉ, khỏe lại đi tiếp.
    if (q.phase === "hunt" && u.hp < u.maxHp * 0.4) q.phase = "rest";
    if (q.phase === "rest") {
      if (!guild) continue;
      if (Math.hypot(guild.x - u.x, guild.y - u.y) < 3 * TILE) {
        if (u.hp > u.maxHp * 0.8) q.phase = "hunt";
        if (u.state === "idle") continue;
        u.state = "idle";
        u.path = [];
        continue;
      } else if (u.state === "idle" && u.path.length === 0) {
        const s = standNear(world, guild.tx + 1, guild.ty + 1);
        if (s) goTo(world, u, s.x, s.y, false);
      }
      continue;
    }

    // Đi săn theo party: quái đúng cấp gần nhất, ưu tiên con lẻ,
    // tránh boss, và nhập bọn với đồng đội cùng phe đang đánh nó.
    if (u.state !== "idle" && u.path.length > 0) continue;
    let best: Entity | null = null;
    let bestScore = Infinity;
    for (const e of world.entities.values()) {
      if (e.kind !== "unit" || e.player !== 7) continue;
      if ((TIER[e.defId] ?? 0) < q.needTier) continue;
      if (q.needTier < 3) {
        let guard = false;
        for (const o of world.queryRadius(e.x, e.y, 8 * TILE, { kind: "unit" })) {
          if (o.player === 7 && (TIER[o.defId] ?? 0) >= 3) {
            guard = true;
            break;
          }
        }
        if (guard) continue;
      }
      const pack = world.queryRadius(e.x, e.y, 4 * TILE, { kind: "unit" })
        .filter((o) => o.player === 7).length;
      // Đồng đội cùng phe quanh mục tiêu → nhập party hội đồng.
      const mates = world.queryRadius(e.x, e.y, 8 * TILE, { kind: "unit" })
        .filter((o) => o.player === u.player && o.defId === "adventurer" && o.id !== u.id).length;
      const score = Math.hypot(e.x - u.x, e.y - u.y) + pack * 8 * TILE - mates * 10 * TILE;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (best) {
      u.targetId = best.id;
      u.state = "attacking";
      u.path = [];
    }
  }
}

/** Ghi kill vào nhiệm vụ (gọi từ damageEntity khi có mạng). */
export function logAdventureKill(attacker: Entity, targetDefId: string) {
  const q = attacker.quest;
  if (!q || attacker.defId !== "adventurer") return;
  if (q.log.length < 20) q.log.push(targetDefId);
}

function turnIn(world: World, u: Entity, q: AdventureQuest) {
  const pl = world.players.find((p) => p.id === u.player);
  if (pl) pl.ore += q.rewardGold;
  let lv = adventurerLevel(u);
  let xp = (u.advExp || 0) + q.rewardExp;
  while (lv < 10 && xp >= expNeed(lv)) {
    xp -= expNeed(lv);
    lv++;
    u.maxHp += 25;
    u.hp = u.maxHp;
    u.vetLevel = Math.min(2, Math.floor(lv / 3));
  }
  u.advLevel = lv;
  u.advExp = xp;
  u.quest = null;
  u.state = "idle";
  u.path = [];
  world.addEffect({
    kind: "spark", x1: u.x, y1: u.y, x2: u.x, y2: u.y,
    ttl: 0.8, maxTtl: 0.8, color: "#ffd34d",
  });
}
