/**
 * 训练挑战：把"练什么"变成可勾选的目标（连段几段、命中几次、防住几次、超必杀命中几次）。
 *
 * 纯逻辑：只吃"发生了一件事"的事件，不碰 DOM/Canvas，
 * 所以"连段 3 段到底算不算完成"能在 node 里直接断言，而不是靠人盯着数字。
 */

export type ChallengeKind = 'combo' | 'hits' | 'blocks' | 'super';

export interface ChallengeDef {
  id: string;
  kind: ChallengeKind;
  /** 目标数量（combo 是"至少几段"） */
  goal: number;
  name: string;
  hint: string;
}

export const CHALLENGES: readonly ChallengeDef[] = [
  { id: 'combo3', kind: 'combo', goal: 3, name: '连段 3 段', hint: '轻攻击起手接必杀' },
  { id: 'combo5', kind: 'combo', goal: 5, name: '连段 5 段', hint: '荒咬 → 九傷 → 八錆 再接超必杀' },
  { id: 'hits20', kind: 'hits', goal: 20, name: '命中 20 次', hint: '稳扎稳打，别急着放招' },
  { id: 'blocks5', kind: 'blocks', goal: 5, name: '防住 5 次', hint: '按住后退（对空中的敌人防不住）' },
  { id: 'super2', kind: 'super', goal: 2, name: '超必杀命中 2 次', hint: '攒满气槽再放' },
];

export class ChallengeRun {
  progress = 0;
  completed = false;

  constructor(readonly def: ChallengeDef) {}

  private bump(value: number): void {
    if (this.completed) return;
    this.progress = Math.min(this.def.goal, value);
    if (this.progress >= this.def.goal) this.completed = true;
  }

  /**
   * 一次命中。
   * `comboHits` 是这一击在**本次连段**里的序号（1 起），连段类挑战取历史最大值——
   * 因为"打过一次 5 段"就说明会打了，不需要每次都 5 段。
   */
  hit(comboHits: number, isSuper: boolean): void {
    switch (this.def.kind) {
      case 'combo':
        this.bump(Math.max(1, comboHits));
        break;
      case 'hits':
        this.bump(this.progress + 1);
        break;
      case 'super':
        if (isSuper) this.bump(this.progress + 1);
        break;
      case 'blocks':
        break;
    }
  }

  /** 一次防御成功 */
  block(): void {
    if (this.def.kind === 'blocks') this.bump(this.progress + 1);
  }

  /** 进度文本，如「连段 3 段  2/3」 */
  get label(): string {
    return `${this.def.name}  ${this.progress}/${this.def.goal}`;
  }

  reset(): void {
    this.progress = 0;
    this.completed = false;
  }
}

/** 挑战面板：当前挑战 + 全部完成度（训练模式 HUD 用） */
export class ChallengeBoard {
  index = 0;
  readonly runs: ChallengeRun[];

  constructor(readonly defs: readonly ChallengeDef[] = CHALLENGES) {
    this.runs = defs.map((d) => new ChallengeRun(d));
  }

  get current(): ChallengeRun {
    return this.runs[this.index] ?? this.runs[0]!;
  }

  select(index: number): void {
    if (this.runs.length === 0) return;
    this.index = ((index % this.runs.length) + this.runs.length) % this.runs.length;
  }

  next(): void {
    this.select(this.index + 1);
  }

  prev(): void {
    this.select(this.index - 1);
  }

  /** 命中事件转发给所有挑战（面板上每条都要推进，不只是当前选中的） */
  observeHit(comboHits: number, isSuper: boolean): boolean {
    const before = this.current.completed;
    for (const run of this.runs) run.hit(comboHits, isSuper);
    return !before && this.current.completed;
  }

  observeBlock(): boolean {
    const before = this.current.completed;
    for (const run of this.runs) run.block();
    return !before && this.current.completed;
  }

  /** 已完成的条数（HUD 显示 x/5） */
  get doneCount(): number {
    return this.runs.filter((r) => r.completed).length;
  }

  resetAll(): void {
    for (const run of this.runs) run.reset();
  }
}
