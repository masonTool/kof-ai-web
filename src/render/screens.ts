/**
 * 各屏绘制：标题 / 选人 / VS / 结果。
 * 只吃 `Ctx2D`，所以能像 HUD 一样在 node 里用假 ctx 断言"画了什么"。
 */
import type { CharDef } from '../data/schema';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../sim/constants';
import { MODE_ITEMS, gridColumns, type AppFlow } from '../ui/flow';
import type { ChallengeBoard } from '../ui/challenges';
import type { KeyBindMenu } from '../ui/keybind';
import { KEY_ACTIONS, keyLabelFor, type GameSettings } from '../ui/settings';
import type { Ctx2D } from './ctx';
import type { ArcadeResultModel } from '../ui/arcade-result';
import type { SystemMenu } from '../ui/pause';
import type { MoveEntry } from '../ui/movelist';
import { drawFighter } from './fighter-draw';
import { bigPortraitFor, portraitFor } from './portraits';
import { titleArt } from './title-art';
import { lookFor } from './looks';

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
/**
 * 选人格子：3 行（12 人）以内都放得下。
 * 行高按人数自动收一点——36 人时会变成 9 列 4 行，格子更小。
 */
export function cellRect(index: number, count: number, columns = gridColumns(count)): { x: number; y: number; w: number; h: number } {
  const rows = Math.max(1, Math.ceil(count / columns));
  const gapX = columns > 5 ? 6 : 10;
  const gapY = 6;
  const top = 50;
  const bottom = 198;
  // 列数一多（16 人起是 6 列），格子必须变窄，否则整排会横出屏幕
  const w = Math.min(56, Math.floor((VIEW_WIDTH - 12 - (columns - 1) * gapX) / columns));
  // 行数多了就把格子压扁，保证 320×224 里一定放得下
  const h = Math.max(18, Math.min(44, Math.floor((bottom - top - (rows - 1) * gapY) / rows)));
  const col = index % columns;
  const row = Math.floor(index / columns);
  const totalW = columns * w + (columns - 1) * gapX;
  const left = (VIEW_WIDTH - totalW) / 2;
  return { x: left + col * (w + gapX), y: top + row * (h + gapY), w, h };
}

/** 标题屏右上角「怎么玩」按钮的命中区域（逻辑坐标） */
export const HELP_BUTTON = { x: VIEW_WIDTH - 62, y: 6, w: 54, h: 18 } as const;

/** 说明页数 */
export const HELP_PAGE_COUNT = 4;

/** 说明文案：一页一个主题，手机小屏也读得清 */
const HELP_PAGES: readonly { title: string; lines: readonly string[] }[] = [
  {
    title: '这是怎么玩的',
    lines: [
      '3 打 3 的队伍战：把对面 3 个人全部打倒就赢下这一场。',
      '先赢 2 局拿下一场；街机模式一共 8 场。',
      '被KO的人物不会复活，换人自动上场。',
    ],
  },
  {
    title: '操作',
    lines: [
      '手机：左手摇杆移动 / 跳 / 蹲，右手菱形四键出招。',
      'A 轻拳 · B 轻脚 · C 重拳 · D 重脚',
      'A+B 回避（翻滚无敌）· C+D 吹飞攻击',
      '键盘：方向键 + J K L U（可在选项里改）',
    ],
  },
  {
    title: '必杀技怎么放',
    lines: [
      '方向 + 攻击键，和街机一样：',
      '↓↘→ + 拳 = 波动系（远距离）',
      '→↓↘ + 拳 = 升龙系（推前 → 压下 → 滑到前下）',
      '↓↙← + 脚 = 突进系',
      '按不准就对局中按 L / 点左下角「招式」看本角色招式表。',
    ],
  },
  {
    title: '气槽与超必杀',
    lines: [
      '打人、被打都会攒气，攒满可以放超必杀。',
      '超必杀伤害更高，命中还有定格演出。',
      '防御会掉一点点血，别一直缩着。',
      '点击任意位置 / 按 A 继续。',
    ],
  },
];

export interface HelpPageView {
  title: string;
  lines: readonly string[];
}

export function helpPageText(page: number): HelpPageView {
  const p = HELP_PAGES[Math.max(0, Math.min(HELP_PAGES.length - 1, page))]!;
  return p;
}

/**
 * 左下角「菜单」按钮：触屏没有 Start 键，靠它叫出系统菜单。
 *
 * 放在「招式」按钮右边一格：两者都在画面下沿，不挡站位，也不和手台的摇杆/四键重叠。
 */
export function menuButtonRect(): { x: number; y: number; w: number; h: number } {
  return { x: VIEW_WIDTH - 44, y: 26, w: 40, h: 15 };
}

export function drawMenuButton(ctx: Ctx2D): void {
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = 'rgba(10,14,20,0.72)';
  const nb = menuButtonRect();
  ctx.fillRect(nb.x, nb.y, nb.w, nb.h);
  ctx.strokeStyle = SCREEN_COLORS.dim;
  ctx.lineWidth = 1;
  ctx.strokeRect(nb.x + 0.5, nb.y + 0.5, nb.w - 1, nb.h - 1);
  ctx.globalAlpha = 1;
  text(ctx, '菜单', nb.x + nb.w / 2, nb.y + 4, 'center', 6, SCREEN_COLORS.text);
}

