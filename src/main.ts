/**
 * 入口：建立画布与视口。逻辑循环 / 世界 / 渲染管线在后续批次接进来。
 */
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, applyViewport, computeViewport } from './render/scale';

const canvas = document.getElementById('screen') as HTMLCanvasElement | null;
if (!canvas) throw new Error('缺少 #screen canvas');

const ctx = canvas.getContext('2d', { alpha: false });
if (!ctx) throw new Error('无法创建 2D context');

let device = 1;

function resize(): void {
  device = applyViewport(canvas!, computeViewport(window.innerWidth, window.innerHeight, window.devicePixelRatio));
}

function draw(): void {
  ctx!.setTransform(device, 0, 0, device, 0, 0);
  ctx!.fillStyle = '#0b0d12';
  ctx!.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  // 占位画面：地面线 + 标题，用来确认缩放与居中正确
  ctx!.fillStyle = '#151a24';
  ctx!.fillRect(0, 200, LOGICAL_WIDTH, LOGICAL_HEIGHT - 200);
  ctx!.strokeStyle = '#2b3346';
  ctx!.lineWidth = 1;
  ctx!.beginPath();
  ctx!.moveTo(0, 200.5);
  ctx!.lineTo(LOGICAL_WIDTH, 200.5);
  ctx!.stroke();

  ctx!.fillStyle = '#d8dee9';
  ctx!.font = '12px monospace';
  ctx!.textAlign = 'center';
  ctx!.fillText("KOF'97 WEB", LOGICAL_WIDTH / 2, 96);
  ctx!.fillStyle = '#6b7688';
  ctx!.font = '8px monospace';
  ctx!.fillText('ENGINE BOOT · 320x224', LOGICAL_WIDTH / 2, 112);
}

window.addEventListener('resize', () => {
  resize();
  draw();
});

resize();
draw();
