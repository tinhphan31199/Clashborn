/**
 * Field art — ảnh PixelLab trong public/assets vẽ lên chiến trường.
 * Load lười (lazy): lần render đầu tiên kích hoạt tải, ảnh hiện dần khi xong.
 * Chưa tải xong / tải lỗi → render.ts tự rớt về hình vẽ mặc định.
 */
export interface FieldArt {
  arena: HTMLImageElement | null;
  tree: HTMLImageElement | null;
  diamond: HTMLImageElement | null;
  water: HTMLImageElement | null;
  grass: HTMLImageElement | null;
  base: HTMLImageElement | null;
  field: HTMLImageElement | null;
}

const cache: FieldArt = {
  arena: null,
  tree: null,
  diamond: null,
  water: null,
  grass: null,
  base: null,
  field: null,
};

let started = false;

// Frames đi bộ của lính phe ta (8 frames mỗi loại, vẽ theo nhịp game).
const UNIT_IDS = ["worker", "soldier", "archer", "tank"] as const;
const unitCache: Record<string, (HTMLImageElement | null)[]> = {
  worker: [],
  soldier: [],
  archer: [],
  tank: [],
};
let unitsStarted = false;

function loadOne(key: keyof FieldArt, src: string) {
  const img = new Image();
  img.onload = () => {
    cache[key] = img;
  };
  img.onerror = () => {
    /* giữ null → vẽ fallback */
  };
  img.src = src;
}

export function fieldArt(): FieldArt {
  if (typeof window === "undefined") return cache;
  if (!started) {
    started = true;
    loadOne("arena", "/assets/arena.png");
    loadOne("tree", "/assets/tree.png");
    loadOne("diamond", "/assets/diamond.png");
    loadOne("water", "/assets/water-tile.png");
    loadOne("grass", "/assets/grass-tile.png");
    loadOne("base", "/assets/base.png");
    loadOne("field", "/assets/field-tile.png");
  }
  return cache;
}

/** 8 frames đi bộ của 1 loại lính (rỗng cho tới khi tải xong từng frame). */
export function unitFrames(defId: string): (HTMLImageElement | null)[] {
  if (typeof window === "undefined") return [];
  if (!unitsStarted) {
    unitsStarted = true;
    for (const id of UNIT_IDS) {
      for (let i = 0; i < 8; i++) {
        const img = new Image();
        const slot = unitCache[id];
        img.onload = () => {
          slot[i] = img;
        };
        img.onerror = () => {
          /* frame lỗi → drawUnit rớt về emoji */
        };
        img.src = `/assets/units/${id}/${i}.png`;
      }
    }
  }
  return unitCache[defId] ?? [];
}