/** 手台位置调整时的顶部提示 */
export function drawPadAdjustHint(ctx: Ctx2D, blinkOn: boolean): void {
  ctx.globalAlpha = 0.86;
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, VIEW_WIDTH, 40);
  ctx.globalAlpha = 1;
  text(ctx, '拖动摇杆和按键调整位置', VIEW_WIDTH / 2, 12, 'center', 8, SCREEN_COLORS.gold);
  if (blinkOn) text(ctx, '点画面任意处保存', VIEW_WIDTH / 2, 26, 'center', 6, SCREEN_COLORS.text);
}

/**
 * 演示结果：播完后居中报一次"实际连上几下 / 实际打了多少"。
 *
 * 用真实对局数据而不是连段表里的预估——两者对不上时（比如被挡住、距离不够），
 * 恰恰是玩家最需要知道的信息。
 */
export function drawDemoResult(ctx: Ctx2D, hits: number, damage: number): void {
  const w = 150;
  const x = (VIEW_WIDTH - w) / 2;
  const y = 96;
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = '#05070a';
  ctx.fillRect(x, y, w, 34);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = hits > 0 ? SCREEN_COLORS.gold : SCREEN_COLORS.accent;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 33);
  text(ctx, hits > 0 ? '连上了' : '没连上', VIEW_WIDTH / 2, y + 5, 'center', 9, hits > 0 ? SCREEN_COLORS.gold : SCREEN_COLORS.accent);
  text(ctx, `${hits} 连 · ${damage} 伤害`, VIEW_WIDTH / 2, y + 20, 'center', 7, SCREEN_COLORS.text);
}

/** 连招演示的浮标：显示"正在演示第几步" */
export function drawDemoLabel(
  ctx: Ctx2D,
  label: string,
  step: number,
  total: number,
  damage = 0,
): void {
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#05070a';
  ctx.fillRect(4, 190, VIEW_WIDTH - 8, 16);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = SCREEN_COLORS.accent;
  ctx.lineWidth = 1;
  ctx.strokeRect(4.5, 190.5, VIEW_WIDTH - 9, 15);
  const dmg = damage > 0 ? ` · 累计 ${damage} 伤` : '';
  text(ctx, `演示 ${step + 1}/${total} · ${label}${dmg}`, VIEW_WIDTH / 2, 194, 'center', 6, SCREEN_COLORS.accent);
}

/**
 * 贴图还在下载时的提示。
 *
 * 线上（GitHub Pages）单张图集 2MB、冷缓存 20~30 秒，这段时间角色会回落成程序化像素人。
 * 与其让玩家以为"这游戏画风就这样"，不如明确告诉他"正在加载"。
 */
export function drawLoadingHint(ctx: Ctx2D, blinkOn: boolean): void {
  const w = 120;
  const x = (VIEW_WIDTH - w) / 2;
  const y = VIEW_HEIGHT - 28;
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = '#05070a';
  ctx.fillRect(x, y, w, 13);
  ctx.globalAlpha = 1;
  text(ctx, blinkOn ? '角色贴图加载中…' : '角色贴图加载中', VIEW_WIDTH / 2, y + 3, 'center', 6, SCREEN_COLORS.gold);
}

/**
 * 街机进度：左上角常驻「STAGE 3/8 · 队伍名」。
 *
 * 街机 8 场打下来，玩家需要知道"打到哪了、还剩几场"——原来只能靠记。
 * 放在左血条上方（不与右侧连击面板冲突，训练场也不会画它）。
 */
export function drawStageBadge(ctx: Ctx2D, stage: number, total: number, teamName: string): void {
  const label = `STAGE ${stage}/${total}${teamName ? ` · ${teamName}` : ''}`;
  const w = Math.min(VIEW_WIDTH - 8, label.length * 6 + 12);
  // y=8 会盖住血条（barY=6 高 9），下移到血条与名字下面
  const y = 26;
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = '#05070a';
  ctx.fillRect(4, y, w, 13);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = SCREEN_COLORS.dim;
  ctx.lineWidth = 1;
  ctx.strokeRect(4.5, y + 0.5, w - 1, 12);
  text(ctx, label, 4 + w / 2, y + 3, 'center', 6, SCREEN_COLORS.text);
}

/**
 * 训练场连击面板：右上角显示"当前连击 / 本次最高"。
 *
 * 训练场里打完一套连段，除了伤害数字没有任何反馈——练的人不知道自己到底连上没有、
 * 这套的上限是几下。连击数在手感上是最直接的"你打对了"。
 */
export function drawComboMeter(ctx: Ctx2D, current: number, best: number): void {
  const w = 76;
  const x = VIEW_WIDTH - w - 4;
  // 右上 y=26 被「招式/菜单」按钮占了，连击面板下移到 44
  const y = 44;
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = '#05070a';
  ctx.fillRect(x, y, w, 15);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = current > 0 ? SCREEN_COLORS.gold : SCREEN_COLORS.dim;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 14);
  const cur = current > 0 ? `${current} 连` : '—';
  text(ctx, `${cur} · 最高 ${best}`, x + w / 2, y + 4, 'center', 6, current > 0 ? SCREEN_COLORS.gold : SCREEN_COLORS.dim);
}

