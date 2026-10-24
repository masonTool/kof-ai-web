/**
 * 按游戏内锚点预览处理好的帧（校验身高/落地/水平锚点是否一致）。
 * 用法：node scripts/sprites/preview-frames.mjs [动画名...]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createImage, decodePng, encodePng } from './png.mjs';

const S = 3;
const CELL = 110 * S;
const atlas = decodePng(readFileSync('public/sheets/kyo.png'));
const json = JSON.parse(readFileSync('public/sheets/kyo.json', 'utf8'));

const all = Object.keys(json.anims);
const wanted = process.argv.slice(2);
const names = wanted.length > 0 ? wanted : all;
const cols = Math.max(...names.map((n) => json.anims[n].length));
const out = createImage(cols * CELL, names.length * CELL, [40, 44, 52, 255]);

names.forEach((name, row) => {
  json.anims[name].forEach((f, col) => {
    const ox = col * CELL;
    const oy = row * CELL;
    const baseY = oy + CELL * 0.85;
    const anchorX = ox + CELL / 2;
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const v = ((x >> 4) + (y >> 4)) % 2 === 0 ? 58 : 46;
        const o = ((oy + y) * out.width + ox + x) * 4;
        out.data[o] = out.data[o + 1] = out.data[o + 2] = v;
      }
    }
    for (let y = 0; y < f.h * S; y++) {
      for (let x = 0; x < f.w * S; x++) {
        const si = ((f.y + ((y / S) | 0)) * atlas.width + (f.x + ((x / S) | 0))) * 4;
        if (atlas.data[si + 3] === 0) continue;
        const dx = Math.round(anchorX + f.ox * S) + x;
        const dy = Math.round(baseY + f.oy * S) + y;
        if (dx < 0 || dy < 0 || dx >= out.width || dy >= out.height) continue;
        const di = (dy * out.width + dx) * 4;
        out.data[di] = atlas.data[si];
        out.data[di + 1] = atlas.data[si + 1];
        out.data[di + 2] = atlas.data[si + 2];
        out.data[di + 3] = 255;
      }
    }
    for (let x = 0; x < CELL; x++) {
      const o = (baseY * out.width + ox + x) * 4;
      out.data[o] = 70;
      out.data[o + 1] = 190;
      out.data[o + 2] = 90;
    }
  });
});
writeFileSync('/tmp/frames.png', encodePng(out));
console.log('/tmp/frames.png', `${out.width}x${out.height}`, names.join(','));
