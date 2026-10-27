/**
 * 角色实体：状态机 + 帧推进 + 体感物理。
 *
 * 分工：**招式数据说什么，这里就只做什么**——不给角色写死任何"特殊动作"，
 * 所有招式都走 `startMove()`，靠 `MoveDef` 的帧数据驱动。
 * 命中判定/伤害结算在 `hit.ts`（调用这里的 `enterHitstun()` 等入口），
 * 推挤与镜头在后续条目里补。
 */
import type { InputState } from '../core/input';
import { Btn, axisX, axisY } from '../core/input';
import type { Box, CharDef, FxStyle, HitDef, MoveDef } from '../data/schema';
import { newCombo, type ComboState } from './combo';
/** 命中抖动帧数（被打方左右抖） */
const HIT_SHAKE_FRAMES = 3;
/** 摔地后的反弹初速（负 = 向上），约 5px 高、8 帧滞空 */
const KNOCKDOWN_BOUNCE_VY = 1.6;
/** 被打飞时的角速度（弧度/帧）：滞空约 30 帧 ≈ 一圈，太多会像电风扇 */
const SPIN_VEL = 0.22;

import {
  GROUND_Y,
  METER_MAX,
  JUMP_CUT_FRAMES,
  KNOCKDOWN_FRAMES,
  MAX_MODE_FRAMES,
  MAX_MODE_METER,
  QUICK_WAKEUP_MIN,
  WAKEUP_FRAMES,
} from './constants';
import { DEFAULT_PUSH_WIDTH, clampStageX, integrateAir } from './physics';
import { FighterState, canAct, type FighterState as StateName } from './state';
import type { Entity, World } from './world';
import type { Hasher } from '../core/hash';
import { FighterControls, acceptsMoveInput } from './controls';
import { spawnProjectile } from './projectile';

export interface FighterInit {
  x?: number;
  facing?: 1 | -1;
  hp?: number;
}

/** 冻结期间缓存的指令能保留几帧（KOF 的输入缓冲约 4~8 帧） */
const INPUT_BUFFER_FRAMES = 8;

export class Fighter implements Entity {
  id = -1;
  /** 当前角色（组队战换人时会被替换） */
  char: CharDef;

  x: number;
  y = GROUND_Y;
  vx = 0;
  vy = 0;
  facing: 1 | -1;

  hp: number;
  maxHp: number;
  /** 气槽（KOF97 满槽用 MAX 模式，具体上限见后续条目） */
  meter = 0;
  /** 气绝值，攒满进晕眩 */
  stunGauge = 0;
  /** 削防值，攒满进崩防 */
  guardGauge = 0;
  /** MAX 模式剩余帧（> 0 时攻击力提升） */
  maxMode = 0;
  /** 自己正在承受的连段（连击数/累计伤害），恢复中立时清零 */
  combo: ComboState = newCombo();

  state: StateName = FighterState.Idle;
  /** 当前状态已持续的帧数（进入状态那帧为 0，第一步之后为 1） */
  stateFrame = 0;

  /** 当前招式（state === 'attack' 时非空） */
  move: MoveDef | null = null;
  moveFrame = 0;
  /** 本招式已经被用掉的判定 id（同一段不会重复命中同一目标） */
  readonly usedHits = new Set<string>();

  /** 命中停顿剩余帧：> 0 时本角色整帧冻结（不推进状态、不受输入） */
  hitstop = 0;
  /** 受击/防御/倒地的剩余帧 */
  stunTimer = 0;
  /** 空中招式落地硬直 */
  landLag = 0;
  airborne = false;
  /** 命中后身上残留的属性特效帧数（火/雷/气），0 = 无 */
  burnFrames = 0;
  /** 命中抖动剩余帧（渲染层据此左右抖 1px，让"打到了"有物理感） */
  hitShake = 0;
  /** 这次摔倒已经弹过一次了（只弹一次，不然像皮球） */
  bounced = false;
  /** 被打飞时的旋转角（弧度）与角速度：翻着飞出去才像"被打飞"而不是"平移" */
  spin = 0;
  spinVel = 0;
  /**
   * 残影轨迹：快速突进/必杀起手时记录最近几个位置，渲染层画成半透明拖影。
   * 只在高"速"时才有，站着不动不会凭空多出重影。
   */
  ghosts: { x: number; y: number; facing: 1 | -1 }[] = [];
  /** 残留特效的属性色系（取自招式 fx） */
  burnStyle: FxStyle = 'none';

