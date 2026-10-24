/**
 * 对局流程：三局两胜、KO/时间到判定、回合重置、镜头与特效的每帧调度。
 *
 * 这是"把各子系统接起来"的那一层：世界推进 → 命中结算 → 推挤 → 镜头 → 特效 → 计时。
 * 顺序固定且确定性（同输入 → 同结果），所以整局可以回放、可以 headless 跑测试。
 */
import type { InputSample } from '../core/input';
import { NO_INPUT } from '../core/input';
import type { CharDef } from '../data/schema';
import { Camera } from '../sim/camera';
import { METER_MAX, STAGE_LEFT, STAGE_RIGHT } from '../sim/constants';
import { Fighter } from '../sim/fighter';
import { resolveCombat, resolveProjectiles, type HitResolution } from '../sim/hit';
import { resolvePushAll } from '../sim/physics';
import { FighterState, canAct } from '../sim/state';
import { TICK_RATE, World } from '../sim/world';
import { FxSystem } from '../render/fx';
import type { HudModel, PlayerHud } from '../render/hud';

export type MatchPhase = 'intro' | 'fight' | 'roundEnd' | 'over';
export type RoundEndReason = 'ko' | 'timeover' | 'double-ko';

export interface RoundResult {
  /** 1 = P1 赢，2 = P2 赢，0 = 平局（双 KO / 时间到同血量） */
  winner: 0 | 1 | 2;
  reason: RoundEndReason;
}

export interface MatchConfig {
  /** 先赢几回合算赢下整场（KOF97 三局两胜 = 2） */
  roundsToWin: number;
  roundSeconds: number;
  /** 开局"ROUND 1"演出帧数 */
  introFrames: number;
  /** KO / TIME UP 后的停顿帧数 */
  roundEndFrames: number;
  /** 开局两人间距（中心到中心） */
  spawnGap: number;
  /** 组队战换人时的演出帧数（比开局短） */
  swapIntroFrames: number;
}

export const DEFAULT_MATCH: MatchConfig = {
  roundsToWin: 2,
  roundSeconds: 99,
  introFrames: 48,
  roundEndFrames: 90,
  spawnGap: 96,
  swapIntroFrames: 30,
};

export class Match {
  readonly world: World;
  readonly p1: Fighter;
  readonly p2: Fighter;
  readonly cam = new Camera();
  readonly fx: FxSystem;
  readonly config: MatchConfig;

  phase: MatchPhase = 'intro';
  /** 第几回合（从 1 开始） */
  round = 1;
  wins: [number, number] = [0, 0];
  /** 本回合剩余帧数 */
  timerFrames: number;
  /** 整场赢家（0 = 还没分出） */
  matchWinner: 0 | 1 | 2 = 0;
  lastRound: RoundResult | null = null;
  /** 队伍（单人模式就是长度 1 的数组） */
  readonly teams: [readonly CharDef[], readonly CharDef[]];
  /** 双方当前用到队伍里的第几个 */
  indexes: [number, number] = [0, 0];
  /** 本帧发生的命中（给特效/音效/连击显示） */
  lastHits: HitResolution[] = [];

  private introLeft: number;
  private endLeft = 0;

  constructor(
    c1: CharDef | readonly CharDef[],
    c2: CharDef | readonly CharDef[],
    config: Partial<MatchConfig> = {},
    seed = 0x970317,
  ) {
    this.config = { ...DEFAULT_MATCH, ...config };
    this.world = new World(seed);
    this.teams = [Array.isArray(c1) ? [...c1] : [c1 as CharDef], Array.isArray(c2) ? [...c2] : [c2 as CharDef]];

    const center = (STAGE_LEFT + STAGE_RIGHT) / 2;
    const half = this.config.spawnGap / 2;
    this.p1 = this.world.add(new Fighter(this.teams[0][0]!, { x: center - half, facing: 1 }));
    this.p2 = this.world.add(new Fighter(this.teams[1][0]!, { x: center + half, facing: -1 }));
    // 互相知道对方：投技要判距离、镜头要判朝向
    this.p1.opponent = this.p2;
    this.p2.opponent = this.p1;
    this.fx = new FxSystem(this.world.rng);

    this.timerFrames = this.config.roundSeconds * TICK_RATE;
    this.introLeft = this.config.introFrames;
    this.cam.snap(this.p1, this.p2);
  }

  get fighters(): readonly Fighter[] {
    return [this.p1, this.p2];
  }

  /** HUD 用的剩余秒数 */
  get timerSeconds(): number {
    return Math.ceil(this.timerFrames / TICK_RATE);
  }

