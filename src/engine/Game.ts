/**
 * Game — AUTO-BATTLER edition.
 * Người chơi & AI chỉ spawnUnit + setRally. Mọi unit tự đánh (autoTick).
 *
 * Vòng lặp: auto → movement → combat → economy → fog → sudden death → win.
 */
import { Command } from "./commands";
import { BUILDING_DEFS, SUDDEN_DEATH_AT, TILE, UNIT_DEFS } from "./data";
import { AIController, AIOptions } from "./systems/ai";
import { autoTick } from "./systems/auto";
import { combatTick } from "./systems/combat";
import { economyTick, suddenDeathActive } from "./systems/economy";
import { fogTick } from "./systems/fog";
import { movementTick } from "./systems/movement";
import { Entity, GamePhase, PlayerId, PlayerState } from "./types";
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
      [10, 8, 6], [MAP_W - 10 - 4, MAP_H - 8 - 4, 6],
      [20, 20, 5], [MAP_W - 20 - 2, MAP_H - 20 - 2, 5],
      [34, 42, 5], [MAP_W - 34 - 2, MAP_H - 42 - 2, 5],
      [cx - 1, cy - 1, 5],
    ] as const) {
      w.map.clearArea(tx + 2, ty + 1, r);
    }

    // Base hai đầu map 96.
    this.place("base", HUMAN, 10, 8);
    this.place("base", AI_PLAYER, MAP_W - 10 - 4, MAP_H - 8 - 4);

    // 5 node vàng: 2 gần mỗi bên + 2 trung gian + 1 trung tâm.
    this.place("node_near", -1, 20, 20);
    this.place("node_near", -1, MAP_W - 20 - 2, MAP_H - 20 - 2);
    this.place("node_mid", -1, 34, 42);
    this.place("node_mid", -1, MAP_W - 34 - 2, MAP_H - 42 - 2);
    this.place("node_center", -1, cx - 1, cy - 1);

    // Rally mặc định ra giữa.
    w.player(HUMAN).rallyX = cx * TILE;
    w.player(HUMAN).rallyY = cy * TILE;
    w.player(AI_PLAYER).rallyX = cx * TILE;
    w.player(AI_PLAYER).rallyY = cy * TILE;

    // Mở đầu mỗi bên 1 worker để nhìn là hiểu ngay.
    this.spawnStarter(HUMAN);
    this.spawnStarter(AI_PLAYER);

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
        // Quân mới đi ra rally rồi mới nhập cuộc (cảm giác "xuất quân").
        u.state = "moving";
        u.path = [];
        u.repathTimer = 0;
        w.recomputeSupply();
        break;
      }
      case "setRally": {
        const pl = w.player(cmd.player);
        pl.rallyX = cmd.x;
        pl.rallyY = cmd.y;
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
    w.rebuildSpatial();
    this.ai.update(w, (c) => this.dispatch(c), dt);
    this.autoSpendTick(w, dt);
    autoTick(w, dt);
    movementTick(w, dt);
    combatTick(w, dt);
    economyTick(w, dt);
    fogTick(w);
    for (let i = w.effects.length - 1; i >= 0; i--) {
      w.effects[i].ttl -= dt;
      if (w.effects[i].ttl <= 0) w.effects.splice(i, 1);
    }
    if (this.tickCount % 30 === 0) w.recomputeSupply();

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
    (pl.stone ?? 0) >= (def.stone ?? 0)
  );
}

function payCost(pl: PlayerState, def: UnitDef) {
  pl.ore -= def.cost;
  pl.wood -= def.wood ?? 0;
  pl.stone -= def.stone ?? 0;
}

function clampNeed(v: number | undefined): number {
  if (v === undefined) return 1;
  return Math.max(0, Math.min(2, Math.round(v)));
}