  /** 本帧输入（给输入解析/渲染按键提示用） */
  input: InputState = { held: 0, pressed: 0, released: 0 };

  /** 指令解析 + 招式选择（每帧都要喂输入，指令历史不能断） */
  readonly controls: FighterControls;

  /** 对手（投技距离判定要用；由 Match 设置，单测里可以为 null） */
  opponent: Fighter | null = null;

  /** 命中后开出的取消表：只有这里的招式能在出招中打断当前招 */
  cancelSet: ReadonlySet<string> | null = null;

  /**
   * 这一帧刚起手的招式（每帧由 Match 消费后清空）。
   * 用"刚起手"而不是"moveFrame === 0"判断演出的原因：`startMove()` 也可能被外部
   * 在 step 之前调用（训练/回放/测试），那时 step 一推进 moveFrame 就不是 0 了。
   */
  justStartedMove: MoveDef | null = null;

  /** 命中停顿/受击里按下的指令先存这儿，解冻那一帧再生效（否则取消窗口里的输入会丢） */
  private pendingMove: MoveDef | null = null;
  private pendingFrames = 0;

  /** 当前招式的位移方向（+1 朝前 / -1 朝后，回避要看输入） */
  private travelForward: 1 | -1 = 1;
  /** 本次跳跃是否已经"切"过高度（轻点↑只切一次） */
  private jumpCut = false;
  /** A+B 按下缓冲帧数：倒地/冻结期间按的受身键不能丢 */
  private abBuffer = 0;

  constructor(char: CharDef, init: FighterInit = {}) {
    this.char = char;
    this.x = init.x ?? 0;
    this.facing = init.facing ?? 1;
    this.maxHp = char.hp;
    this.hp = init.hp ?? char.hp;
    this.controls = new FighterControls(this);
  }

  // ---------------------------------------------------------------- 查询

  /** 能不能主动行动（含命中停顿检查） */
  canAct(): boolean {
    return this.hitstop === 0 && canAct(this.state);
  }

  get isAttacking(): boolean {
    return this.state === FighterState.Attack && this.move !== null;
  }

  get isDead(): boolean {
    return this.state === FighterState.Dead;
  }

  /** 推挤盒宽度（人不能穿过人） */
  get pushWidth(): number {
    return this.char.push?.w ?? DEFAULT_PUSH_WIDTH;
  }

  /** 受击盒（相对脚底原点；蹲/站/空三套） */
  hurtbox(): Box {
    if (this.airborne) return this.char.boxes.air;
    if (this.state === FighterState.Crouch) return this.char.boxes.crouch;
    return this.char.boxes.stand;
  }

  /** 把"面朝右"的相对盒换算成世界坐标（朝左时水平镜像） */
  worldBox(box: Box): Box {
    const x = this.facing === 1 ? this.x + box.x : this.x - box.x - box.w;
    return { x, y: this.y + box.y, w: box.w, h: box.h };
  }

  /**
   * 本次硬直的**总帧数**（进入硬直时设一次，用来算有利帧）。
   *
   * `stateFrame` 是递增的"已经过了几帧"，只有它算不出"还剩几帧"。
   */
  stunTotal = 0;

  /** 本招式是否命中过（打空判定用：招式结束时还是 false 就是挥空） */
  moveLanded = false;
  /** 刚"挥空结束"，等 `Match.step` 消费成 whiff 事件后清零 */
  moveWhiffed = false;

  /** 本帧生效的判定（moveFrame 落在判定窗口内的那些） */
  activeHits(): HitDef[] {
    if (!this.isAttacking) return [];
    const move = this.move!;
    return move.hits.filter((h) => this.moveFrame >= h.frames[0] && this.moveFrame <= h.frames[1]);
  }

