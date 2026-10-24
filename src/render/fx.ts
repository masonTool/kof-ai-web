/**
 * 命中特效：火花、防御火花、落地尘土。
 *
 * 随机性全部来自传入的 `Rng`（世界的那一份），所以同一次回放的特效完全一致——
 * 这一点比"特效好看"更重要：不对齐的特效会让人怀疑判定出了问题。
 */
import type { Rng } from '../core/rng';
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
}

const HIT_COLORS = ['#fff3b0', '#ffd23f', '#ff8c42', '#ffffff'];
const GUARD_COLORS = ['#bfe3ff', '#7fb8ff', '#ffffff'];
const DUST_COLORS = ['#8d8477', '#b5ac9e'];

export interface SpawnOptions {
  /** 判定等级，决定火花数量（重击更炸） */
  heavy?: boolean;
  counter?: boolean;
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

  private burst(x: number, y: number, count: number, colors: string[], kind: FxKind, speed: number): void {
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
      });
    }
  }

  spawnHit(x: number, y: number, opts: SpawnOptions = {}): void {
    const count = (opts.heavy === true ? 14 : 9) + (opts.counter === true ? 4 : 0);
    this.burst(x, y, count, HIT_COLORS, 'spark', opts.heavy === true ? 2.6 : 1.9);
  }

  spawnGuard(x: number, y: number): void {
    this.burst(x, y, 7, GUARD_COLORS, 'guard', 1.4);
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
      ctx.globalAlpha = Math.min(1, t * 1.4);
      ctx.fillStyle = p.color;
      const s = p.size * (0.5 + t);
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