  get banner(): string {
    if (this.phase === 'intro') return `ROUND ${this.round}`;
    if (this.phase === 'over') {
      if (this.matchWinner === 0) return 'DRAW GAME';
      return `${this.matchWinner === 1 ? this.p1.char.name : this.p2.char.name} WINS`;
    }
    if (this.phase === 'roundEnd' && this.lastRound) {
      if (this.lastRound.reason === 'double-ko') return 'DOUBLE K.O.';
      return this.lastRound.reason === 'ko' ? 'K.O.' : 'TIME UP';
    }
    return '';
  }

  /** 推进一帧。`inputs` 分别是 P1/P2 的原始输入。 */
  step(inputs: readonly [InputSample, InputSample] = [NO_INPUT, NO_INPUT]): void {
    switch (this.phase) {
      case 'intro':
        this.introLeft--;
        if (this.introLeft <= 0) {
          this.phase = 'fight';
          this.timerFrames = this.config.roundSeconds * TICK_RATE;
        }
        break;

      case 'fight':
        this.stepFight(inputs);
        break;

      case 'roundEnd':
        this.endLeft--;
        this.stepSpectators();
        if (this.endLeft <= 0) this.advanceRound();
        break;

      case 'over':
        this.stepSpectators();
        break;
    }
  }

  private stepFight(inputs: readonly [InputSample, InputSample]): void {
    this.faceOff();
    this.world.step([inputs[0], inputs[1]]);
    this.lastHits = [...resolveCombat(this.world, this.fighters), ...resolveProjectiles(this.world, this.fighters)];
    this.world.sweep();
    this.applyHitEffects(this.lastHits);
    resolvePushAll(this.fighters);
    this.stepSpectators();

    if (this.phase !== 'fight') return; // 命中里可能已经结束回合
    if (this.p1.isDead || this.p2.isDead) {
      this.finishRound(this.p1.isDead && this.p2.isDead ? 'double-ko' : 'ko');
      return;
    }
    this.timerFrames--;
    if (this.timerFrames <= 0) this.finishRound('timeover');
  }

  /** 镜头与特效：（回合结束/结算里也要走，画面才不僵） */
  private stepSpectators(): void {
    this.cam.update(this.p1, this.p2);
    this.fx.update();
  }

  private applyHitEffects(hits: readonly HitResolution[]): void {
    for (const h of hits) {
      if (h.kind === 'block') this.fx.spawnGuard(h.x, h.y);
      else this.fx.spawnHit(h.x, h.y, { heavy: h.hit.damage >= 60, counter: h.counter });
    }
  }

  private finishRound(reason: RoundEndReason): void {
    if (this.phase !== 'fight') return;

    let winner: 0 | 1 | 2;
    if (reason === 'double-ko') winner = 0;
    else if (this.p2.isDead) winner = 1;
    else if (this.p1.isDead) winner = 2;
    else {
      const r1 = this.p1.hp / this.p1.maxHp;
      const r2 = this.p2.hp / this.p2.maxHp;
      winner = r1 > r2 ? 1 : r2 > r1 ? 2 : 0;
    }

    this.lastRound = { winner, reason };
    if (winner === 1) this.wins[0]++;
    if (winner === 2) this.wins[1]++;
    this.phase = 'roundEnd';
    this.endLeft = this.config.roundEndFrames;
  }

  /** 组队战：某一侧还有后备角色吗 */
  hasNext(side: 1 | 2): boolean {
    return this.indexes[side - 1] + 1 < this.teams[side - 1].length;
  }

  /** 某一侧还剩几个人（含当前上场者），给 HUD 画小方块 */
  teamLeft(side: 1 | 2): number {
    return this.teams[side - 1].length - this.indexes[side - 1];
  }

  get teamMode(): boolean {
    return this.teams[0].length > 1 || this.teams[1].length > 1;
  }

  private advanceRound(): void {
    if (this.teamMode) {
      this.advanceTeamRound();
      return;
    }
    if (this.wins[0] >= this.config.roundsToWin || this.wins[1] >= this.config.roundsToWin) {
      this.phase = 'over';
      this.matchWinner = this.wins[0] > this.wins[1] ? 1 : this.wins[1] > this.wins[0] ? 2 : 0;
      return;
    }
    this.round++;
    this.startRound();
  }

  /**
   * 组队战换人：输的一方换下一个角色（满血），赢的一方**保留剩余血量**、
   * 双方回到起始位置，计时重置，播一段短的换人演出。
   * 平局（双 KO / 时间到同血）两边同时换人。
   */
  private advanceTeamRound(): void {
    const winner = this.lastRound?.winner ?? 0;
    // 平局（双 KO / 时间到同血）两边都算输，都要换人
    const losers: (1 | 2)[] = winner === 0 ? [1, 2] : [winner === 1 ? 2 : 1];

    const eliminated: (1 | 2)[] = [];
    for (const side of losers) {
      if (this.hasNext(side)) this.indexes[side - 1]++;
      else eliminated.push(side);
    }

    if (eliminated.length > 0) {
      this.phase = 'over';
      this.matchWinner = eliminated.length === 2 ? 0 : eliminated[0] === 1 ? 2 : 1;
      return;
    }

    this.round++;
    this.startTeamRound(losers);
  }