  /** 招式当前是否处在某段判定的生效期（含已命中过的那段，渲染/音效用） */
  isHitActive(): boolean {
    return this.activeHits().length > 0;
  }

  // ---------------------------------------------------------------- 指令动作

  setState(next: StateName): void {
    if (this.state === next) return;
    this.state = next;
    this.stateFrame = 0;
  }

  /** 回到中立姿（保留空中状态）。恢复中立 = 连段结束，连击数清零 */
  toNeutral(): void {
    this.move = null;
    this.moveFrame = 0;
    this.usedHits.clear();
    this.cancelSet = null;
    this.pendingMove = null;
    this.pendingFrames = 0;
    this.vx = 0;
    this.combo = newCombo();
    this.setState(this.airborne ? FighterState.Jump : FighterState.Idle);
  }

  /** 招式命中/被防后由 hit.ts 打开取消窗口 */
  allowCancel(ids: readonly string[]): void {
    this.cancelSet = ids.length > 0 ? new Set(ids) : null;
  }

  canCancelInto(id: string): boolean {
    return this.cancelSet !== null && this.cancelSet.has(id);
  }

  /** 取消：出招中直接切到下一招（状态不变，但帧号必须归零） */
  cancelInto(move: MoveDef): boolean {
    if (this.hitstop > 0) return false;
    if (!this.canCancelInto(move.id)) return false;
    if (move.meterCost !== undefined && this.meter < move.meterCost) return false;
    if (move.airborne === true && !this.airborne) return false;
    if (move.meterCost !== undefined) this.meter -= move.meterCost;
    this.move = move;
    this.moveFrame = 0;
    this.stateFrame = 0;
    this.usedHits.clear();
    this.cancelSet = null;
    this.justStartedMove = move;
    if (!this.airborne) this.vx = 0;
    this.state = FighterState.Attack;
    return true;
  }

  /** 被击退/被推开：直接改位置并夹在舞台内（推挤细化在物理条目） */
  push(dx: number): void {
    this.x += dx;
    this.clampX();
  }

  /** 回合重置：血量、位置、状态、连段、硬直全部归零（气槽默认也清） */
  reset(opts: { x: number; facing: 1 | -1; keepMeter?: boolean; keepHp?: boolean }): void {
    this.x = opts.x;
    this.y = GROUND_Y;
    this.vx = 0;
    this.vy = 0;
    this.facing = opts.facing;
    if (opts.keepHp !== true) this.hp = this.maxHp;
    if (opts.keepMeter !== true) this.meter = 0;
    this.state = FighterState.Idle;
    this.stateFrame = 0;
    this.move = null;
    this.moveFrame = 0;
    this.usedHits.clear();
    this.cancelSet = null;
    this.pendingMove = null;
    this.pendingFrames = 0;
    this.hitstop = 0;
    this.stunTimer = 0;
    this.landLag = 0;
    this.airborne = false;
    this.stunGauge = 0;
    this.guardGauge = 0;
    this.maxMode = 0;
    this.abBuffer = 0;
    this.jumpCut = false;
    this.travelForward = 1;
    this.combo = newCombo();
    this.input = { held: 0, pressed: 0, released: 0 };
  }

  /** 组队战换人：换成下一个角色（血量按新角色满血重算，气槽可选保留） */
  switchChar(char: CharDef, opts: { x: number; facing: 1 | -1; keepMeter?: boolean }): void {
    this.char = char;
    this.maxHp = char.hp;
    this.reset({ x: opts.x, facing: opts.facing, keepMeter: opts.keepMeter === true });
  }

  turn(): void {
    this.facing = this.facing === 1 ? -1 : 1;
  }

