# 架构 · KOF'97 Web 复刻

> 稳定文档：**技术栈 / 目录 / 数据格式 / 判定口径**。改架构先改这里，再改代码。
> 进度不在这里（看 `.continue/TASKS.md` 与 `DONE.md`），已实现模块看 `.continue/OVERVIEW.md`。

## 1. 目标与边界

- 目标：在浏览器里复刻 **拳皇'97（KOF'97, MVS 版）** 的对战体验——3v3 组队战、KOF97 系统机制、
  24 名可选角色 + BOSS、原版 HUD 布局与节奏（60FPS 帧逻辑）。
- **美术/音频不取用原版素材**（版权）：角色用**程序化骨架绘制**（见 §5），特效/音效用代码合成。
  所有资源访问都走 `src/render/assets.ts` 这一层，将来用户提供自绘素材时只需替换该层，不动玩法。
- 帧数据口径：**机制忠实**（状态、判定等级、取消关系、气槽/MAX/气绝/连段补正等），
  具体数值在无公开权威表时取近似值，全部写在 `src/data/`，一处可改。

## 2. 技术栈

| 项 | 选择 | 理由 |
| --- | --- | --- |
| 语言 | TypeScript（strict） | 帧数据/状态机字段多，类型是第一道门禁 |
| 构建 | Vite | 秒级 dev/build，零配置 |
| 渲染 | Canvas 2D（`ctx`）| 2D 格斗够用；逻辑分辨率 320×224 整数缩放，像素感与原版一致 |
| 音频 | WebAudio 合成（`src/audio/`）| 不依赖音频文件 |
| 测试 | Vitest（node 环境）| **模拟层是纯 TS、无 DOM**，可 headless 跑千帧断言 |
| 依赖 | 仅 devDeps（vite/vitest/typescript）| 运行期零依赖 |

## 3. 目录

```
src/
  core/      loop.ts(固定步长) rng.ts math.ts events.ts
  sim/       world.ts fighter.ts controls.ts(按键→招式) state.ts physics.ts collision.ts hit.ts camera.ts combo.ts
  data/      schema.ts chars/*.ts stages/*.ts moves/(帧数据表)
  input/     keyboard.ts gamepad.ts parser.ts(指令识别) buffer.ts
  render/    renderer.ts fighter-draw.ts poses.ts stage-draw.ts hud.ts fx.ts assets.ts
  game/      match.ts(回合/胜负) select.ts(选人) flow.ts(流程)
  ui/        screens/ training.ts virtual-pad.ts touch-controls.ts
  ai/        cpu.ts
  audio/     synth.ts
tests/       与 src 同构，*.test.ts
docs/        ARCHITECTURE.md
```

**硬规则**：`sim/` 与 `data/` **不许 import DOM/Canvas**（否则无法 headless 测试、无法回放）。

输入到招式的一条线：`input/`（键位/指令识别）→ `sim/controls.ts`（按姿态与优先级挑招式、
贴身才成立的投技、命中才开的取消表）→ `Fighter.startMove/cancelInto`（帧数据驱动）。
按钮只负责产出 `InputSample`：键盘、`ui/virtual-pad.ts`（触屏/鼠标）两边 OR 起来喂进去，
模拟层不知道输入来自哪一种设备。

## 4. 模拟内核

- 逻辑帧率固定 **60 Hz**，1 tick = 1 帧。所有时间单位都是**帧**（int），禁止用 `deltaTime` 写玩法。
- 逻辑分辨率 **320×224**（MVS），原点在舞台左上，地面 `y = 200`，角色高约 84px。
  角色原点在**脚底中心**；所有判定盒以角色原点为基准、按朝向镜像。
- 舞台宽 **512**（`STAGE_LEFT..STAGE_RIGHT`），比一屏宽——镜头才能平移。
  镜头（`sim/camera.ts`）以**地面为锚点**变焦：地面永远落在屏幕第 200 行，
  两人靠近时拉近（zoom 最大 1.6）、拉开时放宽到 1，并把可见范围夹在舞台内。
- 每 tick 顺序（顺序本身就是确定性的一部分，不许改）：
  1. 采样输入 → 2. 指令解析（`parser`）→ 3. 逐角色状态推进（按 index 升序）→ 4. 物理积分
  → 5. 推挤与舞台夹取 → 6. 命中判定（攻击方 index 升序，一个 tick 内每个 hitdef 至多命中一次）
  → 7. 结算伤害/受击/气槽/连段 → 8. 计时器与镜头 → 9. 写事件（FX/SFX）
- **确定性与可回放**：同输入序列 → 同结果（供 replay、测试、未来 rollback 用）。
  禁止 `Math.random()`，统一走 `core/rng.ts`（xorshift，seed 进世界状态）。
- 命中停顿（hitstop）是**全局帧冻结**：冻结期间角色与碰撞不推进，计时器与 FX 照常。

