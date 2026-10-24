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
const HEAD_RADIUS = 8;

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

/** 把颜色往白色混（`amount` = 混多少白）：闪白用，保留一点本色才认得出是谁 */
export function lighten(hex: string, amount: number): string {
  const m = hex.trim();
  const full = m.length === 4 ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : m;
  const num = Number.parseInt(full.slice(1, 7), 16);
  if (Number.isNaN(num)) return hex;
  const k = Math.min(1, Math.max(0, amount));
  const mix = (v: number): number => Math.round(v + (255 - v) * k);
  const r = mix((num >> 16) & 0xff);
  const g = mix((num >> 8) & 0xff);
  const b = mix(num & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * 像素粒度：一个"方块"占多少逻辑像素。
 *
 * **这个数是"块有多大"，不是"分辨率有多高"**——块越大画面越糊、细节越少：
 * - `1`：每个逻辑像素独立成块，最细（320×224 下线条是 1px 的锯齿）
 * - `2`：粗一号（早期的默认值）
 * - `4 / 8 / 16`：越来越像"马赛克"，16 时角色只剩 5 块高，只能算玩具
 *
 * 想更清晰要同时满足两件事：把这里调小，并且让画布按整数倍放大（`render/scale.ts` 的
 * `computeViewport` 已经按整数倍做，配合 `dpr` 就等于超采样）。
 */
let PX = 1;

/** 当前像素粒度 */
export function getPixelSize(): number {
  return PX;
}

/** 设定像素粒度（1~16，越界自动夹住；非法值回落 1） */
export function setPixelSize(size: number): void {
  const n = Math.round(size);
  PX = Math.min(16, Math.max(1, Number.isFinite(n) && n > 0 ? n : 1));
}

// 注意别返回 -0：`-0 % 2` 是 -0，会让"对齐网格"的断言与哈希都变味
const snapTo = (v: number): number => {
  const q = Math.round(v / PX);
  return q === 0 ? 0 : q * PX;
};

/** 一个对齐到网格的实心块 */
function block(ctx: Ctx2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(snapTo(x), snapTo(y), Math.max(PX, snapTo(w)), Math.max(PX, snapTo(h)));
}

/** 像素线段：沿线段铺方块，先铺一圈描边块 */
function limb(ctx: Ctx2D, from: Point, to: Point, width: number, color: string): void {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const half = Math.max(PX, Math.round(width / 2 / PX) * PX);
  // 步进用半宽而不是 2px：块之间有重叠就够了，块数能少一半以上
  const steps = Math.max(1, Math.ceil(len / Math.max(PX, half)));

  for (let pass = 0; pass < 2; pass++) {
    const grow = pass === 0 ? PX : 0;
    const c = pass === 0 ? OUTLINE : color;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = from[0] + dx * t;
      const cy = from[1] + dy * t;
      block(ctx, cx - half - grow, cy - half - grow, (half + grow) * 2, (half + grow) * 2, c);
    }
  }
}

/**
 * 像素圆：**按行填充**——每行一个方块带，宽度由 `2√(r²-y²)` 算。
 * 早期版本是逐格扫描（每格一个 fillRect），一个头就要上百次调用，
 * 一帧两个角色直接掉到 48fps。按行填同样有像素锯齿，调用数只有 1/4。
 */
function disc(ctx: Ctx2D, at: Point, radius: number, color: string, outline = false): void {
  const r = Math.max(PX, radius);
  const rowSpan = (rr: number, y: number): number => Math.sqrt(Math.max(0, rr * rr - y * y));
  if (outline) {
    const rr = r + PX;
    for (let y = -rr; y <= rr; y += PX) {
      const half = rowSpan(rr, y);
      if (half <= 0) continue;
      block(ctx, at[0] - half, at[1] + y, half * 2, PX, OUTLINE);
    }
  }
  for (let y = -r; y <= r; y += PX) {
    const half = rowSpan(r, y);
    if (half <= 0) continue;
    block(ctx, at[0] - half, at[1] + y, half * 2, PX, color);
  }
}

/** 按行扫描填充凸多边形（躯干梯形用），每行填一条方块带 */
function fillConvex(ctx: Ctx2D, pts: readonly Point[], color: string): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  for (let y = Math.floor(minY / PX) * PX; y <= maxY; y += PX) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      if (a[1] === b[1]) continue;
      const lo = Math.min(a[1], b[1]);
      const hi = Math.max(a[1], b[1]);
      if (y < lo || y > hi) continue;
      xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    if (xs.length < 2) continue;
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    block(ctx, left, y, right - left, PX, color);
  }
}

