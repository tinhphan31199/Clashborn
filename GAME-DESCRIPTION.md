# 🎮 RTS ENGINE — AUTO-BATTLER 1v1

> Game chiến thuật thời gian thực 1v1 dạng auto-battler: người chơi là **"vị tướng đứng sau"** — **không micro lính**, chỉ quyết định **thả lính nào / khi nào / đánh theo xu hướng nào**. Lính tự di chuyển, chiếm mỏ, gánh tài nguyên, chiến đấu.

## 1. Thông tin chung

| Hạng mục | Nội dung |
|----------|----------|
| 🎮 **Tên game** | RTS Engine (Auto-Battler) |
| 🕹️ **Thể loại** | Real-Time Strategy / Auto-Battler |
| 👥 **Chế độ** | Single-Player 1v1 (Human Blue vs AI Red) |
| 🗺️ **Bản đồ** | 192×192, đối xứng gương 180° |
| ⚙️ **Engine** | Pure TypeScript, tick 60Hz cố định, deterministic seed + replay |
| 🖥️ **Nền tảng** | Web (Next.js + Canvas), chơi ở `http://localhost:3000` |

Vòng đời trận đấu:

```
START → spawn Worker → Gold → spawn quân → tranh mỏ → giao chiến → push Base → WIN
```

Pipeline mỗi tick (`src/engine/Game.ts`):

```
AI → overseer → construction → autoSpend → auto → movement → combat
→ monster → critter → adventure → economy → fog → sudden-death → win
```

## 2. Lệnh điều khiển — Tướng chỉ ra ý đồ

Chỉ 2 lệnh (`src/engine/commands.ts`):

```ts
game.dispatch({ type: "spawnUnit", player: 0, unitDefId: "archer" });
game.dispatch({ type: "setDirective", player: 0, ecoMil: 0.3, defAtk: 0.8, focus: "mid" });
```

* `spawnUnit`: mua lính ở Base, lính tự ra mặt trận, không cần đặt rally.
* `setDirective`: chỉnh War Council — `ecoMil (0 kinh tế..1 quân sự), defAtk (0 thủ..1 công), focus (near/mid/center/auto), autoSpend, needs`.

## 3. Bản đồ & Địa hình

* 2 Base hai đầu map: Blue trên-trái, Red dưới-phải (`src/engine/Game.ts:setupScenario`).
* 5 node vàng ở giữa:
  * 2× `node_near` +5/s (an toàn), 2× `node_mid` +10/s, 1× `node_center` +20/s (tử địa).
  * Node đổi chủ theo số worker đứng trong vòng capture.
  * Base cho +2/s nền để không bao giờ kẹt cứng.
* Địa hình procedural (`src/engine/World.ts:generateTerrain`): viền nước, hồ lấy nước, rừng gỗ quanh base + giữa map, mỏ đá ven, cụm ruộng lúa, đường dirt base→mỏ→trung tâm.
* 2 Dungeon đối xứng góc map, Công hội Mạo hiểm ở giữa, thú rừng trung lập (`boar/sheep/chicken`) lang thang.

## 4. Tài nguyên — 5 loại

| Tài nguyên | Kiếm từ đâu | Dùng để làm gì |
|------------|-------------|----------------|
| 💰 Gold (`ore`) | Chiếm node, chợ +4/s, bounty quái, base +2/s | Mua mọi lính |
| 🪵 Wood | Worker đốn cây (cây có máu, đốn sạch thành gốc, 30s mọc lại) | Archer 25, Tank 50, xây nhà/farm/tháp/chợ/giếng |
| 🪨 Stone | Worker đào mỏ đá (hết là hết vĩnh viễn) | Tank 25, farm 25, tháp 25 |
| 💧 Water | Gánh từ hồ về kho (max 40), giếng +1.5/s, base +0.5/s | Quân uống mỗi giây (worker 0.1, lính 0.15, tank 0.3). Hết nước cả phe chậm + yếu 30% |
| 🌾 Food/Lúa | Ruộng khô → tưới 3 gáo (+20/gáo) thành chín → gặt về kho (max 200). Gần farm tưới +50%/gáo | Train lính (soldier/archer 10, tank 30) |

## 5. Quân

