/* Nhà mới (tháp/chợ/giếng) được xây + tháp bắn địch. */
import { Game, HUMAN, AI_PLAYER } from "./src/engine/Game";
import { finishedBuildings } from "./src/engine/systems/construction";

const game = new Game(42);
const w = game.world;
const me = w.player(HUMAN);
me.wood = 1000;
me.stone = 500;
me.ore = 500;
for (let i = 0; i < 6; i++) game.dispatch({ type: "spawnUnit", player: HUMAN, unitDefId: "worker" });

let towerAt = -1;
for (let i = 0; i < 60 * 60 * 8; i++) {
  game.update(1 / 60);
  if (game.phase !== "playing") break;
  if (towerAt < 0 && finishedBuildings(w, HUMAN, "tower").length >= 1) towerAt = i;
  if (
    finishedBuildings(w, HUMAN, "well").length >= 1 &&
    finishedBuildings(w, HUMAN, "market").length >= 1 &&
    towerAt >= 0
  ) {
    console.log(`t=${(i / 60).toFixed(0)}s: đủ tháp + chợ + giếng`);
    break;
  }
}
const counts: Record<string, number> = {};
for (const e of w.entities.values()) {
  if (e.kind === "building" && e.player === HUMAN && !e.underConstruction) {
    counts[e.defId] = (counts[e.defId] ?? 0) + 1;
  }
}
console.log("nhà phe ta:", JSON.stringify(counts));

// Tháp bắn: thả lính đỏ cạnh tháp, xem nó có mất máu/chết không.
const tower = finishedBuildings(w, HUMAN, "tower")[0];
let shotOk = false;
if (tower) {
  const foe = w.spawnUnit("soldier", AI_PLAYER, tower.x + 60, tower.y);
  foe.path = [];
  const hp0 = foe.hp;
  for (let i = 0; i < 60 * 12; i++) {
    game.update(1 / 60);
    const cur = w.get(foe.id);
    if (!cur || cur.hp <= 0) {
      shotOk = true;
      break;
    }
    if (cur.hp < hp0) shotOk = true;
  }
  console.log(`tháp bắn: lính đỏ ${hp0} → ${w.get(foe.id)?.hp ?? "CHẾT"} (trong tầm 6 ô)`);
} else {
  console.log("tháp bắn: KHÔNG CÓ THÁP để thử");
}
// Chợ + giếng có phát huy (income/water)?
console.log(`thu nhập vàng: ${Math.round(me.income)}/s, nước: ${me.water.toFixed(1)} (+${me.waterIncome.toFixed(1)}/s)`);
const ok = towerAt >= 0 && (counts.market ?? 0) >= 1 && (counts.well ?? 0) >= 1 && shotOk;
console.log(ok ? "STRUCTS OK" : "STRUCTS FAIL");
process.exit(ok ? 0 : 1);
