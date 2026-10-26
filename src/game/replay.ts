/**
 * 回放：只录**每帧输入**，不录画面。
 *
 * 为什么能这么做：`sim/` 是确定性的（固定步长 + 自己带种子的 RNG + 按 id 排序推进），
 * 同一份种子 + 同一串输入必然得到同一个世界。所以回放文件小得离谱（一场 3 分钟约 20KB），
 * 而且"回放对不上"就等于"确定性被破坏了"——它还是一个免费的回归测试。
 */
import type { InputSample } from '../core/input';
import { DEFAULT_MATCH, Match, type MatchConfig } from './match';
import type { CharDef } from '../data/schema';

export const REPLAY_VERSION = 1;

export interface Replay {
  version: number;
  /** 世界种子：不存这个就重演不出同一场 */
  seed: number;
  /** 对局参数（局数/时间/演出帧数都要存——演出帧数不同，帧对齐就不同） */
  config: MatchConfig;
  /** 双方的队伍（角色 id，顺序即出场顺序） */
  teams: [string[], string[]];
  /** 每帧 [p1 held, p2 held] 的位掩码 */
  inputs: [number, number][];
}

export interface ReplayMeta {
  seed: number;
  config: MatchConfig;
  teams: [string[], string[]];
}

export class ReplayRecorder {
  private readonly inputs: [number, number][] = [];

  constructor(private readonly meta: ReplayMeta) {}

  record(samples: readonly [InputSample, InputSample]): void {
    this.inputs.push([samples[0].held >>> 0, samples[1].held >>> 0]);
  }

  get frames(): number {
    return this.inputs.length;
  }

  finish(): Replay {
    return {
      version: REPLAY_VERSION,
      ...this.meta,
      teams: [this.meta.teams[0].slice(), this.meta.teams[1].slice()],
      inputs: this.inputs.map(([a, b]) => [a, b] as [number, number]),
    };
  }
}

export class ReplayPlayer {
  private index = 0;

  constructor(readonly replay: Replay) {}

  get position(): number {
    return this.index;
  }

  get total(): number {
    return this.replay.inputs.length;
  }

  get done(): boolean {
    return this.index >= this.replay.inputs.length;
  }

  /** 下一帧输入；录完之后给空输入（不抛错，方便"边播边停"） */
  next(): [InputSample, InputSample] {
    const pair = this.replay.inputs[this.index];
    this.index++;
    if (!pair) return [{ held: 0 }, { held: 0 }];
    return [{ held: pair[0] >>> 0 }, { held: pair[1] >>> 0 }];
  }

  reset(): void {
    this.index = 0;
  }
}

/** 回放 JSON 可能来自用户（导入文件），一律消毒；不合法就返回 null 由调用方提示 */
export function parseReplay(raw: unknown): Replay | null {
  if (raw === null || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj['version'] !== REPLAY_VERSION) return null;
  const seed = obj['seed'];
  if (typeof seed !== 'number' || !Number.isFinite(seed)) return null;

  const teamsRaw = obj['teams'];
  if (!Array.isArray(teamsRaw) || teamsRaw.length !== 2) return null;
  const teams: [string[], string[]] = [[], []];
  for (const side of [0, 1] as const) {
    const list = teamsRaw[side];
    if (!Array.isArray(list) || list.length === 0) return null;
    for (const id of list) {
      if (typeof id !== 'string' || id.length === 0) return null;
      teams[side].push(id);
    }
  }

  const inputsRaw = obj['inputs'];
  if (!Array.isArray(inputsRaw) || inputsRaw.length === 0) return null;
  const inputs: [number, number][] = [];
  for (const pair of inputsRaw) {
    if (!Array.isArray(pair) || pair.length !== 2) return null;
    const a = pair[0];
    const b = pair[1];
    if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) return null;
    inputs.push([a >>> 0, b >>> 0]);
  }

  const cfgRaw = (obj['config'] !== null && typeof obj['config'] === 'object' ? obj['config'] : {}) as Record<string, unknown>;
  // 只用于数值字段（infiniteTime 是布尔，不进回放配置）
  const cfg = (k: keyof MatchConfig): number => {
    const v = cfgRaw[k];
    const fallback = DEFAULT_MATCH[k] as number;
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  };

  return {
    version: REPLAY_VERSION,
    seed,
    config: {
      roundsToWin: Math.min(3, Math.max(1, Math.round(cfg('roundsToWin')))),
      roundSeconds: Math.min(99, Math.max(10, Math.round(cfg('roundSeconds')))),
      introFrames: Math.max(0, Math.round(cfg('introFrames'))),
      roundEndFrames: Math.max(0, Math.round(cfg('roundEndFrames'))),
      spawnGap: Math.max(8, Math.round(cfg('spawnGap'))),
      swapIntroFrames: Math.max(0, Math.round(cfg('swapIntroFrames'))),
    },
    teams,
    inputs,
  };
}

export function serializeReplay(replay: Replay): string {
  return JSON.stringify(replay);
}

/** 用回放里的参数重建一场对局（角色 id 查不到时抛错——那是数据问题，不该静默吞掉） */
export function matchFromReplay(replay: Replay, byId: (id: string) => CharDef | undefined): Match {
  const side = (ids: string[]): CharDef[] =>
    ids.map((id) => {
      const char = byId(id);
      if (!char) throw new Error(`回放里有未知角色：${id}`);
      return char;
    });
  return new Match(side(replay.teams[0]), side(replay.teams[1]), replay.config, replay.seed);
}
