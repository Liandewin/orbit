// Screen-space UI: background, HUD, title, game over and snap callouts.
// Everything is drawn in world units (u) of the 540-wide column; y = 0 is
// the top of the screen and H is the view height in u.

import { drawCometTrail } from './comet';
import { glow, rgba } from './effects';
import { BlackHole, Planet, drawBlackHole } from './planet';
import {
  BG,
  BG_TOP,
  CYAN,
  DANGER,
  GOLD,
  MAGENTA,
  RAMP,
  STAR,
  TAU,
  TXT,
  TXT2,
  TXT3,
  circ,
  comboColor,
  display,
  label,
  measure,
  text,
} from './theme';

export const W = 540;
/** Safe-area allowance at the top for the HUD (u). */
export const TOP = 68;
/** Reference height the layouts were designed at. */
const REF_H = 1169;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Pt = { x: number; y: number };

// ---------------------------------------------------------------- background

export interface Star {
  x: number;
  y: number;
  size: number;
  alpha: number;
  rate: number;
  depth: number;
}

export function makeStars(n: number): Star[] {
  const out: Star[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      x: Math.random(),
      y: Math.random(),
      size: Math.random() < 0.85 ? 1.6 : 2.6,
      alpha: 0.15 + Math.random() * 0.45,
      rate: 1 + Math.random() * 3,
      depth: 0.05 + Math.random() * 0.3,
    });
  }
  return out;
}

export function drawBackground(ctx: CanvasRenderingContext2D, H: number, stars: readonly Star[], camY: number, t: number): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.55);
  g.addColorStop(0, BG_TOP);
  g.addColorStop(1, rgba(BG_TOP, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = STAR;
  for (const s of stars) {
    const y = (((s.y * H - camY * s.depth) % H) + H) % H;
    ctx.globalAlpha = s.alpha * (0.75 + 0.25 * Math.sin(t * s.rate + s.x * 40));
    ctx.fillRect(s.x * W, y, s.size, s.size);
  }
  ctx.globalAlpha = 1;
}

/** Edge-only vignette in a colour (replaces the old full-screen flash). */
export function drawVignette(ctx: CanvasRenderingContext2D, H: number, color: string, alpha: number): void {
  if (alpha <= 0) return;
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.62);
  g.addColorStop(0, rgba(color, 0));
  g.addColorStop(1, rgba(color, 1));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// ---------------------------------------------------------------- HUD

export interface HudState {
  score: number;
  combo: number;
  daily: boolean;
  date: string;
  t: number;
  flare: number; // 0..1 badge flare after a perfect
  dropCombo: number; // combo that was just lost (0 = none)
  dropAge: number; // seconds since it was lost
}

export function drawHud(ctx: CanvasRenderingContext2D, o: HudState): void {
  const g = ctx.createLinearGradient(0, 0, 0, TOP + 162);
  g.addColorStop(0, rgba(BG, 0.92));
  g.addColorStop(0.45, rgba(BG, 0.6));
  g.addColorStop(1, rgba(BG, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, TOP + 162);

  text(ctx, String(o.score), 32, TOP + 60, { font: display(60), color: TXT, align: 'left', stroke: BG, strokeW: 8 });

  if (o.daily) {
    const f = label(600, 16);
    const s = `DAILY · ${o.date}`;
    const tw = measure(ctx, s, f, 2);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(32, TOP + 76, tw + 22, 28, 14);
    ctx.fillStyle = rgba(CYAN, 0.08);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = rgba(CYAN, 0.5);
    ctx.stroke();
    ctx.restore();
    text(ctx, s, 43, TOP + 95, { font: f, color: CYAN, align: 'left', spacing: 2 });
  }

  // Combo badge: grows 40u → 64u across x1–x9, pulses at x8+, glows from x5.
  const cb = o.combo;
  const col = cb === 1 ? TXT3 : comboColor(cb);
  let sz = 40 + (cb - 1) * 3;
  if (cb >= 8) sz *= 1 + 0.05 * Math.sin(o.t * 14);
  const R = 508;
  const by = TOP + 60;
  if (cb >= 5 || o.flare > 0) glow(ctx, R - sz * 0.6, by - sz * 0.35, sz * 1.5, col, Math.max(0, cb - 4) * 0.08 + o.flare * 0.6);
  const nf = display(sz);
  const nw = measure(ctx, String(cb), nf);
  const halo = cb >= 5 ? { halo: col, haloW: 10, haloA: 0.2 } : {};
  text(ctx, String(cb), R, by, { font: nf, color: col, align: 'right', stroke: BG, strokeW: 8, ...halo });
  text(ctx, 'x', R - nw - 3, by, { font: display(sz * 0.6), color: col, align: 'right', stroke: BG, strokeW: 6, ...halo });
  for (let i = 0; i < 9; i++) {
    const h = 6 + i;
    ctx.fillStyle = i < cb ? col : rgba(TXT3, 0.45);
    ctx.fillRect(R - 86 + i * 10, TOP + 92 - h, 6, h);
  }

  // A lost combo drops away and fades.
  if (o.dropCombo > 1 && o.dropAge < 0.9) {
    const k = o.dropAge / 0.9;
    ctx.save();
    ctx.translate(470, TOP + 56 + k * 70);
    ctx.rotate(k * 0.5);
    text(ctx, `x${o.dropCombo}`, 0, 0, { font: display(52), color: comboColor(o.dropCombo), stroke: BG, strokeW: 6, alpha: 1 - k });
    ctx.restore();
  }
}

// ---------------------------------------------------------------- toggle

/** Draws the Daily run switch and returns its rect (u) for hit-testing. */
export function drawToggle(ctx: CanvasRenderingContext2D, cx: number, cy: number, on: boolean, date: string): Rect {
  const w = 320;
  const h = 68;
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 34);
  if (on) {
    ctx.fillStyle = rgba(CYAN, 0.08);
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = rgba(CYAN, 0.16);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = CYAN;
    ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,.03)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = TXT3;
    ctx.stroke();
  }
  const tx = x + w - 28 - 64;
  const ty = cy - 16;
  ctx.beginPath();
  ctx.roundRect(tx, ty, 64, 32, 16);
  if (on) {
    ctx.fillStyle = CYAN;
    ctx.fill();
    ctx.fillStyle = BG;
    circ(ctx, tx + 48, cy, 11);
    ctx.fill();
  } else {
    ctx.lineWidth = 2;
    ctx.strokeStyle = TXT3;
    ctx.stroke();
    ctx.fillStyle = TXT3;
    circ(ctx, tx + 16, cy, 10);
    ctx.fill();
  }
  ctx.restore();
  text(ctx, 'DAILY RUN', x + 34, cy - 3, { font: label(700, 20), color: on ? TXT : TXT2, align: 'left', spacing: 2 });
  text(ctx, on ? date : 'RANDOM SEED', x + 34, cy + 19, { font: label(600, 14), color: on ? CYAN : TXT3, align: 'left', spacing: 2 });
  return { x, y, w, h };
}

