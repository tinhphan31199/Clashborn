"use client";

/**
 * HeroAgent — Agent Anh Hùng (CopilotKit + Gemini).
 * Treo trong GameView: đăng ký tools để agent đọc trận đấu và ra lệnh
 * như một vị tướng (spawn lính + chỉnh War Council), rồi hiện khung chat.
 */
import type { RefObject } from "react";
import {
  CopilotSidebar,
  useFrontendTool,
} from "@copilotkit/react-core/v2";
import { z } from "zod";
import { UNIT_DEFS } from "@/engine/data";
import { HUMAN, AI_PLAYER, type Game } from "@/engine/Game";
import type { MapFocus } from "@/engine/types";

interface HeroAgentProps {
  gameRef: RefObject<Game | null>;
}

const UNIT_NAMES = ["worker", "soldier", "archer", "tank"] as const;

function snapshot(game: Game): string {
  const me = game.world.player(HUMAN);
  const foe = game.world.player(AI_PLAYER);
  const hb = game.world.baseOf(HUMAN);
  const ab = game.world.baseOf(AI_PLAYER);
  const mine = game.world.unitsOf(HUMAN);
  const count = (id: string) => mine.filter((u) => u.defId === id).length;
  const foeUnits = game.world.unitsOf(AI_PLAYER).length;
  const m = Math.floor(game.world.time / 60);
  const s = Math.floor(game.world.time % 60);
  return JSON.stringify({
    time: `${m}:${s.toString().padStart(2, "0")}`,
    phase: game.phase,
    suddenDeath: game.suddenDeath,
    gold: Math.floor(me.ore),
    income: Math.round(me.income),
    water: Math.floor(me.water),
    waterNet: Number(me.waterIncome.toFixed(1)),
    wood: Math.floor(me.wood ?? 0),
    stone: Math.floor(me.stone ?? 0),
    food: Math.floor(me.food ?? 0),
    pop: `${me.supplyUsed}/${me.supplyCap}`,
    army: {
      worker: count("worker"),
      soldier: count("soldier"),
      archer: count("archer"),
      tank: count("tank"),
      enemyTotal: foeUnits,
    },
    base: { us: Math.ceil(hb?.hp ?? 0), enemy: Math.ceil(ab?.hp ?? 0) },
    council: {
      ecoMil: me.ecoMil,
      defAtk: me.defAtk,
      focus: me.focus,
      autoSpend: me.autoSpend,
      needs: me.needs,
    },
    enemyIncome: Math.round(foe.income),
  });
}

