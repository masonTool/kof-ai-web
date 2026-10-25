/**
 * CPU：按难度档位决定"多久反应、多爱进攻、会不会防、会不会摇必杀"。
 *
 * 做成"按键队列"的形式：想放必杀就排一串方向帧 + 最后一帧带按键，
 * 走的是和玩家**完全相同**的输入通道（`CommandParser`）。
 * 这样 AI 不会作弊出招，动作也能被同一个录制/回放系统记录。
 */
import { Btn, type InputSample } from '../core/input';
import type { Fighter } from '../sim/fighter';
import { FighterState } from '../sim/state';

export type CpuLevel = 'easy' | 'normal' | 'hard';

export const CPU_LEVELS: readonly CpuLevel[] = ['easy', 'normal', 'hard'];

export const CPU_LEVEL_LABEL: Record<CpuLevel, string> = {
  easy: '简单',
  normal: '普通',
  hard: '困难',
};

export interface CpuProfile {
  /** 看到对手出招后多久才开始反应（帧） */
  reaction: number;
  /** 近身时主动进攻的概率 */
  aggression: number;
  /** 看到对手出招时防御的概率 */
  guardChance: number;
  /** 两次出招之间至少隔多少帧 */
  attackGap: [number, number];
  /** 走位决策间隔 */
  moveGap: [number, number];
  /** 进攻时选择必杀技（而不是通常技）的概率 */
  specialChance: number;
  /** 气满时选择超必杀的概率（越高越凶，但空放也很蠢，所以给得保守） */
  superChance: number;
  /** 看到对手放大招时改用回避（A+B 翻滚）而不是硬防的概率 */
  dodgeChance: number;
  /** 对手一直防御时改用 C+D 破防的概率 */
  crushChance: number;
  /** 玩家在空中时跳起对空的概率 */
  antiAirChance: number;
}

export const CPU_PROFILES: Record<CpuLevel, CpuProfile> = {
  easy: {
    reaction: 22,
    aggression: 0.35,
    guardChance: 0.2,
    attackGap: [30, 55],
    moveGap: [18, 30],
    specialChance: 0.1,
    superChance: 0.3,
    dodgeChance: 0.15,
    crushChance: 0.1,
    antiAirChance: 0.05,
  },
  normal: {
    reaction: 12,
    aggression: 0.6,
    guardChance: 0.5,
    attackGap: [18, 34],
    moveGap: [12, 22],
    specialChance: 0.3,
    superChance: 0.5,
    dodgeChance: 0.4,
    crushChance: 0.3,
    antiAirChance: 0.2,
  },
  hard: {
    reaction: 5,
    aggression: 0.85,
    guardChance: 0.78,
    attackGap: [10, 20],
    moveGap: [6, 12],
    specialChance: 0.5,
    superChance: 0.7,
    dodgeChance: 0.65,
    crushChance: 0.5,
    antiAirChance: 0.45,
  },
};

/** 通常技够到的距离 */
const ATTACK_RANGE = 46;
/** 太近了往回退一点，别贴死 */
const MIN_RANGE = 26;

/** 超必杀的气槽门槛（和角色数据的 meterCost 保持一致：100） */
const SUPER_METER = 100;

export class CpuBrain {
  /** 待执行的"按键帧"队列，一帧弹一个 */
  private queue: number[] = [];
  private cooldown = 0;
  private moveTimer = 0;
  private reactTimer = 0;
  private seed: number;
  private profile: CpuProfile;

  constructor(
    private readonly me: Fighter,
    private readonly foe: Fighter,
    readonly level: CpuLevel = 'normal',
    seed = 0x9e3779b9,
  ) {
    this.profile = CPU_PROFILES[level];
    this.seed = seed >>> 0 || 1;
  }

  private rand(): number {
    // xorshift32：确定性、不碰世界 rng
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 0xffffffff;
  }

  private between(min: number, max: number): number {
    return min + Math.floor(this.rand() * (max - min + 1));
  }

  /** 朝向相关的物理方向 */
  private get forward(): number {
    return this.me.facing === 1 ? Btn.Right : Btn.Left;
  }

  private get back(): number {
    return this.me.facing === 1 ? Btn.Left : Btn.Right;
  }

  /** 排队一串指令（每帧一个），末尾那帧带按键 */
  private queueMotion(
    motion: 'qcf' | 'qcb' | 'dp' | 'duck' | 'super',
    button: number,
  ): void {
    const f = this.forward;
    const d = Btn.Down;
    // 超必杀是 236236 + A+C：方向要走两遍，最后一帧同时按两个拳键
    const frames =
      motion === 'qcf'
        ? [d, d | f, f | button]
        : motion === 'qcb'
          ? [d, d | this.back, this.back | button]
          : motion === 'dp'
            ? [f, d, d | f | button]
            : motion === 'super'
              ? [d, d | f, f, d, d | f, f | Btn.A | Btn.C]
              : [d, d | this.back, d | button];
    this.queue.push(...frames);
  }