  /**
   * 开始一个招式。返回是否成功（不满足条件时不动，便于调用方决定是否往下试别的招式）。
   */
  startMove(move: MoveDef): boolean {
    if (this.hitstop > 0) return false;
    if (move.meterCost !== undefined && this.meter < move.meterCost) return false;
    if (move.airborne === true) {
      // 空中招式：只能在跳跃中出（受击/倒地/已出招都不行）
      if (!this.airborne || this.state !== FighterState.Jump) return false;
    } else {
      if (this.airborne || !canAct(this.state)) return false;
    }
    return this.forceStart(move);
  }

  /** 不看当前状态，强行起手（取消通道与测试用；仍然检查空中/气槽） */
  forceStart(move: MoveDef): boolean {
    this.moveLanded = false;
    if (move.meterCost !== undefined && this.meter < move.meterCost) return false;
    if (move.meterCost !== undefined) this.meter -= move.meterCost;
    this.move = move;
    this.moveFrame = 0;
    this.stateFrame = 0;
    this.usedHits.clear();
    this.cancelSet = null;
    this.justStartedMove = move;
    this.travelForward = move.travelFollowInput === true && this.holdsBack() ? -1 : 1;
    if (!this.airborne) this.vx = 0;
    this.state = FighterState.Attack;
    return true;
  }

  /** 是否按着"后退"方向（回避/位移用） */
  private holdsBack(): boolean {
    const back = this.facing === 1 ? Btn.Left : Btn.Right;
    return (this.input.held & back) !== 0;
  }

  /** 取走 AB 缓冲（受身用） */
  private takeAbBuffer(): boolean {
    if (this.abBuffer <= 0) return false;
    this.abBuffer = 0;
    return true;
  }

  /** AB 同帧（回避/受身） */
  private abPressed(): boolean {
    return (this.input.pressed & (Btn.A | Btn.B)) === (Btn.A | Btn.B);
  }

  /** CD 同帧（吹飞 / 防御取消） */
  private cdPressed(): boolean {
    return (this.input.pressed & (Btn.C | Btn.D)) === (Btn.C | Btn.D);
  }

  /** ABC 同帧（启动 MAX 模式） */
  private abcPressed(): boolean {
    return (this.input.pressed & (Btn.A | Btn.B | Btn.C)) === (Btn.A | Btn.B | Btn.C);
  }

  /** 满槽 + 中立时 ABC 启动 MAX 模式 */
  private tryActivateMax(): boolean {
    if (!this.abcPressed()) return false;
    if (this.maxMode > 0) return false;
    if (this.meter < MAX_MODE_METER) return false;
    if (!canAct(this.state)) return false;
    this.meter -= MAX_MODE_METER;
    this.maxMode = MAX_MODE_FRAMES;
    return true;
  }

  /** 本帧按了键 → 挑一招出来（出招中则只认取消表里的招） */
  private tryInputMove(): boolean {
    if (this.tryActivateMax()) return true; // ABC 是"启动 MAX"，不出招
    if (!acceptsMoveInput(this)) return false;
    const cancelling = this.state === FighterState.Attack;
    const move = this.controls.pick(this.opponent, cancelling ? (m) => this.canCancelInto(m.id) : undefined);
    if (!move) return false;
    return cancelling ? this.cancelInto(move) : this.startMove(move);
  }

  /** 执行冻结期间缓存的指令 */
  private tryStartPending(): boolean {
    const move = this.pendingMove;
    if (!move) return false;
    const cancelling = this.state === FighterState.Attack;
    const ok = cancelling ? this.cancelInto(move) : this.startMove(move);
    if (ok) {
      this.pendingMove = null;
      this.pendingFrames = 0;
    }
    return ok;
  }

  /**
   * 起跳。高度先按大跳算，之后 `stepAir` 里发现↑很快就松了再"切"成小跳——
   * KOF 的规则是"轻点↑ = 小跳、按住↑ = 大跳"，起跳那一帧是分不出来的。
   */
  startJump(dx: number): void {
    if (dx !== 0) this.facing = dx > 0 ? 1 : -1;
    this.vy = -this.char.jump.vy;
    this.vx = dx * this.char.jump.vx;
    this.airborne = true;
    this.jumpCut = false;
    this.setState(FighterState.Jump);
  }

