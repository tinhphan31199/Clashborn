"use client";

import { useState } from "react";
import { deleteSave, listSaves, readSave } from "@/menu/config";
import { MenuButton, MenuScreen, MobileHeader, Panel } from "./ui";

export default function LoadPanel({
  onBack,
  onLoad,
  inGame,
}: {
  onBack: () => void;
  onLoad: (snapshotJson: string) => void;
  inGame?: boolean;
}) {
  const [saves, setSaves] = useState(listSaves);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);

  const reload = () => {
    setSaves(listSaves());
    setConfirmDel(null);
  };

  if (inGame) {
    return (
      <div className="text-white">
        <Panel>
          <div className="relative mb-4 flex min-h-[44px] items-center">
            <div className="mx-auto max-w-[70%] text-center">
              <h2 className="truncate text-xl font-black text-amber-200">💾 Tải game</h2>
            </div>
            <button onClick={onBack} aria-label="Đóng" className="absolute right-0 flex h-11 w-11 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-lg text-zinc-300 transition-transform active:scale-95">
              ✕
            </button>
          </div>
          <Body />
        </Panel>
      </div>
    );
  }
  return (
    <MenuScreen narrow>
      <MobileHeader title="💾 Tải game" subtitle="6 ô save trên máy" onBack={onBack} />
      <Panel>
        <Body />
      </Panel>
    </MenuScreen>
  );

  function Body() {
    return (
      <>
          <div className="flex flex-col gap-2">
            {saves.map((s, i) =>
              s === null ? (
                <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-600">
                  Ô {i + 1} — trống
                </div>
              ) : (
                <div key={i} className="rounded-lg border border-zinc-700 bg-zinc-800/70 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold">{s.name}</div>
                      <div className="text-[11px] text-zinc-500">
                        Ô {i + 1} · {new Date(s.date).toLocaleString()} · ⏱ {fmt(s.time)} · 💰{Math.floor(s.gold)} · {s.phase}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          const snap = readSave(i);
                          if (snap) onLoad(snap);
                        }}
                        className="rounded-md border border-green-500/60 bg-green-900/50 px-3 py-1 text-sm font-semibold hover:bg-green-800/60"
                      >
                        ▶ Tải
                      </button>
                      {confirmDel === i ? (
                        <>
                          <button
                            onClick={() => {
                              deleteSave(i);
                              reload();
                            }}
                            className="rounded-md border border-red-500 bg-red-800 px-2 py-1 text-sm font-semibold"
                          >
                            Xóa luôn?
                          </button>
                          <button
                            onClick={() => setConfirmDel(null)}
                            className="rounded-md border border-zinc-600 px-2 py-1 text-sm"
                          >
                            Hủy
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDel(i)}
                          className="rounded-md border border-zinc-700 px-2 py-1 text-sm text-zinc-400 hover:border-red-500 hover:text-red-300"
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
          <div className="mt-4">
            <MenuButton small onClick={onBack}>
              {inGame ? "✕ Đóng" : "← Về menu chính"}
            </MenuButton>
          </div>
      </>
    );
  }
}

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
