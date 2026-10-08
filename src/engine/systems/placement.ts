/**
 * Placement — BỘ NÃO CHỌN ĐẤT của agent (overseer gọi khi khởi công).
 *
 * Không còn "gặp đất trống đầu tiên là cắm" nữa. Agent chấm điểm từng
 * khu đất cỏ quanh base:
 *  - Nhà/tháp/chợ/giếng: càng gần base càng tốt (thợ đi bộ ít, base che chở).
 *  - Farm: gần RUỘNG (tưới +50%/gáo trong 6 ô, gặt gánh về ngắn),
 *    gần base (phòng thủ), gần rừng/hồ (gánh gỗ-nước ngắn).
 *  - Chung: tránh mép map, tránh chụm đống với nhà/farm sẵn có (kẹt đường).
 *
 * Module trung lập (chỉ đọc map) nên construction gọi ké cho chuỗi
 * nhà→farm cũng không sợ cyclic import.
 */
import { BUILDING_DEFS } from "../data";
import { T_FIELD, T_WATER, T_WOOD } from "../TileMap";
import { PlayerId } from "../types";
import { World } from "../World";

export interface SiteSpot {
  tx: number;
  ty: number;
}

const SEARCH_R = 12;

export function chooseSite(
  world: World, player: PlayerId, defId: string
): SiteSpot | null {
  const base = world.baseOf(player);
  if (!base) return null;
  const def = BUILDING_DEFS[defId];
  const w = def.w;
  const h = def.h;
  const bx = base.tx + base.tw / 2;
  const by = base.ty + base.th / 2;

  // Danh sách ô tài nguyên (quét 1 lần — khởi công thưa nên không lo perf).
  const fields: number[] = [];
  const woods: number[] = [];
  const waters: number[] = [];
  for (let i = 0; i < world.map.tiles.length; i++) {
    const t = world.map.tiles[i];
    if (t === T_FIELD) fields.push(i);
    else if (t === T_WOOD) woods.push(i);
    else if (t === T_WATER) waters.push(i);
  }
  const minDist = (list: number[], cx: number, cy: number): number => {
    let best = Infinity;
    for (const i of list) {
      const dx = (i % world.map.w) - cx;
      const dy = Math.floor(i / world.map.w) - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < best) best = d;
    }
    return best;
  };

  // Nhà/farm sẵn có của phe (tránh chụm đống).
  const built: { x: number; y: number }[] = [];
  for (const e of world.entities.values()) {
    if (e.kind !== "building" || e.player !== player) continue;
    if (e.defId !== "house" && e.defId !== "farm" && e.defId !== "tower" && e.defId !== "market" && e.defId !== "well") continue;
    built.push({ x: e.tx + e.tw / 2, y: e.ty + e.th / 2 });
  }

  let bestSpot: SiteSpot | null = null;
  let bestScore = Infinity;
  for (let r = 1; r <= SEARCH_R; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = base.tx + dx;
        const ty = base.ty + dy;
        if (!world.map.isRectFree(tx, ty, w, h)) continue;
        const cx = tx + w / 2;
        const cy = ty + h / 2;
        const dBase = Math.hypot(cx - bx, cy - by);
        let score: number;
        if (defId === "farm") {
          // Farm: ruộng quan trọng nhất, rồi tới base, rồi rừng/hồ.
          const dField = minDist(fields, cx, cy);
          const dWood = minDist(woods, cx, cy);
          const dWater = minDist(waters, cx, cy);
          score =
            dBase * 0.5 +
            (dField === Infinity ? 50 : dField * 1.2) +
            (dWood === Infinity ? 0 : dWood * 0.3) +
            (dWater === Infinity ? 0 : dWater * 0.2);
        } else {
          // Nhà/tháp/chợ/giếng: càng gần base càng tốt (thợ đi bộ ít, base che chở).
          score = dBase * 1.0;
        }
        // Tránh mép map (chừa đường đi).
        if (tx < 2 || ty < 2 || tx + w > world.map.w - 2 || ty + h > world.map.h - 2) {
          score += 10;
        }
        // Tránh chụm đống với nhà/farm sẵn có.
        for (const b of built) {
          const d = Math.hypot(cx - b.x, cy - b.y);
          if (d < 5) score += (5 - d) * 1.5;
        }
        if (score < bestScore) {
          bestScore = score;
          bestSpot = { tx, ty };
        }
      }
    }
  }
  return bestSpot;
}
