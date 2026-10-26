/**
 * 渲染层用到的最小子集接口。
 *
 * 为什么要自定义而不用 `CanvasRenderingContext2D`：
 * 测试在 node 里跑，没有 canvas；只要接口够用，就能拿一个"记账用的假 ctx"断言
 * "画了几笔、有没有镜像、有没有恢复状态"，而不是靠肉眼。
 */
export interface Ctx2D {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  /** 旋转（弧度）：被打飞时绕腰翻出去 */
  rotate(angle: number): void;

  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  arc(x: number, y: number, r: number, start: number, end: number, ccw?: boolean): void;
  ellipse(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number, ccw?: boolean): void;
  fill(): void;
  stroke(): void;
  strokeRect(x: number, y: number, w: number, h: number): void;

  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  clearRect(x: number, y: number, w: number, h: number): void;

  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'miter' | 'round' | 'bevel';
  globalAlpha: number;
  font: string;
  textAlign: 'left' | 'center' | 'right';
  textBaseline: 'top' | 'middle' | 'bottom' | 'alphabetic';
  fillText(text: string, x: number, y: number): void;
}