/**
 * 训练场状态条：顶部一行，明确告诉玩家"现在不掉血、气是无限的"。
 *
 * 这两个开关原来埋在底部功能条的按钮里（`无限血:OFF`），用户实测反馈"不知道有训练场"——
 * 状态必须**常驻显示**，不能只存在于一个可以点的按钮上。
 */
export function drawTrainingBadge(
  ctx: Ctx2D,
  info: { infiniteHp: boolean; infiniteMeter: boolean; dummy: string },
): void {
  const y = 26;
  const w = 190;
  const x = (VIEW_WIDTH - w) / 2;
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = '#05070a';
  ctx.fillRect(x, y, w, 15);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#5aa9ff';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 14);
  const hp = info.infiniteHp ? '不损血' : '正常血量';
  const meter = info.infiniteMeter ? '气无限' : '气正常';
  text(ctx, `训练场 · ${hp} · ${meter} · 假人:${info.dummy}`, VIEW_WIDTH / 2, y + 4, 'center', 6, '#9fd0ff');
}

/** 首次进对局时的必杀提示（只弹一次，之后靠左下角「招式」按钮） */
export const MOVE_HINT_TEXT = '必杀技怎么放？按 L 或点左下角「招式」看本角色招式表';

/** 画首次必杀提示：底部一条窄横幅，不挡血条也不挡站位 */
export function drawMoveHint(ctx: Ctx2D, alpha = 1): void {
  const y = 186;
  const w = 288;
  ctx.globalAlpha = alpha * 0.88;
  ctx.fillStyle = '#05070a';
  ctx.fillRect((VIEW_WIDTH - w) / 2, y, w, 16);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = SCREEN_COLORS.gold;
  ctx.lineWidth = 1;
  ctx.strokeRect((VIEW_WIDTH - w) / 2 + 0.5, y + 0.5, w - 1, 15);
  text(ctx, MOVE_HINT_TEXT, VIEW_WIDTH / 2, y + 4, 'center', 6, SCREEN_COLORS.gold);
  ctx.globalAlpha = 1;
}

/** 「招式」开关按钮（对局与选人屏左下角，触屏用） */
/**
 * 「招式」按钮（右上）。
 *
 * 必须是**函数**而不是 const：`VIEW_WIDTH` 是 `export let` 的活绑定，
 * 顶层 `const` 会在模块加载时把它固定成 320 —— 宽屏下按钮就跑到画面中间去了。
 * （左下角原来那个位置的毛病是压住气槽 meterY = VIEW_HEIGHT-13，还紧挨摇杆。）
 */
export function movesButtonRect(): { x: number; y: number; w: number; h: number } {
  return { x: VIEW_WIDTH - 92, y: 26, w: 44, h: 15 };
}

/** 画「招式」小按钮 */
export function drawMovesButton(ctx: Ctx2D, active: boolean): void {
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = active ? 'rgba(255,91,61,0.28)' : 'rgba(10,14,20,0.72)';
  const mb = movesButtonRect();
  ctx.fillRect(mb.x, mb.y, mb.w, mb.h);
  ctx.strokeStyle = active ? SCREEN_COLORS.accent : SCREEN_COLORS.dim;
  ctx.lineWidth = 1;
  ctx.strokeRect(mb.x + 0.5, mb.y + 0.5, mb.w - 1, mb.h - 1);
  ctx.globalAlpha = 1;
  text(ctx, active ? '关招式' : '招式', mb.x + mb.w / 2, mb.y + 4, 'center', 6, active ? SCREEN_COLORS.accent : SCREEN_COLORS.text);
}

/**
 * 招式清单面板：贴在右侧，不挡画面中间。
 *
 * 只列必杀与超必杀，组间加一行分隔标题——玩家真正记不住的是这几条。
 */
export function drawMoveList(ctx: Ctx2D, charName: string, entries: readonly MoveEntry[]): void {
  const x = 150;
  const w = VIEW_WIDTH - x - 6;
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = '#05070a';
  ctx.fillRect(x, 28, w, VIEW_HEIGHT - 56);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = SCREEN_COLORS.gold;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, 28.5, w - 1, VIEW_HEIGHT - 57);

  text(ctx, charName, x + w / 2, 34, 'center', 8, SCREEN_COLORS.gold);

  let y = 48;
  let lastKind = '';
  for (const e of entries.slice(0, 11)) {
    if (e.kind !== lastKind) {
      lastKind = e.kind;
      text(ctx, e.kind, x + 6, y, 'left', 6, SCREEN_COLORS.accent);
      y += 12;
    }
    text(ctx, e.cmd || '（自动）', x + 6, y, 'left', 6, SCREEN_COLORS.text);
    text(ctx, e.name, x + w - 6, y, 'right', 6, SCREEN_COLORS.dim);
    y += 11;
  }
  if (entries.length === 0) text(ctx, '这个角色没有必杀技', x + w / 2, y, 'center', 6, SCREEN_COLORS.dim);

  text(ctx, `${entries.length} 招 · L 或点按钮开关`, x + w / 2, VIEW_HEIGHT - 32, 'center', 5, SCREEN_COLORS.dim);
}