  /** 换人后的下一回合：赢家留血，输家换将 */
  private startTeamRound(losers: readonly (1 | 2)[]): void {
    const center = (STAGE_LEFT + STAGE_RIGHT) / 2;
    const half = this.config.spawnGap / 2;

    if (losers.includes(1)) {
      this.p1.switchChar(this.teams[0][this.indexes[0]]!, { x: center - half, facing: 1, keepMeter: true });
    } else {
      this.p1.reset({ x: center - half, facing: 1, keepMeter: true, keepHp: true });
    }
    if (losers.includes(2)) {
      this.p2.switchChar(this.teams[1][this.indexes[1]]!, { x: center + half, facing: -1, keepMeter: true });
    } else {
      this.p2.reset({ x: center + half, facing: -1, keepMeter: true, keepHp: true });
    }

    this.cam.snap(this.p1, this.p2);
    this.fx.clear();
    this.timerFrames = this.config.roundSeconds * TICK_RATE;
    this.introLeft = this.config.swapIntroFrames;
    this.phase = 'intro';
    this.lastHits = [];
  }

  /** 回合开始：位置/血量/状态复位，镜头立即对齐，进入 ROUND 演出 */
  private startRound(): void {
    const center = (STAGE_LEFT + STAGE_RIGHT) / 2;
    const half = this.config.spawnGap / 2;
    this.p1.reset({ x: center - half, facing: 1 });
    this.p2.reset({ x: center + half, facing: -1 });
    this.cam.snap(this.p1, this.p2);
    this.fx.clear();
    this.timerFrames = this.config.roundSeconds * TICK_RATE;
    this.introLeft = this.config.introFrames;
    this.phase = 'intro';
    this.lastHits = [];
  }

  /**
   * 两人面对面：只在中立且站在地上时自动转身。
   * 跳过对方头顶落地后如果还背对着打，手感会很怪，KOF 是自动转的。
   */
  private faceOff(): void {
    const a = this.p1;
    const b = this.p2;
    const canTurn = (f: Fighter): boolean => !f.airborne && !f.isAttacking && canAct(f.state);
    if (!canTurn(a) || !canTurn(b)) return;
    if (a.x < b.x) {
      a.facing = 1;
      b.facing = -1;
    } else if (a.x > b.x) {
      a.facing = -1;
      b.facing = 1;
    }
  }

  /** 整场重来（打完一场之后按 R / 点"重开"） */
  restart(): void {
    this.wins = [0, 0];
    this.round = 1;
    this.matchWinner = 0;
    this.lastRound = null;
    this.startRound();
  }

  /**
   * 训练模式用：原地重开一回合（不播演出、不改胜场、不换回合号）。
   * 训练模式里 KO 不该推进流程，所以需要这个"只把人和血条摆回原位"的入口。
   */
  softReset(): void {
    const center = (STAGE_LEFT + STAGE_RIGHT) / 2;
    const half = this.config.spawnGap / 2;
    this.p1.reset({ x: center - half, facing: 1 });
    this.p2.reset({ x: center + half, facing: -1 });
    this.cam.snap(this.p1, this.p2);
    this.fx.clear();
    this.timerFrames = this.config.roundSeconds * TICK_RATE;
    this.phase = 'fight';
    this.lastRound = null;
    this.lastHits = [];
  }

  /** 给 HUD 的数据模型（HUD 不认识 Fighter，只认这个） */
  toHudModel(): HudModel {
    const comboOf = (defender: Fighter, side: 1 | 2): HudModel['combo'] => {
      if (defender.combo.hits < 2) return undefined;
      return { side, hits: defender.combo.hits, damage: defender.combo.damage };
    };
    return {
      timer: this.timerSeconds,
      p1: this.playerHud(this.p1, 1),
      p2: this.playerHud(this.p2, 2),
      combo: comboOf(this.p2, 1) ?? comboOf(this.p1, 2),
      banner: this.banner || undefined,
    };
  }

  private playerHud(f: Fighter, side: 1 | 2): PlayerHud {
    return {
      name: f.char.name,
      hp: f.hp,
      maxHp: f.maxHp,
      meter: f.meter,
      maxMeter: METER_MAX,
      teamLeft: this.teamLeft(side),
      wins: this.wins[side - 1]!,
      ko: f.state === FighterState.Dead,
      maxMode: f.maxMode > 0,
      trail: f.combo.hits > 0 ? Math.min(1, f.hp / f.maxHp + 0.12) : undefined,
    };
  }

  /** 状态指纹（确定性断言用） */
  hash(): string {
    return `${this.world.hash()}|${this.phase}|${this.round}|${this.wins.join(',')}|${this.timerFrames}`;
  }
}
