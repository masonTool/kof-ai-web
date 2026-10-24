/**
 * 舞台：程序化背景（天空色带 + 视差楼群 + 中景墙 + 地面砖）。
 *
 * 背景层用**屏幕坐标**画并按视差系数偏移（远层慢、近层快），
 * 地面用镜头的 `worldToScreenX()` 画——这样地砖和角色踩在同一套坐标上，不会"脚底滑动"。
 * 舞台是纯数据 + 一个绘制函数：换舞台只加一条数据。
 */
import { Rng } from '../core/rng';
import { GROUND_Y, VIEW_HEIGHT, VIEW_WIDTH } from '../sim/constants';
import { GROUND_SCREEN_Y, type Camera } from '../sim/camera';
import type { Ctx2D } from './ctx';

export interface StageBuilding {
  x: number;
  w: number;
  h: number;
  /** 窗户灯的数量（0 = 没有灯） */
  lights: number;
}

export interface StageDef {
  id: string;
  name: string;
  /** 天空上/中/下三段颜色（像素风用色带而不是渐变） */
  skyTop: string;
  skyMid: string;
  skyBottom: string;
  /** 最远楼色 / 远景楼色 / 中景墙色（三层拉开纵深） */
  farFar: string;
  far: string;
  mid: string;
  /** 地面主色 / 砖缝色 */
  ground: string;
  groundLine: string;
  /** 点缀色（窗户灯、招牌） */
  accent: string;
  /** 地平线所在的屏幕行 */
  horizon: number;
  buildings: readonly StageBuilding[];
  /** 更远的一层楼群（视差更慢、颜色更淡），没有就只画两层 */
  distant?: readonly StageBuilding[];
  /** 天空里有没有月亮/光源 */
  hasMoon?: boolean;
}

function skyline(seed: number, count: number, minH: number, maxH: number): StageBuilding[] {
  const rng = new Rng(seed);
  const out: StageBuilding[] = [];
  let x = -100;
  for (let i = 0; i < count; i++) {
    const w = rng.range(26, 62);
    out.push({ x, w, h: rng.range(minH, maxH), lights: rng.range(0, 5) });
    x += w + rng.range(4, 24);
  }
  return out;
}

export const STAGES: readonly StageDef[] = [
  {
    id: 'skyline',
    name: '摩天楼 · 夜',
    skyTop: '#0a1030',
    skyMid: '#121b3d',
    skyBottom: '#1d2b52',
    farFar: '#0d1226',
    far: '#131a33',
    mid: '#1f2a45',
    ground: '#22242c',
    groundLine: '#333849',
    accent: '#ffd166',
    horizon: 150,
    buildings: skyline(0x97a1, 14, 30, 86),
    distant: skyline(0x3c0f, 18, 46, 104),
  },
  {
    id: 'valley',
    name: '溪谷 · 黄昏',
    skyTop: '#2b1b3d',
    skyMid: '#4a2a45',
    skyBottom: '#7a3f4d',
    farFar: '#2b1a2a',
    far: '#3c2438',
    mid: '#4a2f33',
    ground: '#3a2c23',
    groundLine: '#54402f',
    accent: '#ffb36b',
    horizon: 146,
    buildings: skyline(0x5eed, 12, 18, 58),
    distant: skyline(0x77a1, 16, 30, 76),
  },
  {
    id: 'arena',
    name: '斗技场',
    skyTop: '#101418',
    skyMid: '#18202a',
    skyBottom: '#243040',
    farFar: '#131820',
    far: '#1a2129',
    mid: '#28323d',
    ground: '#2b2620',
    groundLine: '#443a2c',
    accent: '#8fe3ff',
    horizon: 152,
    buildings: skyline(0xa11ce, 10, 14, 44),
    distant: skyline(0x5a1c, 14, 26, 62),
  },
];

/** 视差系数：0 = 完全不动（天空），1 = 和角色同一层（地面） */
export const PARALLAX_DISTANT = 0.18;
export const PARALLAX_FAR = 0.35;
export const PARALLAX_MID = 0.6;
/** 地砖间距（世界单位） */
export const TILE_SPACING = 24;

