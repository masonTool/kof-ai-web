/**
 * 角色花名册：选人界面按这个顺序摆格子，对战按 id 取角色。
 * 加角色 = 写完 `chars/<id>.ts` 之后往这里加一行。
 */
import type { CharDef } from '../schema';
import { IORI } from './iori';
import { KYO } from './kyo';

export const ROSTER: readonly CharDef[] = [KYO, IORI];

export function charById(id: string): CharDef | undefined {
  return ROSTER.find((c) => c.id === id);
}

export { KYO, IORI };
