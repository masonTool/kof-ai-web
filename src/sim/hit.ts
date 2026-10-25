/**
 * 命中结算：判定盒 × 受击盒 → 命中/防御/相杀 → 伤害、硬直、击退、气槽、连段补正。
 *
 * 关键设计：**先收集全部撞击，再统一结算**。
 * 这样"同一帧互相打中"（相杀）天然成立——第二轮结算时对方虽然在结算里已经挨打，
 * 但它的攻击在第一轮收集时就已经成立了。若边收边算，结果会取决于遍历顺序。
 */
import { Btn } from '../core/input';
import type { FxStyle, HitDef } from '../data/schema';
import { styleOfMove } from '../data/fx-style';
import { centerOf, intersects } from './collision';
import { addComboHit, scaledDamage } from './combo';
import { DIZZY_FRAMES, GUARD_CRUSH_MAX, GUARD_CRUSH_STUN, MAX_MODE_DAMAGE, STUN_MAX } from './constants';
import type { Fighter } from './fighter';
import { Projectile } from './projectile';
import { isNeutral } from './state';
import type { World } from './world';

export type HitKind = 'hit' | 'block';

export interface HitResolution {
  kind: HitKind;
  hit: HitDef;
  attacker: Fighter;
  defender: Fighter;
  damage: number;
  /** 这一击是本次连段的第几段（1 = 首段） */
  comboHits: number;
  /** 反击（打断对手出招的起手） */
  counter: boolean;
  ko: boolean;
  /** 命中特效风格（给特效层） */
  style: FxStyle;
  /** 命中点（世界坐标，给特效层） */
  x: number;
  y: number;
}

/** 反击加成 */
const COUNTER_DAMAGE_MULT = 1.2;
/** 反击追加硬直帧 */
const COUNTER_EXTRA_STUN = 4;

/** 这个角色的"后退方向"键（= 防御方向） */
export function guardDirection(f: Fighter): number {
  return f.facing === 1 ? Btn.Left : Btn.Right;
}

/**
 * 这一击能不能被防住。
 * 规则：空中不能防（KOF97 没有空中防御）；必须按住后退方向；
 * low 必须蹲防、overhead 必须站防、unblockable 谁都不能防。
 */
/** 浮空追击的伤害倍率（打飞起来的目标多打一点） */
export const AERIAL_DAMAGE_MULT = 1.15;

export function isGuarding(defender: Fighter, hit: HitDef): boolean {
  if (defender.airborne) return false;
  if (!isNeutral(defender.state) && defender.state !== 'guard' && defender.state !== 'block') return false;
  const held = defender.input.held;
  if ((held & guardDirection(defender)) === 0) return false;

  const crouching = (held & Btn.Down) !== 0;
  switch (hit.guard) {
    case 'unblockable':
      return false;
    case 'low':
      return crouching;
    case 'overhead':
      return !crouching;
    default:
      return true;
  }
}

/**
 * 受击方是否处在无敌窗口（招式数据里的 `invuln`）。
 * 之前只判了倒地/起身，招式上的无敌帧（鬼焼、紧急回避）其实一直没生效。
 */
export function isInvulnerable(defender: Fighter, hit: HitDef): boolean {
  const move = defender.move;
  if (!defender.isAttacking || !move?.invuln) return false;
  for (const w of move.invuln) {
    if (defender.moveFrame < w.frames[0] || defender.moveFrame > w.frames[1]) continue;
    if (w.kind === 'full') return true;
    if (w.kind === 'low' && hit.level === 'low') return true;
    if (w.kind === 'air' && defender.airborne) return true;
  }
  return false;
}

interface Candidate {
  attacker: Fighter;
  defender: Fighter;
  hit: HitDef;
  blocked: boolean;
  counter: boolean;
  x: number;
  y: number;
}

function collect(fighters: readonly Fighter[]): Candidate[] {
  const found: Candidate[] = [];
  for (const attacker of fighters) {
    if (!attacker.isAttacking || attacker.isDead) continue;
    for (const hit of attacker.activeHits()) {
      if (attacker.usedHits.has(hit.id)) continue;
      const hitBox = attacker.worldBox(hit.box);
      for (const defender of fighters) {
        if (defender === attacker || defender.isDead) continue;
        if (defender.state === 'down' || defender.state === 'wakeup') continue; // 倒地/起身无敌
        if (isInvulnerable(defender, hit)) continue; // 招式自带的无敌帧（回避/鬼焼）
        if (!intersects(hitBox, defender.worldBox(defender.hurtbox()))) continue;

        const blocked = isGuarding(defender, hit);
        const startup = defender.isAttacking ? (defender.move!.hits[0]?.frames[0] ?? 0) : 0;
        const counter = !blocked && defender.isAttacking && defender.moveFrame < startup;
        found.push({ attacker, defender, hit, blocked, counter, x: centerOf(hitBox).x, y: centerOf(hitBox).y });
      }
    }
  }
  return found;
}

