import { describe, expect, it } from 'vitest';
import { Btn, makeInput } from '../src/core/input';
import { GROUND_Y } from '../src/sim/constants';
import { FighterState } from '../src/sim/state';
import { Fighter } from '../src/sim/fighter';
import { World } from '../src/sim/world';
import { validateChar, validateMove, type CharDef } from '../src/data/schema';

function makeChar(overrides: Partial<CharDef> = {}): CharDef {
  const char: CharDef = {
    id: 'test',
    name: '测试角色',
    palette: {
      skin: '#e8b48a',
      hair: '#202020',
      primary: '#1b1b1b',
      secondary: '#3a3a3a',
      trim: '#ffffff',
      accent: '#ff4444',
    },
    hp: 1000,
    walk: { fwd: 1, back: 0.8 },
    jump: { vy: 8, vx: 3, frames: 26 },
    boxes: {
      stand: { x: -10, y: -40, w: 20, h: 40 },
      crouch: { x: -10, y: -26, w: 20, h: 26 },
      air: { x: -8, y: -36, w: 16, h: 36 },
    },
    moves: {
      '5A': {
        id: '5A',
        name: '轻拳',
        anim: 'punchLight',
        kind: 'normal',
        total: 12,
        hits: [
          {
            id: 'h1',
            box: { x: 8, y: -34, w: 18, h: 8 },
            frames: [3, 5],
            damage: 20,
            hitStun: 10,
            blockStun: 6,
            hitstop: 6,
            guard: 'high',
            level: 'mid',
            pushback: 2,
            blockPushback: 1,
          },
        ],
      },
      '5C': {
        id: '5C',
        name: '重拳',
        anim: 'punchHeavy',
        kind: 'normal',
        total: 24,
        hits: [
          {
            id: 'h1',
            box: { x: 10, y: -36, w: 24, h: 10 },
            frames: [8, 11],
            damage: 60,
            hitStun: 16,
            blockStun: 10,
            hitstop: 10,
            guard: 'high',
            level: 'mid',
            pushback: 4,
            blockPushback: 2,
          },
        ],
        cancel: { onHit: ['5A'] },
      },
    },
  };
  return { ...char, ...overrides };
}

function setup(): { world: World; fighter: Fighter } {
  const world = new World(1);
  const fighter = world.add(new Fighter(makeChar(), { x: 100, facing: 1 }));
  return { world, fighter };
}

/** 连续喂同样的输入 n 帧 */
function hold(world: World, held: number, frames: number): void {
  for (let i = 0; i < frames; i++) world.step([makeInput(held)]);
}

describe('地面移动', () => {
  it('朝前走：state=walkF，每帧按 fwd 速度位移', () => {
    const { world, fighter } = setup();
    world.step([makeInput(Btn.Right)]);
    expect(fighter.state).toBe(FighterState.WalkF);
    const x0 = fighter.x;
    hold(world, Btn.Right, 3);
    expect(fighter.x).toBeCloseTo(x0 + 3, 5);
    expect(fighter.stateFrame).toBe(3);
  });

  it('朝后走：state=walkB，速度是 back', () => {
    const { world, fighter } = setup();
    const x0 = fighter.x;
    world.step([makeInput(Btn.Left)]);
    expect(fighter.state).toBe(FighterState.WalkB);
    expect(fighter.vx).toBeCloseTo(-0.8, 5);
    expect(fighter.x).toBeCloseTo(x0 - 0.8, 5);
  });

  it('松手回 idle，蹲下用蹲姿受击盒', () => {
    const { world, fighter } = setup();
    hold(world, Btn.Right, 2);
    world.step([makeInput(0)]);
    expect(fighter.state).toBe(FighterState.Idle);
    expect(fighter.vx).toBe(0);

    world.step([makeInput(Btn.Down)]);
    expect(fighter.state).toBe(FighterState.Crouch);
    expect(fighter.hurtbox().h).toBe(26);
  });

  it('左右同时按视为中立（不抖）', () => {
    const { world, fighter } = setup();
    world.step([makeInput(Btn.Left | Btn.Right)]);
    expect(fighter.state).toBe(FighterState.Idle);
  });

  it('撞到舞台边界会夹住', () => {
    const { world, fighter } = setup();
    fighter.x = 310;
    hold(world, Btn.Right, 10);
    expect(fighter.x).toBe(312);
  });
});

describe('跳跃', () => {
  it('按上起跳，上升后落回地面回到 idle', () => {
    const { world, fighter } = setup();
    world.step([makeInput(Btn.Up)]);
    expect(fighter.state).toBe(FighterState.Jump);
    expect(fighter.airborne).toBe(true);

    // 起跳那一帧只切状态，位移从下一帧开始
    world.step([makeInput(0)]);
    expect(fighter.y).toBeLessThan(GROUND_Y);

    let frames = 2;
    while (fighter.state === FighterState.Jump && frames < 120) {
      world.step([makeInput(0)]);
      frames++;
    }
    expect(fighter.state).toBe(FighterState.Idle);
    expect(fighter.airborne).toBe(false);
    expect(fighter.y).toBe(GROUND_Y);
    expect(frames).toBeGreaterThan(10); // 滞空不是一两帧
    expect(frames).toBeLessThan(60);
  });

  it('斜跳保留水平速度，方向键决定朝向', () => {
    const { world, fighter } = setup();
    world.step([makeInput(Btn.Up | Btn.Left)]);
    expect(fighter.facing).toBe(-1);
    expect(fighter.vx).toBeCloseTo(-3, 5);
  });
});