/** 说明浮层：盖在当前画面上，点一下翻页，最后一页关掉 */
export function drawHelp(ctx: Ctx2D, page: number, blinkOn: boolean): void {
  const view = helpPageText(page);
  // 不透明：半透明会让标题插画透上来，小字直接糊掉
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  ctx.strokeStyle = SCREEN_COLORS.gold;
  ctx.lineWidth = 1;
  ctx.strokeRect(10.5, 10.5, VIEW_WIDTH - 21, VIEW_HEIGHT - 21);

  text(ctx, view.title, VIEW_WIDTH / 2, 28, 'center', 12, SCREEN_COLORS.gold);
  view.lines.forEach((line, i) => {
    text(ctx, line, 20, 58 + i * 16, 'left', 7, SCREEN_COLORS.text);
  });

  const last = page >= HELP_PAGE_COUNT - 1;
  if (blinkOn) {
    text(
      ctx,
      `${last ? '点击关闭' : '点击继续'} · ${page + 1}/${HELP_PAGE_COUNT}`,
      VIEW_WIDTH / 2,
      VIEW_HEIGHT - 26,
      'center',
      6,
      SCREEN_COLORS.dim,
    );
  }
}

export function drawTitle(ctx: Ctx2D, blinkOn: boolean): void {
  ctx.fillStyle = SCREEN_COLORS.bg;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  const art = titleArt();
  if (art) {
    // 有插图就铺满（cover），再压一层半透明黑保证文字可读
    const k = Math.max(VIEW_WIDTH / art.width, VIEW_HEIGHT / art.height);
    const dw = art.width * k;
    const dh = art.height * k;
    ctx.drawImage(art.image, 0, 0, art.width, art.height, (VIEW_WIDTH - dw) / 2, VIEW_HEIGHT - dh, dw, dh);
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.globalAlpha = 1;
  } else {
    // 没有插图：横条底纹，别太素
    ctx.fillStyle = SCREEN_COLORS.panel;
    for (let y = 0; y < VIEW_HEIGHT; y += 16) ctx.fillRect(0, y, VIEW_WIDTH, 6);
  }

  text(ctx, "KOF '97", VIEW_WIDTH / 2, 58, 'center', 30, SCREEN_COLORS.accent);
  text(ctx, 'WEB REMAKE', VIEW_WIDTH / 2, 94, 'center', 9, SCREEN_COLORS.gold);

  if (blinkOn) {
    text(ctx, '点击屏幕开始', VIEW_WIDTH / 2, 132, 'center', 9, SCREEN_COLORS.text);
  }

  // 右上角「怎么玩」：点一下就开说明（第一次进游戏也会自动弹一次）
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = 'rgba(10,14,20,0.72)';
  ctx.fillRect(HELP_BUTTON.x, HELP_BUTTON.y, HELP_BUTTON.w, HELP_BUTTON.h);
  ctx.strokeStyle = SCREEN_COLORS.gold;
  ctx.lineWidth = 1;
  ctx.strokeRect(HELP_BUTTON.x + 0.5, HELP_BUTTON.y + 0.5, HELP_BUTTON.w - 1, HELP_BUTTON.h - 1);
  ctx.globalAlpha = 1;
  text(ctx, '怎么玩', HELP_BUTTON.x + HELP_BUTTON.w / 2, HELP_BUTTON.y + 5, 'center', 6, SCREEN_COLORS.gold);
  // 底部操作说明压在火焰上会看不清，垫一条半透明暗带（有插图时才需要）
  if (art) {
    ctx.globalAlpha = 0.68;
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 182, VIEW_WIDTH, VIEW_HEIGHT - 182);
    ctx.globalAlpha = 1;
  }
  text(ctx, 'A 轻拳 B 轻脚 C 重拳 D 重脚 · A+B 回避 · C+D 吹飞 · ABC MAX', VIEW_WIDTH / 2, 190, 'center', 6, SCREEN_COLORS.text);
  text(ctx, '方向键移动/跳蹲 · 236/623/214 出必杀', VIEW_WIDTH / 2, 200, 'center', 6, art ? SCREEN_COLORS.text : SCREEN_COLORS.dim);
}

/** 选人屏底部缩略条：格子边长 / 间距 / 一屏显示几个 */
export const SEL_BAR = { y: 176, cell: 24, gap: 3, visible: 11 } as const;

/** 缩略条要显示的第几个开始的索引（让光标尽量居中） */
export function selectBarStart(count: number, cursor: number): number {
  const vis = SEL_BAR.visible;
  if (count <= vis) return 0;
  return Math.max(0, Math.min(count - vis, cursor - Math.floor(vis / 2)));
}

/** 缩略条横向起点（居中） */
export function selectBarX(count: number): number {
  const n = Math.min(count, SEL_BAR.visible);
  const total = n * SEL_BAR.cell + (n - 1) * SEL_BAR.gap;
  return Math.round((VIEW_WIDTH - total) / 2);
}

