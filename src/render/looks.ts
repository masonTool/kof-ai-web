/**
 * 角色外观参数：让 29 个角色共用一套骨架，但看起来不是同一个人。
 *
 * 只暴露四个旋钮（身高 / 壮实度 / 头大小 / 发型+配件），因为它们**能被程序化绘制**；
 * 再多的细节就要手绘了（版权 + 工作量），那是 `assets.ts` 那条路。
 *
 * 数据放在独立表里而不是塞进 `CharDef`：外观是表现层的事，
 * 招式数据不该因为"换了个发型"而改动。
 */

export type HairStyle = 'short' | 'spiky' | 'long' | 'bald' | 'ponytail';
export type Accessory = 'none' | 'headband' | 'hat' | 'mask' | 'glasses';

export interface Look {
  /** 纵向体型倍率（以脚底为原点缩放，脚不会离地） */
  height: number;
  /** 肢体粗细倍率 */
  build: number;
  /** 头部大小倍率 */
  head: number;
  hair: HairStyle;
  accessory: Accessory;
}

export const DEFAULT_LOOK: Look = {
  height: 1,
  build: 1,
  head: 1,
  hair: 'short',
  accessory: 'none',
};

/** 每个角色"长什么样"（没列到的走默认） */
export const LOOKS: Record<string, Partial<Look>> = {
  kyo: { hair: 'spiky' },
  iori: { hair: 'long', height: 1.02 },
  benimaru: { hair: 'spiky', height: 1.04, head: 0.95 },
  daimon: { hair: 'bald', build: 1.32, height: 1.08, head: 1.05 },
  terry: { hair: 'spiky', accessory: 'hat', build: 1.08 },
  andy: { hair: 'long' },
  joe: { hair: 'spiky', accessory: 'headband', build: 1.1 },
  ryo: { hair: 'spiky', build: 1.12 },
  robert: { hair: 'short', height: 1.02 },
  yuri: { hair: 'ponytail', height: 0.92, build: 0.9, head: 1.02 },
  leona: { hair: 'long', height: 0.98 },
  ralf: { hair: 'short', build: 1.16, accessory: 'headband' },
  clark: { hair: 'short', build: 1.2, accessory: 'glasses' },
  athena: { hair: 'ponytail', height: 0.94, build: 0.92 },
  kensou: { hair: 'spiky', accessory: 'headband' },
  chin: { hair: 'bald', height: 0.86, build: 1.14, head: 1.06 },
  kim: { hair: 'ponytail', height: 1.02 },
  chang: { hair: 'bald', build: 1.35, height: 1.1, head: 1.04 },
  choi: { hair: 'spiky', height: 0.82, build: 0.84, head: 1.1 },
  billy: { hair: 'long', accessory: 'headband' },
  eiji: { hair: 'long', accessory: 'mask' },
  shingo: { hair: 'spiky', height: 0.98 },
  yashiro: { hair: 'short', build: 1.2 },
  shermie: { hair: 'long' },
  chris: { hair: 'short', height: 0.96, build: 0.94 },
  orochi_iori: { hair: 'long', height: 1.03, build: 1.05 },
  orochi_leona: { hair: 'long', height: 1.0 },
  goenitz: { hair: 'short', height: 1.06 },
  orochi: { hair: 'long', height: 1.06, build: 1.05 },
};

const clamp = (v: number, min: number, max: number): number =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 1;

/** 取某个角色的外观（未配置的走默认；数值一律夹到合理范围） */
export function lookFor(id: string): Look {
  const custom = LOOKS[id];
  if (!custom) return { ...DEFAULT_LOOK };
  return {
    height: clamp(custom.height ?? DEFAULT_LOOK.height, 0.75, 1.2),
    build: clamp(custom.build ?? DEFAULT_LOOK.build, 0.75, 1.5),
    head: clamp(custom.head ?? DEFAULT_LOOK.head, 0.85, 1.15),
    hair: custom.hair ?? DEFAULT_LOOK.hair,
    accessory: custom.accessory ?? DEFAULT_LOOK.accessory,
  };
}
