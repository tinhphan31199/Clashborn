/* Headless auto-battle test — AI vs scripted buyer. Run: npx tsx simtest.ts */
import { Game, HUMAN, AI_PLAYER } from "./src/engine/Game";
import { SPAWN_ORDER, UNIT_DEFS } from "./src/engine/data";

const game = new Game(42);
const w = game.world;

console.log("bases:", w.baseOf(HUMAN) ? "blue OK" : "MISSING", w.baseOf(AI_PLAYER) ? "red OK" : "MISSING");
console.log("nodes:", w.nodes().map((n) => n.defId).join(" "));

const buy = (id: string) => game.dispatch({ type: "spawnUnit", player: HUMAN, unitDefId: id });

// Mở bài chuẩn: worker worker soldier soldier.
buy("worker");
buy("soldier");
// War Council: thử control + auto-chi tiêu như người chơi thật.
game.dispatch({ type: "setDirective", player: HUMAN, ecoMil: 0.5, defAtk: 0.5, focus: "mid", autoSpend: true });

const STEPS = 60 * 60 * 12; // tối đa 12 phút (qua sudden death 10p)
// Bất biến va chạm: không lính nào được đứng trong ô có đồ vật (nước/rừng/đá/nhà).
let violations = 0;
let checks = 0;
for (let i = 0; i < STEPS; i++) {
  game.update(1 / 60);
  if (game.phase !== "playing") break;
  // Script mua quân mỗi 5s: giữ 4 worker rồi soldier/archer luân phiên, tank khi giàu.
  if (i % 300 === 0) {
    const me = w.player(HUMAN);
    const mine = w.unitsOf(HUMAN);
    const workers = mine.filter((u) => u.defId === "worker").length;
    const soldiers = mine.filter((u) => u.defId === "soldier").length;
    if (workers < 4 && me.ore >= UNIT_DEFS.worker.cost) buy("worker");
    else if (me.ore >= UNIT_DEFS.tank.cost && soldiers >= 4) buy("tank");
    else if (soldiers % 2 === 0) buy("archer");
    else buy("soldier");
  }
  if (i % 10 === 0) {
    for (const u of w.entities.values()) {
      if (u.kind !== "unit") continue;
      checks++;
      if (!w.map.passable(w.map.worldToTile(u.x), w.map.worldToTile(u.y))) violations++;
    }
  }
}
const p0 = w.player(HUMAN);
const p1 = w.player(AI_PLAYER);
console.log(`ticks=${game.tickCount} phase=${game.phase} time=${w.time.toFixed(0)}s suddenDeath=${game.suddenDeath}`);
console.log(`blue: gold=${Math.floor(p0.ore)} income=${Math.round(p0.income)}/s pop=${p0.supplyUsed}/${p0.supplyCap} units=${w.unitsOf(HUMAN).length} food=${Math.floor(p0.food)} water=${Math.floor(p0.water)}(${p0.waterIncome.toFixed(1)}/s)`);
console.log(`red:  gold=${Math.floor(p1.ore)} income=${Math.round(p1.income)}/s pop=${p1.supplyUsed}/${p1.supplyCap} units=${w.unitsOf(AI_PLAYER).length} food=${Math.floor(p1.food)} water=${Math.floor(p1.water)}(${p1.waterIncome.toFixed(1)}/s)`);
console.log(`nodes: ${w.nodes().map((n) => `${n.defId}:${n.player}`).join(" ")}`);
console.log(`base HP: blue=${w.baseOf(HUMAN)?.hp ?? "DEAD"} red=${w.baseOf(AI_PLAYER)?.hp ?? "DEAD"}`);

let bad = 0;
for (const e of w.entities.values()) {
  if (!isFinite(e.x) || !isFinite(e.y) || e.hp > e.maxHp + 1) bad++;
}
console.log(bad === 0 ? "ENTITY SANITY OK" : `ENTITY SANITY FAIL: ${bad}`);
console.log(violations === 0 ? `COLLISION OK (${checks} checks)` : `COLLISION FAIL: ${violations}/${checks} inside blocked tiles`);
console.log("roster:", SPAWN_ORDER.join(", "));