/** 轮廓：把多边形的边用描边块走一遍 */
function strokeConvex(ctx: Ctx2D, pts: readonly Point[], color: string): void {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const steps = Math.max(1, Math.ceil(len / PX));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      block(ctx, a[0] + (b[0] - a[0]) * t - PX / 2, a[1] + (b[1] - a[1]) * t - PX / 2, PX, PX, color);
    }
  }
}

/** 沿躯干轴取一个点：t=0 是胯，t=1 是颈 */
function alongTorso(frame: PoseFrame, t: number): Point {
  return [frame.hip[0] + (frame.neck[0] - frame.hip[0]) * t, frame.hip[1] + (frame.neck[1] - frame.hip[1]) * t];
}

/** 垂直于躯干轴的法线（宽度方向） */
function torsoNormal(frame: PoseFrame): Point {
  const dx = frame.neck[0] - frame.hip[0];
  const dy = frame.neck[1] - frame.hip[1];
  const len = Math.hypot(dx, dy) || 1;
  return [-dy / len, dx / len];
}

/**
 * 躯干：肩宽 > 腰宽的梯形，外面描边、里面填外套色，再叠一条腰带。
 * 之前躯干就是 hip→neck 一根 13px 的粗线，所以整个人像"竹签插了个球"。
 */
function drawTorso(
  ctx: Ctx2D,
  frame: PoseFrame,
  opts: { primary: string; trim: string; build: number; flash: boolean },
): void {
  const n = torsoNormal(frame);
  const shoulder = alongTorso(frame, 0.96);
  const waist = alongTorso(frame, 0.16);
  const shoulderW = 9.2 * opts.build;
  const waistW = 6.3 * opts.build;

  const pts: Point[] = [
    [shoulder[0] + n[0] * shoulderW, shoulder[1] + n[1] * shoulderW],
    [shoulder[0] - n[0] * shoulderW, shoulder[1] - n[1] * shoulderW],
    [waist[0] - n[0] * waistW, waist[1] - n[1] * waistW],
    [waist[0] + n[0] * waistW, waist[1] + n[1] * waistW],
  ];

  // 下摆：腰以下往外扩一点，衣服才有"罩在外面"的层次
  const hem = alongTorso(frame, 0.02);
  const hemW = shoulderW * 0.92;
  const hemPts: Point[] = [
    [waist[0] + n[0] * waistW, waist[1] + n[1] * waistW],
    [waist[0] - n[0] * waistW, waist[1] - n[1] * waistW],
    [hem[0] - n[0] * hemW, hem[1] - n[1] * hemW],
    [hem[0] + n[0] * hemW, hem[1] + n[1] * hemW],
  ];
  fillConvex(ctx, hemPts, opts.primary);
  strokeConvex(ctx, hemPts, OUTLINE);

  fillConvex(ctx, pts, opts.primary);
  strokeConvex(ctx, pts, OUTLINE);

  // 肩线：一条更亮的横线，让"肩"这个结构看得出来
  const shoulderLine = alongTorso(frame, 0.9);
  for (let i = -shoulderW; i <= shoulderW; i += PX) {
    block(ctx, shoulderLine[0] + n[0] * i - PX / 2, shoulderLine[1] + n[1] * i - PX / 2, PX, PX, opts.trim);
  }

  // 腰带：腰线偏上一点，一条横带
  const belt = alongTorso(frame, 0.3);
  for (let i = -waistW; i <= waistW; i += PX) {
    block(ctx, belt[0] + n[0] * i - PX / 2, belt[1] + n[1] * i - PX / 2, PX, PX * 1.5, opts.trim);
  }
}