  /** 每帧产出一次输入 */
  step(): InputSample {
    const me = this.me;
    const foe = this.foe;

    if (me.isDead || foe.isDead) return { held: 0 };
    if (this.queue.length > 0) return { held: this.queue.shift()! };

    if (this.cooldown > 0) this.cooldown--;
    if (this.moveTimer > 0) this.moveTimer--;

    const dist = Math.abs(foe.x - me.x);

    // 反应延迟：看到对手出招后先等 reaction 帧
    if (foe.isAttacking && dist < 96) {
      if (this.reactTimer < this.profile.reaction) {
        this.reactTimer++;
        return { held: 0 };
      }
      // 对手放必杀/超必杀时优先翻滚：硬防会被磨血，翻滚还能绕到背后
      const bigMove = foe.move?.kind === 'special' || foe.move?.kind === 'super';
      if (bigMove && this.rand() < this.profile.dodgeChance) {
        this.queue.push(Btn.A | Btn.B); // A+B = 回避
        this.reactTimer = 0;
      } else if (this.rand() < this.profile.guardChance) {
        const crouch = this.rand() < 0.35 ? Btn.Down : 0;
        this.queue.push(this.back | crouch, this.back | crouch, this.back | crouch);
        this.reactTimer = 0;
      }
      return { held: this.queue.shift() ?? 0 };
    }
    this.reactTimer = 0;

    // 对手在空中且贴得近 → 对空
    if (foe.airborne && dist < 70 && this.rand() < this.profile.antiAirChance) {
      this.queue.push(Btn.Up | this.forward, this.forward, this.forward | Btn.C);
      return { held: this.queue.shift()! };
    }

    // 太远就走近（要走到"普通技真的够得着"的距离，不然会一直挥空）
    if (dist > ATTACK_RANGE - 4 && this.moveTimer === 0) {
      const frames = this.between(this.profile.moveGap[0], this.profile.moveGap[1]);
      for (let i = 0; i < frames; i++) this.queue.push(this.forward);
      this.moveTimer = frames;
      return { held: this.queue.shift()! };
    }

    // 贴太紧退半步（给自己出招空间）
    if (dist < MIN_RANGE && this.rand() < 0.3) {
      this.queue.push(this.back, this.back);
      return { held: this.queue.shift()! };
    }

    // 对手一直缩着防 → 用 C+D 吹飞破防（普通拳脚会被一直挡住）
    if (dist <= ATTACK_RANGE && foe.state === FighterState.Block && this.cooldown === 0 && this.rand() < this.profile.crushChance) {
      this.cooldown = this.between(this.profile.attackGap[0], this.profile.attackGap[1]) + 12;
      this.queue.push(Btn.C | Btn.D); // C+D = 吹飞攻击
      return { held: this.queue.shift()! };
    }

    // 在攻击距离内且冷却好了 → 出招
    if (dist <= ATTACK_RANGE && this.cooldown === 0 && this.rand() < this.profile.aggression) {
      this.cooldown = this.between(this.profile.attackGap[0], this.profile.attackGap[1]);
      // 气满了先考虑超必杀：原来 CPU 攒满气也只会普通必杀，等于把资源浪费掉
      const canSuper = this.me.meter >= SUPER_METER && this.rand() < this.profile.superChance;
      if (canSuper) {
        this.queueMotion('super', Btn.A);
      } else if (this.rand() < this.profile.specialChance) {
        // 距离决定招式：远了发波、近了升龙（原来纯随机，远了还搓升龙等于空挥）
        const far = dist > ATTACK_RANGE * 0.7;
        const roll = this.rand();
        const motion = far ? (roll < 0.75 ? 'qcf' : 'qcb') : roll < 0.35 ? 'dp' : roll < 0.7 ? 'qcf' : 'qcb';
        const button = this.rand() < 0.5 ? Btn.A : Btn.C;
        this.queueMotion(motion, button);
      } else {
        const button = [Btn.A, Btn.B, Btn.C, Btn.D][Math.floor(this.rand() * 4)]!;
        const crouch = this.rand() < 0.3 ? Btn.Down : 0;
        this.queue.push(button | crouch);
      }
      return { held: this.queue.shift()! };
    }

    return { held: 0 };
  }
}
