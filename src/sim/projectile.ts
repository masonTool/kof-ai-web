/**
 * 飞行道具：气弹、火球、波动拳。
 *
 * 它是 `World` 里的一个实体（不是角色的一个字段），这样：
 * 推进顺序、确定性哈希、渲染遍历都自动复用同一套；
 * 命中结算在 `hit.ts` 的 `resolveProjectiles()` 里，和近身判定共用 `applyHit()`，
 * 免得"火球能不能被防""火球算不算反击"两套规则各写一遍。
 */
import type { Hasher } from '../core/hash';
import type { Box, FxStyle, HitDef, ProjectileDef, ProjectileShape } from '../data/schema';
import { shapeOfProjectile, styleOfMove } from '../data/fx-style';
import type { Fighter } from './fighter';
import type { Entity, World } from './world';

/** 道具默认飞多久（帧）；`ProjectileDef.life` 没写就用这个 */
export const DEFAULT_PROJECTILE_LIFE = 90;

export interface ProjectileInit {
  x: number;
  y: number;
  vx: number;
  facing: 1 | -1;
  hit: HitDef;
  anim: string;
  life: number;
  /** 命中特效风格（生成那一刻从主人的招式上取，之后主人收招也不影响） */
  style?: FxStyle;
  /** 绘制形状 */
  shape?: ProjectileShape;
}

export class Projectile implements Entity {
  id = -1;
  x: number;
  y: number;
  readonly vx: number;
  readonly facing: 1 | -1;
  readonly owner: Fighter;
  readonly hit: HitDef;
  readonly anim: string;
  /** 命中特效风格：生成时定下来，不随后续动作变化 */
  readonly style: FxStyle;
  /** 绘制形状（也是生成时定下来） */
  readonly shape: ProjectileShape;
  life: number;
  /** 这一帧之后就该从世界里移除 */
  dead = false;

  constructor(owner: Fighter, init: ProjectileInit) {
    this.owner = owner;
    this.x = init.x;
    this.y = init.y;
    this.vx = init.vx;
    this.facing = init.facing;
    this.hit = init.hit;
    this.anim = init.anim;
    this.style = init.style ?? 'none';
    this.shape = init.shape ?? shapeOfProjectile(this.style);
    this.life = init.life;
  }

  /** 判定盒：以道具中心为原点（hit.box 的尺寸，位置不用） */
  box(): Box {
    const w = this.hit.box.w;
    const h = this.hit.box.h;
    return { x: this.x - w / 2, y: this.y - h / 2, w, h };
  }

  step(world: World): void {
    this.x += this.vx;
    this.life--;
    if (this.life <= 0) this.dead = true;
    // 出屏太远也回收，别在世界里留垃圾
    if (this.x < -80 || this.x > 640) this.dead = true;
    void world;
  }

  hash(h: Hasher): void {
    h.f64(this.x).f64(this.y).f64(this.vx).i32(this.facing).i32(this.life).i32(this.owner.id);
  }
}

/** 从招式数据造一个道具（位置相对角色脚底原点） */
export function spawnProjectile(world: World, owner: Fighter, def: ProjectileDef): Projectile {
  const forward = owner.facing;
  const spawnX = owner.x + forward * (def.spawnOffsetX ?? 22);
  const spawnY = owner.y + (def.spawnOffsetY ?? -44);
  const projectile = new Projectile(owner, {
    x: spawnX,
    y: spawnY,
    vx: forward * def.speed,
    facing: forward,
    hit: def.hit,
    anim: def.anim,
    life: def.life > 0 ? def.life : DEFAULT_PROJECTILE_LIFE,
    style: styleOfMove(owner.char.id, owner.move),
    shape: shapeOfProjectile(styleOfMove(owner.char.id, owner.move), def.shape),
  });
  // 出声用；事件不参与判定/hash，回放照样一致
  world.emit('proj', { x: spawnX, y: spawnY });
  return world.add(projectile);
}
