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
import { stageArtFor, type StageArt } from './stage-art';

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
  /**
   * 天气：决定叠在场景上的粒子层。
   *
   * 静止的背景再精细也像一张贴图；一层会动的粒子（雨丝/落花/浮尘）是最便宜的"活起来"，
   * 而且不依赖任何素材、不吃生成时间。
   */
  weather?: 'rain' | 'petals' | 'dust';
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
    weather: 'rain',
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
    weather: 'petals',
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
    weather: 'dust',
  },
];

/** 视差系数：0 = 完全不动（天空），1 = 和角色同一层（地面） */
export const PARALLAX_DISTANT = 0.18;
export const PARALLAX_FAR = 0.35;
export const PARALLAX_MID = 0.6;
/** 地砖间距（世界单位） */
export const TILE_SPACING = 24;

export function drawStage(ctx: Ctx2D, cam: Camera, stage: StageDef = STAGES[0]!): void {
  const art = stageArtFor(stage.id);
  if (art) {
    drawStageArt(ctx, cam, stage, art);
    drawWeather(ctx, cam, stage);
    return;
  }

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

  // 程序化背景同样要天气（有底图那条分支已经在 drawStageArt 之后调了）
  drawWeather(ctx, cam, stage);
}

/**
 * 有底图时的画法：底图铺满整屏高度、按视差横移，
 * 然后只补"地面色带 + 砖缝"——底图自带的地面负责观感，判定线仍然由代码画，
 * 顺便把元宝的右下角水印压在这条色带底下看不见。
 */
function drawStageArt(ctx: Ctx2D, cam: Camera, stage: StageDef, art: StageArt): void {
  // 要覆盖"屏幕宽 + 视差最大横移两侧"：320 + 2×100 留足余量
  const ART_W = VIEW_WIDTH + 200;
  const shift = cam.x * PARALLAX_FAR;
  const x = Math.round(VIEW_WIDTH / 2 - ART_W / 2 - shift);
  // 先按宽度定缩放（横向必须铺满，否则视差横移会露出边缘）
  let k = ART_W / art.width;
  // 高度不够就补到够
  if (art.height * k < VIEW_HEIGHT) k = VIEW_HEIGHT / art.height;
  let dw = art.width * k;
  let dh = art.height * k;

  // 等比会被裁掉多少：图是 1.5~1.78 比例，视口是 1.78，窄图会被裁掉三到四成高度，
  // 天空全没、只剩一片地面的色块——用户反馈"场景背景没做"，实际是裁得太狠。
  // 所以溢出超过 22% 时改成**轻微非等比拉伸**（最多 1.28 倍，AI 场景图不是精确几何，
  // 这个范围内肉眼看不出变形，但能把整张图保留下来）。
  const overflow = dh / (VIEW_HEIGHT + 22);
  if (overflow > 1.22) dh = VIEW_HEIGHT + 22;
  // 底图整体上移 22px：让它的下缘藏进地面色带里——元宝出图右下角有平台水印，
  // 宽屏时那一角会露在地面色带之上，肉眼能看见「…生成」字样
  ctx.drawImage(art.image, 0, 0, art.width, art.height, x + (ART_W - dw) / 2, VIEW_HEIGHT - dh - 22, dw, dh);

  // 地面：有底图时**不能再铺一条实色带**——底图自己画了地板（斗技场的白地砖），
  // 铺满整条会把地板切掉一半，看起来像画面底部贴了块黑板。
  // 这里只留 6px 的接地暗影（压住元宝水印的下缘）+ 一条亮线（角色踩实的那道边）。
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = stage.ground;
  ctx.fillRect(0, VIEW_HEIGHT - 6, VIEW_WIDTH, 6);
  ctx.globalAlpha = 1;
  ctx.fillStyle = stage.groundLine;
  ctx.fillRect(0, GROUND_SCREEN_Y, VIEW_WIDTH, 1);

  // 砖缝（和角色同一层视差，脚底才不会滑）
  const first = Math.floor(cam.visibleLeft / TILE_SPACING) * TILE_SPACING;
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

  ctx.fillStyle = stage.groundLine;
  ctx.fillRect(0, GROUND_Y, VIEW_WIDTH, 1);
}

/** 天气层的帧计数：渲染层自增即可（不参与模拟，回放一致性不受影响） */
let weatherTick = 0;

