/**
 * 纯几何：盒与盒的关系。不含角色逻辑，方便单测。
 * 坐标约定与 `data/schema.ts` 一致：世界坐标，y 向下。
 */
import type { Box } from '../data/schema';

/** 两个盒是否相交（边贴边不算，避免 0 面积误判） */
export function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** 交点面积；0 表示不相交 */
export function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function containsPoint(box: Box, px: number, py: number): boolean {
  return px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h;
}

export function centerOf(box: Box): { x: number; y: number } {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

/** 两个盒的水平间隙（负数 = 有重叠） */
export function gapX(a: Box, b: Box): number {
  if (a.x + a.w < b.x) return b.x - (a.x + a.w);
  if (b.x + b.w < a.x) return a.x - (b.x + b.w);
  return -Math.min(a.x + a.w, b.x + b.w) + Math.max(a.x, b.x);
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function boxFromCorner(x: number, y: number, w: number, h: number): Box {
  return { x, y, w, h };
}