/** 一次撞击的上下文（近身判定与飞行道具共用同一套结算，避免两套规则漂移） */
export interface HitCandidate {
  attacker: Fighter;
  defender: Fighter;
  hit: HitDef;
  blocked: boolean;
  counter: boolean;
  x: number;
  y: number;
  /** 命中特效风格（近身从招式取，道具从道具自己身上取） */
  style?: FxStyle;
}

/** 结算一次撞击：伤害 / 硬直 / 削防 / 气槽 / 连段 / 事件 */
/**
 * 招式强度加成：必杀打出去要比普通技"有反应"。
 *
 * 数据里每个 HitDef 都写死了 hitStun / pushback / launch，但这些是**按普通技的尺度**
 * 填的；必杀技用同一套数值，打在身上和普通拳没区别——用户反馈"技能对对手没有影响"。
 * 所以按招式类型在结算处加成，而不是去改 29 个角色的上百条 HitDef。
 */
function moveWeight(attacker: Fighter): { stun: number; push: number; launch: number; stop: number } {
  const kind = attacker.move?.kind;
  if (kind === 'super') return { stun: 8, push: 1.55, launch: -3.4, stop: 6 };
  if (kind === 'special') return { stun: 4, push: 1.3, launch: 0, stop: 2 };
  return { stun: 0, push: 1, launch: 0, stop: 0 };
}

export function applyHit(world: World, c: HitCandidate): HitResolution {
  // 受击会改 state，所以"挨打前是不是在空中"必须现在就记下来
  const wasAirborne = c.defender.airborne;
  const { attacker, defender, hit } = c;
  // 近身命中的风格来自招式；道具命中由调用方从道具身上带过来（主人可能已经收招了）
  const style: FxStyle = c.style ?? styleOfMove(attacker.char.id, attacker.move);
  // 顿帧分级：必杀"砸"下去和轻拳停一样久，手感上就分不出轻重。
  // 注意不能写回 `hit.hitstop`——那是 MoveDef 里的对象，改一次会永久污染招式数据
  const stopTotal = hit.hitstop + moveWeight(attacker).stop;
  attacker.addHitstop(stopTotal);
  defender.addHitstop(stopTotal);

  const comboBefore = defender.combo.hits;

  if (c.blocked) {
    // 被防也能接取消（KOF 的"防御取消"），表里没写就不开
    const onBlock = attacker.move?.cancel?.onBlock;
    if (onBlock && onBlock.length > 0) attacker.allowCancel(onBlock);
    // 削防：连续防御会累积，满则崩防（大硬直）
    defender.guardGauge += Math.max(6, Math.floor(hit.damage * 0.5));
    if (defender.guardGauge >= GUARD_CRUSH_MAX) {
      defender.guardGauge = 0;
      defender.enterHitstun(GUARD_CRUSH_STUN);
      defender.push(attacker.facing * hit.blockPushback * 2);
      world.emit('guardcrush', { x: c.x, y: c.y });
    } else {
      defender.enterBlockstun(hit.blockStun);
    }
    defender.push(attacker.facing * hit.blockPushback);
    attacker.push(-attacker.facing * hit.blockPushback * 0.5);
    attacker.addMeter(Math.floor(hit.damage * 0.15));
    world.emit('guard', { x: c.x, y: c.y, level: hit.level, style });
    return {
      kind: 'block',
      hit,
      attacker,
      defender,
      damage: 0,
      style,
      comboHits: comboBefore,
      counter: false,
      ko: false,
      x: c.x,
      y: c.y,
    };
  }

  const base = c.counter ? Math.round(hit.damage * COUNTER_DAMAGE_MULT) : hit.damage;
  // MAX 模式期间伤害提升
  const raw = Math.round(base * (attacker.maxMode > 0 ? MAX_MODE_DAMAGE : 1));
  // 浮空追击奖励：空中不能防御（见 isGuarding），所以打浮空目标给一点加成，
  // 让"超必杀打飞 → 落地前再补一段"成为有收益的路线，而不是白忙
  // 注意用函数开头记下的 wasAirborne——走到这里 defender 已经被 enterHitstun，
  // 那时 state 是 Hit、airborne 已经变 false，现读一定是 false
  const damage = Math.round(scaledDamage(raw, comboBefore) * (wasAirborne ? AERIAL_DAMAGE_MULT : 1));

  // 命中了才开取消窗口（没打中不能取消，这是连段成立的前提）
  const onHit = attacker.move?.cancel?.onHit;
  if (onHit && onHit.length > 0) attacker.allowCancel(onHit);

  defender.takeDamage(damage);
  addComboHit(defender.combo, damage);
  if (!defender.isDead) {
    const weight = moveWeight(attacker);
    defender.enterHitstun(hit.hitStun + (c.counter ? COUNTER_EXTRA_STUN : 0) + weight.stun, {
      // 超必杀即使在数据里没写 launch，也把对手打浮空（必杀要有"被打飞"的观感）
      launch: hit.launch ?? (weight.launch !== 0 ? weight.launch : undefined),
      knockdown: hit.knockdown !== undefined && hit.knockdown !== 'none',
    });

    // 气绝：挨够了会晕（晕眩中挨打不再累积，否则永远醒不过来）
    if (defender.state !== 'dizzy') {
      defender.stunGauge += Math.floor(damage * 0.45);
      if (defender.stunGauge >= STUN_MAX) {
        defender.enterDizzy(DIZZY_FRAMES);
        defender.stunGauge = 0;
        world.emit('dizzy', { x: defender.x, y: defender.y });
      }
    }
  }
  defender.push(attacker.facing * hit.pushback * moveWeight(attacker).push);

  attacker.addMeter(hit.meterGain ?? Math.floor(damage * 0.6));
  defender.addMeter(Math.floor(damage * 0.2));

  world.emit('hit', {
    x: c.x,
    y: c.y,
    damage,
    level: hit.level,
    style,
    counter: c.counter,
    combo: defender.combo.hits,
    aerial: wasAirborne,
    sfx: hit.sfx ?? 'hit',
  });

  const ko = defender.isDead;
  if (ko) world.emit('ko', { x: defender.x, y: defender.y });

  return {
    kind: 'hit',
    hit,
    attacker,
    defender,
    damage,
    style,
    comboHits: defender.combo.hits,
    counter: c.counter,
    ko,
    x: c.x,
    y: c.y,
  };
}

