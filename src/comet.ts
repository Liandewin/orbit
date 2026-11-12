import { CONFIG } from './config';
import { glow, rgba } from './effects';
import { mulberry32 } from './rng';
import type { Planet } from './planet';

export interface Capture {
  planet: Planet;
  /** Closest-approach distance of the flight line to the planet centre (impact parameter). */
  impact: number;
}

export class Comet {
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  vx = 0;
  vy = 0;
  speed: number = CONFIG.comet.baseSpeed;
  mode: 'orbit' | 'fly' = 'orbit';
  planet: Planet | null = null;
  angle = 0;
  dir: 1 | -1 = 1; // +1 = clockwise on screen (y points down)
  orbitR = 0; // current radius, eases toward planet.orbitR
  flightTime = 0;
  alive = true;
  trail: { x: number; y: number }[] = [];
  private ignore: Planet | null = null; // planet we just left; can't recapture until we exit its zone

  constructor(start: Planet) {
    this.attach(start, Math.PI, 1, start.orbitR);
    this.prevX = this.x;
    this.prevY = this.y;
  }

  snapshot(): void {
    this.prevX = this.x;
    this.prevY = this.y;
  }

  private attach(p: Planet, angle: number, dir: 1 | -1, radius: number): void {
    this.mode = 'orbit';
    this.planet = p;
    this.angle = angle;
    this.dir = dir;
    this.orbitR = radius;
    this.flightTime = 0;
    this.placeOnOrbit();
  }

  private placeOnOrbit(): void {
    const p = this.planet!;
    this.x = p.x + Math.cos(this.angle) * this.orbitR;
    this.y = p.y + Math.sin(this.angle) * this.orbitR;
    this.vx = -Math.sin(this.angle) * this.dir * this.speed;
    this.vy = Math.cos(this.angle) * this.dir * this.speed;
  }

  /** Leave orbit along the tangent. Returns false if not orbiting. */
  release(): boolean {
    if (this.mode !== 'orbit' || !this.planet) return false;
    this.vx = -Math.sin(this.angle) * this.dir * this.speed;
    this.vy = Math.cos(this.angle) * this.dir * this.speed;
    this.ignore = this.planet;
    this.planet = null;
    this.mode = 'fly';
    this.flightTime = 0;
    return true;
  }

  update(dt: number, planets: readonly Planet[]): Capture | null {
    let capture: Capture | null = null;

    if (this.mode === 'orbit' && this.planet) {
      const p = this.planet;
      this.orbitR += (p.orbitR - this.orbitR) * (1 - Math.exp(-CONFIG.comet.radiusSettle * dt));
      this.angle += (this.dir * this.speed * dt) / this.orbitR;
      if (this.angle > Math.PI * 2) this.angle -= Math.PI * 2;
      else if (this.angle < 0) this.angle += Math.PI * 2;
      this.placeOnOrbit();
    } else {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.flightTime += dt;

      const ig = this.ignore;
      if (ig && Math.hypot(this.x - ig.x, this.y - ig.y) > ig.captureR) this.ignore = null;

      for (const p of planets) {
        if (p === this.ignore) continue;
        const dx = this.x - p.x;
        const dy = this.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > p.captureR * p.captureR) continue;
        const d = Math.sqrt(d2);
        // Inside the capture zone: keep flying straight until closest approach
        // (or until we hit the ideal orbit radius), then wrap into orbit.
        const closing = dx * this.vx + dy * this.vy < 0;
        if (closing && d > p.orbitR) continue;
        const cross = dx * this.vy - dy * this.vx;
        const impact = Math.abs(cross) / this.speed;
        this.attach(p, Math.atan2(dy, dx), cross >= 0 ? 1 : -1, Math.max(d, 1));
        capture = { planet: p, impact };
        break;
      }
    }

    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > CONFIG.comet.trailLength) this.trail.shift();
    return capture;
  }
}

/**
 * Comet with a tapering additive trail. `pts` is head-first, in world units.
 * Width tapers from (7 + 0.6·combo) to 0.5, with a white core over the first 35%.
 */
export function drawCometTrail(ctx: CanvasRenderingContext2D, pts: readonly { x: number; y: number }[], combo: number, t: number, color: string, head = true): void {
  const n = pts.length - 1;
  if (n < 1) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  const wm = 7 + combo * 0.6;
  for (let i = 0; i < n; i++) {
    const k = i / n;
    ctx.lineWidth = wm * (1 - k) + 0.5;
    ctx.strokeStyle = rgba(color, (1 - k) * 0.85);
    ctx.beginPath();
    ctx.moveTo(pts[i].x, pts[i].y);
    ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
    ctx.stroke();
  }
  const core = Math.floor(n * 0.35);
  for (let i = 0; i < core; i++) {
    const k = i / core;
    ctx.lineWidth = 2.5 * (1 - k);
    ctx.strokeStyle = rgba('#FFFFFF', 0.8 * (1 - k));
    ctx.beginPath();
    ctx.moveTo(pts[i].x, pts[i].y);
    ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
    ctx.stroke();
  }
  if (combo >= 7) {
    // sparks thrown off the trail at high combo
    const r = mulberry32(7 + Math.floor(t * 20));
    ctx.fillStyle = rgba(color, 0.9);
    for (let j = 0; j < (combo - 4) * 2; j++) {
      const p = pts[Math.floor(r.next() * n)];
      ctx.fillRect(p.x + (r.next() - 0.5) * 18, p.y + (r.next() - 0.5) * 18, 2.5, 2.5);
    }
  }
  ctx.restore();
  if (head) {
    glow(ctx, pts[0].x, pts[0].y, 28 + combo * 2, color, 0.9);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, 5.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
