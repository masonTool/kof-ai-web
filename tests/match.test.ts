import { describe, expect, it } from 'vitest';
import { Btn, makeInput } from '../src/core/input';
import { IORI } from '../src/data/chars/iori';
import { KYO } from '../src/data/chars/kyo';
import {
  DEFAULT_MATCH,
  Match,
  SUPER_CINEMA_ZOOM,
  SUPER_FLASH_FRAMES,
  type MatchConfig,
} from '../src/game/match';
import { GROUND_Y } from '../src/sim/constants';
import { FighterState } from '../src/sim/state';

function makeMatch(config: Partial<MatchConfig> = {}): Match {
  return new Match(KYO, KYO, { introFrames: 2, roundEndFrames: 3, ...config });
}

/** 把两人拉近到能打到的距离（开局间距是 96，轻拳够不着） */
function closeIn(m: Match): void {
  m.p1.x = 220;
  m.p2.x = 260;
}

/** 走完开局演出，进入 fight */
function toFight(m: Match): Match {
  let guard = 0;
  while (m.phase === 'intro' && guard++ < 200) m.step();
  return m;
}

/** 让 P1 用轻拳打赢一回合（对手只剩 5 血）；停在回合结束那一刻，不推进到下一回合 */
function winRoundByKo(m: Match): void {
  toFight(m);
  closeIn(m);
  m.p2.hp = 5;
  m.p1.startMove(KYO.moves['5A']!);
  for (let i = 0; i < 20 && m.phase === 'fight'; i++) m.step();
}

describe('开局与回合演出', () => {
  it('默认三局两胜、99 秒', () => {
    expect(DEFAULT_MATCH.roundsToWin).toBe(2);
    expect(DEFAULT_MATCH.roundSeconds).toBe(99);
  });

  it('开场是 ROUND 演出，演出结束才开打', () => {
    const m = makeMatch({ introFrames: 3 });
    expect(m.phase).toBe('intro');
    expect(m.banner).toBe('ROUND 1');
    expect(m.timerSeconds).toBe(99);

    m.step();
    m.step();
    expect(m.phase).toBe('intro');
    expect(m.p1.state).toBe(FighterState.Idle); // 演出期间不动

    m.step();
    expect(m.phase).toBe('fight');
  });

  it('开局两人面对面站在舞台中央两侧', () => {
    const m = makeMatch();
    expect(m.p1.facing).toBe(1);
    expect(m.p2.facing).toBe(-1);
    expect(m.p2.x - m.p1.x).toBeCloseTo(DEFAULT_MATCH.spawnGap, 5);
    expect(m.p1.y).toBe(GROUND_Y);
  });
});

describe('KO 判定', () => {
  it('打空血 → 回合结束，P1 得一胜，显示 K.O.', () => {
    const m = makeMatch();
    winRoundByKo(m);

    expect(m.p2.hp).toBe(0);
    expect(m.p2.state).toBe(FighterState.Dead);
    expect(m.phase).toBe('roundEnd');
    expect(m.lastRound).toEqual({ winner: 1, reason: 'ko' });
    expect(m.wins).toEqual([1, 0]);
    expect(m.banner).toBe('K.O.');
  });

  it('回合结束期间双方冻结，不再推进状态', () => {
    const m = makeMatch({ roundEndFrames: 10 });
    winRoundByKo(m);
    const x1 = m.p1.x;
    const frame = m.p2.stateFrame;
    for (let i = 0; i < 5; i++) m.step([makeInput(Btn.Right), makeInput(0)]);
    expect(m.p1.x).toBe(x1);
    expect(m.p2.stateFrame).toBe(frame);
  });

  it('双 KO 算平局，双方都不加胜场', () => {
    const m = makeMatch();
    toFight(m);
    closeIn(m);
    m.p1.hp = 5;
    m.p2.hp = 5;
    m.p1.startMove(KYO.moves['5A']!);
    m.p2.startMove(KYO.moves['5A']!);
    for (let i = 0; i < 20 && m.phase === 'fight'; i++) m.step();

    expect(m.p1.isDead).toBe(true);
    expect(m.p2.isDead).toBe(true);
    expect(m.lastRound).toEqual({ winner: 0, reason: 'double-ko' });
    expect(m.wins).toEqual([0, 0]);
    expect(m.banner).toBe('DOUBLE K.O.');
  });
});