/** 测试用：把天气的帧计数归零（保证断言可重复） */
export function resetWeatherTick(): void {
  weatherTick = 0;
}

/** 基于索引的确定性哈希（0~1），用来撒粒子位置，避免随机数破坏可重复性 */
function hash01(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * 天气层：雨 / 落花 / 浮尘。
 *
 * 三种都用同一套"按索引哈希撒点 + 按帧数下落"的做法，所以：
 * - 没有 `Math.random()`，同一帧数的画面完全一致（回放、截图对比都不漂）
 * - 粒子数固定（雨 40 / 花 14 / 尘 18），手机上也几乎不花时间
 */
export function drawWeather(ctx: Ctx2D, cam: Camera, stage: StageDef): void {
  const kind = stage.weather;
  if (!kind) return;
  weatherTick++;
  const t = weatherTick;
  const shift = cam.x * PARALLAX_MID;

  if (kind === 'rain') {
    // 雨丝：细长斜线，落地在屏幕下缘
    // 雨丝要能压在 AI 底图的亮窗户上看得见，所以用高亮白蓝 + 更长 + 两档粗细
    ctx.strokeStyle = 'rgba(225,240,255,0.72)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 46; i++) {
      const speed = 6 + (i % 5);
      const x = (hash01(i, 1) * (VIEW_WIDTH + 80) - shift * 0.6 - t * 1.6) % (VIEW_WIDTH + 80);
      const y = (hash01(i, 2) * VIEW_HEIGHT + t * speed) % VIEW_HEIGHT;
      const sx = x < 0 ? x + VIEW_WIDTH + 80 : x;
      const len = 10 + (i % 3) * 5;
      ctx.moveTo(sx, y);
      ctx.lineTo(sx - 3, y + len);
    }
    ctx.stroke();
    // 地面溅射：几颗小亮点，暗示"雨打在台面上"
    ctx.fillStyle = 'rgba(225,240,255,0.5)';
    for (let i = 0; i < 10; i++) {
      const sx = (hash01(i, 9) * VIEW_WIDTH - shift * 0.6 + t * 0.7) % VIEW_WIDTH;
      ctx.fillRect(sx < 0 ? sx + VIEW_WIDTH : sx, GROUND_SCREEN_Y + 2 + (i % 4) * 3, 1, 1);
    }
    return;
  }

  if (kind === 'petals') {
    // 落花：小方块边飘边转，靠 sin 做左右摆动
    for (let i = 0; i < 18; i++) {
      const speed = 0.7 + (i % 3) * 0.35;
      const drift = Math.sin((t + i * 30) * 0.02) * 14;
      const x = (hash01(i, 3) * (VIEW_WIDTH + 100) - shift * 0.5 - t * 0.35 + drift) % (VIEW_WIDTH + 100);
      const y = (hash01(i, 4) * VIEW_HEIGHT + t * speed) % VIEW_HEIGHT;
      const sx = x < 0 ? x + VIEW_WIDTH + 100 : x;
      ctx.globalAlpha = 0.75 + hash01(i, 5) * 0.25;
      ctx.fillStyle = i % 3 === 0 ? '#fff0f5' : '#ff8fb0';
      // 3×3 + 错位 1px 的第二个方块 = 花瓣的"翻面"感，比单点明显得多
      ctx.fillRect(sx, y, 3, 2);
      ctx.fillRect(sx + 1, y + 1, 2, 2);
    }
    ctx.globalAlpha = 1;
    return;
  }

  // 浮尘：缓慢上升的亮点，靠近地面更密
  for (let i = 0; i < 18; i++) {
    const speed = 0.25 + (i % 3) * 0.15;
    const x = (hash01(i, 6) * (VIEW_WIDTH + 60) - shift * 0.4 + Math.sin((t + i * 20) * 0.03) * 6) % (VIEW_WIDTH + 60);
    const y = GROUND_SCREEN_Y - ((hash01(i, 7) * 120 + t * speed) % 120);
    const sx = x < 0 ? x + VIEW_WIDTH + 60 : x;
    ctx.globalAlpha = 0.35 + hash01(i, 8) * 0.35;
    ctx.fillStyle = '#ffe6b8';
    ctx.fillRect(sx, y, 2, 2);
  }
  ctx.globalAlpha = 1;
}

export function stageById(id: string): StageDef {
  return STAGES.find((s) => s.id === id) ?? STAGES[0]!;
}
