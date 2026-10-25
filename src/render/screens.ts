/**
 * 各屏绘制：标题 / 选人 / VS / 结果。
 * 只吃 `Ctx2D`，所以能像 HUD 一样在 node 里用假 ctx 断言"画了什么"。
 */
import type { CharDef } from '../data/schema';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../sim/constants';
import { MODE_ITEMS, gridColumns, type AppFlow } from '../ui/flow';
import { PAUSE_ITEMS } from '../ui/pause';
import type { ChallengeBoard } from '../ui/challenges';
import type { KeyBindMenu } from '../ui/keybind';
import { KEY_ACTIONS, keyLabelFor, type GameSettings } from '../ui/settings';
import type { Ctx2D } from './ctx';
import type { ArcadeResultModel } from '../ui/arcade-result';
import type { MoveEntry } from '../ui/movelist';
import { drawFighter } from './fighter-draw';
import { portraitFor } from './portraits';
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

/** 左上角「返回」按钮的命中区域（逻辑坐标） */
export const BACK_BUTTON = { x: 4, y: 4, w: 40, h: 16 } as const;

/**
 * 「返回」按钮按下去等于按哪个键。
 *
 * 各屏的返回键本来就不统一（选人/模式/选项是 B，结算屏是 A 回标题），
 * 所以这里把映射收成一张表，而不是在点击处写一串 if。
 */
export function backButtonKey(screen: string): 'A' | 'B' | null {
  if (screen === 'mode' || screen === 'select' || screen === 'options' || screen === 'keybind') return 'B';
  if (screen === 'result' || screen === 'continue') return 'A';
  return null;
}

/** 画左上角「返回」（只在需要它的屏上调用） */
export function drawBackButton(ctx: Ctx2D): void {
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = 'rgba(10,14,20,0.72)';
  ctx.fillRect(BACK_BUTTON.x, BACK_BUTTON.y, BACK_BUTTON.w, BACK_BUTTON.h);
  ctx.strokeStyle = SCREEN_COLORS.dim;
  ctx.lineWidth = 1;
  ctx.strokeRect(BACK_BUTTON.x + 0.5, BACK_BUTTON.y + 0.5, BACK_BUTTON.w - 1, BACK_BUTTON.h - 1);
  ctx.globalAlpha = 1;
  text(ctx, '‹ 返回', BACK_BUTTON.x + BACK_BUTTON.w / 2, BACK_BUTTON.y + 4, 'center', 6, SCREEN_COLORS.text);
}

