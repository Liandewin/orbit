// Visual design tokens (from the "Orbit Snap Visual Upgrade" design) and
// small Canvas text/shape helpers. Sizes are in world units (u) of the
// 540-wide play column.

export const BG = '#05060D';
export const BG_TOP = '#0B0D1F';
export const SIDE_BARS = '#020308';
export const STAR = '#AEB6D9';
export const TXT = '#F2F4FF';
export const TXT2 = '#9AA3C7';
export const TXT3 = '#5B6390';
export const DANGER = '#FF2E4D';
export const ACCRETION = '#FF8A3D';
export const GOLD = '#FFD84A';
export const CYAN = '#3EE8FF';
export const MAGENTA = '#FF3FD0';
export const LIME = '#9BFF4A';
export const AMBER = '#FFB23E';
export const VIOLET = '#A98BFF';

export const PLANET_COLORS = [CYAN, LIME, AMBER, VIOLET] as const;

/** Combo colour ramp x1..x9: trail, HUD badge, PERFECT callout, shock ring. */
export const RAMP = ['#C9D1F2', '#7FE9FF', '#3EE8FF', '#3EFFB0', '#9BFF4A', '#FFE23E', '#FFA43E', '#FF6A9E', '#FF3FD0'] as const;
export const comboColor = (combo: number): string => RAMP[Math.max(1, Math.min(9, combo)) - 1];

export const DISPLAY = 'Bungee, Impact, "Arial Black", sans-serif'; // numbers and shouts
export const LABEL = '"Chakra Petch", system-ui, sans-serif'; // labels, hints, stats
export const display = (size: number): string => `${Math.round(size)}px ${DISPLAY}`;
export const label = (weight: number, size: number): string => `${weight} ${Math.round(size)}px ${LABEL}`;

export const TAU = Math.PI * 2;

/** Start loading the web fonts so the canvas can use them as soon as they arrive. */
export function loadFonts(): void {
  try {
    for (const f of [display(40), label(700, 20), label(600, 20)]) void document.fonts.load(f).catch(() => {});
  } catch {
    /* Font Loading API missing: fall back to system fonts */
  }
}

export function circ(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, TAU);
}

export interface TextOpts {
  font: string;
  color?: string;
  align?: CanvasTextAlign;
  spacing?: number; // letter spacing in u
  alpha?: number;
  /** Fake glow: the same text stroked wide at low alpha (no shadowBlur). */
  halo?: string;
  haloW?: number;
  haloA?: number;
  /** Solid outline drawn under the fill, for legibility over the world. */
  stroke?: string;
  strokeW?: number;
  noFill?: boolean;
  maxWidth?: number;
}

type SpacingCtx = CanvasRenderingContext2D & { letterSpacing?: string };

export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, o: TextOpts): void {
  ctx.save();
  ctx.font = o.font;
  (ctx as SpacingCtx).letterSpacing = `${o.spacing ?? 0}px`;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  if (o.alpha != null) ctx.globalAlpha = Math.max(0, Math.min(1, o.alpha));
  const mw = o.maxWidth ?? 2000;
  if (o.halo) {
    const hw = o.haloW ?? 14;
    const a = o.haloA ?? 0.22;
    const n = parseInt(o.halo.slice(1), 16);
    ctx.strokeStyle = `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
    ctx.lineWidth = hw;
    ctx.strokeText(s, x, y, mw);
    ctx.lineWidth = hw * 0.5;
    ctx.strokeText(s, x, y, mw);
  }
  if (o.stroke) {
    ctx.strokeStyle = o.stroke;
    ctx.lineWidth = o.strokeW ?? 6;
    ctx.strokeText(s, x, y, mw);
  }
  if (!o.noFill) {
    ctx.fillStyle = o.color ?? TXT;
    ctx.fillText(s, x, y, mw);
  }
  ctx.restore();
}

export function measure(ctx: CanvasRenderingContext2D, s: string, font: string, spacing = 0): number {
  ctx.save();
  ctx.font = font;
  (ctx as SpacingCtx).letterSpacing = `${spacing}px`;
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}
