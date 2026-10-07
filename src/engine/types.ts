/**
 * Core shared types for the RTS engine.
 * The engine is pure TypeScript — no React/DOM imports here.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export type EntityId = number;

/** 0 = human, 1 = AI, ... -1 = neutral (resources, critters) */
export type PlayerId = number;

export const NEUTRAL: PlayerId = -1;

/** High-level order a unit is currently executing. */
export type UnitState =
  | "idle"
  | "moving" // plain move order
  | "attackMoving" // move, engaging enemies along the way
  | "attacking" // engaging a specific target
  | "patrolling" // ping-pong between two points, engaging en route
  | "gathering" // harvesting at a resource tile
  | "returning" // carrying resources back to a drop-off
  | "repairing" // repairing a friendly building
  | "seekingResource"; // moving toward a resource tile

/** Aggressiveness: aggressive = chase + auto-acquire; hold = fight in place only. */
export type Stance = "aggressive" | "hold";

/** One queued order (shift-click). Executed FIFO when current order completes. */
export interface QueuedOrder {
  kind: "move" | "attackMove" | "attack" | "gather" | "patrol" | "repair";
  x?: number;
  y?: number;
  targetId?: EntityId;
  tx?: number;
  ty?: number;
}

export type EntityKind = "unit" | "building" | "resource";

/**
 * Single game entity. Data-oriented: plain fields, no methods.
 * Systems in `systems/` read and mutate these each tick.
 */
export interface Entity {
  id: EntityId;
  kind: EntityKind;
  defId: string; // key into UNIT_DEFS / BUILDING_DEFS
  player: PlayerId;

  // World position in pixels (center of entity)
  x: number;
  y: number;

  hp: number;
  maxHp: number;

  // --- unit fields ---
  state: UnitState;
  stance: Stance;
  /** việc hiện tại của worker (lính đánh nhau để trống) */
  job: WorkerJob;
  orderQueue: QueuedOrder[];
  path: Vec2[]; // remaining waypoints (world px)
  resumePath: Vec2[]; // saved attack-move path to resume after engagement
  repathTimer: number;
  targetId: EntityId | null; // attack / gather target
  targetX: number; // gather target tile coords (for resources)
  targetY: number;
  attackCooldown: number; // seconds remaining
  carry: number; // resources currently carried
  carryType: string; // resource type, e.g. "ore"
  gatherTimer: number;
  facing: number; // radians, for rendering
  // patrol endpoints (world px)
  patrolAx: number;
  patrolAy: number;
  patrolBx: number;
  patrolBy: number;
  patrolToB: boolean;
  // veterancy
  kills: number;
  vetLevel: number; // 0..2

  // --- building fields ---
  /** tile footprint */
  tx: number;
  ty: number;
  tw: number;
  th: number;
  queue: string[]; // unit defIds being trained
  progress: number; // 0..1 of current queue head
  rallyX: number; // rally point (world px)
  rallyY: number;
  underConstruction: boolean;
  buildProgress: number; // 0..1 while under construction

  // --- resource fields (ore fields) ---
  amount: number;
}

/** Transient visual effects (tracers, explosions). Not gameplay state. */
export interface Effect {
  kind: "tracer" | "explosion" | "spark";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  ttl: number; // seconds remaining
  maxTtl: number;
  color: string;
}

/** Trọng tâm tài nguyên mà worker/quân ưu tiên. */
export type MapFocus = "auto" | "near" | "mid" | "center";

/** Việc của worker: giữ mỏ vàng hay đi gánh gỗ/đá/nước. */
export type WorkerJob = "node" | "wood" | "stone" | "water" | "food";

/** Mức cần tài nguyên 0 = thôi, 1 = thường, 2 = cần gấp (worker dồn qua). */
export interface NeedWeights {
  gold: number;
  wood: number;
  stone: number;
  water: number;
  food: number;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  color: string;
  ore: number; // = Gold (giữ tên field cũ để khỏi sửa lan)
  alive: boolean;
  supplyUsed: number;
  supplyCap: number;
  /** thu nhập hiện tại (gold/s) để HUD hiển thị */
  income: number;
  /** điểm tập kết quân mới spawn (quyết định "khu vực xuất quân") */
  rallyX: number;
  rallyY: number;
  // ---- War Council: xu hướng chiến lược (người chơi chỉnh, lính nghe theo)
  /** 0 = full kinh tế … 1 = full quân sự (tỷ lệ chi tiêu khi auto-spend) */
  ecoMil: number;
  /** 0 = thủ nhà … 1 = tổng công kích */
  defAtk: number;
  focus: MapFocus;
  autoSpend: boolean;
  // ---- Nước (tài nguyên 2): node ra nước, quân uống nước mỗi giây
  water: number;
  waterIncome: number; // nước/s ròng (âm = đang hụt)
  // ---- Kho gỗ đá (worker gánh về)
  wood: number;
  stone: number;
  // ---- Kho lúa (worker gặt ruộng gánh về, lính ăn khi train)
  food: number;
  // ---- Nhu cầu tài nguyên: worker phân vai theo (0 thôi · 1 thường · 2 cần gấp)
  needs: NeedWeights;
}

/** In-flight shell / rocket. Simulated in combatTick, rendered as tracer dot. */
export interface Projectile {
  id: number;
  player: PlayerId;
  x: number;
  y: number;
  targetId: EntityId | null;
  tx: number; // fallback ground point (world px)
  ty: number;
  speed: number; // px per second
  damage: number;
  splash: number; // px radius, 0 = single target
  bonusVsBuilding: number; // extra multiplier vs buildings (e.g. 0.5 = +50%)
  attackerId: EntityId;
  color: string;
  ttl: number;
}

export type GamePhase = "playing" | "victory" | "defeat";
