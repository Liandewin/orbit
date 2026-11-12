import { Sfx } from './audio';
import { Comet, drawCometTrail, type Capture } from './comet';
import { CONFIG } from './config';
import { Effects } from './effects';
import { BlackHole, drawBlackHole, drawPlanet, drawZone, type Planet, type PlanetState } from './planet';
import { clamp, dailySeed, lerp, randomSeed, todayKey } from './rng';
import { DANGER, SIDE_BARS, comboColor, label } from './theme';
import { SNAP_LIFE, drawBackground, drawGameOver, drawHud, drawSnap, drawTitle, drawVignette, makeStars, type Rect, type Snap, type Star } from './ui';
import { World } from './world';

type State = 'title' | 'playing' | 'dead';
type DeathCause = 'bounds' | 'hole' | 'lost';

const DEATH_TEXT: Record<DeathCause, string> = { bounds: 'DRIFTED AWAY', hole: 'BLACK HOLE', lost: 'LOST IN SPACE' };

const KEY_BEST = 'orbitsnap.best';
const KEY_DAILY_MODE = 'orbitsnap.dailyMode';
const dailyBestKey = (): string => `orbitsnap.best.daily.${todayKey()}`;

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / blocked storage */
  }
}

const inRect = (r: Rect | null, x: number, y: number): boolean => !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