/** 连招演示的浮标：左上角显示"正在演示第几步" */
export function drawDemoLabel(ctx: Ctx2D, label: string, step: number, total: number): void {
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#05070a';
  ctx.fillRect(4, 190, VIEW_WIDTH - 8, 16);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = SCREEN_COLORS.accent;
  ctx.lineWidth = 1;
  ctx.strokeRect(4.5, 190.5, VIEW_WIDTH - 9, 15);
  text(ctx, `演示 ${step + 1}/${total} · ${label}`, VIEW_WIDTH / 2, 194, 'center', 6, SCREEN_COLORS.accent);
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
export const MOVES_BUTTON = { x: 4, y: 204, w: 44, h: 15 } as const;

/** 画「招式」小按钮 */
export function drawMovesButton(ctx: Ctx2D, active: boolean): void {
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = active ? 'rgba(255,91,61,0.28)' : 'rgba(10,14,20,0.72)';
  ctx.fillRect(MOVES_BUTTON.x, MOVES_BUTTON.y, MOVES_BUTTON.w, MOVES_BUTTON.h);
  ctx.strokeStyle = active ? SCREEN_COLORS.accent : SCREEN_COLORS.dim;
  ctx.lineWidth = 1;
  ctx.strokeRect(MOVES_BUTTON.x + 0.5, MOVES_BUTTON.y + 0.5, MOVES_BUTTON.w - 1, MOVES_BUTTON.h - 1);
  ctx.globalAlpha = 1;
  text(ctx, active ? '关招式' : '招式', MOVES_BUTTON.x + MOVES_BUTTON.w / 2, MOVES_BUTTON.y + 4, 'center', 6, active ? SCREEN_COLORS.accent : SCREEN_COLORS.text);
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

export function drawSelect(ctx: Ctx2D, flow: AppFlow, blinkOn: boolean): void {
  ctx.fillStyle = SCREEN_COLORS.bg;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  text(ctx, 'SELECT YOUR FIGHTER', VIEW_WIDTH / 2, 22, 'center', 12, SCREEN_COLORS.gold);

  const count = flow.roster.length;
  flow.roster.forEach((char: CharDef, i: number) => {
    const r = cellRect(i, count, flow.columns);
    const p1Here = flow.cursor[0] === i;
    const p2Here = flow.cursor[1] === i;
    // 名字要保证放得进格子：中文/假名在等宽字体里约等于 1 个字宽 = 字号，
    // 所以按 (格宽 / 字数) 反推字号；小于 4px 就截断加省略号，宁可短也别糊成一团。
    const fitName = (name: string, maxW: number): { label: string; size: number } => {
      const size = Math.min(8, Math.floor((maxW - 2) / Math.max(1, name.length)));
      if (size >= 4) return { label: name, size };
      const maxChars = Math.max(2, Math.floor((maxW - 2) / 4) - 1);
      return { label: `${name.slice(0, maxChars)}…`, size: 5 };
    };

    // 格子底色：有头像就贴头像（按格子长宽比做中心裁切，永远不溢出到邻居家），
    // 没头像才用角色代表色——两条路各自完整，不做"半张脸"的叠加
    const portrait = portraitFor(char.id);
    if (portrait) {
      const SRC = 128;
      const aspect = r.w / Math.max(1, r.h);
      // 宽格子裁掉上下、窄格子裁掉左右；纵向从头顶开始裁，保证脸在上半部
      const sw = aspect >= 1 ? SRC : Math.round(SRC * aspect);
      const sh = aspect >= 1 ? Math.round(SRC / aspect) : SRC;
      ctx.drawImage(portrait, (SRC - sw) / 2, 0, sw, sh, r.x, r.y, r.w, r.h);
    } else {
      ctx.fillStyle = char.palette.primary;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    // 没有头像时才有名字条（有头像时格子只有 20 多像素高，留 12px 给名字等于把脸砍掉一半）
    if (!portrait) {
      ctx.fillStyle = char.palette.secondary;
      ctx.fillRect(r.x, r.y + r.h - 12, r.w, 12);
    }

    // 边框：P1 红、P2 蓝（画在头像之后，不然会被盖住）
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

    // 没有头像时：格子够高就补一个缩小版待机姿势（否则只有名字，太寡淡）
    if (!portrait && r.h >= 30) {
      ctx.save();
      ctx.translate(r.x + r.w / 2, r.y + r.h - 9);
      const figScale = Math.max(0.22, Math.min(0.42, Math.min(r.h / 105, r.w / 140)));
      ctx.scale(figScale, figScale);
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

    const fitted = fitName(char.name, r.w);
    if (!portrait) {
      text(ctx, fitted.label, r.x + r.w / 2, r.y + 4, 'center', fitted.size, SCREEN_COLORS.text);
    }
    if (p1Here) text(ctx, 'P1', r.x + 2, r.y + r.h - 11, 'left', 6, '#ffd9cf');
    if (p2Here) text(ctx, 'CPU', r.x + r.w - 2, r.y + r.h - 11, 'right', 6, '#cfe4ff');
  });

  // 格子里不写名字了，名字统一在底部显示（光标所指 / 已锁定的两人）
  const nameOf = (i: number): string => flow.roster[i]?.name ?? '';
  const cursorIdx = flow.cursor[0];
  const picked = flow.picks?.map((c) => c.name).join(' / ') ?? '';
  if (picked) {
    text(ctx, picked, VIEW_WIDTH / 2, 191, 'center', 8, SCREEN_COLORS.gold);
  } else if (cursorIdx >= 0) {
    text(ctx, nameOf(cursorIdx), VIEW_WIDTH / 2, 190, 'center', 9, SCREEN_COLORS.text);
  }

  const label = flow.locked[0] ? '已确定 · B/D 重选' : '点格子选人 · A 确认';
  if (blinkOn || flow.locked[0]) text(ctx, label, VIEW_WIDTH / 2, 203, 'center', 7, SCREEN_COLORS.text);
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

export function drawOptions(ctx: Ctx2D, flow: AppFlow): void {
  ctx.fillStyle = SCREEN_COLORS.bg;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  text(ctx, 'OPTIONS', VIEW_WIDTH / 2, 20, 'center', 13, SCREEN_COLORS.gold);

  const rows = flow.options;
  rows.forEach((row, i) => {
    const y = 52 + i * 19;
    const active = flow.optionCursor === i;
    if (active) {
      ctx.fillStyle = 'rgba(255,91,61,0.22)';
      ctx.fillRect(24, y - 4, VIEW_WIDTH - 48, 16);
    }
    text(ctx, row.label, 32, y, 'left', 7, active ? SCREEN_COLORS.text : SCREEN_COLORS.dim);
    text(ctx, `${active ? '◀ ' : ''}${row.value}${active ? ' ▶' : ''}`, VIEW_WIDTH - 32, y, 'right', 7, active ? SCREEN_COLORS.accent : SCREEN_COLORS.text);
  });

  // 最后一行：进"按键设置"
  const y = 52 + rows.length * 19;
  const active = flow.optionCursor >= rows.length;
  if (active) {
    ctx.fillStyle = 'rgba(255,91,61,0.22)';
    ctx.fillRect(24, y - 4, VIEW_WIDTH - 48, 16);
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

export function drawPause(ctx: Ctx2D, cursor: number, blinkOn: boolean): void {
  ctx.fillStyle = 'rgba(5,7,10,0.72)';
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  text(ctx, 'PAUSE', VIEW_WIDTH / 2, 54, 'center', 16, SCREEN_COLORS.accent);

  PAUSE_ITEMS.forEach((item, i) => {
    const y = 100 + i * 24;
    const active = cursor === i;
    if (active) {
      ctx.fillStyle = 'rgba(255,91,61,0.22)';
      ctx.fillRect(84, y - 4, VIEW_WIDTH - 168, 20);
    }
    text(ctx, item.label, VIEW_WIDTH / 2, y, 'center', active ? 11 : 9, active ? SCREEN_COLORS.text : SCREEN_COLORS.dim);
  });

  if (blinkOn) text(ctx, '点击选择 · A 确认', VIEW_WIDTH / 2, 194, 'center', 6, SCREEN_COLORS.dim);
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
    const rowY = 52 + i * 19;
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
export function hitTestCell(x: number, y: number, count: number, columns = gridColumns(count)): number {
  for (let i = 0; i < count; i++) {
    const r = cellRect(i, count, columns);
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return i;
  }
  return -1;
}