/**
 * 选人屏：左边大特写、右边资料、底部缩略条。
 *
 * 为什么改成这样：原来 29 个格子铺满一屏，每个只有 40×18 左右——
 * 头像被压到看不清、名字要塞省略号，用户反馈"画面太拥挤、头像又小又糊"。
 * 现在一屏只突出一个人，其余用底部缩略条浏览。
 */
export function drawSelect(ctx: Ctx2D, flow: AppFlow, blinkOn: boolean): void {
  ctx.fillStyle = SCREEN_COLORS.bg;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  const count = flow.roster.length;
  const cursor = flow.cursor[0];
  const char = flow.roster[cursor] ?? flow.roster[0]!;

  const ART = { x: 8, y: 30, w: 105, h: 140 }; // 3:4，和 480×640 的素材同比例

  // 大特写：有半身像就贴，没有先贴小头像（拉伸会糊，但比空白强），再没有就画程序化小人
  const big = bigPortraitFor(char.id);
  ctx.fillStyle = '#0b0f16';
  ctx.fillRect(ART.x, ART.y, ART.w, ART.h);
  if (big) {
    const bw = (big as { width?: number }).width ?? ART.w;
    const bh = (big as { height?: number }).height ?? ART.h;
    ctx.drawImage(big, 0, 0, bw, bh, ART.x, ART.y, ART.w, ART.h);
  } else {
    const small = portraitFor(char.id);
    if (small) {
      ctx.drawImage(small, 0, 0, 128, 128, ART.x, ART.y, ART.w, ART.h);
    } else {
      ctx.save();
      ctx.translate(ART.x + ART.w / 2, ART.y + ART.h - 10);
      ctx.scale(0.85, 0.85);
      drawFighter(ctx, {
        palette: char.palette,
        facing: 1,
        x: 0,
        y: 0,
        anim: 'idle',
        elapsed: 0,
        look: lookFor(char.id),
      });
      ctx.restore();
    }
  }
  ctx.strokeStyle = SCREEN_COLORS.dim;
  ctx.lineWidth = 1;
  ctx.strokeRect(ART.x + 0.5, ART.y + 0.5, ART.w - 1, ART.h - 1);

  // 右侧资料
  const infoX = ART.x + ART.w + 10;
  text(ctx, 'P1', infoX, 34, 'left', 7, '#ffd9cf');
  text(ctx, char.name, infoX, 52, 'left', Math.min(14, Math.max(9, Math.floor(150 / Math.max(2, char.name.length)))), SCREEN_COLORS.gold);
  const styleLabel: Record<string, string> = { fire: '炎', darkfire: '暗炎', thunder: '雷', ki: '气', none: '体术' };
  const fx = (char as unknown as { fx?: string }).fx ?? 'none';
  text(ctx, styleLabel[fx] ?? '体术', infoX, 72, 'left', 8, SCREEN_COLORS.text);

  // 招式速览：只列必杀和超必杀，超出一屏就省略
  const specials = Object.values(char.moves).filter((m) => m.kind === 'special' || m.kind === 'super');
  text(ctx, '招式', infoX, 92, 'left', 7, SCREEN_COLORS.dim);
  specials.slice(0, 4).forEach((m, i) => {
    const name = m.name.length > 12 ? `${m.name.slice(0, 11)}…` : m.name;
    text(ctx, name, infoX, 104 + i * 11, 'left', 6, m.kind === 'super' ? SCREEN_COLORS.gold : SCREEN_COLORS.text);
  });

  // 底部缩略条
  const start = selectBarStart(count, cursor);
  const barX = selectBarX(count);
  const n = Math.min(count, SEL_BAR.visible);
  for (let k = 0; k < n; k++) {
    const i = start + k;
    const c = flow.roster[i];
    if (!c) break;
    const x = barX + k * (SEL_BAR.cell + SEL_BAR.gap);
    const y = SEL_BAR.y;
    const face = portraitFor(c.id);
    ctx.fillStyle = face ? '#0b0f16' : c.palette.primary;
    ctx.fillRect(x, y, SEL_BAR.cell, SEL_BAR.cell);
    if (face) ctx.drawImage(face, 0, 0, 128, 128, x, y, SEL_BAR.cell, SEL_BAR.cell);
    // 光标 / 已选：P1 红框、P2 蓝框
    if (flow.cursor[0] === i) {
      ctx.strokeStyle = SCREEN_COLORS.accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 1, y - 1, SEL_BAR.cell + 2, SEL_BAR.cell + 2);
    }
    if (flow.locked[0] && flow.cursor[0] === i) {
      ctx.fillStyle = SCREEN_COLORS.accent;
      ctx.fillRect(x + SEL_BAR.cell - 5, y + 1, 4, 4);
    }
    if (flow.cursor[1] === i) {
      ctx.strokeStyle = '#5aa9ff';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, SEL_BAR.cell - 1, SEL_BAR.cell - 1);
    }
  }
  // 缩略条两端的小箭头：暗示还有更多
  if (start > 0) text(ctx, '‹', barX - 7, SEL_BAR.y + 7, 'center', 9, SCREEN_COLORS.dim);
  if (start + n < count) text(ctx, '›', barX + n * (SEL_BAR.cell + SEL_BAR.gap) + 4, SEL_BAR.y + 7, 'center', 9, SCREEN_COLORS.dim);

  // 底部状态
  const label = flow.locked[0] ? '已确定 · B/D 重选' : 'A 确定 · 方向键换人';
  if (blinkOn || flow.locked[0]) text(ctx, label, VIEW_WIDTH / 2, 210, 'center', 7, SCREEN_COLORS.text);
}

