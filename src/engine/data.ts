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
  /** gỗ / đá / lúa kèm theo (0 = không cần) */
  wood: number;
  stone: number;
  food: number;
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
  /** vàng thưởng khi bị hạ (chỉ quái dungeon, lính thường = 0) */
  bounty: number;
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
  cost: number; // gold
  /** gỗ / đá xây dựng (0 = không tốn) */
  wood: number;
  stone: number;
  armor: number;
  sight: number;
  /** gold per second khi được sở hữu (chỉ node) */
  income: number;
  /** nước per second khi được sở hữu */
  water: number;
  /** capture radius in tiles (chỉ node) */
  captureRadius: number;
  /** Tấn công tự vệ (tháp canh): tầm bắn tiles / sát thương / giây giữa phát. */
  atkRange?: number;
  atkDamage?: number;
  atkCooldown?: number;
  description: string;
}

export const TILE = 32;

/** Population cap toàn trận. */
export const POP_CAP = 20;
/** Base chỉ nuôi 6 dân — muốn đông phải xây nhà ở. */
export const BASE_POP = 6;
/** Mỗi nhà đã xong +7 pop (6 + 7x2 = 20 max). */
export const HOUSE_POP = 7;
export const MAX_HOUSES = 2;
export const MAX_FARMS = 2;
export const MAX_WELLS = 2;
export const MAX_TOWERS = 2;
export const MAX_MARKETS = 2;
/** Giây xây xong 1 công trình / 1 thợ. */
export const BUILD_TIME = 15;
/** Tối đa thợ cùng xây 1 móng (từ thợ thứ 2 trở đi nhanh dần nhưng diminishing). */
export const MAX_BUILDERS_PER_SITE = 3;
/** Hệ số tốc độ xây theo số thợ ĐÃ TỚI nơi: 1 thợ 1x · 2 thợ 1.7x · 3 thợ 2.2x. */
export const BUILD_RATE = [0, 1, 1.7, 2.2];
/** Gỗ dư tới đây mới nghĩ tới trang trại. */
export const FARM_WOOD_STOCK = 150;
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
    food: 0,
    supply: 1,
    armor: 0,
    bonusVsBuilding: 0,
    projectileSpeed: 0,
    splash: 0,
    canGather: true, // = có thể chiếm mỏ
    waterUse: 0.1,
    bounty: 0,
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
    food: 10,
    supply: 1,
    armor: 0,
    bonusVsBuilding: 0.2,
    projectileSpeed: 0, // đánh gần hitscan
    splash: 0,
    canGather: false,
    waterUse: 0.15,
    bounty: 0,
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
    food: 10,
    supply: 1,
    armor: 0,
    bonusVsBuilding: 0,
    projectileSpeed: 420, // tên bay
    splash: 0,
    canGather: false,
    waterUse: 0.15,
    bounty: 0,
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
    food: 30,
    supply: 3,
    armor: 2,
    bonusVsBuilding: 0.5,
    projectileSpeed: 0,
    splash: 20,
    canGather: false,
    waterUse: 0.3,
    bounty: 0,
    radius: 14,
    description: "Khiên thịt đi đầu. Tốn gỗ + đá.",
  },
  // --- Quái dungeon (phe MONSTER, không spawn bằng lệnh thường) ---
  slime: monsterDef("slime", "Slime", "🟢", 60, 6, 15, { speed: 1.6, radius: 8 }),
  slimeblue: monsterDef("slimeblue", "Blue Slime", "🔵", 95, 9, 22, { speed: 1.6, radius: 8 }),
  bigslime: monsterDef("bigslime", "Big Slime", "🟢", 150, 13, 32, { radius: 10 }),
  orc: monsterDef("orc", "Orc", "👺", 180, 17, 42, { speed: 1.9 }),
  skeleton: monsterDef("skeleton", "Skeleton", "💀", 130, 21, 48, { speed: 1.8, radius: 8 }),
  demon: monsterDef("demon", "Demon", "😈", 420, 28, 110, { speed: 1.6, radius: 12 }),
  // --- Thú rừng trung lập (không ai đánh, chỉ đi lang thang) ---
  boar: monsterDef("boar", "Boar", "🐗", 30, 0, 0, { speed: 1.5, radius: 7 }),
  sheep: monsterDef("sheep", "Sheep", "🐑", 20, 0, 0, { speed: 1.2, radius: 7 }),
  chicken: monsterDef("chicken", "Chicken", "🐔", 15, 0, 0, { speed: 1.8, radius: 6 }),
  dragon: monsterDef("dragon", "Dragon", "🐉", 1300, 48, 260, {
    speed: 1.4, sight: 7, range: 2, splash: 30, radius: 16,
    description: "Trùm dungeon. Hạ được +260 vàng!",
  }),
};

