/**
 * FogOfWar — per-player visibility grid.
 * 0 = unexplored, 1 = explored (dim), 2 = currently visible.
 * Recomputed every tick from unit/building sight radii.
 */
import { BUILDING_DEFS, TILE, UNIT_DEFS } from "../data";
import { World } from "../World";

export function fogTick(world: World) {
  const W = world.map.w;
  for (let p = 0; p < world.players.length; p++) {
    const fog = world.fog[p];
    if (!fog) continue;
    for (let i = 0; i < fog.length; i++) if (fog[i] === 2) fog[i] = 1;
    for (const e of world.entities.values()) {
      if (e.player !== p) continue;
      const sight =
        e.kind === "unit" ? UNIT_DEFS[e.defId].sight : BUILDING_DEFS[e.defId].sight;
      revealCircle(world, fog, e.x, e.y, sight);
    }
  }
}

function revealCircle(world: World, fog: Uint8Array, wx: number, wy: number, sightTiles: number) {
  const W = world.map.w;
  const ctx = world.map.worldToTile(wx);
  const cty = world.map.worldToTile(wy);
  const r = Math.ceil(sightTiles);
  for (let ty = cty - r; ty <= cty + r; ty++) {
    for (let tx = ctx - r; tx <= ctx + r; tx++) {
      if (!world.map.inBounds(tx, ty)) continue;
      const dx = tx - ctx;
      const dy = ty - cty;
      if (dx * dx + dy * dy <= r * r) fog[ty * W + tx] = 2;
    }
  }
}

/** Is a world position currently visible to a player? */
export function isVisible(world: World, player: number, wx: number, wy: number): boolean {
  const fog = world.fog[player];
  if (!fog) return true;
  const tx = world.map.worldToTile(wx);
  const ty = world.map.worldToTile(wy);
  if (!world.map.inBounds(tx, ty)) return false;
  return fog[ty * world.map.w + tx] === 2;
}

/** Has a tile been explored at all (for minimap)? */
export function isExplored(world: World, player: number, tx: number, ty: number): boolean {
  const fog = world.fog[player];
  if (!fog) return true;
  if (!world.map.inBounds(tx, ty)) return false;
  return fog[ty * world.map.w + tx] > 0;
}