export interface PoseDrawOptions {
  /** 命中闪白 */
  flash?: boolean;
  /** 外观（身高/壮实/发型/配件） */
  look?: Look;
  /** 当前动画名（决定是否画挥击拖尾） */
  anim?: string;
  /** -1~1：正 = 纵向拉长（出招冲刺感），负 = 横向压扁（受击/落地） */
  squash?: number;
}

export function drawPose(ctx: Ctx2D, frame: PoseFrame, palette: Palette, opts: PoseDrawOptions = {}): void {
  const flash = opts.flash === true;
  const look = opts.look ?? DEFAULT_LOOK;
  // 闪白用"往白里混 78%"而不是纯白：纯白会把人糊成一个白影子，看不出是谁、也看不出姿势
  const pick = (c: string): string => (flash ? lighten(c, 0.78) : c);

  const skin = pick(palette.skin);
  const primary = pick(palette.primary);
  const secondary = pick(palette.secondary);
  const hair = pick(palette.hair);
  const trim = pick(palette.trim);

  // 身高 + 挤压拉伸：都以脚底为原点，脚不会离地
  const squash = Math.max(-1, Math.min(1, opts.squash ?? 0));
  if (look.height !== 1 || squash !== 0) {
    ctx.save();
    ctx.scale(1 + squash * -0.05, look.height * (1 + squash * 0.06));
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
  const dim = (c: string): string => (flash ? lighten(c, 0.62) : shade(c, 0.62));
  limb(ctx, frame.hip, frame.legBack[0]!, 7 * b, dim(secondary));
  limb(ctx, frame.legBack[0]!, frame.legBack[1]!, 6 * b, dim(secondary));
  limb(ctx, frame.neck, frame.armBack[0]!, 5 * b, dim(primary));
  limb(ctx, frame.armBack[0]!, frame.armBack[1]!, 4 * b, dim(skin));

  // 躯干：胸腔用梯形（有肩有腰，比一根粗线像人）+ 腰带
  drawTorso(ctx, frame, { primary, trim, build: b, flash });

  // 近侧肢体
  limb(ctx, frame.hip, frame.legFront[0]!, 7 * b, secondary);
  limb(ctx, frame.legFront[0]!, frame.legFront[1]!, 6 * b, secondary);
  limb(ctx, frame.neck, frame.armFront[0]!, 5.5 * b, primary);
  limb(ctx, frame.armFront[0]!, frame.armFront[1]!, 4.5 * b, skin);

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
  drawFineDetails(ctx, frame, { skin, primary, secondary, trim, hair, flash, look, build: b });
  drawAccessory(ctx, frame, { trim, hair, look, flash });

  if (look.height !== 1 || squash !== 0) ctx.restore();
}

/**
 * 细节层：在身体画完之后补一层"小东西"——五官、指缝、鞋底、衣褶、肢体暗部。
 *
 * 这一层是"看起来像人"和"看起来像纸片"的分界线：形体（梯形躯干、粗细四肢）解决轮廓，
 * 细节解决"这身体有没有被光照过、有没有布料"。
 */
function drawFineDetails(
  ctx: Ctx2D,
  frame: PoseFrame,
  o: {
    skin: string;
    primary: string;
    secondary: string;
    trim: string;
    hair: string;
    flash: boolean;
    look: Look;
    build: number;
  },
): void {
  // 闪白时也要"提亮"而不是压暗，否则白影子上会浮出深色碎块
  const dark = (c: string, k = 0.8): string => (o.flash ? lighten(c, 0.7) : shade(c, k));
  const ink = o.flash ? '#ffffff' : OUTLINE;

  // ---- 面部：眉 / 眼白 + 瞳孔 / 鼻影 / 嘴 ----
  const r = HEAD_RADIUS * o.look.head;
  const hx = frame.head[0];
  const hy = frame.head[1];

  // 眉：一小段，给脸上一个"表情"
  block(ctx, hx + 2.6, hy - 3.8, PX * 2.6, PX, dark(o.hair, 0.72));
  // 眼白（盖住底层的黑块），再点一个瞳孔
  block(ctx, hx + 3.4, hy - 2, PX * 2, PX * 1.4, o.flash ? '#ffffff' : '#f6efe4');
  block(ctx, hx + 4.2, hy - 1.8, PX * 1.2, PX * 1.2, ink);
  // 鼻影：一条 1px 的竖线
  block(ctx, hx + 6.2, hy + 1.4, PX, PX * 1.6, dark(o.skin, 0.86));
  // 嘴：短横线
  block(ctx, hx + 3.6, hy + 4.2, PX * 1.8, PX, dark(o.skin, 0.7));

  // ---- 肢体暗部：沿右下侧压一道 1px，身体立刻有体积 ----
  const shadeLimb = (a: Point, b: Point, w: number): void => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    // 法线（指向右下）
    let nx = -dy / len;
    let ny = dx / len;
    if (ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const off = Math.max(PX, Math.round((w / 2) * 0.55));
    const steps = Math.max(1, Math.ceil(len / PX));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = a[0] + dx * t + nx * off;
      const py = a[1] + dy * t + ny * off;
      block(ctx, px - PX / 2, py - PX / 2, PX, PX, dark(o.secondary, 0.9));
    }
  };
  shadeLimb(frame.legFront[0], frame.legFront[1], 6 * o.build);
  shadeLimb(frame.legBack[0], frame.legBack[1], 6 * o.build);
  shadeLimb(frame.armFront[0], frame.armFront[1], 4.5 * o.build);

  // ---- 手：拳头分瓣（两道指缝）----
  const hand = frame.armFront[1];
  block(ctx, hand[0] - PX, hand[1] - PX * 1.6, PX, PX * 1.2, dark(o.skin, 0.74));
  block(ctx, hand[0] + PX * 0.6, hand[1] - PX * 1.6, PX, PX * 1.2, dark(o.skin, 0.74));

  // ---- 脚：鞋底 + 鞋面高光 ----
  const foot = frame.legFront[1];
  block(ctx, foot[0] - PX * 1.6, foot[1] - PX * 0.6, PX * 3.2, PX, dark(o.secondary, 0.6));
  block(ctx, foot[0] - PX * 1.2, foot[1] - PX * 2, PX * 2.4, PX, o.flash ? '#ffffff' : o.trim);

  // ---- 衣褶：腰带下沿 + 裤脚口 ----
  const hip = frame.hip;
  block(ctx, hip[0] - 5 * o.build, hip[1] + PX * 2, PX * 10 * o.build, PX, dark(o.primary, 0.76));
  for (const knee of [frame.legFront[0], frame.legBack[0]]) {
    block(ctx, knee[0] - PX * 1.6, knee[1] + PX * 2, PX * 3.2, PX, dark(o.secondary, 0.7));
  }

  // ---- 头发：几缕深色发丝（只在有头发的造型上）----
  if (o.look.hair !== 'bald') {
    for (const dx of [-2.5, 0.5, 3]) {
      block(ctx, hx + dx, hy - r + PX, PX, PX * 2.4, dark(o.hair, 0.74));
    }
  }
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
  // 下巴：脸下半部加一点，头才不是个正圆
  ctx.beginPath();
  ctx.arc(hx + 1.5, hy + 1.5, r - 2.4, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.lineTo(hx + 1.5, hy + 1.5);
  ctx.closePath();
  ctx.fillStyle = skin;
  ctx.fill();
  // 耳朵（后侧一个小圆）
  disc(ctx, [hx - r * 0.75, hy + 0.5], 1.6, skin);
  // 眼睛：像素风里就是两个方块（1 个方块太糊，看不出是眼）
  const eye = flash ? '#ffffff' : OUTLINE;
  block(ctx, hx + 3.5, hy - 1.5, PX, PX, eye);
  block(ctx, hx + 5.5, hy - 1.5, PX, PX, eye);
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
  /** 惯性：0 = 不拖，0.25~0.4 有重量感 */
  lag?: number;
  /** 挤压拉伸：正 = 纵向拉长，负 = 横向压扁 */
  squash?: number;
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
    drawPose(ctx, resolvePose(v.anim, v.elapsed, v.duration, easeForAnim(v.anim), v.lag ?? 0), v.palette, {
      flash: v.flash,
      look: v.look,
      anim: v.anim,
      squash: v.squash,
    });
  }
  ctx.restore();
}
