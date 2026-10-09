/**
 * Game — AUTO-BATTLER edition.
 * Người chơi & AI chỉ spawnUnit + setDirective. Mọi unit tự đánh (autoTick).
 *
 * Vòng lặp: agents (AI + overseer ra lệnh) → construction → auto → movement
 * → combat → economy → fog → sudden death → win.
 */
import { Command } from "./commands";
import { resetPathBudget } from "./astar";
import { BUILDING_DEFS, SUDDEN_DEATH_AT, TILE, UNIT_DEFS } from "./data";
import { AIController, AIOptions } from "./systems/ai";
import { autoTick } from "./systems/auto";
import { combatTick } from "./systems/combat";
import { constructionTick } from "./systems/construction";
import { economyTick, suddenDeathActive } from "./systems/economy";
import { overseerTick } from "./systems/overseer";
import { fogTick } from "./systems/fog";
import { monsterTick } from "./systems/monster";
import { directorTick } from "./systems/monsterDirector";
import { critterTick } from "./systems/critter";
import { adventureTick } from "./systems/adventure";
import { movementTick } from "./systems/movement";
import { Entity, GamePhase, PlayerId, PlayerState } from "./types";
import { NEUTRAL } from "./types";
import { T_WOOD } from "./TileMap";
import { MAP_H, MAP_W, World } from "./World";
import { UnitDef } from "./data";

export const HUMAN: PlayerId = 0;
export const AI_PLAYER: PlayerId = 1;

const STEP = 1 / 60;
const START_GOLD = 100;

export interface GameOptions {
  startingGold?: number;
  suddenDeath?: boolean;
  ai?: AIOptions;
}

export interface LoggedCommand {
  tick: number;
  cmd: Command;
}

export class Game {
  world: World;
  phase: GamePhase = "playing";
  seed: number;
  tickCount = 0;
  commandLog: LoggedCommand[] = [];
  speed = 1;
  paused = false;
  suddenDeath = false;
  private ai = new AIController(AI_PLAYER);
  private acc = 0;
  /** think-timer cho auto-spend của từng phe */
  private autoSpendTimer = new Map<PlayerId, number>();
  startFocus = { x: 0, y: 0 };
  private opts: GameOptions;

  constructor(seed = 20261007, opts?: GameOptions) {
    this.seed = seed >>> 0;
    this.opts = opts ?? {};
    this.ai = new AIController(AI_PLAYER, this.opts.ai);
    this.world = new World(this.seed);
    this.setupScenario();
  }

  // ------------------------------------------------------------ scenario
  // Đối xứng gương qua tâm: A trên-trái, B dưới-phải, 5 node ở giữa.

