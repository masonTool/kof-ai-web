/**
 * 各屏绘制：标题 / 选人 / VS / 结果。
 * 只吃 `Ctx2D`，所以能像 HUD 一样在 node 里用假 ctx 断言"画了什么"。
 */
import type { CharDef } from '../data/schema';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../sim/constants';
import type { AppFlow } from '../ui/flow';
import type { Ctx2D } from './ctx';
import { drawFighter } from './fighter-draw';

export const SCREEN_COLORS = {
  bg: '#0a0e1a',
  panel: '#111a2c',
  edge: '#2c3a55',
  text: '#f2f0e6',
  dim: '#8fa0be',
  accent: '#ff5b3d',
  gold: '#ffd166',
} as const;

function text(
  ctx: Ctx2D,
  str: string,
  x: number,
  y: number,
  align: 'left' | 'center' | 'right',
  size: number,
  color: string,
): void {
  ctx.font = `${size}px monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillText(str, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

/** 角色格子：名字 + 色块（用角色主色，选人时一眼能分辨） */
export function cellRect(index: number, columns = 4): { x: number; y: number; w: number; h: number } {
  const w = 56;
  const h = 46;
  const gap = 10;
  const col = index % columns;
  const row = Math.floor(index / columns);
  const totalW = columns * w + (columns - 1) * gap;
  const left = (VIEW_WIDTH - totalW) / 2;
  return { x: left + col * (w + gap), y: 62 + row * (h + gap), w, h };
}

export function drawTitle(ctx: Ctx2D, blinkOn: boolean): void {
  ctx.fillStyle = SCREEN_COLORS.bg;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  // 背景横条，别太素
  ctx.fillStyle = SCREEN_COLORS.panel;
  for (let y = 0; y < VIEW_HEIGHT; y += 16) ctx.fillRect(0, y, VIEW_WIDTH, 6);

  text(ctx, "KOF '97", VIEW_WIDTH / 2, 58, 'center', 30, SCREEN_COLORS.accent);
  text(ctx, 'WEB REMAKE', VIEW_WIDTH / 2, 94, 'center', 9, SCREEN_COLORS.gold);

  if (blinkOn) {
    text(ctx, '按 A 开始 · 点屏幕也可', VIEW_WIDTH / 2, 132, 'center', 9, SCREEN_COLORS.text);
  }
  text(ctx, 'A 轻拳 B 轻脚 C 重拳 D 重脚 · A+B 回避 · C+D 吹飞 · ABC MAX', VIEW_WIDTH / 2, 190, 'center', 6, SCREEN_COLORS.dim);
  text(ctx, '方向键移动/跳蹲 · 236/623/214 出必杀', VIEW_WIDTH / 2, 200, 'center', 6, SCREEN_COLORS.dim);
}

export function drawSelect(ctx: Ctx2D, flow: AppFlow, blinkOn: boolean): void {
  ctx.fillStyle = SCREEN_COLORS.bg;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  text(ctx, 'SELECT YOUR FIGHTER', VIEW_WIDTH / 2, 22, 'center', 12, SCREEN_COLORS.gold);

  flow.roster.forEach((char: CharDef, i: number) => {
    const r = cellRect(i, flow.config.columns);
    const p1Here = flow.cursor[0] === i;
    const p2Here = flow.cursor[1] === i;

    ctx.fillStyle = char.palette.primary;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = char.palette.secondary;
    ctx.fillRect(r.x, r.y + r.h - 12, r.w, 12);

    // 边框：P1 红、P2 蓝
    if (p1Here) {
      ctx.strokeStyle = SCREEN_COLORS.accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
    }
    if (p2Here) {
      ctx.strokeStyle = '#5aa9ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
    }

    // 格子里放一个缩小版的待机姿势，比纯色块好认
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h - 9);
    ctx.scale(0.42, 0.42);
    drawFighter(ctx, {
      palette: char.palette,
      facing: 1,
      x: 0,
      y: 0,
      anim: 'idle',
      elapsed: 0,
    });
    ctx.restore();

    text(ctx, char.name, r.x + r.w / 2, r.y + 6, 'center', 8, SCREEN_COLORS.text);
    if (p1Here) text(ctx, 'P1', r.x + 2, r.y + r.h - 11, 'left', 6, '#ffd9cf');
    if (p2Here) text(ctx, 'CPU', r.x + r.w - 2, r.y + r.h - 11, 'right', 6, '#cfe4ff');
  });

  const label = flow.locked[0] ? '已确定 · B/D 重选' : 'A/C 确定 · 方向键选人';
  if (blinkOn || flow.locked[0]) text(ctx, label, VIEW_WIDTH / 2, 186, 'center', 7, SCREEN_COLORS.text);
  text(ctx, '点击角色格子也能选', VIEW_WIDTH / 2, 198, 'center', 6, SCREEN_COLORS.dim);
}

export function drawVs(ctx: Ctx2D, flow: AppFlow): void {
  ctx.fillStyle = SCREEN_COLORS.bg;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  const [a, b] = flow.picks ?? [flow.roster[0]!, flow.roster[flow.roster.length - 1]!];

  ctx.fillStyle = a.palette.primary;
  ctx.fillRect(24, 56, 100, 110);
  ctx.fillStyle = b.palette.primary;
  ctx.fillRect(VIEW_WIDTH - 124, 56, 100, 110);

  text(ctx, a.name, 74, 172, 'center', 10, SCREEN_COLORS.text);
  text(ctx, b.name, VIEW_WIDTH - 74, 172, 'center', 10, SCREEN_COLORS.text);
  text(ctx, 'VS', VIEW_WIDTH / 2, 96, 'center', 26, SCREEN_COLORS.accent);
}

export function drawResult(ctx: Ctx2D, winnerName: string, blinkOn: boolean): void {
  ctx.fillStyle = 'rgba(5,7,10,0.72)';
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  text(ctx, winnerName, VIEW_WIDTH / 2, 84, 'center', 16, SCREEN_COLORS.gold);
  text(ctx, 'WINS', VIEW_WIDTH / 2, 104, 'center', 12, SCREEN_COLORS.text);
  if (blinkOn) text(ctx, '按 A 回到标题', VIEW_WIDTH / 2, 140, 'center', 8, SCREEN_COLORS.dim);
}

/** 选人格子命中测试（鼠标/触屏点选） */
export function hitTestCell(x: number, y: number, count: number, columns = 4): number {
  for (let i = 0; i < count; i++) {
    const r = cellRect(i, columns);
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return i;
  }
  return -1;
}
