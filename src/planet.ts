import { CONFIG } from './config';
import { glow, rgba } from './effects';
import { lerp } from './rng';
import { ACCRETION, BG, DANGER, circ } from './theme';

export { PLANET_COLORS } from './theme';

export interface Motion {
  amp: number;
  freq: number;
  phase: number;
}

/** next = still ahead (brightest ring), current = orbiting, passed = already visited. */
export type PlanetState = 'next' | 'current' | 'passed';

export const orbitRadiusFor = (radius: number): number => radius * CONFIG.planet.orbitFactor + CONFIG.planet.orbitPadding;

export class Planet {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  readonly baseX: number;
  readonly radius: number;
  readonly orbitR: number;
  readonly captureR: number;
  readonly color: string;
  readonly motion: Motion | null;
  time = 0;
  pulse = 0; // 0..1, glow flare on capture
  flash = 0; // 0..1, white ring flash on a perfect snap
  visited = false;

  constructor(x: number, y: number, radius: number, color: string, motion: Motion | null = null) {
    this.baseX = x;
    this.y = this.prevY = y;
    this.radius = radius;
    this.orbitR = orbitRadiusFor(radius);
    this.captureR = this.orbitR * CONFIG.planet.captureFactor;
    this.color = color;
    this.motion = motion;
    this.x = this.prevX = motion ? x + motion.amp * Math.sin(motion.phase) : x;
  }

  get amp(): number {
    return this.motion ? this.motion.amp : 0;
  }

  /** Sign of the current horizontal drift (0 if static). */
  get driftDir(): number {
    const m = this.motion;
    return m ? Math.sign(Math.cos(this.time * m.freq + m.phase)) || 1 : 0;
  }

  snapshot(): void {
    this.prevX = this.x;
    this.prevY = this.y;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.motion) this.x = this.baseX + this.motion.amp * Math.sin(this.time * this.motion.freq + this.motion.phase);
    this.pulse = Math.max(0, this.pulse - dt * 2.5);
    this.flash = Math.max(0, this.flash - dt / 0.12);
  }

  ix(alpha: number): number {
    return lerp(this.prevX, this.x, alpha);
  }
  iy(alpha: number): number {
    return lerp(this.prevY, this.y, alpha);
  }
}

export class BlackHole {
  spin = 0;
  readonly killR: number;
  /** Radius of the red warning ring (visual only). */
  readonly ringR: number;
  constructor(
    readonly x: number,
    readonly y: number,
    readonly radius: number,
  ) {
    this.killR = radius;
    this.ringR = radius * 2.75;
  }
  update(dt: number): void {
    this.spin += dt;
  }
}

/** Capture zone: a faint dashed outline, never filled, so zones can overlap cleanly. */
export function drawZone(ctx: CanvasRenderingContext2D, p: Planet, x: number, y: number, state: PlanetState, t: number): void {
  const a = state === 'passed' ? 0.08 : state === 'current' ? 0.12 : 0.22;
  ctx.save();
  ctx.setLineDash([2, 9]);
  ctx.lineDashOffset = -t * 8;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = rgba(p.color, a);
  circ(ctx, x, y, p.captureR);
  ctx.stroke();
  ctx.restore();
}

export function drawPlanet(ctx: CanvasRenderingContext2D, p: Planet, x: number, y: number, state: PlanetState, t: number): void {
  const c = p.color;
  const dim = state === 'passed';
  const m = dim ? 0.35 : 1;
  ctx.save();

  // Orbit ring
  if (state === 'current') {
    ctx.setLineDash([5, 9]);
    ctx.lineDashOffset = t * 14;
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(c, 0.45);
    circ(ctx, x, y, p.orbitR);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (dim) {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = rgba(c, 0.22);
    circ(ctx, x, y, p.orbitR);
    ctx.stroke();
  } else {
    const dir = p.driftDir;
    if (dir) {
      // ghost rims trailing the drift
      for (const k of [1, 2]) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = rgba(c, k === 1 ? 0.22 : 0.1);
        circ(ctx, x - dir * 12 * k, y, p.orbitR);
        ctx.stroke();
      }
    }
    ctx.lineWidth = 10;
    ctx.strokeStyle = rgba(c, 0.14);
    circ(ctx, x, y, p.orbitR);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = c;
    circ(ctx, x, y, p.orbitR);
    ctx.stroke();
  }
  if (p.flash > 0) {
    ctx.lineWidth = 5;
    ctx.strokeStyle = rgba('#FFFFFF', p.flash);
    circ(ctx, x, y, p.orbitR);
    ctx.stroke();
  }

  glow(ctx, x, y, p.radius * (2.6 + p.pulse * 1.5), c, (dim ? 0.12 : 0.4) + p.pulse * 0.4);

  // Body
  ctx.fillStyle = BG;
  circ(ctx, x, y, p.radius);
  ctx.fill();
  const g = ctx.createRadialGradient(x - p.radius * 0.35, y - p.radius * 0.4, 0, x, y, p.radius);
  g.addColorStop(0, rgba(c, 0.55 * m));
  g.addColorStop(0.6, rgba(c, 0.2 * m));
  g.addColorStop(1, rgba(c, 0.08 * m));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = rgba(c, dim ? 0.35 : 1);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1, p.radius - 7), Math.PI * 1.08, Math.PI * 1.42);
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba('#FFFFFF', 0.35 * m);
  ctx.stroke();

  // Drift chevrons
  const dir = p.driftDir;
  if (dir && !dim) {
    for (const k of [0, 1]) {
      const cx = x + dir * (p.orbitR + 16 + k * 12);
      ctx.beginPath();
      ctx.moveTo(cx - dir * 5, y - 7);
      ctx.lineTo(cx + dir * 2, y);
      ctx.lineTo(cx - dir * 5, y + 7);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = rgba(c, k ? 0.4 : 0.85);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Black hole: a void that eats the starfield, red dashes and inward ticks. */
export function drawBlackHole(ctx: CanvasRenderingContext2D, h: BlackHole, t: number): void {
  const { x, y } = h;
  const r = h.radius;
  const R = h.ringR;
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 0, x, y, R * 1.9);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.5, 'rgba(0,0,0,.92)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  circ(ctx, x, y, R * 1.9);
  ctx.fill();
  glow(ctx, x, y, R * 1.7, DANGER, 0.3);

  ctx.lineWidth = 10;
  ctx.strokeStyle = rgba(DANGER, 0.12);
  circ(ctx, x, y, R);
  ctx.stroke();
  ctx.setLineDash([9, 6]);
  ctx.lineDashOffset = -t * 30;
  ctx.lineWidth = 3;
  ctx.strokeStyle = DANGER;
  circ(ctx, x, y, R);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const a = t * 3 + i * 2.094;
    ctx.beginPath();
    ctx.arc(x, y, r + 8, a, a + 1.2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = rgba(i % 2 ? ACCRETION : DANGER, 0.9);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  circ(ctx, x, y, r);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba(DANGER, 0.9);
  ctx.stroke();

  ctx.fillStyle = DANGER;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 - t * 0.4;
    const rr = R + 16;
    ctx.save();
    ctx.translate(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(5, -6);
    ctx.lineTo(5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
