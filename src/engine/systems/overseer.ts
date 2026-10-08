/**
 * OverseerAgent — "quan đốc công" của từng phe: RA LỆNH cho worker hành động.
 *
 * 3 nhịp:
 *  - Mỗi tick (build): quyết XÂY GÌ / KHI NÀO / Ở ĐÂU theo chuỗi
 *    (nhà bắt buộc → farm ngay → nhà 2 → farm 2), đất do placement chấm điểm.
 *  - Mỗi tick (command): móng nào thiếu thợ thì điều thợ rảnh gần nhất tới
 *    xây (lệnh build qua issueOrder). constructionTick chỉ lo tiến độ móng.
 *  - Mỗi 30s (strategy): đọc kho tài nguyên, thu nhập, khủng hoảng và
 *    YÊU CẦU CỦA TƯỚNG (needs 0/1/2 ở War Council), rồi chốt chỉ tiêu việc
 *    + thiếu tay thì XIN THÊM worker (tối đa 2 cháu/30s).
 *
 * Thi hành: rolesTick trong economy đọc chỉ tiêu này (còn tươi < 30s) và
 * điều worker mỗi tick — hết hạn thì rolesTick tự tính như cũ.
 * Lệnh gần nhất xem bằng overseerReport() (HUD hiển thị).
 */
import {
  BUILDING_DEFS,
  FARM_WOOD_STOCK,
  MAX_BUILDERS_PER_SITE,
  MAX_FARMS,
  MAX_HOUSES,
  MAX_MARKETS,
  MAX_TOWERS,
  MAX_WELLS,
  UNIT_DEFS,
} from "../data";
import { Command } from "../commands";
import { buildersOf, sitesNeedingBuilders, startSite } from "./construction";
import { chooseSite } from "./placement";
import { WORKER_INSTINCT, issueOrder } from "./workOrders";
import { Entity, PlayerId, PlayerState, WorkerJob } from "../types";
import { World } from "../World";

export const OVERSEER_EVERY = 20;

export interface OverseerPlan {
  quotas: Record<WorkerJob, number>;
  at: number;
  summary: string;
}

const plans = new WeakMap<World, Map<number, OverseerPlan>>();
const lastBucket = new WeakMap<World, Map<number, number>>();

function store(world: World): Map<number, OverseerPlan> {
  let m = plans.get(world);
  if (!m) {
    m = new Map();
    plans.set(world, m);
  }
  return m;
}

/** Chỉ tiêu còn tươi (< 30s) cho rolesTick thi hành. Hết hạn → null. */
export function getPlan(world: World, player: number): OverseerPlan | null {
  const p = plans.get(world)?.get(player);
  if (!p) return null;
  if (world.time - p.at > OVERSEER_EVERY) return null;
  return p;
}

/** Lệnh gần nhất (cho HUD đọc). */
export function overseerReport(world: World, player: number): string {
  const p = plans.get(world)?.get(player);
  if (!p) return "Quan đốc công chưa ra lệnh.";
  const mm = Math.floor(p.at / 60);
  const ss = Math.floor(p.at % 60)
    .toString()
    .padStart(2, "0");
  return `[${mm}:${ss}] ${p.summary}`;
}

/** Agent ra lệnh mỗi tick (khởi công + điều thợ xây) và chiến lược mỗi 30s. */
export function overseerTick(
  world: World,
  dispatch: (cmd: Command) => void,
): void {
  buildTick(world);
  commandTick(world);
  const bucket = Math.floor(world.time / OVERSEER_EVERY);
  for (const pl of world.players) {
    if (!pl.alive) continue;
    let m = lastBucket.get(world);
    if (!m) {
      m = new Map();
      lastBucket.set(world, m);
    }
    if ((m.get(pl.id) ?? -1) === bucket) continue;
    m.set(pl.id, bucket);
    decide(world, pl, dispatch);
  }
}

