"use client";

import { useState } from "react";
import { listSaves, writeSave, type AppSettings } from "@/menu/config";
import { MenuButton } from "./ui";
import SettingsPanel from "./SettingsPanel";
import HelpPanel from "./HelpPanel";
import LoadPanel from "./LoadPanel";

type Tab = "main" | "save" | "load" | "settings" | "help" | "confirmQuit" | "confirmSurrender";

export default function PauseMenu({
  paused,
  settings,
  onSettings,
  getSnapshot,
  onLoadSnapshot,
  onResume,
  onQuitToMenu,
  onSurrender,
}: {
  paused: boolean;
  settings: AppSettings;
  onSettings: (s: AppSettings) => void;
  getSnapshot: () => { json: string; gold: number; time: number } | null;
  onLoadSnapshot: (json: string) => void;
  onResume: () => void;
  onQuitToMenu: () => void;
  onSurrender: () => void;
}) {
  const [tab, setTab] = useState<Tab>("main");
  const [saves, setSaves] = useState(listSaves);
  const [saveName, setSaveName] = useState("");

  if (!paused) return null;

  const doSave = (slot: number) => {
    const snap = getSnapshot();
    if (!snap) return;
    writeSave(slot, saveName.trim() || `Save ${slot + 1} — ${fmt(snap.time)}`, snap.json, snap.gold);
    setSaves(listSaves());
    setSaveName("");
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
      {tab === "settings" ? (
        <SettingsPanel inGame settings={settings} onChange={onSettings} onBack={() => setTab("main")} />
      ) : tab === "help" ? (
        <HelpPanel inGame onBack={() => setTab("main")} />
      ) : tab === "load" ? (
        <LoadPanel
          inGame
          onBack={() => setTab("main")}
          onLoad={(json) => {
            onLoadSnapshot(json);
            setTab("main");
          }}
        />
      ) : (
        <div className="max-h-[86dvh] w-[calc(100vw-2rem)] max-w-[380px] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-5 sm:p-6 shadow-2xl">
          {tab === "main" && (
            <>
              <h2 className="mb-1 text-center text-2xl font-black text-amber-200">⏸ Tạm dừng</h2>
              <p className="mb-4 text-center text-xs text-zinc-500">Game đang dừng — quân ta nghỉ, quân địch cũng nghỉ.</p>
              <div className="flex flex-col gap-2">
                <MenuButton primary onClick={onResume}>
                  ▶ Tiếp tục <span className="font-normal opacity-60">(Esc)</span>
                </MenuButton>
                <MenuButton onClick={() => { setSaves(listSaves()); setTab("save"); }}>
                  💾 Lưu game
                </MenuButton>
                <MenuButton onClick={() => setTab("load")}>📂 Tải game</MenuButton>
                <div className="grid grid-cols-2 gap-2">
                  <MenuButton small onClick={() => setTab("settings")}>
                    ⚙️ Cài đặt
                  </MenuButton>
                  <MenuButton small onClick={() => setTab("help")}>
                    📖 Trợ giúp
                  </MenuButton>
                </div>
                <MenuButton small danger onClick={() => setTab("confirmSurrender")}>
                  🏳️ Đầu hàng
                </MenuButton>
                <MenuButton small onClick={() => setTab("confirmQuit")}>
                  🚪 Thoát ra menu
                </MenuButton>
              </div>
            </>
          )}

          {tab === "save" && (
            <>
              <h2 className="mb-3 text-center text-xl font-black text-amber-200">💾 Lưu game</h2>
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value.slice(0, 40))}
                placeholder="Tên save (để trống = tự đặt)"
                className="mb-2 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm outline-none focus:border-amber-300"
              />
              <div className="mb-3 flex max-h-56 flex-col gap-1.5 overflow-y-auto">
                {saves.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => doSave(i)}
                    className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-left text-sm hover:border-amber-300"
                  >
                    <b>Ô {i + 1}</b>{" "}
                    <span className="text-zinc-400">
                      {s ? `${s.name} · ${new Date(s.date).toLocaleString()}` : "— trống, bấm để lưu —"}
                    </span>
                  </button>
                ))}
              </div>
              <MenuButton small onClick={() => setTab("main")}>
                ← Quay lại
              </MenuButton>
            </>
          )}

          {tab === "confirmQuit" && (
            <>
              <h2 className="mb-2 text-center text-xl font-black">Thoát trận?</h2>
              <p className="mb-4 text-center text-sm text-zinc-400">
                Tiến trình chưa lưu sẽ mất. Chắc chắn muốn về menu chính?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <MenuButton small onClick={() => setTab("main")}>
                  Ở lại
                </MenuButton>
                <MenuButton small danger onClick={onQuitToMenu}>
                  Thoát luôn
                </MenuButton>
              </div>
            </>
          )}

          {tab === "confirmSurrender" && (
            <>
              <h2 className="mb-2 text-center text-xl font-black">Đầu hàng?</h2>
              <p className="mb-4 text-center text-sm text-zinc-400">
                Base ta sẽ sụp đổ và tính là <b className="text-red-300">Thua</b>. Tướng quân chắc chứ?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <MenuButton small onClick={() => setTab("main")}>
                  Đánh tiếp!
                </MenuButton>
                <MenuButton small danger onClick={onSurrender}>
                  🏳️ Đầu hàng
                </MenuButton>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