/** 结算本帧全部近身撞击；返回发生的事件（给 FX / 音效 / 连击显示用） */
export function resolveCombat(world: World, fighters: readonly Fighter[]): HitResolution[] {
  const results: HitResolution[] = [];
  for (const c of collect(fighters)) {
    // 同一段判定只结算一次（多帧生效的判定不会连续打）
    if (c.attacker.usedHits.has(c.hit.id)) continue;
    c.attacker.usedHits.add(c.hit.id);
    results.push(applyHit(world, c));
  }
  return results;
}

/**
 * 结算飞行道具：先判道具相撞（不同主人的两个道具同归于尽），再判打人。
 * 道具是"一次性"的——打中或被打掉就消失。
 */
export function resolveProjectiles(world: World, fighters: readonly Fighter[]): HitResolution[] {
  const projectiles = world.entities.filter((e): e is Projectile => e instanceof Projectile && !e.dead);
  const results: HitResolution[] = [];

  for (let i = 0; i < projectiles.length; i++) {
    for (let j = i + 1; j < projectiles.length; j++) {
      const a = projectiles[i]!;
      const b = projectiles[j]!;
      if (a.dead || b.dead || a.owner === b.owner) continue;
      if (!intersects(a.box(), b.box())) continue;
      a.dead = true;
      b.dead = true;
      world.emit('clash', { x: Math.round((a.x + b.x) / 2), y: Math.round(a.y) });
    }
  }

  for (const p of projectiles) {
    if (p.dead) continue;
    for (const d of fighters) {
      if (d === p.owner || d.isDead) continue;
      if (d.state === 'down' || d.state === 'wakeup') continue;
      if (isInvulnerable(d, p.hit)) continue;
      if (!intersects(p.box(), d.worldBox(d.hurtbox()))) continue;

      results.push(
        applyHit(world, {
          attacker: p.owner,
          defender: d,
          hit: p.hit,
          blocked: isGuarding(d, p.hit),
          counter: false,
          x: p.x,
          y: p.y,
          style: p.style,
        }),
      );
      p.dead = true;
      break;
    }
  }

  return results;
}