/** Nhịp khởi công: quyết XÂY GÌ / KHI NÀO / Ở ĐÂU (1 công trình/lần). */
function buildTick(world: World): void {
  for (const pl of world.players) {
    if (!pl.alive) continue;
    // Đang xây dở thì thôi — xong mới tính tiếp.
    const house = countSites(world, pl.id, "house");
    const farm = countSites(world, pl.id, "farm");
    const well = countSites(world, pl.id, "well");
    const tower = countSites(world, pl.id, "tower");
    const market = countSites(world, pl.id, "market");
    if (
      house.total > house.done || farm.total > farm.done ||
      well.total > well.done || tower.total > tower.done || market.total > market.done
    ) {
      continue;
    }

    const workers = world
      .unitsOf(pl.id)
      .filter((u) => u.defId === "worker").length;
    const affords = (id: string): boolean => {
      const def = BUILDING_DEFS[id];
      return pl.wood >= (def.wood ?? 0) && (pl.stone ?? 0) >= (def.stone ?? 0);
    };
    const houseCost = BUILDING_DEFS.house.wood ?? 0;
    const farmCostW = BUILDING_DEFS.farm.wood ?? 0;
    const farmCostS = BUILDING_DEFS.farm.stone ?? 0;
    const base = world.baseOf(pl.id);
    const baseDanger = base ? 1 - base.hp / base.maxHp : 0;
    let defId: string | null = null;
    if (house.total === 0 && pl.wood >= houseCost && workers >= 1) {
      // BẮT BUỘC: chưa có nhà nào thì đủ gỗ là xây ngay, không chờ gì hết.
      defId = "house";
    } else if (
      house.done >= 1 &&
      farm.total === 0 &&
      pl.wood >= farmCostW &&
      (pl.stone ?? 0) >= farmCostS &&
      workers >= 1
    ) {
      // CHUỖI: có nhà mà chưa có farm nào thì đủ tiền là xây farm ngay,
      // không chờ gỗ dư hay 5 phút.
      defId = "farm";
    } else if (
      house.done < MAX_HOUSES &&
      pl.wood >= houseCost &&
      (pl.supplyUsed >= pl.supplyCap - 2 ||
        (world.time > 150 && house.done === 0 && workers >= 3))
    ) {
      // Nhà 2 khi sắp đầy pop.
      defId = "house";
    } else if (
      house.done >= 1 && well.total < MAX_WELLS && affords("well") && workers >= 1 &&
      (pl.water < 20 || world.time > 180)
    ) {
      // Giếng: quân đông khát nước (hoặc giữa game) thì đào.
      defId = "well";
    } else if (
      house.done >= 1 && tower.total < MAX_TOWERS && affords("tower") && workers >= 1 &&
      (baseDanger > 0.1 || world.time > 240)
    ) {
      // Tháp canh: base từng bị đánh (hoặc giữa game) thì dựng giữ nhà.
      defId = "tower";
    } else if (
      house.done >= 1 && market.total < MAX_MARKETS && affords("market") && workers >= 1 &&
      pl.wood >= FARM_WOOD_STOCK
    ) {
      // Chợ: gỗ dư thì dựng đẻ vàng.
      defId = "market";
    } else if (
      house.done >= 1 &&
      farm.done < MAX_FARMS &&
      (pl.wood >= FARM_WOOD_STOCK ||
        (world.time > 300 && farm.done === 0 && pl.wood >= farmCostW)) &&
      pl.wood >= farmCostW &&
      (pl.stone ?? 0) >= farmCostS
    ) {
      // Farm 2: gỗ dư HOẶC sau 5:00 chưa có farm nào.
      defId = "farm";
    }
    if (!defId) continue;
    // Ở ĐÂU là agent chấm điểm (placement); hết đất thì để nhịp sau.
    const spot = chooseSite(world, pl.id, defId);
    if (!spot) continue;
    startSite(world, pl.id, defId, spot.tx, spot.ty);
  }
}

/** Nhịp lệnh: móng nào thiếu thợ thì điều thêm cho đủ tốp (tối đa 3). */
function commandTick(world: World): void {
  for (const pl of world.players) {
    if (!pl.alive) continue;
    for (const site of sitesNeedingBuilders(world, pl.id)) {
      while (buildersOf(world, site).length < MAX_BUILDERS_PER_SITE) {
        const b = nearestFreeWorker(world, site);
        if (!b) break;
        if (!issueOrder(world, b, { kind: "build", siteId: site.id })) break;
      }
    }
  }
}

