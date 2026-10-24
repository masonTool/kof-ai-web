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
    // 原版：白色学生服上衣 + 黑色立领/腰带 + 黑色裤子
    primary: '#e8e3d6',
    secondary: '#1d1f26',
    trim: '#15161b',
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
  /** 麻宫雅典娜：红白水手服 */
  athena: {
    skin: '#f6cda8',
    hair: '#7a4bb5',
    primary: '#e8484f',
    secondary: '#2f2f6b',
    trim: '#fdf6ec',
    accent: '#8fe3ff',
  },
  /** 椎拳崇：绿色功夫装 */
  kensou: {
    skin: '#eab98d',
    hair: '#2f2620',
    primary: '#3f7a4a',
    secondary: '#262a30',
    trim: '#efe6d4',
    accent: '#ffd166',
  },
  /** 镇元斋：褐色长袍 */
  chin: {
    skin: '#dfae84',
    hair: '#e8e4dc',
    primary: '#7a5a3a',
    secondary: '#2a2620',
    trim: '#e8dfca',
    accent: '#b8e06a',
  },
  /** 金家藩：白道服 + 黑带 */
  kim: {
    skin: '#eab98d',
    hair: '#241f1a',
    primary: '#f0ece0',
    secondary: '#22262e',
    trim: '#c8342c',
    accent: '#ffd166',
  },
  /** 陈国汉：光头大汉 + 铁球 */
  chang: {
    skin: '#e2ab7e',
    hair: '#c9a06a',
    primary: '#5c4a2e',
    secondary: '#2b2620',
    trim: '#9aa3ad',
    accent: '#ffcc55',
  },
  /** 蔡宝奇：小个子 + 爪 */
  choi: {
    skin: '#e8b389',
    hair: '#3a2a1c',
    primary: '#6b3f8f',
    secondary: '#26202c',
    trim: '#e9e4d8',
    accent: '#9fe0ff',
  },
  /** 比利·凯恩：红马甲 + 头巾 */
  billy: {
    skin: '#e8bb8e',
    hair: '#d8c07a',
    primary: '#c8342c',
    secondary: '#2a2e36',
    trim: '#f0e6d2',
    accent: '#ffb347',
  },
  /** 如月影二：深紫忍者装 */
  eiji: {
    skin: '#eab98d',
    hair: '#26202c',
    primary: '#4b3f7a',
    secondary: '#221f2b',
    trim: '#d8d4e8',
    accent: '#9fe0ff',
  },
  /** 矢吹真吾：白 T + 蓝裤 */
  shingo: {
    skin: '#f2c9a0',
    hair: '#2b2118',
    primary: '#e8e4d8',
    secondary: '#33506e',
    trim: '#c8342c',
    accent: '#ffd166',
  },
  /** 七枷社：褐色大衣 */
  yashiro: {
    skin: '#e6b489',
    hair: '#2a2320',
    primary: '#6b4b2f',
    secondary: '#232026',
    trim: '#d9ceb8',
    accent: '#c8a24a',
  },
  /** 夏尔米：红发 + 黄衣 */
  shermie: {
    skin: '#f2c9a0',
    hair: '#d86a2b',
    primary: '#e0b23c',
    secondary: '#2b2430',
    trim: '#f7eedb',
    accent: '#ff6b9d',
  },
  /** 克里斯：白肤金发 */
  chris: {
    skin: '#f6d3b0',
    hair: '#e8d27a',
    primary: '#eef0f5',
    secondary: '#4a3f6b',
    trim: '#c8b06a',
    accent: '#ffb347',
  },
  /** 暴走八神庵 */
  orochiIori: {
    skin: '#e8c6a8',
    hair: '#c8322b',
    primary: '#6a1f3d',
    secondary: '#1a1420',
    trim: '#f0e6d2',
    accent: '#ff2e63',
  },
  /** 暴走莉安娜 */
  orochiLeona: {
    skin: '#e6c3a0',
    hair: '#c33b3b',
    primary: '#4a2a55',
    secondary: '#1d1a24',
    trim: '#ffd9d9',
    accent: '#ff4d6d',
  },
  /** ゲーニッツ：白色神父装 */
  goenitz: {
    skin: '#eec8a4',
    hair: '#d8d4c8',
    primary: '#f2eee2',
    secondary: '#3a3f52',
    trim: '#c8b06a',
    accent: '#9fd8ff',
  },
  /** 大蛇：白袍金饰 */
  orochi: {
    skin: '#f6e2c8',
    hair: '#f2ead0',
    primary: '#eae6d4',
    secondary: '#5a4a7a',
    trim: '#ffd166',
    accent: '#ffef9f',
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