export default function HeroAgent({ gameRef }: HeroAgentProps) {
  // --- Đọc tình hình chiến trường ---
  useFrontendTool({
    name: "get_battlefield_state",
    description:
      "Xem tình hình trận đấu hiện tại của phe ta (Blue): tài nguyên, quân số, HP base, War Council, thời gian. Luôn gọi trước khi tư vấn chiến thuật.",
    parameters: z.object({}),
    handler: async () => {
      const g = gameRef.current;
      if (!g) return "Trận đấu chưa bắt đầu.";
      return snapshot(g);
    },
  });

  // --- Thả lính như vị tướng ---
  useFrontendTool({
    name: "spawn_unit",
    description:
      "Thả lính cho phe ta. unit: worker (👷 30 vàng), soldier (⚔️ 50 vàng+10 lúa), archer (🏹 50 vàng+25 gỗ+10 lúa), tank (🛡️ 100 vàng+50 gỗ+25 đá+30 lúa, tốn 3 pop). count 1-5.",
    parameters: z.object({
      unit: z.enum(UNIT_NAMES).describe("Loại lính muốn thả"),
      count: z.number().min(1).max(5).default(1).describe("Số lính muốn thả (1-5)"),
    }),
    handler: async ({ unit, count }) => {
      const g = gameRef.current;
      if (!g) return "Trận đấu chưa bắt đầu.";
      if (g.phase !== "playing") return `Trận đã kết thúc (${g.phase}), không thả lính được.`;
      const def = UNIT_DEFS[unit];
      const me = g.world.player(HUMAN);
      const n = Math.max(1, Math.min(5, Math.floor(count ?? 1)));
      let ok = 0;
      for (let i = 0; i < n; i++) {
        const afford =
          me.ore >= def.cost &&
          (me.wood ?? 0) >= (def.wood ?? 0) &&
          (me.stone ?? 0) >= (def.stone ?? 0) &&
          (me.food ?? 0) >= (def.food ?? 0);
        const popOk = me.supplyUsed + def.supply <= me.supplyCap;
        if (!afford || !popOk) break;
        g.dispatch({ type: "spawnUnit", player: HUMAN, unitDefId: unit });
        ok++;
      }
      if (ok === 0)
        return `Không thả được ${def.name}: thiếu tài nguyên hoặc đầy pop (${me.supplyUsed}/${me.supplyCap}). Vàng ${Math.floor(me.ore)}, gỗ ${Math.floor(me.wood ?? 0)}, đá ${Math.floor(me.stone ?? 0)}, lúa ${Math.floor(me.food ?? 0)}.`;
      return `Đã thả ${ok} ${def.icon} ${def.name} ra mặt trận. Pop hiện ${me.supplyUsed}/${me.supplyCap}, vàng còn ${Math.floor(me.ore)}.`;
    },
  });

  // --- Chỉnh War Council ---
  useFrontendTool({
    name: "set_war_council",
    description:
      "Chỉnh xu hướng chiến lược War Council. ecoMil 0=kinh tế..1=quân sự. defAtk 0=thủ..1=công. focus: near/giữa/mid/tâm/center/auto. autoSpend: tự mua lính.",
    parameters: z.object({
      ecoMil: z.number().min(0).max(1).optional().describe("0 kinh tế .. 1 quân sự"),
      defAtk: z.number().min(0).max(1).optional().describe("0 thủ nhà .. 1 tổng công kích"),
      focus: z.enum(["auto", "near", "mid", "center"]).optional().describe("Trọng tâm mỏ vàng"),
      autoSpend: z.boolean().optional().describe("Bật/tắt auto-chi tiêu"),
    }),
    handler: async ({ ecoMil, defAtk, focus, autoSpend }) => {
      const g = gameRef.current;
      if (!g) return "Trận đấu chưa bắt đầu.";
      g.dispatch({
        type: "setDirective",
        player: HUMAN,
        ...(ecoMil !== undefined ? { ecoMil } : {}),
        ...(defAtk !== undefined ? { defAtk } : {}),
        ...(focus !== undefined ? { focus: focus as MapFocus } : {}),
        ...(autoSpend !== undefined ? { autoSpend } : {}),
      });
      const me = g.world.player(HUMAN);
      return `War Council đã chỉnh: kinh tế↔quân sự ${me.ecoMil.toFixed(2)}, thủ↔công ${me.defAtk.toFixed(2)}, trọng tâm ${me.focus}, auto-chi tiêu ${me.autoSpend ? "ON" : "OFF"}.`;
    },
  });

  // --- Hô "Cần gì" để worker dồn qua ---
  useFrontendTool({
    name: "set_needs",
    description:
      "Báo nhu cầu tài nguyên để worker tự dồn qua (0=thôi, 1=thường, 2=cần gấp). Dùng khi thiếu gỗ/đá/nước/lúa hoặc muốn rush vàng.",
    parameters: z.object({
      gold: z.number().min(0).max(2).optional(),
      wood: z.number().min(0).max(2).optional(),
      stone: z.number().min(0).max(2).optional(),
      water: z.number().min(0).max(2).optional(),
      food: z.number().min(0).max(2).optional(),
    }),
    handler: async (needs) => {
      const g = gameRef.current;
      if (!g) return "Trận đấu chưa bắt đầu.";
      const me = g.world.player(HUMAN);
      g.dispatch({
        type: "setDirective",
        player: HUMAN,
        needs: { ...me.needs, ...needs },
      });
      return `Đã báo nhu cầu: ${JSON.stringify(g.world.player(HUMAN).needs)}. Worker sẽ tự dồn qua.`;
    },
  });

  return (
    <CopilotSidebar
      defaultOpen={false}
      labels={{
        modalHeaderTitle: "🛡️ Agent Anh Hùng",
        chatInputPlaceholder: "Ra lệnh cho phó tướng… (vd: mua 2 archer, thủ nhà)",
      }}
    />
  );
}