// ---------------------------------------------------------------- title

function drawLogo(ctx: CanvasRenderingContext2D, t: number, k: number): void {
  const cx = 270;
  const ey = 344 * k;
  const rx = 262;
  const ry = 34;
  const rot = -0.12;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const pos = (th: number): Pt => ({
    x: cx + rx * Math.cos(th) * cr - ry * Math.sin(th) * sr,
    y: ey + rx * Math.cos(th) * sr + ry * Math.sin(th) * cr,
  });
  const ring = (a0: number, a1: number, front: boolean): void => {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, ey, rx, ry, rot, a0, a1);
    if (front) {
      ctx.lineWidth = 12;
      ctx.strokeStyle = rgba(CYAN, 0.16);
      ctx.stroke();
    }
    ctx.lineWidth = front ? 3 : 2;
    ctx.strokeStyle = rgba(CYAN, front ? 0.95 : 0.3);
    ctx.stroke();
    ctx.restore();
  };
  const th = (t * 1.3) % TAU;
  const pts: Pt[] = [];
  for (let i = 0; i < 30; i++) pts.push(pos(th - i * 0.035));
  const front = Math.sin(th) > 0;

  ring(Math.PI, TAU, false);
  if (!front) drawCometTrail(ctx, pts, 3, t, RAMP[2]);
  const oy = ey + 12;
  const sy = ey + 133;
  text(ctx, 'ORBIT', cx, oy, { font: display(112), color: CYAN, halo: CYAN, haloW: 20, haloA: 0.2, maxWidth: 480 });
  text(ctx, 'SNAP', cx, sy, { font: display(124), halo: MAGENTA, haloW: 20, haloA: 0.22, noFill: true, maxWidth: 460 });
  text(ctx, 'SNAP', cx + 5, sy + 5, { font: display(124), color: rgba(CYAN, 0.75), maxWidth: 460 });
  text(ctx, 'SNAP', cx, sy, { font: display(124), color: MAGENTA, maxWidth: 460 });
  ring(0, Math.PI, true);
  if (front) drawCometTrail(ctx, pts, 3, t, RAMP[2]);
}