export function drawStage(ctx: Ctx2D, cam: Camera, stage: StageDef = STAGES[0]!): void {
  // 天空：三段色带（像素风用色带而不是渐变，色带还顺便给了"大气分层"）
  const band1 = Math.round(stage.horizon * 0.45);
  const band2 = Math.round(stage.horizon * 0.8);
  ctx.fillStyle = stage.skyTop;
  ctx.fillRect(0, 0, VIEW_WIDTH, band1);
  ctx.fillStyle = stage.skyMid;
  ctx.fillRect(0, band1, VIEW_WIDTH, band2 - band1);
  ctx.fillStyle = stage.skyBottom;
  ctx.fillRect(0, band2, VIEW_WIDTH, GROUND_SCREEN_Y - band2);

  // 月亮 / 光源：两圈光晕 + 一个实心圆，夜里才有"光源"的感觉
  if (stage.hasMoon !== false) {
    const mx = VIEW_WIDTH * 0.72 - cam.x * 0.05;
    const my = stage.horizon * 0.28;
    // 光环用两圈描边而不是一个实心大圆：实心圆边缘太硬，像个圆盘
    ctx.fillStyle = stage.accent;
    ctx.globalAlpha = 0.08;
    ctx.beginPath();
    ctx.arc(mx, my, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    ctx.arc(mx, my, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(mx, my, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // 最远一层楼（几乎不动）：只用色块，不需要窗灯，负责"雾里的城市"
  if (stage.distant && stage.distant.length > 0) {
    const shift = cam.x * PARALLAX_DISTANT;
    ctx.fillStyle = stage.farFar;
    for (const b of stage.distant) {
      const sx = Math.round(b.x - shift + VIEW_WIDTH / 2);
      if (sx > VIEW_WIDTH || sx + b.w < 0) continue;
      ctx.fillRect(sx, stage.horizon - b.h * 0.8, b.w, b.h * 0.8);
    }
  }

  // 远景楼群（慢速视差）
  const farShift = cam.x * PARALLAX_FAR;
  for (const b of stage.buildings) {
    const sx = Math.round(b.x - farShift + VIEW_WIDTH / 2);
    if (sx > VIEW_WIDTH || sx + b.w < 0) continue;
    ctx.fillStyle = stage.far;
    ctx.fillRect(sx, stage.horizon - b.h, b.w, b.h);

    if (b.lights > 0) {
      ctx.fillStyle = stage.accent;
      for (let i = 0; i < b.lights; i++) {
        const wy = stage.horizon - b.h + 6 + i * 10;
        if (wy > stage.horizon - 6) break;
        ctx.fillRect(sx + 4, wy, 3, 4);
        ctx.fillRect(sx + b.w - 8, wy, 3, 4);
      }
    }
  }

  // 中景墙（稍快），带一列立柱 + 顶部压暗 + 一块亮着的招牌
  const midShift = cam.x * PARALLAX_MID;
  const wallTop = stage.horizon + 18;
  const wallH = GROUND_SCREEN_Y - wallTop;
  ctx.fillStyle = stage.mid;
  ctx.fillRect(0, wallTop, VIEW_WIDTH, wallH);
  // 顶部压暗一条：让墙有个"檐口"，不是一块平色
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = stage.farFar;
  ctx.fillRect(0, wallTop, VIEW_WIDTH, 5);
  ctx.globalAlpha = 1;

  ctx.fillStyle = stage.groundLine;
  for (let wx = -64; wx < VIEW_WIDTH + 64; wx += 48) {
    const sx = Math.round(wx - midShift + VIEW_WIDTH / 2);
    if (sx > VIEW_WIDTH || sx < -8) continue;
    ctx.fillRect(sx, wallTop, 5, wallH);
  }
  // 招牌：跟着中景层走，给画面一个"这里有人生活"的亮点
  const signX = Math.round(96 - midShift + VIEW_WIDTH / 2);
  if (signX > -40 && signX < VIEW_WIDTH) {
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = stage.accent;
    ctx.fillRect(signX, wallTop + 6, 26, 9);
    ctx.globalAlpha = 1;
  }

  // 地面（和角色同一层视差）
  ctx.fillStyle = stage.ground;
  ctx.fillRect(0, GROUND_SCREEN_Y, VIEW_WIDTH, VIEW_HEIGHT - GROUND_SCREEN_Y);

  // 地面砖缝：用镜头换算，保证砖随镜头移动
  const left = cam.visibleLeft;
  const first = Math.floor(left / TILE_SPACING) * TILE_SPACING;
  ctx.strokeStyle = stage.groundLine;
  ctx.lineWidth = 1;
  for (let wx = first; wx < cam.visibleRight + TILE_SPACING; wx += TILE_SPACING) {
    const sx = Math.round(cam.worldToScreenX(wx)) + 0.5;
    if (sx < -1 || sx > VIEW_WIDTH + 1) continue;
    ctx.beginPath();
    ctx.moveTo(sx, GROUND_SCREEN_Y);
    ctx.lineTo(sx, VIEW_HEIGHT);
    ctx.stroke();
  }

  // 地平线附近的一条反光：地面从远到近有明暗变化，不然是一块死色
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = stage.groundLine;
  ctx.fillRect(0, GROUND_SCREEN_Y + 2, VIEW_WIDTH, 6);
  ctx.globalAlpha = 1;

  // 地平线高光
  ctx.fillStyle = stage.groundLine;
  ctx.fillRect(0, GROUND_Y, VIEW_WIDTH, 1);
}

export function stageById(id: string): StageDef {
  return STAGES.find((s) => s.id === id) ?? STAGES[0]!;
}
