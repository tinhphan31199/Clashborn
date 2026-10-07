/**
 * Menu config — MatchConfig (setup trận) + AppSettings (cài đặt chung)
 * + save/load slots qua localStorage. Pure TS, không phụ thuộc React.
 */

export type AIDifficulty = "easy" | "normal" | "hard" | "brutal";
export type AIPersonality = "random" | "rush" | "eco" | "control";
export type DoctrineId = "balanced" | "rush" | "turtle" | "control";

export interface MatchConfig {
  commanderName: string;
  playerColor: string;
  doctrine: DoctrineId;
  autoSpend: boolean;
  aiDifficulty: AIDifficulty;
  aiPersonality: AIPersonality;
  startingGold: number;
  gameSpeed: number;
  suddenDeath: boolean;
  seed: number;
}

export interface AppSettings {
  masterVolume: number; // 0..100
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  cameraSpeed: number; // 1..10
  edgePan: boolean;
  showGrid: boolean;
  defaultSpeed: number; // 1..3
  confirmQuit: boolean;
}

export const DEFAULT_MATCH: MatchConfig = {
  commanderName: "Tướng Xanh",
  playerColor: "#3b82f6",
  doctrine: "balanced",
  autoSpend: false,
  aiDifficulty: "normal",
  aiPersonality: "random",
  startingGold: 100,
  gameSpeed: 1,
  suddenDeath: true,
  seed: 20261007,
};

export const DEFAULT_SETTINGS: AppSettings = {
  masterVolume: 80,
  musicVolume: 60,
  sfxVolume: 80,
  muted: false,
  cameraSpeed: 5,
  edgePan: true,
  showGrid: false,
  defaultSpeed: 1,
  confirmQuit: true,
};

export const AI_INFO: Record<AIDifficulty, { name: string; icon: string; desc: string }> = {
  easy: { name: "Dễ", icon: "🌱", desc: "AI nghĩ chậm, đánh nhẹ tay — cho người mới." },
  normal: { name: "Thường", icon: "⚔️", desc: "AI chuẩn, đúng luật như người chơi." },
  hard: { name: "Khó", icon: "🔥", desc: "AI nghĩ nhanh, build chuẩn meta." },
  brutal: { name: "Ác mộng", icon: "💀", desc: "AI cực nhanh + bonus kinh tế. Cẩn thận!" },
};

export const DOCTRINE_INFO: Record<DoctrineId, { name: string; icon: string; desc: string }> = {
  balanced: { name: "Cân bằng", icon: "⚖️", desc: "Không preset — tự chỉnh War Council trong trận." },
  rush: { name: "Rush", icon: "⚔️", desc: "Full công, dồn mỏ trung tâm từ sớm." },
  turtle: { name: "Turtle", icon: "🛡️", desc: "Thủ nhà, ôm mỏ gần, tích lực late." },
  control: { name: "Control", icon: "🎯", desc: "Cân bằng, tranh mỏ giữa." },
};

const MATCH_KEY = "rts.matchConfig.v1";
const SETTINGS_KEY = "rts.settings.v1";
const SAVE_PREFIX = "rts.save.";

function safeGet(key: string): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* bỏ qua: hết quota / private mode */
  }
}

export function loadMatchConfig(): MatchConfig {
  try {
    const raw = safeGet(MATCH_KEY);
    if (raw) return { ...DEFAULT_MATCH, ...JSON.parse(raw) };
  } catch {
    /* json hỏng → dùng default */
  }
  return { ...DEFAULT_MATCH };
}

export function saveMatchConfig(cfg: MatchConfig) {
  safeSet(MATCH_KEY, JSON.stringify(cfg));
}

export function loadSettings(): AppSettings {
  try {
    const raw = safeGet(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* bỏ qua */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: AppSettings) {
  safeSet(SETTINGS_KEY, JSON.stringify(s));
}

export function randomSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
}

// ------------------------------------------------------------- save slots

export interface SaveMeta {
  slot: number;
  name: string;
  date: number;
  time: number; // giây trong game
  phase: string;
  gold: number;
}

export const SAVE_SLOTS = 6;

export function saveKey(slot: number): string {
  return `${SAVE_PREFIX}${slot}`;
}

export function listSaves(): (SaveMeta | null)[] {
  const out: (SaveMeta | null)[] = [];
  for (let i = 0; i < SAVE_SLOTS; i++) {
    try {
      const raw = safeGet(saveKey(i));
      if (!raw) {
        out.push(null);
        continue;
      }
      const d = JSON.parse(raw);
      out.push({
        slot: i,
        name: d.name ?? `Save ${i + 1}`,
        date: d.date ?? 0,
        time: d.snapshot ? JSON.parse(d.snapshot).world?.time ?? 0 : 0,
        phase: d.snapshot ? JSON.parse(d.snapshot).phase ?? "playing" : "?",
        gold: d.gold ?? 0,
      });
    } catch {
      out.push(null);
    }
  }
  return out;
}

export function writeSave(slot: number, name: string, snapshotJson: string, gold: number) {
  safeSet(
    saveKey(slot),
    JSON.stringify({ name, date: Date.now(), snapshot: snapshotJson, gold })
  );
}

export function readSave(slot: number): string | null {
  try {
    const raw = safeGet(saveKey(slot));
    if (!raw) return null;
    const d = JSON.parse(raw);
    return (d.snapshot as string) ?? null;
  } catch {
    return null;
  }
}

export function deleteSave(slot: number) {
  try {
    localStorage.removeItem(saveKey(slot));
  } catch {
    /* bỏ qua */
  }
}

export function hasAnySave(): boolean {
  return listSaves().some((s) => s !== null);
}
