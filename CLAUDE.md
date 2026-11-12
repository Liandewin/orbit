# Orbit Snap

Mobile-first one-tap arcade game. The player is a comet that orbits planets. A tap releases it on the orbit's tangent, and it snaps into orbit around the next planet whose capture zone it flies into. This is a **game-feel prototype**: tuning and juice matter more than features.

## Stack and commands

- Vite + TypeScript, **Bun** as package manager, plain **Canvas 2D** (no engine, no framework, no backend).
- `bun install`: install deps.
- `bun run dev`: dev server, exposed on the LAN (`vite --host`, port 5173) for phone testing.
- `bun run build`: `tsc --noEmit` + `vite build` (the main check; there are no tests).
- `bun run typecheck`: types only.

To test on a phone, open the printed `Network:` URL on the same Wi-Fi. On macOS, allow incoming connections for node/bun if the firewall asks. Guest/public Wi-Fi often blocks device-to-device traffic, so a phone hotspot works as a fallback.

## Architecture (`src/`)

| File | Role |
|---|---|
| `main.ts` | Entry: loads fonts, creates `Game`. In dev, exposes `window.game` for console poking. |
| `game.ts` | State machine (`title` → `playing` → `dead`), fixed-timestep loop, input, scoring, camera, render orchestration, debug overlay. |
| `world.ts` | Seeded procedural generation of planets and black holes above the camera, culling below. Difficulty ramps with score. |
| `comet.ts` | Comet physics (orbit / fly / capture) plus `drawCometTrail`. |
| `planet.ts` | `Planet`, `BlackHole`, and their draw functions (`drawZone`, `drawPlanet`, `drawBlackHole`). |
| `ui.ts` | Screen-space UI: background and stars, HUD, title, game over, Daily toggle, perfect/sloppy snap feedback, vignette. |
| `theme.ts` | Design tokens (palette, combo colour `RAMP`, fonts) and text helpers (`text`, `measure`, `circ`). |
| `effects.ts` | Particles, screen shake, cached glow sprites (`glow`, `drawGlow`, `rgba`). |
| `audio.ts` | Web Audio synth SFX (no audio files). Unlocked on first tap. |
| `rng.ts` | `mulberry32` seeded RNG, daily seed from the local date, `lerp` / `clamp`. |
| `config.ts` | **All gameplay tunables.** Change feel here, not in code. |

## Key concepts and invariants

- **Units:** everything is in world units (u) of a fixed **540-wide** play column, scaled to the screen width. Y points down, and the camera scrolls up (`camY` only ever decreases). UI is drawn in the same units with y = 0 at the top of the screen (`uiTransform`). World drawing uses `worldTransform(camY)`.
- **Fixed timestep:** physics runs at 120 Hz (`CONFIG.sim.hz`). Rendering interpolates between `prev*` and current positions. Any moving object needs `snapshot()` each step, and hit-pause snapshots everything so frozen frames don't jitter.
- **Capture and PERFECT:** inside a capture zone (2× orbit radius) the comet keeps flying straight until closest approach, then wraps into orbit. A snap is graded by the **impact parameter** (closest distance of the flight line to the planet centre): it is PERFECT when that distance is within `orbitR × (1 ± snap.perfectTolerance)`.
- **Taps** during play are queued and consumed at the next fixed step. Death has a `restartGuard` before a tap restarts. The only tappable control is the Daily Run toggle (`dailyBtn`, a rect in u). Restart must stay a single tap anywhere.
- **Persistence:** best score lives in `localStorage` (`orbitsnap.best`, plus `orbitsnap.best.daily.<YYYY-MM-DD>` for daily runs). Every access is wrapped in try/catch.
- **Death causes:** off-screen (`bounds`), black hole core (`hole`, kill radius is the core only, the red ring is a warning), and flight longer than `maxFlightTime` (`lost`).

## Visual design rules

The look comes from a Claude Design file ("Orbit Snap Visual Upgrade"). `design-brief/` holds the original brief and screenshots.

- Fonts: **Bungee** for numbers and shouts, **Chakra Petch** for labels and stats (Google Fonts, linked in `index.html`).
- **No `shadowBlur` and no filters.** Fake glow with cached radial sprites (`glow()`) and wide low-alpha "halo" strokes. Performance on mid-range phones matters.
- Colours come only from `theme.ts`. Red (`DANGER`) is reserved for death and black holes. The combo `RAMP` (x1–x9) drives the trail, HUD badge, PERFECT callout and shock rings.
- Planet states: `next` (brightest solid orbit ring), `current` (dashed track), `passed` (dimmed ×0.35). Capture zones are dashed outlines, never filled.
- Draw order: background → stars → zones → black holes → rings and bodies → trail and comet → fx → HUD scrim → HUD text.

## Debugging and tuning

- Press **D** (or add `?debug` to the URL on a phone) for the overlay: FPS, speed, combo, last snap error %, capture radii, the perfect band and the flight line.
- In dev, `window.game.step(1/120)` advances the simulation by hand, which is useful for scripted bot playtests in the browser console.
- Snap feels too easy or hard? Adjust these first:
  1. `snap.perfectTolerance` (0.25)
  2. `comet.baseSpeed` / `speedPerCapture` / `maxSpeed`
  3. `planet.orbitFactor` / `orbitPadding`
  4. `world.gapEasy` / `gapHard`
  5. `world.difficultyMaxScore`

## Conventions

- Strict TypeScript with `noUnusedLocals` and `noUnusedParameters`. Keep `bun run build` clean.
- Keep tunables in `config.ts` and colours/fonts in `theme.ts`, never hard-coded in game logic.
- Input: `pointerdown` only. Scrolling, zooming, double-tap zoom and the context menu are blocked, so keep it that way.
