/**
 * 对局流程：三局两胜、KO/时间到判定、回合重置、镜头与特效的每帧调度。
 *
 * 这是"把各子系统接起来"的那一层：世界推进 → 命中结算 → 推挤 → 镜头 → 特效 → 计时。
 * 顺序固定且确定性（同输入 → 同结果），所以整局可以回放、可以 headless 跑测试。
 */
import type { InputSample } from '../core/input';
import { NO_INPUT } from '../core/input';
import type { CharDef, FxStyle } from '../data/schema';
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
  /** 回合倒计时不递减（训练场用） */
  infiniteTime?: boolean;
  /** 开局两人间距（中心到中心） */
  spawnGap: number;
  /** 组队战换人时的演出帧数（比开局短） */
  swapIntroFrames: number;
}

/** 超必杀起手：闪几帧、双方定格几帧、运镜拉近到多少 */
/** 命中泛色的颜色（按属性；未列出的用白） */
const TINT_COLOR: Partial<Record<FxStyle, string>> = {
  fire: '#ff7a2f',
  darkfire: '#8b3ff2',
  thunder: '#8fe3ff',
  ki: '#9fd0ff',
};

/** KO 演出帧数（44 帧 ≈ 0.7 秒） */
export const KO_CUT_FRAMES = 44;

export const SUPER_FLASH_FRAMES = 12;
export const SUPER_FREEZE_FRAMES = 10;
export const SUPER_CINEMA_ZOOM = 1.85;

/**
 * 超必杀**命中**特写：比起手更狠一档（更近、更白、定格更久）。
 * 起手是"要放大招了"，命中是"打中了"，两者必须看得出来不一样。
 */
