/**
 * Interaction — AUTO-BATTLER edition.
 * Người chơi KHÔNG điều khiển lính. Chỉ còn:
 *  camera (pan/zoom), xem quân (click chọn để đọc info),
 *  đặt rally (quân mới đi qua đó), box-select để ngắm đội hình.
 */
import { TILE, UNIT_DEFS } from "./data";
import { Game, HUMAN } from "./Game";
import { Entity, EntityId, Vec2 } from "./types";

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

/** Khóa zoom: không cho zoom xa quá 0.8 (giữ sprite luôn nét + nhẹ máy). */
export const ZOOM_MIN = 0.8;
export const ZOOM_MAX = 2.2;

export class Interaction {
  camera: Camera = { x: 0, y: 0, zoom: 1 };
  selection = new Set<EntityId>();
  dragStart: Vec2 | null = null;
  dragNow: Vec2 | null = null;
  keys = new Set<string>();
  edgePanEnabled = true;
  /** hệ số tốc độ camera (menu Cài đặt: 1..10 → 0.4..1.6) */
  panSpeed = 1;
  /** bật/tắt chế độ đặt rally bằng click */
  rallyMode = false;

  screenToWorld(sx: number, sy: number, viewW: number, viewH: number): Vec2 {
    const { x, y, zoom } = this.camera;
    return { x: x + (sx - viewW / 2) / zoom, y: y + (sy - viewH / 2) / zoom };
  }

  focus(x: number, y: number) {
    this.camera.x = x;
    this.camera.y = y;
  }

  clampCamera(mapWPx: number, mapHPx: number) {
    const c = this.camera;
    c.x = Math.max(0, Math.min(mapWPx, c.x));
    c.y = Math.max(0, Math.min(mapHPx, c.y));
    c.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, c.zoom));
  }

  panTick(game: Game, dt: number, mouse: Vec2 | null, viewW: number, viewH: number) {
    const speed = 700 * this.panSpeed * dt / this.camera.zoom;
    let dx = 0;
    let dy = 0;
    const k = this.keys;
    if (k.has("arrowleft")) dx -= 1;
    if (k.has("arrowright")) dx += 1;
    if (k.has("arrowup")) dy -= 1;
    if (k.has("arrowdown")) dy += 1;
    if (this.edgePanEnabled && mouse) {
      const m = 24;
      if (mouse.x < m) dx -= 1;
      if (mouse.x > viewW - m) dx += 1;
      if (mouse.y < m) dy -= 1;
      if (mouse.y > viewH - m) dy += 1;
    }
    if (dx !== 0 || dy !== 0) {
      this.camera.x += dx * speed;
      this.camera.y += dy * speed;
      this.clampCamera(game.world.map.w * TILE, game.world.map.h * TILE);
    }
  }

  selectedEntities(game: Game): Entity[] {
    const out: Entity[] = [];
    for (const id of this.selection) {
      const e = game.world.get(id);
      if (e) out.push(e);
    }
    return out;
  }

  pickAt(game: Game, wx: number, wy: number): Entity | null {
    let best: Entity | null = null;
    let bestScore = Infinity;
    for (const e of game.world.entities.values()) {
      let r: number;
      if (e.kind === "unit") r = (UNIT_DEFS[e.defId]?.radius ?? 9) + 4;
      else if (e.kind === "building") r = Math.max(e.tw, e.th) * TILE * 0.62;
      else continue;
      const d = Math.hypot(e.x - wx, e.y - wy);
      if (d <= r) {
        const score = d + (e.kind === "building" ? 1000 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = e;
        }
      }
    }
    return best;
  }

  leftDown(_game: Game, _wx: number, _wy: number, sx: number, sy: number, _add: boolean) {
    this.dragStart = { x: sx, y: sy };
    this.dragNow = { x: sx, y: sy };
    this._moved = false;
  }

  private _moved = false;

  leftMove(sx: number, sy: number) {
    if (!this.dragStart) return;
    this.dragNow = { x: sx, y: sy };
    if (Math.hypot(sx - this.dragStart.x, sy - this.dragStart.y) > 6) this._moved = true;
  }

  leftUp(game: Game, wx: number, wy: number, viewW: number, viewH: number) {
    // Đặt rally: click đâu quân mới đi qua đó.
    if (this.rallyMode) {
      game.dispatch({ type: "setRally", player: HUMAN, x: wx, y: wy });
      this.rallyMode = false;
      this.dragStart = null;
      this.dragNow = null;
      return;
    }
    if (this.dragStart && this.dragNow && this._moved) {
      const a = this.screenToWorld(this.dragStart.x, this.dragStart.y, viewW, viewH);
      const b = this.screenToWorld(this.dragNow.x, this.dragNow.y, viewW, viewH);
      const found = game.world.queryRect(a.x, a.y, b.x, b.y).map((e) => e.id);
      this.selection = new Set(found);
      this.dragStart = null;
      this.dragNow = null;
      return;
    }
    const hit = this.pickAt(game, wx, wy);
    if (hit) this.selection = new Set([hit.id]);
    else this.selection.clear();
    this.dragStart = null;
    this.dragNow = null;
  }

  /** Right-click = đặt rally nhanh (không cần bật mode). */
  rightDown(game: Game, wx: number, wy: number) {
    game.dispatch({ type: "setRally", player: HUMAN, x: wx, y: wy });
  }

  cancelAll() {
    this.rallyMode = false;
    this.dragStart = null;
    this.dragNow = null;
  }

  pruneSelection(game: Game) {
    for (const id of this.selection) {
      if (!game.world.get(id)) this.selection.delete(id);
    }
  }
}
