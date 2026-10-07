/**
 * Command — AUTO-BATTLER edition.
 * Người chơi không micro: spawn lính + chỉnh xu hướng War Council.
 * Quân spawn ra tự ra mặt trận, không cần đặt điểm tập kết.
 */
import { MapFocus, NeedWeights, PlayerId } from "./types";

export interface DirectivePatch {
  ecoMil?: number; // 0 kinh tế … 1 quân sự
  defAtk?: number; // 0 thủ … 1 công
  focus?: MapFocus;
  autoSpend?: boolean;
  /** mức cần vàng/gỗ/đá/nước (0 thôi · 1 thường · 2 cần gấp) */
  needs?: NeedWeights;
}

export type Command =
  | { type: "spawnUnit"; player: PlayerId; unitDefId: string }
  | ({ type: "setDirective"; player: PlayerId } & DirectivePatch);

/** Học thuyết 1 chạm: preset của War Council, đổi giữa trận được. */
export const DOCTRINES = {
  rush: { ecoMil: 0.8, defAtk: 0.9, focus: "center" as MapFocus },
  turtle: { ecoMil: 0.3, defAtk: 0.15, focus: "near" as MapFocus },
  control: { ecoMil: 0.5, defAtk: 0.5, focus: "mid" as MapFocus },
};
