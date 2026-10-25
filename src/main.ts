/**
 * 入口：画布 / 输入 / 流程 / 对局 / 训练模式 / 循环，全在这里接线。
 *
 * 屏幕按 `AppFlow` 走：标题 → 选人 → VS → 对战 → 结果 → 标题。
 * 玩法逻辑一律在 `sim/` + `data/`，这里只做"把谁喂给谁"。
 */
import { CPU_LEVEL_LABEL } from './ai/cpu';
import { WebAudioBgm, fightTrackFor } from './audio/bgm';
import { sfxForWorldEvent, voiceForWorldEvent, WebAudioSink } from './audio/sfx';
import { FixedStepper, startAnimationLoop } from './core/loop';
import { ROSTER } from './data/chars';
import { winQuoteFor } from './data/chars/quotes';
import type { CharDef } from './data/schema';
import { Match } from './game/match';
import { ReplayPlayer, ReplayRecorder, matchFromReplay, type Replay } from './game/replay';
import { KeyboardSource, keyPresetAt } from './input/keyboard';
import type { Ctx2D } from './render/ctx';
import { drawPose, setPixelSize } from './render/fighter-draw';
import { downloadCanvas, renderSheet, type SheetSpec } from './render/sheet-export';
import { POSE_LIBRARY } from './render/poses';
import { lookFor } from './render/looks';
import { drawFrame } from './render/renderer';
import { ensurePortraits } from './render/portraits';
import { ensureStageArt } from './render/stage-art';
import { setWeatherEnabled, stageForIndex, stageForSeed } from './render/stage-draw';
import { ensureTitleArt } from './render/title-art';
import { ensureCharSheets, installSheetProvider, sheetReady } from './render/sprite-loader';
import { applyViewport, computeViewport, shouldRotate, type SafeInsets } from './render/scale';
import {
  drawContinue,
  drawChallengePanel,
  drawKeyBind,
  drawMode,
  drawPause,
  drawOptions,
  drawHelp,
  drawMoveList,
  drawMoveHint,
  drawTrainingBadge,
  drawComboMeter,
  drawStageBadge,
  drawLoadingHint,
  drawDemoResult,
  drawDemoLabel,
  drawPadAdjustHint,
  menuButtonRect,
  drawMenuButton,
  movesButtonRect,
  drawMovesButton,
  drawResult,
  HELP_BUTTON,
  HELP_PAGE_COUNT,
  drawSelect,
  drawTitle,
  drawVs,
  hitTestCell,
  hitTestModeItem,
  hitTestOptionRow,
  hitTestPauseItem,
} from './render/screens';
import { setViewWidthByAspect, VIEW_HEIGHT, VIEW_WIDTH } from './sim/constants';
import { Btn } from './core/input';
import { AppFlow } from './ui/flow';
import { afterStage, isCleared, newArcade, type ArcadeState } from './ui/arcade';
import { arcadeResult } from './ui/arcade-result';
import { moveListFor } from './ui/movelist';
import type { PadCustom } from './ui/pad-layout';
import { comboSets, flattenSteps, stepAt } from './ui/combo-demo';
import { arcadeRules, arcadeTeam, arcadeTeamName } from './ui/arcade-roster';
import { ARCADE_ROUTE } from './ui/arcade';
import { ChallengeBoard } from './ui/challenges';
import { KeyBindMenu } from './ui/keybind';
import { PauseMenu } from './ui/pause';
import { SettingsStore, keymapFor, type StorageLike } from './ui/settings';
import { TrainingSession, drawTrainingOverlay } from './ui/training';
import { mountTouchControls } from './ui/touch-controls';
import { VirtualPad } from './ui/virtual-pad';

const canvas = document.getElementById('screen') as HTMLCanvasElement | null;
if (!canvas) throw new Error('缺少 #screen canvas');

const raw = canvas.getContext('2d', { alpha: false });
if (!raw) throw new Error('无法创建 2D context');
// CanvasRenderingContext2D 的 textAlign 等属性比我们声明的宽，需要在边界处断言一次
const ctx = raw as unknown as Ctx2D;

/** 触屏设备：手台、铺满、全屏、点选菜单都按这个开关走 */
const IS_TOUCH =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches === true ||
    // 调试/演示用：`?touch=1` 在桌面浏览器里也能走触屏那套（铺满 + 点选）
    new URLSearchParams(window.location.search).get('touch') === '1');

let device = 1;
/** 内容在画布内的偏移（铺满窗口后两侧留白，内容居中） */
let deviceOffsetX = 0;
let deviceOffsetY = 0;

/**
 * 菜单上下文：对局/结算这类"正在推进世界"的界面不需要"返回上一级"，
 * 标题/模式/选人/选项这类菜单界面才需要（它们原来靠左上角返回键）。
 */
function menuContextFor(screen: string): 'fight' | 'menu' {
  if (screen === 'fight' || screen === 'result' || screen === 'continue' || screen === 'title') return 'fight';
  return 'menu';
}

/** 打开系统菜单（任何界面都能叫出来） */
function openMenu(): void {
  pause.show(menuContextFor(flow.screen));
  bgm.setDucked(true);
  audio.play('confirm');
}

/** 进入手台位置调整（暂停菜单与选项屏共用） */
function enterPadAdjust(): void {
  padAdjusting = true;
  padDraft = { ...settings.settings.padCustom };
  controls.setAdjusting(true, (next) => {
    padDraft = next;
  });
}

/** 手台位置调整中（拖动改位置，画面冻结） */
let padAdjusting = false;
/** 调整中的草稿：取消就丢掉，确认才写进设置 */
let padDraft: PadCustom = {};

/**
 * 连招演示：脚本帧 / 当前帧 / 每步起始帧；null = 没在演示。
 *
 * 必须**在 mountTouchControls 之前**声明：手台的功能条 label 是惰性闭包，
 * 挂载时就会读一次，声明在后面会 TDZ 报错直接黑屏（踩过两次）。
 */
let demoFrames: number[] | null = null;
let demoIndex = 0;
let demoStarts: number[] = [];
/** 演示结果浮层剩余帧 / 实际连击数 / 实际伤害 */
let demoResultLeft = 0;
let demoResultHits = 0;
let demoResultDamage = 0;
/** 演示开始前对手的血量（用来算真实伤害） */
let demoDamageBase = 0;

