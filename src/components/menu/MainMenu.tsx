"use client";

import { UNIT_DEFS, BUILDING_DEFS } from "@/engine/data";
import { AI_INFO } from "@/menu/config";
import type { MatchConfig } from "@/menu/config";
import { MenuButton, MenuScreen, BtnIcon } from "./ui";

export type MenuAction =
  | "skirmish"
  | "quick"
  | "continue"
  | "load"
  | "help"
  | "settings";

const ROSTER = ["worker", "soldier", "archer", "tank"];

export default function MainMenu({
  match,
  hasSave,
  lastResult,
  onAction,
}: {
  match: MatchConfig;
  hasSave: boolean;
  lastResult: { outcome: "victory" | "defeat"; time: number } | null;
  onAction: (a: MenuAction) => void;
}) {
  return (
    <MenuScreen narrow>
      {/* logo */}
      <div className="pb-2 pt-6 text-center">
        <div className="text-4xl">⬢</div>
        <h1 className="bg-gradient-to-b from-amber-100 to-amber-500 bg-clip-text text-5xl font-black tracking-tight text-transparent">
          AUTO RTS
        </h1>
        <p className="mt-1 text-xs font-medium uppercase tracking-[0.3em] text-zinc-400">
          War Council Edition
        </p>
      </div>

      {/* hai vị tướng đối đầu */}
      <div className="mb-3 flex w-full items-center justify-center gap-5 rounded-2xl border border-zinc-800 bg-zinc-900/70 px-3 py-2">
        <div className="text-center">
          <img
            src="/menu/blue-idle.gif"
            alt="Tướng Xanh"
            width={64}
            height={64}
            style={{ imageRendering: "pixelated" }}
          />
          <div className="max-w-[120px] truncate text-xs font-bold text-blue-300">
            {match.commanderName || "Tướng Xanh"}
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-black text-red-400">VS</div>
          <div className="mt-1 text-[11px] text-zinc-500">
            AI {AI_INFO[match.aiDifficulty].icon} {AI_INFO[match.aiDifficulty].name}
          </div>
        </div>
        <div className="text-center">
          <img
            src="/menu/red-idle.gif"
            alt="Warlord Đỏ"
            width={64}
            height={64}
            style={{ imageRendering: "pixelated" }}
          />
          <div className="text-xs font-bold text-red-300">Warlord Đỏ</div>
        </div>
      </div>

      {lastResult && (
        <div
          className={`mb-3 w-full rounded-xl border px-3 py-2 text-center text-sm font-semibold ${
            lastResult.outcome === "victory"
              ? "border-green-500/50 bg-green-900/30 text-green-200"
              : "border-red-500/50 bg-red-900/30 text-red-200"
          }`}
        >
          {lastResult.outcome === "victory" ? "🏆 Trận trước: Thắng" : "💀 Trận trước: Thua"} ·{" "}
          {fmt(lastResult.time)}
        </div>
      )}

      {/* nút chính */}
      <div className="flex w-full flex-col gap-2.5">
        <MenuButton primary onClick={() => onAction("skirmish")}>
          <BtnIcon src="/menu/icon-swords.png" emoji="⚔️" size={24} />
          <span>Đánh trận <span className="font-normal text-amber-200/70">· 1v1</span></span>
        </MenuButton>
        <MenuButton onClick={() => onAction("quick")}>
          <BtnIcon src="/menu/icon-rocket.png" emoji="🚀" size={24} />
          <span>Đánh nhanh</span>
        </MenuButton>
        <MenuButton
          disabled={!hasSave}
          onClick={() => onAction("continue")}
          title={hasSave ? "Chơi tiếp save mới nhất" : "Chưa có save nào"}
        >
          <BtnIcon src="/menu/icon-play.png" emoji="▶️" size={24} />
          <span>Chơi tiếp {hasSave ? "" : "(trống)"}</span>
        </MenuButton>
        <div className="grid grid-cols-3 gap-2.5">
          <MenuButton small onClick={() => onAction("load")}>
            <BtnIcon src="/menu/icon-scroll.png" emoji="💾" size={22} />
            <span>Tải</span>
          </MenuButton>
          <MenuButton small onClick={() => onAction("help")}>
            <BtnIcon src="/menu/icon-book.png" emoji="📖" size={22} />
            <span>Học</span>
          </MenuButton>
          <MenuButton small onClick={() => onAction("settings")}>
            <BtnIcon src="/menu/icon-gear.png" emoji="⚙️" size={22} />
            <span>Cài đặt</span>
          </MenuButton>
        </div>
      </div>

      <div className="mt-3 w-full rounded-xl border border-zinc-800 bg-zinc-900/70 p-3 text-xs leading-5 text-zinc-400">
        <span className="font-semibold text-zinc-200">Trận kế tiếp:</span> 💰 {match.startingGold} ·{" "}
        {match.suddenDeath ? "☠️ Sudden death" : "♾️ Không sudden death"} · seed {match.seed >>> 0}
      </div>

      {/* thông tin gọn trong accordion */}
      <div className="mt-2.5 flex w-full flex-col gap-2">
        <details className="rounded-xl border border-zinc-800 bg-zinc-900/70">
          <summary className="cursor-pointer px-3 py-3 text-sm font-semibold">🎖️ Quân đội của bạn</summary>
          <div className="grid grid-cols-1 gap-2 px-3 pb-3">
            {ROSTER.map((id) => {
              const d = UNIT_DEFS[id];
              const cost = [`💰${d.cost}`];
              if (d.wood) cost.push(`🪵${d.wood}`);
              if (d.stone) cost.push(`🪨${d.stone}`);
              return (
                <div key={id} className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-2.5 text-xs">
                  <div className="text-sm font-bold">
                    {d.icon} {d.name}
                  </div>
                  <div className="text-amber-300">{cost.join(" ")} · 👥{d.supply} · ❤️{d.hp}</div>
                  <div className="mt-0.5 text-zinc-400">{d.description}</div>
                </div>
              );
            })}
          </div>
        </details>
        <details className="rounded-xl border border-zinc-800 bg-zinc-900/70">
          <summary className="cursor-pointer px-3 py-3 text-sm font-semibold">🗺️ Chiến trường</summary>
          <div className="px-3 pb-3">
            <img
              src="/assets/arena.png"
              alt="Sân đấu trung tâm"
              width={96}
              height={96}
              className="mx-auto"
              style={{ imageRendering: "pixelated" }}
            />
            <pre className="mt-1 text-center font-mono text-xs leading-5 text-zinc-300">
              {`    BLUE 🏰\n 💎(5) 💎(5)\n💎(10) 💎(10)\n    💎(20)\n    RED 🏰`}
            </pre>
            <div className="mt-1 text-center text-[11px] text-zinc-500">
              {BUILDING_DEFS.base.description} Phá 🏰 địch để thắng.
            </div>
          </div>
        </details>
        <details className="rounded-xl border border-zinc-800 bg-zinc-900/70">
          <summary className="cursor-pointer px-3 py-3 text-sm font-semibold">📱 Chơi trên điện thoại</summary>
          <div className="px-3 pb-3 text-xs leading-6 text-zinc-300">
            <div>👆 <b>Chạm</b> map = đặt 🚩 rally · ✋ <b>kéo</b> = di map</div>
            <div>⏱ <b>Giữ</b> = xem lính · 🤏 <b>chụm</b> = zoom</div>
            <div>🖱️ <b>Máy tính:</b> 1–4 thả lính · R rally · Space dừng · Esc menu</div>
          </div>
        </details>
      </div>

      <div className="mt-4 text-center text-[11px] text-zinc-600">v0.1 · Next.js + Canvas · 60Hz tick</div>
    </MenuScreen>
  );
}

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