describe('招式帧推进', () => {
  it('startMove → attack，帧号推进，total 帧后回中立', () => {
    const { world, fighter } = setup();
    const move = fighter.char.moves['5C']!;
    expect(fighter.startMove(move)).toBe(true);
    expect(fighter.state).toBe(FighterState.Attack);

    for (let f = 0; f < move.total - 1; f++) {
      world.step([makeInput(0)]);
      expect(fighter.state).toBe(FighterState.Attack);
    }
    world.step([makeInput(0)]);
    expect(fighter.state).toBe(FighterState.Idle);
    expect(fighter.move).toBeNull();
  });

  it('出招中不能被打断/换向', () => {
    const { world, fighter } = setup();
    fighter.startMove(fighter.char.moves['5C']!);
    hold(world, Btn.Left, 5);
    expect(fighter.state).toBe(FighterState.Attack);
    expect(fighter.facing).toBe(1);
    expect(fighter.vx).toBe(0);
  });

  it('只有判定窗口内的帧才算 activeHits', () => {
    const { world, fighter } = setup();
    fighter.startMove(fighter.char.moves['5A']!);
    const seen: boolean[] = [];
    for (let f = 0; f < 12; f++) {
      seen.push(fighter.isHitActive());
      world.step([makeInput(0)]);
    }
    // 判定 3~5 帧
    expect(seen.slice(3, 6).every(Boolean)).toBe(true);
    expect(seen.slice(0, 3).some(Boolean)).toBe(false);
    expect(seen.slice(6).some(Boolean)).toBe(false);
  });

  it('空中招式要求角色在空中，地面招式要求站在地上', () => {
    const { world, fighter } = setup();
    const airMove = { ...fighter.char.moves['5A']!, id: 'jA', airborne: true };
    expect(fighter.startMove(airMove)).toBe(false);
    world.step([makeInput(0)]);
    fighter.startJump(0);
    expect(fighter.startMove(airMove)).toBe(true);
  });
});

describe('受击 / 硬直', () => {
  it('受击硬直结束后回中立', () => {
    const { world, fighter } = setup();
    fighter.enterHitstun(5);
    expect(fighter.state).toBe(FighterState.Hit);
    for (let i = 0; i < 5; i++) world.step([makeInput(0)]);
    expect(fighter.state).toBe(FighterState.Idle);
  });

  it('防御硬直同样计时退出', () => {
    const { world, fighter } = setup();
    fighter.enterBlockstun(3);
    for (let i = 0; i < 3; i++) world.step([makeInput(0)]);
    expect(fighter.state).toBe(FighterState.Idle);
  });

  it('命中停顿期间状态帧冻结，停顿结束才继续推进', () => {
    const { world, fighter } = setup();
    fighter.startMove(fighter.char.moves['5C']!);
    world.step([makeInput(0)]);
    const before = fighter.stateFrame;
    fighter.addHitstop(4);
    for (let i = 0; i < 4; i++) world.step([makeInput(0)]);
    expect(fighter.stateFrame).toBe(before);
    expect(fighter.hitstop).toBe(0);
    world.step([makeInput(0)]);
    expect(fighter.stateFrame).toBe(before + 1);
  });

  it('地上被击倒 → 倒地 → 起身 → 中立', () => {
    const { world, fighter } = setup();
    fighter.enterHitstun(10, { knockdown: true });
    expect(fighter.state).toBe(FighterState.Down);
    let frames = 0;
    while (fighter.state !== FighterState.Idle && frames < 120) {
      world.step([makeInput(0)]);
      frames++;
    }
    expect(fighter.state).toBe(FighterState.Idle);
    expect(frames).toBeGreaterThan(10);
  });

  it('血量归零进 dead 且不复活', () => {
    const { world, fighter } = setup();
    fighter.takeDamage(fighter.maxHp);
    expect(fighter.hp).toBe(0);
    expect(fighter.state).toBe(FighterState.Dead);
    hold(world, Btn.Right, 5);
    expect(fighter.state).toBe(FighterState.Dead);
    expect(fighter.x).toBe(100);
  });
});

describe('坐标系与哈希', () => {
  it('判定盒按朝向镜像', () => {
    const { fighter } = setup();
    const box = { x: 10, y: -30, w: 20, h: 10 };
    expect(fighter.worldBox(box)).toEqual({ x: 110, y: GROUND_Y - 30, w: 20, h: 10 });
    fighter.turn();
    expect(fighter.worldBox(box)).toEqual({ x: 70, y: GROUND_Y - 30, w: 20, h: 10 });
  });

  it('状态变化会改变世界哈希', () => {
    const { world, fighter } = setup();
    const h0 = world.hash();
    hold(world, Btn.Right, 2);
    expect(world.hash()).not.toBe(h0);
    expect(fighter.state).toBe(FighterState.WalkF);
  });
});

describe('数据校验', () => {
  it('判定结束帧超出 total 会被抓出来', () => {
    const char = makeChar();
    const bad = { ...char.moves['5A']!, total: 4 };
    expect(validateMove(bad).some((p) => p.includes('判定结束帧'))).toBe(true);
  });

  it('取消表引用不存在的招式会被抓出来', () => {
    const char = makeChar();
    char.moves['5C']!.cancel = { onHit: ['236P'] };
    expect(validateChar(char).some((p) => p.includes('236P'))).toBe(true);
  });

  it('正常角色表没有毛病', () => {
    expect(validateChar(makeChar())).toEqual([]);
  });
});