/** 当前选中的连段套数（0 入门 / 1 标准 / 2 高伤） */
let demoSegment = 0;
/** 手台句柄：`resize()` 在模块初始化阶段就会跑，那时 `controls` 还没建好（TDZ），所以走可变引用 */
let padHandle: { layout(w: number, h: number, insets: SafeInsets): void } | null = null;

/** 从探针元素读刘海/圆角的安全区（拿不到就按 0 处理） */
function safeInsets(): SafeInsets {
  const probe = document.getElementById('safe-probe');
  if (!probe) return { top: 0, right: 0, bottom: 0, left: 0 };
  const cs = getComputedStyle(probe);
  const px = (v: string): number => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  return { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
}

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const insets = safeInsets();
  // 先按窗口长宽比定"看多宽"，再算缩放：宽屏看 398×224 而不是 320×224（不留黑边）
  setViewWidthByAspect(w, h);
  const vp = computeViewport(w, h, window.devicePixelRatio, insets, { fill: IS_TOUCH });
  const applied = applyViewport(canvas!, vp, true);
  device = applied.device;
  deviceOffsetX = applied.offsetX;
  deviceOffsetY = applied.offsetY;
  // 手台按屏幕短边比例重排（不是固定 px），旋转屏幕/切全屏都会走这里
  padHandle?.layout(w, h, insets);
  // 竖屏时盖一层"请横屏"，否则画面只有拇指大小
  document.getElementById('rotate-hint')?.classList.toggle('show', shouldRotate(w, h));
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
// 进出全屏时窗口尺寸会变，必须重排一次（否则画面停在旧的缩放上）
document.addEventListener('fullscreenchange', () => setTimeout(resize, 60));

// 竖屏遮罩整块可点：点一下就进全屏并请求锁横屏（必须在用户手势里发起）
document.getElementById('rotate-hint')?.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  void enterLandscapeFullscreen();
});
resize();

