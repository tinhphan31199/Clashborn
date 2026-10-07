"use client";

/**
 * Shell màn hình: menu chính ↔ setup trận ↔ trong trận (GameView).
 * Giữ MatchConfig + AppSettings trong localStorage để nhớ giữa các lần chơi.
 */
import { useCallback, useState } from "react";
import GameView from "@/components/GameView";
import MainMenu, { type MenuAction } from "@/components/menu/MainMenu";
import SkirmishSetup from "@/components/menu/SkirmishSetup";
import SettingsPanel from "@/components/menu/SettingsPanel";
import HelpPanel from "@/components/menu/HelpPanel";
import LoadPanel from "@/components/menu/LoadPanel";
import {
  hasAnySave,
  listSaves,
  loadMatchConfig,
  loadSettings,
  readSave,
  saveMatchConfig,
  saveSettings,
  type AppSettings,
  type MatchConfig,
} from "@/menu/config";

type Screen = "menu" | "setup" | "settings" | "help" | "load" | "game";

export default function Page() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [match, setMatch] = useState<MatchConfig>(() => loadMatchConfig());
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [hasSave, setHasSave] = useState(() => hasAnySave());
  const [pendingSave, setPendingSave] = useState<string | null>(null);
  const [matchId, setMatchId] = useState(0);
  const [lastResult, setLastResult] = useState<{ outcome: "victory" | "defeat"; time: number } | null>(null);

  const changeMatch = (c: MatchConfig) => {
    setMatch(c);
    saveMatchConfig(c);
  };

  const changeSettings = (s: AppSettings) => {
    setSettings(s);
    saveSettings(s);
  };

  const startBattle = useCallback(
    (saveJson: string | null, seedOverride?: number) => {
      if (seedOverride !== undefined) {
        const c = { ...match, seed: seedOverride };
        setMatch(c);
        saveMatchConfig(c);
      }
      setPendingSave(saveJson);
      setMatchId((id) => id + 1);
      setScreen("game");
      setHasSave(hasAnySave());
    },
    [match]
  );

  const onMenuAction = (a: MenuAction) => {
    if (a === "skirmish") setScreen("setup");
    else if (a === "quick") startBattle(null);
    else if (a === "continue") {
      // Save mới nhất = slot có date lớn nhất.
      const saves = listSaves();
      let best = -1;
      let bestDate = -1;
      saves.forEach((s, i) => {
        if (s && s.date > bestDate) {
          bestDate = s.date;
          best = i;
        }
      });
      if (best >= 0) {
        const snap = readSave(best);
        if (snap) startBattle(snap);
      }
    } else if (a === "load") setScreen("load");
    else if (a === "help") setScreen("help");
    else if (a === "settings") setScreen("settings");
  };

  if (screen === "game") {
    return (
      <GameView
        key={matchId}
        config={match}
        settings={settings}
        initialSaveJson={pendingSave}
        onSettingsChange={changeSettings}
        onExitToMenu={() => {
          setHasSave(hasAnySave());
          setScreen("menu");
        }}
        onMatchEnd={(outcome, time) => setLastResult({ outcome, time })}
      />
    );
  }

  if (screen === "setup") {
    return (
      <SkirmishSetup
        config={match}
        onChange={changeMatch}
        onBack={() => setScreen("menu")}
        onStart={() => startBattle(null, match.seed)}
      />
    );
  }

  if (screen === "settings") {
    return <SettingsPanel settings={settings} onChange={changeSettings} onBack={() => setScreen("menu")} />;
  }

  if (screen === "help") {
    return <HelpPanel onBack={() => setScreen("menu")} />;
  }

  if (screen === "load") {
    return (
      <LoadPanel
        onBack={() => setScreen("menu")}
        onLoad={(snap) => startBattle(snap)}
      />
    );
  }

  return (
    <MainMenu
      match={match}
      hasSave={hasSave}
      lastResult={lastResult}
      onAction={onMenuAction}
    />
  );
}
