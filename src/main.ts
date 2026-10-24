/**
 * 入口：画布 / 输入 / 流程 / 对局 / 训练模式 / 循环，全在这里接线。
 *
 * 屏幕按 `AppFlow` 走：标题 → 选人 → VS → 对战 → 结果 → 标题。
 * 玩法逻辑一律在 `sim/` + `data/`，这里只做"把谁喂给谁"。
 */
import { CPU_LEVEL_LABEL } from './ai/cpu';
import { sfxForWorldEvent, WebAudioSink } from './audio/sfx';
import { FixedStepper, startAnimationLoop } from './core/loop';
import { ROSTER } from './data/chars';
import type { CharDef } from './data/schema';
import { Match } from './game/match';
import { DEFAULT_KEYMAP_P1, DEFAULT_KEYMAP_P2, KeyboardSource } from './input/keyboard';
import type { Ctx2D } from './render/ctx';
import { drawFrame } from './render/renderer';
import { applyViewport, computeViewport } from './render/scale';
import {
  drawContinue,
  drawMode,
  drawOptions,
  drawResult,
  drawSelect,
  drawTitle,
  drawVs,
  hitTestCell,
} from './render/screens';
import { VIEW_HEIGHT, VIEW_WIDTH } from './sim/constants';
import { AppFlow } from './ui/flow';
import { SettingsStore, type StorageLike } from './ui/settings';
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
function resize(): void {
  device = applyViewport(canvas!, computeViewport(window.innerWidth, window.innerHeight, window.devicePixelRatio));
}
window.addEventListener('resize', resize);
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
const settings = new SettingsStore(browserStorage());
audio.setVolume(settings.settings.volume);
const flow = new AppFlow(ROSTER, undefined, settings);
const pad = new VirtualPad();

let match: Match | null = null;
let training: TrainingSession | null = null;

const p1keys = new KeyboardSource(DEFAULT_KEYMAP_P1);
const p2keys = new KeyboardSource(DEFAULT_KEYMAP_P2);
p1keys.attach(window);
p2keys.attach(window);
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
    case 'KeyR':
      if (match) {
        if (match.phase === 'over') match.restart();
        else match.softReset();
      }
      break;
    case 'Escape':
      flow.reset();
      match = null;
      training = null;
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
      const p1In = { held: (p1keys.sample.held | pad.sampleFrame().held) >>> 0 };
      const p2In = p2keys.sample;
      const matchOver = match !== null && match.phase === 'over';
      const action = flow.step([p1In, p2In], { matchOver, matchWinner: match?.matchWinner ?? 0 });

      if (action === 'start-match') {
        audio.resume();
        audio.play('start');
        startMatch();
        return;
      }
      if (action === 'to-title') {
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
        training.step([p1In, p2In]);
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
            const name = match.matchWinner === 2 ? (flow.picks?.[1]?.name ?? 'CPU') : (flow.picks?.[0]?.name ?? 'P1');
            drawResult(ctx, name, blink);
          }
          break;
        }
        case 'mode':
          drawMode(ctx, flow, blink);
          break;
        case 'options':
          drawOptions(ctx, flow);
          break;
        case 'continue':
          if (match) drawFrame(ctx, match);
          drawContinue(ctx, flow, blink);
          break;
      }

      uiTick++;
      if (uiTick % 20 === 0) {
        controls.refresh();
        controls.setBarVisible(flow.screen === 'fight' || flow.screen === 'result' || flow.screen === 'continue');
      }
    },
  },
  stepper,
);

// 调试/自测用的把手（不参与玩法）
(window as unknown as { __kof: unknown }).__kof = {
  flow,
  audio,
  pad,
  startMatch,
  get match() {
    return match;
  },
  get training() {
    return training;
  },
};
