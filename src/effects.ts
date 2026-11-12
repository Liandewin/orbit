import { CONFIG } from './config';

export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Pre-rendered radial glow sprites (much cheaper than shadowBlur on mobile).
const glowCache = new Map<string, HTMLCanvasElement>();
export function glowSprite(color: string): HTMLCanvasElement {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, rgba(color, 1));
  grad.addColorStop(0.2, rgba(color, 0.45));
  grad.addColorStop(0.5, rgba(color, 0.12));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowCache.set(color, c);
  return c;
}

/** Draws a glow of radius r. Caller sets the composite op (usually 'lighter'). */
export function drawGlow(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, r: number, alpha: number): void {
  if (alpha <= 0 || r <= 0) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

/** Additive glow that manages its own composite mode. */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number): void {
  if (alpha <= 0 || r <= 0) return;
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, color, x, y, r, alpha);
  ctx.globalCompositeOperation = prev;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  drag: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  life: number;
  max: number;
}

const MAX_PARTICLES = 500;

export class Effects {
  particles: Particle[] = [];
  texts: FloatText[] = [];
  trauma = 0;
  shakeX = 0;
  shakeY = 0;
  flash = 0;
  flashColor = '#ffffff';
  private t = 0;

  clear(): void {
    this.particles.length = 0;
    this.texts.length = 0;
    this.trauma = 0;
    this.flash = 0;
    this.shakeX = this.shakeY = 0;
  }

  burst(x: number, y: number, color: string, count: number, speedMin: number, speedMax: number, size = 4, life = 0.6): void {
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speedMin + Math.random() * (speedMax - speedMin);
      const l = life * (0.6 + Math.random() * 0.6);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: l, max: l, size: size * (0.6 + Math.random() * 0.8), color, drag: 3 });
    }
  }

  /** Evenly spaced ring burst — reads as a clean "snap". */
  ring(x: number, y: number, radius: number, color: string, count: number, speed: number): void {
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const a = (i / count) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      this.particles.push({ x: x + c * radius, y: y + s * radius, vx: c * speed, vy: s * speed, life: 0.5, max: 0.5, size: 5, color, drag: 4 });
    }
  }

  /** Directional puff, e.g. behind the comet on release. */
  puff(x: number, y: number, dirX: number, dirY: number, color: string, count: number): void {
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const spread = (Math.random() - 0.5) * 1.2;
      const c = Math.cos(spread);
      const s = Math.sin(spread);
      const dx = dirX * c - dirY * s;
      const dy = dirX * s + dirY * c;
      const sp = 60 + Math.random() * 120;
      this.particles.push({ x, y, vx: dx * sp, vy: dy * sp, life: 0.3, max: 0.3, size: 3, color, drag: 5 });
    }
  }

  text(x: number, y: number, text: string, color: string, size: number, life = 0.9): void {
    this.texts.push({ x, y, text, color, size, life, max: life });
  }

  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  doFlash(color: string, amount: number): void {
    this.flashColor = color;
    this.flash = Math.max(this.flash, amount);
  }

  update(dt: number): void {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - CONFIG.feel.shakeDecay * dt);
    const s = this.trauma * this.trauma * CONFIG.feel.shakeMaxPx;
    const t = this.t;
    this.shakeX = s * (Math.sin(t * 53.1) * 0.6 + Math.sin(t * 97.3 + 1.7) * 0.4);
    this.shakeY = s * (Math.sin(t * 61.7 + 0.5) * 0.6 + Math.sin(t * 89.9 + 2.3) * 0.4);
    this.flash = Math.max(0, this.flash - dt * 2.5);

    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    const ts = this.texts;
    for (let i = ts.length - 1; i >= 0; i--) {
      const ft = ts[i];
      ft.life -= dt;
      ft.y -= 50 * dt;
      if (ft.life <= 0) ts.splice(i, 1);
    }
  }

  /** Draw particles and floating text in world space. */
  drawWorld(ctx: CanvasRenderingContext2D, font: string): void {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const a = p.life / p.max;
      drawGlow(ctx, p.color, p.x, p.y, p.size * 2.5 * (0.5 + a * 0.5), a);
    }
    ctx.globalCompositeOperation = 'source-over';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const ft of this.texts) {
      const age = ft.max - ft.life;
      const pop = 1 + 0.5 * Math.max(0, 1 - age / 0.12);
      const a = Math.min(1, ft.life / (ft.max * 0.4));
      ctx.globalAlpha = a;
      ctx.font = `900 ${Math.round(ft.size * pop)}px ${font}`;
      ctx.shadowColor = ft.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}