describe('时间到', () => {
  it('按剩余血量比例判胜（不是按绝对值）', () => {
    const m = makeMatch();
    toFight(m);
    m.p1.hp = 800; // 80%
    m.p2.hp = 300; // 30%
    m.timerFrames = 1;
    m.step();

    expect(m.lastRound).toEqual({ winner: 1, reason: 'timeover' });
    expect(m.banner).toBe('TIME UP');
    expect(m.wins).toEqual([1, 0]);
  });

  it('血量比例相同算平局', () => {
    const m = makeMatch();
    toFight(m);
    m.p1.hp = 500;
    m.p2.hp = 500;
    m.timerFrames = 1;
    m.step();
    expect(m.lastRound).toEqual({ winner: 0, reason: 'timeover' });
    expect(m.wins).toEqual([0, 0]);
  });

  it('计时只在 fight 阶段走', () => {
    const m = makeMatch({ introFrames: 5 });
    const before = m.timerFrames;
    m.step();
    expect(m.timerFrames).toBe(before);
    toFight(m);
    m.step();
    expect(m.timerFrames).toBe(before - 1);
  });
});

describe('回合推进', () => {
  it('回合结束后重置血量、位置、状态，进入下一回合演出', () => {
    const m = makeMatch();
    winRoundByKo(m);
    for (let i = 0; i < 3; i++) m.step();

    expect(m.round).toBe(2);
    expect(m.phase).toBe('intro');
    expect(m.p1.hp).toBe(m.p1.maxHp);
    expect(m.p2.hp).toBe(m.p2.maxHp);
    expect(m.p2.state).toBe(FighterState.Idle);
    expect(m.p2.x - m.p1.x).toBeCloseTo(DEFAULT_MATCH.spawnGap, 5);
    expect(m.timerFrames).toBe(DEFAULT_MATCH.roundSeconds * 60);
    expect(m.wins).toEqual([1, 0]);
  });

  it('先赢两回合 → 整场结束，之后不再变化', () => {
    const m = makeMatch();
    winRoundByKo(m);
    for (let i = 0; i < 3; i++) m.step();
    winRoundByKo(m);
    for (let i = 0; i < 3; i++) m.step();

    expect(m.phase).toBe('over');
    expect(m.matchWinner).toBe(1);
    expect(m.wins).toEqual([2, 0]);
    expect(m.banner).toBe(`${KYO.name} WINS`);

    const hash = m.hash();
    for (let i = 0; i < 10; i++) m.step();
    expect(m.hash()).toBe(hash);
  });

  it('P2 也能赢：朝左的判定照常生效', () => {
    const m = makeMatch();
    toFight(m);
    closeIn(m);
    m.p1.hp = 5;
    m.p2.startMove(KYO.moves['5A']!);
    for (let i = 0; i < 20 && m.phase === 'fight'; i++) m.step();
    expect(m.lastRound).toEqual({ winner: 2, reason: 'ko' });
    expect(m.wins).toEqual([0, 1]);
  });
});

describe('HUD 数据模型', () => {
  it('把对局状态翻译成 HUD 模型', () => {
    const m = makeMatch();
    toFight(m);
    m.p1.meter = 50;
    m.p2.combo.hits = 3;
    m.p2.combo.damage = 88;

    const hud = m.toHudModel();
    expect(hud.timer).toBe(99);
    expect(hud.p1.name).toBe(KYO.name);
    expect(hud.p1.maxHp).toBe(KYO.hp);
    expect(hud.p1.meter).toBe(50);
    // 被打的一方是 P2 → 连击属于 P1
    expect(hud.combo).toEqual({ side: 1, hits: 3, damage: 88 });
    expect(hud.banner).toBeUndefined(); // 打斗中没有横幅
  });

  it('KO 后 HUD 里血量为 0 且 ko 标记为真', () => {
    const m = makeMatch();
    winRoundByKo(m);
    const hud = m.toHudModel();
    expect(hud.p2.hp).toBe(0);
    expect(hud.p2.ko).toBe(true);
    expect(hud.p2.wins).toBe(0);
    expect(hud.banner).toBe('K.O.');
  });

  it('胜场会出现在 HUD 里', () => {
    const m = makeMatch();
    winRoundByKo(m);
    expect(m.toHudModel().p1.wins).toBe(1);
  });
});