export function drawVs(ctx: Ctx2D, flow: AppFlow): void {
  ctx.fillStyle = SCREEN_COLORS.bg;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  const [a, b] = flow.picks ?? [flow.roster[0]!, flow.roster[flow.roster.length - 1]!];

  // 头像对撞：有素材贴胸像，没有就用各自的代表色块兜底
  const faces: [CharDef, number][] = [
    [a, 24],
    [b, VIEW_WIDTH - 124],
  ];
  for (const [char, x] of faces) {
    ctx.fillStyle = char.palette.primary;
    ctx.fillRect(x, 56, 100, 110);
    const portrait = portraitFor(char.id);
    if (portrait) {
      // 胸像是正方形，按"填满宽度、垂直居中"放，多余上下留背景色
      ctx.drawImage(portrait, 0, 0, 128, 128, x, 56, 100, 100);
    }
  }

  text(ctx, a.name, 74, 172, 'center', 10, SCREEN_COLORS.text);
  text(ctx, b.name, VIEW_WIDTH - 74, 172, 'center', 10, SCREEN_COLORS.text);
  text(ctx, 'VS', VIEW_WIDTH / 2, 96, 'center', 26, SCREEN_COLORS.accent);
}

export function drawResult(
  ctx: Ctx2D,
  winnerName: string,
  quote: string,
  blinkOn: boolean,
  arcade: ArcadeResultModel | null = null,
): void {
  // 赢家名与 WINS 由 HUD 的中央横幅负责（K.O. 横幅就一直挂在那儿），
  // 这里只画台词框，否则屏幕正中会有两行"某某 WINS"。
  const boxY = 148;
  ctx.fillStyle = 'rgba(5,7,10,0.82)';
  ctx.fillRect(14, boxY, VIEW_WIDTH - 28, 44);
  ctx.strokeStyle = SCREEN_COLORS.gold;
  ctx.lineWidth = 1;
  ctx.strokeRect(14.5, boxY + 0.5, VIEW_WIDTH - 29, 43);
  // 说话人放在框内左上角：放到框外会压住角色
  text(ctx, winnerName, 20, boxY + 3, 'left', 6, SCREEN_COLORS.gold);

  // 台词长了就折行（像素字体等宽，按字数近似切）
  // 注意用下标代替 indexOf：两行内容相同时 indexOf 会返回同一个下标，两行会画在同一个 y 上
  wrapText(quote, 22).forEach((line, i) => {
    text(ctx, line, VIEW_WIDTH / 2, boxY + 15 + i * 11, 'center', 7, SCREEN_COLORS.text);
  });

  // 街机：这是整条路线的收尾（通关 / 失败），比"谁赢了这一场"重要得多
  if (arcade) {
    text(
      ctx,
      arcade.title,
      VIEW_WIDTH / 2,
      62,
      'center',
      arcade.cleared ? 22 : 18,
      arcade.cleared ? SCREEN_COLORS.gold : SCREEN_COLORS.accent,
    );
    text(ctx, arcade.subtitle, VIEW_WIDTH / 2, 92, 'center', 8, SCREEN_COLORS.text);
    if (arcade.nextName) text(ctx, `下一场：${arcade.nextName}`, VIEW_WIDTH / 2, 108, 'center', 7, SCREEN_COLORS.dim);
    // 通关专属结局：小标题 + 一句正文（打完 8 场才看得到的那一屏，不能只是"通关"两个字）
    if (arcade.ending) {
      text(ctx, arcade.ending.headline, VIEW_WIDTH / 2, 112, 'center', 8, SCREEN_COLORS.gold);
      // 正文按宽度折行：一句话太长会直接冲出屏幕
      const line = arcade.ending.line;
      const per = 46;
      for (let i = 0; i * per < line.length && i < 3; i++) {
        text(ctx, line.slice(i * per, (i + 1) * per), VIEW_WIDTH / 2, 126 + i * 11, 'center', 6, SCREEN_COLORS.text);
      }
    }
  }

  if (blinkOn) text(ctx, '点击 / 按 A 回到标题', VIEW_WIDTH / 2, boxY + 58, 'center', 7, SCREEN_COLORS.dim);
}

/** 按字数粗折行（像素字体等宽，20 字 ≈ 一行） */
export function wrapText(text: string, perLine: number): string[] {
  if (perLine <= 0) return [text];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += perLine) out.push(text.slice(i, i + perLine));
  return out.length > 0 ? out : [''];
}