## 5. 渲染

- 逻辑 320×224 → 画布按整数倍缩放（取 `floor(min(w/320,h/224))`，不足 1 则用浮点缩放），黑边居中。
- 角色 = **骨架姿势**（head/torso/hip + 四肢）逐帧关键姿势（不做插值，保留 2D 格斗的逐帧手感），
  用 `Path2D` 描边 + 填色，色板由角色数据提供（京=黑外套白衬、庵=红衣黑裤…）。
  姿势数据 `render/poses.ts` 以「动作名 + 帧号」索引，招式数据只引用动作名。
- 舞台：2~3 层视差 + 地面纹理（程序化），镜头跟随中点并按双方距离缩放（KOF97 式变焦）。
- 特效：命中火花（`fx.ts` 粒子/闪白/屏幕震动）、残影、雾气。

## 6. 帧数据格式（`src/data/schema.ts`）

```ts
type Guard = 'high' | 'low' | 'all' | 'unblockable';

interface HitDef {
  box: [x, y, w, h];        // 相对角色原点，向右侧；朝左自动镜像
  frames: [start, end];     // 判定生效帧（含端点，从招式第 0 帧算）
  damage: number;
  hitStun: number;          // 受击硬直
  blockStun: number;        // 防御硬直
  hitstop: number;          // 双方命中停顿
  guard: Guard;             // 可防御方式（low 需要蹲防）
  level: 'high' | 'mid' | 'low' | 'overhead';
  knockdown?: 'none' | 'slam' | 'trip' | 'air';
  pushback: number;         // 命中后退
  hitId: string;            // 同招式多段判定用不同 id
}

interface MoveDef {
  id: string; name: string;
  anim: string;             // 渲染姿势名
  total: number;            // 总帧数（含硬直）
  hits: HitDef[];
  input?: InputSpec;        // 必杀技指令（236/623/214/蓄力/连打/投）
  meter?: number;           // 消耗气槽（超必杀）
  invuln?: { frames: [number, number]; kind: 'full' | 'air' | 'throw' }[];
  cancel?: { onHit?: string[]; onBlock?: string[]; window?: [number, number] };
  juggle?: { max: number };
  proj?: ProjectileDef;     // 飞行道具
}

interface CharDef {
  id: string; name: string; palette: Palette;
  hp: number; walk: [fwd: number, back: number]; jump: { vy: number; vx: number; frames: number };
  moves: Record<string, MoveDef>;   // key = 招式 id（5A/2B/63214P/Super…）
  poses: Record<string, Pose>;      // 动作名 → 姿势序列
}
```

- **招式键名约定**：`5A 5B 5C 5D / 2A 2B 2C 2D / jA jB jC jD / CD`（吹飞）`/ AB`（回避）
  `6A` 类为指令通常技；必杀技用指令串命名（`236P`, `623K`, `214P`, `[4]6P`），超必杀加 `_dm` 后缀。
- 每个招式必须有：`total` ≥ 所有 `hits[].frames[1]`，且有至少一个判定盒（投技/移动技除外）——
  `tests/data.test.ts` 校验这条。

## 7. KOF97 系统清单（实现对照表）

| 系统 | 行为要点 | 状态 |
| --- | --- | --- |
| 3v3 组队战 | 胜者保留剩余血量继续打，KO 后换人入场演出 | 待 T10 |
| 气槽 | 攻防积攒；满槽可放超必杀；MAX 模式（ABC）消费满槽强化 | 待 T11 |
| 紧急回避（A+B） | 前后翻滚，无敌帧 + 收招可被打 | 待 T11 |
| 吹飞攻击（C+D） | 击倒、撞墙追加伤害 | 待 T11 |
| CD 返し | 防御中 C+D 反击，消耗气槽 | 待 T11 |
| 投技 | 近身 →/← + C/D，解投 | 待 T11 |
| 受身 | 落地瞬间 A+B 翻滚起身 | 待 T11 |
| 气绝 | 气绝槽攒满进入晕眩，连打恢复 | 待 T11 |
| 连段补正 | 连段中后续伤害递减 | 待 T11 |
| 小跳跃 | 轻点上是小跳（低跳） | 待 T11 |
| 相杀/相打 | 同帧互中即双方受击 | T2 |
| 防御硬直/削防 | 连续防御累积破防（防御崩溃） | 待 T11 |
| 起身无敌 | 起身期间短暂无敌 | 待 T11 |
| BOSS | 大蛇/ゲーニッツ等，独立数值与专属演出 | 待 T16 |

## 8. 命令与自测

- `npm run dev` 本地开发；`npm run build` 产出 `dist/`；`npm run preview` 预览。
- `npm run check` = `tsc --noEmit` + `vitest run`（**提交门禁跑的就是这条**，必须秒级）。
- 新玩法必须同时给出 node 侧断言（`tests/`），不接受"肉眼看着对"。
