/**
 * Inspector — snapshot thông tin 1 vật thể cho modal (bấm vào lính/nhà/quái).
 * Không React: GameView gọi mỗi nhịp HUD để modal cập nhật HP live.
 */
import { BUILDING_DEFS, UNIT_DEFS } from "@/engine/data";
import type { Game } from "@/engine/Game";

/** Snapshot 1 vật thể cho modal thông tin (làm mới mỗi nhịp HUD). */
export interface InspectorSnap {
  id: number;
  title: string;
  icon: string;
  owner: string;
  color: string;
  hp: number;
  maxHp: number;
  lines: { k: string; v: string }[];
  desc: string;
}

const STATE_LABEL: Record<string, string> = {
  idle: "Đứng yên",
  moving: "Di chuyển",
  attackMoving: "Hành quân",
  attacking: "Đang đánh",
  patrolling: "Tuần tra",
  gathering: "Đang khai thác",
  returning: "Gánh về kho",
  repairing: "Đang xây",
  seekingResource: "Đi lấy hàng",
};

const JOB_LABEL: Record<string, string> = {
  node: "Giữ mỏ vàng",
  wood: "Đốn gỗ",
  stone: "Đào đá",
  water: "Gánh nước",
  food: "Gặt lúa",
};

/** Dựng thông tin vật thể cho modal (null khi không có gì/chết rồi). */
export function snapshotInspector(game: Game, id: number | null): InspectorSnap | null {
  if (id == null) return null;
  const e = game.world.get(id);
  if (!e) return null;
  const p = game.world.players.find((pl) => pl.id === e.player);
  const owner = p?.name ?? (e.player === 7 ? "Quái dungeon" : "Trung lập");
  const color = p?.color ?? (e.player === 7 ? "#a855f7" : "#9ca3af");
  if (e.kind === "unit") {
    const def = UNIT_DEFS[e.defId];
    if (!def) return null;
    const lines: { k: string; v: string }[] = [];
    lines.push({
      k: "Tấn công",
      v: def.damage > 0 ? `${def.damage} dmg${def.range > 0 ? ` · tầm ${def.range}` : " · giáp lá cà"}` : "Không đánh",
    });
    lines.push({ k: "Tốc độ", v: `${def.speed} ô/s · nhìn ${def.sight}` });
    lines.push({ k: "Trạng thái", v: STATE_LABEL[e.state] ?? e.state });
    if (e.defId === "worker") lines.push({ k: "Việc", v: JOB_LABEL[e.job] ?? e.job });
    if (e.carry > 0) lines.push({ k: "Đang gánh", v: `${e.carry} ${e.carryType}` });
    if (e.kills > 0) lines.push({ k: "Hạ gục", v: `${e.kills}${e.vetLevel === 2 ? " ★★" : e.vetLevel === 1 ? " ★" : ""}` });
    if (def.bounty > 0) lines.push({ k: "Tiền thưởng", v: `+${def.bounty} vàng` });
    return { id: e.id, title: def.name, icon: def.icon, owner, color, hp: e.hp, maxHp: e.maxHp, lines, desc: def.description };
  }
  const def = BUILDING_DEFS[e.defId];
  if (!def) return null;
  const lines: { k: string; v: string }[] = [];
  if (e.underConstruction) lines.push({ k: "Tiến độ", v: `${Math.floor(e.buildProgress * 100)}%` });
  if (def.income > 0) lines.push({ k: "Thu nhập", v: `+${def.income} vàng/s` });
  if (def.water > 0) lines.push({ k: "Nước", v: `+${def.water}/s` });
  if (e.defId === "house") lines.push({ k: "Dân số", v: "+7 (xong tặng 2 nông dân)" });
  if (e.defId === "farm") lines.push({ k: "Kho", v: "Nộp +25%, tưới +50%/gáo" });
  if (def.atkDamage) lines.push({ k: "Pháo", v: `${def.atkDamage} dmg · tầm ${def.atkRange}` });
  return { id: e.id, title: def.name, icon: def.icon, owner, color, hp: e.hp, maxHp: e.maxHp, lines, desc: def.description };
}
