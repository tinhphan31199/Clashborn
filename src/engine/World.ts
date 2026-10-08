/**
 * World — AUTO-BATTLER edition.
 *
 * - Map đối xứng gương: 2 base hai đầu, 5 node ở giữa.
 * - Không còn ore tile — Gold đến từ node bị chiếm + thu nhập nền của base.
 * - supplyCap = 6 base + 7 mỗi nhà đã xong (max 20). Không nhà khỏi đẻ quân.
 */
import { TileMap, makeRng } from "./TileMap";
import { BASE_POP, BUILDING_DEFS, HOUSE_POP, TILE, UNIT_DEFS, isMonsterDef } from "./data";
import { greetNewborn } from "./systems/overseer";
import { Effect, Entity, EntityId, EntityKind, PlayerId, PlayerState, Projectile, Vec2 } from "./types";

export const MAP_W = 192;
export const MAP_H = 192;

/** Vùng dungeon (góc trên-phải + đối xứng góc dưới-trái). */
export interface DungeonZone {
  /** ô trái-trên + kích thước (tile) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** tile trung tâm */
  cx: number;
  cy: number;
}

/** 2 dungeon đối xứng gương qua tâm (pure theo kích thước map). */
export function dungeonZones(): DungeonZone[] {
  const W = MAP_W;
  const H = MAP_H;
  const a: DungeonZone = { x: 142, y: 14, w: 37, h: 37, cx: 160, cy: 32 };
  const b: DungeonZone = {
    x: W - 1 - (a.x + a.w - 1),
    y: H - 1 - (a.y + a.h - 1),
    w: a.w,
    h: a.h,
    cx: W - 1 - a.cx,
    cy: H - 1 - a.cy,
  };
  return [a, b];
}

const GRID_CELL = 128; // world px

export class World {
  map: TileMap;
  entities = new Map<EntityId, Entity>();
  effects: Effect[] = [];
  projectiles: Projectile[] = [];
  players: PlayerState[] = [];
  time = 0;

  /** fog[playerIdx][tile] = 0 unseen | 1 explored | 2 visible */
  fog: Uint8Array[] = [];

  seed: number;
  private rngState: number;
  private nextId: EntityId = 1;
  private nextProjId = 1;

  private grid = new Map<number, Entity[]>();

  constructor(seed = 1337) {
    this.seed = seed >>> 0;
    this.rngState = this.seed || 1;
    const rand = makeRng(this.seed);
    this.map = new TileMap(MAP_W, MAP_H);
    this.generateTerrain(rand);
  }