  private setupScenario() {
    const w = this.world;
    const startGold = this.opts.startingGold ?? START_GOLD;
    w.addPlayer(HUMAN, "Blue", "#3b82f6", startGold);
    w.addPlayer(AI_PLAYER, "Red", "#ef4444", startGold);

    const cx = Math.floor(MAP_W / 2);
    const cy = Math.floor(MAP_H / 2);

    // Dọn địa hình quanh base/node trước để không kẹt nước/rừng.
    for (const [tx, ty, r] of [
      [20, 16, 12], [MAP_W - 20 - 4, MAP_H - 16 - 4, 12],
      [40, 40, 10], [MAP_W - 40 - 2, MAP_H - 40 - 2, 10],
      [68, 84, 10], [MAP_W - 68 - 2, MAP_H - 84 - 2, 10],
      [cx - 1, cy - 1, 10],
    ] as const) {
      w.map.clearArea(tx + 2, ty + 1, r);
    }

    // Base hai đầu map 192.
    this.place("base", HUMAN, 20, 16);
    this.place("base", AI_PLAYER, MAP_W - 20 - 4, MAP_H - 16 - 4);

    // 5 node vàng: 2 gần mỗi bên + 2 trung gian + 1 trung tâm.
    this.place("node_near", -1, 40, 40);
    this.place("node_near", -1, MAP_W - 40 - 2, MAP_H - 40 - 2);
    this.place("node_mid", -1, 68, 84);
    this.place("node_mid", -1, MAP_W - 68 - 2, MAP_H - 84 - 2);
    this.place("node_center", -1, cx - 1, cy - 1);

    // Sân dirt quanh base + quanh các mỏ, đường dirt base→mỏ→trung tâm.
    // Tọa độ SUY TỪ công trình đã đặt (không hardcode) để đổi map size vẫn đúng.
    // Chỉ lên ô cỏ trống, đối xứng theo vị trí thực 2 phe.
    const tileCenter = (e: { tx: number; ty: number; tw: number; th: number }) => ({
      tx: Math.floor(e.tx + e.tw / 2),
      ty: Math.floor(e.ty + e.th / 2),
    });
    const dist = (
      a: { tx: number; ty: number },
      b: { tx: number; ty: number }
    ): number => Math.hypot(a.tx - b.tx, a.ty - b.ty);
    for (const side of [HUMAN, AI_PLAYER] as const) {
      const b = w.baseOf(side);
      if (!b) continue;
      const bc = tileCenter(b);
      const near = w
        .nodes()
        .filter((n) => n.defId === "node_near")
        .sort((p, q) => dist(tileCenter(p), bc) - dist(tileCenter(q), bc))[0];
      const mid = w
        .nodes()
        .filter((n) => n.defId === "node_mid")
        .sort((p, q) => dist(tileCenter(p), bc) - dist(tileCenter(q), bc))[0];
      const center = w.nodes().find((n) => n.defId === "node_center");
      w.map.paintPlaza(bc.tx, bc.ty, 12, 12);
      if (near) {
        const nc = tileCenter(near);
        w.map.paintPlaza(nc.tx, nc.ty, 8, 8);
        if (center) {
          const cc = tileCenter(center);
          w.map.paintRoad([bc, nc, cc]);
        }
      }
      if (mid && center) {
        const mc = tileCenter(mid);
        w.map.paintPlaza(mc.tx, mc.ty, 8, 8);
        w.map.paintRoad([mc, tileCenter(center)]);
      }
    }
    {
      const center = w.nodes().find((n) => n.defId === "node_center");
      if (center) {
        const cc = tileCenter(center);
        w.map.paintPlaza(cc.tx, cc.ty, 10, 10);
      }
    }

    // Công hội mạo hiểm gần trung tâm (2 bên dùng chung).
    w.map.clearArea(cx + 14, cy - 2, 5);
    this.place("guild", -1, cx + 12, cy - 3);

    // Mở đầu mỗi bên 1 worker để nhìn là hiểu ngay.
    this.spawnStarter(HUMAN);
    this.spawnStarter(AI_PLAYER);

    // Thú rừng trung lập rải rác (lợn/cừu/gà đi lang thang).
    this.scatterCritters();

    w.recomputeSupply();
    w.rebuildSpatial();
    const base = w.baseOf(HUMAN);
    this.startFocus = base ? { x: base.x, y: base.y } : { x: cx * TILE, y: cy * TILE };
  }

