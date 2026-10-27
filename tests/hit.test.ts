import { describe, expect, it } from 'vitest';
import { Btn, makeInput } from '../src/core/input';
import type { CharDef, HitDef, MoveDef } from '../src/data/schema';
import { clamp, gapX, intersects, overlapArea } from '../src/sim/collision';
import { comboScale, scaledDamage } from '../src/sim/combo';
import { Fighter } from '../src/sim/fighter';
import { isGuarding, resolveCombat, type HitResolution } from '../src/sim/hit';
import { World } from '../src/sim/world';

function hitDef(id: string, over: Partial<HitDef> = {}): HitDef {
  return {
    id,
    box: { x: 8, y: -34, w: 24, h: 10 },
    frames: [3, 3],
    damage: 20,
    hitStun: 12,
    blockStun: 6,
    hitstop: 6,
    guard: 'high',
    level: 'mid',
    pushback: 2,
    blockPushback: 1,
    ...over,
  };
}

function move(id: string, hits: HitDef[], over: Partial<MoveDef> = {}): MoveDef {
  return { id, name: id, anim: id, kind: 'normal', total: 24, hits, ...over };
}

const CHAR: CharDef = {
  id: 'test',
  name: '测试',
  palette: { skin: '#e8b48a', hair: '#111', primary: '#222', secondary: '#333', trim: '#fff', accent: '#f44' },
  hp: 1000,
  walk: { fwd: 1, back: 0.8 },
  jump: { vy: 8, vx: 3, frames: 26 },
  boxes: {
    stand: { x: -10, y: -40, w: 20, h: 40 },
    crouch: { x: -10, y: -26, w: 20, h: 26 },
    air: { x: -10, y: -36, w: 20, h: 36 },
  },
  moves: {
    '5A': move('5A', [hitDef('h1')]),
    '5low': move('5low', [hitDef('h1', { guard: 'low', level: 'low' })]),
    '5over': move('5over', [hitDef('h1', { guard: 'overhead', level: 'overhead' })]),
    '5multi': move('5multi', [hitDef('h1', { frames: [3, 6] })]),
    'combo3': move('combo3', [
      hitDef('c1', { frames: [3, 3] }),
      hitDef('c2', { frames: [4, 4] }),
      hitDef('c3', { frames: [5, 5] }),
    ]),
    '5C': move('5C', [hitDef('h1', { damage: 60, hitstop: 10, hitStun: 18 })]),
  },
};

interface Scene {
  world: World;
  a: Fighter;
  b: Fighter;
}

function setup(aX = 100, bX = 130): Scene {
  const world = new World(7);
  const a = world.add(new Fighter(CHAR, { x: aX, facing: 1 }));
  const b = world.add(new Fighter(CHAR, { x: bX, facing: -1 }));
  return { world, a, b };
}

/** 推进 n 帧，每帧都做一次命中结算 */
function ticks(scene: Scene, frames: number, heldA = 0, heldB = 0): HitResolution[] {
  const all: HitResolution[] = [];
  for (let i = 0; i < frames; i++) {
    scene.world.step([makeInput(heldA), makeInput(heldB)]);
    all.push(...resolveCombat(scene.world, [scene.a, scene.b]));
  }
  return all;
}