export function drawMode(ctx: Ctx2D, flow: AppFlow, blinkOn: boolean): void {
  ctx.fillStyle = SCREEN_COLORS.bg;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  text(ctx, 'SELECT MODE', VIEW_WIDTH / 2, 34, 'center', 13, SCREEN_COLORS.gold);

  MODE_ITEMS.forEach((item, i) => {
    const y = 76 + i * 26;
    const active = flow.modeCursor === i;
    if (active) {
      ctx.fillStyle = 'rgba(255,91,61,0.22)';
      ctx.fillRect(60, y - 4, VIEW_WIDTH - 120, 20);
    }
    text(ctx, item.label, VIEW_WIDTH / 2, y, 'center', active ? 11 : 9, active ? SCREEN_COLORS.text : SCREEN_COLORS.dim);
  });

  if (blinkOn) text(ctx, '点击选项 · A 确定', VIEW_WIDTH / 2, 194, 'center', 7, SCREEN_COLORS.dim);
}

/** 选项屏行距：10 项设置 + "按键设置"一行，224 高的画面里只有这么多空间 */
const OPT_ROW_TOP = 44;
const OPT_ROW_GAP = 15;

export function drawOptions(ctx: Ctx2D, flow: AppFlow): void {
  ctx.fillStyle = SCREEN_COLORS.bg;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  text(ctx, 'OPTIONS', VIEW_WIDTH / 2, 20, 'center', 13, SCREEN_COLORS.gold);

  const rows = flow.options;
  rows.forEach((row, i) => {
    const y = OPT_ROW_TOP + i * OPT_ROW_GAP;
    const active = flow.optionCursor === i;
    if (active) {
      ctx.fillStyle = 'rgba(255,91,61,0.22)';
      ctx.fillRect(24, y - 4, VIEW_WIDTH - 48, 14);
    }
    text(ctx, row.label, 32, y, 'left', 7, active ? SCREEN_COLORS.text : SCREEN_COLORS.dim);
    text(ctx, `${active ? '◀ ' : ''}${row.value}${active ? ' ▶' : ''}`, VIEW_WIDTH - 32, y, 'right', 7, active ? SCREEN_COLORS.accent : SCREEN_COLORS.text);
  });

  // 最后一行：进"按键设置"
  const y = OPT_ROW_TOP + rows.length * OPT_ROW_GAP;
  const active = flow.optionCursor >= rows.length;
  if (active) {
    ctx.fillStyle = 'rgba(255,91,61,0.22)';
    ctx.fillRect(24, y - 4, VIEW_WIDTH - 48, 14);
  }
  text(ctx, '按键设置', 32, y, 'left', 7, active ? SCREEN_COLORS.text : SCREEN_COLORS.dim);
  text(ctx, '进入 ▶', VIEW_WIDTH - 32, y, 'right', 7, active ? SCREEN_COLORS.accent : SCREEN_COLORS.text);

  text(ctx, '点击一行修改 · B 返回', VIEW_WIDTH / 2, 210, 'center', 6, SCREEN_COLORS.dim);
}

export function drawContinue(ctx: Ctx2D, flow: AppFlow, blinkOn: boolean): void {
  ctx.fillStyle = 'rgba(5,7,10,0.78)';
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  text(ctx, 'CONTINUE?', VIEW_WIDTH / 2, 62, 'center', 16, SCREEN_COLORS.accent);

  const seconds = Math.max(0, Math.ceil(flow.continueLeft / 60));
  text(ctx, `${seconds}`, VIEW_WIDTH / 2, 96, 'center', 30, SCREEN_COLORS.gold);
  text(ctx, `已续关 ${flow.continues} 次`, VIEW_WIDTH / 2, 138, 'center', 7, SCREEN_COLORS.dim);
  if (blinkOn) text(ctx, '按 A 继续挑战', VIEW_WIDTH / 2, 162, 'center', 9, SCREEN_COLORS.text);
}

export function drawKeyBind(ctx: Ctx2D, menu: KeyBindMenu, settings: GameSettings, blinkOn: boolean): void {
  ctx.fillStyle = SCREEN_COLORS.bg;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  text(ctx, 'KEY CONFIG', VIEW_WIDTH / 2, 14, 'center', 12, SCREEN_COLORS.gold);
  text(ctx, menu.side === 1 ? 'P1' : 'P2', VIEW_WIDTH / 2, 32, 'center', 9, menu.side === 1 ? SCREEN_COLORS.accent : '#5aa9ff');

  KEY_ACTIONS.forEach((action, i) => {
    const y = 52 + i * 16;
    const active = menu.row === i;
    if (active) {
      ctx.fillStyle = 'rgba(255,91,61,0.22)';
      ctx.fillRect(18, y - 3, VIEW_WIDTH - 36, 14);
    }
    text(ctx, action.label, 26, y - 1, 'left', 7, active ? SCREEN_COLORS.text : SCREEN_COLORS.dim);
    const label = menu.capturing && active ? '按一个键…' : keyLabelFor(settings, menu.side, action.id);
    text(ctx, label, VIEW_WIDTH - 26, y - 1, 'right', 7, active ? SCREEN_COLORS.accent : SCREEN_COLORS.text);
  });

  const hint = menu.capturing ? '按任意键绑定 · Esc 取消' : '↑↓ 选择 · A 改键 · B 返回';
  if (blinkOn || menu.capturing) text(ctx, hint, VIEW_WIDTH / 2, 200, 'center', 6, SCREEN_COLORS.dim);
  text(ctx, '左/右 切换 P1/P2 · C 恢复预设', VIEW_WIDTH / 2, 210, 'center', 6, SCREEN_COLORS.dim);
}

