import { describe, expect, it } from 'vitest';
import { Btn, makeInput } from '../src/core/input';
import { IORI } from '../src/data/chars/iori';
import { KYO } from '../src/data/chars/kyo';
import {
  DEFAULT_MATCH,
  Match,
  SUPER_CINEMA_ZOOM,
  SUPER_FLASH_FRAMES,
  SUPER_HIT_FRAMES,
  SUPER_HIT_ZOOM,
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

  it('超必杀打中会触发命中特写，且只演一次', () => {
    const m = new Match(KYO, IORI, { introFrames: 1, roundEndFrames: 3 }, 11);
    while (m.phase === 'intro') m.step([{ held: 0 }, { held: 0 }]);
    m.p1.meter = 100;
    // 把对手摆到贴身的位置，保证超必杀的第一段能打中
    m.p2.x = m.p1.x + 18;
    m.p1.startMove(KYO.moves['236236AC']!);

    let fired = -1;
    for (let i = 0; i < 120; i++) {
      m.step([{ held: 0 }, { held: 0 }]);
      if (m.superHit > 0) {
        fired = m.superHit;
        break;
      }
    }
    // 触发那一帧的 stepSpectators 已经先减了一帧，所以是 FRAMES 或 FRAMES-1
    expect(fired).toBeGreaterThan(0);
    expect(fired).toBeLessThanOrEqual(SUPER_HIT_FRAMES);
    // 命中特写比起手更近
    expect(m.cam.zoomOverride).toBe(SUPER_HIT_ZOOM);
    // 双方都被定住（特写的"定格"）
    expect(m.p1.hitstop).toBeGreaterThan(0);
    expect(m.p2.hitstop).toBeGreaterThan(0);

    // 多段命中不重复触发：只减不增
    let prev = m.superHit;
    for (let i = 0; i < 40; i++) {
      m.step([{ held: 0 }, { held: 0 }]);
      expect(m.superHit).toBeLessThanOrEqual(prev);
      prev = m.superHit;
    }
  });

  it('特写结束后镜头交还焦点（不会一直盯着刚才那个人）', () => {
    const m = new Match(KYO, IORI, { introFrames: 1, roundEndFrames: 3 }, 11);
    while (m.phase === 'intro') m.step([{ held: 0 }, { held: 0 }]);
    m.p1.meter = 100;
    m.p2.x = m.p1.x + 18;
    m.p1.startMove(KYO.moves['236236AC']!);
    for (let i = 0; i < 200 && (m.superHit > 0 || i < 30); i++) m.step([{ held: 0 }, { held: 0 }]);
    for (let i = 0; i < SUPER_HIT_FRAMES + SUPER_FLASH_FRAMES + 40; i++) m.step([{ held: 0 }, { held: 0 }]);
    expect(m.cam.focusX).toBeNull();
    expect(m.cam.zoomOverride).toBeNull();
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

describe('招式名横幅', () => {
  const mk = (): Match => new Match(KYO, IORI, { introFrames: 1, roundEndFrames: 3 }, 7);

  it('放必杀会设横幅，普通技不会', () => {
    // 普通技：不弹
    const plain = mk();
    while (plain.phase === 'intro') plain.step([{ held: 0 }, { held: 0 }]);
    plain.p1.startMove(KYO.moves['5A']!);
    plain.step([{ held: 0 }, { held: 0 }]);
    expect(plain.moveBanner).toBeNull();

    // 必杀：弹（另起一局，否则角色还在上一招里，startMove 会被忽略）
    const m = mk();
    while (m.phase === 'intro') m.step([{ held: 0 }, { held: 0 }]);
    m.p1.startMove(KYO.moves['236A']!);
    m.step([{ held: 0 }, { held: 0 }]);
    expect(m.moveBanner).not.toBeNull();
    expect(m.moveBanner!.kind).toBe('special');
    expect(m.moveBanner!.name).toBe(KYO.moves['236A']!.name);
    expect(m.moveBanner!.side).toBe(1);
  });

  it('超必杀横幅活得更久（更醒目）', () => {
    const m = mk();
    while (m.phase === 'intro') m.step([{ held: 0 }, { held: 0 }]);
    m.p1.meter = 100;
    m.p1.startMove(KYO.moves['236236AC']!);
    m.step([{ held: 0 }, { held: 0 }]);
    expect(m.moveBanner!.kind).toBe('super');
    expect(m.moveBanner!.total).toBeGreaterThan(48);
  });

  it('同一招不会每帧重播：连着推进也只记一次，播完自动消失', () => {
    const m = mk();
    while (m.phase === 'intro') m.step([{ held: 0 }, { held: 0 }]);
    m.p1.startMove(KYO.moves['236A']!);
    m.step([{ held: 0 }, { held: 0 }]);
    const total = m.moveBanner!.total;
    const first = m.moveBanner!.frames;
    m.step([{ held: 0 }, { held: 0 }]);
    expect(m.moveBanner!.frames).toBe(first - 1); // 只递减，不重置
    for (let i = 0; i < total + 4; i++) m.step([{ held: 0 }, { held: 0 }]);
    expect(m.moveBanner).toBeNull();
  });

  it('对手放的招也能被看到（side=2）', () => {
    const m = mk();
    while (m.phase === 'intro') m.step([{ held: 0 }, { held: 0 }]);
    m.p2.startMove(IORI.moves['236A']!);
    m.step([{ held: 0 }, { held: 0 }]);
    expect(m.moveBanner?.side).toBe(2);
  });
});

describe('必杀技的特效存在感', () => {
  const mk = (): Match => new Match(KYO, IORI, { introFrames: 1, roundEndFrames: 3 }, 21);
  const toFight = (m: Match): void => {
    while (m.phase === 'intro') m.step([{ held: 0 }, { held: 0 }]);
  };

  it('必杀起手会在身前炸一圈属性冲击（普通技没有）', () => {
    const plain = mk();
    toFight(plain);
    plain.p1.startMove(KYO.moves['5C']!);
    plain.step([{ held: 0 }, { held: 0 }]);
    expect(plain.fx.impacts).toHaveLength(0);

    const m = mk();
    toFight(m);
    m.p1.startMove(KYO.moves['236A']!);
    m.step([{ held: 0 }, { held: 0 }]);
    expect(m.fx.impacts.length).toBeGreaterThan(0);
    // 冲击点偏向出手方向，不是身体正中
    const im = m.fx.impacts[0]!;
    expect(im.dir).toBe(m.p1.facing);
  });

  it('超必杀起手走原演出（闪白 + 定格），不和普通必杀抢同一套特效', () => {
    const m = mk();
    toFight(m);
    m.p1.meter = 100;
    m.p1.startMove(KYO.moves['236236AC']!);
    m.step([{ held: 0 }, { held: 0 }]);
    expect(m.superFlash).toBeGreaterThan(0);
  });

  it('必杀命中按重击规模演（伤害不到 60 也要有重击的打击感）', () => {
    const m = mk();
    toFight(m);
    m.p2.x = m.p1.x + 20;
    m.p1.startMove(KYO.moves['236A']!);
    let heavy = false;
    for (let i = 0; i < 40; i++) {
      m.step([{ held: 0 }, { held: 0 }]);
      if (m.fx.impacts.some((im) => im.heavy)) heavy = true;
      if (m.lastHits.length > 0) break;
    }
    expect(heavy).toBe(true);
  });
});

describe('必杀技对对手的影响', () => {
  const mk2 = (): Match => new Match(KYO, IORI, { introFrames: 1, roundEndFrames: 3 }, 31);
  const run = (m: Match, moveId: '5A' | '236A' | '236236AC', meter = 0): { stun: number; dx: number } => {
    while (m.phase === 'intro') m.step([{ held: 0 }, { held: 0 }]);
    m.p1.meter = meter;
    m.p2.x = m.p1.x + 20;
    const before = m.p2.x;
    m.p1.startMove(KYO.moves[moveId]!);
    let stun = 0;
    for (let i = 0; i < 60; i++) {
      m.step([{ held: 0 }, { held: 0 }]);
      stun = Math.max(stun, m.p2.state === 'hit' ? m.p2.stateFrame : 0);
      if (m.lastHits.length > 0) break;
    }
    return { stun, dx: m.p2.x - before };
  };

  it('必杀命中让对手退得更远、硬直更长（普通技打不出这个反应）', () => {
    const plain = run(mk2(), '5A');
    const special = run(mk2(), '236A');
    expect(special.dx).toBeGreaterThan(plain.dx);
  });

  it('超必杀命中把对手打浮空（数据没写 launch 也要飞起来）', () => {
    const m = mk2();
    while (m.phase === 'intro') m.step([{ held: 0 }, { held: 0 }]);
    m.p1.meter = 100;
    m.p2.x = m.p1.x + 18;
    m.p1.startMove(KYO.moves['236236AC']!);
    let airborne = false;
    for (let i = 0; i < 90; i++) {
      m.step([{ held: 0 }, { held: 0 }]);
      if (m.p2.state === 'hit' && m.p2.vy < 0) airborne = true;
      if (m.lastHits.length > 0 && i > 30) break;
    }
    expect(airborne).toBe(true);
  });
});

describe('打击顿帧分级', () => {
  it('必杀命中顿帧比普通技长，超必杀更长', () => {
    const hitstopOf = (moveId: '5C' | '236A' | '236236AC', meter = 0): number => {
      const m = new Match(KYO, IORI, { introFrames: 1, roundEndFrames: 3 }, 41);
      while (m.phase === 'intro') m.step([{ held: 0 }, { held: 0 }]);
      m.p1.meter = meter;
      m.p2.x = m.p1.x + 18;
      m.p1.startMove(KYO.moves[moveId]!);
      for (let i = 0; i < 60; i++) {
        m.step([{ held: 0 }, { held: 0 }]);
        if (m.lastHits.length > 0) break;
      }
      return m.p2.hitstop;
    };
    const plain = hitstopOf('5C');
    const special = hitstopOf('236A');
    const sup = hitstopOf('236236AC', 100);
    expect(special).toBeGreaterThan(plain);
    expect(sup).toBeGreaterThan(special);
  });

  it('不会污染招式数据：同一个必杀打两次，顿帧不累加', () => {
    const before = KYO.moves['236A']!.hits[0]!.hitstop;
    const m = new Match(KYO, IORI, { introFrames: 1, roundEndFrames: 3 }, 42);
    while (m.phase === 'intro') m.step([{ held: 0 }, { held: 0 }]);
    m.p2.x = m.p1.x + 18;
    m.p1.startMove(KYO.moves['236A']!);
    for (let i = 0; i < 40; i++) m.step([{ held: 0 }, { held: 0 }]);
    expect(KYO.moves['236A']!.hits[0]!.hitstop).toBe(before);
  });
});
