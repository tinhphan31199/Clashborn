"use client";

/**
 * GameView — AUTO-BATTLER edition, chạy 1 trận theo MatchConfig từ menu.
 * Nhận config + settings + save ban đầu; Esc mở PauseMenu (lưu/tải/cài đặt/trợ giúp).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { SPAWN_ORDER, UNIT_DEFS } from "@/engine/data";
import { DOCTRINES } from "@/engine/commands";
import { Game, HUMAN, AI_PLAYER } from "@/engine/Game";
import { Interaction, ZOOM_MAX, ZOOM_MIN } from "@/engine/input";
import { renderGame, renderMinimap } from "@/engine/render";
import { MAX_HOUSES } from "@/engine/data";
import { finishedBuildings } from "@/engine/systems/construction";
import { shortages } from "@/engine/systems/economy";
import { GamePhase, MapFocus } from "@/engine/types";
import type { AppSettings, MatchConfig } from "@/menu/config";
import { AI_INFO } from "@/menu/config";
import PauseMenu from "./menu/PauseMenu";

interface HudState {
  gold: number;
  income: number;
  water: number;
  waterNet: number;
  wood: number;
  stone: number;
  pop: number;
  popCap: number;
  houses: number;
  farms: number;
  phase: GamePhase;
  time: number;
  suddenDeath: boolean;
  paused: boolean;
  speed: number;
  blueBase: number;
  blueMax: number;
  redBase: number;
  redMax: number;
  ecoMil: number;
  defAtk: number;
  focus: MapFocus;
  autoSpend: boolean;
  kills: number;
  needs: { gold: number; wood: number; stone: number; water: number; food: number };
  food: number;
  warnings: string[];
  nodes: { name: string; income: number; owner: number }[];
}

export interface GameViewProps {
  config: MatchConfig;
  settings: AppSettings;
  initialSaveJson?: string | null;
  onSettingsChange: (s: AppSettings) => void;
  onExitToMenu: () => void;
  onMatchEnd: (outcome: "victory" | "defeat", time: number) => void;
}

export default function GameView({
  config,
  settings,
  initialSaveJson,
  onSettingsChange,
  onExitToMenu,
  onMatchEnd,
}: GameViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const uiRef = useRef<Interaction | null>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const midDrag = useRef<{ x: number; y: number } | null>(null);
  const saveApplied = useRef(false);
  const endReported = useRef(false);
  const [session, setSession] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Mobile: War Council gọn trong nút 🧭; desktop luôn hiện.
  const [councilOpen, setCouncilOpen] = useState(false);
  // Toast mô tả lính khi giữ lâu trên mobile (thay tooltip chuột).
  const [descToast, setDescToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const showDesc = (text: string) => {
    setDescToast(text);
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setDescToast(null), 2500);
  };
  const wasPaused = useRef(false);
  const [hud, setHud] = useState<HudState | null>(null);

  // ------------------------------------------------------------ game loop
  useEffect(() => {
    const cfg = config;
    const st = settings;
    const game = new Game(cfg.seed, {
      startingGold: cfg.startingGold,
      suddenDeath: cfg.suddenDeath,
      ai: { difficulty: cfg.aiDifficulty, personality: cfg.aiPersonality },
    });
    // Tên + màu chỉ huy lên world để render dùng.
    const me = game.world.player(HUMAN);
    me.name = cfg.commanderName || "Blue";
    if (cfg.playerColor) me.color = cfg.playerColor;
    game.speed = st.defaultSpeed || cfg.gameSpeed || 1;
    // Học thuyết mở màn + auto-spend từ setup.
    if (cfg.doctrine !== "balanced") {
      game.dispatch({ type: "setDirective", player: HUMAN, ...DOCTRINES[cfg.doctrine] });
    }
    if (cfg.autoSpend) game.dispatch({ type: "setDirective", player: HUMAN, autoSpend: true });
    // Load save (chỉ 1 lần lúc vào trận, rematch thì đánh mới).
    if (!saveApplied.current && initialSaveJson) {
      try {
        game.load(initialSaveJson);
      } catch {
        /* save hỏng → chơi mới */
      }
      saveApplied.current = true;
    }
    endReported.current = false;

    const ui = new Interaction();
    gameRef.current = game;
    uiRef.current = ui;
    ui.edgePanEnabled = st.edgePan;
    ui.panSpeed = 0.4 + ((st.cameraSpeed - 1) / 9) * 1.2;
    ui.focus(game.startFocus.x, game.startFocus.y);

    const canvas = canvasRef.current!;
    const mini = miniRef.current!;
    const container = containerRef.current!;
    const ctx = canvas.getContext("2d")!;
    const mctx = mini.getContext("2d")!;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = container.clientWidth;
      const h = container.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let last = performance.now();
    let hudTimer = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      game.update(dt);
      ui.pruneSelection(game);
      const rect = canvas.getBoundingClientRect();
      ui.panTick(game, dt, mouseRef.current, rect.width, rect.height);

      renderGame(ctx, game, ui, rect.width, rect.height);
      const ms = 176;
      renderMinimap(mctx, game, ui, ms, rect.width, rect.height);

      hudTimer += dt;
      if (hudTimer > 0.2) {
        hudTimer = 0;
        setHud(collectHud(game, ui));
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      gameRef.current = null;
      uiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Áp settings thay đổi giữa trận (không cần restart).
  useEffect(() => {
    const ui = uiRef.current;
    if (ui) {
      ui.edgePanEnabled = settings.edgePan;
      ui.panSpeed = 0.4 + ((settings.cameraSpeed - 1) / 9) * 1.2;
    }
    const g = gameRef.current;
    if (g && session === 0) {
      // trận mới vào: tôn trọng defaultSpeed trừ khi người chơi đã đổi tay
    }
  }, [settings, session]);

  // Báo kết quả về menu (1 lần) để hiện "trận trước".
  useEffect(() => {
    if (hud && hud.phase !== "playing" && !endReported.current) {
      endReported.current = true;
      onMatchEnd(hud.phase === "victory" ? "victory" : "defeat", hud.time);
    }
  }, [hud, onMatchEnd]);

  // ---------------------------------------------------------------- input
  const toWorld = useCallback((clientX: number, clientY: number) => {
    const ui = uiRef.current!;
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return { sx, sy, ...ui.screenToWorld(sx, sy, rect.width, rect.height) };
  }, []);

  const openMenu = useCallback(() => {
    const g = gameRef.current;
    if (g && !menuOpen) {
      wasPaused.current = g.paused;
      g.paused = true;
    }
    setMenuOpen(true);
  }, [menuOpen]);

  const closeMenu = useCallback(() => {
    const g = gameRef.current;
    if (g) g.paused = wasPaused.current;
    setMenuOpen(false);
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if (menuOpen) return;
    const game = gameRef.current!;
    const ui = uiRef.current!;
    if (e.button === 1) {
      midDrag.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      return;
    }
    const { sx, sy, x, y } = toWorld(e.clientX, e.clientY);
    if (e.button === 0) ui.leftDown(game, x, y, sx, sy, e.shiftKey);
    else if (e.button === 2) ui.rightDown(game, x, y);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const ui = uiRef.current!;
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    mouseRef.current = { x: sx, y: sy };
    ui.leftMove(sx, sy);
    if (midDrag.current) {
      const dx = e.clientX - midDrag.current.x;
      const dy = e.clientY - midDrag.current.y;
      midDrag.current = { x: e.clientX, y: e.clientY };
      ui.camera.x -= dx / ui.camera.zoom;
      ui.camera.y -= dy / ui.camera.zoom;
    }
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (e.button === 1) {
      midDrag.current = null;
      return;
    }
    const game = gameRef.current!;
    const ui = uiRef.current!;
    if (e.button === 0) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const { x, y } = toWorld(e.clientX, e.clientY);
      ui.leftUp(game, x, y, rect.width, rect.height);
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const ui = uiRef.current!;
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const before = ui.screenToWorld(sx, sy, rect.width, rect.height);
    ui.camera.zoom *= e.deltaY < 0 ? 1.12 : 1 / 1.12;
    ui.camera.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, ui.camera.zoom));
    const after = ui.screenToWorld(sx, sy, rect.width, rect.height);
    ui.camera.x += before.x - after.x;
    ui.camera.y += before.y - after.y;
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const ui = uiRef.current;
      const game = gameRef.current;
      if (!ui || !game) return;
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      if (k === "escape") {
        if (showHelp) setShowHelp(false);
        else if (menuOpen) closeMenu();
        else {
          ui.cancelAll();
          openMenu();
        }
        return;
      }
      if (menuOpen) return;
      if (k === " ") game.paused = !game.paused;
      else if (k === "1") game.dispatch({ type: "spawnUnit", player: HUMAN, unitDefId: "worker" });
      else if (k === "2") game.dispatch({ type: "spawnUnit", player: HUMAN, unitDefId: "soldier" });
      else if (k === "3") game.dispatch({ type: "spawnUnit", player: HUMAN, unitDefId: "archer" });
      else if (k === "4") game.dispatch({ type: "spawnUnit", player: HUMAN, unitDefId: "tank" });
      else if (k === "h") setShowHelp((v) => !v);
      else ui.keys.add(k);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      uiRef.current?.keys.delete(e.key.toLowerCase());
    };
    const onBlur = () => uiRef.current?.keys.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [menuOpen, showHelp, openMenu, closeMenu]);

  // ------------------------------------------------- touch (mobile)
  // Triết lý mobile: game auto-battler không micro nên
  //  CHẠM = xem lính · KÉO = di camera ·
  //  GIỮ = xem thông tin lính · PINCH = zoom.
  // Quân spawn ra tự ra mặt trận, không cần đặt điểm tập kết.
  const touchState = useRef<{
    mode: "maybe-tap" | "pan" | "pinch";
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    startTime: number;
    pinchDist: number;
    longPressFired: boolean;
    timer: number | null;
  } | null>(null);

  const buzz = (ms: number) => {
    try {
      (navigator as Navigator & { vibrate?: (p: number) => boolean }).vibrate?.(ms);
    } catch {
      /* máy không có rung */
    }
  };

  const selectAt = (x: number, y: number) => {
    const game = gameRef.current!;
    const ui = uiRef.current!;
    const hit = ui.pickAt(game, x, y);
    ui.selection = new Set(hit ? [hit.id] : []);
    buzz(10);
  };

  const zoomCenter = (factor: number) => {
    const ui = uiRef.current!;
    ui.camera.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, ui.camera.zoom * factor));
  };

  const focusBase = () => {
    const game = gameRef.current!;
    const ui = uiRef.current!;
    const b = game.world.baseOf(HUMAN);
    if (b) {
      ui.focus(b.x, b.y);
      buzz(10);
    }
  };

  const touchPos = (t: React.Touch) => {
    const ui = uiRef.current!;
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = t.clientX - rect.left;
    const sy = t.clientY - rect.top;
    return { sx, sy, ...ui.screenToWorld(sx, sy, rect.width, rect.height) };
  };

  const clearTouchTimer = () => {
    const st = touchState.current;
    if (st?.timer != null) {
      window.clearTimeout(st.timer);
      st.timer = null;
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (menuOpen) return;
    const ui = uiRef.current!;
    if (e.touches.length === 2) {
      // Chuyển sang pinch-zoom.
      clearTouchTimer();
      const a = e.touches[0];
      const b = e.touches[1];
      touchState.current = {
        mode: "pinch",
        startX: 0, startY: 0, lastX: 0, lastY: 0,
        startTime: 0,
        pinchDist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        longPressFired: false,
        timer: null,
      };
      return;
    }
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    mouseRef.current = null; // tránh edge-pan khi chạm
    const st = {
      mode: "maybe-tap" as const,
      startX: t.clientX, startY: t.clientY,
      lastX: t.clientX, lastY: t.clientY,
      startTime: performance.now(),
      pinchDist: 0,
      longPressFired: false,
      timer: null as number | null,
    };
    touchState.current = st;
    // Giữ 450ms không nhấc → xem thông tin lính tại điểm đó.
    st.timer = window.setTimeout(() => {
      if (touchState.current !== st || st.mode !== "maybe-tap") return;
      st.longPressFired = true;
      const game = gameRef.current!;
      const { x, y } = touchPos(t);
      const hit = ui.pickAt(game, x, y);
      ui.selection = new Set(hit ? [hit.id] : []);
      buzz(20);
    }, 450);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (menuOpen) return;
    const st = touchState.current;
    const ui = uiRef.current!;
    if (st?.mode === "pinch" && e.touches.length === 2) {
      const a = e.touches[0];
      const b = e.touches[1];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (st.pinchDist > 0 && d > 0) zoomCenter(d / st.pinchDist);
      st.pinchDist = d;
      return;
    }
    if (!st || st.mode !== "maybe-tap" || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - st.lastX;
    const dy = t.clientY - st.lastY;
    st.lastX = t.clientX;
    st.lastY = t.clientY;
    // Kéo quá 12px → thành di camera (hủy tap + long-press).
    if (st.mode === "maybe-tap" && Math.hypot(t.clientX - st.startX, t.clientY - st.startY) > 12) {
      st.mode = "pan";
      clearTouchTimer();
    }
    if (st.mode === "pan") {
      ui.camera.x -= dx / ui.camera.zoom;
      ui.camera.y -= dy / ui.camera.zoom;
      const g = gameRef.current!;
      ui.clampCamera(g.world.map.w * 32, g.world.map.h * 32);
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (menuOpen) return;
    const st = touchState.current;
    if (e.touches.length !== 0) return; // vẫn còn ngón khác → kệ
    touchState.current = null;
    clearTouchTimer();
    if (!st || st.mode !== "maybe-tap" || st.longPressFired) return;
    // Chạm nhanh không kéo = xem lính tại điểm đó.
    if (performance.now() - st.startTime > 600) return;
    const ui = uiRef.current!;
    const rect = canvasRef.current!.getBoundingClientRect();
    const t = e.changedTouches[0];
    const w = ui.screenToWorld(t.clientX - rect.left, t.clientY - rect.top, rect.width, rect.height);
    selectAt(w.x, w.y);
  };

  // -------------------------------------------------------------- minimap
  const miniGoTo = (e: React.MouseEvent) => {
    const game = gameRef.current!;
    const ui = uiRef.current!;
    const rect = miniRef.current!.getBoundingClientRect();
    const size = rect.width;
    const s = size / Math.max(game.world.map.w, game.world.map.h);
    const tx = (e.clientX - rect.left) / s;
    const ty = (e.clientY - rect.top) / s;
    ui.focus(tx * 32, ty * 32);
  };

  // ------------------------------------------------------------------ hud
  const restart = () => {
    saveApplied.current = true; // rematch = đánh mới, không load lại save
    setMenuOpen(false);
    setSession((s) => s + 1);
  };

  const spawn = (unitDefId: string) => {
    gameRef.current!.dispatch({ type: "spawnUnit", player: HUMAN, unitDefId });
  };

  const setDirective = (patch: { ecoMil?: number; defAtk?: number; focus?: MapFocus; autoSpend?: boolean; needs?: { gold: number; wood: number; stone: number; water: number; food: number } }) => {
    gameRef.current!.dispatch({ type: "setDirective", player: HUMAN, ...patch });
  };

  const getSnapshot = () => {
    const g = gameRef.current;
    if (!g) return null;
    return { json: g.save(), gold: g.world.player(HUMAN).ore, time: g.world.time };
  };

  const downloadReplay = () => {
    const g = gameRef.current;
    if (!g) return;
    const blob = new Blob([g.exportReplay()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `auto-rts-replay-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-black text-white select-none">
      {/* top bar */}
      <div className="z-10 flex flex-wrap items-center gap-x-3 gap-y-1 bg-zinc-900 px-2 py-1.5 text-xs sm:gap-5 sm:px-4 sm:py-2 sm:text-sm">
        <span className="hidden font-bold tracking-wide text-amber-300 sm:inline" title={`${config.commanderName} vs AI ${AI_INFO[config.aiDifficulty].name}`}>
          ⬢ {config.commanderName || "AUTO RTS"}
        </span>
        <span className="hidden text-[11px] text-zinc-500 xl:inline">
          vs AI {AI_INFO[config.aiDifficulty].icon} {AI_INFO[config.aiDifficulty].name}
        </span>
        <span title="Gold">💰 <b className="text-amber-300">{Math.floor(hud?.gold ?? 0)}</b>
          <span className="text-green-400"> +{hud?.income ?? 0}/s</span>
        </span>
        <span title="Nước: gánh từ hồ về, quân uống mỗi giây. Hết nước yếu 30%.">
          💧 <b className={(hud?.water ?? 25) <= 0.5 ? "text-red-400" : "text-sky-300"}>{Math.floor(hud?.water ?? 0)}</b>
          <span className={(hud?.waterNet ?? 0) < 0 ? "text-red-400" : "text-green-400"}>
            {" "}{hud?.waterNet != null && hud.waterNet >= 0 ? "+" : ""}{hud?.waterNet?.toFixed(1) ?? 0}/s
          </span>
        </span>
        <span title="Gỗ: worker đốn rừng gánh về. Archer cần gỗ, Tank cần nhiều gỗ.">🪵 <b className="text-green-300">{hud?.wood ?? 0}</b></span>
        <span title="Đá: worker khai thác gánh về. Tank cần đá.">🪨 <b className="text-zinc-300">{hud?.stone ?? 0}</b></span>
        <span title="Lúa: worker gặt ruộng gánh về. Lính ăn lúa khi train. Ruộng tự mọc lại.">🌾 <b className="text-yellow-200">{hud?.food ?? 0}</b></span>
        <span title="Population">👥 {hud?.pop ?? 0}/{hud?.popCap ?? 20}</span>
        <span title="Nhà (+5 pop) / Trang trại (kho phụ +25%, lúa chín nhanh)">🏠{hud?.houses ?? 0} 🚜{hud?.farms ?? 0}</span>
        <span title="Base">🏰 <b className="text-blue-400">{hud?.blueBase ?? 0}</b>
          <span className="text-zinc-500"> vs </span>
          <b className="text-red-400">{hud?.redBase ?? 0}</b> 🏰
        </span>
        <span className="text-zinc-400">⏱ {fmtTime(hud?.time ?? 0)}</span>
        {hud?.suddenDeath && (
          <span className="animate-pulse rounded bg-red-700 px-2 py-0.5 font-bold">☠️ SUDDEN DEATH x2</span>
        )}
        <span className="ml-auto flex flex-wrap gap-1.5 sm:gap-2">
          <button
            className="rounded bg-zinc-700 px-2.5 py-1.5 md:hidden"
            title="War Council"
            onClick={() => setCouncilOpen((v) => !v)}
          >
            🧭
          </button>
          <button
            className="whitespace-nowrap rounded bg-zinc-700 px-2.5 py-1.5 hover:bg-zinc-600 md:py-1"
            onClick={() => { gameRef.current!.paused = !gameRef.current!.paused; }}
          >
            {hud?.paused ? "▶ Chạy" : "⏸ Dừng"}
          </button>
          <button
            className="rounded bg-zinc-700 px-2.5 py-1.5 hover:bg-zinc-600 md:py-1"
            onClick={() => { gameRef.current!.speed = gameRef.current!.speed >= 3 ? 1 : gameRef.current!.speed + 1; }}
          >
            ⚡ {hud?.speed ?? 1}x
          </button>
          <button className="hidden rounded bg-zinc-700 px-2 py-1 hover:bg-zinc-600 sm:block" onClick={() => setShowHelp((v) => !v)}>
            Cách chơi (H)
          </button>
          <button className="rounded bg-amber-700 px-2.5 py-1.5 font-semibold hover:bg-amber-600 md:py-1" onClick={openMenu} title="Menu tạm dừng (Esc)">
            ☰
          </button>
        </span>
      </div>

      <div ref={containerRef} className="relative flex-1">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 touch-none cursor-crosshair"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onWheel={onWheel}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onMouseLeave={() => (mouseRef.current = null)}
          onContextMenu={(e) => e.preventDefault()}
        />

        {/* minimap */}
        <canvas
          ref={miniRef}
          width={176}
          height={176}
          className="absolute bottom-40 left-2 cursor-pointer rounded border border-zinc-600 md:bottom-28 md:left-3"
          style={{ width: "min(176px, 30vw)", height: "min(176px, 30vw)" }}
          onMouseDown={miniGoTo}
          onMouseMove={(e) => e.buttons === 1 && miniGoTo(e)}
          onTouchStart={(e) => {
            if (e.touches.length !== 1) return;
            const game = gameRef.current!;
            const ui = uiRef.current!;
            const rect = miniRef.current!.getBoundingClientRect();
            const size = rect.width;
            const s = size / Math.max(game.world.map.w, game.world.map.h);
            ui.focus(((e.touches[0].clientX - rect.left) / s) * 32, ((e.touches[0].clientY - rect.top) / s) * 32);
          }}
        />

        {/* nút zoom + về base (mobile) */}
        <div className="absolute right-2 top-1/3 flex flex-col gap-2 md:hidden">
          <button
            className="rounded-lg bg-zinc-900/90 px-3 py-2 text-lg font-bold"
            title="Phóng to"
            onClick={() => zoomCenter(1.2)}
          >
            +
          </button>
          <button
            className="rounded-lg bg-zinc-900/90 px-3 py-2 text-lg font-bold"
            title="Thu nhỏ"
            onClick={() => zoomCenter(1 / 1.2)}
          >
            −
          </button>
          <button
            className="rounded-lg bg-zinc-900/90 px-3 py-2 text-lg font-bold"
            title="Về base ta"
            onClick={focusBase}
          >
            ⌂
          </button>
        </div>

        {/* war council — tay lái của vị tướng */}
        <div className={`absolute left-2 top-2 w-60 max-w-[calc(100vw-1rem)] rounded-lg bg-zinc-900/90 p-2 text-xs md:left-3 md:top-3 ${councilOpen ? "block" : "hidden"} md:block`}>
          <div className="mb-1 text-[11px] uppercase tracking-wider text-zinc-400">🧭 War Council</div>
          <label className="mb-1 block">
            <div className="flex justify-between text-zinc-300">
              <span>👷 Kinh tế</span><span>Quân sự 🪖</span>
            </div>
            <input
              type="range" min={0} max={100} value={Math.round((hud?.ecoMil ?? 0.5) * 100)}
              onChange={(e) => setDirective({ ecoMil: Number(e.target.value) / 100 })}
              className="w-full accent-amber-400"
            />
          </label>
          <label className="mb-1 block">
            <div className="flex justify-between text-zinc-300">
              <span>🛡️ Thủ</span><span>Công ⚔️</span>
            </div>
            <input
              type="range" min={0} max={100} value={Math.round((hud?.defAtk ?? 0.5) * 100)}
              onChange={(e) => setDirective({ defAtk: Number(e.target.value) / 100 })}
              className="w-full accent-red-400"
            />
          </label>
          <div className="mb-1">
            <div className="mb-0.5 text-zinc-400">Trọng tâm 💎</div>
            <div className="flex gap-1">
              {(["auto", "near", "mid", "center"] as MapFocus[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setDirective({ focus: f })}
                  className={`flex-1 rounded border px-1 py-0.5 ${
                    hud?.focus === f
                      ? "border-amber-300 bg-amber-900/60"
                      : "border-zinc-700 bg-zinc-800 hover:border-zinc-500"
                  }`}
                >
                  {f === "auto" ? "Auto" : f === "near" ? "Gần" : f === "mid" ? "Giữa" : "Tâm"}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => setDirective({ autoSpend: !(hud?.autoSpend ?? false) })}
            className={`w-full rounded border px-1 py-1 font-semibold ${
              hud?.autoSpend
                ? "border-green-400 bg-green-900/60"
                : "border-zinc-700 bg-zinc-800 hover:border-zinc-500"
            }`}
          >
            🤖 Auto-chi tiêu {hud?.autoSpend ? "ON" : "OFF"}
          </button>
          <div className="mt-1">
            <div className="mb-0.5 text-zinc-400">Cần gì? (kho cạn worker tự đi lấy)</div>
            <div className="flex gap-1">
              {([
                ["gold", "💰"],
                ["wood", "🪵"],
                ["stone", "🪨"],
                ["water", "💧"],
                ["food", "🌾"],
              ] as const).map(([k, icon]) => {
                const v = hud?.needs?.[k] ?? 1;
                return (
                  <button
                    key={k}
                    onClick={() => setDirective({ needs: { ...(hud?.needs ?? { gold: 1, wood: 1, stone: 1, water: 1, food: 1 }), [k]: (v + 1) % 3 } })}
                    title="Bấm để đổi: thôi → thường → cần gấp"
                    className={`flex-1 rounded border px-1 py-0.5 ${
                      v === 2
                        ? "border-red-400 bg-red-900/60"
                        : v === 1
                          ? "border-zinc-700 bg-zinc-800 hover:border-zinc-500"
                          : "border-zinc-800 bg-zinc-900 opacity-50"
                    }`}
                  >
                    {icon}{"!".repeat(v)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* needs — nhu cầu cảnh báo */}
        {hud && hud.warnings.length > 0 && (
          <div className="absolute left-1/2 top-14 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap justify-center gap-2 px-2">
            {hud.warnings.map((n, i) => (
              <div key={i} className="animate-pulse rounded bg-red-900/90 px-3 py-1 text-sm font-semibold">
                {n}
              </div>
            ))}
          </div>
        )}

        {/* toast mô tả lính (giữ lâu nút thả lính trên mobile) */}
        {descToast && (
          <div className="absolute bottom-32 left-1/2 z-10 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-amber-300/50 bg-zinc-900 px-3 py-2 text-center text-xs text-zinc-200 shadow-xl md:bottom-36">
            {descToast}
          </div>
        )}

        {/* spawn bar — quyết định duy nhất của "vị tướng" */}
        <div className="absolute inset-x-2 bottom-2 rounded-2xl border border-white/10 bg-zinc-900/90 p-2 shadow-2xl backdrop-blur md:inset-x-auto md:bottom-3 md:left-1/2 md:w-auto md:-translate-x-1/2">
          <div className="mb-1.5 hidden text-center text-[11px] uppercase tracking-wider text-zinc-400 sm:block">
            Thả lính — lính tự đánh (phím 1-4)
          </div>
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {SPAWN_ORDER.map((id, i) => {
              const def = UNIT_DEFS[id];
              const afford =
                (hud?.gold ?? 0) >= def.cost &&
                (hud?.wood ?? 0) >= (def.wood ?? 0) &&
                (hud?.stone ?? 0) >= (def.stone ?? 0) &&
                (hud?.food ?? 0) >= (def.food ?? 0);
              const popOk = (hud?.pop ?? 0) + def.supply <= (hud?.popCap ?? 20);
              const ok = afford && popOk;
              const costStr = [`💰${def.cost}`];
              if (def.wood) costStr.push(`🪵${def.wood}`);
              if (def.stone) costStr.push(`🪨${def.stone}`);
              if (def.food) costStr.push(`🌾${def.food}`);
              return (
                <button
                  key={id}
                  onClick={() => spawn(id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    showDesc(`${def.icon} ${def.name}: ${def.description}`);
                  }}
                  disabled={!ok}
                  title={def.description}
                  className={`flex min-h-[68px] flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1.5 transition-transform active:scale-95 sm:min-h-[76px] ${
                    ok
                      ? "border-amber-300/60 bg-zinc-800 shadow-[0_0_10px_rgba(251,191,36,0.15)]"
                      : "border-zinc-800 bg-zinc-900 opacity-45"
                  }`}
                >
                  <img
                    src={`/menu/unit-${id}-walk.gif`}
                    alt={def.name}
                    width={40}
                    height={40}
                    style={{ imageRendering: "pixelated" }}
                    onError={(e) => {
                      const span = document.createElement("span");
                      span.textContent = def.icon;
                      span.className = "text-2xl leading-none sm:text-[26px]";
                      e.currentTarget.replaceWith(span);
                    }}
                  />
                  <span className="text-[11px] font-semibold leading-tight">
                    {def.name} <span className="hidden text-zinc-500 sm:inline">[{i + 1}]</span>
                  </span>
                  <span className="text-[10px] leading-tight text-amber-300">{costStr.join(" ")}</span>
                  <span className="text-[10px] leading-tight text-zinc-500">👥{def.supply}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-1 hidden text-center text-[11px] text-zinc-500 sm:block">
            Quân spawn ra tự ra mặt trận — tướng chỉ lo thả lính và chỉnh War Council
          </div>
        </div>

        {/* pause menu */}
        <PauseMenu
          paused={menuOpen}
          settings={settings}
          onSettings={onSettingsChange}
          getSnapshot={getSnapshot}
          onLoadSnapshot={(json) => {
            try {
              gameRef.current!.load(json);
              closeMenu();
            } catch {
              /* save hỏng */
            }
          }}
          onResume={closeMenu}
          onQuitToMenu={onExitToMenu}
          onSurrender={() => {
            const g = gameRef.current;
            if (g) g.phase = "defeat";
            setMenuOpen(false);
          }}
        />

        {/* victory / defeat */}
        {hud && hud.phase !== "playing" && !menuOpen && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
            <div className="w-[calc(100vw-2rem)] max-w-[440px] rounded-2xl border border-zinc-700 bg-zinc-900 p-5 sm:p-8 text-center">
              <img
                src={hud.phase === "victory" ? "/menu/portrait-blue.png" : "/menu/portrait-red.png"}
                alt={hud.phase === "victory" ? "Tướng ta" : "Warlord địch"}
                width={72}
                height={72}
                className="mx-auto mb-2 rounded-xl border border-zinc-700"
                style={{ imageRendering: "pixelated" }}
              />
              <div className="mb-2 text-4xl">{hud.phase === "victory" ? "🏆 Thắng!" : "💀 Thua"}</div>
              <p className="mb-1 text-zinc-300">
                {hud.phase === "victory"
                  ? "Base địch đã sụp đổ. Điều binh chuẩn đấy."
                  : "Base ta đã mất. Thử rush sớm hoặc ôm mỏ giữa xem?"}
              </p>
              <div className="mb-4 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded bg-zinc-800 p-2">⏱<br /><b>{fmtTime(hud.time)}</b></div>
                <div className="rounded bg-zinc-800 p-2">⚔️ Hạ<br /><b>{hud.kills}</b></div>
                <div className="rounded bg-zinc-800 p-2">💰 Thu nhập<br /><b>+{hud.income}/s</b></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={restart} className="rounded-lg bg-green-600 px-4 py-2 font-semibold hover:bg-green-500">
                  ↻ Đánh lại
                </button>
                <button onClick={onExitToMenu} className="rounded-lg bg-zinc-700 px-4 py-2 font-semibold hover:bg-zinc-600">
                  🚪 Về menu
                </button>
              </div>
              <button onClick={downloadReplay} className="mt-2 w-full rounded-lg border border-zinc-700 px-4 py-1.5 text-sm text-zinc-300 hover:border-zinc-500">
                📼 Tải replay (JSON)
              </button>
            </div>
          </div>
        )}

        {/* help overlay */}
        {showHelp && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4" onClick={() => setShowHelp(false)}>
            <div className="max-h-[86dvh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto rounded-xl bg-zinc-900 p-4 sm:p-6 text-sm leading-7" onClick={(e) => e.stopPropagation()}>
              <h2 className="mb-2 text-lg font-bold">🎮 Bạn không đánh nhau — bạn quyết định ai được đánh</h2>
              <ul className="list-disc pl-5 text-zinc-300">
                <li><b>1-4 / click</b>: thả 👷 Worker (30💰) ⚔️ Soldier (50💰+10🌾) 🏹 Archer (50💰+25🪵+10🌾) 🛡️ Tank (100💰+50🪵+25🪨+30🌾)</li>
                <li>Quân spawn ra <b>tự ra mặt trận</b> — không cần đặt điểm tập kết</li>
                <li><b>🧭 War Council</b>: kéo Kinh tế↔Quân sự, Thủ↔Công, chọn trọng tâm 💎, bấm <b>Cần 💰🪵🪨💧🌾</b> để worker dồn qua, bật 🤖 auto-chi tiêu</li>
                <li><b>🌲🪨🌾</b> Worker đốn gỗ/đào đá/gặt lúa gánh về — ruộng tự mọc lại, rừng đá thì không</li>
                <li><b>💧 Nước</b>: worker gánh từ hồ về, quân uống mỗi giây — hết nước yếu 30%</li>
                <li><b>Worker</b> tự chiếm 💎 (+5 gần / +10 giữa / +20 trung tâm), gặp địch tự chạy</li>
                <li><b>Soldier</b> săn Worker địch · <b>Archer</b> rỉa Tank từ xa · <b>Tank</b> đi đầu chịu đòn</li>
                <li><b>Population 20</b>: Tank chiếm 3 slot — đừng spam</li>
                <li>Phá <b>🏰 Base địch (2000 HP)</b> để thắng · Sau <b>10 phút</b>: Sudden Death x2 gold + base mất máu</li>
                <li><b>Space</b> dừng · <b>⚡</b> tăng tốc · <b>Esc</b> menu · kéo chuột xem quân · lăn chuột zoom</li>
                <li>📱 <b>Điện thoại:</b> <b>chạm</b> map = xem lính · <b>kéo</b> 1 ngón = di map · <b>chụm</b> 2 ngón = zoom · nút <b>⌂</b> = về base</li>
              </ul>
              <div className="mt-3 rounded bg-zinc-800 p-2 text-zinc-400">
                Mở bài gợi ý: 👷👷 → ⚔️⚔️ giữ mỏ gần → 🏹 tranh giữa → 🛡️🛡️🏹🏹 push base.
              </div>
              <button className="mt-4 rounded bg-zinc-700 px-4 py-1 hover:bg-zinc-600" onClick={() => setShowHelp(false)}>Vào trận</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function collectHud(game: Game, ui: Interaction): HudState {
  const me = game.world.player(HUMAN);
  const hb = game.world.baseOf(HUMAN);
  const ab = game.world.baseOf(AI_PLAYER);
  const needs: string[] = [];
  // B5: cảnh báo nhu cầu — tướng nhìn là biết cần gì.
  if (hb) {
    const danger = game.world.queryRadius(hb.x, hb.y, 7 * 32).some(
      (e) => e.kind === "unit" && e.player !== HUMAN && e.player >= 0
    );
    if (danger) needs.push("🏰 Base bị đánh!");
  }
  if (me.water <= 0.5) needs.push("💧 Hết nước — quân yếu 30%!");
  else if (me.waterIncome < 0 && me.water < 25) needs.push("💧 Sắp hết nước!");
  if (me.ore < 50 && me.income < 8) needs.push("💰 Thiếu vàng!");
  if ((me.wood ?? 0) < 25) needs.push("🪵 Thiếu gỗ!");
  if ((me.stone ?? 0) < 25) needs.push("🪨 Thiếu đá!");
  if ((me.food ?? 0) < 20) needs.push("🌾 Thiếu lúa!");
  // Worker tự đi lấy khi kho cạn (dù tướng không bấm "Cần gì?").
  const sh = shortages(me);
  if (sh.wood && me.needs.wood < 2) needs.push("🤖 Worker tự đi đốn gỗ!");
  if (sh.stone && me.needs.stone < 2) needs.push("🤖 Worker tự đi lấy đá!");
  if (sh.water && me.needs.water < 2) needs.push("🤖 Worker tự đi lấy nước!");
  if (sh.food && (me.needs.food ?? 1) < 2) needs.push("🤖 Worker tự đi gặt lúa!");
  if (me.supplyUsed >= me.supplyCap) {
    const houses = finishedBuildings(game.world, HUMAN, "house").length;
    if (houses < MAX_HOUSES && (me.wood ?? 0) < 50) needs.push("🪵 Thiếu gỗ xây nhà!");
    else needs.push("👥 Pop đầy!");
  }
  for (const e of game.world.entities.values()) {
    if (e.kind === "building" && e.player === HUMAN && e.underConstruction) {
      needs.push(e.defId === "house" ? "🏠 Đang xây nhà…" : "🚜 Đang xây trang trại…");
      break;
    }
  }
  let kills = 0;
  for (const u of game.world.entities.values()) {
    if (u.kind === "unit" && u.player === HUMAN) kills += u.kills ?? 0;
  }
  return {
    gold: me.ore,
    income: Math.round(me.income),
    water: me.water,
    waterNet: me.waterIncome,
    wood: Math.floor(me.wood ?? 0),
    stone: Math.floor(me.stone ?? 0),
    food: Math.floor(me.food ?? 0),
    pop: me.supplyUsed,
    popCap: me.supplyCap,
    houses: finishedBuildings(game.world, HUMAN, "house").length,
    farms: finishedBuildings(game.world, HUMAN, "farm").length,
    phase: game.phase,
    time: game.world.time,
    suddenDeath: game.suddenDeath,
    paused: game.paused,
    speed: game.speed,
    blueBase: Math.max(0, Math.ceil(hb?.hp ?? 0)),
    blueMax: hb?.maxHp ?? 2000,
    redBase: Math.max(0, Math.ceil(ab?.hp ?? 0)),
    redMax: ab?.maxHp ?? 2000,
    ecoMil: me.ecoMil,
    defAtk: me.defAtk,
    focus: me.focus,
    autoSpend: me.autoSpend,
    kills,
    needs: { ...me.needs },
    warnings: needs,
    nodes: game.world.nodes().map((n) => ({
      name: n.defId,
      income: 0,
      owner: n.player,
    })),
  };
}

function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