  /** 小跳初速（没配就按大跳的比例算） */
  get smallJumpVy(): number {
    return this.char.jump.smallVy ?? this.char.jump.vy * 0.62;
  }

  // ---------------------------------------------------------------- 被命中入口（hit.ts 调用）

  /** 受击硬直（空中受击会继续下落，落地转入倒地）。不清 hitstop——那是命中结算设好的 */
  /** 受击残留特效计时（每帧由 step 调用） */
  /** 旋转积分：滞空时一直转，落地就停 */
  private stepSpin(): void {
    if (this.spinVel === 0) return;
    if (!this.airborne) {
      this.spin = 0;
      this.spinVel = 0;
      return;
    }
    this.spin += this.spinVel;
  }

  /** 残影采样：每 3 帧取一个点，最多 2 个 */
  private stepGhosts(): void {
    const fast =
      Math.abs(this.vx) >= 2.2 ||
      (this.move != null && (this.move.kind === 'special' || this.move.kind === 'super') && this.moveFrame < 12);
    if (!fast) {
      if (this.ghosts.length > 0) this.ghosts.length = 0;
      return;
    }
    if (this.stateFrame % 3 === 0) {
      this.ghosts.push({ x: this.x, y: this.y, facing: this.facing });
      if (this.ghosts.length > 2) this.ghosts.shift();
    }
  }

  stepBurn(): void {
    if (this.burnFrames > 0) this.burnFrames--;
    if (this.hitShake > 0) this.hitShake--;
  }

  enterHitstun(frames: number, opts: { launch?: number; knockdown?: boolean } = {}): void {
    this.stunTotal = Math.max(1, frames | 0);
    this.move = null;
    this.moveFrame = 0;
    this.usedHits.clear();
    this.stunTimer = Math.max(1, frames | 0);
    this.hitShake = HIT_SHAKE_FRAMES;
    this.bounced = false;
    if (opts.launch !== undefined) {
      this.vy = opts.launch;
      this.vx *= 0.5;
      if (opts.launch < 0) {
        this.airborne = true;
        // 往前翻：方向跟着击退方向走，别让两个角色都朝同一个方向转
        this.spinVel = this.vx >= 0 ? SPIN_VEL : -SPIN_VEL;
      }
    }
    this.setState(FighterState.Hit);
    // 地上被击倒：直接进倒地；空中受击则在落地时由 stepStun() 转倒地
    if (opts.knockdown === true && !this.airborne) this.enterKnockdown();
  }

  enterBlockstun(frames: number): void {
    this.move = null;
    this.moveFrame = 0;
    this.usedHits.clear();
    this.stunTimer = Math.max(1, frames | 0);
    this.setState(FighterState.Block);
  }

  enterKnockdown(): void {
    this.airborne = false;
    this.spin = 0;
    this.spinVel = 0;
    this.vx = 0;
    this.vy = 0;
    this.y = GROUND_Y;
    this.setState(FighterState.Down);
  }

  enterDizzy(frames: number): void {
    this.move = null;
    this.moveFrame = 0;
    this.usedHits.clear();
    this.stunTimer = Math.max(1, frames | 0);
    this.setState(FighterState.Dizzy);
  }

  addHitstop(frames: number): void {
    this.hitstop = Math.max(this.hitstop, frames | 0);
  }

  takeDamage(amount: number): void {
    // BOSS 减伤：倍率挂在角色数据上，结算层不用知道谁是 BOSS
    const taken = this.char.boss?.damageTaken ?? 1;
    const dealt = Math.max(0, Math.round(Math.max(0, amount | 0) * taken));
    this.hp = Math.max(0, this.hp - dealt);
    if (this.hp === 0) {
      this.airborne = false;
      this.vx = 0;
      this.vy = 0;
      this.setState(FighterState.Dead);
    }
  }

  addMeter(amount: number): void {
    // 气槽有上限：不夹住的话会一直涨到几百，HUD 只是显示上截断，
    // 而"气够不够"的判断仍读真实值——这种不一致最难查。
    this.meter = Math.min(METER_MAX, Math.max(0, this.meter + amount));
  }

