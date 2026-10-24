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
});

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
      match.softReset();
      break;
    default:
      break;
  }
});

const stepper = new FixedStepper();

startAnimationLoop(
  {
    step: () => training.step([p1keys.sample, p2keys.sample]),
    render: () => {
      raw.setTransform(device, 0, 0, device, 0, 0);
      raw.fillStyle = '#05070a';
      raw.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
      drawFrame(ctx, match, { showBoxes: training.settings.showBoxes });
      if (training.settings.showFrameData) drawTrainingOverlay(ctx, training.frameDataLines());
    },
  },
  stepper,
);