interface Vignette {
  color: string;
  age: number;
  dur: number;
  peak: number;
}

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sfx = new Sfx();
  private readonly effects = new Effects();
  private readonly stars: Star[] = makeStars(150);

  // layout (CSS px)
  private cssW = 1;
  private cssH = 1;
  private dpr = 1;
  private colW = 1;
  private colX = 0;
  private scale = 1; // CSS px per world unit
  private viewH = 1; // view height in world units

  // run state
  private state: State = 'title';
  private stateTime = 0;
  private world!: World;
  private comet!: Comet;
  private camY = 0;
  private prevCamY = 0;
  private score = 0;
  private combo = 1;
  private best = 0;
  private newBest = false;
  private daily = storageGet(KEY_DAILY_MODE) === '1';
  private deathCause: DeathCause = 'bounds';
  private hitPause = 0;
  private tapQueued = false;
  private time = 0;
  private dailyBtn: Rect | null = null; // in u

  // feedback state
  private snaps: Snap[] = [];
  private vignette: Vignette | null = null;
  private badgeFlare = 0;
  private dropCombo = 0;
  private dropAge = 99;
  private seq = '';
  private killer: BlackHole | null = null;
  private deathX = 0;
  private deathY = 0;
  private deathTrail: { x: number; y: number }[] = [];

  // loop / debug
  private acc = 0;
  private lastT = 0;
  private fps = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private debug = new URLSearchParams(location.search).has('debug');
  private lastErr = NaN;
  private captures = 0;
  private perfects = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    this.resize();
    this.newRun();
    this.bindInput();
  }

  start(): void {
    requestAnimationFrame(this.frame);
  }

  // ---------------------------------------------------------------- setup

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.cssW = Math.max(1, r.width || window.innerWidth);
    this.cssH = Math.max(1, r.height || window.innerHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, CONFIG.view.maxDpr);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.colW = Math.min(this.cssW, this.cssH * CONFIG.view.maxAspect);
    this.colX = (this.cssW - this.colW) / 2;
    this.scale = this.colW / CONFIG.view.width;
    this.viewH = this.cssH / this.scale;
  }

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault();
        this.sfx.unlock();
        this.onTap(e.clientX, e.clientY);
      },
      { passive: false },
    );
    // Touch pointerdown isn't a "user activation" on iOS; these are.
    const unlock = (): void => this.sfx.unlock();
    c.addEventListener('pointerup', unlock);
    c.addEventListener('touchend', unlock);

    const block = (e: Event): void => e.preventDefault();
    document.addEventListener('touchstart', block, { passive: false });
    document.addEventListener('touchmove', block, { passive: false });
    document.addEventListener('dblclick', block, { passive: false });
    document.addEventListener('contextmenu', block);
    document.addEventListener('gesturestart', block as EventListener, { passive: false });
    document.addEventListener('selectstart', block);

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.key === 'd' || e.key === 'D') {
        this.debug = !this.debug;
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        this.sfx.unlock();
        this.onTap(-1, -1);
      }
    });

    const onResize = (): void => this.resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 150));
    window.visualViewport?.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      this.lastT = 0; // don't simulate the time we were hidden
    });
  }

  private newRun(): void {
    this.world = new World(this.daily ? dailySeed() : randomSeed());
    this.comet = new Comet(this.world.first);
    this.score = 0;
    this.combo = 1;
    this.world.score = 0;
    this.world.difficulty = 0;
    this.camY = this.prevCamY = this.world.first.y - this.viewH * CONFIG.view.cameraLead;
    this.world.ensureAhead(this.camY - this.viewH * CONFIG.world.spawnAhead);
    this.effects.clear();
    this.hitPause = 0;
    this.tapQueued = false;
    this.newBest = false;
    this.lastErr = NaN;
    this.captures = this.perfects = 0;
    this.snaps = [];
    this.vignette = null;
    this.badgeFlare = 0;
    this.dropCombo = 0;
    this.seq = '';
    this.killer = null;
    this.best = this.loadBest();
  }

  private loadBest(): number {
    const v = Number(storageGet(this.daily ? dailyBestKey() : KEY_BEST));
    return Number.isFinite(v) ? v : 0;
  }

  // ---------------------------------------------------------------- input

  private onTap(cssX: number, cssY: number): void {
    // tap position in column units
    const x = (cssX - this.colX) / this.scale;
    const y = cssY / this.scale;
    switch (this.state) {
      case 'title':
        if (inRect(this.dailyBtn, x, y)) {
          this.toggleDaily();
          this.newRun();
        } else {
          this.state = 'playing';
          this.stateTime = 0;
          this.sfx.ui();
        }
        break;
      case 'playing':
        this.tapQueued = true; // consumed on the next fixed step
        break;
      case 'dead':
        if (this.stateTime < CONFIG.feel.restartGuard) return;
        if (inRect(this.dailyBtn, x, y)) {
          this.toggleDaily();
          this.best = this.loadBest();
          this.newBest = false;
        } else {
          this.newRun();
          this.state = 'playing';
          this.stateTime = 0;
        }
        break;
    }
  }

  private toggleDaily(): void {
    this.daily = !this.daily;
    storageSet(KEY_DAILY_MODE, this.daily ? '1' : '0');
    this.sfx.ui();
  }

  // ---------------------------------------------------------------- loop

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    if (!this.lastT) this.lastT = now;
    const ft = Math.min((now - this.lastT) / 1000, CONFIG.sim.maxFrameTime);
    this.lastT = now;

    this.fpsFrames++;
    this.fpsTime += ft;
    if (this.fpsTime >= 0.5) {
      this.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }

    const dt = 1 / CONFIG.sim.hz;
    this.acc += ft;
    while (this.acc >= dt) {
      this.step(dt);
      this.acc -= dt;
    }
    this.render(this.acc / dt);
  };

  private snapshot(): void {
    this.prevCamY = this.camY;
    this.comet.snapshot();
    for (const p of this.world.planets) p.snapshot();
  }

  private updateFeedback(dt: number): void {
    this.effects.update(dt);
    for (const s of this.snaps) s.age += dt;
    this.snaps = this.snaps.filter((s) => s.age < SNAP_LIFE);
    if (this.vignette) {
      this.vignette.age += dt;
      if (this.vignette.age >= this.vignette.dur) this.vignette = null;
    }
    this.badgeFlare = Math.max(0, this.badgeFlare - dt / 0.45);
    this.dropAge += dt;
  }

  private step(dt: number): void {
    this.time += dt;
    this.stateTime += dt;
    this.updateFeedback(dt);

    if (this.hitPause > 0) {
      // Freeze the world (taps stay queued) but keep interpolation stable.
      this.hitPause -= dt;
      this.snapshot();
      return;
    }

    this.prevCamY = this.camY;
    this.comet.snapshot();
    this.world.update(dt); // snapshots + moves planets

    const comet = this.comet;
    if (this.state === 'playing' && comet.alive) {
      if (this.tapQueued) {
        this.tapQueued = false;
        if (comet.release()) this.onRelease();
      }
      const cap = comet.update(dt, this.world.planets);
      if (cap) this.onCapture(cap);
      else if (comet.mode === 'fly') this.checkDeath();
    } else if (this.state === 'title') {
      comet.update(dt, this.world.planets);
    }

    if (this.state !== 'dead') this.updateCamera(dt);

    this.world.difficulty = clamp(this.score / CONFIG.world.difficultyMaxScore, 0, 1);
    this.world.score = this.score;
    this.world.ensureAhead(this.camY - this.viewH * CONFIG.world.spawnAhead);
    this.world.cull(this.camY + this.viewH, comet.planet);
  }

  private updateCamera(dt: number): void {
    const c = this.comet;
    const orbiting = c.mode === 'orbit' && c.planet;
    const focusY = orbiting ? c.planet!.y : c.y;
    const target = focusY - this.viewH * CONFIG.view.cameraLead;
    const k = orbiting ? CONFIG.view.cameraFollowOrbit : CONFIG.view.cameraFollowFly;
    const next = this.camY + (target - this.camY) * (1 - Math.exp(-k * dt));
    if (next < this.camY) this.camY = next; // camera only ever scrolls up
  }

  private checkDeath(): void {
    const c = this.comet;
    const m = CONFIG.comet.boundsMargin;
    for (const h of this.world.holes) {
      if (Math.hypot(c.x - h.x, c.y - h.y) < h.killR + CONFIG.comet.radius) {
        this.killer = h;
        return this.die('hole');
      }
    }
    if (c.x < -m || c.x > CONFIG.view.width + m || c.y > this.camY + this.viewH + m || c.y < this.camY - m) return this.die('bounds');
    if (c.flightTime > CONFIG.comet.maxFlightTime) return this.die('lost');
  }

  // ---------------------------------------------------------------- events

  private onRelease(): void {
    const c = this.comet;
    this.sfx.release();
    this.effects.puff(c.x, c.y, -c.vx / c.speed, -c.vy / c.speed, comboColor(this.combo), 8);
  }

  private onCapture({ planet, impact }: Capture): void {
    const S = CONFIG.snap;
    const F = CONFIG.feel;
    const fx = this.effects;
    const err = Math.abs(impact - planet.orbitR) / planet.orbitR;
    const perfect = err <= S.perfectTolerance;
    this.lastErr = err;
    this.captures++;
    this.seq += perfect ? 'P' : 'S';

    const c = this.comet;
    c.speed = Math.min(CONFIG.comet.maxSpeed, c.speed + CONFIG.comet.speedPerCapture);
    planet.pulse = 1;
    const firstVisit = !planet.visited;
    planet.visited = true;
    const angle = Math.atan2(c.y - planet.y, c.x - planet.x);
    const dist = Math.hypot(c.x - planet.x, c.y - planet.y);

    let points: number;
    const prevCombo = this.combo;
    if (perfect) {
      this.perfects++;
      this.combo = Math.min(S.maxCombo, this.combo + 1);
      points = (S.basePoints + S.perfectBonus) * this.combo;
      this.hitPause = F.hitPausePerfect;
      fx.shake(F.shakePerfect);
      planet.flash = 1;
      this.badgeFlare = 1;
      this.vignette = { color: comboColor(this.combo), age: 0, dur: 0.2, peak: 0.5 };
    } else {
      this.combo = 1;
      points = S.basePoints;
      fx.shake(F.shakeCapture);
      fx.burst(c.x, c.y, planet.color, F.particlesCapture, 40, 180, 4, 0.5);
      if (prevCombo > 1) {
        this.dropCombo = prevCombo;
        this.dropAge = 0;
      }
    }
    // Re-capturing the planet you just came from is allowed but worth nothing.
    if (!firstVisit) points = 0;
    this.score += points;
    this.snaps = this.snaps.filter((s) => s.planet !== planet);
    this.snaps.push({ perfect, age: 0, planet, combo: perfect ? this.combo : prevCombo, pts: points, hx: c.x, hy: c.y, angle, dist });
    this.sfx.capture(this.combo, perfect);
  }

  private die(cause: DeathCause): void {
    const c = this.comet;
    const F = CONFIG.feel;
    c.alive = false;
    this.deathCause = cause;
    this.state = 'dead';
    this.stateTime = 0;
    this.hitPause = F.hitPauseDeath;
    this.tapQueued = false;
    this.deathX = clamp(c.x, 0, CONFIG.view.width);
    this.deathY = clamp(c.y, this.camY, this.camY + this.viewH);
    this.deathTrail = [...c.trail].reverse();
    this.effects.burst(this.deathX, this.deathY, comboColor(this.combo), F.particlesDeath, 60, 420, 5, 0.9);
    this.effects.burst(this.deathX, this.deathY, '#ffffff', 20, 30, 200, 3, 0.5);
    this.effects.shake(F.shakeDeath);
    this.vignette = { color: DANGER, age: 0, dur: 0.45, peak: F.flashDeath };
    this.sfx.death();
    if (this.score > this.best) {
      this.best = this.score;
      this.newBest = true;
      storageSet(this.daily ? dailyBestKey() : KEY_BEST, String(this.score));
    }
  }

  // ---------------------------------------------------------------- render

  /** Transform for UI drawing: column units, y = 0 at the top of the screen. */
  private uiTransform(): void {
    const s = this.dpr * this.scale;
    this.ctx.setTransform(s, 0, 0, s, this.dpr * this.colX, 0);
  }

  /** Transform for world drawing, with camera and screen shake. */
  private worldTransform(camY: number, shake = true): void {
    const s = this.dpr * this.scale;
    const fx = this.effects;
    const sx = shake ? fx.shakeX : 0;
    const sy = shake ? fx.shakeY : 0;
    this.ctx.setTransform(s, 0, 0, s, this.dpr * (this.colX + sx), this.dpr * (sy - this.scale * camY));
  }

  private planetState(p: Planet): PlanetState {
    if (p === this.comet.planet) return 'current';
    return p.visited ? 'passed' : 'next';
  }

  private render(alpha: number): void {
    const ctx = this.ctx;
    const { dpr, cssW, cssH, colW, colX } = this;
    const H = this.viewH;
    const t = this.time;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = SIDE_BARS;
    ctx.fillRect(0, 0, cssW, cssH);

    ctx.save();
    ctx.beginPath();
    ctx.rect(colX, 0, colW, cssH);
    ctx.clip();

    const camY = lerp(this.prevCamY, this.camY, alpha);
    this.uiTransform();
    drawBackground(ctx, H, this.stars, camY, t);

    // World: zones → black holes → rings & bodies → trail & comet → fx
    this.worldTransform(camY);
    const planets = this.world.planets;
    for (const p of planets) drawZone(ctx, p, p.ix(alpha), p.iy(alpha), this.planetState(p), t);
    for (const h of this.world.holes) drawBlackHole(ctx, h, h.spin);
    for (const p of planets) drawPlanet(ctx, p, p.ix(alpha), p.iy(alpha), this.planetState(p), t);
    if (this.comet.alive) this.drawComet(alpha);
    this.effects.drawWorld(ctx, label(700, 20));
    for (const s of this.snaps) drawSnap(ctx, s, alpha);
    if (this.debug) this.drawDebugWorld(alpha);

    // Screen-space overlays
    this.uiTransform();
    const v = this.vignette;
    if (v) drawVignette(ctx, H, v.color, v.peak * (1 - v.age / v.dur));

    const date = todayKey();
    if (this.state === 'playing') {
      this.dailyBtn = null;
      drawHud(ctx, { score: this.score, combo: this.combo, daily: this.daily, date, t, flare: this.badgeFlare, dropCombo: this.dropCombo, dropAge: this.dropAge });
    } else if (this.state === 'title') {
      this.dailyBtn = drawTitle(ctx, { H, t, best: this.best, daily: this.daily, date });
    } else {
      const exit = this.killer
        ? null
        : { x: this.deathX, y: this.deathY - camY, trail: this.deathTrail.map((p) => ({ x: p.x, y: p.y - camY })) };
      this.dailyBtn = drawGameOver(
        ctx,
        {
          H,
          t,
          age: this.stateTime,
          cause: DEATH_TEXT[this.deathCause],
          score: this.score,
          best: this.best,
          newBest: this.newBest,
          seq: this.seq,
          daily: this.daily,
          date,
          canRetry: this.stateTime >= CONFIG.feel.restartGuard,
          hole: this.killer,
          exit,
        },
        () => this.worldTransform(camY, false),
      );
    }
    ctx.restore();

    if (colX > 1) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = 'rgba(62,232,255,0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(colX - 0.5, -1, colW + 1, cssH + 2);
    }
    if (this.debug) this.drawDebugHud();
  }

  private drawComet(alpha: number): void {
    const c = this.comet;
    const pts = [{ x: lerp(c.prevX, c.x, alpha), y: lerp(c.prevY, c.y, alpha) }];
    for (let i = c.trail.length - 2; i >= 0; i--) pts.push(c.trail[i]);
    drawCometTrail(this.ctx, pts, this.combo, this.time, comboColor(this.combo));
  }

  private drawDebugWorld(alpha: number): void {
    const ctx = this.ctx;
    const tol = CONFIG.snap.perfectTolerance;
    ctx.lineWidth = 1;
    for (const p of this.world.planets) {
      const x = p.ix(alpha);
      const y = p.iy(alpha);
      ctx.strokeStyle = 'rgba(255,255,0,0.6)';
      ctx.beginPath();
      ctx.arc(x, y, p.captureR, 0, Math.PI * 2);
      ctx.stroke();
      // perfect band: impact parameter within orbitR*(1±tol)
      ctx.fillStyle = 'rgba(0,255,120,0.18)';
      ctx.beginPath();
      ctx.arc(x, y, p.orbitR * (1 + tol), 0, Math.PI * 2);
      ctx.arc(x, y, p.orbitR * (1 - tol), 0, Math.PI * 2, true);
      ctx.fill();
    }
    for (const h of this.world.holes) {
      ctx.strokeStyle = 'rgba(255,0,0,0.8)';
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.killR + CONFIG.comet.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    const c = this.comet;
    if (c.alive) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(c.x + (c.vx / c.speed) * 900, c.y + (c.vy / c.speed) * 900);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const m = CONFIG.comet.boundsMargin;
    ctx.strokeStyle = 'rgba(255,60,60,0.5)';
    ctx.strokeRect(-m, this.camY - m, CONFIG.view.width + 2 * m, this.viewH + 2 * m);
  }

  private drawDebugHud(): void {
    const c = this.comet;
    const omega = c.planet ? c.speed / c.orbitR : 0;
    const lines = [
      `fps ${this.fps.toFixed(0)}  dpr ${this.dpr.toFixed(2)}  sim ${CONFIG.sim.hz}Hz`,
      `state ${this.state}  mode ${c.mode}`,
      `speed ${c.speed.toFixed(0)}  ω ${omega.toFixed(2)} rad/s`,
      `combo x${this.combo}  score ${this.score}`,
      `difficulty ${this.world.difficulty.toFixed(2)}`,
      `last err ${Number.isNaN(this.lastErr) ? '-' : (this.lastErr * 100).toFixed(1) + '%'}  (perfect ≤ ${(CONFIG.snap.perfectTolerance * 100).toFixed(0)}%)`,
      `planets ${this.world.planets.length}  holes ${this.world.holes.length}  particles ${this.effects.particles.length}`,
      `capR ${c.planet ? c.planet.captureR.toFixed(0) : '-'}  orbitR ${c.planet ? c.planet.orbitR.toFixed(0) : '-'}  flight ${c.flightTime.toFixed(2)}s`,
      `seed ${this.world.seed}${this.daily ? ' (daily)' : ''}  captures ${this.captures}  perfect ${this.perfects}`,
    ];
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(4, 4, 360, lines.length * 15 + 8);
    ctx.font = `12px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#9dff4f';
    lines.forEach((l, i) => ctx.fillText(l, 10, 9 + i * 15));
  }
}