  private place(defId: string, player: PlayerId, tx: number, ty: number) {
    const e = this.world.spawnBuilding(defId, player, tx, ty);
    if (!e) {
      // Nudge nhẹ nếu kẹt địa hình.
      for (let r = 1; r < 6 && !e; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const c = this.world.spawnBuilding(defId, player, tx + dx, ty + dy);
            if (c) return c;
          }
        }
      }
    }
    return e;
  }

  /** Rải thú rừng: đứng ở ô cỏ kề cụm cây (không đứng trong cây). */
  private scatterCritters() {
    const w = this.world;
    const woods: number[] = [];
    for (let i = 0; i < w.map.tiles.length; i++) {
      if (w.map.tiles[i] === T_WOOD) woods.push(i);
    }
    const kinds = ["boar", "sheep", "chicken"];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    let placed = 0;
    for (let n = 0; n < 14 && placed < 14; n++) {
      for (let t = 0; t < 12; t++) {
        const i = woods[Math.floor(w.rand() * woods.length)];
        const tx = i % w.map.w;
        const ty = Math.floor(i / w.map.w);
        const d = dirs[Math.floor(w.rand() * dirs.length)];
        const sx = tx + d[0];
        const sy = ty + d[1];
        if (!w.map.inBounds(sx, sy) || !w.map.passable(sx, sy)) continue;
      const kind = kinds[Math.floor(w.rand() * kinds.length)];
      const u = w.spawnUnit(kind, NEUTRAL, w.map.tileToWorldCenter(sx), w.map.tileToWorldCenter(sy));
      u.state = "idle";
      u.patrolAx = sx; // nhà của nó (sợ quá chạy xa sẽ tự về)
      u.patrolAy = sy;
        placed++;
        break;
      }
    }
  }

  private spawnStarter(player: PlayerId) {
    const base = this.world.baseOf(player);
    if (!base) return;
    const s = this.world.findSpawnNear(base.x, base.y);
    const u = this.world.spawnUnit("worker", player, s.x, s.y);
    void u;
    this.world.player(player).ore -= 0; // starter miễn phí
    this.world.recomputeSupply();
  }

  // ------------------------------------------------------------- commands

  dispatch(cmd: Command) {
    if (this.phase !== "playing") return;
    this.commandLog.push({ tick: this.tickCount, cmd: { ...cmd } });
    const w = this.world;

    switch (cmd.type) {
      case "spawnUnit": {
        const def = UNIT_DEFS[cmd.unitDefId];
        if (!def) break;
        const pl = w.player(cmd.player);
        if (!canAfford(pl, def)) break;
        w.recomputeSupply();
        if (pl.supplyUsed + def.supply > pl.supplyCap) break;
        const base = w.baseOf(cmd.player);
        if (!base) break;
        payCost(pl, def);
        const s = w.findSpawnNear(base.x, base.y - 3 * TILE);
        const u = w.spawnUnit(cmd.unitDefId, cmd.player, s.x, s.y);
        // Quân mới tự ra mặt trận (auto-brain lái từ tick sau).
        u.state = "idle";
        u.path = [];
        u.repathTimer = 0;
        w.recomputeSupply();
        break;
      }
      case "setDirective": {
        const pl = w.player(cmd.player);
        if (cmd.ecoMil !== undefined) pl.ecoMil = Math.max(0, Math.min(1, cmd.ecoMil));
        if (cmd.defAtk !== undefined) pl.defAtk = Math.max(0, Math.min(1, cmd.defAtk));
        if (cmd.focus !== undefined) pl.focus = cmd.focus;
        if (cmd.autoSpend !== undefined) pl.autoSpend = cmd.autoSpend;
        if (cmd.needs !== undefined) {
          const n = cmd.needs;
          pl.needs = {
            gold: clampNeed(n.gold),
            wood: clampNeed(n.wood),
            stone: clampNeed(n.stone),
            water: clampNeed(n.water),
            food: clampNeed(n.food),
          };
        }
        break;
      }
    }
  }

  /** B6: auto-chi tiêu — gold tự mua lính theo slider Kinh tế↔Quân sự. */
  private autoSpendTick(w: World, dt: number) {
    for (const pl of w.players) {
      if (!pl.autoSpend || !pl.alive) continue;
      const t = (this.autoSpendTimer.get(pl.id) ?? 0) - dt;
      if (t > 0) {
        this.autoSpendTimer.set(pl.id, t);
        continue;
      }
      this.autoSpendTimer.set(pl.id, 2.0);
      const mine = w.unitsOf(pl.id);
      const workers = mine.filter((u) => u.defId === "worker").length;
      const soldiers = mine.filter((u) => u.defId === "soldier").length;
      // ecoMil 0 → 6 worker, 1 → 2 worker.
      const workerTarget = 2 + Math.round((1 - pl.ecoMil) * 4);
      if (workers < workerTarget) {
        this.dispatch({ type: "spawnUnit", player: pl.id, unitDefId: "worker" });
        continue;
      }
      // Quân: thủ (defAtk thấp) ưu tiên soldier + tank giữ nhà,
      // công ưu tiên archer + tank push.
      if (pl.defAtk < 0.35) {
        if (soldiers < 3) this.dispatch({ type: "spawnUnit", player: pl.id, unitDefId: "soldier" });
        else if (canAfford(pl, UNIT_DEFS.tank)) this.dispatch({ type: "spawnUnit", player: pl.id, unitDefId: "tank" });
        else this.dispatch({ type: "spawnUnit", player: pl.id, unitDefId: "soldier" });
      } else {
        if (soldiers >= 3 && canAfford(pl, UNIT_DEFS.tank) && w.time > 200) {
          this.dispatch({ type: "spawnUnit", player: pl.id, unitDefId: "tank" });
        } else if (soldiers % 2 === 0) {
          this.dispatch({ type: "spawnUnit", player: pl.id, unitDefId: "archer" });
        } else {
          this.dispatch({ type: "spawnUnit", player: pl.id, unitDefId: "soldier" });
        }
      }
    }
  }

  /** Spawn hộ cho simtest (bypass log). */
  debugSpawn(player: PlayerId, defId: string): Entity | null {
    const base = this.world.baseOf(player);
    if (!base) return null;
    const s = this.world.findSpawnNear(base.x, base.y);
    return this.world.spawnUnit(defId, player, s.x, s.y);
  }

  // ------------------------------------------------------------------ loop

  update(dtReal: number) {
    if (this.paused || this.phase !== "playing") return;
    this.acc += Math.min(dtReal, 0.25) * this.speed;
    let n = 0;
    const maxSteps = this.speed > 1 ? 16 : 8;
    while (this.acc >= STEP && n++ < maxSteps) {
      this.tick(STEP);
      this.acc -= STEP;
    }
  }

  private tick(dt: number) {
    if (this.phase !== "playing") return;
    const w = this.world;
    w.time += dt;
    this.tickCount++;
    resetPathBudget(12); // quota A*/tick: đủ cho combat + quest xa (đo không nặng hơn)
    w.rebuildSpatial();
    this.ai.update(w, (c) => this.dispatch(c), dt);
    overseerTick(w, (c) => this.dispatch(c)); // agent ra lệnh trước, systems thi hành sau
    // Xây dựng trước chi tiêu: hạ tầng (nhà/farm) được giữ gỗ trước khi mua lính.
    constructionTick(w, dt);
    this.autoSpendTick(w, dt);
    autoTick(w, dt);
    movementTick(w, dt);
    combatTick(w, dt);
    monsterTick(w, dt);
    directorTick(w, dt);
    critterTick(w);
    adventureTick(w, dt);
    economyTick(w, dt);
    fogTick(w);
    for (let i = w.effects.length - 1; i >= 0; i--) {
      w.effects[i].ttl -= dt;
      if (w.effects[i].ttl <= 0) w.effects.splice(i, 1);
    }
    if (this.tickCount % 30 === 0) w.recomputeSupply();
    // Lưới an toàn cuối cùng: mỗi giây vớt 1 lần lính kẹt trong vật cản
    // (nhà xây đè lên, cây mọc đè lên...) ra ô thoáng gần nhất.
    if (this.tickCount % 60 === 0) w.rescueTrappedUnits();

    // Sudden death: x2 gold (trong economy) + base mất 1% HP / 5s.
    // Có thể tắt ở menu setup (đánh giao hữu không giới hạn giờ).
    if (this.opts.suddenDeath !== false && !this.suddenDeath && suddenDeathActive(w)) {
      this.suddenDeath = true;
    }
    if (this.suddenDeath && this.tickCount % 300 === 0) {
      // Chống stall: base mất máu theo thời gian, leo thang để chắc chắn hết trận.
      // 10-12p: 1% (đúng spec), 12p+: 3% để không bao giờ hòa kẹt.
      const pct = w.time > 12 * 60 ? 0.03 : 0.01;
      for (const e of w.entities.values()) {
        if (e.kind === "building" && e.defId === "base") {
          e.hp = Math.max(0, e.hp - Math.floor(e.maxHp * pct));
        }
      }
    }
    this.checkEnd();
  }

  private checkEnd() {
    const w = this.world;
    const hb = w.baseOf(HUMAN);
    const ab = w.baseOf(AI_PLAYER);
    const hAlive = hb && hb.hp > 0;
    const aAlive = ab && ab.hp > 0;
    w.player(HUMAN).alive = !!hAlive;
    w.player(AI_PLAYER).alive = !!aAlive;
    if (!aAlive && hAlive) this.phase = "victory";
    else if (!hAlive && aAlive) this.phase = "defeat";
    else if (!hAlive && !aAlive) this.phase = "defeat"; // hòa tính thua cho gọn
    void BUILDING_DEFS;
  }

  restart(seed?: number) {
    this.seed = (seed ?? ((this.seed * 1664525 + 1013904223) >>> 0)) >>> 0;
    this.world = new World(this.seed);
    this.phase = "playing";
    this.tickCount = 0;
    this.commandLog = [];
    this.acc = 0;
    this.suddenDeath = false;
    this.ai = new AIController(AI_PLAYER, this.opts.ai);
    this.setupScenario();
  }

  // ------------------------------------------------------------ persistence

  save(): string {
    return JSON.stringify({
      seed: this.seed,
      tickCount: this.tickCount,
      phase: this.phase,
      commandLog: this.commandLog,
      world: this.world.serialize(),
    });
  }

  load(json: string) {
    const d = JSON.parse(json);
    this.seed = d.seed;
    this.tickCount = d.tickCount;
    this.phase = d.phase;
    this.commandLog = d.commandLog ?? [];
    this.world = World.deserialize(d.world);
    this.ai = new AIController(AI_PLAYER, this.opts?.ai);
    this.acc = 0;
    this.suddenDeath = suddenDeathActive(this.world);
  }

  exportReplay(): string {
    return JSON.stringify({ seed: this.seed, commands: this.commandLog });
  }
}

/** Đủ tiền mua lính? (vàng + gỗ + đá) */
export function canAfford(pl: PlayerState, def: UnitDef): boolean {
  return (
    pl.ore >= def.cost &&
    (pl.wood ?? 0) >= (def.wood ?? 0) &&
    (pl.stone ?? 0) >= (def.stone ?? 0) &&
    (pl.food ?? 0) >= (def.food ?? 0)
  );
}

function payCost(pl: PlayerState, def: UnitDef) {
  pl.ore -= def.cost;
  pl.wood -= def.wood ?? 0;
  pl.stone -= def.stone ?? 0;
  pl.food -= def.food ?? 0;
}

function clampNeed(v: number | undefined): number {
  if (v === undefined) return 1;
  return Math.max(0, Math.min(2, Math.round(v)));
}
