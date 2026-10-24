/**
 * 招式选择：把"这一帧按了什么"翻译成一个具体的 `MoveDef`。
 *
 * 这是连接"输入"与"帧数据"的那一层，之前缺失，导致按 A/B/C/D 完全没有反应。
 *
 * 优先级（KOF 的规矩）：超必杀 > 必杀 > 指令技 > 投技 > 系统技 > 通常技。
 * 同一帧既满足 CD 又满足 5C 时出 CD；贴身的 6C 是投技，远一点就退化成 5C。
 */
import { Btn, axisY, type InputState } from '../core/input';
import type { MoveDef } from '../data/schema';
import { CommandParser } from '../input/parser';
import type { Fighter } from './fighter';
import { FighterState, canAct } from './state';

/** 投技要贴多近（两人中心距） */
export const THROW_RANGE = 46;

/** 小的先出 */
const KIND_ORDER: Record<MoveDef['kind'], number> = {
  super: 0,
  special: 1,
  // 系统技（AB 回避 / CD 吹飞）要压过指令技：按住前 + A+B 应该是前转，不是 6B
  system: 2,
  command: 3,
  throw: 4,
  normal: 5,
};

const BUTTONS: readonly { bit: number; key: string }[] = [
  { bit: Btn.A, key: 'A' },
  { bit: Btn.B, key: 'B' },
  { bit: Btn.C, key: 'C' },
  { bit: Btn.D, key: 'D' },
];

const ATTACK_MASK = Btn.A | Btn.B | Btn.C | Btn.D;

/** 当前姿态下的通常技键名：jA / 2A / 5A */
export function normalKeyFor(f: Fighter, pressed: number, held: number): string | null {
  const prefix = f.airborne ? 'j' : axisY(held) === 1 ? '2' : '5';
  for (const b of BUTTONS) {
    if ((pressed & b.bit) !== 0) return prefix + b.key;
  }
  return null;
}

/** 这招现在能不能用（距离/气槽/对手状态） */
export function requirementsMet(f: Fighter, move: MoveDef, opponent: Fighter | null): boolean {
  if (move.meterCost !== undefined && move.meterCost > 0 && f.meter < move.meterCost) return false;
  if (move.kind === 'throw') {
    if (!opponent || opponent.isDead || opponent.airborne) return false;
    if (Math.abs(opponent.x - f.x) > THROW_RANGE) return false;
  }
  return true;
}

/**
 * 每个角色一份：攒指令历史 + 选出这一帧要出的招。
 * （指令历史必须每帧都喂，哪怕正在出招/受击，否则连段里的指令会断。）
 */
export class FighterControls {
  readonly parser: CommandParser;

  constructor(private readonly fighter: Fighter) {
    this.parser = new CommandParser(fighter.facing);
  }

  /** 每帧先喂输入（朝向同步，摇杆指令才能反过来识别） */
  feed(input: InputState): void {
    this.parser.setFacing(this.fighter.facing);
    this.parser.push(input);
  }

  /**
   * 选出这一帧该出的招。
   * `allow` 用来收窄候选（比如出招中只允许取消表里的招式）。
   */
  pick(opponent: Fighter | null, allow?: (move: MoveDef) => boolean): MoveDef | null {
    const f = this.fighter;
    const input = this.parser.current;
    const pressed = input.pressed & ATTACK_MASK;
    if (pressed === 0) return null;
    // 按住上要先起跳：跳的那一帧不直接出地面招
    if (!f.airborne && axisY(input.held) === -1) return null;

    const candidates: MoveDef[] = [];

    // 1) 数据驱动的招式（必杀 / 超必杀 / 指令技 / 投技）
    for (const move of Object.values(f.char.moves)) {
      if (move.input === undefined) continue;
      if (!this.parser.match(move.input)) continue;
      if (!requirementsMet(f, move, opponent)) continue;
      candidates.push(move);
    }

    // 2) 系统技：CD 吹飞（C+D 同帧）、AB 紧急回避（A+B 同帧）
    const cd = f.char.moves['CD'];
    if (cd && (pressed & (Btn.C | Btn.D)) === (Btn.C | Btn.D)) candidates.push(cd);
    const dodge = f.char.moves['AB'];
    if (dodge && (pressed & (Btn.A | Btn.B)) === (Btn.A | Btn.B)) candidates.push(dodge);

    // 3) 通常技（站/蹲/空 三套由姿态推导）
    const normalKey = normalKeyFor(f, pressed, input.held);
    const normal = normalKey ? f.char.moves[normalKey] : undefined;
    if (normal) candidates.push(normal);

    const buttonCount = (m: MoveDef): number => m.input?.buttons?.length ?? 0;
    candidates.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || buttonCount(b) - buttonCount(a));

    for (const move of candidates) {
      if (allow && !allow(move)) continue;
      return move;
    }
    return null;
  }
}

/**
 * 现在能不能因为"按键"而进入新招式。
 * 注意空中（Jump）也算——`canAct()` 只覆盖地面中立，空中招要靠这条放行。
 */
export function acceptsMoveInput(f: Fighter): boolean {
  if (f.isAttacking) return true;
  if (f.airborne) return f.state === FighterState.Jump;
  return canAct(f.state);
}
