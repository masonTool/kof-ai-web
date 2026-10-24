/**
 * 角色花名册：选人界面按这个顺序摆格子，对战按 id 取角色。
 * 加角色 = 写完 `chars/<id>.ts` 之后往这里加一行。
 */
import type { CharDef } from '../schema';
import { ANDY } from './andy';
import { ATHENA } from './athena';
import { BILLY } from './billy';
import { CHANG } from './chang';
import { CHIN } from './chin';
import { EIJI } from './eiji';
import { CHOI } from './choi';
import { KENSOU } from './kensou';
import { KIM } from './kim';
import { SHINGO } from './shingo';
import { BENIMARU } from './benimaru';
import { DAIMON } from './daimon';
import { CLARK } from './clark';
import { IORI } from './iori';
import { JOE } from './joe';
import { KYO } from './kyo';
import { LEONA } from './leona';
import { RALF } from './ralf';
import { ROBERT } from './robert';
import { RYO } from './ryo';
import { TERRY } from './terry';
import { YURI } from './yuri';

export const ROSTER: readonly CharDef[] = [
  KYO,
  IORI,
  BENIMARU,
  DAIMON,
  TERRY,
  ANDY,
  JOE,
  RYO,
  ROBERT,
  YURI,
  LEONA,
  RALF,
  CLARK,
  ATHENA,
  KENSOU,
  CHIN,
  KIM,
  CHANG,
  CHOI,
  BILLY,
  EIJI,
  SHINGO,
];

export function charById(id: string): CharDef | undefined {
  return ROSTER.find((c) => c.id === id);
}

export {
  KYO,
  IORI,
  BENIMARU,
  DAIMON,
  TERRY,
  ANDY,
  JOE,
  RYO,
  ROBERT,
  YURI,
  LEONA,
  RALF,
  CLARK,
  ATHENA,
  KENSOU,
  CHIN,
  KIM,
  CHANG,
  CHOI,
  BILLY,
  EIJI,
  SHINGO,
};
