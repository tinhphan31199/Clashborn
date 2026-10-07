"use client";

import { DOCTRINES } from "@/engine/commands";
import {
  AI_INFO,
  DOCTRINE_INFO,
  randomSeed,
  type AIDifficulty,
  type AIPersonality,
  type DoctrineId,
  type MatchConfig,
} from "@/menu/config";
import { MenuButton, MenuScreen, MobileHeader, Panel, Row, SectionTitle, SegButtons } from "./ui";

const COLORS = ["#3b82f6", "#22c55e", "#a855f7", "#eab308", "#f97316", "#06b6d4", "#f43f5e"];

export default function SkirmishSetup({
  config,
  onChange,
  onBack,
  onStart,
}: {
  config: MatchConfig;
  onChange: (c: MatchConfig) => void;
  onBack: () => void;
  onStart: () => void;
}) {
  const set = (patch: Partial<MatchConfig>) => onChange({ ...config, ...patch });

  const applyDoctrine = (d: DoctrineId) => {
    set({ doctrine: d });
  };

  return (
    <MenuScreen>
      <MobileHeader
        title="⚔️ Thiết lập trận đánh"
        subtitle="Skirmish 1v1 · map đối xứng 5 mỏ"
        onBack={onBack}
      />
      <div className="mb-3 flex items-center justify-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 px-3 py-2">
        <img src="/menu/blue-idle.gif" alt="Ta" width={52} height={52} style={{ imageRendering: "pixelated" }} />
        <span className="text-lg font-black text-red-400">VS</span>
        <img src="/menu/red-idle.gif" alt="Địch" width={52} height={52} style={{ imageRendering: "pixelated" }} />
      </div>
      <Panel wide>

          <SectionTitle>🧑‍✈️ Phe ta</SectionTitle>
          <Row
            label="Tên chỉ huy"
            right={
              <input
                value={config.commanderName}
                onChange={(e) => set({ commanderName: e.target.value.slice(0, 24) })}
                className="w-44 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm outline-none focus:border-amber-300"
              />
            }
          />
          <Row
            label="Màu quân"
            right={
              <div className="flex gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => set({ playerColor: c })}
                    className={`h-6 w-6 rounded-full border-2 ${config.playerColor === c ? "border-white" : "border-transparent"}`}
                    style={{ background: c }}
                    title={c}
                  />
                ))}
              </div>
            }
          />
          <Row
            label="Học thuyết mở màn"
            hint="Preset War Council — vào trận vẫn đổi được"
            right={
              <SegButtons<DoctrineId>
                value={config.doctrine}
                onPick={applyDoctrine}
                options={(Object.keys(DOCTRINE_INFO) as DoctrineId[]).map((d) => ({
                  value: d,
                  label: `${DOCTRINE_INFO[d].icon} ${DOCTRINE_INFO[d].name}`,
                  title: `${DOCTRINE_INFO[d].desc}${d !== "balanced" ? ` (eco ${DOCTRINES[d as keyof typeof DOCTRINES].ecoMil}, atk ${DOCTRINES[d as keyof typeof DOCTRINES].defAtk})` : ""}`,
                }))}
              />
            }
          />
          <Row
            label="🤖 Auto-chi tiêu từ đầu"
            hint="Gold tự mua lính theo slider Kinh tế↔Quân sự"
            right={
              <button
                onClick={() => set({ autoSpend: !config.autoSpend })}
                className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${config.autoSpend ? "border-green-400 bg-green-900/60" : "border-zinc-700 bg-zinc-800"}`}
              >
                {config.autoSpend ? "ON" : "OFF"}
              </button>
            }
          />

          <SectionTitle>🤖 Đối thủ AI</SectionTitle>
          <Row
            label="Độ khó"
            hint={AI_INFO[config.aiDifficulty].desc}
            right={
              <SegButtons<AIDifficulty>
                value={config.aiDifficulty}
                onPick={(aiDifficulty) => set({ aiDifficulty })}
                options={(Object.keys(AI_INFO) as AIDifficulty[]).map((d) => ({
                  value: d,
                  label: `${AI_INFO[d].icon} ${AI_INFO[d].name}`,
                  title: AI_INFO[d].desc,
                }))}
              />
            }
          />
          <Row
            label="Tính cách AI"
            hint="Random = mỗi trận một kiểu, khó đoán"
            right={
              <SegButtons<AIPersonality>
                value={config.aiPersonality}
                onPick={(aiPersonality) => set({ aiPersonality })}
                options={[
                  { value: "random", label: "🎲 Random" },
                  { value: "rush", label: "⚔️ Rush" },
                  { value: "eco", label: "💰 Eco" },
                  { value: "control", label: "🎯 Control" },
                ]}
              />
            }
          />

          <SectionTitle>⚙️ Luật trận</SectionTitle>
          <div className="mb-3">
            <div className="mb-1 flex justify-between text-sm">
              <span>💰 Vàng khởi đầu: <b className="text-amber-300">{config.startingGold}</b></span>
            </div>
            <input
              type="range" min={50} max={500} step={10} value={config.startingGold}
              onChange={(e) => set({ startingGold: Number(e.target.value) })}
              className="w-full accent-amber-400"
            />
          </div>
          <Row
            label="Tốc độ mở màn"
            right={
              <SegButtons<number>
                value={config.gameSpeed}
                onPick={(gameSpeed) => set({ gameSpeed })}
                options={[1, 2, 3].map((s) => ({ value: s, label: `⚡${s}x` }))}
              />
            }
          />
          <Row
            label="☠️ Sudden death (phút 10)"
            hint="TẮT = đánh giao hữu không base-bleed"
            right={
              <button
                onClick={() => set({ suddenDeath: !config.suddenDeath })}
                className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${config.suddenDeath ? "border-red-400 bg-red-900/60" : "border-zinc-700 bg-zinc-800"}`}
              >
                {config.suddenDeath ? "ON" : "OFF"}
              </button>
            }
          />
          <Row
            label="🎲 Seed bản đồ"
            hint="Cùng seed = cùng địa hình, cùng AI random"
            right={
              <div className="flex items-center gap-2">
                <input
                  value={config.seed >>> 0}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isNaN(v)) set({ seed: v >>> 0 });
                  }}
                  className="w-32 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 font-mono text-sm outline-none focus:border-amber-300"
                />
                <button
                  onClick={() => set({ seed: randomSeed() })}
                  className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm hover:border-zinc-500"
                  title="Ngẫu nhiên seed mới"
                >
                  🎲
                </button>
              </div>
            }
          />

          <div className="sticky bottom-0 -mx-4 mt-5 grid grid-cols-2 gap-2 bg-gradient-to-t from-zinc-900 via-zinc-900/95 to-transparent px-4 pb-1 pt-4 sm:-mx-6 sm:px-6">
            <MenuButton onClick={onBack}>← Quay lại</MenuButton>
            <MenuButton primary onClick={onStart}>
              🚀 Bắt đầu →
            </MenuButton>
          </div>
        </Panel>
    </MenuScreen>
  );
}
