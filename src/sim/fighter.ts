/**
 * 角色实体：状态机 + 帧推进 + 体感物理。
 *
 * 分工：**招式数据说什么，这里就只做什么**——不给角色写死任何"特殊动作"，
 * 所有招式都走 `startMove()`，靠 `MoveDef` 的帧数据驱动。
 * 命中判定/伤害结算在 `hit.ts`（调用这里的 `enterHitstun()` 等入口），
 * 推挤与镜头在后续条目里补。
 */
import type { InputState } from '../core/input';
import { axisX, axisY } from '../core/input';
import type { Box, CharDef, HitDef, MoveDef } from '../data/schema';
import { newCombo, type ComboState } from './combo';
import { GROUND_Y, KNOCKDOWN_FRAMES, WAKEUP_FRAMES } from './constants';
import { DEFAULT_PUSH_WIDTH, clampStageX, integrateAir } from './physics';
import { FighterState, canAct, type FighterState as StateName } from './state';
import type { Entity, World } from './world';
import type { Hasher } from '../core/hash';

export interface FighterInit {
  x?: number;
  facing?: 1 | -1;
  hp?: number;
}

export class Fighter implements Entity {
  id = -1;
  readonly char: CharDef;

  x: number;
  y = GROUND_Y;
  vx = 0;
  vy = 0;
  facing: 1 | -1;

  hp: number;
  readonly maxHp: number;
  /** 气槽（KOF97 满槽用 MAX 模式，具体上限见后续条目） */
  meter = 0;
  /** 气绝值，攒满进晕眩 */
  stunGauge = 0;
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

  /** 本帧输入（给输入解析/渲染按键提示用） */
  input: InputState = { held: 0, pressed: 0, released: 0 };

  constructor(char: CharDef, init: FighterInit = {}) {
    this.char = char;
    this.x = init.x ?? 0;
    this.facing = init.facing ?? 1;
    this.maxHp = char.hp;
    this.hp = init.hp ?? char.hp;
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
    this.vx = 0;
    this.combo = newCombo();
    this.setState(this.airborne ? FighterState.Jump : FighterState.Idle);
  }

  /** 被击退/被推开：直接改位置并夹在舞台内（推挤细化在物理条目） */
  push(dx: number): void {
    this.x += dx;
    this.clampX();
  }

  /** 回合重置：血量、位置、状态、连段、硬直全部归零（气槽默认也清） */
  reset(opts: { x: number; facing: 1 | -1; keepMeter?: boolean }): void {
    this.x = opts.x;
    this.y = GROUND_Y;
    this.vx = 0;
    this.vy = 0;
    this.facing = opts.facing;
    this.hp = this.maxHp;
    if (opts.keepMeter !== true) this.meter = 0;
    this.state = FighterState.Idle;
    this.stateFrame = 0;
    this.move = null;
    this.moveFrame = 0;
    this.usedHits.clear();
    this.hitstop = 0;
    this.stunTimer = 0;
    this.landLag = 0;
    this.airborne = false;
    this.stunGauge = 0;
    this.combo = newCombo();
    this.input = { held: 0, pressed: 0, released: 0 };
  }

  turn(): void {
    this.facing = this.facing === 1 ? -1 : 1;
  }

  /**
   * 开始一个招式。返回是否成功（不满足条件时不动，便于调用方决定是否往下试别的招式）。
   */
  startMove(move: MoveDef): boolean {
    if (this.hitstop > 0) return false;
    if (move.airborne === true) {
      // 空中招式：只能在跳跃中出（受击/倒地/已出招都不行）
      if (!this.airborne || this.state !== FighterState.Jump) return false;
    } else {
      if (this.airborne || !canAct(this.state)) return false;
    }
    this.move = move;
    this.moveFrame = 0;
    this.usedHits.clear();
    if (!this.airborne) this.vx = 0;
    this.setState(FighterState.Attack);
    return true;
  }

  startJump(dx: number): void {
    if (dx !== 0) this.facing = dx > 0 ? 1 : -1;
    this.vy = -this.char.jump.vy;
    this.vx = dx * this.char.jump.vx;
    this.airborne = true;
    this.setState(FighterState.Jump);
  }

  // ---------------------------------------------------------------- 被命中入口（hit.ts 调用）

  /** 受击硬直（空中受击会继续下落，落地转入倒地）。不清 hitstop——那是命中结算设好的 */
  enterHitstun(frames: number, opts: { launch?: number; knockdown?: boolean } = {}): void {
    this.move = null;
    this.moveFrame = 0;
    this.usedHits.clear();
    this.stunTimer = Math.max(1, frames | 0);
    if (opts.launch !== undefined) {
      this.vy = opts.launch;
      this.vx *= 0.5;
      if (opts.launch < 0) this.airborne = true;
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
    this.hp = Math.max(0, this.hp - Math.max(0, amount | 0));
    if (this.hp === 0) {
      this.airborne = false;
      this.vx = 0;
      this.vy = 0;
      this.setState(FighterState.Dead);
    }
  }

  addMeter(amount: number): void {
    this.meter = Math.max(0, this.meter + amount);
  }

  // ---------------------------------------------------------------- 每帧推进

  step(_world: World, input: InputState): void {
    this.input = input;

    // 命中停顿：整帧冻结（状态帧号也不动），这是格斗手感的关键
    if (this.hitstop > 0) {
      this.hitstop--;
      return;
    }

    this.stateFrame++;

    switch (this.state) {
      case FighterState.Attack:
        this.stepAttack();
        break;
      case FighterState.Jump:
        this.stepAir();
        break;
      case FighterState.Hit:
      case FighterState.Block:
      case FighterState.Dizzy:
        this.stepStun();
        break;
      case FighterState.Down:
        if (this.stateFrame >= KNOCKDOWN_FRAMES) this.setState(FighterState.Wakeup);
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

  private stepAttack(): void {
    const move = this.move;
    if (!move) {
      this.toNeutral();
      return;
    }
    this.moveFrame = this.stateFrame;

    if (this.airborne) {
      if (integrateAir(this)) {
        this.airborne = false;
        this.beginLanding(move.landingLag ?? 4);
        return;
      }
      this.clampX();
    }

    if (this.moveFrame >= move.total) this.toNeutral();
  }

  private stepAir(): void {
    const landed = integrateAir(this);
    this.clampX();
    if (landed) {
      this.airborne = false;
      this.vx = 0;
      this.setState(FighterState.Idle);
    }
  }

  private stepStun(): void {
    if (this.airborne) {
      const landed = integrateAir(this);
      this.clampX();
      if (landed) {
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
    h.u32(this.usedHits.size);
  }
}