export const SUPER_HIT_FRAMES = 14;
export const SUPER_HIT_FREEZE = 8;
export const SUPER_HIT_ZOOM = 2.35;

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

  /**
   * 超必杀起手闪光剩余帧（渲染层读它画白闪）。
   * 放在 Match 上而不是渲染层自己算：它和"双方定格"是同一件事的两面，
   * 分开算迟早对不上（闪完了人还在定，或人动了闪光还在）。
   */
  superFlash = 0;
  /** KO 演出剩余帧：这段时间里中央大字放大、画面压白（44 帧 ≈ 0.7 秒） */
  koCut = 0;
  /** 普通命中后的全屏泛色（帧数与颜色），按招式属性走 */
  hitTintFrames = 0;
  hitTintColor = '#ffffff';

  /** 超必杀命中特写剩余帧（渲染层读它画白闪/集中线） */
  superHit = 0;

  /**
   * 招式名横幅：必杀/超必杀起手的那一帧记下来，播几十帧后自动消失。
   *
   * 放在 Match 而不是渲染层自己猜：渲染层只看得到"当前动作"，
   * 分不清"刚起手"和"同一招放到第 20 帧"，会每帧重播。
   */
  moveBanner: { name: string; kind: 'special' | 'super'; frames: number; total: number; side: 1 | 2 } | null = null;
  /** 上一帧两人在放什么招（用来判断"刚起手"） */
  private lastMoveIds: [string, string] = ['', ''];
  /** 这次超必杀是否已经触发过命中特写（多段超必杀只演一次） */
  private superHitFired = true;

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
    // 闪光逐帧衰减：放在最前面，保证"起手那一帧设成满值、下一帧开始掉"
    if (this.superFlash > 0) this.superFlash--;
    if (this.hitTintFrames > 0) this.hitTintFrames--;
    if (this.koCut > 0) this.koCut--;
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

  /** 招式横幅：新起手就记一条，其余帧只衰减 */
  private stepMoveBanner(): void {
    const pair: [typeof this.p1, typeof this.p2] = [this.p1, this.p2];
    for (let i = 0; i < 2; i++) {
      const f = pair[i]!;
      const id = f.move?.id ?? '';
      const isNew = id !== '' && id !== this.lastMoveIds[i];
      if (isNew && f.move && (f.move.kind === 'special' || f.move.kind === 'super')) {
        const kind = f.move.kind;
        const total = kind === 'super' ? 72 : 48;
        this.moveBanner = { name: f.move.name, kind, frames: total, total, side: i === 0 ? 1 : 2 };
      }
      this.lastMoveIds[i] = id;
    }
    if (this.moveBanner) {
      this.moveBanner.frames--;
      if (this.moveBanner.frames <= 0) this.moveBanner = null;
    }
  }

  private stepFight(inputs: readonly [InputSample, InputSample]): void {
    this.faceOff();
    this.world.step([inputs[0], inputs[1]]);
    this.checkSuperFlash();
    this.stepMoveBanner();
    this.lastHits = [...resolveCombat(this.world, this.fighters), ...resolveProjectiles(this.world, this.fighters)];
    this.world.sweep();
    this.applyHitEffects(this.lastHits);
    resolvePushAll(this.fighters);
    this.stepSpectators();

    if (this.phase !== 'fight') return; // 命中里可能已经结束回合
    // 训练场关掉倒计时：练招式时不被打断
    if (this.config.infiniteTime === true) return;
    if (this.p1.isDead || this.p2.isDead) {
      this.finishRound(this.p1.isDead && this.p2.isDead ? 'double-ko' : 'ko');
      return;
    }
    this.timerFrames--;
    if (this.timerFrames <= 0) this.finishRound('timeover');
  }

  /**
   * 超必杀起手演出：给双方一段定格 + 屏幕上闪一层光。
   *
   * 判据是"这一帧刚刚起手超必杀"（moveFrame === 0），所以只触发一次；
   * 定格直接复用命中停顿（`addHitstop`），不需要新的冻结机制。
   */
  private checkSuperFlash(): void {
    const started = this.fighters.filter((f) => f.justStartedMove !== null);
    // 不管触没触发演出，标记都要清掉：它只表示"这一帧刚起手"
    for (const f of this.fighters) f.justStartedMove = null;
    if (this.superFlash > 0) return;

    // 普通必杀起手：属性色的冲击环 + 轻微震屏（没有定格，不能抢超必杀的戏）
    const special = started.find((f) => f.move?.kind === 'special');
    if (!started.some((f) => f.move?.kind === 'super')) {
      if (!special) return;
      // 起手点在角色身前一点：贴在拳/脚出手的位置，而不是身体中心
      this.fx.spawnImpact(special.x + special.facing * 12, special.y - 38, {
        style: special.move?.fx ?? 'none',
        dir: special.facing,
      });
      this.cam.shake(3, 1.2);
      return;
    }

    this.superFlash = SUPER_FLASH_FRAMES;
    this.superHitFired = false; // 这一发还没演过命中特写
    this.cam.shake(SUPER_FLASH_FRAMES, 3.5);
    for (const f of this.fighters) f.addHitstop(SUPER_FREEZE_FRAMES);
    // 起手那一帧在角色身上炸一圈冲击（特效层是确定性的，回放一致）
    const caster = started.find((f) => f.move?.kind === 'super');
    if (caster) {
      this.fx.spawnImpact(caster.x, caster.y - 40, { heavy: true, dir: caster.facing });
      this.cinemaFocus = caster.x;
    }
    this.world.emit('superstart', {});
  }

  /** 镜头与特效：（回合结束/结算里也要走，画面才不僵） */
  private stepSpectators(): void {
    if (this.superHit > 0) this.superHit--;
    // 运镜：起手推向施术者，命中推向挨打那边（焦点跟着事件走才像"镜头在跟"）
    if (this.superHit > 0) {
      this.cam.zoomOverride = SUPER_HIT_ZOOM;
    } else if (this.superFlash > 0) {
      this.cam.zoomOverride = SUPER_CINEMA_ZOOM;
    } else {
      this.cam.zoomOverride = null;
    }
    // 演出结束后必须交还焦点，否则镜头会一直停在刚才那个人身上
    if (this.superFlash === 0 && this.superHit === 0) this.cinemaFocus = null;
    this.cam.focusX = this.cinemaFocus;
    this.cam.update(this.p1, this.p2);
    this.fx.update();
  }

  /** 运镜焦点：超必杀期间指向当事人，平时为 null（跟着两人中点） */
  private cinemaFocus: number | null = null;

  private applyHitEffects(hits: readonly HitResolution[]): void {
    for (const h of hits) {
      // 冲击方向：从攻击方指向被打方（火花朝被打的方向甩，看起来才是"被打了"）
      const dir: 1 | -1 = h.defender.x >= h.attacker.x ? 1 : -1;
      if (h.kind === 'block') {
        this.fx.spawnGuard(h.x, h.y, h.style);
        // 防御也有冲击帧，但要明显比打中弱（否则分不清挡住了还是被打中）
        this.fx.spawnImpact(h.x, h.y, { style: h.style, dir });
        this.cam.shake(3, 1); // 防御也要"顶一下"，否则看不出挡住了
      } else {
        // 普通命中：按属性给一层极短的全屏泛色（2~3 帧）。
        // 这是"打到了"最直接的体感——不用看清粒子，余光就能感受到。
        // 超必杀不叠（它自己那套闪白 + 集中线强得多，叠上去只会糊成一片）。
        if (h.attacker.move?.kind !== 'super') {
          this.hitTintFrames = 3;
          this.hitTintColor = TINT_COLOR[h.style] ?? '#ffffff';
        }
        // 超必杀的第一下命中：演一次"打击特写"（多段超必杀只演一次）
        if (h.attacker.move?.kind === 'super' && !this.superHitFired) {
          this.superHitFired = true;
          this.superHit = SUPER_HIT_FRAMES;
          this.cinemaFocus = h.defender.x;
          this.cam.shake(SUPER_HIT_FRAMES, 6.5);
          this.p1.addHitstop(SUPER_HIT_FREEZE);
          this.p2.addHitstop(SUPER_HIT_FREEZE);
          this.world.emit('superhit', { x: h.x, y: h.y });
        }
        // 必杀命中一律按重击规模演出：必杀的伤害不一定到 60，但打击感必须是重的那一档
        const special = h.attacker.move?.kind === 'special' || h.attacker.move?.kind === 'super';
        const heavy = h.hit.damage >= 60 || special;
        this.fx.spawnHit(h.x, h.y, { heavy, counter: h.counter, style: h.style });
        this.fx.spawnImpact(h.x, h.y, { heavy, counter: h.counter, style: h.style, dir });
        // 震屏：重击更狠，反击再加一点
        this.cam.shake(heavy ? 8 : 5, (heavy ? 3 : 1.6) + (h.counter ? 0.8 : 0));
      }
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

    // KO 演出：定格 + 大字放大，让"结束"有一下停顿（TIME UP / 双 KO 也走）
    this.koCut = KO_CUT_FRAMES;
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

  /**
   * 主动换人（残血撤退）：把某一侧换成下一个角色，并走一次换人演出。
   *
   * 为什么放在 Match 而不是 AI：换人要动 indexes、重建角色、重置回合计时，
   * 这些都是 Match 的内部状态；让 AI 直接改会绕过一堆不变量。
   * AI 只负责"什么时候按下这个按钮"。
   *
   * 返回 false = 没有队友可换（已经是最后一人）。
   */
  tagOut(side: 1 | 2): boolean {
    if (this.phase === 'over') return false;
    if (!this.hasNext(side)) return false;
    this.indexes[side - 1]++;
    this.startTeamRound([side]);
    return true;
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

  /** 清空运镜/特写状态（回合开始、换人时都要清，否则会带着上一场的镜头） */
  private resetCinema(): void {
    this.superFlash = 0;
    this.moveBanner = null;
    this.lastMoveIds = ['', ''];
    this.superHit = 0;
    this.superHitFired = true;
    this.cinemaFocus = null;
    this.cam.zoomOverride = null;
    this.cam.focusX = null;
  }

  /** 回合开始：位置/血量/状态复位，镜头立即对齐，进入 ROUND 演出 */
  private startRound(): void {
    this.resetCinema();
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
      koCut: this.koCut,
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
    // indexes（组队战换到第几个人）必须进哈希：否则"人换了但状态一样"会被判成同一场
    return `${this.world.hash()}|${this.phase}|${this.round}|${this.wins.join(',')}|${this.indexes.join(',')}|${this.timerFrames}|${this.superFlash}`;
  }
}
