/**
 * 程序化角色绘制：把一帧姿势画成一个有描边、有色板、有前后层次的小人。
 *
 * 取舍：不做逐像素手绘（版权 + 工作量），走"纸片人"路线——粗描边、圆头粗肢、
 * 靠色板与姿势区分角色。绘制全部相对脚底原点，朝右书写，朝左由 `scale(-1,1)` 镜像。
 */
import type { Palette } from '../data/schema';
import type { Ctx2D } from './ctx';
import { DEFAULT_LOOK, type Look } from './looks';
import { spriteFor } from './assets';
import { easeForAnim, isAttackAnim, poseFrameIndex, resolvePose, type Point, type PoseFrame } from './poses';

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
  /** 外观（身高/壮实/发型/配件） */
  look?: Look;
  /** 当前动画名（决定是否画挥击拖尾） */
  anim?: string;
}

export function drawPose(ctx: Ctx2D, frame: PoseFrame, palette: Palette, opts: PoseDrawOptions = {}): void {
  const flash = opts.flash === true;
  const look = opts.look ?? DEFAULT_LOOK;
  const pick = (c: string): string => (flash ? '#ffffff' : c);

  const skin = pick(palette.skin);
  const primary = pick(palette.primary);
  const secondary = pick(palette.secondary);
  const hair = pick(palette.hair);
  const trim = pick(palette.trim);

  // 身高：以脚底为原点纵向缩放，脚不会离地
  if (look.height !== 1) {
    ctx.save();
    ctx.scale(1, look.height);
  }

  // 落地影子（脚底）
  ctx.beginPath();
  ctx.moveTo(-13, 0);
  ctx.lineTo(0, -3);
  ctx.lineTo(13, 0);
  ctx.lineTo(0, 3);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();

  const b = look.build;
  // 远侧肢体先画（压暗；闪白时一并不压暗，否则闪不出来）
  const dim = (c: string): string => (flash ? '#ffffff' : shade(c, 0.62));
  limb(ctx, frame.hip, frame.legBack[0]!, 6 * b, dim(secondary));
  limb(ctx, frame.legBack[0]!, frame.legBack[1]!, 5 * b, dim(secondary));
  limb(ctx, frame.neck, frame.armBack[0]!, 5 * b, dim(primary));
  limb(ctx, frame.armBack[0]!, frame.armBack[1]!, 4 * b, dim(skin));

  // 躯干（外套）+ 腰带
  limb(ctx, frame.hip, frame.neck, 13 * b, primary);
  limb(ctx, frame.hip, frame.neck, 4 * b, trim);

  // 近侧肢体
  limb(ctx, frame.hip, frame.legFront[0]!, 6 * b, secondary);
  limb(ctx, frame.legFront[0]!, frame.legFront[1]!, 5 * b, secondary);
  limb(ctx, frame.neck, frame.armFront[0]!, 5 * b, primary);
  limb(ctx, frame.armFront[0]!, frame.armFront[1]!, 4 * b, skin);

  // 挥击拖尾：从拳/脚沿前臂方向拉一条渐隐光带。
  // 插值之后手的位置是连续的，这条带子就把"挥过去"这件事画出来了。
  if (opts.anim !== undefined && isAttackAnim(opts.anim)) {
    const trail = (elbow: Point, hand: Point, color: string, width: number): void => {
      const dx = hand[0] - elbow[0];
      const dy = hand[1] - elbow[1];
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      for (let i = 0; i < 3; i++) {
        const back = 6 + i * 5;
        const fade = 0.26 - i * 0.07;
        ctx.strokeStyle = color;
        ctx.globalAlpha = Math.max(0.04, fade);
        ctx.lineWidth = width - i * 1.2;
        ctx.beginPath();
        ctx.moveTo(hand[0] - ux * back, hand[1] - uy * back);
        ctx.lineTo(hand[0], hand[1]);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    trail(frame.armFront[0], frame.armFront[1], '#ffffff', 4);
    trail(frame.legFront[0], frame.legFront[1], '#ffe9c8', 4.5);
  }

  drawHead(ctx, frame, { skin, hair, trim, flash, look });
  drawAccessory(ctx, frame, { trim, hair, look, flash });

  if (look.height !== 1) ctx.restore();
}

/** 头发 + 脸 + 眼睛 */
function drawHead(
  ctx: Ctx2D,
  frame: PoseFrame,
  opts: { skin: string; hair: string; trim: string; flash: boolean; look: Look },
): void {
  const { skin, hair, flash, look } = opts;
  const r = HEAD_RADIUS * look.head;
  const hx = frame.head[0];
  const hy = frame.head[1];

  // 后脑/头发（秃头角色不画）
  if (look.hair !== 'bald') {
    disc(ctx, [hx - 1, hy - 1], r + 1, hair, true);

    if (look.hair === 'spiky') {
      // 三根发尖：三角填充比圆更"刺"
      for (const [dx, h] of [[-4, 8], [0, 10], [4, 8]] as const) {
        ctx.beginPath();
        ctx.moveTo(hx + dx - 2.6, hy - r + 1.5);
        ctx.lineTo(hx + dx, hy - r - h);
        ctx.lineTo(hx + dx + 2.6, hy - r + 1.5);
        ctx.closePath();
        ctx.fillStyle = hair;
        ctx.fill();
      }
    } else if (look.hair === 'long') {
      // 后披的长发：从后脑垂到肩上
      ctx.beginPath();
      ctx.moveTo(hx - r - 1, hy - r + 2);
      ctx.lineTo(hx - r - 3.5, hy + r + 10);
      ctx.lineTo(hx - r + 3, hy + r + 11);
      ctx.lineTo(hx - r + 2, hy - r + 4);
      ctx.closePath();
      ctx.fillStyle = hair;
      ctx.fill();
    } else if (look.hair === 'ponytail') {
      // 马尾：脑后一束扎起来
      ctx.beginPath();
      ctx.moveTo(hx - r, hy - 2);
      ctx.lineTo(hx - r - 8, hy + 2);
      ctx.lineTo(hx - r - 6, hy + 7);
      ctx.lineTo(hx - r, hy + 4);
      ctx.closePath();
      ctx.fillStyle = hair;
      ctx.fill();
    }
  }

  // 脸
  disc(ctx, [hx + 1.5, hy + 1], r - 1, skin);
  // 眼睛
  disc(ctx, [hx + 4.5, hy - 1], 1.4, flash ? '#ffffff' : OUTLINE);
}

/** 配件：头带 / 帽子 / 面罩 / 墨镜 */
function drawAccessory(
  ctx: Ctx2D,
  frame: PoseFrame,
  opts: { trim: string; hair: string; look: Look; flash: boolean },
): void {
  const { trim, look, flash } = opts;
  if (look.accessory === 'none') return;
  const r = HEAD_RADIUS * look.head;
  const hx = frame.head[0];
  const hy = frame.head[1];
  const ink = flash ? '#ffffff' : OUTLINE;

  if (look.accessory === 'headband') {
    ctx.strokeStyle = trim;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(hx - r, hy - 2.4);
    ctx.lineTo(hx + r, hy - 2.4);
    ctx.stroke();
  } else if (look.accessory === 'hat') {
    // 帽檐 + 帽顶
    ctx.strokeStyle = trim;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(hx - r - 2, hy - r + 1.5);
    ctx.lineTo(hx + r + 3, hy - r + 1.5);
    ctx.stroke();
    ctx.fillStyle = trim;
    ctx.beginPath();
    ctx.arc(hx, hy - r + 1, r * 0.9, Math.PI, Math.PI * 2);
    ctx.fill();
  } else if (look.accessory === 'mask') {
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.moveTo(hx - r + 2, hy + 1);
    ctx.lineTo(hx + r, hy + 1);
    ctx.lineTo(hx + r - 2, hy + r - 1);
    ctx.lineTo(hx - r + 3, hy + r - 2);
    ctx.closePath();
    ctx.fill();
  } else if (look.accessory === 'glasses') {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx - 0.5, hy - 1.5);
    ctx.lineTo(hx + r, hy - 1.5);
    ctx.stroke();
  }
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
  /** 外观（身高/壮实/发型/配件）；不传就用默认外观 */
  look?: Look;
  /** 角色 id：有自绘贴图时按它取图（没有就回落程序化绘制） */
  charId?: string;
  /** 贴图整体缩放（美术素材像素密度与 320×224 逻辑分辨率不一致时用） */
  spriteScale?: number;
}

export function drawFighter(ctx: Ctx2D, v: FighterVisual): void {
  const s = v.scale ?? 1;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, v.alpha ?? 1));
  ctx.translate(v.x, v.y);
  ctx.scale(v.facing * s, s);

  // 有自绘贴图就用贴图，没有就画骨架——两条路共用同一套坐标与镜像
  const sprite = v.charId ? spriteFor(v.charId, v.anim, poseFrameIndex(v.anim, v.elapsed, v.duration)) : null;
  if (sprite) {
    const scale = v.spriteScale ?? 1;
    const w = sprite.sw * scale;
    const h = sprite.sh * scale;
    // 默认脚下中心对齐：贴图底边落在原点，水平居中
    const dx = sprite.offsetX ?? -w / 2;
    const dy = sprite.offsetY ?? -h;
    ctx.drawImage(sprite.image, sprite.sx, sprite.sy, sprite.sw, sprite.sh, dx, dy, w, h);
    if (v.flash === true) {
      // 贴图也要能闪白：用一张半透明白盖在贴图矩形上
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(dx, dy, w, h);
    }
  } else {
    drawPose(ctx, resolvePose(v.anim, v.elapsed, v.duration, easeForAnim(v.anim)), v.palette, {
      flash: v.flash,
      look: v.look,
      anim: v.anim,
    });
  }
  ctx.restore();
}
