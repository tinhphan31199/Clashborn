# RTS Engine — Architecture (AUTO-BATTLER)

Game 1v1 "vị tướng đứng sau": người chơi **không micro lính**, chỉ quyết định
**thả lính nào / khi nào / xuất quân hướng nào**. Lính tự di chuyển, chiếm mỏ, chiến đấu.

```
START → spawn Worker → Gold → spawn quân → tranh mỏ → giao chiến → push Base → WIN
```

## Map 96×96 đối xứng — 5 tài nguyên

```
        BLUE 🏰                    Vàng: 5 node (thuế đất, chiếm bằng worker)
   🌲🌲 💎(5)   🌲🪨                 Gỗ: rừng — worker đốn gánh về (Archer/Tank cần)
   🏞️     💎(10)  🏞️                Đá: mỏ đá — worker khai thác (Tank cần)
        💎(20)                     Nước: hồ — worker gánh về, quân uống mỗi giây
   🏞️     💎(10)  🏞️                 Hết nước cả phe chậm + yếu 30%
   🌲🪨  💎(5)  🌲🌲
                    RED 🏰
```

| Unit | Giá | Vai trò |
|---|---|---|
| 👷 Worker | 30 vàng | Giữ mỏ vàng / đốn gỗ / đào đá / gánh nước / gặt lúa (phân vai theo nút Cần) |
| ⚔️ Soldier | 50 vàng + 10 lúa | Săn Worker địch |
| 🏹 Archer | 50 vàng + 25 gỗ + 10 lúa | Rỉa xa |
| 🛡️ Tank | 100 vàng + 50 gỗ + 25 đá + 30 lúa | Khiên thịt, pop 3 |

Population cap 20. Base 🏰 2000 HP (có pháo tự vệ). Phá base địch → thắng.

## Map đối xứng — 5 node

```
        BLUE 🏰
       💎(5) 💎(5)
     💎(10) 💎(10)
         💎(20)
        RED 🏰
```

Gần base +5/s (an toàn) · giữa +10/s · trung tâm +20/s (tử địa).
Node đổi chủ theo số worker đứng trong vòng capture. Base cho +2/s nền.

## Tick pipeline (60Hz cố định)

```
AI (tướng đỏ) → auto (não từng lính) → movement → combat → economy → fog → sudden death → win
```

- `systems/auto.ts` — não chung: worker tìm mỏ/chạy, lính tiến ra giữa rồi push base.
- `systems/combat.ts` — ưu tiên mục tiêu theo loại lính (`World.pickTargetFor`),
  archer bắn tên projectile, tank splash, base tự bắn, veterancy ★/★★.
- `systems/economy.ts` — capture node + phát gold/s (x2 khi sudden death).
- Sudden death sau 10:00: gold x2 + base mất máu (1%/5s, 3%/5s sau 12:00).

## Commands (tướng chỉ ra ý đồ)

```ts
game.dispatch({ type: "spawnUnit", player: 0, unitDefId: "archer" });
// Quân spawn ra tự ra mặt trận — không còn điểm tập kết
game.dispatch({ type: "setDirective", player: 0, ecoMil: 0.3, defAtk: 0.8, focus: "mid" });
```

## 🧭 War Council (xu hướng chiến lược)

| Điều chỉnh | Lính hiểu thế nào |
|---|---|
| Slider Kinh tế ↔ Quân sự | Tỷ lệ auto-chi tiêu (B6): eco → 6 worker, mil → 2 worker + full quân |
| Slider Thủ ↔ Công | Thủ: ôm tuyến 35% gần nhà, push khi 10 quân; công: push từ 2 quân / phút thứ 1 |
| Trọng tâm 💎 Gần/Giữa/Tâm | Worker +8/+8/+10 điểm mỏ đúng nhóm; thủ sợ trung tâm |
| Học thuyết 1 chạm | ⚔️ Rush (công+tâm) · 🛡️ Turtle (kinh tế+gần) · ⚖️ Control (giữa) |
| 🤖 Auto-chi tiêu | Gold tự mua lính theo slider, 2s một nhịp |
| ⚠️ Needs | HUD báo: base bị đánh / hết nước / thiếu vàng-gỗ-đá / pop đầy |
| **Cần 💰🪵🪨💧🌾** | Nút 3 mức (thôi/thường/gấp) — worker tự dồn sang tài nguyên cần |

AI đỏ chơi đúng luật: nhận doctrine theo tính cách rồi đánh như người.

## 🌾 Ruộng lúa (vựa lúa — tài nguyên tái sinh duy nhất)

Cụm ruộng gần base + giữa map, ban đầu khô rang (0 lúa, không tự mọc).
Worker **múc nước hồ → tưới 3 gáo (+20/gáo) là chín vàng** → gặt gánh về kho (tối đa 200).
Gần farm tưới +50%/gáo (2 gáo là chín). Lính ăn lúa khi train (soldier/archer 10 · tank 30).
Ruộng chín vẽ sprite lúa vàng riêng, non phủ xanh.

Cây có **thanh máu**, đốn sạch thành **gốc cây** (sprite riêng), **30s mọc lại** đầy máu.
Đá hết là hết vĩnh viễn.

## 💧 Nước (tài nguyên sinh tồn)

Gánh từ hồ về kho (tối đa 40), quân uống mỗi giây
(worker 0.1 · lính 0.15 · tank 0.3/s, base cho 0.5/s).
Hết nước cả phe **chậm + yếu 30%** — quân đông mà ít worker nước là tự khát.

## Chạy

```bash
npx tsx simtest.ts  # AI vs script mua quân, ~10 phút game
npm run dev         # chơi ở http://localhost:3000 (phím 1-4 spawn, R rally)
```
