import { describe, expect, it } from 'vitest';
import { Btn, NO_INPUT, makeInput } from '../src/core/input';
import { KYO } from '../src/data/chars/kyo';
import { Match } from '../src/game/match';
import { METER_MAX } from '../src/sim/constants';
import { FighterState } from '../src/sim/state';
import { drawFrame } from '../src/render/renderer';
import {
  DEFAULT_TRAINING,
  DUMMY_ORDER,
  TrainingSession,
  describeInput,
  drawTrainingOverlay,
} from '../src/ui/training';
import { FakeCtx } from './helpers/fake-ctx';

function makeTraining(settings = {}): { match: Match; training: TrainingSession } {
  const match = new Match(KYO, KYO, { introFrames: 1, roundEndFrames: 3 });
  const training = new TrainingSession(match, settings);
  for (let i = 0; i < 2; i++) training.step([NO_INPUT, NO_INPUT]); // 走完开场
  return { match, training };
}

describe('训练模式的开关', () => {
  it('默认配置是"能正常打完一场"', () => {
    // 默认是"能正常打完一场"，不是"永远打不死"
    expect(DEFAULT_TRAINING.infiniteHp).toBe(false);
    expect(DEFAULT_TRAINING.infiniteMeter).toBe(false);
    expect(DEFAULT_TRAINING.autoReset).toBe(false);
    expect(DEFAULT_TRAINING.dummy).toBe('cpu'); // 单人也要有对手，不然"打完一场"没意义
    expect(DEFAULT_TRAINING.showBoxes).toBe(false);
  });

  it('toggle 来回切换', () => {
    const { training } = makeTraining();
    expect(training.toggle('showBoxes')).toBe(true);
    expect(training.settings.showBoxes).toBe(true);
    expect(training.toggle('showBoxes')).toBe(false);
  });

  it('假人行为按固定顺序循环', () => {
    const { training } = makeTraining();
    expect(training.settings.dummy).toBe('cpu');
    const seen = [training.cycleDummy()];
    for (let i = 1; i < DUMMY_ORDER.length - 1; i++) seen.push(training.cycleDummy());
    expect(seen).toEqual(DUMMY_ORDER.slice(1));
    expect(training.cycleDummy()).toBe(DUMMY_ORDER[0]); // 转一圈回到起点
  });
});

describe('训练模式的作弊项', () => {
  it('无限气：每帧都把气槽补满', () => {
    const { match, training } = makeTraining({ infiniteMeter: true });
    match.p1.meter = 0;
    training.step([NO_INPUT, NO_INPUT]);
    expect(match.p1.meter).toBe(METER_MAX);
    expect(match.p2.meter).toBe(METER_MAX);
  });

  it('无限血：掉血后下一帧回满', () => {
    const { match, training } = makeTraining({ infiniteHp: true });
    match.p1.hp = 300;
    training.step([NO_INPUT, NO_INPUT]);
    expect(match.p1.hp).toBe(match.p1.maxHp);
  });

  it('关掉无限血就不再回血', () => {
    const { match, training } = makeTraining({ infiniteHp: false });
    match.p1.hp = 300;
    training.step([NO_INPUT, NO_INPUT]);
    expect(match.p1.hp).toBe(300);
  });

  it('关掉无限气就正常消耗', () => {
    const { match, training } = makeTraining({ infiniteMeter: false });
    match.p1.meter = 0;
    training.step([NO_INPUT, NO_INPUT]);
    expect(match.p1.meter).toBe(0);
  });

  it('KO 后自动重开（训练不该结束回合）', () => {
    const { match, training } = makeTraining({ infiniteHp: false, autoReset: true });
    match.p1.x = 220;
    match.p2.x = 260;
    match.p2.hp = 5;
    match.p1.startMove(KYO.moves['5A']!);
    for (let i = 0; i < 20 && match.p2.hp > 0; i++) training.step([NO_INPUT, NO_INPUT]);

    expect(match.phase).toBe('fight'); // 已被 softReset 拉回
    expect(match.p2.hp).toBe(match.p2.maxHp);
    expect(match.p1.state).toBe(FighterState.Idle);
  });
});

describe('假人行为', () => {
  it('站/蹲/跳/防各自的输入', () => {
    const { training } = makeTraining();
    training.settings.dummy = 'stand';
    expect(training.dummyInput().held).toBe(0);
    training.settings.dummy = 'crouch';
    expect(training.dummyInput().held).toBe(Btn.Down);
    training.settings.dummy = 'jump';
    expect(training.dummyInput().held).toBe(Btn.Up);
    training.settings.dummy = 'guard';
    expect(training.dummyInput().held).toBe(Btn.Right); // 面朝左 → 后退方向是右
    training.settings.dummy = 'guardLow';
    expect(training.dummyInput().held).toBe(Btn.Right | Btn.Down);
    training.settings.dummy = 'human';
    expect(training.dummyInput(makeInput(Btn.A)).held).toBe(Btn.A);
  });

  it('假人设成防御时，真的能防住攻击', () => {
    const { match, training } = makeTraining({ dummy: 'guard', infiniteHp: false });
    match.p1.x = 220;
    match.p2.x = 260;
    match.p1.startMove(KYO.moves['5A']!);
    for (let i = 0; i < 8 && match.p2.state !== FighterState.Block; i++) training.step([NO_INPUT, NO_INPUT]);

    expect(match.p2.state).toBe(FighterState.Block);
    expect(match.p2.hp).toBe(match.p2.maxHp);
  });

  it('假人站着不动就会挨打', () => {
    const { match, training } = makeTraining({ dummy: 'stand', infiniteHp: false });
    match.p1.x = 220;
    match.p2.x = 260;
    match.p1.startMove(KYO.moves['5A']!);
    for (let i = 0; i < 8 && match.p2.hp === match.p2.maxHp; i++) training.step([NO_INPUT, NO_INPUT]);
    expect(match.p2.hp).toBeLessThan(match.p2.maxHp);
  });
});