describe('确定性', () => {
  it('同种子 + 同输入 → 同一时间线', () => {
    const script = (frame: number): [ReturnType<typeof makeInput>, ReturnType<typeof makeInput>] => {
      let a = 0;
      let b = Btn.Left;
      if (frame % 20 < 10) a |= Btn.Right;
      if (frame % 7 === 0) a |= Btn.A;
      if (frame % 13 === 0) b |= Btn.A;
      return [makeInput(a), makeInput(b)];
    };

    const run = (): string => {
      const m = makeMatch({ introFrames: 1 });
      for (let i = 0; i < 240; i++) m.step(script(i));
      return m.hash();
    };

    expect(run()).toBe(run());
  });
});

describe('超必杀起手演出', () => {
  it('起手超必杀会给双方定格并点亮闪光', () => {
    const m = new Match(KYO, IORI, { introFrames: 1, roundEndFrames: 3 }, 11);
    while (m.phase === 'intro') m.step([{ held: 0 }, { held: 0 }]);
    m.p1.meter = 100;
    m.p1.startMove(KYO.moves['236236AC']!);
    m.step([{ held: 0 }, { held: 0 }]);
    expect(m.superFlash).toBe(SUPER_FLASH_FRAMES);
    expect(m.p1.hitstop).toBeGreaterThan(0);
    expect(m.p2.hitstop).toBeGreaterThan(0); // 对手也被定住
  });

  it('普通技/必杀不触发（只有超必杀有演出）', () => {
    const m = new Match(KYO, IORI, { introFrames: 1, roundEndFrames: 3 }, 11);
    while (m.phase === 'intro') m.step([{ held: 0 }, { held: 0 }]);
    m.p1.startMove(KYO.moves['236A']!);
    m.step([{ held: 0 }, { held: 0 }]);
    expect(m.superFlash).toBe(0);
  });

  it('闪光会逐帧衰减到 0', () => {
    const m = new Match(KYO, IORI, { introFrames: 1, roundEndFrames: 3 }, 11);
    while (m.phase === 'intro') m.step([{ held: 0 }, { held: 0 }]);
    m.p1.meter = 100;
    m.p1.startMove(KYO.moves['236236AC']!);
    m.step([{ held: 0 }, { held: 0 }]);
    const start = m.superFlash;
    for (let i = 0; i < SUPER_FLASH_FRAMES + 2; i++) m.step([{ held: 0 }, { held: 0 }]);
    expect(start).toBeGreaterThan(0);
    expect(m.superFlash).toBe(0);
  });

  it('闪光状态进哈希（回放能对齐）', () => {
    const a = new Match(KYO, IORI, { introFrames: 1, roundEndFrames: 3 }, 11);
    a.superFlash = 0;
    const b = new Match(KYO, IORI, { introFrames: 1, roundEndFrames: 3 }, 11);
    b.superFlash = 5;
    expect(a.hash()).not.toBe(b.hash());
  });
});

describe('超必杀运镜', () => {
  it('闪光期间镜头缩放被覆盖，结束后恢复', () => {
    const m = new Match(KYO, IORI, { introFrames: 1, roundEndFrames: 3 }, 17);
    while (m.phase === 'intro') m.step([{ held: 0 }, { held: 0 }]);
    m.p1.meter = 100;
    m.p1.startMove(KYO.moves['236236AC']!);
    m.step([{ held: 0 }, { held: 0 }]);
    expect(m.cam.zoomOverride).toBe(SUPER_CINEMA_ZOOM);

    for (let i = 0; i < SUPER_FLASH_FRAMES + 2; i++) m.step([{ held: 0 }, { held: 0 }]);
    expect(m.cam.zoomOverride).toBeNull();
  });

  it('运镜期间镜头真的朝覆盖值靠近', () => {
    const m = new Match(KYO, IORI, { introFrames: 1, roundEndFrames: 3 }, 17);
    while (m.phase === 'intro') m.step([{ held: 0 }, { held: 0 }]);
    m.p1.x = 250;
    m.p2.x = 270; // 贴脸：正常缩放本来也接近上限，这里只断言"高于 ZOOM_MAX"
    m.p1.meter = 100;
    m.p1.startMove(KYO.moves['236236AC']!);
    for (let i = 0; i < SUPER_FLASH_FRAMES; i++) m.step([{ held: 0 }, { held: 0 }]);
    expect(m.cam.zoom).toBeGreaterThan(1.2);
  });
});
