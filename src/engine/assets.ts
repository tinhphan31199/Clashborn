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
}

const cache: FieldArt = {
  arena: null,
  tree: null,
  diamond: null,
  water: null,
  grass: null,
  base: null,
};

let started = false;

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
  }
  return cache;
}
