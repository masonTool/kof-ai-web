/**
 * HUD：对齐 KOF97 的布局（血条在上、气槽在下、计时器在中）。
 *
 * 分工：**模型是纯函数**（比例、计时文本、连击文本、每块的位置），绘制只负责把模型画出来。
 * 这样"血量 0 时血条宽度必须是 0"这类事能在 node 里直接断言，不用看截图。
 */
import { VIEW_HEIGHT, VIEW_WIDTH } from '../sim/constants';
import type { Ctx2D } from './ctx';
import { KO_CUT_FRAMES } from '../game/match';

export interface PlayerHud {
  name: string;
  hp: number;
  maxHp: number;
  meter: number;
  maxMeter: number;
  /** 队伍还剩几人（血条下方的小方块） */
  teamLeft: number;
  /** 已赢回合数（血条上方的星） */
  wins: number;
  /** 被 KO：血条全空并转红 */
  ko?: boolean;
  /** 正在 MAX 模式（气槽满档启动，攻击力提升） */
  maxMode?: boolean;
  /** 掉血残影比例（延迟下降的红色部分），不传就等于当前血量比例 */
  trail?: number;
}

export interface HudModel {
  /** 剩余秒数；KOF97 是 99 递减 */
  timer: number;
  p1: PlayerHud;
  p2: PlayerHud;
  /** 连击提示（>= 2 段才显示） */
  combo?: { side: 1 | 2; hits: number; damage?: number };
  /** 中央大字：KO / TIME UP / 胜负提示 */
  banner?: string;
  /** KO 演出剩余帧（>0 时大字更大、并压一层白） */
  koCut?: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 布局常量（改版式只改这里） */
/**
 * HUD 布局。
 *
 * 这一版按"饱满 + 避开手台"重排：
 * - 血条从 9px 加高到 18px（原来细得像一条线，上半屏看着发空）
 * - 气槽从**底部**挪到**各自血条正下方**：原来在 `VIEW_HEIGHT - 13`，
 *   正好被左下的摇杆和右下的四键完全盖住——玩家根本看不到自己的气
 * - 名字放进血条内、左/右对齐，省掉一行
 * - 时钟加底板，不再悬在空中
 */
export const HUD_LAYOUT = {
  barY: 8,
  barH: 18,
  barW: 148,
  margin: 6,
  /** 名字画在血条内部，距血条顶几像素 */
  nameInsetY: 5,
  /** 气槽：血条正下方，紧跟名字下面 */
  meterY: 30,
  meterH: 10,
  meterW: 148,
  comboY: 52,
  bannerY: 78,
} as const;

export const HUD_COLORS = {
  frame: '#05070a',
  barBack: '#2a2016',
  barFill: '#f2cf3a',
  barLow: '#e8573f',
  trail: '#a8301f',
  meterBack: '#141c28',
  meterFill: '#5fd0f2',
  meterMax: '#ffd166',
  text: '#f2f0e6',
  shadow: 'rgba(0,0,0,0.7)',
} as const;

const clamp01 = (v: number): number => (v <= 0 ? 0 : v >= 1 ? 1 : v);

/** 血量比例（夹在 0~1；maxHp <= 0 视为空） */
export function hpRatio(p: PlayerHud): number {
  if (p.maxHp <= 0) return 0;
  return clamp01(p.hp / p.maxHp);
}

export function meterRatio(p: PlayerHud): number {
  if (p.maxMeter <= 0) return 0;
  return clamp01(p.meter / p.maxMeter);
}

/** 计时器文本：固定两位，夹在 0~99 */
export function formatTimer(seconds: number): string {
  const s = Math.max(0, Math.min(99, Math.floor(seconds)));
  return s.toString().padStart(2, '0');
}

/** 连击文本：0/1 段不显示（KOF 只在 2 段起提示） */
export function comboLabel(hits: number): string | null {
  if (!Number.isFinite(hits) || hits < 2) return null;
  return `${Math.floor(hits)} HITS`;
}

/** 血条区域：P1 靠左，P2 靠右 */
export function hpBarLayout(side: 1 | 2): Rect {
  const w = HUD_LAYOUT.barW;
  return {
    x: side === 1 ? HUD_LAYOUT.margin : VIEW_WIDTH - HUD_LAYOUT.margin - w,
    y: HUD_LAYOUT.barY,
    w,
    h: HUD_LAYOUT.barH,
  };
}

/** 气槽区域：P1 左下，P2 右下 */
export function meterBarLayout(side: 1 | 2): Rect {
  const w = HUD_LAYOUT.meterW;
  return {
    x: side === 1 ? HUD_LAYOUT.margin : VIEW_WIDTH - HUD_LAYOUT.margin - w,
    y: HUD_LAYOUT.meterY,
    w,
    h: HUD_LAYOUT.meterH,
  };
}

/**
 * 血条里"已失去"的部分画多宽（从内侧往外涨）：
 * 比例满 = 0，比例 0 = 整条。
 */
export function depletedWidth(rect: Rect, ratio: number): number {
  return Math.round(rect.w * (1 - clamp01(ratio)));
}

/**
 * 像素风文字（HUD / 横幅共用）。
 *
 * 导出给 `renderer.ts` 画招式横幅用：那层不属于 HUD，但必须是同一套字体度量，
 * 否则同屏两种字宽会很怪。
 */
export function text(ctx: Ctx2D, str: string, x: number, y: number, align: 'left' | 'center' | 'right', size: number, color: string): void {
  ctx.font = `${size}px monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillStyle = HUD_COLORS.shadow;
  ctx.fillText(str, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function drawHealthBar(ctx: Ctx2D, p: PlayerHud, side: 1 | 2): void {
  const rect = hpBarLayout(side);
  const ratio = hpRatio(p);

  // 外框
  ctx.fillStyle = HUD_COLORS.frame;
  ctx.fillRect(rect.x - 1, rect.y - 1, rect.w + 2, rect.h + 2);
  ctx.fillStyle = HUD_COLORS.barBack;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  // 掉血残影：从内侧（P1 的右侧）往内退
  const trail = clamp01(p.trail ?? ratio);
  if (trail > ratio) {
    const width = Math.round(rect.w * (trail - ratio));
    ctx.fillStyle = HUD_COLORS.trail;
    if (side === 1) ctx.fillRect(rect.x + Math.round(rect.w * ratio), rect.y, width, rect.h);
    else ctx.fillRect(rect.x + Math.round(rect.w * (1 - trail)), rect.y, width, rect.h);
  }

  // 血量本体：P1 从左往右缩，P2 从右往左缩
  const fillW = Math.round(rect.w * ratio);
  if (fillW > 0) {
    ctx.fillStyle = p.ko === true || ratio <= 0.25 ? HUD_COLORS.barLow : HUD_COLORS.barFill;
    if (side === 1) ctx.fillRect(rect.x, rect.y, fillW, rect.h);
    else ctx.fillRect(rect.x + rect.w - fillW, rect.y, fillW, rect.h);
  }

  // 名字
  text(
    ctx,
    p.name,
    side === 1 ? rect.x + 4 : rect.x + rect.w - 4,
    rect.y + HUD_LAYOUT.nameInsetY,
    side === 1 ? 'left' : 'right',
    10,
    HUD_COLORS.text,
  );

  // 队伍剩余人数（血条下方小方块）与胜场星
  // 人数方块放到气槽下面（原来在血条下方，现在那块地方被气槽占了）
  const iconY = HUD_LAYOUT.meterY + HUD_LAYOUT.meterH + 3;
  for (let i = 0; i < Math.max(0, p.teamLeft); i++) {
    const x = side === 1 ? rect.x + i * 7 : rect.x + rect.w - 5 - i * 7;
    ctx.fillStyle = HUD_COLORS.meterFill;
    ctx.fillRect(x, iconY, 5, 5);
  }
  for (let i = 0; i < Math.max(0, p.wins); i++) {
    const x = side === 1 ? rect.x + i * 8 : rect.x + rect.w - 6 - i * 8;
    ctx.fillStyle = HUD_COLORS.barFill;
    ctx.fillRect(x, rect.y - 7, 6, 5);
  }
}

function drawMeter(ctx: Ctx2D, p: PlayerHud, side: 1 | 2): void {
  const rect = meterBarLayout(side);
  const ratio = meterRatio(p);

  // 外框 + 内底色：加粗到 10px 之后必须有个深色底，不然满屏亮背景下看不出槽的边界
  ctx.fillStyle = HUD_COLORS.frame;
  ctx.fillRect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4);
  ctx.fillStyle = HUD_COLORS.meterBack;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  const fillW = Math.round(rect.w * ratio);
  if (fillW > 0) {
    ctx.fillStyle = ratio >= 1 ? HUD_COLORS.meterMax : HUD_COLORS.meterFill;
    const x = side === 1 ? rect.x : rect.x + rect.w - fillW;
    ctx.fillRect(x, rect.y, fillW, rect.h);
  }

  // 气槽亮边：气是 0 的时候槽体是纯深色，和背景糊在一起，必须靠描边看出"这里有个槽"
  ctx.strokeStyle = 'rgba(140,180,220,0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x - 0.5, rect.y - 0.5, rect.w + 1, rect.h + 1);

  // 状态字放进槽体内部（原来在 y-9，正好压在加高后的血条底边上）
  const active = p.maxMode === true;
  text(
    ctx,
    active ? 'MAX MODE' : ratio >= 1 ? 'MAX' : 'POWER',
    side === 1 ? rect.x + 4 : rect.x + rect.w - 4,
    rect.y + 2,
    side === 1 ? 'left' : 'right',
    7,
    active || ratio >= 1 ? HUD_COLORS.meterMax : HUD_COLORS.text,
  );
}

function drawTimer(ctx: Ctx2D, seconds: number): void {
  const label = formatTimer(seconds);
  const cx = VIEW_WIDTH / 2;
  ctx.fillStyle = HUD_COLORS.frame;
  ctx.fillRect(cx - 14, 2, 28, 16);
  text(ctx, label, cx, 5, 'center', 11, seconds <= 10 ? HUD_COLORS.barLow : HUD_COLORS.text);
}

export function drawHud(ctx: Ctx2D, model: HudModel): void {
  drawHealthBar(ctx, model.p1, 1);
  drawHealthBar(ctx, model.p2, 2);
  drawMeter(ctx, model.p1, 1);
  drawMeter(ctx, model.p2, 2);
  drawTimer(ctx, model.timer);

  const combo = model.combo ? comboLabel(model.combo.hits) : null;
  if (model.combo && combo) {
    const x = model.combo.side === 1 ? 62 : VIEW_WIDTH - 62;
    text(ctx, combo, x, HUD_LAYOUT.comboY, 'center', 12, HUD_COLORS.barFill);
    if (model.combo.damage !== undefined) {
      text(ctx, `${model.combo.damage} DMG`, x, HUD_LAYOUT.comboY + 14, 'center', 7, HUD_COLORS.text);
    }
  }

  if (model.banner) {
    const cut = model.koCut ?? 0;
    if (cut > 0) {
      // KO：字号从 44 收到 22（ease-out），同时压一层白再退掉——
      // 只放大不闪白会像"文字变大了"，加了闪白才有"被砸了一下"的感觉
      const t = 1 - cut / KO_CUT_FRAMES; // 0 → 1
      const size = Math.round(44 - 22 * Math.min(1, t * 1.6));
      const fade = Math.max(0, 1 - t * 2.4);
      if (fade > 0) {
        ctx.globalAlpha = 0.5 * fade;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
        ctx.globalAlpha = 1;
      }
      text(ctx, model.banner, VIEW_WIDTH / 2, HUD_LAYOUT.bannerY - size / 2 + 4, 'center', size, HUD_COLORS.text);
    } else {
      text(ctx, model.banner, VIEW_WIDTH / 2, HUD_LAYOUT.bannerY, 'center', 16, HUD_COLORS.text);
    }
  }
}
