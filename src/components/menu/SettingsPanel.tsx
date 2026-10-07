"use client";

import { DEFAULT_SETTINGS, type AppSettings } from "@/menu/config";
import { MenuButton, MenuScreen, MobileHeader, Panel, Row, SectionTitle, SegButtons } from "./ui";

export default function SettingsPanel({
  settings,
  onChange,
  onBack,
  inGame,
}: {
  settings: AppSettings;
  onChange: (s: AppSettings) => void;
  onBack: () => void;
  inGame?: boolean;
}) {
  const set = (patch: Partial<AppSettings>) => onChange({ ...settings, ...patch });

  if (inGame) {
    return (
      <div className="text-white">
        <Panel>
          <InGameHead title="⚙️ Cài đặt" onBack={onBack} />
          <Body />
        </Panel>
      </div>
    );
  }
  return (
    <MenuScreen narrow>
      <MobileHeader title="⚙️ Cài đặt" subtitle="Tự lưu vào máy" onBack={onBack} />
      <Panel>
        <Body />
      </Panel>
    </MenuScreen>
  );

  function InGameHead({ title, onBack }: { title: string; onBack: () => void }) {
    return (
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-black text-amber-200">{title}</h2>
        <button onClick={onBack} className="flex min-h-[44px] items-center rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm hover:border-zinc-500">
          ✕ Đóng
        </button>
      </div>
    );
  }

  function Body() {
    return (
      <>

          <SectionTitle>🔊 Âm thanh</SectionTitle>
          <Row
            label="Tắt hết tiếng"
            right={
              <button
                onClick={() => set({ muted: !settings.muted })}
                className={`rounded-md border px-3 py-1 text-sm font-semibold ${settings.muted ? "border-red-400 bg-red-900/60" : "border-zinc-700 bg-zinc-800"}`}
              >
                {settings.muted ? "🔇 Muted" : "🔈 Có tiếng"}
              </button>
            }
          />
          {(
            [
              ["masterVolume", "Tổng"],
              ["musicVolume", "Nhạc nền"],
              ["sfxVolume", "Hiệu ứng"],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className="mb-2">
              <div className="flex justify-between text-sm text-zinc-200">
                <span>{label}</span>
                <span className="text-zinc-500">{settings[k]}%</span>
              </div>
              <input
                type="range" min={0} max={100} value={settings[k]}
                disabled={settings.muted}
                onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<AppSettings>)}
                className="w-full accent-amber-400 disabled:opacity-30"
              />
            </div>
          ))}

          <SectionTitle>📷 Camera</SectionTitle>
          <div className="mb-2">
            <div className="flex justify-between text-sm text-zinc-200">
              <span>Tốc độ di camera</span>
              <span className="text-zinc-500">{settings.cameraSpeed}/10</span>
            </div>
            <input
              type="range" min={1} max={10} value={settings.cameraSpeed}
              onChange={(e) => set({ cameraSpeed: Number(e.target.value) })}
              className="w-full accent-amber-400"
            />
          </div>
          <Row
            label="Lìa chuột ra mép để cuộn"
            right={
              <button
                onClick={() => set({ edgePan: !settings.edgePan })}
                className={`rounded-md border px-3 py-1 text-sm font-semibold ${settings.edgePan ? "border-green-400 bg-green-900/60" : "border-zinc-700 bg-zinc-800"}`}
              >
                {settings.edgePan ? "ON" : "OFF"}
              </button>
            }
          />

          <SectionTitle>🎮 Gameplay</SectionTitle>
          <Row
            label="Tốc độ mặc định mỗi trận"
            right={
              <SegButtons<number>
                value={settings.defaultSpeed}
                onPick={(defaultSpeed) => set({ defaultSpeed })}
                options={[1, 2, 3].map((s) => ({ value: s, label: `⚡${s}x` }))}
              />
            }
          />
          <Row
            label="Hiện lưới khi đặt rally"
            right={
              <button
                onClick={() => set({ showGrid: !settings.showGrid })}
                className={`rounded-md border px-3 py-1 text-sm font-semibold ${settings.showGrid ? "border-green-400 bg-green-900/60" : "border-zinc-700 bg-zinc-800"}`}
              >
                {settings.showGrid ? "ON" : "OFF"}
              </button>
            }
          />
          <Row
            label="Hỏi trước khi thoát trận"
            right={
              <button
                onClick={() => set({ confirmQuit: !settings.confirmQuit })}
                className={`rounded-md border px-3 py-1 text-sm font-semibold ${settings.confirmQuit ? "border-green-400 bg-green-900/60" : "border-zinc-700 bg-zinc-800"}`}
              >
                {settings.confirmQuit ? "ON" : "OFF"}
              </button>
            }
          />

          <div className="mt-4 grid grid-cols-2 gap-2">
            <MenuButton small onClick={() => onChange({ ...DEFAULT_SETTINGS })}>
              ♻️ Mặc định
            </MenuButton>
            <MenuButton small primary onClick={onBack}>
              ✔ Xong
            </MenuButton>
          </div>
          <p className="mt-2 text-center text-[11px] text-zinc-600">Cài đặt tự lưu vào máy.</p>
      </>
    );
  }
}
