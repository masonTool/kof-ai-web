/**
 * 物理：空中积分、舞台夹取、推挤盒互推。
 *
 * 只认结构化的小接口（`PhysicsBody` / `PushBody`），不 import `Fighter`——
 * 这样物理可以单独测，也不会和 Fighter 形成循环依赖。
 */
import { GRAVITY, GROUND_Y, STAGE_LEFT, STAGE_RIGHT } from './constants';

export interface PhysicsBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  airborne: boolean;
}

export interface PushBody {
  x: number;
  airborne: boolean;
  /** 推挤盒宽度（以 x 为中心） */
  pushWidth: number;
}

/** 角色没配推挤盒时的默认宽度 */
export const DEFAULT_PUSH_WIDTH = 24;

/**
 * 空中一帧：先按速度位移，再加一帧重力，最后判地面。
 * 返回 true = 这一帧落地（位置已经贴回地面、vy 归零）。
 */
export function integrateAir(body: PhysicsBody, groundY = GROUND_Y): boolean {
  body.x += body.vx;
  body.y += body.vy;
  body.vy += GRAVITY;
  if (body.y >= groundY) {
    body.y = groundY;
    body.vy = 0;
    return true;
  }
  return false;
}

/** 把 x 夹进舞台；返回是否真的被夹住（调用方据此清零水平速度） */
export function clampStageX(body: { x: number }, left = STAGE_LEFT, right = STAGE_RIGHT): boolean {
  if (body.x < left) {
    body.x = left;
    return true;
  }
  if (body.x > right) {
    body.x = right;
    return true;
  }
  return false;
}

/** 两个角色的推挤盒是否相交 */
export function overlapsPush(a: PushBody, b: PushBody): boolean {
  return Math.abs(b.x - a.x) < (a.pushWidth + b.pushWidth) / 2;
}

/** 移动并夹取，返回实际位移量 */
function moveClamped(body: PushBody, dx: number): number {
  const before = body.x;
  body.x += dx;
  clampStageX(body);
  return body.x - before;
}

/**
 * 互推：两个站在地上的角色不允许重叠（KOF 里"人不能穿过人"）。
 * 空中不推——跳过去要能过人。
 * 一方贴墙时，它推不动的那部分全部压给另一方（否则两人会卡在墙角重叠）。
 * 返回是否发生了位移。
 */
export function resolvePush(a: PushBody, b: PushBody): boolean {
  if (a.airborne || b.airborne) return false;

  const minGap = (a.pushWidth + b.pushWidth) / 2;
  const dir = b.x >= a.x ? 1 : -1;
  const overlap = minGap - Math.abs(b.x - a.x);
  if (overlap <= 0) return false;

  const half = overlap / 2;
  const aMoved = moveClamped(a, -dir * half);
  const bMoved = moveClamped(b, dir * half);

  const rest = minGap - Math.abs(b.x - a.x);
  if (rest > 1e-9) {
    const aHadRoom = Math.abs(aMoved) >= half - 1e-9;
    const bHadRoom = Math.abs(bMoved) >= half - 1e-9;
    if (aHadRoom && !bHadRoom) moveClamped(a, -dir * rest);
    else if (bHadRoom && !aHadRoom) moveClamped(b, dir * rest);
  }
  return true;
}

/** 一组角色两两互推（一次遍历足够：角色数只有 2，人多时再考虑按 x 排序） */
export function resolvePushAll(bodies: readonly PushBody[]): void {
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      resolvePush(bodies[i]!, bodies[j]!);
    }
  }
}
