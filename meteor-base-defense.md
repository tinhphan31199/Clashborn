# 🎮 METEOR BASE DEFENSE

> A nostalgic callback to classic arcade cabinets featuring crisp, 8-bit vector graphics. Take control of a ground-based laser cannon to blast massive incoming meteors out of the dark starry sky, carefully managing the chaos as they split into smaller, faster fragments threatening your base.

## 1. Key Game Details

| Category | Content |
|----------|---------|
| 🎮 **Game Title** | Meteor Base Defense |
| 📝 **Game Description** | Control a ground-based laser cannon and blast giant meteors from the dark starry sky. Large meteors split into smaller, faster fragments — defend your base at all costs. |
| 🕹️ **Genre** | Arcade / Target Shooter (Base Defense) |
| 👥 **Gameplay Mode** | Single-Player |
| 🧬 **Visual Asset Style** | Retro 8-Bit Vector — crisp 8-bit vector graphics on a dark space backdrop with stars |
| 📱 **Device Compatibility** | Web-based, optimized for Mobile and PC |

## 2. Core Mechanics

1. **Aim & Fire Laser:**
   - Fixed ground-based laser cannon, barrel rotates toward the crosshair.
   - Instant hitscan laser beam with flash effect + light screen shake.
   - Limited fire rate (~4 shots/second) to prevent spam.

2. **Meteors of Varying Sizes:**
   - **Large (L):** Slow, high HP (3 hits), splits into 2-3 Medium fragments.
   - **Medium (M):** Medium speed, 2 hits, splits into 2-3 Small fragments.
   - **Small (S):** Fast, 1 hit, does not split further.
   - Smaller = faster = more dangerous near the ground.

3. **Split System (Core Strategy):**
   - Shooting a large meteor too low scatters fragments everywhere, hard to clean up.
   - Shooting early, high in the sky gives time to clear child fragments.
   - Players must prioritize: which target to shoot first, which to let fall.

4. **Base HP / Impact:**
   - Each meteor hitting the ground = 1 impact.
   - Pixel explosion effect, burning crater lasts a few seconds.

## 3. Movement & Controls

| Platform | Controls |
|----------|----------|
| 🖥️ **PC** | Crosshair follows the mouse cursor's real-time position. Left-click / Space to fire. |
| 📱 **Mobile** | Tap the screen to position the crosshair and shoot at the tap point. Multi-touch supported (2-finger tap = 2 rapid shots). |

- Crosshair is a neon arcade reticle with a snap animation on fire.
- Cannon barrel smoothly rotates (lerp) toward the crosshair.

## 4. Win / Loss Condition

- ✅ **Win Condition:** Destroy **100 meteors** (including Small fragments).
- ❌ **Loss Condition:** Let **5 meteors impact the ground**.
- HUD shows: `Destroyed: X/100` and `Base Integrity: ❤❤❤❤❤` (lose 1 heart per impact).

## 5. Game Loop

```
START → Sparse meteors → Shoot / Manage splits → Combo builds → Waves get harder
→ Reach 100 kills = VICTORY / 5 impacts = GAME OVER → Score + Restart
```

## 6. Scoring & Difficulty Scaling

- **Score:** Large = 20, Medium = 50, Small = 100 (harder = more points).
- **Combo:** Consecutive hits without missing multiply x2, x3... Missing resets combo.
- **Wave scaling by kill count:**
  - 0-20: 1-2 meteors at once, slow speed.
  - 21-50: 3-4 at once, plus direct-falling Mediums.
  - 51-80: 5+ at once, fast Smalls appear early.
  - 81-100: Meteor shower — intense, requires target prioritization.

## 7. Visual Design — Retro 8-Bit Vector

- **Background:** Deep black sky, 2-frame blinking stars, distant wireframe planet + mountain silhouette.
- **Meteor:** White/orange/red vector polygons by size, rotating while falling, pixel fire trail.
- **Laser:** Green/cyan neon beam, muzzle flash.
- **Base:** Cannon platform + energy dome, shakes on impact.
- **Explosion:** Square 8-bit particles, 3-frame white flash.
- Font: Press Start 2P / VT323. Scanline + CRT vignette overlay.

## 8. Audio (8-bit Chiptune)

- Fire: short square-wave `pew`.
- Large explosion: low noise burst. Small explosion: high blip.
- Impact: bass boom + alarm siren.
- BGM: 140 BPM chiptune loop, intensifies per wave.
- Victory: arcade fanfare. Game Over: descending tone.

## 9. UI / HUD / Screens

1. **Title Screen:** Neon METEOR BASE DEFENSE logo, `TAP / CLICK TO START`, high-score, 3-line how-to-play.
2. **HUD:** Top-left `SCORE`, top-center `DESTROYED X/100` progress bar, top-right `IMPACTS 5 slots`.
3. **Pause:** P key / pause button on mobile.
4. **Game Over:** Score, best, accuracy %, RETRY button.
5. **Victory:** YOU SAVED THE BASE!, stats + rank (C/B/A/S).

## 10. Technical (Web Mobile + PC)

- Engine: HTML5 Canvas (or Phaser) — 60fps, fixed timestep.
- Responsive: Full-screen canvas, DPR scaling, touch-action none.
- No server needed — offline single-player, best-score in localStorage.
- Performance: Object pooling for meteors/particles/lasers, < 150 entities cap.

## 11. Future Expansions (Optional)

- Rare power-up drops from meteors: Shield (blocks 1 impact), Rapid-fire 5s, Screen-clearing Bomb.
- Boss meteor every 25 kills.
- Day/night + cannon skins.

---
*Team: 1 dev + AI art. Scope: hyper-casual arcade, 1 arena with infinite difficulty scaling, win at 100 kills.*
