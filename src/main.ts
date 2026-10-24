/**
 * 入口：画布 / 输入 / 流程 / 对局 / 训练模式 / 循环，全在这里接线。
 *
 * 屏幕按 `AppFlow` 走：标题 → 选人 → VS → 对战 → 结果 → 标题。
 * 玩法逻辑一律在 `sim/` + `data/`，这里只做"把谁喂给谁"。
 */
import { CPU_LEVEL_LABEL } from './ai/cpu';
import { WebAudioBgm } from './audio/bgm';
import { sfxForWorldEvent, WebAudioSink } from './audio/sfx';
import { FixedStepper, startAnimationLoop } from './core/loop';
import { ROSTER } from './data/chars';
import { winQuoteFor } from './data/chars/quotes';
import type { CharDef } from './data/schema';
import { Match } from './game/match';
import { ReplayPlayer, ReplayRecorder, matchFromReplay, type Replay } from './game/replay';
import { KeyboardSource, keyPresetAt } from './input/keyboard';
import type { Ctx2D } from './render/ctx';
import { drawFrame } from './render/renderer';
import { applyViewport, computeViewport, shouldRotate, type SafeInsets } from './render/scale';
import {
  drawContinue,
  drawKeyBind,
  drawMode,
  drawPause,
  drawOptions,
  drawResult,
  drawSelect,
  drawTitle,
  drawVs,
  hitTestCell,
} from './render/screens';
import { VIEW_HEIGHT, VIEW_WIDTH } from './sim/constants';
import { Btn } from './core/input';
import { AppFlow } from './ui/flow';
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

let device = 1;

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
  device = applyViewport(canvas!, computeViewport(w, h, window.devicePixelRatio, safeInsets()));
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

const audio = new WebAudioSink();
const bgm = new WebAudioBgm();
const pause = new PauseMenu();
const keybind = new KeyBindMenu();
const settings = new SettingsStore(browserStorage());
audio.setVolume(settings.settings.volume);
bgm.setVolume(settings.settings.volume);
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
    dummy: flow.mode === 'training' ? 'stand' : flow.mode === 'versus' ? 'human' : 'cpu',
  });
  audio.setVolume(cfg.volume);
}

/** 每个屏配哪首曲子（同屏不重复设置，setTrack 内部会去重） */
function trackFor(screen: string): string | null {
  if (screen === 'fight' || screen === 'continue') return 'fight';
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
]);

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

/** 画布点击：标题/结果当"按 A"，选人屏直接点格子 */
canvas.addEventListener('pointerdown', (e) => {
  audio.resume();
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * VIEW_WIDTH;
  const y = ((e.clientY - rect.top) / rect.height) * VIEW_HEIGHT;

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

startAnimationLoop(
  {
    step: () => {
      syncKeys();
      bgm.setVolume(settings.settings.volume);
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
      bgm.setTrack(trackFor(flow.screen));
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
        for (const ev of match.world.events) {
          const sfx = sfxForWorldEvent(ev.type, ev.data);
          if (sfx) audio.play(sfx);
        }
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