export function drawChallengePanel(ctx: Ctx2D, board: ChallengeBoard): void {
  const run = board.current;
  const y = 34;
  ctx.fillStyle = 'rgba(5,7,10,0.72)';
  ctx.fillRect(6, y - 4, 168, 26);
  ctx.strokeStyle = run.completed ? SCREEN_COLORS.gold : SCREEN_COLORS.dim;
  ctx.lineWidth = 1;
  ctx.strokeRect(6.5, y - 3.5, 167, 25);

  const color = run.completed ? SCREEN_COLORS.gold : SCREEN_COLORS.text;
  text(ctx, `${run.completed ? '✓ ' : ''}${run.label}`, 12, y, 'left', 7, color);
  text(ctx, run.def.hint, 12, y + 10, 'left', 6, SCREEN_COLORS.dim);
  text(ctx, `${board.doneCount}/${board.runs.length}`, 168, y, 'right', 6, SCREEN_COLORS.dim);
}

export function drawPause(ctx: Ctx2D, menu: SystemMenu, blinkOn: boolean): void {
  const items = menu.items;
  // 先整屏压暗，再给菜单本身一块**不透明**底板：
  // 只压暗的话，背后的模式列表会从字缝里透上来，两层文字叠在一起根本读不清
  ctx.fillStyle = 'rgba(5,7,10,0.82)';
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  const gap = items.length > 4 ? 22 : 26;
  // 面板高度要把底部提示也包进去，否则提示会掉到面板外
  const panelH = 52 + items.length * gap + 16;
  ctx.fillStyle = '#080b11';
  ctx.fillRect(28, 26, VIEW_WIDTH - 56, panelH);
  ctx.strokeStyle = SCREEN_COLORS.accent;
  ctx.lineWidth = 1;
  ctx.strokeRect(28.5, 26.5, VIEW_WIDTH - 57, panelH - 1);
  text(ctx, '菜单', VIEW_WIDTH / 2, 46, 'center', 14, SCREEN_COLORS.accent);

  const top = 82;
  items.forEach((item, i) => {
    const y = top + i * gap;
    const active = menu.cursor === i;
    if (active) {
      ctx.fillStyle = 'rgba(255,91,61,0.22)';
      ctx.fillRect(72, y - 6, VIEW_WIDTH - 144, gap - 2);
    }
    text(ctx, item.label, VIEW_WIDTH / 2, y, 'center', active ? 11 : 9, active ? SCREEN_COLORS.text : SCREEN_COLORS.dim);
  });

  if (blinkOn) text(ctx, '↑↓ 选择 · A 确认 · B 返回', VIEW_WIDTH / 2, VIEW_HEIGHT - 24, 'center', 6, SCREEN_COLORS.dim);
}

/**
 * 菜单行的命中测试（触屏用）。
 *
 * 三张屏的行距、起始 y、命中带高度都写在各自的 draw 里，这里必须和它们对齐——
 * 所以三个函数紧挨着各自的布局常量写在一起，改布局时一眼能看到。
 */
export function hitTestModeItem(x: number, y: number): number {
  if (x < 40 || x > VIEW_WIDTH - 40) return -1;
  for (let i = 0; i < MODE_ITEMS.length; i++) {
    const rowY = 76 + i * 26;
    // 上下各半个行距：相邻两行的命中带首尾相接，中间不留"点不到"的缝
    if (y >= rowY - 8 && y < rowY + 18) return i;
  }
  return -1;
}

/** `rowCount` 含最后的"按键设置"那一行 */
export function hitTestOptionRow(x: number, y: number, rowCount: number): number {
  if (x < 16 || x > VIEW_WIDTH - 16) return -1;
  for (let i = 0; i < rowCount; i++) {
    const rowY = OPT_ROW_TOP + i * OPT_ROW_GAP;
    if (y >= rowY - 6 && y < rowY + 13) return i;
  }
  return -1;
}

export function hitTestPauseItem(x: number, y: number, itemCount: number): number {
  if (x < 60 || x > VIEW_WIDTH - 60) return -1;
  for (let i = 0; i < itemCount; i++) {
    const rowY = 100 + i * 24;
    if (y >= rowY - 8 && y < rowY + 16) return i;
  }
  return -1;
}

/** 选人格子命中测试（鼠标/触屏点选） */
/**
 * 选人屏点选：命中底部缩略条里的第几格。
 *
 * `cursor` 用来算滚动起点——条上只显示 11 个，光标在哪决定窗口从谁开始。
 */
export function hitTestCell(x: number, y: number, count: number, cursor = 0): number {
  if (y < SEL_BAR.y || y >= SEL_BAR.y + SEL_BAR.cell) return -1;
  const start = selectBarStart(count, cursor);
  const barX = selectBarX(count);
  const n = Math.min(count, SEL_BAR.visible);
  const k = Math.floor((x - barX) / (SEL_BAR.cell + SEL_BAR.gap));
  // 落在格间空隙上也算最近的那一格（手指点偏 1~2px 不该点空）
  if (k < 0 || k >= n) return -1;
  const idx = start + k;
  return idx < count ? idx : -1;
}
