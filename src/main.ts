/**
 * 入口：把画布、输入、对局、训练模式、固定步长循环接起来。
 *
 * 这里只做"接线"，不含任何玩法逻辑——玩法全在 sim/ 与 data/ 里，
 * 所以这个文件改动频率低，也不会成为不可测的黑箱。
 */
import { FixedStepper, startAnimationLoop } from './core/loop';
import { KYO } from './data/chars/kyo';
import { Match } from './game/match';
import { DEFAULT_KEYMAP_P1, DEFAULT_KEYMAP_P2, KeyboardSource } from './input/keyboard';
import type { Ctx2D } from './render/ctx';
import { drawFrame } from './render/renderer';
import { applyViewport, computeViewport } from './render/scale';
import { VIEW_HEIGHT, VIEW_WIDTH } from './sim/constants';
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

const match = new Match(KYO, KYO, { roundsToWin: 2 });
const training = new TrainingSession(match);

const p1keys = new KeyboardSource(DEFAULT_KEYMAP_P1);
const p2keys = new KeyboardSource(DEFAULT_KEYMAP_P2);
p1keys.attach(window);
p2keys.attach(window);
window.addEventListener('blur', () => {
  p1keys.clear();
  p2keys.clear();
  pad.releaseAll();
});

const pad = new VirtualPad();

/** 打完一场（或中途想重来）时回到开局：整场结束就重开整场，否则只重开这一回合 */
function resetOrRestart(): void {
  if (match.phase === 'over') match.restart();
  else match.softReset();
}

const dummyLabel = (): string => `假人:${training.settings.dummy}`;
const controls = mountTouchControls(pad, [
  { id: 'boxes', label: () => `判定框:${training.settings.showBoxes ? 'ON' : 'OFF'}`, run: () => void training.toggle('showBoxes') },
  { id: 'frames', label: () => `帧数:${training.settings.showFrameData ? 'ON' : 'OFF'}`, run: () => void training.toggle('showFrameData') },
  { id: 'meter', label: () => `无限气:${training.settings.infiniteMeter ? 'ON' : 'OFF'}`, run: () => void training.toggle('infiniteMeter') },
  { id: 'hp', label: () => `无限血:${training.settings.infiniteHp ? 'ON' : 'OFF'}`, run: () => void training.toggle('infiniteHp') },
  { id: 'dummy', label: dummyLabel, run: () => void training.cycleDummy() },
  { id: 'reset', label: () => (match.phase === 'over' ? '再来一场' : '重开'), run: resetOrRestart },
]);

window.addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'F1':
      e.preventDefault();
      training.toggle('showBoxes');
      break;
    case 'F2':
      e.preventDefault();
      training.toggle('showFrameData');
      break;
    case 'F3':
      e.preventDefault();
      training.toggle('infiniteMeter');
      break;
    case 'F4':
      e.preventDefault();
      training.toggle('infiniteHp');
      break;
    case 'F5':
      e.preventDefault();
      training.cycleDummy();
      break;
    case 'KeyR':
      resetOrRestart();
      break;
    default:
      return;
  }
  controls.refresh();
});

const stepper = new FixedStepper();
let uiTick = 0;

startAnimationLoop(
  {
    step: () => {
      // 键盘和屏上按键可以同时用：按住位直接按位或
      const p1Held = (p1keys.sample.held | pad.sampleFrame().held) >>> 0;
      training.step([{ held: p1Held }, p2keys.sample]);
    },
    render: () => {
      raw.setTransform(device, 0, 0, device, 0, 0);
      raw.fillStyle = '#05070a';
      raw.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
      drawFrame(ctx, match, { showBoxes: training.settings.showBoxes });
      if (training.settings.showFrameData) drawTrainingOverlay(ctx, training.frameDataLines());
      // 按钮上的开关状态定期同步（设置也可能被热键/调试改掉）
      if (++uiTick % 20 === 0) controls.refresh();
    },
  },
  stepper,
);

// 调试/自测用的把手（不参与玩法）：浏览器控制台里可以读当前帧状态
(window as unknown as { __kof: unknown }).__kof = { match, training, pad, resetOrRestart };