describe('几何基元', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  it('相交/相切/分离', () => {
    expect(intersects(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(intersects(a, { x: 10, y: 0, w: 10, h: 10 })).toBe(false); // 贴边不算
    expect(intersects(a, { x: 20, y: 0, w: 10, h: 10 })).toBe(false);
  });
  it('重叠面积与水平间隙', () => {
    expect(overlapArea(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(25);
    expect(gapX(a, { x: 20, y: 0, w: 10, h: 10 })).toBe(10);
    expect(gapX(a, { x: 5, y: 0, w: 10, h: 10 })).toBeLessThan(0);
  });
  it('clamp', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });
});

describe('命中', () => {
  it('打中：掉血、进受击硬直、双方拿到命中停顿、连击数 1', () => {
    const scene = setup();
    scene.a.startMove(CHAR.moves['5A']!);
    const res = ticks(scene, 3);

    expect(res).toHaveLength(1);
    expect(res[0]!.kind).toBe('hit');
    expect(res[0]!.damage).toBe(20);
    expect(scene.b.hp).toBe(980);
    expect(scene.b.state).toBe('hit');
    expect(scene.a.hitstop).toBe(6);
    expect(scene.b.hitstop).toBe(6);
    expect(scene.b.combo.hits).toBe(1);
    expect(scene.a.meter).toBeGreaterThan(0);
  });

  it('同一段判定不会连续命中（多帧生效只算一次）', () => {
    const scene = setup();
    scene.a.startMove(CHAR.moves['5multi']!);
    const res = ticks(scene, 20);
    expect(res).toHaveLength(1);
    expect(scene.b.hp).toBe(980);
  });

  it('挥空不产生结算', () => {
    const scene = setup(0, 300);
    scene.a.startMove(CHAR.moves['5A']!);
    expect(ticks(scene, 12)).toHaveLength(0);
    expect(scene.b.hp).toBe(1000);
  });

  it('KO：血量归零进 dead，并发出 ko 事件', () => {
    const scene = setup();
    scene.b.hp = 10;
    scene.a.startMove(CHAR.moves['5A']!);
    const res = ticks(scene, 3);
    expect(res[0]!.ko).toBe(true);
    expect(scene.b.hp).toBe(0);
    expect(scene.b.state).toBe('dead');
    expect(scene.world.events.some((e) => e.type === 'ko')).toBe(true);
  });

  it('倒地/起身无敌：判定打不到', () => {
    const scene = setup();
    scene.b.enterKnockdown();
    scene.a.startMove(CHAR.moves['5A']!);
    expect(ticks(scene, 3)).toHaveLength(0);
  });
});

describe('防御', () => {
  it('按住后退能防住中段', () => {
    const scene = setup();
    scene.a.startMove(CHAR.moves['5A']!);
    const res = ticks(scene, 3, 0, Btn.Right);
    expect(res).toHaveLength(1);
    expect(res[0]!.kind).toBe('block');
    expect(scene.b.hp).toBe(1000);
    expect(scene.b.state).toBe('block');
  });

  it('站着不按后退 = 不防', () => {
    const scene = setup();
    scene.a.startMove(CHAR.moves['5A']!);
    const res = ticks(scene, 3);
    expect(res[0]!.kind).toBe('hit');
    expect(scene.b.hp).toBe(980);
  });

  it('蹲防吃中段（overhead 必须站防）', () => {
    const scene = setup();
    scene.a.startMove(CHAR.moves['5over']!);
    const res = ticks(scene, 3, 0, Btn.Right | Btn.Down);
    expect(res[0]!.kind).toBe('hit');
    expect(scene.b.hp).toBe(980);
  });

  it('站防吃下段（low 必须蹲防）', () => {
    const scene = setup();
    scene.a.startMove(CHAR.moves['5low']!);
    const res = ticks(scene, 3, 0, Btn.Right);
    expect(res[0]!.kind).toBe('hit');

    const scene2 = setup();
    scene2.a.startMove(CHAR.moves['5low']!);
    const res2 = ticks(scene2, 3, 0, Btn.Right | Btn.Down);
    expect(res2[0]!.kind).toBe('block');
  });

  it('空中不能防（KOF97 没有空中防御）', () => {
    const scene = setup();
    scene.b.startJump(0);
    scene.world.step([makeInput(0), makeInput(0)]);
    expect(scene.b.airborne).toBe(true);
    expect(isGuarding(scene.b, CHAR.moves['5A']!.hits[0]!)).toBe(false);
  });

  it('unblockable 谁都防不住', () => {
    const scene = setup();
    const un = move('un', [hitDef('h1', { guard: 'unblockable' })]);
    scene.b.input = { held: Btn.Right, pressed: 0, released: 0 };
    expect(isGuarding(scene.b, un.hits[0]!)).toBe(false);
  });
});

describe('相杀（同帧互中）', () => {
  it('双方同时出招都能打中对方，且与遍历顺序无关', () => {
    const scene = setup(100, 130);
    scene.a.startMove(CHAR.moves['5A']!);
    scene.b.startMove(CHAR.moves['5A']!);
    const res = ticks(scene, 3);
    expect(res).toHaveLength(2);
    expect(scene.a.hp).toBe(980);
    expect(scene.b.hp).toBe(980);
    expect(res.map((r) => r.attacker).sort((x, y) => x.id - y.id)).toEqual([scene.a, scene.b]);
  });
});

describe('命中停顿', () => {
  it('命中后双方状态帧冻结 hitstop 帧', () => {
    const scene = setup();
    scene.a.startMove(CHAR.moves['5C']!);
    ticks(scene, 3);
    expect(scene.a.hitstop).toBe(10);

    const aFrame = scene.a.stateFrame;
    const bFrame = scene.b.stateFrame;
    for (let i = 0; i < 9; i++) {
      scene.world.step([makeInput(0), makeInput(0)]);
    }
    expect(scene.a.stateFrame).toBe(aFrame);
    expect(scene.b.stateFrame).toBe(bFrame);
    expect(scene.a.hitstop).toBe(1);
  });
});

describe('连段补正', () => {
  it('倍率表单调不增，最低 20%', () => {
    const scales = Array.from({ length: 20 }, (_, i) => comboScale(i));
    for (let i = 1; i < scales.length; i++) expect(scales[i]!).toBeLessThanOrEqual(scales[i - 1]!);
    expect(scales.at(-1)).toBe(0.2);
    expect(scaledDamage(20, 0)).toBe(20);
    expect(scaledDamage(20, 2)).toBe(18);
    expect(scaledDamage(1, 9)).toBe(1); // 保底 1 点
  });

  it('三段连击：第三段伤害被削，连击计数累计', () => {
    const scene = setup();
    scene.a.startMove(CHAR.moves['combo3']!);
    const res = ticks(scene, 40);
    expect(res).toHaveLength(3);
    expect(res.map((r) => r.damage)).toEqual([20, 20, 18]);
    expect(res.map((r) => r.comboHits)).toEqual([1, 2, 3]);
    // 连段结束后（受击方已回中立）计数清零
    expect(scene.b.state).toBe('idle');
    expect(scene.b.combo.hits).toBe(0);
  });

  it('防守方恢复中立后连段计数清零', () => {
    const scene = setup();
    scene.a.startMove(CHAR.moves['5A']!);
    ticks(scene, 3);
    expect(scene.b.combo.hits).toBe(1);

    // hitstop 6 + hitStun 12 之后再走几帧，受击方回中立
    ticks(scene, 30);
    expect(scene.b.state).toBe('idle');
    expect(scene.b.combo.hits).toBe(0);
  });
});

describe('事件与朝向', () => {
  it('命中/防御都会发事件给特效层', () => {
    const scene = setup();
    scene.a.startMove(CHAR.moves['5A']!);
    ticks(scene, 3);
    const hit = scene.world.events.find((e) => e.type === 'hit');
    expect(hit).toBeDefined();
    expect(hit!.data.level).toBe('mid');

    const scene2 = setup();
    scene2.a.startMove(CHAR.moves['5A']!);
    const blockEvents: string[] = [];
    for (let i = 0; i < 3; i++) {
      scene2.world.step([makeInput(0), makeInput(Btn.Right)]);
      resolveCombat(scene2.world, [scene2.a, scene2.b]);
      blockEvents.push(...scene2.world.events.map((e) => e.type));
    }
    expect(blockEvents).toContain('guard');
  });

  it('左右朝向互换后，防御方向也跟着换', () => {
    // 朝右的角色（对手在右边）：后退方向是左
    const facingRight = new Fighter(CHAR, { x: 100, facing: 1 });
    facingRight.input = { held: Btn.Right, pressed: 0, released: 0 };
    expect(isGuarding(facingRight, CHAR.moves['5A']!.hits[0]!)).toBe(false); // 往前走 = 不防
    facingRight.input = { held: Btn.Left, pressed: 0, released: 0 };
    expect(isGuarding(facingRight, CHAR.moves['5A']!.hits[0]!)).toBe(true);

    // 朝左的角色（对手在左边）：后退方向是右
    const facingLeft = new Fighter(CHAR, { x: 130, facing: -1 });
    facingLeft.input = { held: Btn.Left, pressed: 0, released: 0 };
    expect(isGuarding(facingLeft, CHAR.moves['5A']!.hits[0]!)).toBe(false);
    facingLeft.input = { held: Btn.Right, pressed: 0, released: 0 };
    expect(isGuarding(facingLeft, CHAR.moves['5A']!.hits[0]!)).toBe(true);
  });
});