export interface TitleState {
  H: number;
  t: number;
  best: number;
  daily: boolean;
  date: string;
}

export function drawTitle(ctx: CanvasRenderingContext2D, o: TitleState): Rect {
  const { H, t } = o;
  const k = Math.min(1, H / REF_H);
  const g = ctx.createRadialGradient(270, 400 * k, 0, 270, 400 * k, 330);
  g.addColorStop(0, rgba(BG, 0.85));
  g.addColorStop(0.6, rgba(BG, 0.6));
  g.addColorStop(1, rgba(BG, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  drawLogo(ctx, t, k);
  text(ctx, o.daily ? 'DAILY BEST' : 'BEST', 270, 548 * k, { font: label(700, 16), color: o.daily ? CYAN : TXT2, spacing: 4 });
  text(ctx, String(o.best), 270, 548 * k + 44, { font: display(36), color: TXT, stroke: BG, strokeW: 8 });

  const ty = 958 * k;
  const pa = 0.55 + 0.45 * Math.abs(Math.sin(t * 2.4));
  const f = display(34);
  const tw = measure(ctx, 'TAP TO START', f, 1);
  text(ctx, 'TAP TO START', 270, ty, { font: f, color: TXT, spacing: 1, alpha: pa, stroke: BG, strokeW: 8 });
  const off = tw / 2 + 24 + 5 * Math.sin(t * 4);
  ctx.fillStyle = rgba(CYAN, pa);
  for (const d of [-1, 1]) {
    const x = 270 + d * off;
    ctx.beginPath();
    ctx.moveTo(x, ty - 12);
    ctx.lineTo(x + d * 10, ty - 20);
    ctx.lineTo(x + d * 10, ty - 4);
    ctx.closePath();
    ctx.fill();
  }
  text(ctx, 'Tap to let go · fly into the next ring', 270, ty + 42, { font: label(600, 20), color: TXT2 });
  return drawToggle(ctx, 270, 1072 * k, o.daily, o.date);
}

// ---------------------------------------------------------------- game over

export interface GameOverState {
  H: number;
  t: number;
  age: number; // seconds since death
  cause: string;
  score: number;
  best: number;
  newBest: boolean;
  seq: string; // 'P' perfect / 'S' sloppy per capture
  daily: boolean;
  date: string;
  canRetry: boolean;
  hole: BlackHole | null; // the killer, redrawn above the scrim
  exit: { x: number; y: number; trail: Pt[] } | null; // exit point in screen u
}

export function drawGameOver(ctx: CanvasRenderingContext2D, o: GameOverState, worldToScreen: (ctx: CanvasRenderingContext2D) => void): Rect {
  const { H, t } = o;
  const k = Math.min(1, H / REF_H);
  const fade = Math.min(1, o.age / 0.3);

  ctx.fillStyle = rgba(BG, 0.8 * fade);
  ctx.fillRect(0, 0, W, H);

  // The killer stays lit above the scrim.
  if (o.hole) {
    ctx.save();
    worldToScreen(ctx);
    drawBlackHole(ctx, o.hole, t);
    const p = (t * 0.9) % 1;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 3 * (1 - p);
    ctx.strokeStyle = rgba(DANGER, 1 - p);
    circ(ctx, o.hole.x, o.hole.y, o.hole.ringR + 10 + p * 60);
    ctx.stroke();
    ctx.restore();
  } else if (o.exit) {
    if (o.exit.trail.length > 1) drawCometTrail(ctx, o.exit.trail, 1, t, DANGER, false);
    glow(ctx, o.exit.x, o.exit.y, 90, DANGER, 0.5 + 0.15 * Math.sin(t * 5));
  }

  ctx.save();
  ctx.globalAlpha = fade;

  const cf = label(700, 24);
  const cw = measure(ctx, o.cause, cf, 5);
  text(ctx, o.cause, 272, 318 * k, { font: cf, color: DANGER, spacing: 5 });
  ctx.fillStyle = DANGER;
  ctx.fillRect(270 - cw / 2 - 62, 318 * k - 9, 48, 2);
  ctx.fillRect(270 + cw / 2 + 14, 318 * k - 9, 48, 2);

  text(ctx, String(o.score), 270, 470 * k, { font: display(128), color: TXT, halo: '#FFFFFF', haloW: 18, haloA: 0.07, maxWidth: 470 });
  const bestY = 470 * k + 60;
  if (o.newBest) {
    glow(ctx, 270, bestY - 10, 160, GOLD, 0.25);
    ctx.beginPath();
    ctx.roundRect(160, bestY - 34, 220, 48, 24);
    ctx.fillStyle = GOLD;
    ctx.fill();
    text(ctx, 'NEW BEST', 270, bestY, { font: display(24), color: BG });
  } else {
    text(ctx, `BEST ${o.best}`, 272, bestY, { font: label(700, 20), color: TXT2, spacing: 3 });
  }

  // Perfect pips: each one takes the colour of the combo that snap reached.
  const all = o.seq;
  const maxPips = 18;
  const seq = all.slice(-maxPips);
  let streak = 0;
  for (let i = 0; i < all.length - seq.length; i++) streak = all[i] === 'P' ? streak + 1 : 0;
  const n = seq.length;
  const sp = 24;
  const x0 = 270 - ((n - 1) * sp) / 2;
  const pipY = 606 * k;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * sp;
    if (seq[i] === 'P') {
      streak++;
      const c = RAMP[Math.min(8, streak)];
      glow(ctx, x, pipY, 16, c, 0.5);
      ctx.fillStyle = c;
      circ(ctx, x, pipY, 6.5);
      ctx.fill();
    } else {
      streak = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = TXT3;
      circ(ctx, x, pipY, 6);
      ctx.stroke();
    }
  }
  if (all.length > 0) {
    const perfects = [...all].filter((c) => c === 'P').length;
    const a = `${perfects}/${all.length}`;
    const b = ' PERFECT';
    const sf = label(700, 20);
    const wa = measure(ctx, a, sf, 3);
    const wb = measure(ctx, b, sf, 3);
    const sx = 270 - (wa + wb) / 2;
    text(ctx, a, sx, 652 * k, { font: sf, color: TXT, align: 'left', spacing: 3 });
    text(ctx, b, sx + wa, 652 * k, { font: sf, color: TXT2, align: 'left', spacing: 3 });
  }

  const Y = 860 * k;
  if (o.canRetry) {
    for (let j = 0; j < 2; j++) {
      const p = (t * 0.7 + j * 0.5) % 1;
      const w = 390 + p * 110;
      const h = 78 + p * 70;
      ctx.beginPath();
      ctx.roundRect(270 - w / 2, Y - h / 2, w, h, h / 2);
      ctx.lineWidth = 2.5 * (1 - p);
      ctx.strokeStyle = rgba('#FFFFFF', (1 - p) * 0.3);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = fade * (o.canRetry ? 1 : 0.35);
  ctx.beginPath();
  ctx.roundRect(75, Y - 39, 390, 78, 39);
  ctx.fillStyle = 'rgba(255,255,255,.07)';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = TXT;
  ctx.stroke();
  text(ctx, 'TAP TO RETRY', 270, Y + 12, { font: display(34), color: TXT, spacing: 1 });
  text(ctx, 'ANYWHERE', 272, Y + 70 * k, { font: label(600, 14), color: TXT3, spacing: 4 });
  ctx.globalAlpha = fade;
  const rect = drawToggle(ctx, 270, 1072 * k, o.daily, o.date);
  ctx.restore();
  return rect;
}

// ---------------------------------------------------------------- snap feedback (world space)

export interface Snap {
  perfect: boolean;
  age: number;
  planet: Planet;
  combo: number;
  pts: number;
  hx: number; // comet position at capture
  hy: number;
  angle: number; // capture angle around the planet
  dist: number; // capture distance from the planet centre
}

export const SNAP_LIFE = 1.4;

export function drawSnap(ctx: CanvasRenderingContext2D, s: Snap, alpha: number): void {
  const ph = s.age / SNAP_LIFE;
  if (ph >= 1) return;
  const cx = s.planet.ix(alpha);
  const cy = s.planet.iy(alpha);
  const R = s.planet.orbitR;
  const cl = (v: number): number => Math.max(0, Math.min(1, v));

  if (s.perfect) {
    const col = comboColor(s.combo);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Two shock rings: combo colour, then white 80 ms behind.
    for (const [delay, c, lw] of [
      [0, col, 12],
      [0.08, '#FFFFFF', 4],
    ] as const) {
      const p = cl((s.age - delay) / 0.55);
      if (p > 0 && p < 1) {
        const e = 1 - Math.pow(1 - p, 3);
        ctx.lineWidth = lw * (1 - p) + 0.5;
        ctx.strokeStyle = rgba(c, 1 - p);
        circ(ctx, cx, cy, R + e * 110);
        ctx.stroke();
      }
    }
    // 14 sparks from the snap point
    const sp = cl(s.age / 0.4);
    if (sp < 1) {
      const e = 1 - Math.pow(1 - sp, 2);
      ctx.lineCap = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = rgba(col, 1 - sp);
      for (let i = 0; i < 14; i++) {
        const a = (i * TAU) / 14 + 0.2;
        const d0 = 10 + e * 54;
        const d1 = d0 + 18 * (1 - sp);
        ctx.beginPath();
        ctx.moveTo(s.hx + Math.cos(a) * d0, s.hy + Math.sin(a) * d0);
        ctx.lineTo(s.hx + Math.cos(a) * d1, s.hy + Math.sin(a) * d1);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Callout: pops from 1.4x to 1x, fades out late.
    const sc = s.age < 0.12 ? 1.4 - (s.age / 0.12) * 0.4 : 1;
    const al = ph > 0.75 ? (1 - ph) / 0.25 : 1;
    const f1 = display(38);
    const f2 = display(60);
    const w1 = measure(ctx, 'PERFECT', f1);
    const w2 = measure(ctx, `x${s.combo}`, f2);
    const gap = 12;
    const tot = w1 + gap + w2;
    const X = Math.max(tot / 2 + 16, Math.min(W - tot / 2 - 16, cx));
    const Y = cy - R - 70;
    ctx.save();
    ctx.translate(X, Y);
    ctx.scale(sc, sc);
    glow(ctx, 0, -16, tot * 0.6, col, 0.25 * al);
    text(ctx, 'PERFECT', -tot / 2, 0, { font: f1, color: TXT, align: 'left', halo: col, haloW: 12, haloA: 0.25, stroke: BG, strokeW: 6, alpha: al });
    text(ctx, `x${s.combo}`, -tot / 2 + w1 + gap, 4, { font: f2, color: col, align: 'left', halo: col, haloW: 12, haloA: 0.25, stroke: BG, strokeW: 6, alpha: al });
    ctx.restore();
    if (s.pts > 0) text(ctx, `+${s.pts}`, X, cy - R - 16 - ph * 50, { font: display(30), color: col, stroke: BG, strokeW: 6, alpha: 1 - ph * ph });
    return;
  }

  // Sloppy: deliberately flat.
  const q = Math.min(1, ph / 0.5);
  if (q < 1) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(TXT2, 0.45 * (1 - q));
    circ(ctx, cx, cy, R + q * 30);
    ctx.stroke();
    // dotted correction line from the entry point to the ideal ring
    const ex = cx + Math.cos(s.angle) * s.dist;
    const ey = cy + Math.sin(s.angle) * s.dist;
    const rx = cx + Math.cos(s.angle) * R;
    const ry = cy + Math.sin(s.angle) * R;
    ctx.save();
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(TXT2, 0.7 * (1 - q));
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(rx, ry);
    ctx.stroke();
    ctx.restore();
  }
  const X = Math.max(70, Math.min(W - 70, cx));
  if (s.pts > 0) text(ctx, `+${s.pts}`, X, cy - R - 22 - ph * 36, { font: label(700, 26), color: TXT2, stroke: BG, strokeW: 6, alpha: 1 - ph * ph });
  if (s.combo > 1) text(ctx, 'COMBO LOST', X, cy - R + 8, { font: label(700, 16), color: TXT3, spacing: 3, stroke: BG, strokeW: 5, alpha: 1 - ph * ph });
}
