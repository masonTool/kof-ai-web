/**
 * 出图预览：把 kyo-raw 下每个姿势目录的候选图抠图后拼成大图，方便一眼挑最优。
 * 用法：node scripts/sprites/preview.mjs [姿势...]
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createImage, decodePng, encodePng, blit } from './png.mjs';
import { cutout, scaleToHeight } from './cutout.mjs';

const RAW = 'art-source/kyo-raw';
const CELL_W = 240;
const CELL_H = 320;

const wanted = process.argv.slice(2);
const sets = readdirSync(RAW, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((n) => wanted.length === 0 || wanted.includes(n))
  .sort();

const cols = 4;
const rows = Math.ceil((sets.length * cols) / cols);
const sheet = createImage(CELL_W * cols, CELL_H * rows, [232, 234, 238, 255]);

sets.forEach((set, row) => {
  const files = readdirSync(join(RAW, set))
    .filter((f) => f.endsWith('.png'))
    .sort();
  files.forEach((f, col) => {
    const px = col * CELL_W;
    const py = row * CELL_H;
    // 交替底色，方便看透明边缘
    for (let y = 0; y < CELL_H; y++) {
      for (let x = 0; x < CELL_W; x++) {
        const v = ((x >> 3) + (y >> 3)) % 2 === 0 ? 226 : 214;
        const o = ((py + y) * sheet.width + px + x) * 4;
        sheet.data[o] = sheet.data[o + 1] = sheet.data[o + 2] = v;
      }
    }
    const img = decodePng(readFileSync(join(RAW, set, f)));
    const cut = cutout(img).img;
    const s = scaleToHeight(cut, CELL_H - 40);
    blit(sheet, s, px + Math.round((CELL_W - s.width) / 2), py + CELL_H - 20 - s.height);
  });
  console.log(`${row}: ${set} (${files.length})`);
});

writeFileSync('/tmp/sheet.png', encodePng(sheet));
console.log('/tmp/sheet.png', sheet.width + 'x' + sheet.height);
