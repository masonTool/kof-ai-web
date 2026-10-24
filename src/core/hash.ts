/**
 * 状态哈希：把世界状态压成一个 32 位指纹，用来断言"两条时间线是否完全一致"。
 *
 * 浮点按 IEEE-754 原始位压进去（不做量化）——量化会把真实分叉抹平，
 * 那正是回放不同步时最需要看见的信号。
 */
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const scratch = new ArrayBuffer(8);
const scratchF64 = new Float64Array(scratch);
const scratchU32 = new Uint32Array(scratch);

export class Hasher {
  private h = FNV_OFFSET;

  u32(v: number): this {
    this.h ^= v >>> 0;
    this.h = Math.imul(this.h, FNV_PRIME) >>> 0;
    return this;
  }

  i32(v: number): this {
    return this.u32(v | 0);
  }

  f64(v: number): this {
    scratchF64[0] = v;
    this.u32(scratchU32[0]!);
    this.u32(scratchU32[1]!);
    return this;
  }

  bool(v: boolean): this {
    return this.u32(v ? 1 : 0);
  }

  str(s: string): this {
    for (let i = 0; i < s.length; i++) this.u32(s.charCodeAt(i));
    return this.u32(s.length);
  }

  /** 把已有哈希混进来（分层哈希用） */
  mix(other: string | number): this {
    return typeof other === 'number' ? this.u32(other) : this.str(other);
  }

  value(): number {
    return this.h >>> 0;
  }

  hex(): string {
    return (this.h >>> 0).toString(16).padStart(8, '0');
  }
}

export function hashOf(build: (h: Hasher) => void): string {
  const h = new Hasher();
  build(h);
  return h.hex();
}
