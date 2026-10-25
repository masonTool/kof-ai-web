/**
 * 音频图：**一个 AudioContext**，两条总线（音效 / BGM），汇到压缩器再出音箱。
 *
 * 为什么不像原来那样各建一个 AudioContext：
 * 1. 浏览器对同时存在的 AudioContext 数量有限制，手机上多开容易被系统挂起；
 * 2. 两路各接 destination 就等于**没有混音**——BGM 和打击音同响时直接叠加削顶，
 *    听起来"糊成一团"，这也是要加压缩器的原因；
 * 3. 有了总线才能分别调音量（选项屏的 BGM / 音效滑条）。
 *
 * 压缩器参数偏"打击感"：阈值低、启动快，让密集连段不至于把手机小喇叭推爆。
 */

type AudioCtor = new () => AudioContext;

export interface AudioGraph {
  ctx: AudioContext;
  /** 音效总线 */
  sfx: GainNode;
  /** BGM 总线 */
  bgm: GainNode;
  /** 压缩器（两条总线汇进来再送去 destination） */
  master: DynamicsCompressorNode;
}

/** 音效默认音量（0~1） */
export const DEFAULT_SFX_VOLUME = 0.22;
/** BGM 默认音量（0~1） */
export const DEFAULT_BGM_VOLUME = 0.25;

let graph: AudioGraph | null = null;
let failed = false;

function ctor(): AudioCtor | null {
  const g = globalThis as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

/**
 * 拿（必要时建）全局音频图。node / 老浏览器返回 null，调用方静默降级。
 */
export function audioGraph(): AudioGraph | null {
  if (graph || failed) return graph;
  const C = ctor();
  if (!C) {
    failed = true;
    return null;
  }
  try {
    const ctx = new C();
    const sfx = ctx.createGain();
    const bgm = ctx.createGain();
    const master = ctx.createDynamicsCompressor();
    sfx.gain.value = DEFAULT_SFX_VOLUME;
    bgm.gain.value = DEFAULT_BGM_VOLUME;
    // 打击感优先：阈值压低、比率中等、启动要快，密集连段不劈
    master.threshold.value = -18;
    master.knee.value = 12;
    master.ratio.value = 4;
    master.attack.value = 0.004;
    master.release.value = 0.18;
    sfx.connect(master);
    bgm.connect(master);
    master.connect(ctx.destination);
    graph = { ctx, sfx, bgm, master };
  } catch {
    failed = true;
    graph = null;
  }
  return graph;
}

/** 设置某条总线的音量（选项屏用） */
export function setBusVolume(bus: 'sfx' | 'bgm', volume: number): void {
  const g = audioGraph();
  if (!g) return;
  const v = Math.min(1, Math.max(0, volume));
  const node = bus === 'sfx' ? g.sfx : g.bgm;
  node.gain.value = v;
}

/**
 * 解锁音频：浏览器要求用户交互之后才能出声。
 *
 * 手机上 AudioContext 常常以 `suspended` 状态创建，必须在**用户手势的回调里** resume，
 * 否则 BGM 永远不响、音效也只会在某些浏览器里"延迟到下一次手势才响"。
 */
export function unlockAudio(): void {
  const g = audioGraph();
  if (g && g.ctx.state === 'suspended') void g.ctx.resume();
}

/** 测试用：忘掉已建的图（node 里本来就是 null） */
export function resetAudioGraph(): void {
  graph = null;
  failed = false;
}