/** localStorage 可能被禁（隐私模式），拿不到就用 null —— 设置只是不持久化，不影响开局 */
function browserStorage(): StorageLike | null {
  try {
    const probe = '__kof_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * 像素粒度：`?px=1` 最细、`?px=16` 最粗（就是个马赛克玩具）。
 * 做成 URL 参数是为了方便对比——正式选项在"选项屏 → 像素粒度"。
 */
{
  const raw = new URLSearchParams(window.location.search).get('px');
  if (raw !== null) setPixelSize(Number.parseFloat(raw));
}

/**
 * 自绘贴图：有就用，没有就用程序化骨架（同一套坐标，随时可切）。
 *
 * `?art=proc` 强制走程序化绘制，方便跟贴图版左右对比。
 * 素材是**按角色**加载的：开局只装场上这 6 个人的图集，没素材的角色自然回落。
 */
if (new URLSearchParams(window.location.search).get('art') !== 'proc') {
  installSheetProvider();
  void ensureCharSheets(['kyo']);
}

// 头像很小（~25KB/张），选人屏要一次显示二十多个，所以开局一次性预载整套
ensurePortraits(ROSTER.map((c) => c.id));
// 舞台底图只有 3 张，也一次预载（缺失就回落程序化背景）
ensureStageArt(['skyline', 'valley', 'arena', 'harbor', 'snow']);
ensureTitleArt();

const audio = new WebAudioSink();
const bgm = new WebAudioBgm();
const pause = new PauseMenu();
const keybind = new KeyBindMenu();
const challenges = new ChallengeBoard();
const settings = new SettingsStore(browserStorage());
audio.setVolume(settings.settings.sfxVolume);
bgm.setVolume(settings.settings.bgmVolume);
const flow = new AppFlow(ROSTER, undefined, settings);
const pad = new VirtualPad();

let match: Match | null = null;
let training: TrainingSession | null = null;
/** 本局录制器（每帧输入） */
let recorder: ReplayRecorder | null = null;
/** 上一场录好的回放 */
let lastReplay: Replay | null = null;
/** 正在回放时，输入来自回放而不是键盘 */
let replayPlayer: ReplayPlayer | null = null;

const preset = keyPresetAt(settings.settings.keyPreset);
const p1keys = new KeyboardSource(preset.p1);
const p2keys = new KeyboardSource(preset.p2);
p1keys.attach(window);
p2keys.attach(window);

/** 键位变了（换预设或逐键重绑）就重建映射表；不重建监听，按住中的键也不受影响 */
/** 按键菜单正在吃输入时，别让 flow 也吃（见 step 里的注释） */
let muteFlow = false;
let appliedKeys = '';
function syncKeys(): void {
  const sig = JSON.stringify([settings.settings.keyPreset, settings.settings.customKeys]);
  if (sig === appliedKeys) return;
  appliedKeys = sig;
  p1keys.setMap(keymapFor(settings.settings, 1));
  p2keys.setMap(keymapFor(settings.settings, 2));
}
window.addEventListener('blur', () => {
  p1keys.clear();
  p2keys.clear();
  pad.releaseAll();
});

/**
 * 组队：以选中的角色打头，其余角色按花名册顺序补满。
 * （真正的"选三个人 + 排顺序"要等花名册有足够角色再做，见 TASKS T10）
 */
function teamFor(starter: CharDef): CharDef[] {
  const first = ROSTER.indexOf(starter);
  // KOF 是 3v3：选中的打头，剩下的按花名册顺序补到 3 人
  return [ROSTER[first]!, ...ROSTER.filter((_, i) => i !== first)].slice(0, 3);
}

/**
 * 开始一场新对局（选人结果已定）。
 * 局数/时间/难度都从设置里读——设置改了不用重启页面。
 */
function startMatch(): void {
  const [a, b] = flow.picks ?? [ROSTER[0]!, ROSTER[1] ?? ROSTER[0]!];
  const cfg = settings.settings;

  // 街机模式：第一次开局时建进度；对手来自路线表，而不是"对面玩家选的人"
  if (flow.mode === 'arcade' && arcade === null) arcade = newArcade();
  const inArcade = flow.mode === 'arcade' && arcade !== null;
  const playerTeam = teamFor(a);
  const enemyTeam = inArcade ? arcadeTeam(arcade!) : teamFor(b);
  if (enemyTeam.length === 0) {
    // 路线表里一个角色都找不到（数据坏了），退回"对面选的人"，别让玩家卡住
    enemyTeam.push(...teamFor(b));
  }
  const rules = inArcade ? arcadeRules(arcade!) : { cpuLevel: cfg.cpuLevel, hpScale: 1 };
  cpuHpScaledFor = -1;

  // 图集加载分两批：**先装场上两个人**，画面才能尽快出贴图；其余 4 人后台补。
  // 线上（GitHub Pages）单张图集 2MB、冷缓存要 20~30 秒，6 个一起请求会互相拖慢，
  // 结果就是玩家进场先看到程序化像素人。
  const firstTwo = [playerTeam[0]!, enemyTeam[0]!].map((c) => c.id);
  void ensureCharSheets(firstTwo).then(() =>
    ensureCharSheets([...playerTeam, ...enemyTeam].map((c) => c.id)),
  );
  match = new Match(playerTeam, enemyTeam, {
    roundsToWin: cfg.roundsToWin,
    roundSeconds: cfg.roundSeconds,
  });
  recorder = new ReplayRecorder({
    seed: match.world.seed,
    config: match.config,
    teams: [playerTeam.map((c) => c.id), enemyTeam.map((c) => c.id)],
  });
  training = new TrainingSession(match, {
    showBoxes: cfg.showBoxes,
    showFrameData: cfg.showFrameData,
    cpuLevel: rules.cpuLevel,
    // 训练模式：无限血/气，站着不动的木桩，方便练连段
    infiniteHp: flow.mode === 'training',
    infiniteMeter: flow.mode === 'training',
    // 观战：两边都交给 CPU；训练：站着不动的木桩；双人：P2 用键盘
    dummy: flow.mode === 'training' ? 'stand' : flow.mode === 'versus' ? 'human' : 'cpu',
    cpuP1: flow.mode === 'watch',
  });
  audio.setVolume(cfg.sfxVolume);
}

/** 这一场是不是 BOSS 战（任一方带 boss 属性） */
function isBossFight(): boolean {
  return match !== null && (match.p1.char.boss !== undefined || match.p2.char.boss !== undefined);
}

/** 每个屏配哪首曲子（同屏不重复设置，setTrack 内部会去重） */
function trackFor(screen: string): string | null {
  if (screen === 'fight' || screen === 'continue') {
    if (!match) return 'fight';
    return fightTrackFor(match.p1.char.id, match.p2.char.id, isBossFight());
  }
  if (screen === 'result') return 'result';
  return 'title';
}

let prevPauseHeld = 0;

function dummyLabel(): string {
  return `假人:${training?.settings.dummy ?? 'cpu'}`;
}

/** 对局中才有意义的功能按钮（菜单里点它们不做事） */
const controls = mountTouchControls(pad, [
  {
    id: 'boxes',
    label: () => `判定框:${training?.settings.showBoxes === true ? 'ON' : 'OFF'}`,
    run: () => void training?.toggle('showBoxes'),
  },
  {
    id: 'frames',
    label: () => `帧数:${training?.settings.showFrameData === true ? 'ON' : 'OFF'}`,
    run: () => void training?.toggle('showFrameData'),
  },
  {
    id: 'meter',
    label: () => `无限气:${training?.settings.infiniteMeter === true ? 'ON' : 'OFF'}`,
    run: () => void training?.toggle('infiniteMeter'),
  },
  {
    id: 'hp',
    label: () => `无限血:${training?.settings.infiniteHp === true ? 'ON' : 'OFF'}`,
    run: () => void training?.toggle('infiniteHp'),
  },
  { id: 'dummy', label: dummyLabel, run: () => void training?.cycleDummy() },
  { id: 'level', label: () => `难度:${CPU_LEVEL_LABEL[training?.settings.cpuLevel ?? 'normal']}`, run: () => void training?.cycleCpuLevel() },
  {
    id: 'combo',
    label: () => (comboSets()[demoSegment] ?? comboSets()[0]!).name,
    run: () => {
      demoSegment = (demoSegment + 1) % comboSets().length;
      demoFrames = null; // 换套时停掉正在播的那套，避免半截串味
      demoIndex = 0;
      audio.play('menu');
    },
  },
  {
    id: 'demo',
    label: () => (demoFrames ? '演示中…' : '演示连招'),
    run: () => {
      if (demoFrames) {
        demoFrames = null;
        demoIndex = 0;
        return;
      }
      const set = comboSets(match?.p1.char)[demoSegment] ?? comboSets()[0]!;
      const { frames, starts } = flattenSteps(set.steps);
      demoFrames = frames;
      demoStarts = starts;
      demoIndex = 0;
      if (match) {
        match.softReset();
        demoDamageBase = match.p2.hp;
        demoResultLeft = 0;
      }
    },
  },
  {
    id: 'reset',
    label: () => (match?.phase === 'over' ? '再来一场' : '重开'),
    run: () => {
      if (!match) return;
      if (match.phase === 'over') match.restart();
      else match.softReset();
    },
  },
], {
  // 手台在画布之外，第一次按它也要解锁音频并进全屏（画布的 pointerdown 收不到）
  onFirstInput: () => {
    audio.resume();
    enterFullscreenOnce();
  },
});
padHandle = controls;
controls.setCustom(settings.settings.padCustom);
resize();

window.addEventListener('keydown', (e) => {
  // H = 随时打开说明（触屏走标题右上角那个按钮）
  if (e.code === 'KeyL' && helpPage < 0 && !pause.open) {
    e.preventDefault();
    moveListOpen = !moveListOpen;
    return;
  }
  if (e.code === 'KeyH' && helpPage < 0) {
    e.preventDefault();
    helpPage = 0;
    return;
  }
  // 按键设置屏要拿原始 event.code，自己处理完就不再往下传
  if (flow.screen === 'keybind') {
    e.preventDefault();
    muteFlow = true;
    if (keybind.capturing) {
      keybind.apply(e.code, (side, action, code) => {
        settings.setKey(side, action, code);
        audio.play('confirm');
      });
      return;
    }
    switch (e.code) {
      case 'ArrowUp':
        keybind.move(-1);
        break;
      case 'ArrowDown':
        keybind.move(1);
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
        keybind.toggleSide();
        break;
      case 'KeyJ':
      case 'Enter':
        keybind.beginCapture();
        break;
      case 'KeyU':
        settings.clearKeys(keybind.side);
        audio.play('menu');
        break;
      case 'KeyK':
      case 'Escape':
        flow.screen = 'options';
        muteFlow = true;
        break;
      default:
        break;
    }
    return;
  }

  switch (e.code) {
    case 'F1':
      e.preventDefault();
      training?.toggle('showBoxes');
      break;
    case 'F2':
      e.preventDefault();
      training?.toggle('showFrameData');
      break;
    case 'F3':
      e.preventDefault();
      training?.toggle('infiniteMeter');
      break;
    case 'F4':
      e.preventDefault();
      training?.toggle('infiniteHp');
      break;
    case 'F5':
      e.preventDefault();
      training?.cycleDummy();
      break;
    case 'F6':
      e.preventDefault();
      training?.cycleCpuLevel();
      break;
    case 'F10': {
      // 导出当前 P1 的素材模板（每个格子 = 一个动画的一帧，和 spriteSheetProvider 的切图规则一致）
      e.preventDefault();
      const char = flow.picks?.[0] ?? ROSTER[0];
      if (!char) break;
      const spec: SheetSpec = {
        anims: {
          idle: 2,
          walkF: 4,
          walkB: 4,
          punchLight: 3,
          punchHeavy: 3,
          kickLight: 3,
          kickHeavy: 3,
          guard: 2,
          hit: 3,
          down: 2,
          win: 2,
          lose: 1,
        },
        columns: 8,
        frameW: 48,
        frameH: 96,
      };
      const canvas = renderSheet(spec, (ctx2, box, anim, index) => {
        const pose = POSE_LIBRARY[anim];
        const frame = pose?.frames[Math.min(index, pose.frames.length - 1)];
        if (!frame) return;
        ctx2.save();
        ctx2.translate(box.x + box.w / 2, box.y + box.h - 6);
        // 原生 2D context 满足 Ctx2D 的调用子集，这里只是类型上要显式转一下
        drawPose(ctx2 as unknown as Ctx2D, frame, char.palette, { look: lookFor(char.id), anim });
        ctx2.restore();
      });
      downloadCanvas(canvas, `${char.id}-sheet.png`);
      break;
    }
    case 'F7':
      e.preventDefault();
      challenges.next();
      break;
    case 'F8':
      e.preventDefault();
      challenges.resetAll();
      break;
    case 'F9':
      e.preventDefault();
      if (!lastReplay) break;
      try {
        match = matchFromReplay(lastReplay, (id) => ROSTER.find((c) => c.id === id));
        replayPlayer = new ReplayPlayer(lastReplay);
        recorder = null;
        training = new TrainingSession(match, { dummy: 'human', showBoxes: false, showFrameData: false });
        flow.screen = 'fight';
        flow.mode = 'arcade';
        audio.play('confirm');
      } catch {
        audio.play('menu');
      }
      break;
    case 'Escape':
      // 任意界面都能叫出系统菜单（桌面快捷键；触屏用左下角「菜单」按钮）
      if (pause.open) {
        pause.hide();
        bgm.setDucked(false);
      } else {
        openMenu();
      }
      break;
    default:
      return;
  }
  controls.refresh();
});

/**
 * 首次触摸时进全屏并尝试锁横屏。
 *
 * 必须发生在用户手势的回调里（浏览器要求），所以挂在第一次 pointerdown 上。
 * 全屏/锁屏 API 在桌面、iOS Safari 上可能直接没有或抛异常，一律静默跳过。
 */
let fullscreenTried = false;
function enterFullscreenOnce(): void {
  if (fullscreenTried || !IS_TOUCH) return;
  fullscreenTried = true;
  void enterLandscapeFullscreen();
}

/**
 * 进横屏全屏。
 *
 * 必须在**用户手势的回调里**调用（浏览器要求），所以入口有两个：
 * 竖屏遮罩上那颗按钮，以及第一次触摸画布/手台。
 *
 * `orientation.lock` 只在全屏下生效，所以顺序不能反；iOS Safari 两者都不支持，
 * 那就把提示文案换成"请手动旋转"，而不是让玩家对着一个点不动的按钮。
 */
async function enterLandscapeFullscreen(): Promise<void> {
  const root = document.documentElement;
  try {
    if (!document.fullscreenElement) await root.requestFullscreen?.();
  } catch {
    // 不支持全屏：继续尝试锁屏（部分浏览器单独支持）
  }
  try {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await orientation?.lock?.('landscape');
  } catch {
    // iOS 等不允许网页锁横屏：靠玩家手动旋转
  }
  // 锁成功会触发 resize/orientationchange；再补一次，覆盖"没触发"的浏览器
  setTimeout(resize, 150);
  setTimeout(updateRotateHintText, 700);
}

/** 竖屏遮罩的文案：锁屏失败时明确告诉玩家要手动转 */
function updateRotateHintText(): void {
  const sub = document.getElementById('rotate-sub');
  const cta = document.getElementById('rotate-cta');
  if (!sub || !cta) return;
  if (!shouldRotate(window.innerWidth, window.innerHeight)) return; // 已经是横屏了，不用改
  if (document.fullscreenElement) {
    cta.textContent = '请手动把手机横过来';
    sub.textContent = '已进入全屏，但这个浏览器不允许网页锁定方向';
  } else {
    cta.textContent = '再点一次进入全屏';
    sub.textContent = '浏览器拒绝了全屏请求：可以直接手动把手机横过来玩';
  }
}

/** 画布点击：标题/结果当"按 A"，选人屏直接点格子，菜单屏点行选中 */
canvas.addEventListener('pointerdown', (e) => {
  audio.resume();
  enterFullscreenOnce();

  // 说明浮层打开时，点哪都算翻页
  if (helpPage >= 0) {
    helpAdvanceQueued = true;
    return;
  }
  // 画布铺满窗口后，游戏内容只占中间一块：先换算成画布像素，再减去内容偏移。
  // 直接按 canvas 的 CSS 宽高换算会整体偏移一个"留白宽度"，点菜单就会点空。
  const rect = canvas.getBoundingClientRect();
  const px = ((e.clientX - rect.left) * canvas.width) / Math.max(1, rect.width);
  const py = ((e.clientY - rect.top) * canvas.height) / Math.max(1, rect.height);
  const x = (px - deviceOffsetX) / device;
  const y = (py - deviceOffsetY) / device;

  // 左下角「菜单」：触屏没有 Start 键，靠它叫出系统菜单
  if (
    x >= menuButtonRect().x &&
    x <= menuButtonRect().x + menuButtonRect().w &&
    y >= menuButtonRect().y &&
    y <= menuButtonRect().y + menuButtonRect().h
  ) {
    openMenu();
    return;
  }

  // 左下角「招式」开关
  if (
    (flow.screen === 'fight' || flow.screen === 'select') &&
    x >= movesButtonRect().x &&
    x <= movesButtonRect().x + movesButtonRect().w &&
    y >= movesButtonRect().y &&
    y <= movesButtonRect().y + movesButtonRect().h
  ) {
    moveListOpen = !moveListOpen;
    return;
  }

  // 标题屏右上角「怎么玩」
  if (flow.screen === 'title') {
    const inBox =
      x >= HELP_BUTTON.x && x <= HELP_BUTTON.x + HELP_BUTTON.w && y >= HELP_BUTTON.y && y <= HELP_BUTTON.y + HELP_BUTTON.h;
    if (inBox) {
      helpPage = 0;
      return;
    }
  }

  // 暂停菜单盖在最上面，优先处理
  if (pause.open) {
    const hit = hitTestPauseItem(x, y, pause.items.length);
    if (hit >= 0 && hit !== pause.cursor) {
      // 点击 = 选中（不再直接执行）：确认键是 A
      pause.cursor = hit;
      audio.play('menu');
      return;
    }
  }

  // 菜单屏：点击只移动光标（确认一律走 A），避免误触直接进游戏
  if (flow.screen === 'mode') {
    const hit = hitTestModeItem(x, y);
    if (hit >= 0 && hit !== flow.modeCursor) {
      flow.modeCursor = hit;
      audio.play('menu');
      return;
    }
  }
  if (flow.screen === 'options') {
    const rows = flow.options.length + 1; // 末行是"按键设置"
    const hit = hitTestOptionRow(x, y, rows);
    if (hit >= 0 && hit !== flow.optionCursor) {
      // 只选中；"手台位置"这类行同样要再按 A 才进入
      flow.optionCursor = hit;
      audio.play('menu');
      return;
    }
  }
  if (flow.screen === 'select') {
    const cell = hitTestCell(x, y, flow.rosterSize, flow.config.columns);
    if (cell >= 0 && cell !== flow.cursor[0]) {
      // 点头像 = 选中该角色，锁定仍然按 A
      flow.cursor[0] = cell;
      audio.play('menu');
      return;
    }
  }
  // 其余屏：把这次点击当成一次 A
  pad.press('A');
});

canvas.addEventListener('pointerup', () => pad.release('A'));

const stepper = new FixedStepper();
let uiTick = 0;
/**
 * 界面/流程音效：靠**前后状态差**触发。
 *
 * 为什么不给 flow/match 加回调：那要改两个模块的接口和全部测试；
 * 而这些提示只关心"变了没有"，一次状态对比就够，还不会漏。
 */
const sfxCue = {
  screen: '',
  modeCursor: -1,
  optionCursor: -1,
  cell: -1,
  locked: false,
  phase: '',
  indexes: '',
  tickAt: -1,
};

function cueInterfaceSounds(): void {
  const c = sfxCue;
  if (flow.screen !== c.screen) {
    if (c.screen !== '') audio.play(flow.screen === 'title' ? 'cancel' : 'confirm');
    c.screen = flow.screen;
  }
  if (flow.modeCursor !== c.modeCursor || flow.optionCursor !== c.optionCursor || flow.cursor[0] !== c.cell) {
    if (c.modeCursor >= 0 || c.optionCursor >= 0 || c.cell >= 0) audio.play('menu');
    c.modeCursor = flow.modeCursor;
    c.optionCursor = flow.optionCursor;
    c.cell = flow.cursor[0];
  }
  const locked = flow.locked[0] === true;
  if (locked && !c.locked) audio.play('select');
  c.locked = locked;
}

/** 训练场本次最高连击（连断后保留，换对手/重开时清零） */
let trainingBestCombo = 0;

/** 已经预加载过的对手队（避免 VS 屏每帧重复发起同一批请求） */
let preloadedEnemyKey = '';

/**
 * 街机换场预加载：VS 演出期间就把下一场对手装进来。
 *
 * 原来是等 `startMatch()` 才 `ensureCharSheets()`——3 打 3 一共 6 个角色、
 * 每人 2~3MB，进场那一瞬间正好在解图，表现就是"开场先白模、再闪一下"。
 * VS 屏有 90 帧准备时间，用它把图提前装好。
 */
function preloadNextOpponent(): void {
  if (flow.mode !== 'arcade' || !arcade) return;
  if (flow.screen !== 'vs') return;
  const team = arcadeTeam(arcade);
  if (team.length === 0) return;
  const key = team.map((c) => c.id).join(',');
  if (key === preloadedEnemyKey) return;
  preloadedEnemyKey = key;
  const mine = match?.p1?.char.id;
  void ensureCharSheets([...team.map((c) => c.id), ...(mine ? [mine] : [])]);
}

/**
 * 这一局用哪条舞台。
 *
 * 街机按场次走（8 场能看到 5 条不同的），双人/训练按对局种子固定 —— 同一局不会跳变。
 */
function currentStage() {
  if (flow.mode === 'arcade' && arcade) return stageForIndex(arcade.stage);
  return stageForSeed(match?.world.seed ?? 1);
}

/** CPU 残血换人的冷却（帧）：换完至少打这么久才允许再换，避免刚上场就撤 */
let cpuTagCooldown = 0;
/** 残血换人阈值：低于这个血量比例就考虑撤退 */
const CPU_TAG_HP_RATIO = 0.25;

/**
 * CPU 残血撤退：血量低 + 还有队友 + 冷却好了 就换人。
 *
 * 只在街机/双人对 CPU 的对局里生效——训练场的假人是让人练连段的，
 * 自动换人会把练习目标换掉。
 */
function stepCpuTag(): void {
  if (!match || match.phase !== 'fight') return;
  if (flow.mode === 'training') return;
  if (cpuTagCooldown > 0) {
    cpuTagCooldown--;
    return;
  }
  const p2 = match.p2;
  if (p2.hp / p2.maxHp > CPU_TAG_HP_RATIO) return;
  if (match.tagOut(2)) cpuTagCooldown = 120;
}

/**
 * 难度：把 CPU 血量倍率作用到当前出场的 CPU 角色上。
 *
 * 为什么不改 `Match`：血量在换人/回合重置时会跟着角色重建，
 * 与其在每个重建点插一刀，不如"每帧检查出场角色变了没有"——只有变化时才缩放一次，
 * 换人、重开、续关都自动覆盖。
 */
function applyCpuHpScale(): void {
  if (!match || !arcade) return;
  const { hpScale } = arcadeRules(arcade);
  if (hpScale === 1) return;
  const idx = match.indexes[1];
  if (cpuHpScaledFor === idx) return;
  cpuHpScaledFor = idx;
  match.p2.maxHp = Math.max(1, Math.round(match.p2.maxHp * hpScale));
  match.p2.hp = Math.max(1, Math.round(match.p2.hp * hpScale));
}

function cueMatchSounds(): void {
  if (!match) return;
  const c = sfxCue;
  const phase = match.phase;
  if (phase !== c.phase) {
    if (phase === 'fight') audio.play('roundStart');
    if (phase === 'over') audio.play(match.matchWinner === 1 ? 'win' : 'lose');
    c.phase = phase;
  }
  const idx = match.indexes.join(',');
  if (idx !== c.indexes) {
    if (c.indexes !== '') audio.play('swap');
    c.indexes = idx;
  }
  // 读秒：最后 5 秒每秒一声（用整秒边界去重）
  if (phase === 'fight') {
    const sec = Math.ceil(match.timerFrames / 60);
    if (sec <= 5 && sec !== c.tickAt) {
      c.tickAt = sec;
      audio.play('tick');
    }
  } else {
    c.tickAt = -1;
  }
}

/**
 * 说明浮层当前页（-1 = 关闭）。
 *
 * 做成浮层而不是新屏幕：它要在标题/选人/对战中都能随时打开，
 * 而且打开时应该**冻结世界**（读说明时被打死很出戏）。
 */
let helpPage = -1;
/** 招式清单开关（对局中按 L 或点左下角按钮） */
let moveListOpen = false;
/** 首次必杀提示剩余帧（0 = 不显示）；只弹一次，记在 localStorage */
let moveHintFrames = 0;
const MOVE_HINT_SEEN_KEY = 'kof97.seenMoveHint';
/** 点屏翻页：触屏没有"按下边沿"可读，用一次性标记 */
let helpAdvanceQueued = false;
/** 上一帧的按键状态（翻页需要边沿，不然按住会连翻） */
let prevHelpHeld = 0;
const HELP_SEEN_KEY = 'kof97.seenHelp';

/** 街机进度：null = 不在街机模式（双人/训练/观战都不用它） */
let arcade: ArcadeState | null = null;
/** CPU 血量倍率已经作用到哪个角色身上（-1 = 还没作用），避免同一人反复缩放 */
let cpuHpScaledFor = -1;

/** 上一次喊的时间（人声冷却，避免连段里连喊） */
let lastVoiceAt = 0;

// 第一次进游戏自动弹一次说明；之后从标题右上角「怎么玩」进
try {
  if (localStorage.getItem(HELP_SEEN_KEY) !== '1') helpPage = 0;
} catch {
  // 隐私模式读不到 localStorage：当成"没看过"，弹一次，不写盘
}

let hintSeen = false;
try {
  hintSeen = localStorage.getItem(MOVE_HINT_SEEN_KEY) === '1';
} catch {
  hintSeen = false;
}

startAnimationLoop(
  {
    step: () => {
      syncKeys();
      bgm.setVolume(settings.settings.bgmVolume);
      bgm.update(performance.now());

      const p1In = { held: (p1keys.sample.held | pad.sampleFrame().held) >>> 0 };

      // 调整手台位置时冻结世界：只等玩家点画面确认，别让 CPU 趁机打你
      if (padAdjusting) {
        if (p1In.held !== 0) {
          // 确认：草稿写进设置并落盘
          settings.settings.padCustom = { ...padDraft };
          settings.save();
          padAdjusting = false;
          controls.setAdjusting(false);
          controls.setCustom(settings.settings.padCustom);
        }
        prevPauseHeld = p1In.held;
        return;
      }

      // 连招演示：用脚本按键盖掉玩家输入（走的是对局同一条输入通路）
      if (demoFrames) {
        if (demoIndex < demoFrames.length) {
          p1In.held = demoFrames[demoIndex]!;
          demoIndex++;
        } else {
          // 演示播完：报一次真实结果（连击数取对局里的实际值，不是预估）
          demoFrames = null;
          demoIndex = 0;
          demoResultLeft = 150;
          demoResultHits = match?.p2.combo.hits ?? 0;
          demoResultDamage = Math.max(0, demoDamageBase - (match?.p2.hp ?? 0));
        }
      }
      const p2In = p2keys.sample;

      // 说明浮层打开时冻结一切：任意键/点屏 = 翻页，最后一页关掉
      if (helpPage >= 0) {
        const pressed = p1In.held & ~prevHelpHeld;
        prevHelpHeld = p1In.held;
        if (pressed !== 0 || helpAdvanceQueued) {
          helpAdvanceQueued = false;
          if (helpPage >= HELP_PAGE_COUNT - 1) {
            helpPage = -1;
            try {
              localStorage.setItem(HELP_SEEN_KEY, '1');
            } catch {
              /* 存不了就算了，下次再弹一次 */
            }
          } else {
            helpPage += 1;
          }
        }
        return;
      }
      prevHelpHeld = p1In.held;

      // 暂停：世界完全冻结，只处理菜单输入
      if (pause.open) {
        const pressed = p1In.held & ~prevPauseHeld;
        prevPauseHeld = p1In.held;
        if ((pressed & Btn.Up) !== 0) pause.move(-1);
        if ((pressed & Btn.Down) !== 0) pause.move(1);
        // B 直接关菜单（等同"继续"），不用先移到第一项
        if ((pressed & Btn.B) !== 0) {
          pause.hide();
          bgm.setDucked(false);
          audio.play('cancel');
          return;
        }
        if ((pressed & (Btn.A | Btn.Start)) !== 0) {
          const action = pause.confirm();
          bgm.setDucked(false);
          if (action === 'back') {
            // 返回上一级：菜单界面才有这一项
            if (flow.screen === 'select') flow.screen = 'mode';
            else if (flow.screen === 'options') flow.screen = flow.optionsFrom;
            else if (flow.screen === 'keybind') flow.screen = 'options';
            audio.play('cancel');
          }
          if (action === 'options') {
            flow.optionsFrom = flow.screen === 'fight' ? 'fight' : 'mode';
            flow.screen = 'options';
            flow.optionCursor = 0;
          }
          if (action === 'pad') enterPadAdjust();
          if (action === 'title') {
            flow.reset();
            match = null;
            training = null;
            arcade = null;
          }
        }
        return;
      }

      // 任意界面按 B 叫出系统菜单（对局中 B 仍是轻脚，所以那里不放这条）
      if (flow.screen !== 'fight') {
        const pressedMenu = p1In.held & ~prevPauseHeld;
        if ((pressedMenu & Btn.B) !== 0) {
          prevPauseHeld = p1In.held;
          openMenu();
          return;
        }
      }
      prevPauseHeld = p1In.held;
      const matchOver = match !== null && match.phase === 'over';
      // 街机打赢这一场：由我们自己推进（不走 flow 的结算屏），否则每场都要点一次"回标题"
      const arcadeWin = matchOver && flow.mode === 'arcade' && arcade !== null && match?.matchWinner === 1;

      // 首次进对局：弹一次"必杀怎么放"提示（读完自动淡出）
      if (flow.screen === 'fight' && match?.phase === 'fight') {
        if (moveHintFrames === 0 && !hintSeen) {
          moveHintFrames = 300;
          hintSeen = true;
          try {
            localStorage.setItem(MOVE_HINT_SEEN_KEY, '1');
          } catch {
            /* 隐私模式：本次会话内只弹一次就够了 */
          }
        } else if (moveHintFrames > 0) {
          moveHintFrames--;
        }
      }
      // 按键设置屏由 raw keydown 独占输入：再喂给 flow 会"一套按键两处消费"
      // （实测按 B 从按键屏返回时，flow 在同一帧又把 B 当成"退出选项屏"）。
      // 关掉 mute 的时机是"所有键都松开"，否则那个按键的按住状态还会被当成新的一次边沿。
      if (muteFlow && p1In.held === 0 && p2In.held === 0) muteFlow = false;
      const flowInputs = muteFlow || flow.screen === 'keybind' ? [{ held: 0 }, { held: 0 }] : [p1In, p2In];
      const action = flow.step(flowInputs as [{ held: number }, { held: number }], {
        matchOver: matchOver && !arcadeWin,
        matchWinner: match?.matchWinner ?? 0,
      });
      // 换场/重开时清掉训练场的最高连击（不是同一批尝试，不该混在一起比）
      if (flow.screen === 'fight' && match?.phase === 'intro' && trainingBestCombo > 0) {
        trainingBestCombo = 0;
      }
      if (arcadeWin && arcade) {
        arcade = afterStage(arcade, true);
        if (isCleared(arcade)) {
          flow.showArcadeResult(); // 打穿 8 场：停在结算屏
        } else {
          flow.nextArcadeStage(); // 进下一场的 VS 演出，下帧会重新 startMatch
        }
      }
      setWeatherEnabled(settings.settings.weatherFx);
      preloadNextOpponent();
      cueInterfaceSounds();
      bgm.setTrack(trackFor(flow.screen));
      if (flow.screen !== 'fight') bgm.setMood('calm');
      if (flow.screen === 'keybind' && flow.timer === 1) keybind.show(1);

      if (action === 'start-match') {
        audio.resume();
        audio.play('start');
        startMatch();
        return;
      }
      if (action === 'to-title') {
        arcade = null;
        cpuHpScaledFor = -1;
        if (recorder) lastReplay = recorder.finish();
        recorder = null;
        replayPlayer = null;
        match = null;
        training = null;
        audio.play('confirm');
        return;
      }

      // 菜单里的操作音（用上一帧的屏做对比太绕，这里只在选人屏响）
      if (flow.screen === 'select') {
        if (flow.locked[0] && flow.timer === 1) audio.play('confirm');
      }

      if (flow.screen === 'fight' && match && training) {
        // 回放模式：输入只来自录像，播完就冻住画面（不能继续走，否则"看结局"会把状态改掉）
        if (replayPlayer) {
          if (replayPlayer.done) return;
          training.step(replayPlayer.next());
          return;
        }
        training.step([p1In, p2In]);
        // 录"真正喂给模拟层的输入"——街机模式里 P2 是 CPU，它的输入也得录进去
        if (recorder) recorder.record(training.lastInputs);

        // 训练挑战：只统计 P1 打出来的东西
        for (const h of match.lastHits) {
          if (h.kind === 'block') {
            if (h.defender === match.p1) challenges.observeBlock();
            continue;
          }
          if (h.attacker !== match.p1) continue;
          challenges.observeHit(h.comboHits, h.attacker.move?.kind === 'super');
        }
        for (const ev of match.world.events) {
          const sfx = sfxForWorldEvent(ev.type, ev.data);
          if (sfx) audio.play(sfx);
          // 人声单独一层：连段里每一下都喊会很吵，给个 260ms 冷却
          const voice = voiceForWorldEvent(ev.type, ev.data);
          const nowMs = performance.now();
          if (voice && nowMs - lastVoiceAt > 260) {
            audio.play(voice);
            lastVoiceAt = nowMs;
          }
        }
        applyCpuHpScale();
        stepCpuTag();
        cueMatchSounds();
        // 残血变奏：任意一方血量低于 30% 就给 BGM 加底鼓
        const lowHp = match.p1.hp / match.p1.maxHp < 0.3 || match.p2.hp / match.p2.maxHp < 0.3;
        bgm.setMood(lowHp ? 'urgent' : 'calm');
      }
    },
    render: () => {
      // 先按画布坐标铺一层背景（两侧留白用这个颜色，不是纯黑），再切到内容坐标系
      raw.setTransform(1, 0, 0, 1, 0, 0);
      raw.fillStyle = '#0a0e16';
      raw.fillRect(0, 0, raw.canvas.width, raw.canvas.height);
      raw.setTransform(device, 0, 0, device, deviceOffsetX, deviceOffsetY);
      raw.fillStyle = '#05070a';
      raw.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

      const blink = (uiTick >> 5) % 2 === 0;
      switch (flow.screen) {
        case 'title':
          drawTitle(ctx, blink);
          break;
        case 'select':
          drawSelect(ctx, flow, blink);
          break;
        case 'vs':
          drawVs(ctx, flow);
          break;
        case 'fight':
          if (match && training) {
            drawFrame(ctx, match, { showBoxes: training.settings.showBoxes, stage: currentStage() });
            if (flow.mode === 'training' || flow.mode === 'watch') drawChallengePanel(ctx, challenges);
            if (training.settings.showFrameData) drawTrainingOverlay(ctx, training.frameDataLines());
          }
          break;
        case 'result': {
          if (match) {
            drawFrame(ctx, match, { stage: currentStage() });
            const side = match.matchWinner === 2 ? 2 : 1;
            const winner = side === 2 ? match.p2 : match.p1;
            const name = flow.picks?.[side - 1]?.name ?? (side === 2 ? 'CPU' : 'P1');
            // 台词按胜场数轮换：同一场里是固定的，回放/录屏不会变
            drawResult(
              ctx,
              name,
              winQuoteFor(winner.char.id, match.wins[side - 1] ?? 0),
              blink,
              arcade ? arcadeResult(arcade, match?.p1.char) : null,
            );
          }
          break;
        }
        case 'mode':
          drawMode(ctx, flow, blink);
          break;
        case 'options':
          drawOptions(ctx, flow);
          break;
        case 'keybind':
          drawKeyBind(ctx, keybind, settings.settings, blink);
          break;
        case 'continue':
          if (match) drawFrame(ctx, match);
          drawContinue(ctx, flow, blink);
          break;
      }

      if (padAdjusting) drawPadAdjustHint(ctx, blink);
      if (pause.open) drawPause(ctx, pause, blink);
      // 招式清单：对局看 P1 当前角色，选人看光标角色
      if (moveListOpen && !pause.open) {
        const shown =
          flow.screen === 'fight' && match
            ? match.p1.char
            : flow.screen === 'select'
              ? flow.roster[flow.cursor[0] ?? 0]
              : null;
        if (shown) drawMoveList(ctx, shown.name, moveListFor(shown));
      }
      if (flow.screen === 'fight' || flow.screen === 'select') drawMovesButton(ctx, moveListOpen);
      if (flow.screen !== 'title') drawMenuButton(ctx);
      if (demoFrames && flow.screen === 'fight') {
        const steps = (comboSets(match?.p1.char)[demoSegment] ?? comboSets()[0]!).steps;
        const at = stepAt(demoStarts, Math.max(0, demoIndex - 1));
        if (at >= 0) {
          // 累计伤害：把到当前这一步为止的理论伤害加起来，演示时能看出这套连段值不值
          const dmg = steps.slice(0, at + 1).reduce((sum, s) => sum + (s.damage ?? 0), 0);
          drawDemoLabel(ctx, steps[at]!.label, at, steps.length, dmg);
        }
      }
      // 演示结果浮层：播完停 2.5 秒，报"实际连上几下 / 实际打了多少"
      if (demoResultLeft > 0) {
        demoResultLeft--;
        if (flow.screen === 'fight') drawDemoResult(ctx, demoResultHits, demoResultDamage);
      }
      // 贴图还没到位：明确告诉玩家在加载（线上冷缓存要 20~30 秒，不是"画风就这样"）
      if (flow.screen === 'fight' && match && !moveListOpen) {
        const stale = [match.p1, match.p2].filter((f) => !sheetReady(f.char.id));
        if (stale.length > 0) drawLoadingHint(ctx, blink);
      }
      // 街机：左上角报进度（第几场 / 对手队名）
      if (flow.screen === 'fight' && flow.mode === 'arcade' && arcade && match) {
        drawStageBadge(ctx, arcade.stage + 1, ARCADE_ROUTE.length, arcadeTeamName(arcade));
      }
      // 训练场：连击面板（当前 / 本次最高）。连断后不清最高，方便对比两次尝试
      if (flow.screen === 'fight' && flow.mode === 'training' && match) {
        const current = match.p2.combo.hits;
        if (current > trainingBestCombo) trainingBestCombo = current;
        drawComboMeter(ctx, current, trainingBestCombo);
      }
      // 训练场：顶部常驻状态条（不掉血 / 气无限 / 假人行为）
      if (flow.screen === 'fight' && flow.mode === 'training' && training && !moveListOpen) {
        drawTrainingBadge(ctx, {
          infiniteHp: training.settings.infiniteHp,
          infiniteMeter: training.settings.infiniteMeter,
          dummy: training.settings.dummy,
        });
      }
      if (moveHintFrames > 0 && flow.screen === 'fight' && !moveListOpen) {
        drawMoveHint(ctx, Math.min(1, moveHintFrames / 40));
      }

      // 说明浮层画在最上面（暂停之上），读说明时不该被别的 UI 盖住
      if (helpPage >= 0) drawHelp(ctx, helpPage, blink);

      uiTick++;
      if (uiTick % 20 === 0) {
        controls.refresh();
        // 调试条只在训练模式出现：街机/双人里摆一排"无限血/假人"按钮是错的
        controls.setBarVisible(
          flow.mode === 'training' &&
            (flow.screen === 'fight' || flow.screen === 'result' || flow.screen === 'continue'),
        );
      }
    },
  },
  stepper,
);

/** 收尾当前录制并返回回放（调试/自测用；正常流程里在回标题时自动收尾） */
function stopRecording(): Replay | null {
  if (!recorder) return null;
  const replay = recorder.finish();
  recorder = null;
  lastReplay = replay;
  return replay;
}

/** 播放一段回放（同一份种子 + 同一串输入必然重演出同一场） */
function playReplay(replay: Replay): boolean {
  try {
    match = matchFromReplay(replay, (id) => ROSTER.find((c) => c.id === id));
  } catch {
    return false;
  }
  replayPlayer = new ReplayPlayer(replay);
  recorder = null;
  training = new TrainingSession(match, { dummy: 'human', showBoxes: false, showFrameData: false });
  flow.screen = 'fight';
  flow.mode = 'arcade';
  return true;
}

// 调试/自测用的把手（不参与玩法）
(window as unknown as { __kof: unknown }).__kof = {
  flow,
  audio,
  bgm,
  pause,
  keybind,
  challenges,
  pad,
  startMatch,
  stopRecording,
  playReplay,
  get lastReplay() {
    return lastReplay;
  },
  get replayDone() {
    return replayPlayer === null || replayPlayer.done;
  },
  get recordedFrames() {
    return recorder?.frames ?? 0;
  },
  get match() {
    return match;
  },
  get training() {
    return training;
  },
};
