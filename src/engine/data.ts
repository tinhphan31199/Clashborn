/**
 * Data-driven unit / building definitions — AUTO-BATTLER edition.
 *
 * Triết lý: người chơi là "vị tướng đứng sau", chỉ quyết định
 * thả lính nào / khi nào. Lính tự di chuyển, thu thập, chiến đấu.
 *
 * Roster MVP (1 resource duy nhất: Gold):
 *  worker  30g  HP50   không đánh, chiếm mỏ + bỏ chạy
 *  soldier 50g  HP150  dmg20, ưu tiên Worker địch (đánh kinh tế)
 *  archer  70g  HP80   dmg30 range5, ưu tiên Tank > Soldier > Worker
 *  tank    120g HP500  dmg15, khiên thịt đi đầu, pop 3
 */

export interface UnitDef {
  id: string;
  name: string;
  icon: string;
  hp: number;
  /** tiles per second */
  speed: number;
  /** tiles */
  sight: number;
  /** tiles, 0 = cannot attack */
  range: number;
  damage: number;
  /** seconds between attacks */
  cooldown: number;
  cost: number; // gold
  /** gỗ / đá kèm theo (0 = không cần) */
  wood: number;
  stone: number;
  /** population cost */
  supply: number;
  /** flat damage reduction */
  armor: number;
  bonusVsBuilding: number;
  /** px/sec, 0 = hitscan (instant) */
  projectileSpeed: number;
  splash: number;
  canGather: boolean;
  /** nước uống mỗi giây (upkeep). Hết nước cả phe yếu 30%. */
  waterUse: number;
  /** render radius in px */
  radius: number;
  description: string;
}

export interface BuildingDef {
  id: string;
  name: string;
  icon: string;
  hp: number;
  /** footprint in tiles */
  w: number;
  h: number;
  cost: number;
  armor: number;
  sight: number;
  /** gold per second khi được sở hữu (chỉ node) */
  income: number;
  /** nước per second khi được sở hữu */
  water: number;
  /** capture radius in tiles (chỉ node) */
  captureRadius: number;
  description: string;
}

export const TILE = 32;

/** Population cap toàn trận. */
export const POP_CAP = 20;
/** Sudden death sau 10 phút. */
export const SUDDEN_DEATH_AT = 10 * 60;

export const UNIT_DEFS: Record<string, UnitDef> = {
  worker: {
    id: "worker",
    name: "Worker",
    icon: "👷",
    hp: 50,
    speed: 2.4,
    sight: 6,
    range: 0,
    damage: 0,
    cooldown: 1,
    cost: 30,
    wood: 0,
    stone: 0,
    supply: 1,
    armor: 0,
    bonusVsBuilding: 0,
    projectileSpeed: 0,
    splash: 0,
    canGather: true, // = có thể chiếm mỏ
    waterUse: 0.1,
    radius: 8,
    description: "Chiếm mỏ Gold. Gặp địch thì bỏ chạy về Base.",
  },
  soldier: {
    id: "soldier",
    name: "Soldier",
    icon: "⚔️",
    hp: 150,
    speed: 2.0,
    sight: 7,
    range: 1.2,
    damage: 20,
    cooldown: 1.0,
    cost: 50,
    wood: 0,
    stone: 0,
    supply: 1,
    armor: 0,
    bonusVsBuilding: 0.2,
    projectileSpeed: 0, // đánh gần hitscan
    splash: 0,
    canGather: false,
    waterUse: 0.15,
    radius: 9,
    description: "Lính cơ bản. Ưu tiên Worker địch.",
  },
  archer: {
    id: "archer",
    name: "Archer",
    icon: "🏹",
    hp: 80,
    speed: 2.0,
    sight: 8,
    range: 5,
    damage: 30,
    cooldown: 1.5,
    cost: 50,
    wood: 25,
    stone: 0,
    supply: 1,
    armor: 0,
    bonusVsBuilding: 0,
    projectileSpeed: 420, // tên bay
    splash: 0,
    canGather: false,
    waterUse: 0.15,
    radius: 8,
    description: "Sát thương cao, mỏng. Tốn gỗ. Ưu tiên Tank > Soldier > Worker.",
  },
  tank: {
    id: "tank",
    name: "Tank",
    icon: "🛡️",
    hp: 500,
    speed: 1.1,
    sight: 6,
    range: 1.2,
    damage: 15,
    cooldown: 1.5,
    cost: 100,
    wood: 50,
    stone: 25,
    supply: 3,
    armor: 2,
    bonusVsBuilding: 0.5,
    projectileSpeed: 0,
    splash: 20,
    canGather: false,
    waterUse: 0.3,
    radius: 14,
    description: "Khiên thịt đi đầu. Tốn gỗ + đá.",
  },
};

/** Thứ tự spawn hiển thị ở thanh đáy. */
export const SPAWN_ORDER = ["worker", "soldier", "archer", "tank"] as const;

export const BUILDING_DEFS: Record<string, BuildingDef> = {
  base: {
    id: "base",
    name: "Base",
    icon: "🏰",
    hp: 2000,
    w: 4,
    h: 4,
    cost: 0,
    armor: 2,
    sight: 10,
    income: 2, // thu nhập nền để không bao giờ kẹt cứng
    water: 0.5,
    captureRadius: 0,
    description: "Phá hủy Base địch để thắng.",
  },
  node_near: {
    id: "node_near",
    name: "Mỏ gần",
    icon: "💎",
    hp: 400,
    w: 2,
    h: 2,
    cost: 0,
    armor: 0,
    sight: 4,
    income: 5,
    water: 0,
    captureRadius: 4,
    description: "+5 Gold/s. An toàn.",
  },
  node_mid: {
    id: "node_mid",
    name: "Mỏ giữa",
    icon: "💎",
    hp: 400,
    w: 2,
    h: 2,
    cost: 0,
    armor: 0,
    sight: 4,
    income: 10,
    water: 0,
    captureRadius: 4,
    description: "+10 Gold/s. Rủi ro trung bình.",
  },
  node_center: {
    id: "node_center",
    name: "Mỏ trung tâm",
    icon: "💎",
    hp: 600,
    w: 2,
    h: 2,
    cost: 0,
    armor: 0,
    sight: 5,
    income: 20,
    water: 0,
    captureRadius: 5,
    description: "+20 Gold/s. Tử địa — giàu nhanh, chết cũng nhanh.",
  },
};