describe('调试信息', () => {
  it('describeInput 把位掩码翻成符号', () => {
    expect(describeInput(0)).toBe('-');
    expect(describeInput(Btn.Left | Btn.A)).toBe('← A');
    expect(describeInput(Btn.Down | Btn.Right | Btn.C | Btn.D)).toBe('↓ → C D');
  });

  it('出招时帧数面板显示招式名与判定帧', () => {
    const { match, training } = makeTraining();
    match.p1.startMove(KYO.moves['236A']!);
    training.step([NO_INPUT, NO_INPUT]);
    const lines = training.frameDataLines();
    const joined = lines.join('\n');
    expect(joined).toContain('百拾四式・荒咬み');
    expect(joined).toContain('判定 10-13');
    expect(joined).toContain('F1 判定框 OFF');
  });

  it('没出招时显示状态与帧号', () => {
    const { training } = makeTraining();
    const lines = training.frameDataLines();
    expect(lines.some((l) => l.includes('P1 idle'))).toBe(true);
    expect(lines.some((l) => l.includes('气'))).toBe(true);
  });

  it('调试文字能画到 ctx 上', () => {
    const { training } = makeTraining();
    const ctx = new FakeCtx();
    drawTrainingOverlay(ctx, training.frameDataLines());
    const lines = training.frameDataLines().length;
    expect(ctx.texts.length).toBe(lines * 2); // 每行画一次阴影 + 一次正文
    expect(ctx.texts[0]!.align).toBe('left');
  });
});

describe('整帧渲染（无 DOM）', () => {
  it('能画出舞台 + 角色 + HUD，不抛异常', () => {
    const { match } = makeTraining();
    const ctx = new FakeCtx();
    expect(() => drawFrame(ctx, match)).not.toThrow();
    expect(ctx.count('stroke')).toBeGreaterThan(10); // 角色的肢体
    expect(ctx.count('fillRect')).toBeGreaterThan(5); // 舞台与血条
    expect(ctx.count('save')).toBe(ctx.count('restore'));
    expect(ctx.texts.some((t) => t.text === '草薙京')).toBe(true);
  });

  it('打开判定框会多画几笔（红/蓝/黄）', () => {
    const { match } = makeTraining();
    const plain = new FakeCtx();
    drawFrame(plain, match);
    const boxed = new FakeCtx();
    drawFrame(boxed, match, { showBoxes: true });

    expect(boxed.count('stroke')).toBeGreaterThan(plain.count('stroke'));
    const colors = new Set(boxed.calls.map(() => '')); // 仅用于稳定结构，颜色从 lines 里查
    expect(colors.size).toBeGreaterThan(0);
    const strokeColors = boxed.lines.map((l) => l.stroke);
    expect(strokeColors).toContain('#ff4d6d');
    expect(strokeColors).toContain('#4d9dff');
  });
});

describe('简易 CPU（单人也能打一局）', () => {
  it('离得远会朝对手走', () => {
    const { match, training } = makeTraining({ dummy: 'cpu', infiniteHp: false });
    const before = match.p2.x;
    for (let i = 0; i < 40; i++) training.step([NO_INPUT, NO_INPUT]);
    expect(Math.abs(match.p2.x - before)).toBeGreaterThan(5);
    expect(Math.abs(match.p2.x - match.p1.x)).toBeLessThan(Math.abs(before - match.p1.x));
  });

  it('走到近身会出招（对手会被打到）', () => {
    const { match, training } = makeTraining({ dummy: 'cpu', infiniteHp: false });
    let sawAttack = false;
    for (let i = 0; i < 600 && match.p1.hp === match.p1.maxHp && match.phase === 'fight'; i++) {
      training.step([NO_INPUT, NO_INPUT]);
      if (match.p2.isAttacking) sawAttack = true;
    }
    expect(sawAttack).toBe(true);
    expect(match.p1.hp).toBeLessThan(match.p1.maxHp);
  });

  it('回合演出期间 CPU 不动', () => {
    const match = new Match(KYO, KYO, { introFrames: 30, roundEndFrames: 3 });
    const training = new TrainingSession(match, { dummy: 'cpu' });
    const before = match.p2.x;
    for (let i = 0; i < 10; i++) training.step([NO_INPUT, NO_INPUT]);
    expect(match.phase).toBe('intro');
    expect(match.p2.x).toBe(before);
  });

  it('同一段流程两次跑结果一致（CPU 用固定种子）', () => {
    const run = (): string => {
      const { match, training } = makeTraining({ dummy: 'cpu' });
      for (let i = 0; i < 300; i++) training.step([NO_INPUT, NO_INPUT]);
      return match.hash();
    };
    expect(run()).toBe(run());
  });
});

describe('喂进模拟层的输入（回放要用）', () => {
  it('lastInputs 记的是假人的输入，不是键盘的', () => {
    const { match, training } = makeTraining({ dummy: 'guard' });
    training.step([NO_INPUT, NO_INPUT]);
    // 假人面朝左 → 防御方向是右
    expect(training.lastInputs[1].held).toBe(Btn.Right);
    expect(training.lastInputs[0].held).toBe(0);
    void match;
  });

  it('CPU 打出的输入也会进 lastInputs', () => {
    const { training } = makeTraining({ dummy: 'cpu' });
    let sawInput = false;
    for (let i = 0; i < 120; i++) {
      training.step([NO_INPUT, NO_INPUT]);
      if (training.lastInputs[1].held !== 0) sawInput = true;
    }
    expect(sawInput).toBe(true);
  });
});
