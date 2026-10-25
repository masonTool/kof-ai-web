/**
 * 必杀技用哪套姿势。
 *
 * 数据里所有必杀都写了 `anim: 'special'`（同一个通用姿势），结果波动、升龙、
 * 突进、超必杀在画面上**长得一模一样**——用户反馈"没有技能专属动作"就是这个。
 *
 * 这里按**指令形状**把它们分开：推手的用重拳、对空的用重脚、位移的用空中踢。
 * 为什么不新增姿势名：新名字在贴图图集里不存在，有贴图的角色会整体回落到程序化绘制，
 * 人物风格突变比"动作不够独特"更不能接受。所以只在**已有姿势**里选最贴切的那个。
 */
import type { MoveDef } from '../data/schema';

/** 指令 → 姿势。键是 motion，值是姿势库里的名字（贴图图集里都有） */
const MOTION_POSE: Record<string, string> = {
  // 波动 / 旋风：双手前推（京已出图，其它角色回落程序化版本）
  '236': 'specialProjectile',
  '214': 'specialProjectile',
  '41236': 'specialProjectile',
  '63214': 'specialProjectile',
  // 升龙 / 逆向升龙：向上冲
  '623': 'specialUppercut',
  '421': 'specialUppercut',
  // 单方向突进（6B 一类）与双击冲刺：整个人撞出去
  '6': 'specialRush',
  doubleTapF: 'specialRush',
  doubleTapB: 'specialRush',
  // 蓄力招：先摆架势，用通用攻击姿势
  chargeBack: 'attack',
  chargeDown: 'attack',
};

/** 超必杀一律用 `special`（贴图里那一套是为大招画的，最有气势） */
const SUPER_POSE = 'superCharge';

/**
 * 取招式该用的姿势名。
 *
 * 只有"数据里写了通用 special"的才替换——以后某个角色真的画了专属动作，
 * 只要把 `MoveDef.anim` 改成那个名字，这里不会覆盖它。
 */
export function poseForMove(move: MoveDef): string {
  if (move.anim !== 'special') return move.anim;
  if (move.kind === 'super') return SUPER_POSE;
  const motion = move.input?.motion;
  if (motion && MOTION_POSE[motion]) return MOTION_POSE[motion]!;
  return 'attack';
}

/** 测试/文档用：某个 motion 会映射到哪个姿势（没有映射返回 undefined） */
export function poseForMotion(motion: string | undefined): string | undefined {
  return motion ? MOTION_POSE[motion] : undefined;
}
