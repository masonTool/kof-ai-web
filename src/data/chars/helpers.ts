/**
 * 角色数据的两个小工具：造判定、造招式。
 *
 * 招式表是纯数据，但每一项都要写全十几个字段；用这两个函数把"默认值"收在一处，
 * 数据文件里只写跟别人不一样的地方——加角色时能少写一半，也少一半写错的机会。
 */
import type { HitDef, MoveDef } from '../schema';

/** 造一条判定：不写的字段用"中段中伤"做默认 */
export function hit(id: string, over: Partial<HitDef> = {}): HitDef {
  return {
    id,
    box: { x: 12, y: -62, w: 26, h: 12 },
    frames: [3, 5],
    damage: 25,
    hitStun: 13,
    blockStun: 8,
    hitstop: 5,
    guard: 'high',
    level: 'mid',
    pushback: 3,
    blockPushback: 2,
    ...over,
  };
}

/** 造一个招式：`id` 必须与 moves 里的键一致（`validateChar` 会查） */
export function mv(
  key: string,
  name: string,
  anim: string,
  total: number,
  kind: MoveDef['kind'],
  hits: HitDef[],
  over: Partial<MoveDef> = {},
): MoveDef {
  return { id: key, name, anim, total, kind, hits, ...over };
}