| Unit | Giá | Vai trò |
|------|-----|---------|
| 👷 Worker | 30 vàng | Chiếm mỏ vàng / đốn gỗ / đào đá / gánh nước / gặt lúa. Gặp địch bỏ chạy về Base |
| ⚔️ Soldier | 50 vàng + 10 lúa | Săn Worker địch, cận chiến 20 dmg |
| 🏹 Archer | 50 vàng + 25 gỗ + 10 lúa | Rỉa xa 30 dmg range 5, bắn tên projectile. Ưu tiên Tank > Soldier > Worker |
| 🛡️ Tank | 100 vàng + 50 gỗ + 25 đá + 30 lúa, pop 3 | Khiên thịt 500HP, splash 20, +50% vs nhà |
| 🧝 Adventurer | Không mua được (15% khi spawn worker) | Nhận quest rank F→SS ở guild, săn quái lên cấp |

Population cap 20. Base chỉ nuôi 6 dân — phải xây nhà mới tăng cap.

Quái Dungeon (phe MONSTER):
`slime → slimeblue → bigslime → orc → skeleton → demon → dragon 1300HP/+260g`, quái tinh anh 👹 giữ rừng 380HP/26dmg — hạ được +85 vàng. Chết 90s mọc lại.

## 6. Công trình

| Công trình | Giá | Vai trò |
|------------|-----|---------|
| 🏰 Base 4×4 | — | 2000 HP, có pháo tự vệ. Phá base địch → thắng |
| 💎 Node | — | Phát gold/s theo quyền chiếm giữ |
| 🏠 Nhà 2×2 | 50 gỗ | +7 pop, xong tặng 2 nông dân. Xây đầu tiên |
| 🌾 Farm 3×3 | 100 gỗ + 25 đá | Kho chính (+25% khi nộp), tưới +50% quanh farm |
| 🗼 Tháp canh 1×2 | 75 gỗ + 25 đá | Pháo tự vệ tầm 6, 18 dmg |
| 🏪 Chợ 2×2 | 100 gỗ | +4 vàng/s khi gỗ dư |
| 🪣 Giếng 2×2 | 50 gỗ | +1.5 nước/s |
| ⚔️ Guild 3×3 | — | Trung lập, nơi nhận/trả quest |

Xây cần 1–3 thợ đứng cạnh: 1 thợ 15s · 2 thợ ~9s · 3 thợ ~7s.

## 7. 🧭 War Council & AI

* Slider Kinh tế ↔ Quân sự: eco → 6 worker, mil → 2 worker + full quân.
* Slider Thủ ↔ Công: thủ ôm tuyến 35% gần nhà, công push từ 2 quân / phút 1.
* Trọng tâm 💎 Gần/Giữa/Tâm.
* Học thuyết 1 chạm: ⚔️ Rush (công+tâm) · 🛡️ Turtle (kinh tế+gần) · ⚖️ Control (giữa).
* 🤖 Auto-chi tiêu: gold tự mua lính mỗi 2s theo slider.
* 🤖 Quan đốc công (overseer): tự quyết xây gì/khi nào/ở đâu + điều tốp thợ + chốt chỉ tiêu worker mỗi 30s.
* ⚠️ Needs: HUD báo base bị đánh / hết nước / thiếu tài nguyên / pop đầy. Nút Cần 3 mức (thôi/thường/gấp).
* AI đỏ chơi đúng luật như người, 4 độ khó (easy/normal/hard/brutal) + 4 tính cách (random/rush/eco/control).

## 8. Thắng / Thua

* ✅ Thắng: phá hủy Base địch (2000 HP).
* ❌ Thua: Base mình bị phá. Hòa tính thua.
* ⏱️ Sudden death sau 10:00: gold x2 + base mất 1%/5s, sau 12:00 mất 3%/5s để chống stall.

Tự thoát kẹt: nhà/cây không đè lên lính, waypoint thối tự bỏ, đứng yên 3s tìm đường lại, mỗi giây vớt lính kẹt 1 lần.

## 9. Màn hình & Điều khiển

* Menu chính ↔ Setup trận (tên tướng, màu, doctrine, autoSpend, AI, gold khởi đầu, tốc độ, sudden death, seed) ↔ Trong trận (`src/app/page.tsx`, `src/menu/config.ts`).
* Trong trận (`src/components/GameView.tsx`): Canvas + Minimap + HUD tài nguyên/pop/time/kill + War Council + Pause (lưu/tải 6 slots localStorage, cài đặt, trợ giúp).
* Phím 1–4 spawn lính, R rally (legacy), P pause, zoom, edge-pan, chọn nhiều, xem inspector entity.
* HeroAgent (CopilotKit) hỗ trợ ra lệnh ở client.

## 10. Chạy game

```bash
npx tsx simtest.ts  # AI vs script mua quân, ~10 phút game
npm run dev         # chơi ở http://localhost:3000
```
