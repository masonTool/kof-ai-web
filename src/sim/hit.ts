/**
 * 命中结算：判定盒 × 受击盒 → 命中/防御/相杀 → 伤害、硬直、击退、气槽、连段补正。
 *
 * 关键设计：**先收集全部撞击，再统一结算**。
 * 这样"同一帧互相打中"（相杀）天然成立——第二轮结算时对方虽然在结算里已经挨打，
 * 但它的攻击在第一轮收集时就已经成立了。若边收边算，结果会取决于遍历顺序。
 */
import { Btn } from '../core/input';
import type { HitDef } from '../data/schema';
import { centerOf, intersects } from './collision';
import { addComboHit, scaledDamage } from './combo';
import type { Fighter } from './fighter';
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

/** 结算本帧全部撞击；返回发生的事件（给 FX / 音效 / 连击显示用） */
export function resolveCombat(world: World, fighters: readonly Fighter[]): HitResolution[] {
  const candidates = collect(fighters);
  const results: HitResolution[] = [];

  for (const c of candidates) {
    const { attacker, defender, hit } = c;
    // 同一段判定只结算一次（多帧生效的判定不会连续打）
    if (attacker.usedHits.has(hit.id)) continue;
    attacker.usedHits.add(hit.id);

    attacker.addHitstop(hit.hitstop);
    defender.addHitstop(hit.hitstop);

    const comboBefore = defender.combo.hits;

    if (c.blocked) {
      // 被防也能接取消（KOF 的"防御取消"），表里没写就不开
      const onBlock = attacker.move?.cancel?.onBlock;
      if (onBlock && onBlock.length > 0) attacker.allowCancel(onBlock);
      defender.enterBlockstun(hit.blockStun);
      defender.push(attacker.facing * hit.blockPushback);
      attacker.push(-attacker.facing * hit.blockPushback * 0.5);
      attacker.addMeter(Math.floor(hit.damage * 0.15));
      world.emit('guard', { x: c.x, y: c.y, level: hit.level });
      results.push({
        kind: 'block',
        hit,
        attacker,
        defender,
        damage: 0,
        comboHits: comboBefore,
        counter: false,
        ko: false,
        x: c.x,
        y: c.y,
      });
      continue;
    }

    const raw = c.counter ? Math.round(hit.damage * COUNTER_DAMAGE_MULT) : hit.damage;
    const damage = scaledDamage(raw, comboBefore);

    // 命中了才开取消窗口（没打中不能取消，这是连段成立的前提）
    const onHit = attacker.move?.cancel?.onHit;
    if (onHit && onHit.length > 0) attacker.allowCancel(onHit);

    defender.takeDamage(damage);
    addComboHit(defender.combo, damage);
    if (!defender.isDead) {
      defender.enterHitstun(hit.hitStun + (c.counter ? COUNTER_EXTRA_STUN : 0), {
        launch: hit.launch,
        knockdown: hit.knockdown !== undefined && hit.knockdown !== 'none',
      });
    }
    defender.push(attacker.facing * hit.pushback);

    attacker.addMeter(hit.meterGain ?? Math.floor(damage * 0.6));
    defender.addMeter(Math.floor(damage * 0.2));

    world.emit('hit', {
      x: c.x,
      y: c.y,
      damage,
      level: hit.level,
      counter: c.counter,
      combo: defender.combo.hits,
      sfx: hit.sfx ?? 'hit',
    });

    const ko = defender.isDead;
    if (ko) world.emit('ko', { x: defender.x, y: defender.y });

    results.push({
      kind: 'hit',
      hit,
      attacker,
      defender,
      damage,
      comboHits: defender.combo.hits,
      counter: c.counter,
      ko,
      x: c.x,
      y: c.y,
    });
  }

  return results;
}