  // ---------------------------------------------------------------- 每帧推进

  step(_world: World, input: InputState): void {
    // 残留特效每帧都减：放在最前面，才不会被各状态的提前 return 漏掉
    this.stepBurn();
    this.stepGhosts();
    this.stepSpin();
    this.input = input;
    // 指令历史每帧都要攒（冻结期间也不例外），否则连段里的摇杆会断
    this.controls.feed(input);
    if (this.abPressed()) this.abBuffer = 8;
    else if (this.abBuffer > 0) this.abBuffer--;

    // 防御取消：防御硬直（含命中停顿）里按 CD 直接吹飞反击
    if (this.state === FighterState.Block && this.cdPressed()) {
      const cd = this.char.moves['CD'];
      if (cd) this.forceStart(cd);
    }

    // 命中停顿：整帧冻结（状态帧号也不动），这是格斗手感的关键。
    // 但按键仍然解析并存下来——命中停顿里摇出来的取消，解冻后要能生效。
    if (this.hitstop > 0) {
      const queued = this.controls.pick(
        this.opponent,
        this.state === FighterState.Attack ? (m) => this.canCancelInto(m.id) : undefined,
      );
      if (queued) {
        this.pendingMove = queued;
        this.pendingFrames = INPUT_BUFFER_FRAMES;
      }
      this.hitstop--;
      return;
    }

    this.stateFrame++;
    if (this.maxMode > 0) this.maxMode--;
    // BOSS 每帧回气（原版 BOSS 气槽回得比谁都快的观感）
    const regen = this.char.boss?.meterRegen ?? 0;
    if (regen > 0 && !this.isDead) this.addMeter(regen);
    this.decayGauges();

    if (this.pendingFrames > 0) {
      this.pendingFrames--;
      if (this.tryStartPending()) return;
    }

    // 按键 → 出招（出招中的取消也走这里）
    if (this.tryInputMove()) return;

    switch (this.state) {
      case FighterState.Attack:
        this.stepAttack(_world);
        break;
      case FighterState.Jump:
        this.stepAir(input);
        break;
      case FighterState.Hit:
      case FighterState.Block:
      case FighterState.Dizzy:
        this.stepStun();
        break;
      case FighterState.Down:
        // 受身：倒地后按 AB 可以快速起身（起身阶段本身无敌）
        if (this.stateFrame >= QUICK_WAKEUP_MIN && this.takeAbBuffer()) {
          this.setState(FighterState.Wakeup);
        } else if (this.stateFrame >= KNOCKDOWN_FRAMES) {
          this.setState(FighterState.Wakeup);
        }
        break;
      case FighterState.Wakeup:
        if (this.stateFrame >= WAKEUP_FRAMES) this.toNeutral();
        break;
      case FighterState.Landing:
        if (this.stateFrame >= this.landLag) this.toNeutral();
        break;
      case FighterState.Dead:
        break;
      default:
        this.stepGround(input);
        break;
    }
  }

  /** 地面中立：移动 / 蹲 / 跳 */
  private stepGround(input: InputState): void {
    if (!canAct(this.state)) return;

    const dx = axisX(input.held);
    const dy = axisY(input.held);

    if (dy === -1) {
      this.startJump(dx);
      return;
    }
    if (dy === 1) {
      this.vx = 0;
      this.setState(FighterState.Crouch);
      return;
    }
    if (dx === 0) {
      this.vx = 0;
      this.setState(FighterState.Idle);
      return;
    }

    const forward = dx === this.facing;
    this.vx = dx * (forward ? this.char.walk.fwd : this.char.walk.back);
    this.x += this.vx;
    this.clampX();
    this.setState(forward ? FighterState.WalkF : FighterState.WalkB);
  }

