/**
 * 角色色板：程序化绘制的"外观差异"全在这里。
 * 一名角色 = 五个颜色（皮肤/头发/上衣/下装/描边）+ 一个点缀色，
 * 想调角色观感只改这张表，不用碰姿势与招式数据。
 */
import type { Palette } from '../schema';

export const PALETTES: Record<string, Palette> = {
  /** 草薙京：黑色学生服 + 白 T 恤 */
  kyo: {
    skin: '#f2c9a0',
    hair: '#241c17',
    primary: '#1b1b22',
    secondary: '#33343d',
    trim: '#f2eee2',
    accent: '#ff4d3d',
  },
  /** 八神庵：红上衣 + 黑裤（后续角色波次用） */
  iori: {
    skin: '#f0c49c',
    hair: '#c8352b',
    primary: '#a8202a',
    secondary: '#1c1a20',
    trim: '#e8dcc8',
    accent: '#ffd166',
  },
  /** 二阶堂红丸 */
  benimaru: {
    skin: '#f4cfa8',
    hair: '#2a2a33',
    primary: '#3b4d8f',
    secondary: '#22252e',
    trim: '#f5f2e8',
    accent: '#8fd7ff',
  },
  /** 大门五郎 */
  daimon: {
    skin: '#e8b98d',
    hair: '#171514',
    primary: '#2c3b2f',
    secondary: '#20242a',
    trim: '#d9d3c2',
    accent: '#c8e06a',
  },
  /** 安迪·博加德：白道服 + 金发 */
  andy: {
    skin: '#f0c39a',
    hair: '#e8cf6a',
    primary: '#e9e4d4',
    secondary: '#2b2b33',
    trim: '#3b6ea8',
    accent: '#7ee0ff',
  },
  /** 东丈：红头巾 + 黑裤 */
  joe: {
    skin: '#e8b98d',
    hair: '#2a2118',
    primary: '#c8342c',
    secondary: '#23262d',
    trim: '#f3ead6',
    accent: '#ffb347',
  },
  /** 坂崎亮：橙色道服 */
  ryo: {
    skin: '#eab98d',
    hair: '#2b2018',
    primary: '#e07a2c',
    secondary: '#2a2a33',
    trim: '#f5efe0',
    accent: '#ffd166',
  },
  /** 罗伯特：紫红西装 */
  robert: {
    skin: '#f0c49c',
    hair: '#3a2a1e',
    primary: '#8c3a6b',
    secondary: '#26202c',
    trim: '#efe6d8',
    accent: '#ff9ad5',
  },
  /** 坂崎百合：粉白道服 */
  yuri: {
    skin: '#f6cda8',
    hair: '#c8862f',
    primary: '#e86a8a',
    secondary: '#31313a',
    trim: '#fdf6ec',
    accent: '#8fe3ff',
  },
  /** 莉安娜：蓝色军装 */
  leona: {
    skin: '#e9bd96',
    hair: '#3b5f8f',
    primary: '#2f4a72',
    secondary: '#26292f',
    trim: '#e6dcc6',
    accent: '#9fe0ff',
  },
  /** 拉尔夫：橄榄绿军装 */
  ralf: {
    skin: '#e8bb8e',
    hair: '#4a3a22',
    primary: '#4a5730',
    secondary: '#242821',
    trim: '#e9e2cf',
    accent: '#ffb84d',
  },
  /** 克拉克：深蓝军装 + 墨镜 */
  clark: {
    skin: '#e6b489',
    hair: '#26201a',
    primary: '#33415c',
    secondary: '#1f232b',
    trim: '#dee6ef',
    accent: '#ff7b5c',
  },
  /** 特瑞·博加德 */
  terry: {
    skin: '#f0c39a',
    hair: '#e0b64a',
    primary: '#c8322b',
    secondary: '#2b4c7e',
    trim: '#f0ece0',
    accent: '#ffd166',
  },
};

/** 兜底色板：新角色没配色也不会黑屏 */
export const DEFAULT_PALETTE: Palette = {
  skin: '#e8b48a',
  hair: '#202020',
  primary: '#2b2b33',
  secondary: '#3a3a44',
  trim: '#e8e8e8',
  accent: '#ff5555',
};

export function paletteFor(charId: string): Palette {
  return PALETTES[charId] ?? DEFAULT_PALETTE;
}
