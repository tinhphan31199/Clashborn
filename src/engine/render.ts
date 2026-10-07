/**
 * Renderer — AUTO-BATTLER edition (Canvas 2D, read-only).
 * Vẽ base 🏰, node 💎 (vòng chủ + income), lính bằng icon + vòng team.
 */
import { BUILDING_DEFS, TILE, UNIT_DEFS } from "./data";
import { T_GRASS, T_ORE, T_STONE, T_WATER, T_WOOD } from "./TileMap";
import { fieldArt } from "./assets";
import { Game, HUMAN } from "./Game";
import { Interaction } from "./input";
import { isExplored } from "./systems/fog";
import { Entity } from "./types";

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

const UNIT_ICON: Record<string, string> = {
  worker: "👷",
  soldier: "⚔️",
  archer: "🏹",
  tank: "🛡️",
};

export function renderGame(
  ctx: CanvasRenderingContext2D,
  game: Game,
  ui: Interaction,
  viewW: number,
  viewH: number
) {
  const world = game.world;
  const map = world.map;
  const cam = ui.camera;

  ctx.fillStyle = "#0b0f0c";
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.save();
  ctx.translate(viewW / 2, viewH / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  const x0 = Math.max(0, Math.floor((cam.x - viewW / 2 / cam.zoom) / TILE) - 1);
  const x1 = Math.min(map.w - 1, Math.ceil((cam.x + viewW / 2 / cam.zoom) / TILE) + 1);
  const y0 = Math.max(0, Math.floor((cam.y - viewH / 2 / cam.zoom) / TILE) - 1);
  const y1 = Math.min(map.h - 1, Math.ceil((cam.y + viewH / 2 / cam.zoom) / TILE) + 1);

  const fog = world.fog[HUMAN];
  // Pixel sắc, không làm mờ sprite.
  ctx.imageSmoothingEnabled = false;
  const art = fieldArt();

  // --- terrain (luôn vẽ sprite PixelLab, zoom xa đã bị khóa nên không lo nặng máy)
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const t = map.tiles[map.idx(tx, ty)];
      const px = tx * TILE;
      const py = ty * TILE;
      if (t === T_WATER) {
        if (art.water) {
          ctx.drawImage(art.water, px, py, TILE, TILE);
        } else {
          ctx.fillStyle = "#1d5e8a";
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = "rgba(255,255,255,0.10)";
          const wv = hash(tx, ty);
          ctx.fillRect(px + 4 + wv * 10, py + 8, 14, 2);
          ctx.fillRect(px + 8, py + 18 + wv * 6, 12, 2);
        }
      } else if (t === T_WOOD) {
        // nền cỏ lót dưới gốc cây cho đồng bộ với cả sân
        if (art.grass) {
          ctx.drawImage(art.grass, px, py, TILE, TILE);
        } else {
          ctx.fillStyle = "#2d5a27";
          ctx.fillRect(px, py, TILE, TILE);
        }
        if (art.tree) {
          // sprite 64px neo chân vào ô (tán tràn lên ô trên cho tự nhiên)
          ctx.drawImage(art.tree, px - 16, py - 32, 64, 64);
        } else {
          // tán cây theo trữ lượng còn lại
          const amt = map.wood[map.idx(tx, ty)];
          ctx.fillStyle = amt > 60 ? "#3fa34d" : "#2e7d32";
          const cxp = px + 6 + hash(tx * 3, ty) * 20;
          const cyp = py + 6 + hash(tx, ty * 7) * 20;
          ctx.beginPath();
          ctx.arc(cxp, cyp, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#5b3a1e";
          ctx.fillRect(cxp - 1, cyp + 4, 3, 6);
        }
      } else if (t === T_STONE) {
        ctx.fillStyle = "#4b4b4b";
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = "#8a8a8a";
        const ox = hash(tx * 5, ty * 2) * 12;
        const oy = hash(tx, ty * 3) * 12;
        ctx.beginPath();
        ctx.moveTo(px + 6 + ox, py + 22);
        ctx.lineTo(px + 12 + ox, py + 8 + oy);
        ctx.lineTo(px + 22 + ox * 0.5, py + 22);
        ctx.closePath();
        ctx.fill();
      } else {
        if (art.grass) {
          ctx.drawImage(art.grass, px, py, TILE, TILE);
        } else {
          const v = hash(tx, ty);
          ctx.fillStyle = v > 0.5 ? "#3d7a37" : "#37713a";
          ctx.fillRect(px, py, TILE, TILE);
        }
        if (t === T_ORE) {
          // vỉa quặng: cỏ lót dưới, cụm quặng nằm trên (nhỏ hơn ô)
          ctx.fillStyle = "#8a6d1c";
          const ox = px + 5 + hash(tx * 7, ty) * 8;
          const oy = py + 5 + hash(tx, ty * 5) * 8;
          ctx.fillRect(ox, oy, 22, 22);
          ctx.fillStyle = "#c9a227";
          ctx.fillRect(ox + 4, oy + 4, 8, 8);
          ctx.fillRect(ox + 13, oy + 11, 6, 6);
          ctx.fillStyle = "#ffe89a";
          ctx.fillRect(ox + 6, oy + 6, 3, 3);
        }
      }
    }
  }
  void T_GRASS;

  // --- sàn đấu trung tâm: ôm quanh mỏ +20/s (vẽ dưới lính, trên fog vẫn phủ mờ)
  if (art.arena) {
    for (const e of world.entities.values()) {
      if (e.kind === "building" && e.defId === "node_center") {
        const S = TILE * 6;
        ctx.drawImage(art.arena, e.x - S / 2, e.y - S / 2, S, S);
        break;
      }
    }
  }

  const visibleToHuman = (e: Entity) =>
    !fog || fog[map.idx(map.worldToTile(e.x), map.worldToTile(e.y))] === 2 || e.player === HUMAN;

  const ents = [...world.entities.values()]
    .filter(visibleToHuman)
    .sort((a, b) => a.y - b.y);

  for (const e of ents) {
    if (e.kind === "unit") drawUnit(ctx, game, e);
    else drawNodeOrBase(ctx, game, e);
  }

  // --- rally của người chơi
  const pl = world.players.find((p) => p.id === HUMAN);
  if (pl) {
    ctx.strokeStyle = "#ffffff";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    const base = world.baseOf(HUMAN);
    if (base) {
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(pl.rallyX, pl.rallyY);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = "#ffffff";
    ctx.font = "14px sans-serif";
    ctx.fillText("🚩", pl.rallyX - 7, pl.rallyY + 5);
  }

  // --- projectiles
  for (const pr of world.projectiles) {
    ctx.fillStyle = pr.color;
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- effects
  for (const fx of world.effects) {
    const a = fx.ttl / fx.maxTtl;
    if (fx.kind === "tracer") {
      ctx.strokeStyle = fx.color;
      ctx.globalAlpha = a;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fx.x1, fx.y1);
      ctx.lineTo(fx.x2, fx.y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (fx.kind === "explosion") {
      const r = (1 - a) * 46 + 6;
      ctx.globalAlpha = a;
      ctx.fillStyle = fx.color;
      ctx.beginPath();
      ctx.arc(fx.x1, fx.y1, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = a;
      ctx.fillStyle = fx.color;
      for (let s = 0; s < 5; s++) {
        const ang = (s / 5) * Math.PI * 2 + fx.ttl * 6;
        ctx.fillRect(fx.x1 + Math.cos(ang) * 10 * (1 - a), fx.y1 + Math.sin(ang) * 10 * (1 - a), 3, 3);
      }
      ctx.globalAlpha = 1;
    }
  }

  // --- selection + health
  for (const id of ui.selection) {
    const e = world.get(id);
    if (!e) continue;
    ctx.strokeStyle = "#22ff88";
    ctx.lineWidth = 1.5 / cam.zoom + 0.5;
    if (e.kind === "unit") {
      const r = (UNIT_DEFS[e.defId]?.radius ?? 9) + 5;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(e.tx * TILE - 3, e.ty * TILE - 3, e.tw * TILE + 6, e.th * TILE + 6);
    }
  }
  for (const e of ents) {
    if (e.hp < e.maxHp) drawHealthBar(ctx, e.x, e.y, e);
  }

  // --- fog
  if (fog) {
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const f = fog[ty * map.w + tx];
        if (f === 2) continue;
        ctx.fillStyle = f === 0 ? "rgba(0,0,0,0.88)" : "rgba(0,0,0,0.45)";
        ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      }
    }
  }

  ctx.restore();

  if (ui.dragStart && ui.dragNow) {
    const a = ui.dragStart;
    const b = ui.dragNow;
    ctx.strokeStyle = "#22ff88";
    ctx.fillStyle = "rgba(34,255,136,0.12)";
    ctx.lineWidth = 1;
    const rx = Math.min(a.x, b.x);
    const ry = Math.min(a.y, b.y);
    ctx.fillRect(rx, ry, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    ctx.strokeRect(rx, ry, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  }

  if (ui.rallyMode) {
    ctx.fillStyle = "#fff";
    ctx.font = "13px sans-serif";
    ctx.fillText("🚩 RALLY: click bản đồ để chọn khu vực xuất quân [right-click/Esc hủy]", 12, viewH - 12);
  }
}

function teamColor(game: Game, player: number): string {
  if (player === -1) return "#9ca3af";
  return game.world.players.find((p) => p.id === player)?.color ?? "#888";
}

function drawUnit(ctx: CanvasRenderingContext2D, game: Game, e: Entity) {
  const def = UNIT_DEFS[e.defId];
  const color = teamColor(game, e.player);
  const r = def?.radius ?? 9;
  // vòng team
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(e.x, e.y, r + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#141414";
  ctx.beginPath();
  ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
  ctx.fill();
  // icon
  ctx.font = `${Math.max(12, r)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(UNIT_ICON[e.defId] ?? "•", e.x, e.y + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  // worker đang gánh thì vẽ bao trên lưng
  const showCarry = e.kind === "unit" && e.defId === "worker" && e.carry > 0;
  if (showCarry) {
    ctx.fillStyle = e.carryType === "wood" ? "#4ade80" : e.carryType === "stone" ? "#a8a29e" : "#38bdf8";
    ctx.fillRect(e.x - 6, e.y - (UNIT_DEFS[e.defId]?.radius ?? 9) - 10, 12, 4);
  }
  if (e.vetLevel > 0) {
    ctx.fillStyle = e.vetLevel === 2 ? "#fff06a" : "#e8e8e8";
    ctx.font = "bold 10px sans-serif";
    ctx.fillText(e.vetLevel === 2 ? "★★" : "★", e.x - 8, e.y - r - 4);
  }
}

function drawNodeOrBase(ctx: CanvasRenderingContext2D, game: Game, e: Entity) {
  const color = teamColor(game, e.player);
  const px = e.tx * TILE;
  const py = e.ty * TILE;
  const wpx = e.tw * TILE;
  const hpx = e.th * TILE;
  const isBase = e.defId === "base";
  const art = fieldArt();

  if (art.grass) {
    // lót đúng từng ô cỏ 32px dưới chân công trình
    for (let oy = 0; oy < e.th; oy++) {
      for (let ox = 0; ox < e.tw; ox++) {
        ctx.drawImage(art.grass, px + ox * TILE, py + oy * TILE, TILE, TILE);
      }
    }
  } else {
    ctx.fillStyle = isBase ? "#3f3f46" : "#4a3f1c";
    ctx.fillRect(px, py, wpx, hpx);
    ctx.fillStyle = isBase ? "#52525b" : "#6b5a23";
    ctx.fillRect(px + 4, py + 4, wpx - 8, hpx - 8);
  }
  // vòng chủ
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(px - 2, py - 2, wpx + 4, hpx + 4);

  ctx.font = `${isBase ? 34 : 22}px sans-serif`;
  ctx.textAlign = "center";
  if (!isBase && art.diamond) {
    // mỏ kim cương bằng sprite (vừa khít ô 2x2)
    ctx.drawImage(art.diamond, px, py, wpx, hpx);
  } else if (isBase && art.base) {
    // thành chính bằng sprite (vừa khít ô 4x4)
    ctx.drawImage(art.base, px, py, wpx, hpx);
  } else {
    ctx.fillText(isBase ? "🏰" : "💎", px + wpx / 2, py + hpx / 2 + (isBase ? 12 : 8));
  }
  ctx.textAlign = "left";

  const def = BUILDING_DEFS[e.defId];
  if (def?.income) {
    ctx.fillStyle = e.player === -1 ? "rgba(255,255,255,0.75)" : color;
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`+${def.income}/s`, px + wpx / 2, py + hpx + 13);
    ctx.textAlign = "left";
  }
  if (isBase) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${e.hp}/${e.maxHp}`, px + wpx / 2, py + hpx + 13);
    ctx.textAlign = "left";
  }
}

function drawHealthBar(ctx: CanvasRenderingContext2D, wx: number, wy: number, e: Entity) {
  const w = e.kind === "building" ? e.tw * TILE : 28;
  const h = 4;
  const y = wy - (e.kind === "building" ? e.th * TILE * 0.5 + 12 : 18);
  const pct = Math.max(0, e.hp / e.maxHp);
  ctx.fillStyle = "#111";
  ctx.fillRect(wx - w / 2, y, w, h);
  ctx.fillStyle = pct > 0.5 ? "#22ff55" : pct > 0.25 ? "#ffaa22" : "#ff3333";
  ctx.fillRect(wx - w / 2, y, w * pct, h);
}

// --------------------------------------------------------------- minimap

export function renderMinimap(
  ctx: CanvasRenderingContext2D,
  game: Game,
  ui: Interaction,
  size: number,
  viewW: number,
  viewH: number
) {
  const world = game.world;
  const map = world.map;
  const s = size / Math.max(map.w, map.h);
  ctx.clearRect(0, 0, size, size);
  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      if (!isExplored(world, HUMAN, tx, ty)) {
        ctx.fillStyle = "#000";
      } else {
        const t = map.tiles[map.idx(tx, ty)];
        if (t === T_WOOD) ctx.fillStyle = "#2d5a27";
        else if (t === T_STONE) ctx.fillStyle = "#6b6b6b";
        else ctx.fillStyle = "#2c5a2a";
      }
      ctx.fillRect(tx * s, ty * s, Math.ceil(s), Math.ceil(s));
    }
  }
  for (const e of world.entities.values()) {
    const tx = Math.floor(e.x / TILE);
    const ty = Math.floor(e.y / TILE);
    if (!isExplored(world, HUMAN, tx, ty)) continue;
    ctx.fillStyle = teamColor(game, e.player);
    const d = e.kind === "building" ? 4 : 2.5;
    ctx.fillRect((e.x / TILE) * s - d / 2, (e.y / TILE) * s - d / 2, d, d);
  }
  // rally
  const pl = world.players.find((p) => p.id === HUMAN);
  if (pl) {
    ctx.fillStyle = "#fff";
    ctx.fillRect((pl.rallyX / TILE) * s - 2, (pl.rallyY / TILE) * s - 2, 4, 4);
  }
  const cam = ui.camera;
  const halfW = viewW / 2 / cam.zoom / TILE * s;
  const halfH = viewH / 2 / cam.zoom / TILE * s;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    (cam.x / TILE) * s - halfW,
    (cam.y / TILE) * s - halfH,
    halfW * 2,
    halfH * 2
  );
}
