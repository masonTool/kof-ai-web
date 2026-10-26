import type { Ctx2D } from '../../src/render/ctx';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
}

/** 记账用的假 canvas context：只记调用，不画图 */
export class FakeCtx implements Ctx2D {
  calls: string[] = [];
  transforms: { translate: [number, number][]; scale: [number, number][]; rotate: number[] } = { translate: [], scale: [], rotate: [] };
  fills: string[] = [];
  lineWidths: number[] = [];
  rects: Rect[] = [];
  lines: Line[] = [];
  strokeRects: { x: number; y: number; w: number; h: number; stroke: string }[] = [];
  strokeColors: string[] = [];
  texts: { text: string; x: number; y: number; align: string; font: string; color: string }[] = [];
  fillStyle = '#000';
  strokeStyle = '#000';
  lineWidth = 1;
  lineCap: 'butt' | 'round' | 'square' = 'butt';
  lineJoin: 'miter' | 'round' | 'bevel' = 'miter';
  globalAlpha = 1;
  font = '';
  textAlign: 'left' | 'center' | 'right' = 'left';
  textBaseline: 'top' | 'middle' | 'bottom' | 'alphabetic' = 'alphabetic';
  depth = 0;
  maxDepth = 0;

  private pathStart: [number, number] = [0, 0];
  private lastPoint: [number, number] = [0, 0];

  save(): void {
    this.calls.push('save');
    this.depth++;
    this.maxDepth = Math.max(this.maxDepth, this.depth);
  }

  restore(): void {
    this.calls.push('restore');
    this.depth--;
  }

  translate(x: number, y: number): void {
    this.calls.push('translate');
    this.transforms.translate.push([x, y]);
  }

  scale(x: number, y: number): void {
    this.calls.push('scale');
    this.transforms.scale.push([x, y]);
  }

  rotate(angle: number): void {
    this.calls.push('rotate');
    this.transforms.rotate.push(angle);
  }

  beginPath(): void {
    this.calls.push('beginPath');
  }

  moveTo(x: number, y: number): void {
    this.calls.push('moveTo');
    this.pathStart = [x, y];
    this.lastPoint = [x, y];
  }

  lineTo(x: number, y: number): void {
    this.calls.push('lineTo');
    this.lastPoint = [x, y];
  }

  closePath(): void {
    this.calls.push('closePath');
  }

  arcs: { x: number; y: number; r: number }[] = [];
  ellipses: { x: number; y: number; rx: number; ry: number }[] = [];

  arc(x = 0, y = 0, r = 0): void {
    this.calls.push('arc');
    this.arcs.push({ x, y, r });
  }

  ellipse(x = 0, y = 0, rx = 0, ry = 0): void {
    this.calls.push('ellipse');
    this.ellipses.push({ x, y, rx, ry });
  }

  fill(): void {
    this.calls.push('fill');
    this.fills.push(this.fillStyle);
  }

  stroke(): void {
    this.calls.push('stroke');
    this.lineWidths.push(this.lineWidth);
    this.lines.push({ x1: this.pathStart[0], y1: this.pathStart[1], x2: this.lastPoint[0], y2: this.lastPoint[1], stroke: this.strokeStyle });
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    this.calls.push('strokeRect');
    this.strokeColors.push(this.strokeStyle);
    this.strokeRects.push({ x, y, w, h, stroke: this.strokeStyle });
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.calls.push('fillRect');
    this.fills.push(this.fillStyle);
    this.rects.push({ x, y, w, h, fill: this.fillStyle });
  }

  images: { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number }[] = [];

  drawImage(
    _image: CanvasImageSource,
    sx = 0,
    sy = 0,
    sw = 0,
    sh = 0,
    dx = 0,
    dy = 0,
    dw = 0,
    dh = 0,
  ): void {
    this.calls.push('drawImage');
    this.images.push({ sx, sy, sw, sh, dx, dy, dw, dh });
  }

  clearRect(): void {
    this.calls.push('clearRect');
  }

  fillText(text: string, x: number, y: number): void {
    this.calls.push('fillText');
    this.texts.push({ text, x, y, align: this.textAlign, font: this.font, color: this.fillStyle });
  }

  /** 某段文字最后画出来的那次（阴影会先画一次，所以取最后一个） */
  lastText(text: string): { text: string; x: number; y: number; align: string; font: string; color: string } | undefined {
    return [...this.texts].reverse().find((t) => t.text === text);
  }

  count(name: string): number {
    return this.calls.filter((c) => c === name).length;
  }
}