  private stepAttack(world: World): void {
    const move = this.move;
    if (!move) {
      this.toNeutral();
      return;
    }
    this.moveFrame = this.stateFrame;

    // 飞行道具：到生成帧就从身上放一个出去
    const proj = move.projectile;
    if (proj) {
      const spawnAt = proj.spawnFrame ?? move.hits[0]?.frames[0] ?? 1;
      if (this.moveFrame === spawnAt) spawnProjectile(world, this, proj);
    }

    // 位移型招式（回避/突进）：均匀分摊到 travelFrames 帧里
    if (move.travel !== undefined && !this.airborne) {
      const frames = Math.max(1, move.travelFrames ?? move.total);
      if (this.moveFrame <= frames) {
        this.x += (move.travel / frames) * this.travelForward * this.facing;
        this.clampX();
      }
    }

    if (this.airborne) {
      if (integrateAir(this)) {
        this.airborne = false;
        this.beginLanding(move.landingLag ?? 4);
        return;
      }
      this.clampX();
    }

    if (this.moveFrame >= move.total) {
      // 整招收完还没命中过 → 挥空。交给 Match 发事件（Fighter 没有 world 引用）
      if (!this.moveLanded) this.moveWhiffed = true;
      this.toNeutral();
    }
  }

  private stepAir(input: InputState): void {
    // 轻点↑：起跳后很快松手 → 把上升速度切掉，变成小跳（只切一次）
    if (!this.jumpCut && this.stateFrame <= JUMP_CUT_FRAMES && (input.held & Btn.Up) === 0) {
      this.jumpCut = true;
      const small = -this.smallJumpVy;
      if (this.vy < small) this.vy = small;
    }

    const landed = integrateAir(this);
    this.clampX();
    if (landed) {
      this.airborne = false;
      this.vx = 0;
      this.setState(FighterState.Idle);
    }
  }

  /** 削防/气绝的自然衰减：站着不动会慢慢降下来 */
  private decayGauges(): void {
    const active = canAct(this.state);
    if (this.guardGauge > 0) {
      this.guardGauge = Math.max(0, this.guardGauge - (active ? 0.3 : 0.12));
    }
    if (this.stunGauge > 0) {
      this.stunGauge = Math.max(0, this.stunGauge - (active ? 0.25 : 0.08));
    }
  }

  private stepStun(): void {
    // 晕眩时连按按键能提前醒（KOF 的摇醒）
    if (this.state === FighterState.Dizzy && this.input.pressed !== 0) {
      this.stunTimer = Math.max(1, this.stunTimer - 1);
    }
    if (this.airborne) {
      const landed = integrateAir(this);
      this.clampX();
      if (landed) {
        // 摔下来弹一下再趴下：硬贴地看起来像"被贴在画面上"，弹一跳才有重量
        if (!this.bounced) {
          this.bounced = true;
          this.airborne = true;
          this.vy = -KNOCKDOWN_BOUNCE_VY;
          this.vx *= 0.35;
          return;
        }
        this.airborne = false;
        this.enterKnockdown();
        return;
      }
    }
    if (this.stateFrame >= this.stunTimer) {
      if (this.state === FighterState.Dizzy) this.stunGauge = 0;
      this.toNeutral();
    }
  }

  private beginLanding(lag: number): void {
    this.vx = 0;
    this.landLag = Math.max(0, lag | 0);
    if (this.landLag === 0) {
      this.toNeutral();
      return;
    }
    this.setState(FighterState.Landing);
  }

  private clampX(): void {
    if (clampStageX(this)) this.vx = 0;
  }

  // ---------------------------------------------------------------- 哈希/调试

  hash(h: Hasher): void {
    h.f64(this.x).f64(this.y).f64(this.vx).f64(this.vy).i32(this.facing);
    h.i32(this.hp).i32(this.meter).i32(this.stunGauge);
    h.i32(this.combo.hits).i32(this.combo.damage);
    h.str(this.state).i32(this.stateFrame).i32(this.moveFrame);
    h.i32(this.hitstop).i32(this.stunTimer).bool(this.airborne);
    h.f64(this.guardGauge).i32(this.maxMode);
    h.u32(this.usedHits.size);
  }
}