/** Thứ tự spawn hiển thị ở thanh đáy. */
export const SPAWN_ORDER = ["worker", "soldier", "archer", "tank"] as const;

/** Phe quái dungeon (trung lập thù địch): tái dùng toàn bộ combat/targeting có sẵn. */
export const MONSTER = 7;

/** Quái dungeon theo cấp độ khó tăng dần (vòng ngoài → lõi). */
export const MONSTER_ORDER = ["slime", "slimeblue", "bigslime", "orc", "skeleton", "demon", "dragon"] as const;

/** Thú rừng trung lập đi lang thang (không thuộc phe nào, không ai đánh). */
export const CRITTER_ORDER = ["boar", "sheep", "chicken"] as const;

export function isCritterDef(id: string): boolean {
  return (CRITTER_ORDER as readonly string[]).includes(id);
}

function monsterDef(
  id: string, name: string, icon: string, hp: number, dmg: number, bounty: number,
  extra: Partial<UnitDef> = {}
): UnitDef {
  return {
    id, name, icon, hp,
    speed: 1.7, sight: 5, range: 1.2, damage: dmg, cooldown: 1.3,
    cost: 0, wood: 0, stone: 0, food: 0, supply: 0, armor: 0,
    bonusVsBuilding: 0, projectileSpeed: 0, splash: 0, canGather: false,
    waterUse: 0, bounty, radius: 9,
    description: `Quái dungeon. Hạ được +${bounty} vàng.`,
    ...extra,
  };
}

/** Tra cứu def quái (đã gộp chung vào UNIT_DEFS để combat/render dùng chung). */
export function isMonsterDef(id: string): boolean {
  return (MONSTER_ORDER as readonly string[]).includes(id);
}

export const BUILDING_DEFS: Record<string, BuildingDef> = {
  base: {
    id: "base",
    name: "Base",
    icon: "🏰",
    hp: 2000,
    w: 4,
    h: 4,
    cost: 0,
    wood: 0,
    stone: 0,
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
    wood: 0,
    stone: 0,
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
    wood: 0,
    stone: 0,
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
    wood: 0,
    stone: 0,
    armor: 0,
    sight: 5,
    income: 20,
    water: 0,
    captureRadius: 5,
    description: "+20 Gold/s. Tử địa — giàu nhanh, chết cũng nhanh.",
  },
  house: {
    id: "house",
    name: "Nhà",
    icon: "🏠",
    hp: 300,
    w: 2,
    h: 2,
    cost: 0,
    wood: 50,
    stone: 0,
    armor: 0,
    sight: 4,
    income: 0,
    water: 0,
    captureRadius: 0,
    description: "BẮT BUỘC đầu tiên: +7 dân số (không nhà chỉ nuôi 6 dân). Xong nhà tặng 2 nông dân.",
  },
  farm: {
    id: "farm",
    name: "Trang trại",
    icon: "🌾",
    hp: 400,
    w: 3,
    h: 3,
    cost: 0,
    wood: 100,
    stone: 25,
    armor: 0,
    sight: 5,
    income: 0,
    water: 0,
    captureRadius: 0,
    description: "KHO CHÍNH (cần có nhà mới xây): có farm thì mọi tài nguyên chỉ nộp vào farm. Nộp tại farm +25%, tưới ruộng quanh farm +50%/gáo.",
  },
  tower: {
    id: "tower",
    name: "Tháp canh",
    icon: "🗼",
    hp: 600,
    w: 1,
    h: 2,
    cost: 0,
    wood: 75,
    stone: 25,
    armor: 1,
    sight: 7,
    income: 0,
    water: 0,
    captureRadius: 0,
    atkRange: 6,
    atkDamage: 18,
    atkCooldown: 1.5,
    description: "Pháo tự vệ: bắn địch trong 6 ô (18 dmg). Dựng giữ nhà khi bị quấy.",
  },
  market: {
    id: "market",
    name: "Chợ",
    icon: "🏪",
    hp: 400,
    w: 2,
    h: 2,
    cost: 0,
    wood: 100,
    stone: 0,
    armor: 0,
    sight: 5,
    income: 4,
    water: 0,
    captureRadius: 0,
    description: "Buôn bán: +4 vàng/s. Gỗ dư thì dựng chợ đẻ tiền.",
  },
  well: {
    id: "well",
    name: "Giếng",
    icon: "🪣",
    hp: 300,
    w: 2,
    h: 2,
    cost: 0,
    wood: 50,
    stone: 0,
    armor: 0,
    sight: 4,
    income: 0,
    water: 1.5,
    captureRadius: 0,
    description: "Nước ngầm: +1.5 nước/s. Quân đông thì đào giếng khỏi khát.",
  },
};
