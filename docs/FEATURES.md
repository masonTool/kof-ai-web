# 已实现的格斗机制清单

> 这份文档的存在原因：有一次连续三轮想加"受身""血条残影""小跳"，
> 结果每一样**早就实现了**，只是不在我记忆里。每次白查一遍代码、白设计一遍方案。
>
> 所以列清楚：哪些机制已经有了、在哪一行、怎么验证它真的在跑。
> 动手加新机制前先看这张表，别再重复实现。

## 攻防机制

| 机制 | 状态 | 实现位置 | 怎么验证它真的在跑 |
|---|---|---|---|
| 轻拳/重拳/轻脚/重脚 | ✅ | `data/chars/*.ts` 的 `moves`（5A/5C/5B/5D…） | 招式表（对局中按 L）能看到 |
| 蹲姿攻击 | ✅ | `moves` 的 2A/2B/2C/2D | 蹲下按键有独立动作 |
| 空中攻击 | ✅ | `moves` 的 jA~jD | 跳起按键 |
| **小跳 / 大跳** | ✅ | `Fighter.startJump()` + `smallJumpVy` + `jumpCut` | 轻点↑=小跳、按住↑=大跳（`stepAir` 里切） |
| 防御（站/蹲） | ✅ | `hit.ts` 的 `isGuarding()` | 按住后退，必杀也不掉血（磨血除外） |
| 防御磨血 / 崩防 | ✅ | `GUARD_CRUSH_MAX` / `guardCrush` 音效 | 连续防御会被破防 |
| **紧急回避（A+B）** | ✅ | `Btn.A \| Btn.B` → `roll` 动画，回避期间无敌 | CPU 现在也会用它躲大招（T206） |
| **受身（倒地 AB）** | ✅ | `fighter.ts` 的 `QUICK_WAKEUP_MIN` + `takeAbBuffer()` | 被打倒后立刻按 A+B 会快速起身 |
| **吹飞攻击（C+D）** | ✅ | `Btn.C \| Btn.D` | CPU 会用它破防（T206） |
| MAX 模式（ABC） | ✅ | `maxMode` + `MAX_MODE_DAMAGE` | 气槽满时按 ABC，伤害提升 |
| 投技 | ❌ **未实现** | 只有 `throwStart` 姿势，没有判定逻辑 | —— |
| 眩晕 | ✅ | `stunGauge` + `enterDizzy()` | 连续挨打会晕 |
| COUNTER（反击） | ✅ | `hit.ts` 的 `c.counter` | 对手出招瞬间打中，伤害更高 |

## 必杀与演出

| 机制 | 状态 | 位置 |
|---|---|---|
| 必杀技（236/623/214/421…） | ✅ | `CommandParser` + `SEQUENCES`，方向按朝向翻转 |
| 超必杀（236236 + AC） | ✅ | `moves` 的 236236AC，带气槽消耗 |
| 必杀 cancel | ✅ | `MoveDef.cancel.onHit`（每招可配） |
| **必杀专属姿势** | ✅ | `render/move-anim.ts` 的 `poseForMove()`，26 角色各有 4 个（T200） |
| 超必杀起手演出 | ✅ | `match.ts` 的 `checkSuperFlash()`：闪白 + 定格 + 镜头 1.85 |
| 超必杀命中特写 | ✅ | `superHit` + 镜头 2.35 + 双方定格 8 帧 |
| 普通必杀起手特效 | ✅ | 身前 12px 属性冲击环 + 震屏（T193） |
| 浮空追击 | ✅ | 空中不可防御 + 1.15 倍伤害（T207） |

## HUD 与反馈

| 机制 | 状态 | 位置 |
|---|---|---|
| **血条掉血残影** | ✅ | `hud.ts` 的 `p.trail` + `HUD_COLORS.trail` |
| 气槽 | ✅ | 打人/被打都会涨 |
| 队伍剩余人（小方块） | ✅ | `PlayerHud.teamLeft` |
| 回合胜利星 | ✅ | `PlayerHud.wins` |
| 必杀横幅 | ✅ | `match.moveBanner` + `drawMoveBanner()` |
| 连击数显示 | ✅ | `drawComboMeter()`（训练场） |

## 音频

| 机制 | 状态 | 位置 |
|---|---|---|
| 打击音（含手机中频补偿） | ✅ | `audio/sfx.ts` 的 `presence` 层 |
| 人声（3 种，带冷却） | ✅ | `voiceForWorldEvent()` |
| BGM（5 条曲，残血底鼓变奏） | ✅ | `audio/bgm.ts` |
| 单 AudioContext + 双总线 + 压缩器 | ✅ | `audio/graph.ts` |
| 音量分成 SFX / BGM 两条 | ✅ | 选项屏两行 |

## 模式与流程

| 机制 | 状态 | 位置 |
|---|---|---|
| 街机 8 场（含中 boss / 大蛇） | ✅ | `ui/arcade.ts` 的 `ARCADE_ROUTE` |
| 街机难度爬坡 | ✅ | `arcadeRules()`：easy×2 → normal×3 → hard×3 |
| 街机进度显示 | ✅ | `drawStageBadge()`：STAGE 3/8 |
| 通关专属结局 | ✅ | `ui/arcade-ending.ts`，29 角色各一条 |
| 双人对战 | ✅ | `flow.mode === 'versus'` |
| 训练模式 | ✅ | `ui/training.ts`：不损血 / 气无限 / 假人 / 判定框 / 帧数据 |
| 训练场连招演示 | ✅ | `ui/combo-demo.ts` 三套 + 逐帧回放 + 实际伤害回报 |
| 观战模式 | ✅ | `flow.mode === 'watch'` |
| 回放录制与播放 | ✅ | `game/replay.ts` 的 `ReplayRecorder` / `ReplayPlayer` |
| CPU 换人 | ✅ | `Match.tagOut()` + 残血 25% 触发（T208） |

## 素材管线

| 环节 | 命令 |
|---|---|
| 出基准图 | `node scripts/sprites/gen-base.mjs --char <id>` |
| 出姿势图（17 个） | `node scripts/sprites/gen-poses.mjs --char <id>` |
| 出必杀专属姿势（4 个，带重试） | `npm run art:special` |
| 打包图集 | `node scripts/sprites/build-sheet.mjs --char <id>` |
| 派生暴走变体 | `build-sheet.mjs --char orochi_iori --from iori --tint 255,50,40` |
| 出舞台底图 | `node scripts/sprites/gen-stages.mjs --only <id>` |
| 全量自检 | `npm run art:check` |

## 动手前请先确认

想加一个"经典格斗机制"之前，先在这张表里搜一下。已经踩过的坑是不必要的浪费。