/** Thợ rảnh tay trắng gần móng nhất (tay trắng, đang làm việc dở cũng được giật). */
function nearestFreeWorker(world: World, site: Entity): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const u of world.unitsOf(site.player)) {
    if (u.defId !== "worker" || u.carry > 0) continue;
    if (
      u.state !== "idle" &&
      u.state !== "gathering" &&
      u.state !== "seekingResource"
    )
      continue;
    const d = Math.hypot(site.x - u.x, site.y - u.y);
    if (d < bestD) {
      bestD = d;
      best = u;
    }
  }
  return best;
}

function countSites(
  world: World,
  player: PlayerId,
  defId: string,
): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const e of world.entities.values()) {
    if (e.kind !== "building" || e.defId !== defId || e.player !== player)
      continue;
    total++;
    if (!e.underConstruction) done++;
  }
  return { done, total };
}

function decide(
  world: World,
  pl: PlayerState,
  dispatch: (cmd: Command) => void,
): void {
  const player = pl.id;
  const workers = world.unitsOf(player).filter((u) => u.defId === "worker");
  const n = workers.length;
  const save = (quotas: Record<WorkerJob, number>, summary: string) => {
    store(world).set(player, { quotas, at: world.time, summary });
  };

  const req = pl.needs;
  const wood = pl.wood ?? 0;
  const stone = pl.stone ?? 0;
  const water = pl.water;
  const food = pl.food ?? 0;
  const house = countSites(world, player, "house");
  const farm = countSites(world, player, "farm");

  // Ngưỡng khủng hoảng (đồng bộ với shortages() trong economy.ts).
  const waterCrisis = water < 12 || (pl.waterIncome < -1 && water < 20);
  const foodLow = food < 20 && world.time > 90;

  // Trọng số khởi điểm = yêu cầu của tướng (0 thôi · 1 thường · 2 cần gấp).
  let wWood = req.wood;
  let wStone = req.stone;
  let wWater = req.water;
  let wFood = req.food;
  const reasons: string[] = [];
  if (req.wood === 2) reasons.push("tướng cần 🪵 gấp");
  if (req.stone === 2) reasons.push("tướng cần 🪨 gấp");
  if (req.water === 2) reasons.push("tướng cần 💧 gấp");
  if (req.food === 2) reasons.push("tướng cần 🌾 gấp");
  if (req.gold === 2) reasons.push("tướng cần 💰 gấp");

  // Ghi đè chiến lược — nhưng tôn trọng "0 = thôi" của tướng,
  // trừ 2 trường hợp sinh tồn: chưa có nhà, hết nước.
  if (house.total === 0 && wood < 50) {
    wWood = Math.max(wWood, 3);
    reasons.push("đủ 50🪵 xây nhà");
  }
  if (house.done >= 1 && farm.total === 0) {
    if (wood < 100) {
      wWood = Math.max(wWood, 3);
      reasons.push("farm cần 100🪵");
    } else if (stone < 25) {
      wStone = Math.max(wStone, 3);
      reasons.push("farm cần 25🪨");
    }
  }
  if (waterCrisis) {
    wWater = 3;
    reasons.push("💧 sắp cạn — quân yếu 30%");
  } else if (water < 25 && pl.waterIncome < 0) {
    wWater = Math.max(wWater, 2);
    reasons.push("💧 hụt dần");
  }
  if (foodLow) {
    wFood = Math.max(wFood, 2);
    reasons.push("🌾 thiếu lúa train lính");
  }
  // Tướng bảo thôi (0) thì thôi — trừ sinh tồn.
  const survivalWood = house.total === 0 && wood < 50;
  if (req.wood === 0 && !survivalWood) wWood = 0;
  if (req.stone === 0) wStone = 0;
  if (req.water === 0 && !waterCrisis) wWater = 0;
  if (req.food === 0) wFood = 0;

  // Chia suất theo trọng số (cùng cách chia với rolesTick).
  const nodeTarget = req.gold === 0 ? 1 : req.gold === 2 ? 4 : 2;
  const quotas: Record<WorkerJob, number> = {
    node: 0,
    wood: 0,
    stone: 0,
    water: 0,
    food: 0,
  };
  quotas.node = Math.min(nodeTarget, n);
  const slots = n - quotas.node;
  const wts = [wWood, wStone, wWater, wFood];
  const jobs: WorkerJob[] = ["wood", "stone", "water", "food"];
  const sum = wts[0] + wts[1] + wts[2] + wts[3];
  if (sum === 0 || slots <= 0) {
    quotas.node = n;
  } else {
    let assigned = 0;
    const order = [0, 1, 2, 3].sort((a, b) => wts[b] - wts[a]);
    for (const i of order) {
      const c = Math.floor((slots * wts[i]) / sum);
      quotas[jobs[i]] = c;
      assigned += c;
    }
    let k = 0;
    while (assigned < slots && k < 8) {
      quotas[jobs[order[k % 4]]]++;
      assigned++;
      k++;
    }
  }

  const icons: Record<WorkerJob, string> = {
    node: "⛏️ mỏ",
    wood: "🪵",
    stone: "🪨",
    water: "💧",
    food: "🌾",
  };
  const parts: string[] = [];
  for (const j of ["node", "wood", "stone", "water", "food"] as WorkerJob[]) {
    if (quotas[j] > 0) parts.push(`${quotas[j]} ${icons[j]}`);
  }
  let summary = `${parts.join(" · ") || "nghỉ"}${reasons.length > 0 ? " — " + reasons.join(", ") : ""}`;

  // Xin thêm worker khi thiếu tay: đội hình cần = giữ mỏ + mỗi việc
  // đang cần ≥1 tay (+1 tay nữa cho việc gấp). Tối đa 2 cháu/30s.
  const wts2 = [wWood, wStone, wWater, wFood];
  let crew = quotas.node;
  for (const w of wts2) {
    if (w > 0) crew += 1;
    if (w >= 2) crew += 1;
  }
  const deficit = crew - n;
  if (deficit > 0) {
    const want = Math.min(deficit, 2);
    const def = UNIT_DEFS.worker;
    world.recomputeSupply();
    const okGold = pl.ore >= def.cost;
    const okPop = pl.supplyUsed + def.supply <= pl.supplyCap;
    if (okGold && okPop) {
      for (let i = 0; i < want; i++) {
        dispatch({ type: "spawnUnit", player, unitDefId: "worker" });
      }
      summary += ` · +xin ${want} 👷`;
    } else {
      summary += ` · thiếu ${deficit} 👷 (${!okGold ? "hết vàng" : "đầy pop"})`;
    }
  }
  save(quotas, summary);
}

