import { CONFIG } from './config';
import { BlackHole, Planet, PLANET_COLORS, orbitRadiusFor, type Motion } from './planet';
import { clamp, lerp, mulberry32, type Rng } from './rng';

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  const t = len2 > 0 ? clamp(((px - ax) * abx + (py - ay) * aby) / len2, 0, 1) : 0;
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

const rangeLerp = (rng: Rng, easy: readonly number[], hard: readonly number[], d: number): number =>
  rng.range(lerp(easy[0], hard[0], d), lerp(easy[1], hard[1], d));

export class World {
  readonly planets: Planet[] = [];
  readonly holes: BlackHole[] = [];
  readonly first: Planet;
  readonly seed: number;
  difficulty = 0;
  score = 0;
  private readonly rng: Rng;
  private last: Planet;

  constructor(seed: number) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    const W = CONFIG.view.width;
    this.first = new Planet(W / 2, 0, CONFIG.world.firstPlanetRadius, PLANET_COLORS[0]);
    this.first.visited = true;
    this.planets.push(this.first);
    this.last = this.first;
  }

  update(dt: number): void {
    for (const p of this.planets) {
      p.snapshot();
      p.update(dt);
    }
    for (const h of this.holes) h.update(dt);
  }

  /** Generate planets until the world extends above `topY`. */
  ensureAhead(topY: number): void {
    let guard = 0;
    while (this.last.y > topY && guard++ < 20) this.spawnNext();
  }

  /** Remove anything that has scrolled below `bottomY`. */
  cull(bottomY: number, keep: Planet | null): void {
    const limit = bottomY + CONFIG.world.cullBelow;
    for (let i = this.planets.length - 1; i >= 0; i--) {
      const p = this.planets[i];
      if (p !== keep && p !== this.last && p.y - p.captureR > limit) this.planets.splice(i, 1);
    }
    for (let i = this.holes.length - 1; i >= 0; i--) {
      const h = this.holes[i];
      if (h.y - h.radius * 2 > limit) this.holes.splice(i, 1);
    }
  }

  private spawnNext(): void {
    const C = CONFIG.world;
    const W = CONFIG.view.width;
    const d = this.difficulty;
    const r = this.rng;
    const prev = this.last;

    const radius = rangeLerp(r, C.radiusEasy, C.radiusHard, d);
    const orbitR = orbitRadiusFor(radius);
    const captureR = orbitR * CONFIG.planet.captureFactor;

    let motion: Motion | null = null;
    if (d > C.movingStart) {
      const t = (d - C.movingStart) / (1 - C.movingStart);
      if (r.chance(lerp(0.05, C.movingChanceMax, t))) {
        motion = { amp: r.range(C.moveAmp[0], C.moveAmp[1]), freq: r.range(C.moveFreq[0], C.moveFreq[1]), phase: r.range(0, Math.PI * 2) };
      }
    }

    // Keep the whole orbit on-screen, including drift.
    let amp = motion ? motion.amp : 0;
    let minX = orbitR + C.sideMargin + amp;
    let maxX = W - orbitR - C.sideMargin - amp;
    if (minX > maxX) {
      motion = null;
      amp = 0;
      minX = orbitR + C.sideMargin;
      maxX = W - orbitR - C.sideMargin;
    }

    const gap = rangeLerp(r, C.gapEasy, C.gapHard, d);
    const dist = prev.orbitR + gap + captureR; // centre-to-centre
    const maxShift = lerp(C.maxShiftEasy, C.maxShiftHard, d) * W;

    let x = W / 2;
    let y = prev.y - dist;
    for (let attempt = 0; attempt < 10; attempt++) {
      const lo = Math.max(minX, prev.baseX - maxShift);
      const hi = Math.min(maxX, prev.baseX + maxShift);
      x = lo < hi ? r.range(lo, hi) : r.range(minX, maxX);
      const dx = x - prev.baseX;
      // Always make real upward progress, so the next planet stays reachable.
      const dy = Math.sqrt(Math.max(dist * dist - dx * dx, (dist * 0.55) ** 2));
      y = prev.y - dy;
      if (this.pathClear(prev, x, y, captureR, amp)) break;
    }

    const color = r.pick(PLANET_COLORS.filter((c) => c !== prev.color));
    const planet = new Planet(x, y, radius, color, motion);
    this.planets.push(planet);
    this.last = planet;

    if (this.score >= C.blackHoleScore && r.chance(lerp(C.blackHoleChance[0], C.blackHoleChance[1], d))) {
      this.trySpawnHole(prev, planet);
    }
  }

  private pathClear(prev: Planet, x: number, y: number, captureR: number, amp: number): boolean {
    for (const h of this.holes) {
      if (Math.hypot(h.x - x, h.y - y) < captureR + h.ringR + 10) return false;
      const clearance = h.radius + CONFIG.comet.radius + prev.orbitR * 0.6 + 24;
      if (distToSegment(h.x, h.y, prev.baseX, prev.y, x - amp, y) < clearance) return false;
      if (distToSegment(h.x, h.y, prev.baseX, prev.y, x + amp, y) < clearance) return false;
    }
    return true;
  }

  private trySpawnHole(a: Planet, b: Planet): void {
    const C = CONFIG.world;
    const W = CONFIG.view.width;
    const r = this.rng;
    const hr = r.range(C.blackHoleRadius[0], C.blackHoleRadius[1]);
    const mx = (a.baseX + b.baseX) / 2;
    const my = (a.y + b.y) / 2;
    const len = Math.hypot(b.baseX - a.baseX, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.baseX - a.baseX) / len;
    const first = r.sign();
    const clearance = hr + CONFIG.comet.radius + a.orbitR * 0.6 + 24;

    for (const side of [first, -first]) {
      const off = r.range(C.blackHoleOffset[0], C.blackHoleOffset[1]) * side;
      const hx = clamp(mx + nx * off, hr * 2.75 + 8, W - hr * 2.75 - 8);
      const hy = my + ny * off;
      const ok =
        distToSegment(hx, hy, a.baseX, a.y, b.baseX - b.amp, b.y) > clearance &&
        distToSegment(hx, hy, a.baseX, a.y, b.baseX + b.amp, b.y) > clearance &&
        this.planets.every((p) => Math.hypot(p.baseX - hx, p.y - hy) > p.captureR + p.amp + hr * 2.75 + 6);
      if (ok) {
        this.holes.push(new BlackHole(hx, hy, hr));
        return;
      }
    }
  }
}
