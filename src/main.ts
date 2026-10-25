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
import { ensureTitleArt } from './render/title-art';
import { ensureCharSheets, installSheetProvider } from './render/sprite-loader';
import { applyViewport, computeViewport, shouldRotate, type SafeInsets } from './render/scale';
import {
  drawContinue,
  drawChallengePanel,
  drawKeyBind,
  drawMode,
  drawPause,
  drawOptions,
  drawResult,
  drawSelect,
  drawTitle,
  drawVs,
  hitTestCell,
  hitTestModeItem,
  hitTestOptionRow,
  hitTestPauseItem,
} from './render/screens';
import { VIEW_HEIGHT, VIEW_WIDTH } from './sim/constants';
import { Btn } from './core/input';
import { AppFlow } from './ui/flow';
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
  device = applyViewport(canvas!, computeViewport(w, h, window.devicePixelRatio, insets, { fill: IS_TOUCH }));
  // 手台按屏幕短边比例重排（不是固定 px），旋转屏幕/切全屏都会走这里
  padHandle?.layout(w, h, insets);
  // 竖屏时盖一层"请横屏"，否则画面只有拇指大小
  document.getElementById('rotate-hint')?.classList.toggle('show', shouldRotate(w, h));
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
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
ensureStageArt(['skyline', 'valley', 'arena']);
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
  // 把这 6 个人的图集装进来（没有素材的角色静默回落程序化）
  void ensureCharSheets([...teamFor(a), ...teamFor(b)].map((c) => c.id));
  const cfg = settings.settings;
  match = new Match(teamFor(a), teamFor(b), {
    roundsToWin: cfg.roundsToWin,
    roundSeconds: cfg.roundSeconds,
  });
  recorder = new ReplayRecorder({
    seed: match.world.seed,
    config: match.config,
    teams: [teamFor(a).map((c) => c.id), teamFor(b).map((c) => c.id)],
  });
  training = new TrainingSession(match, {
    showBoxes: cfg.showBoxes,
    showFrameData: cfg.showFrameData,
    cpuLevel: cfg.cpuLevel,
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
resize();

window.addEventListener('keydown', (e) => {
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
    case 'KeyR':
      if (match) {
        if (match.phase === 'over') match.restart();
        else match.softReset();
      }
      break;
    case 'Escape':
      if (flow.screen === 'fight') {
        pause.toggle();
        bgm.setDucked(pause.open);
      } else if (flow.screen === 'options') {
        flow.screen = 'mode';
      } else if (pause.open) {
        pause.hide();
        bgm.setDucked(false);
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
  try {
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    void orientation?.lock?.('landscape').catch(() => {});
  } catch {
    // 不支持就算了，不影响玩
  }
}

/** 画布点击：标题/结果当"按 A"，选人屏直接点格子，菜单屏点行选中 */
canvas.addEventListener('pointerdown', (e) => {
  audio.resume();
  enterFullscreenOnce();
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * VIEW_WIDTH;
  const y = ((e.clientY - rect.top) / rect.height) * VIEW_HEIGHT;

  // 暂停菜单盖在最上面，优先处理
  if (pause.open) {
    const hit = hitTestPauseItem(x, y, 4);
    if (hit >= 0) {
      pause.cursor = hit;
      pad.press('A');
      return;
    }
  }

  // 菜单屏：点哪行就选中哪行，然后当成按了一次 A（点一次就生效，不用"先选再确认"）
  if (flow.screen === 'mode') {
    const hit = hitTestModeItem(x, y);
    if (hit >= 0) {
      flow.modeCursor = hit;
      pad.press('A');
      return;
    }
  }
  if (flow.screen === 'options') {
    const rows = flow.options.length + 1; // 末行是"按键设置"
    const hit = hitTestOptionRow(x, y, rows);
    if (hit >= 0) {
      flow.optionCursor = hit;
      pad.press('A');
      return;
    }
  }
  if (flow.screen === 'select') {
    const cell = hitTestCell(x, y, flow.rosterSize, flow.config.columns);
    if (cell >= 0) {
      flow.cursor[0] = cell;
      flow.locked[0] = true;
      audio.play('confirm');
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

/** 上一次喊的时间（人声冷却，避免连段里连喊） */
let lastVoiceAt = 0;

startAnimationLoop(
  {
    step: () => {
      syncKeys();
      bgm.setVolume(settings.settings.bgmVolume);
      bgm.update(performance.now());

      const p1In = { held: (p1keys.sample.held | pad.sampleFrame().held) >>> 0 };
      const p2In = p2keys.sample;

      // 暂停：世界完全冻结，只处理菜单输入
      if (pause.open) {
        const pressed = p1In.held & ~prevPauseHeld;
        prevPauseHeld = p1In.held;
        if ((pressed & Btn.Up) !== 0) pause.move(-1);
        if ((pressed & Btn.Down) !== 0) pause.move(1);
        if ((pressed & (Btn.A | Btn.Start)) !== 0) {
          const action = pause.confirm();
          bgm.setDucked(false);
          if (action === 'restart') match?.restart();
          if (action === 'options') {
            flow.screen = 'options';
            flow.optionsFrom = 'fight';
            flow.optionCursor = 0;
          }
          if (action === 'title') {
            flow.reset();
            match = null;
            training = null;
          }
        }
        return;
      }
      prevPauseHeld = p1In.held;
      const matchOver = match !== null && match.phase === 'over';
      // 按键设置屏由 raw keydown 独占输入：再喂给 flow 会"一套按键两处消费"
      // （实测按 B 从按键屏返回时，flow 在同一帧又把 B 当成"退出选项屏"）。
      // 关掉 mute 的时机是"所有键都松开"，否则那个按键的按住状态还会被当成新的一次边沿。
      if (muteFlow && p1In.held === 0 && p2In.held === 0) muteFlow = false;
      const flowInputs = muteFlow || flow.screen === 'keybind' ? [{ held: 0 }, { held: 0 }] : [p1In, p2In];
      const action = flow.step(flowInputs as [{ held: number }, { held: number }], {
        matchOver,
        matchWinner: match?.matchWinner ?? 0,
      });
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
        cueMatchSounds();
        // 残血变奏：任意一方血量低于 30% 就给 BGM 加底鼓
        const lowHp = match.p1.hp / match.p1.maxHp < 0.3 || match.p2.hp / match.p2.maxHp < 0.3;
        bgm.setMood(lowHp ? 'urgent' : 'calm');
      }
    },
    render: () => {
      raw.setTransform(device, 0, 0, device, 0, 0);
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
            drawFrame(ctx, match, { showBoxes: training.settings.showBoxes });
            if (flow.mode === 'training' || flow.mode === 'watch') drawChallengePanel(ctx, challenges);
            if (training.settings.showFrameData) drawTrainingOverlay(ctx, training.frameDataLines());
          }
          break;
        case 'result': {
          if (match) {
            drawFrame(ctx, match);
            const side = match.matchWinner === 2 ? 2 : 1;
            const winner = side === 2 ? match.p2 : match.p1;
            const name = flow.picks?.[side - 1]?.name ?? (side === 2 ? 'CPU' : 'P1');
            // 台词按胜场数轮换：同一场里是固定的，回放/录屏不会变
            drawResult(ctx, name, winQuoteFor(winner.char.id, match.wins[side - 1] ?? 0), blink);
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

      if (pause.open) drawPause(ctx, pause.cursor, blink);

      uiTick++;
      if (uiTick % 20 === 0) {
        controls.refresh();
        controls.setBarVisible(flow.screen === 'fight' || flow.screen === 'result' || flow.screen === 'continue');
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