  /** Deterministic float in [0,1). Advances rngState (serializable). */
  rand(): number {
    let a = (this.rngState |= 0);
    a = (a + 0x6d2b79f5) | 0;
    this.rngState = a;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // ------------------------------------------------------------------ setup

  addPlayer(id: PlayerId, name: string, color: string, ore: number) {
    this.players.push({
      id, name, color, ore, alive: true,
      supplyUsed: 0, supplyCap: BASE_POP, income: 0,
      rallyX: (MAP_W * TILE) / 2, rallyY: (MAP_H * TILE) / 2,
      ecoMil: 0.5, defAtk: 0.5, focus: "auto", autoSpend: false,
      water: 25, waterIncome: 0,
      wood: 60, stone: 20, // 60 gỗ = đủ xây ngay nhà đầu tiên
      food: 60,
      needs: { gold: 1, wood: 1, stone: 1, water: 1, food: 1 },
    });
    this.fog[id] = new Uint8Array(MAP_W * MAP_H);
  }

  player(id: PlayerId): PlayerState {
    const p = this.players.find((p) => p.id === id);
    if (!p) throw new Error(`unknown player ${id}`);
    return p;
  }

  /**
   * Map 96×96 đối xứng gương 180°: viền nước, hồ lấy nước rải đều,
   * rừng gỗ quanh base + giữa map, đá ít hơn ở ven. Giữa trống để đánh nhau.
   */
  private generateTerrain(rand: () => number) {
    const { map } = this;
    const W = map.w;
    const H = map.h;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const border = x < 2 || y < 2 || x >= W - 2 || y >= H - 2;
        map.tiles[map.idx(x, y)] = border ? 1 : 0;
      }
    }
    const mirror = (cx: number, cy: number): [number, number] => [W - 1 - cx, H - 1 - cy];
    const blobLake = (cx: number, cy: number, r: number) => {
      for (const [px, py] of [[cx, cy], mirror(cx, cy)]) {
        for (let y = Math.floor(py - r); y <= py + r; y++) {
          for (let x = Math.floor(px - r); x <= px + r; x++) {
            if (!map.inBounds(x, y)) continue;
            if (Math.hypot(x - px, y - py) <= r + (rand() - 0.5)) {
              map.tiles[map.idx(x, y)] = 1;
            }
          }
        }
      }
    };
    // Hồ nước: 2 cặp ven + 2 hồ trung gian (lấy nước khắp map).
    blobLake(40, 60, 8);
    blobLake(60, 132, 10);
    blobLake(80, 80, 6);
    // Rừng: quanh base mỗi bên + vành đai giữa (ưu tiên gỗ dễ lấy).
    const woods: [number, number, number][] = [
      [32, 28, 12], [52, 20, 10], [20, 52, 10],
      [76, 60, 12], [60, 88, 10], [104, 68, 10],
    ];
    for (const [cx, cy, r] of woods) {
      map.scatterWood(rand, cx, cy, r, 120);
      const [mx, my] = mirror(cx, cy);
      map.scatterWood(rand, mx, my, r, 120);
    }
    // Đá: ít, ven map + 1 cụm giữa (tranh chấp muộn).
    const rocks: [number, number, number][] = [
      [24, 96, 8], [96, 40, 8], [88, 104, 8],
      [56, 32, 6], // đá gần base (farm cần 25 đá — cuốc gần cho kịp)
    ];
    for (const [cx, cy, r] of rocks) {
      map.scatterStone(rand, cx, cy, r, 100);
      const [mx, my] = mirror(cx, cy);
      map.scatterStone(rand, mx, my, r, 100);
    }
    // Ruộng lúa: gần base mỗi bên (dễ nuôi quân đầu game) + 1 cặp giữa map.
    const fields: [number, number, number][] = [
      [40, 28, 10], [28, 60, 8], [72, 68, 8],
    ];
    for (const [cx, cy, r] of fields) {
      map.scatterField(rand, cx, cy, r, 100);
      const [mx, my] = mirror(cx, cy);
      map.scatterField(rand, mx, my, r, 100);
    }
    // Cây táo: cụm nhỏ gần base (ăn ngay) + 1 cặp giữa map (tranh chấp).
    const apples: [number, number, number][] = [
      [52, 44, 4], [36, 80, 4], [92, 72, 4],
    ];
    for (const [cx, cy, r] of apples) {
      map.scatterApple(rand, cx, cy, r);
      const [mx, my] = mirror(cx, cy);
      map.scatterApple(rand, mx, my, r);
    }
    // Dungeon 2 bên: dọn lòng + tường đá (chừa 2 cửa), quái spawn lúc chơi.
    this.carveDungeons();
    // Đảm bảo thông đường: base xanh tới được base đỏ + 5 node + tâm.
    // Thiếu là phạt: lính không bao giờ kẹt bên kia tường cây/đá.
    this.ensureConnected();
  }

  /** Khoét 2 dungeon: lòng cỏ trống + tường đá (chừa cửa nam + cửa tây/đông). */
  private carveDungeons() {
    const { map } = this;
    for (const z of dungeonZones()) {
      // Dọn lòng.
      for (let y = z.y; y < z.y + z.h; y++) {
        for (let x = z.x; x < z.x + z.w; x++) {
          if (!map.inBounds(x, y)) continue;
          const i = map.idx(x, y);
          map.tiles[i] = 0;
          map.wood[i] = 0;
          map.stone[i] = 0;
          map.rice[i] = 0;
          map.woodMax[i] = 0;
          map.stumpTimer[i] = 0;
          map.apples[i] = 0;
        }
      }
      // Tường đá bao quanh (không tài nguyên → không cuốc được).
      const midX = z.x + Math.floor(z.w / 2);
      const midY = z.y + Math.floor(z.h / 2);
      const gap = (t: number, a: number, b: number) => t >= a && t <= b;
      for (let x = z.x; x < z.x + z.w; x++) {
        for (const y of [z.y, z.y + z.h - 1]) {
          const isSouth = y === z.y + z.h - 1;
          // Cửa quay về tâm map: TR mở cạnh nam, BL mở cạnh bắc.
          const doorSide = isSouth === (z.cy < map.h / 2);
          if (doorSide && gap(x, midX - 2, midX + 1)) continue;
          this.dungeonWall(x, y);
        }
      }
      for (let y = z.y; y < z.y + z.h; y++) {
        for (const x of [z.x, z.x + z.w - 1]) {
          const isWest = x === z.x;
          // Cửa hông: TR mở phía tây, BL mở phía đông (đều hướng tâm map).
          const westZone = z.cx > map.w / 2;
          if ((isWest === westZone) && gap(y, midY - 2, midY + 1)) continue;
          this.dungeonWall(x, y);
        }
      }
    }
  }

  private dungeonWall(x: number, y: number) {
    const { map } = this;
    if (!map.inBounds(x, y)) return;
    const i = map.idx(x, y);
    map.tiles[i] = 4; // T_STONE
    map.wood[i] = 0;
    map.stone[i] = 0;
    map.rice[i] = 0;
  }

  /** BFS + ủi đường (rộng 2 ô) từ base xanh tới mọi điểm chốt. */
  private ensureConnected() {
    const { map } = this;
    const W = map.w;
    const H = map.h;
    const start: [number, number] = [24, 20];
    // Điểm chốt: tâm, base đỏ, 5 node (tâm ô) + cửa dungeon 2 bên.
    const dz = dungeonZones();
    const keys: [number, number][] = [
      [96, 96], [168, 172],
      [42, 42], [W - 42, H - 42], [70, 86], [W - 70, H - 86], [96, 96],
      [dz[0].cx, dz[0].y + dz[0].h + 1], [dz[1].cx, dz[1].y - 1],
    ];
    const bfs = (): boolean[] => {
      const seen = new Uint8Array(W * H);
      const q: [number, number][] = [start];
      seen[start[1] * W + start[0]] = 1;
      while (q.length > 0) {
        const [x, y] = q.pop()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx]) continue;
          if (!map.passable(nx, ny)) continue;
          seen[ny * W + nx] = 1;
          q.push([nx, ny]);
        }
      }
      return keys.map(([kx, ky]) => seen[ky * W + kx] === 1);
    };
    const carve = (x0: number, y0: number, x1: number, y1: number) => {
      // Đường chữ L rộng 2 ô: ngang rồi dọc.
      const dig = (x: number, y: number) => {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (!map.inBounds(nx, ny)) continue;
            const i = map.idx(nx, ny);
            map.tiles[i] = 0;
            map.wood[i] = 0;
            map.stone[i] = 0;
            map.rice[i] = 0;
            map.woodMax[i] = 0;
            map.stumpTimer[i] = 0;
            map.apples[i] = 0;
          }
        }
      };
      // Đường chữ L rộng 2 ô: ngang rồi dọc.
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) dig(x, y0);
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) dig(x1, y);
    };
    for (let round = 0; round < 8; round++) {
      const ok = bfs();
      if (ok.every(Boolean)) return;
      for (let i = 0; i < keys.length; i++) {
        if (!ok[i]) carve(start[0], start[1], keys[i][0], keys[i][1]);
      }
    }
  }

  // -------------------------------------------------------------- entities

  private baseEntity(kind: EntityKind, defId: string, player: PlayerId, x: number, y: number): Entity {
    const def = kind === "unit" ? UNIT_DEFS[defId] : BUILDING_DEFS[defId];
    const e: Entity = {
      id: this.nextId++,
      kind,
      defId,
      player,
      x,
      y,
      hp: def.hp,
      maxHp: def.hp,
      state: "idle",
      stance: "aggressive",
      job: "node",
      orderQueue: [],
      path: [],
      resumePath: [],
      repathTimer: 0,
      targetId: null,
      targetX: 0,
      targetY: 0,
      attackCooldown: 0,
      carry: 0,
      carryType: "gold",
      gatherTimer: 0,
      facing: 0,
      patrolAx: 0,
      patrolAy: 0,
      patrolBx: 0,
      patrolBy: 0,
      patrolToB: true,
      kills: 0,
      vetLevel: 0,
      tx: 0,
      ty: 0,
      tw: 0,
      th: 0,
      queue: [],
      progress: 0,
      rallyX: x,
      rallyY: y,
      underConstruction: false,
      buildProgress: 1,
      amount: 0,
    };
    return e;
  }

  spawnUnit(defId: string, player: PlayerId, x: number, y: number): Entity {
    const e = this.baseEntity("unit", defId, player, x, y);
    this.entities.set(e.id, e);
    // Worker mới sinh: nhận việc theo lệnh mới nhất của agent,
    // chưa có lệnh thì theo bản năng cấu hình sẵn (WORKER_INSTINCT).
    if (e.defId === "worker") greetNewborn(this, e);
    return e;
  }

  /** Đặt base/node. Luôn instant (không xây dựng trong auto-battler). */
  spawnBuilding(defId: string, player: PlayerId, tx: number, ty: number): Entity | null {
    const def = BUILDING_DEFS[defId];
    if (!this.map.isRectFree(tx, ty, def.w, def.h)) return null;
    const e = this.baseEntity("building", defId, player, 0, 0);
    e.tx = tx;
    e.ty = ty;
    e.tw = def.w;
    e.th = def.h;
    e.x = (tx + def.w / 2) * TILE;
    e.y = (ty + def.h / 2) * TILE;
    e.underConstruction = false;
    e.buildProgress = 1;
    e.hp = e.maxHp;
    this.map.setBlockedRect(tx, ty, def.w, def.h, 1);
    // Nhà mới không được đè lên lính: ai đứng trong chân móng thì dạt ra ô thoáng.
    this.rescueTrappedUnits();
    this.entities.set(e.id, e);
    return e;
  }

  spawnProjectile(p: Omit<Projectile, "id">): Projectile {
    const full: Projectile = { ...p, id: this.nextProjId++ };
    this.projectiles.push(full);
    return full;
  }

  removeEntity(id: EntityId) {
    const e = this.entities.get(id);
    if (!e) return;
    if (e.kind === "building") {
      this.map.setBlockedRect(e.tx, e.ty, e.tw, e.th, 0);
    }
    this.entities.delete(id);
    for (const o of this.entities.values()) {
      if (o.targetId === id) {
        o.targetId = null;
        if (o.state === "attacking" || o.state === "repairing") o.state = "idle";
      }
      o.orderQueue = o.orderQueue.filter((q) => q.targetId !== id);
    }
    for (const pr of this.projectiles) {
      if (pr.targetId === id) {
        pr.targetId = null;
        pr.tx = e.x;
        pr.ty = e.y;
      }
    }
  }

  /** Pop next queued order into active state. Returns false when queue empty. */
  popQueuedOrder(u: Entity): boolean {
    const q = u.orderQueue.shift();
    if (!q) {
      u.state = "idle";
      u.path = [];
      u.targetId = null;
      return false;
    }
    u.state = "idle";
    u.path = [];
    u.targetId = q.targetId ?? null;
    u.targetX = q.tx ?? 0;
    u.targetY = q.ty ?? 0;
    (u as unknown as { _nextOrder?: typeof q })._nextOrder = q;
    return true;
  }

  get(id: EntityId | null | undefined): Entity | undefined {
    if (id == null) return undefined;
    return this.entities.get(id);
  }

  /**
   * Cứu lính kẹt trong vật cản (nhà mới xây đè lên, cây mọc đè lên...):
   * dịch ra tâm ô đi được gần nhất. Trả về số lính đã cứu.
   * Game gọi định kỳ làm lưới an toàn cuối cùng.
   */
  rescueTrappedUnits(): number {
    let saved = 0;
    for (const e of this.entities.values()) {
      if (e.kind !== "unit") continue;
      const tx = this.map.worldToTile(e.x);
      const ty = this.map.worldToTile(e.y);
      if (this.map.passable(tx, ty)) continue;
      const free = this.map.nearestPassable(tx, ty, 12);
      if (!free) continue;
      e.x = this.map.tileToWorldCenter(free.tx);
      e.y = this.map.tileToWorldCenter(free.ty);
      saved++;
    }
    return saved;
  }

  /** Recompute supplyUsed; cap = 6 base + 7 mỗi nhà đã xong (max 20). */
  recomputeSupply() {
    for (const p of this.players) {
      p.supplyUsed = 0;
      p.supplyCap = BASE_POP;
    }
    const byId = new Map(this.players.map((p) => [p.id, p]));
    for (const e of this.entities.values()) {
      if (e.kind === "building") {
        if (e.defId === "house" && !e.underConstruction) {
          const p = byId.get(e.player);
          if (p) p.supplyCap += HOUSE_POP;
        }
        continue;
      }
      const p = byId.get(e.player);
      if (!p) continue;
      p.supplyUsed += UNIT_DEFS[e.defId]?.supply ?? 1;
    }
  }

  // ---------------------------------------------------------- spatial hash

  private gridKey(cx: number, cy: number): number {
    return cy * 4096 + cx;
  }

  /** Rebuild the uniform grid. Call once per tick before systems run. */
  rebuildSpatial() {
    this.grid.clear();
    for (const e of this.entities.values()) {
      const cx = Math.floor(e.x / GRID_CELL);
      const cy = Math.floor(e.y / GRID_CELL);
      const k = this.gridKey(cx, cy);
      let arr = this.grid.get(k);
      if (!arr) {
        arr = [];
        this.grid.set(k, arr);
      }
      arr.push(e);
    }
  }

  private forEachNear(x: number, y: number, radius: number, fn: (e: Entity) => void) {
    const x0 = Math.floor((x - radius) / GRID_CELL);
    const x1 = Math.floor((x + radius) / GRID_CELL);
    const y0 = Math.floor((y - radius) / GRID_CELL);
    const y1 = Math.floor((y + radius) / GRID_CELL);
    if (this.grid.size === 0) {
      for (const e of this.entities.values()) fn(e);
      return;
    }
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const arr = this.grid.get(this.gridKey(cx, cy));
        if (!arr) continue;
        for (const e of arr) fn(e);
      }
    }
  }

  // ---------------------------------------------------------------- queries

  queryRadius(
    x: number, y: number, radius: number,
    filter?: { kind?: EntityKind; player?: PlayerId; excludeId?: EntityId }
  ): Entity[] {
    const out: Entity[] = [];
    const r2 = radius * radius;
    this.forEachNear(x, y, radius, (e) => {
      if (filter?.kind && e.kind !== filter.kind) return;
      if (filter?.player !== undefined && e.player !== filter.player) return;
      if (filter?.excludeId !== undefined && e.id === filter.excludeId) return;
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy <= r2) out.push(e);
    });
    return out;
  }

  queryRect(x1: number, y1: number, x2: number, y2: number, player?: PlayerId): Entity[] {
    const out: Entity[] = [];
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    for (const e of this.entities.values()) {
      if (player !== undefined && e.player !== player) continue;
      if (e.x >= minX && e.x <= maxX && e.y >= minY && e.y <= maxY) out.push(e);
    }
    return out;
  }

  unitsOf(player: PlayerId): Entity[] {
    const out: Entity[] = [];
    for (const e of this.entities.values()) {
      if (e.kind === "unit" && e.player === player) out.push(e);
    }
    return out;
  }

  buildingsOf(player: PlayerId): Entity[] {
    const out: Entity[] = [];
    for (const e of this.entities.values()) {
      if (e.kind === "building" && e.player === player) out.push(e);
    }
    return out;
  }

  nodes(): Entity[] {
    const out: Entity[] = [];
    for (const e of this.entities.values()) {
      if (e.kind === "building" && e.defId.startsWith("node_")) out.push(e);
    }
    return out;
  }

  baseOf(player: PlayerId): Entity | undefined {
    for (const e of this.entities.values()) {
      if (e.kind === "building" && e.defId === "base" && e.player === player) return e;
    }
    return undefined;
  }

  /** Ưu tiên mục tiêu theo loại lính (chiều sâu chiến thuật mà không cần micro). */
  pickTargetFor(attacker: Entity, candidates: Entity[]): Entity | null {
    if (candidates.length === 0) return null;
    const rank = (t: Entity): number => {
      const isWorker = t.kind === "unit" && t.defId === "worker";
      const isArcher = t.kind === "unit" && t.defId === "archer";
      const isSoldier = t.kind === "unit" && t.defId === "soldier";
      const isTank = t.kind === "unit" && t.defId === "tank";
      const isBase = t.kind === "building" && t.defId === "base";
      const isMonster = t.kind === "unit" && isMonsterDef(t.defId);
      switch (attacker.defId) {
        case "soldier":
          // Soldier săn kinh tế: Worker > Archer > Soldier > Tank > Quái/Base > Node
          if (isWorker) return 0;
          if (isArcher) return 1;
          if (isSoldier) return 2;
          if (isTank) return 3;
          if (isMonster || isBase) return 4;
          return 5;
        case "archer":
          // Archer bắn từ sau: Tank > Soldier > Worker > Quái/Base
          if (isTank) return 0;
          if (isSoldier) return 1;
          if (isArcher) return 2;
          if (isWorker) return 3;
          if (isMonster || isBase) return 4;
          return 5;
        case "tank":
          // Tank càn gần nhất, khoét nhà tốt
          if (isBase) return 3;
          return 4;
        default:
          return 5;
      }
    };
    let best: Entity | null = null;
    let bestScore = Infinity;
    for (const t of candidates) {
      const d = Math.hypot(t.x - attacker.x, t.y - attacker.y);
      const score = rank(t) * 10000 + d;
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  nearestEnemy(x: number, y: number, player: PlayerId, rangePx: number): Entity | null {
    let best: Entity | null = null;
    let bestD = rangePx * rangePx;
    this.forEachNear(x, y, rangePx, (e) => {
      if (e.player === player || e.player < 0) return;
      if (e.kind !== "unit" && e.kind !== "building") return;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    });
    return best;
  }

  /** Enemy trong tầm, đã xếp hạng ưu tiên theo loại lính. */
  priorityEnemy(attacker: Entity, rangePx: number): Entity | null {
    const cands = this.queryRadius(attacker.x, attacker.y, rangePx).filter(
      (e) => e.player !== attacker.player && e.player >= 0 && (e.kind === "unit" || e.kind === "building")
    );
    return this.pickTargetFor(attacker, cands);
  }

  /** A free world position near (x,y) for spawning. */
  findSpawnNear(x: number, y: number): Vec2 {
    for (let r = 1; r < 8; r++) {
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        const px = x + Math.cos(ang) * r * TILE;
        const py = y + Math.sin(ang) * r * TILE;
        const tx = this.map.worldToTile(px);
        const ty = this.map.worldToTile(py);
        if (this.map.passable(tx, ty)) return { x: px, y: py };
      }
    }
    return { x, y };
  }

  addEffect(fx: Effect) {
    this.effects.push(fx);
  }

  // ------------------------------------------------------------ save / load

  serialize(): string {
    return JSON.stringify({
      v: 2,
      seed: this.seed,
      rngState: this.rngState,
      nextId: this.nextId,
      nextProjId: this.nextProjId,
      time: this.time,
      players: this.players,
      fog: this.fog.map((f) => Array.from(f)),
      entities: [...this.entities.values()],
      projectiles: this.projectiles,
      effects: this.effects,
      map: {
        w: this.map.w,
        h: this.map.h,
        tiles: Array.from(this.map.tiles),
        ore: Array.from(this.map.ore),
        wood: Array.from(this.map.wood),
        stone: Array.from(this.map.stone),
        rice: Array.from(this.map.rice),
        woodMax: Array.from(this.map.woodMax),
        stumpTimer: Array.from(this.map.stumpTimer),
        apples: Array.from(this.map.apples),
        blocked: Array.from(this.map.blocked),
      },
    });
  }

  static deserialize(json: string): World {
    const d = JSON.parse(json);
    const w = new World(d.seed ?? 1337);
    w.rngState = d.rngState ?? 1;
    w.nextId = d.nextId ?? 1;
    w.nextProjId = d.nextProjId ?? 1;
    w.time = d.time ?? 0;
    w.players = d.players ?? [];
    w.fog = (d.fog ?? []).map((a: number[]) => Uint8Array.from(a));
    w.entities = new Map((d.entities ?? []).map((e: Entity) => [e.id, e]));
    w.projectiles = d.projectiles ?? [];
    w.effects = d.effects ?? [];
    if (d.map) {
      w.map.tiles.set(d.map.tiles);
      w.map.ore.set(d.map.ore);
      if (d.map.wood) w.map.wood.set(d.map.wood);
      if (d.map.stone) w.map.stone.set(d.map.stone);
      if (d.map.rice) w.map.rice.set(d.map.rice);
      if (d.map.woodMax) w.map.woodMax.set(d.map.woodMax);
      if (d.map.stumpTimer) w.map.stumpTimer.set(d.map.stumpTimer);
      if (d.map.apples) w.map.apples.set(d.map.apples);
      w.map.blocked.set(d.map.blocked);
    }
    w.rebuildSpatial();
    return w;
  }
}
