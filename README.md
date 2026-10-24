# KOF'97 Web

拳皇'97（KOF'97 / MVS 版）的 Web 复刻：3v3 组队战 + KOF97 系统机制，逻辑固定 **60Hz 逐帧**，渲染 Canvas 2D，TypeScript 全量重写。
美术与音频**不使用原版素材**（版权），角色用程序化骨架绘制、音效由代码合成。

## 环境要求

- Node.js **≥ 20.19**（或 ≥ 22.12；Vite 7 的要求），本项目在 Node 23 上开发
- npm（仓库带 `package-lock.json`）
- 浏览器：支持 ES2022 的现代浏览器（Chrome / Edge / Safari 近期版本）

## 快速开始

```bash
npm install      # 安装依赖（只有 devDependencies，运行期零依赖）
npm run dev      # 启动开发服务器，默认 http://localhost:5173
```

打开浏览器后直接就能开打：目前入口是「训练模式 + 京 vs 京」的一局对战。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | Vite 开发服务器（热更新） |
| `npm run build` | `tsc --noEmit` + 生产构建，产物在 `dist/` |
| `npm run preview` | 本地预览 `dist/` 构建产物 |
| `npm run typecheck` | 只做类型检查（`tsc --noEmit`） |
| `npm test` | Vitest 跑 `tests/**/*.test.ts`（node 环境，headless） |
| `npm run check` | 类型检查 + 全部测试，**提交门禁就是这条** |

构建产物是纯静态站点（`vite.config.ts` 里 `base: './'`），`dist/` 可以直接丢到任意静态服务器或子目录，不需要后端。

## 操作

### 1P（左侧）

| 动作 | 按键 |
| --- | --- |
| 移动 / 蹲 / 跳 | `←` `→` / `↓` / `↑` |
| A（轻拳） | `J` |
| B（轻脚） | `K` |
| C（重拳） | `U` |
| D（重脚） | `I` |
| START | `Enter` |

### 2P（右侧，本地双人）

| 动作 | 按键 |
| --- | --- |
| 移动 / 蹲 / 跳 | `A` `D` / `S` / `W` |
| A（轻拳） | `G` |
| B（轻脚） | `H` |
| C（重拳） | `T` |
| D（重脚） | `Y` |
| START | `Space` |

键位定义在 `src/input/keyboard.ts` 的 `DEFAULT_KEYMAP_P1` / `DEFAULT_KEYMAP_P2`，改那里即可，不用动玩法代码。
手柄输入源已在 `src/input/gamepad.ts`（死区 0.4），尚未接到入口。

### 调试 / 训练热键

| 按键 | 作用 |
| --- | --- |
| `F1` | 显示判定框（红=受击框、黄=攻击框、蓝=推挤框） |
| `F2` | 显示帧数 / 状态 / 招式面板 |
| `F3` | 无限气槽 |
| `F4` | 无限血量 |
| `F5` | 切换假人行为（站 / 站防 / 蹲防 / 蹲 / 跳 / 人类接管） |
| `R` | 软重置本局 |

## 目录结构

```
src/
  core/      固定步长循环、输入位掩码、确定性随机、哈希
  sim/       世界推进、角色状态机、物理、碰撞、命中判定、镜头、连段（纯逻辑）
  data/      帧数据表：schema、chars/（角色）、moves（招式）
  input/     键盘 / 手柄输入源、指令缓冲与 236/623/214 等指令识别
  render/    Canvas 绘制：整帧组装、骨架姿势、舞台、HUD、特效、资源层
  game/      对局流程（回合 / 胜负 / 重置）
  ui/        训练模式与调试面板
tests/       与 src 同构的 Vitest 断言
docs/        ARCHITECTURE.md（技术口径，改架构先改它）
```

两条硬规则（`docs/ARCHITECTURE.md` 有完整说明）：

1. `src/sim/` 与 `src/data/` **不许 import DOM / Canvas**——它们必须能在 node 里 headless 跑，否则无法测试、无法回放。
2. 每个玩法改动都要在 `tests/` 里加 node 断言，不接受"肉眼看着对"。

## 当前进度

已打通「能打起来的一局」：确定性内核（60Hz、可回放哈希）、帧数据状态机、命中/防御/连段补正、指令识别、本地双人（两套键盘）、草薙京 24 招、程序化舞台与 KOF97 布局 HUD、三局两胜流程、训练模式。

尚未实现（对应 `docs/ARCHITECTURE.md` §7 的对照表）：选人界面、3v3 组队战、气槽消费与 MAX 模式（槽值与 HUD 已有，超必杀消耗/强化未接）、紧急回避、吹飞、投技、受身、气绝、小跳、BOSS、其余 23 名角色。

进度与需求编号记在 `.continue/`：`TASKS.md`（长期需求）、`OVERVIEW.md`（按模块看已实现什么）、`DONE.md`（历史批次）。

## 更多文档

- `docs/ARCHITECTURE.md` — 技术栈、模拟内核口径、帧数据格式、KOF97 系统对照表
- `AGENTS.md` — 协作与工作流约定
