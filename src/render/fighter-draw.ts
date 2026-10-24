/**
 * 程序化角色绘制：把一帧姿势画成一个有描边、有色板、有前后层次的小人。
 *
 * 取舍：不做逐像素手绘（版权 + 工作量），走"纸片人"路线——粗描边、圆头粗肢、
 * 靠色板与姿势区分角色。绘制全部相对脚底原点，朝右书写，朝左由 `scale(-1,1)` 镜像。
 */
import type { Palette } from '../data/schema';
import type { Ctx2D } from './ctx';
import { resolvePose, type Point, type PoseFrame } from './poses';

const OUTLINE = '#0c0a09';
const HEAD_RADIUS = 7;

/** 把 #rgb / #rrggbb 按系数调暗（做"远侧肢体"的阴影色） */
export function shade(hex: string, k: number): string {
  const m = hex.trim();
  const full = m.length === 4 ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : m;
  const num = Number.parseInt(full.slice(1, 7), 16);
  if (Number.isNaN(num)) return hex;
  const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((num >> 16) & 0xff) * k);
  const g = clamp(((num >> 8) & 0xff) * k);
  const b = clamp((num & 0xff) * k);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function limb(ctx: Ctx2D, from: Point, to: Point, width: number, color: string): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = width + 2;
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(to[0], to[1]);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(to[0], to[1]);
  ctx.stroke();
}

function disc(ctx: Ctx2D, at: Point, radius: number, color: string, outline = false): void {
  ctx.beginPath();
  ctx.arc(at[0], at[1], radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

export interface PoseDrawOptions {
  /** 命中闪白 */
  flash?: boolean;
}

export function drawPose(ctx: Ctx2D, frame: PoseFrame, palette: Palette, opts: PoseDrawOptions = {}): void {
  const flash = opts.flash === true;
  const pick = (c: string): string => (flash ? '#ffffff' : c);

  const skin = pick(palette.skin);
  const primary = pick(palette.primary);
  const secondary = pick(palette.secondary);
  const hair = pick(palette.hair);
  const trim = pick(palette.trim);

  // 落地影子（脚底）
  ctx.beginPath();
  ctx.moveTo(-13, 0);
  ctx.lineTo(0, -3);
  ctx.lineTo(13, 0);
  ctx.lineTo(0, 3);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();

  // 远侧肢体先画（压暗；闪白时一并不压暗，否则闪不出来）
  const dim = (c: string): string => (flash ? '#ffffff' : shade(c, 0.62));
  limb(ctx, frame.hip, frame.legBack[0]!, 6, dim(secondary));
  limb(ctx, frame.legBack[0]!, frame.legBack[1]!, 5, dim(secondary));
  limb(ctx, frame.neck, frame.armBack[0]!, 5, dim(primary));
  limb(ctx, frame.armBack[0]!, frame.armBack[1]!, 4, dim(skin));

  // 躯干（外套）+ 腰带
  limb(ctx, frame.hip, frame.neck, 13, primary);
  limb(ctx, frame.hip, frame.neck, 4, trim);

  // 近侧肢体
  limb(ctx, frame.hip, frame.legFront[0]!, 6, secondary);
  limb(ctx, frame.legFront[0]!, frame.legFront[1]!, 5, secondary);
  limb(ctx, frame.neck, frame.armFront[0]!, 5, primary);
  limb(ctx, frame.armFront[0]!, frame.armFront[1]!, 4, skin);

  // 头：先画后脑（发色），再画脸，最后一只眼睛
  disc(ctx, [frame.head[0] - 1, frame.head[1] - 1], HEAD_RADIUS + 1, hair, true);
  disc(ctx, [frame.head[0] + 1.5, frame.head[1] + 1], HEAD_RADIUS - 1, skin);
  disc(ctx, [frame.head[0] + 4.5, frame.head[1] - 1], 1.4, flash ? '#ffffff' : OUTLINE);
}

export interface FighterVisual {
  palette: Palette;
  facing: 1 | -1;
  x: number;
  y: number;
  /** 动画名（招式数据里的 anim，或状态映射得到的默认动画） */
  anim: string;
  /** 该动画已播放的帧数 */
  elapsed: number;
  /** 整个动画多长（出招时传招式 total，关键帧会按比例铺满） */
  duration?: number;
  flash?: boolean;
  alpha?: number;
  scale?: number;
}

export function drawFighter(ctx: Ctx2D, v: FighterVisual): void {
  const s = v.scale ?? 1;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, v.alpha ?? 1));
  ctx.translate(v.x, v.y);
  ctx.scale(v.facing * s, s);
  drawPose(ctx, resolvePose(v.anim, v.elapsed, v.duration), v.palette, { flash: v.flash });
  ctx.restore();
}
