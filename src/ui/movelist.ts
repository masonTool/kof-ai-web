/**
 * 招式清单：从 `char.moves` 直接生成，不在数据里另写一份。
 *
 * 玩家看不懂 `'236A'` 这种 id，也记不住十几个日文名——需要一个"当前角色会什么、
 * 怎么按"的清单，而且要和对局里真正判定用的数据同源，否则改了招式忘了改清单更糟。
 */
import type { ButtonId, CharDef, InputSpec, MotionId } from '../data/schema';

export type MoveKindLabel = '必杀技' | '超必杀';

export interface MoveEntry {
  id: string;
  name: string;
  /** 人类可读的指令，例如 `↓↘→ + A` */
  cmd: string;
  kind: MoveKindLabel;
  /** 需要多少气（超必杀才 > 0） */
  meter: number;
}

const MOTION_TEXT: Record<MotionId, string> = {
  none: '',
  '236': '↓↘→',
  '214': '↓↙←',
  '421': '←↓↙',
  '623': '→↓↘',
  '41236': '←↓↘→',
  '63214': '→↓↙←',
  '236236': '↓↘→↓↘→',
  '214214': '↓↙←↓↙←',
  '2363214': '↓↘→↓↙←',
  '22': '↓↓',
  doubleTapF: '→→',
  doubleTapB: '←←',
  chargeBack: '蓄←',
  chargeDown: '蓄↓',
  '6': '→',
  '4': '←',
  '2': '↓',
  '8': '↑',
  '3': '↘',
  '1': '↙',
};

/**
 * 按钮显示：`P`/`K` 是"任意拳/任意脚"的占位写法，
 * 清单里直接展开成 A/C 与 B/D 更接近玩家的实际按法。
 */
function buttonText(buttons: readonly ButtonId[] | undefined): string {
  if (!buttons || buttons.length === 0) return '';
  return buttons.map((b) => (b === 'A' ? 'A' : b === 'C' ? 'C' : b === 'B' ? 'B' : 'D')).join('+');
}

/** 指令文本：没写 input 的（比如 MAX 发动）返回空字符串 */
export function commandText(input: InputSpec | undefined): string {
  if (!input) return '';
  const motion = MOTION_TEXT[input.motion] ?? '';
  const btn = buttonText(input.buttons);
  if (motion && btn) return `${motion} + ${btn}`;
  return motion || btn;
}

/**
 * 生成清单：只收必杀与超必杀（普通技玩家自己会按），按"必杀 → 超必杀"分组，
 * 组内保持数据里的声明顺序（招式表的顺序就是设计好的推荐顺序）。
 */
export function moveListFor(char: CharDef): MoveEntry[] {
  const out: MoveEntry[] = [];
  for (const move of Object.values(char.moves)) {
    if (move.kind !== 'special' && move.kind !== 'super') continue;
    out.push({
      id: move.id,
      name: move.name,
      cmd: commandText(move.input),
      kind: move.kind === 'super' ? '超必杀' : '必杀技',
      meter: move.meterCost ?? 0,
    });
  }
  // 稳定排序：必杀在前、超必杀在后，同组保持声明顺序
  return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === '必杀技' ? -1 : 1));
}