/**
 * Chào lính mới: worker vừa sinh nhận việc theo YÊU CẦU MỚI NHẤT của agent
 * (chỉ tiêu còn tươi — việc nào đang thiếu tay nhất thì vào việc đó).
 * Chưa có lệnh nào (đầu game...) thì theo bản năng cấu hình sẵn.
 * Gọi từ World.spawnUnit nên mọi đường sinh lính đều đi qua.
 */
export function greetNewborn(world: World, u: Entity): void {
  if (u.kind !== "unit" || u.defId !== "worker") return;
  const plan = getPlan(world, u.player);
  if (!plan) {
    issueOrder(world, u, { kind: "takeJob", job: WORKER_INSTINCT.job });
    return;
  }
  const count: Record<WorkerJob, number> = {
    node: 0,
    wood: 0,
    stone: 0,
    water: 0,
    food: 0,
  };
  for (const w of world.unitsOf(u.player)) {
    if (w.defId === "worker") count[w.job]++;
  }
  let want: WorkerJob | null = null;
  let bestGap = 0;
  for (const j of ["node", "wood", "stone", "water", "food"] as WorkerJob[]) {
    const gap = (plan.quotas[j] ?? 0) - count[j];
    if (gap > bestGap) {
      bestGap = gap;
      want = j;
    }
  }
  issueOrder(world, u, { kind: "takeJob", job: want ?? u.job });
}
