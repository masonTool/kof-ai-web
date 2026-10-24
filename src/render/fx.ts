/**
 * 命中特效：火花、防御火花、落地尘土。
 *
 * 随机性全部来自传入的 `Rng`（世界的那一份），所以同一次回放的特效完全一致——
 * 这一点比"特效好看"更重要：不对齐的特效会让人怀疑判定出了问题。
 */
import type { Rng } from '../core/rng';
import type { FxStyle } from '../data/schema';
import type { Ctx2D } from './ctx';

export type FxKind = 'spark' | 'guard' | 'dust';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: FxKind;
  /** 属性（带属性的粒子会多画一圈外发光，屏幕上才看得出"这是火"） */
  style?: FxStyle;
}

const HIT_COLORS = ['#fff3b0', '#ffd23f', '#ff8c42', '#ffffff'];

/**
 * 属性配色：只改颜色不改判定。
 * 顺序都是"亮 → 主色 → 深色 → 白"，这样不管哪种属性的火花都够亮、能看清命中。
 */
export const STYLE_COLORS: Record<FxStyle, string[]> = {
  none: HIT_COLORS,
  fire: ['#fff6c4', '#ffc14d', '#ff7a2f', '#ff3b1f'],
  darkfire: ['#f3d9ff', '#c56bff', '#8b3ff2', '#ffffff'],
  thunder: ['#ffffff', '#d6f0ff', '#7fc9ff', '#ffe96b'],
  wind: ['#f0fff8', '#a8f0cd', '#5fd6a3', '#ffffff'],
  ki: ['#f6ecff', '#cfa9ff', '#8f6bff', '#ffffff'],
};

/** 属性火花的大小/数量微调：雷最"炸"，风最"散" */
const STYLE_SHAPE: Record<FxStyle, { count: number; speed: number }> = {
  none: { count: 1, speed: 1 },
  fire: { count: 1.1, speed: 0.95 },
  darkfire: { count: 1.1, speed: 1.05 },
  thunder: { count: 1.3, speed: 1.35 },
  wind: { count: 1.15, speed: 0.8 },
  ki: { count: 1, speed: 1.1 },
};
const GUARD_COLORS = ['#bfe3ff', '#7fb8ff', '#ffffff'];
const DUST_COLORS = ['#8d8477', '#b5ac9e'];

/** 防御火花用哪些颜色（带属性时只多一颗本色，不整片变色） */
export function guardColorsFor(style: FxStyle): string[] {
  return style === 'none' ? [...GUARD_COLORS] : [...GUARD_COLORS, STYLE_COLORS[style][1]!];
}

export interface SpawnOptions {
  /** 判定等级，决定火花数量（重击更炸） */
  heavy?: boolean;
  counter?: boolean;
  /** 属性（决定颜色与扩散） */
  style?: FxStyle;
}

export class FxSystem {
  readonly particles: Particle[] = [];

  constructor(
    private readonly rng: Rng,
    private readonly maxParticles = 240,
  ) {}

  private push(p: Particle): void {
    this.particles.push(p);
    if (this.particles.length > this.maxParticles) this.particles.splice(0, this.particles.length - this.maxParticles);
  }

  private burst(
    x: number,
    y: number,
    count: number,
    colors: string[],
    kind: FxKind,
    speed: number,
    style: FxStyle = 'none',
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = this.rng.float(0, Math.PI * 2);
      const mag = this.rng.float(speed * 0.3, speed);
      const life = this.rng.range(8, 18);
      this.push({
        x,
        y,
        vx: Math.cos(angle) * mag,
        vy: Math.sin(angle) * mag - 0.4,
        life,
        maxLife: life,
        size: this.rng.range(1, 3),
        color: colors[this.rng.int(colors.length)]!,
        kind,
        style,
      });
    }
  }

  spawnHit(x: number, y: number, opts: SpawnOptions = {}): void {
    const style = opts.style ?? 'none';
    const shape = STYLE_SHAPE[style];
    const base = (opts.heavy === true ? 14 : 9) + (opts.counter === true ? 4 : 0);
    const count = Math.round(base * shape.count);
    const speed = (opts.heavy === true ? 2.6 : 1.9) * shape.speed;
    this.burst(x, y, count, STYLE_COLORS[style], 'spark', speed, style);
  }

  spawnGuard(x: number, y: number, style: FxStyle = 'none'): void {
    this.burst(x, y, 6, GUARD_COLORS, 'guard', 1.4);
    // 带属性的招式额外给一颗本色火星：能一眼看出"这一下是火/雷挡住的"
    if (style !== 'none') {
      const life = this.rng.range(10, 16);
      this.push({
        x,
        y,
        vx: this.rng.float(-0.8, 0.8),
        vy: this.rng.float(-1.4, -0.5),
        life,
        maxLife: life,
        size: 2.4,
        color: STYLE_COLORS[style][1]!,
        kind: 'guard',
        style,
      });
    }
  }

  spawnDust(x: number, y: number): void {
    for (let i = 0; i < 5; i++) {
      const life = this.rng.range(10, 20);
      this.push({
        x: x + this.rng.float(-6, 6),
        y,
        vx: this.rng.float(-0.9, 0.9),
        vy: this.rng.float(-0.6, -0.1),
        life,
        maxLife: life,
        size: this.rng.range(1, 3),
        color: DUST_COLORS[this.rng.int(DUST_COLORS.length)]!,
        kind: 'dust',
      });
    }
  }

  /** 每逻辑帧调一次 */
  update(): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.kind === 'dust' ? 0.05 : 0.16;
      p.vx *= 0.94;
      p.life--;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  draw(ctx: Ctx2D): void {
    for (const p of this.particles) {
      const t = Math.max(0, p.life) / p.maxLife;
      const s = p.size * (0.5 + t);
      // 带属性的粒子先铺一圈对比色外发光：
      // 只有亮色小方块的画面，火和雷看起来都一样（都是"白点点"）
      if (p.style !== undefined && p.style !== 'none') {
        const halo = STYLE_COLORS[p.style][2]!;
        ctx.globalAlpha = Math.min(1, t * 0.5);
        ctx.fillStyle = halo;
        const hs = s * 2.4;
        ctx.fillRect(p.x - hs / 2, p.y - hs / 2, hs, hs);
      }
      ctx.globalAlpha = Math.min(1, t * 1.4);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.particles.length = 0;
  }

  get count(): number {
    return this.particles.length;
  }
}
