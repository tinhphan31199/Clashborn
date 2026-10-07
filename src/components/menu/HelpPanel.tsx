"use client";

import { UNIT_DEFS } from "@/engine/data";
import { MenuScreen, MobileHeader, Panel, SectionTitle } from "./ui";

export default function HelpPanel({ onBack, inGame }: { onBack: () => void; inGame?: boolean }) {
  if (inGame) {
    return (
      <div className="text-white">
        <Panel wide>
          <div className="relative mb-3 flex min-h-[44px] items-center">
            <div className="mx-auto max-w-[70%] text-center">
              <h2 className="truncate text-xl font-black text-amber-200">📖 Cẩm nang chỉ huy</h2>
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
    <MenuScreen>
      <MobileHeader title="📖 Cẩm nang chỉ huy" subtitle="Đọc 2 phút là đánh được" onBack={onBack} />
      <Panel wide>
        <Body />
      </Panel>
    </MenuScreen>
  );

  function Body() {
    return (
      <>

          <SectionTitle>🎯 Mục tiêu — phá 🏰 địch</SectionTitle>
          <p className="mb-3 text-sm leading-6 text-zinc-300">
            Bạn <b>không điều khiển từng lính</b>. Lính tự di chuyển, chiếm mỏ, chiến đấu.
            Việc của bạn: <b>thả lính nào / khi nào / xuất quân hướng nào</b>, và lái{" "}
            <b>🧭 War Council</b> (Kinh tế↔Quân sự · Thủ↔Công · trọng tâm mỏ · auto-chi tiêu).
          </p>

          <SectionTitle>🎖️ Quân (phím 1–4)</SectionTitle>
          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(["worker", "soldier", "archer", "tank"] as const).map((id, i) => {
              const d = UNIT_DEFS[id];
              return (
                <div key={id} className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-2 text-xs">
                  <b>[{i + 1}] {d.icon} {d.name}</b> — 💰{d.cost}
                  {d.wood ? ` 🪵${d.wood}` : ""}{d.stone ? ` 🪨${d.stone}` : ""}{d.food ? ` 🌾${d.food}` : ""} · 👥{d.supply}
                  <div className="text-zinc-400">{d.description}</div>
                </div>
              );
            })}
          </div>

          <SectionTitle>💰💧 Kinh tế</SectionTitle>
          <ul className="mb-3 list-disc pl-5 text-sm leading-6 text-zinc-300">
            <li><b>💎 Mỏ vàng:</b> worker đứng trong vòng chiếm → +5 gần / +10 giữa / +20 trung tâm mỗi giây. Base cho +2/s nền.</li>
            <li><b>🪵 Gỗ / 🪨 Đá:</b> worker đốn rồi gánh về base. Archer cần gỗ, Tank cần gỗ + đá.</li>
            <li><b>🌾 Ruộng lúa:</b> worker gặt lúa gánh về — lính ăn lúa khi train. Chỉ gặt đám <b>chín vàng</b>, lúa xanh phải chờ. Ruộng gặt sạch <b>tự mọc lại</b>, rừng/đá thì không.</li>
            <li><b>💧 Nước:</b> node/base ra nước, quân uống mỗi giây (tank khát nhất). Hết nước cả phe <b>yếu 30%</b>.</li>
            <li><b>👥 Population 20:</b> Tank chiếm 3 slot — đừng spam.</li>
          </ul>

          <SectionTitle>🧭 War Council (góc trái trong trận)</SectionTitle>
          <ul className="mb-3 list-disc pl-5 text-sm leading-6 text-zinc-300">
            <li><b>Kinh tế ↔ Quân sự:</b> auto-chi tiêu mua bao nhiêu worker (6 → 2).</li>
            <li><b>Thủ ↔ Công:</b> thủ ôm tuyến 35% gần nhà, công push từ 2 quân / phút 1.</li>
            <li><b>Học thuyết:</b> ⚔️ Rush (công + tâm) · 🛡️ Turtle (kinh tế + gần) · ⚖️ Control (giữa).</li>
            <li><b>Cần gì:</b> bấm 💰🪵🪨💧🌾 để dồn worker qua — kho cạn (gỗ {"<"} 30, đá {"<"} 15, lúa {"<"} 20, nước cạn) thì worker <b>tự</b> đi lấy, khỏi bấm.</li>
          </ul>

          <SectionTitle>⌨️ Điều khiển</SectionTitle>
          <div className="grid grid-cols-1 gap-x-4 text-sm leading-6 text-zinc-300 sm:grid-cols-2">
            <div><b>1–4 / click:</b> thả lính (quân tự ra mặt trận)</div>
            <div><b>Space:</b> dừng / chạy</div>
            <div><b>Esc:</b> menu tạm dừng</div>
            <div><b>H:</b> mở cẩm nang này</div>
            <div><b>Kéo chuột giữa:</b> di map · <b>Lăn:</b> zoom</div>
          </div>

          <div className="mt-3 rounded-lg bg-zinc-800 p-3 text-sm text-zinc-300">
            <b className="text-amber-200">📜 Mở bài gợi ý:</b> 👷👷 → ⚔️⚔️ giữ mỏ gần → 🏹 tranh giữa → 🛡️🛡️🏹🏹 push base.
            Sau <b>phút 10</b> là ☠️ Sudden Death: gold x2 + base mất máu — đừng câu giờ!
          </div>
      </>
    );
  }
}
