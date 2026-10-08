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
  house: HTMLImageElement | null;
  farm: HTMLImageElement | null;
  field: HTMLImageElement | null;
  stump: HTMLImageElement | null;
  ripe: HTMLImageElement | null;
  apple: HTMLImageElement | null;
}

const cache: FieldArt = {
  arena: null,
  tree: null,
  diamond: null,
  water: null,
  grass: null,
  base: null,
  house: null,
  farm: null,
  field: null,
  stump: null,
  ripe: null,
  apple: null,
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
    loadOne("house", "/assets/house.png");
    loadOne("farm", "/assets/farm.png");
    loadOne("field", "/assets/field-tile.png");
    loadOne("stump", "/assets/stump-tile.png");
    loadOne("ripe", "/assets/field-ripe.png");
    loadOne("apple", "/assets/apple-tree.png");
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

/** Asset MiniWorldSprites (ô 16px): cây/đá/cỏ + nhà theo phe. */
export interface MiniArt {
  trees: (HTMLImageElement | null)[];
  rocks: (HTMLImageElement | null)[];
  grass: (HTMLImageElement | null)[];
  water: (HTMLImageElement | null)[];
  dirt: (HTMLImageElement | null)[];
  houseCyan: HTMLImageElement | null;
  houseRed: HTMLImageElement | null;
  towerCyan: HTMLImageElement | null;
  towerRed: HTMLImageElement | null;
  marketCyan: HTMLImageElement | null;
  marketRed: HTMLImageElement | null;
  wellCyan: HTMLImageElement | null;
  wellRed: HTMLImageElement | null;
  road: (HTMLImageElement | null)[];
}

const miniCache: MiniArt = {
  trees: [], rocks: [], grass: [], water: [], dirt: [],
  houseCyan: null, houseRed: null,
  towerCyan: null, towerRed: null,
  marketCyan: null, marketRed: null,
  wellCyan: null, wellRed: null,
  road: [],
};
let miniStarted = false;

function loadMiniImg(src: string, set: (img: HTMLImageElement) => void) {
  const img = new Image();
  img.onload = () => set(img);
  img.src = src;
}

export function miniArt(): MiniArt {
  if (typeof window === "undefined") return miniCache;
  if (!miniStarted) {
    miniStarted = true;
    ["a", "b"].forEach((v, i) => loadMiniImg(`/assets/mini/tree-${v}.png`, (img) => { miniCache.trees[i] = img; }));
    [0, 1, 2].forEach((i) => {
      loadMiniImg(`/assets/mini/rock-${i}.png`, (img) => { miniCache.rocks[i] = img; });
      loadMiniImg(`/assets/mini/grass-${i}.png`, (img) => { miniCache.grass[i] = img; });
      loadMiniImg(`/assets/mini/water-${i}.png`, (img) => { miniCache.water[i] = img; });
      loadMiniImg(`/assets/mini/dirt-${i}.png`, (img) => { miniCache.dirt[i] = img; });
    });
    loadMiniImg("/assets/mini/house-cyan.png", (img) => { miniCache.houseCyan = img; });
    loadMiniImg("/assets/mini/house-red.png", (img) => { miniCache.houseRed = img; });
    loadMiniImg("/assets/mini/tower-cyan.png", (img) => { miniCache.towerCyan = img; });
    loadMiniImg("/assets/mini/tower-red.png", (img) => { miniCache.towerRed = img; });
    loadMiniImg("/assets/mini/market-cyan.png", (img) => { miniCache.marketCyan = img; });
    loadMiniImg("/assets/mini/market-red.png", (img) => { miniCache.marketRed = img; });
    loadMiniImg("/assets/mini/well-cyan.png", (img) => { miniCache.wellCyan = img; });
    loadMiniImg("/assets/mini/well-red.png", (img) => { miniCache.wellRed = img; });
    [0, 1, 2, 3, 4, 5].forEach((i) => {
      loadMiniImg(`/assets/mini/road-${i}.png`, (img) => { miniCache.road[i] = img; });
    });
  }
  return miniCache;
}

/** true khi mảng sprite đã tải đủ n frame. */
export function miniReady(arr: (HTMLImageElement | null)[], n: number): boolean {
  return arr.length >= n && arr.every(Boolean);
}

/** Sprite quái dungeon (1 frame đứng mỗi loại). */
const MONSTER_FILES: Record<string, string> = {
  slime: "slime.png",
  slimeblue: "slime-blue.png",
  bigslime: "slime-big.png",
  orc: "orc.png",
  skeleton: "skeleton.png",
  demon: "demon.png",
  dragon: "dragon.png",
};

const monsterCache: Record<string, HTMLImageElement | null> = {};
let monsterStarted = false;

export function monsterArt(): Record<string, HTMLImageElement | null> {
  if (typeof window === "undefined") return monsterCache;
  if (!monsterStarted) {
    monsterStarted = true;
    for (const [id, file] of Object.entries(MONSTER_FILES)) {
      const img = new Image();
      img.onload = () => {
        monsterCache[id] = img;
      };
      img.src = `/assets/monsters/${file}`;
    }
  }
  return monsterCache;
}

/** Kích thước vẽ quái (px) theo loại. */
export function monsterSize(defId: string): number {
  if (defId === "dragon") return 72;
  if (defId === "demon") return 44;
  if (defId === "bigslime") return 30;
  if (defId === "orc") return 34;
  if (defId === "skeleton") return 32;
  return 24;
}
