/**
 * AIController — "tướng địch" chơi đúng luật như người:
 * chỉ được spawnUnit + setRally, không micro.
 *
 * Chiến thuật:
 *  mở đầu 2 worker → soldier rush hoặc economy tùy rand
 *  giữa game tranh center (soldier + archer)
 *  cuối game tank + archer push base
 */
import { TILE, UNIT_DEFS } from "../data";
import { Command } from "../commands";
import { PlayerId } from "../types";
import { World } from "../World";

const THINK_BY_DIFF: Record<string, number> = {
  easy: 3.5,
  normal: 2.0,
  hard: 1.3,
  brutal: 0.8,
};

export type AIDifficultyOpt = "easy" | "normal" | "hard" | "brutal";
export type AIPersonalityOpt = "random" | "rush" | "eco" | "control";

export interface AIOptions {
  difficulty?: AIDifficultyOpt;
  personality?: AIPersonalityOpt;
}

export class AIController {
  private player: PlayerId;
  private timer = 1;
  private personality: "rush" | "eco" | "control" = "control";
  private locked = false;
  private difficulty: AIDifficultyOpt = "normal";
  private cheatAcc = 0;

  constructor(player: PlayerId, opts?: AIOptions) {
    this.player = player;
    if (opts?.difficulty) this.difficulty = opts.difficulty;
    if (opts?.personality && opts.personality !== "random") {
      this.personality = opts.personality;
      this.locked = true;
    }
  }

  update(world: World, dispatch: (c: Command) => void, dt: number) {
    // Brutal/Hard: bonus kinh tế nhẹ để tạo áp lực (easy thì không).
    if (this.difficulty === "brutal" || this.difficulty === "hard") {
      this.cheatAcc += dt * (this.difficulty === "brutal" ? 1.5 : 0.5);
      if (this.cheatAcc >= 1) {
        this.cheatAcc -= 1;
        world.player(this.player).ore += 1;
      }
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = THINK_BY_DIFF[this.difficulty] ?? 2.0;

    // Easy: thỉnh thoảng "quên" nghĩ (chơi lỗi như người mới).
    if (this.difficulty === "easy" && world.rand() < 0.25) return;

    const me = this.player;
    if (!world.player(me).alive) return;
    if (world.time < 1 && !this.locked) {
      const r = world.rand();
      this.personality = r < 0.35 ? "rush" : r < 0.7 ? "eco" : "control";
      // AI chơi đúng luật: ra doctrine qua lệnh như người.
      const d =
        this.personality === "rush"
          ? { ecoMil: 0.8, defAtk: 0.9, focus: "center" as const, needs: { gold: 2, wood: 1, stone: 0, water: 1 } }
          : this.personality === "eco"
            ? { ecoMil: 0.25, defAtk: 0.3, focus: "near" as const, needs: { gold: 2, wood: 2, stone: 1, water: 1 } }
            : { ecoMil: 0.5, defAtk: 0.5, focus: "mid" as const, needs: { gold: 1, wood: 1, stone: 1, water: 2 } };
      dispatch({ type: "setDirective", player: me, ...d });
    }

    const units = world.unitsOf(me);
    const workers = units.filter((u) => u.defId === "worker").length;
    const soldiers = units.filter((u) => u.defId === "soldier").length;
    const archers = units.filter((u) => u.defId === "archer").length;
    const tanks = units.filter((u) => u.defId === "tank").length;
    const army = soldiers + archers + tanks;
    const ore = world.player(me).ore;
    const t = world.time;

    const want = (id: string) => {
      const pl = world.player(me);
      const def = UNIT_DEFS[id];
      if (!def) return false;
      if (pl.ore < def.cost || (pl.wood ?? 0) < (def.wood ?? 0) || (pl.stone ?? 0) < (def.stone ?? 0)) return false;
      if (pl.supplyUsed + def.supply > pl.supplyCap) return false;
      dispatch({ type: "spawnUnit", player: me, unitDefId: id });
      return true;
    };

    // Đặt rally ra giữa khi đã có quân (trừ rush muốn thẳng base).
    if (army >= 3 && t > 60) {
      const enemyBase = world.baseOf(me === 0 ? 1 : 0);
      const cx = (world.map.w * TILE) / 2;
      const cy = (world.map.h * TILE) / 2;
      const pl = world.player(me);
      const gx = this.personality === "rush" && enemyBase ? enemyBase.x : cx;
      const gy = this.personality === "rush" && enemyBase ? enemyBase.y : cy;
      if (Math.hypot(pl.rallyX - gx, pl.rallyY - gy) > TILE * 3) {
        dispatch({ type: "setRally", player: me, x: gx, y: gy });
      }
    }

    // Build order theo personality + phase.
    if (t < 60) {
      if (workers < 2) { want("worker"); return; }
      if (this.personality === "rush") {
        if (want("soldier")) return;
      } else if (this.personality === "eco") {
        if (workers < 4) { want("worker"); return; }
      }
      if (soldiers < 2) { want("soldier"); return; }
      if (workers < 3) { want("worker"); return; }
    } else if (t < 180) {
      // Tranh chấp: soldier + archer giữ center. Tối đa 4 worker.
      if (workers < 4 && army >= 4 && workers < army / 2) { want("worker"); return; }
      if (soldiers <= archers * 2) { if (want("soldier")) return; }
      if (want("archer")) return;
      if (want("soldier")) return;
    } else {
      // Push: tank + archer. Không quá 5 worker.
      if (workers < 5 && army > 8 && workers < 4) { want("worker"); return; }
      if (tanks < 2) { if (want("tank")) return; }
      if (want("archer")) return;
      if (want("tank")) return;
      if (want("soldier")) return;
      if (want("worker")) return;
    }
  }
}
