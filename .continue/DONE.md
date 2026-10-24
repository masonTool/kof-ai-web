# 完成档案 · DONE

> 触发：队列里 `[ ]` / `[~]` 都没了 → 钩子下令**自动收尾**，把整份队列搬到这里
> （只有 `[阻塞]`、或打了勾却缺验证 / 自述"未验证、跳过"的条目，才先请用户拍板）。
>
> 搬的时候**原样照搬**，包括每条任务下方的完成说明（做了什么 / 为什么 / 怎么验证 / 批次号）——
> 这些说明是干活时当场写的，收尾不再重新组织、不再二次总结。
> 老队列没写说明的，才在这里补一段。
>
> 为什么不留在队列里：队列是"接下来做什么"，历史堆进去之后，"还剩什么"就一眼看不出来了。
>
> 本文件是**时间线**，只回答"第 N 批做了哪些条目、各自怎么做的"。
> 按模块看现状与坑 → `OVERVIEW.md`；机制与格式 → `README.md`。

## 归档格式

<!-- 下面是写法样例（用注释包住，避免假批次号被 grep 出来当成真归档）：

## 批次 <批次号> · <日期> · 会话 <会话 ID 前 8 位>

**这批的目标**：一句话概括这份队列要解决什么。

**条目**（原文照搬，状态保持原样，`[阻塞]` 也要带上；每条下方的完成说明一起搬）：

- [x] [T12] 给设置页加导入导出：`src/settings/io.ts` → `npm test` 全绿
  - 做了什么：抽出 `exportSettings()` / `importSettings()`，旧的内联逻辑删掉
  - 为什么：导入要校验 schema，散在组件里得改三处才能对齐
  - 验证：`npm test` 12 条通过；手点了一遍导入旧版本配置文件
  - 批次：<批次号>
- [阻塞] [T15] …（卡住原因 / 用户怎么处理的）

**遗留**：没做完的（`[阻塞]`、未处理的 `[发现]`）列在这里并在回复里交给用户；
用户确认要做的才落成 `TASKS.md` 的新 `T` 号，AI 不自己加。

-->

> 标题里只写批次号（= 队列头部的 `> 批次：`，一批一个号、恒定不变）。
> **不写 `提交 n→m`**：要写 `m` 就得先知道收尾提交之后的总数，而写这个数字本身又要一次提交，
> `m` 当场失效——这是个自指的死结，怎么改都追不上。
> 想知道这批动了多少次，用 `git log --oneline` 按批次号 grep，或看 `OVERVIEW.md` 的批次索引。

<!-- 实际归档放下面，最新的放最上面 -->

## 批次 20261025-0450 · 2026-10-25 · 会话 59bce766

**这批的目标**：给超必杀加"运镜"（拉近 + 黑边），并让战斗曲按对手变化。

**条目**（原文照搬，状态保持原样；每条下方的完成说明一起搬）：

- [x] [T106] 超必杀运镜（镜头拉近 + 上下黑边）：`src/sim/camera.ts` `src/game/match.ts` `src/render/renderer.ts` → `tests/camera.test.ts` `tests/match.test.ts` `tests/render.test.ts` 断言覆盖值生效/清除、镜头真的变焦、黑边两条且高度恒定
  - 做了什么：`Camera.zoomOverride`（设了就忽略"距离决定缩放"，平滑逼近覆盖值，左右夹取照旧）；`Match.stepSpectators()` 按 `superFlash` 设置/清除覆盖（`SUPER_CINEMA_ZOOM = 1.45`）；`drawFrame` 在闪光期间压上下黑边（`CINEMA_BAR = 20`），并且**先闪白再压黑边**——顺序反过来黑边会被冲淡成灰条
  - 为什么：覆盖值是"目标"而不是直接改 `zoom`，因为镜头是平滑逼近的，直接改会被下一帧的 `update()` 立刻拉回去；黑边画在闪白之上才有"电影感"
  - 验证：`tests/camera.test.ts` 3 条（覆盖生效、清除后回落、拉近后仍夹在舞台内）+ `tests/match.test.ts` 2 条（闪光期覆盖 / 结束后恢复、变焦真的超过 ZOOM_MAX）+ `tests/render.test.ts` 2 条（多画 2 条黑边、高度常量且不遮中间）
  - 批次：20261025-0450
- [x] [T107] 按对手挑战斗曲：`src/audio/bgm.ts` `src/main.ts` → `tests/bgm.test.ts` 断言 BOSS 优先、暗色系角色、名单无孤儿 id
  - 做了什么：新增 `fightDark` 曲子（140bpm triangle、小调半音下行）+ `DARK_FIGHTERS`（庵/暴走庵/暴走莉安娜/新面孔三人/ゲーニッツ/大蛇）+ 纯函数 `fightTrackFor(a, b, boss)`；`main.ts` 的 `trackFor()` 改调它
  - 为什么：暗色系角色配热血曲会出戏；判定抽成纯函数就能断言"谁打谁放什么"，不用真的去听
  - 验证：`tests/bgm.test.ts` 4 条（普通对战 fight、BOSS 优先 fightBoss、暗色角色 fightDark、名单 id 都是真角色）；浏览器里庵在场 → fightDark
  - 批次：20261025-0450
- [x] [T108] 运镜与 BGM 的浏览器自测：`scripts/selftest-superflash.mjs` → 13 项全 PASS
  - 做了什么：脚本扩到 13 项，加"运镜覆盖值设定/清除""镜头实际变焦""庵→暗色曲"
  - 为什么：镜头覆盖是"每帧重设"的状态，只有边跑边采样才抓得到（跑完再读已经归零）
  - 验证：13/13 PASS；`npm run check` 671 条全绿；截图确认黑边 + 拉近 + 白闪；`npm run build` 通过
  - 批次：20261025-0450

**遗留**：无 `[阻塞]`。还欠：手绘贴图层、胜利姿势逐角色区分、训练模式录制挑战。


## 批次 20261025-0400 · 2026-10-25 · 会话 59bce766

**这批的目标**：超必杀起手的"全场一静 + 一闪"，以及 BOSS 战专用 BGM。

**条目**（原文照搬，状态保持原样；每条下方的完成说明一起搬）：

- [x] [T103] 超必杀起手演出（双方定格 + 全屏闪白）：`src/sim/fighter.ts` `src/game/match.ts` `src/render/renderer.ts` → `tests/match.test.ts` `tests/render.test.ts` 断言起手点亮闪光、双方被定格、普通招不触发、逐帧衰减、进哈希、闪白层越接近结束越淡
  - 做了什么：`Fighter.justStartedMove`（"这一帧刚起手"，由 Match 消费后清空，解决"外部调 `startMove()` 时 `moveFrame` 已不是 0"）；`Match.superFlash` + `SUPER_FLASH_FRAMES=12` / `SUPER_FREEZE_FRAMES=10`，起手超必杀时给双方 `addHitstop`（复用命中停顿，不新增冻结机制）并设满闪光；`superFlash` 进 `hash()`；`drawFrame` 末尾按剩余帧画一层递减的白
  - 为什么：KOF 的超必杀起手是"全场一静 + 一闪"，这个停顿是节奏的一部分（也给了对方反应的心理压力）。用 hitstop 而不是新状态，是因为冻结逻辑已有且被验证过；闪光放 Match 而不是渲染层自己计时，是因为它必须和定格严格同步——分开算迟早出现"闪完了人还在定"
  - 验证：`tests/match.test.ts` 4 条（起手点亮 + 双方定格、普通必杀不触发、衰减到 0、闪光进哈希）+ `tests/render.test.ts` 2 条（无闪光不画、越接近结束越淡）
  - 批次：20261025-0400
- [x] [T104] BOSS 战专用 BGM：`src/audio/bgm.ts` `src/main.ts` → `tests/bgm.test.ts` 断言曲子存在、更快更低
  - 做了什么：新增 `fightBoss` 曲子（168bpm sawtooth、低音更密、半音上行的旋律）；`main.ts` 的 `trackFor()` 在任一角色带 `boss` 属性时切过去（含续关屏）
  - 为什么：BOSS 战和普通对战同一个 BGM，气势上就输了；判定条件用现有的 `char.boss` 属性，不新增字段
  - 验证：`tests/bgm.test.ts` 加 1 条（bpm 更高、低音更沉）；浏览器里大蛇在场 → `bgm.trackId === 'fightBoss'`、普通对战回到 `fight`
  - 批次：20261025-0400
- [x] [T105] 演出验收 + 浏览器自测：`scripts/selftest-superflash.mjs` → 8 项全 PASS
  - 做了什么：新增自测脚本；截图确认白闪覆盖整屏
  - 为什么：闪光/定格这类"看得见但不改判定"的东西，只有真出一次超必杀才能确认整条链没断
  - 验证：8/8 PASS；`npm run check` 660 条全绿；`npm run build` 通过
  - 批次：20261025-0400

**遗留**：无 `[阻塞]`。还欠：手绘贴图层、超必杀专属运镜（镜头拉近/黑边）、按队伍区分 BGM。


## 批次 20261025-0320 · 2026-10-25 · 会话 59bce766

**这批的目标**：补登场挑衅姿势，并让飞行道具"长得不一样"（球/波/火柱/风刃）。

**条目**（原文照搬，状态保持原样；每条下方的完成说明一起搬）：

- [x] [T100] 登场挑衅姿势：`src/render/poses.ts` `src/render/renderer.ts` → `tests/render.test.ts` 断言开场相位摆 taunt、开打后不覆盖、姿势在库里且循环
  - 做了什么：姿势库新增 `taunt`（抬手勾指、两帧循环）；`renderer.ts` 加 `introAnimFor(match)`——`intro` 相位期间双方都摆挑衅姿势，演出结束自动回到状态机
  - 为什么：KOF 的开场是"两个人摆好架势对视"的仪式，之前进场就是站着不动；用一个纯函数判断相位而不是给 Fighter 加状态，是因为这纯属表现层，模拟层不该多一个状态
  - 验证：`tests/render.test.ts` 加 2 条——intro 相位返回 taunt、fight 相位返回 null、taunt 在库里且 loop；截图确认两人都抬手
  - 批次：20261025-0320
- [x] [T101] 飞行道具形状（球/波/火柱/风刃）：`src/data/schema.ts` `src/data/fx-style.ts` `src/sim/projectile.ts` `src/render/renderer.ts` `src/render/ctx.ts` → `tests/render.test.ts` 断言四种形状画法各不相同、按属性自动推、招式可覆盖
  - 做了什么：`ProjectileShape` + `ProjectileDef.shape?`；`shapeOfProjectile(style, override)` 按属性推（火/暗火→flame、雷→wave、风→blade、其余→orb）；`Projectile` 生成时定下 `shape`；`drawProjectile()` 分四种画法（圆球三圆 + 尾巴 / 横向椭圆波 + 两道尾迹 / 三层火焰 + 内芯 / 双弧月牙）；`Ctx2D` 补 `ellipse()`、`arc()` 补 `ccw` 参数，FakeCtx 记账 `arcs`/`ellipses`
  - 为什么：之前所有道具都是同一个圆，火球和音速波除了颜色没区别；形状按属性推就不用给 29 个角色的招式逐个加字段，想特例再写 `shape`
  - 验证：`tests/render.test.ts` 加 5 条——orb 三圆、wave 三个横向椭圆、flame 四圆且越上越小、blade 双弧描边不填充、四种形状 `arcs/ellipses` 签名两两不同
  - 批次：20261025-0320
- [x] [T102] 浏览器自测：`scripts/selftest-intro-shapes.mjs` → 6 项全 PASS
  - 做了什么：验开场相位与时长、四种真实角色的道具形状（克里斯 flame / 红丸 wave / 雅典娜 orb / 莉安娜 blade）
  - 为什么：形状是"属性 → 形状"推出来的，只有真出招才能确认每个角色推对了
  - 验证：6/6 PASS；`npm run check` 653 条全绿；`npm run build` 通过
  - 批次：20261025-0320

**遗留**：无 `[阻塞]`。还欠：手绘贴图层、超必杀专属演出（镜头/闪白）、BGM 按队伍区分。


## 批次 20261025-0245 · 2026-10-25 · 会话 59bce766

**这批的目标**：补胜负演出——赢家摆胜利姿势、输家跪地、带角色专属台词。

**条目**（原文照搬，状态保持原样；每条下方的完成说明一起搬）：

- [x] [T98] 胜负演出与胜利台词：`src/data/chars/quotes.ts` `src/render/renderer.ts` `src/render/screens.ts` → `tests/quotes.test.ts` 断言 29 人都有台词、胜场轮换确定性、结束姿势按胜方取、台词框折行不溢出
  - 做了什么：新增 `data/chars/quotes.ts`（29 人 × 2~3 句胜利台词 + `winQuoteFor()` 按胜场数取模，**不用随机数**）；`renderer.ts` 导出 `resultAnimFor(match, side)`——整场结束后赢家摆 `win`、输家摆 `lose`，平局都不摆；`drawResult()` 改成"说话人 + 台词框"（把"某某 WINS"交给 HUD 中央横幅，避免屏幕正中两行重复）；`wrapText()` 按 22 字折行
  - 为什么：胜负是 KOF 的仪式感所在，但台词用随机数会让回放/录屏与原局对不上，而这里根本不需要真随机——按胜场取模既确定又"每赢一回合换一句"；`WINS` 交给 HUD 是因为 HUD 的 K.O. 横幅本来就一直在显示赢家，结果屏再画一次就是重复
  - 验证：`tests/quotes.test.ts` 12 条——29 人都有专属台词、表里无孤儿 id、每句非空且不超 40 字、胜场轮换与回绕、负数/超大胜场不取到 undefined、未知角色回落、进行中不覆盖姿势、赢家 win/输家 lose、P2 赢时反过来、平局都不摆、wrapText 折行、结果屏画出说话人与台词、长台词折 3 行且都在框内
  - 批次：20261025-0245
- [x] [T99] 演出验收：截图确认胜利/落败姿势与台词框排版
  - 做了什么：截图看"京举手胜利 + 庵弯身落败 + 台词框"，并修掉两处排版问题（正中两行重复的 WINS、说话人压住角色）
  - 为什么：演出这类东西单测只能断言"画了什么"，好不好看必须看图
  - 验证：`selftest-flow` 全 PASS（结果屏按 A 回标题仍正常）；`npm run build` 通过
  - 批次：20261025-0245

**遗留**：无 `[阻塞]`。还欠：登场演出（intro 姿势/入场台词）、手绘贴图层、必杀技专属弹道形状。


## 批次 20261025-0210 · 2026-10-25 · 会话 59bce766

**这批的目标**：让"火 / 暗火 / 雷 / 风 / 气"这些属性真正体现在画面上（命中特效 + 道具），把 29 人的打击感区分开。

**条目**（原文照搬，状态保持原样；每条下方的完成说明一起搬）：

- [x] [T95] 招式属性（火/暗火/雷/风/气）贯通到命中特效：`src/data/fx-style.ts` `src/data/schema.ts` `src/sim/hit.ts` `src/sim/projectile.ts` → `tests/fx-style.test.ts` 断言通常技不带属性、必杀按角色气质、招式显式 fx 优先、道具生成时定死风格、事件与结算都带 style
  - 做了什么：`schema.ts` 加 `FxStyle` 与 `MoveDef.fx?`；新增 `data/fx-style.ts`（29 人气质表 + `styleOfMove()` 三条规则）；`hit.ts` 的 `HitCandidate`/`HitResolution`/`hit`&`guard` 事件都带 `style`（近身取招式，道具取道具自带）；`projectile.ts` 在**生成那一刻**就把风格定在道具上（主人收招后不变）
  - 为什么：把属性放在招式/角色数据里而不是渲染层硬编码——"谁的火是紫的"是角色信息；道具必须自己记住风格，否则火球飞到一半主人收招，命中时就变成白火花了
  - 验证：`tests/fx-style.test.ts` 15 条——气质表无孤儿 id、值合法、主角团对得上、通常技/投技/系统技/指令技都无色、必杀按角色、显式 fx 优先、无招式返回 none、四档配色各不相同、火暖雷冷、命中粒子取自属性配色、雷比无属性更多更快、防御火花蓝白打底 + 一颗本色、同种子同属性完全一致
  - 批次：20261025-0210
- [x] [T96] 特效与道具的视觉区分（外发光 + 气弹按属性染色）：`src/render/fx.ts` `src/render/renderer.ts` → `tests/fx-style.test.ts` 断言带属性粒子多画一圈光晕、气弹用属性色
  - 做了什么：`Particle.style` + `STYLE_SHAPE`（雷更炸、风更散）；`draw()` 给带属性粒子先铺一圈深色外发光（不然火和雷都是"白点点"）；`spawnGuard()` 带属性时多一颗本色火星；`renderer.ts` 的气弹按 `style` 取核心/内芯色
  - 为什么：只有亮色小方块的画面根本分不出属性——截图验收时发现"火和雷看起来一样"，外发光是把颜色"面积化"的最便宜做法
  - 验证：`npm run check` 633 条全绿（新增 16 条）；截图确认橙色/蓝色光晕可分辨
  - 批次：20261025-0210
- [x] [T97] 浏览器自测：`scripts/selftest-fx.mjs` → 6 项全 PASS
  - 做了什么：新增属性自测——京 236C 命中喷火色、5C 命中无色、雅典娜气弹 style=ki、大蛇全屏超必杀 ki 色
  - 为什么：属性链路跨了 数据 → 结算 → 事件 → 特效 四层，只有真打一拳才能确认没断
  - 验证：6/6 PASS；`selftest-systems`、`selftest-menu` 重跑通过；`npm run build` 通过
  - 批次：20261025-0210

**遗留**：无 `[阻塞]`。还欠：登场/胜利演出、手绘贴图层、必杀技专属弹道形状（现在只有颜色差异）。


## 批次 20261025-0135 · 2026-10-25 · 会话 59bce766

**这批的目标**：把键位真正做到可重绑，并给暂停菜单补"选项"入口。

**条目**（原文照搬，状态保持原样；每条下方的完成说明一起搬）：

- [x] [T92] 逐键重绑（设置里存自定义键位、按键屏捕获、覆盖预设）：`src/ui/settings.ts` `src/ui/keybind.ts` → `tests/keybind.test.ts` 断言自定义覆盖预设且旧键失效、同一键不能绑两个动作、非法键名被拒、读盘脏数据丢弃、捕获/取消/自动跳下一行
  - 做了什么：`settings.ts` 加 `KEY_ACTIONS`（9 个动作）、`CustomKeys`（只存与预设不同的项）、`keymapFor()`（先取预设再叠加，覆盖时**先删掉该动作原来的键**）、`keyLabelFor()`/`prettyKey()`、`setKey()`/`clearKeys()`；新增 `ui/keybind.ts` 的 `KeyBindMenu`（选玩家/选动作/捕获/取消/Esc 不绑定）；`flow.ts` 加 `keybind` 屏与选项屏末尾的"按键设置 →"入口，`optionsFrom` 记住"从模式来还是从暂停来"
  - 为什么：两套预设覆盖不了所有习惯（左手党、小键盘党），而重绑必须解决"一个动作两个键"——否则改完键旧键还在，用户会以为没生效；自定义只存增量，换预设时用户改过的键不会丢
  - 验证：`tests/keybind.test.ts` 15 条——无自定义等于预设、覆盖后旧键失效、左右互不影响、显示名（字母/箭头/空格/回车）、keyLabelFor、setKey 落盘、同键换动作时旧动作解绑、非法键名拒绝、clearKeys、读盘脏数据丢弃、菜单环绕/捕获时不动/切 P1P2/自动跳行/Esc 只取消
  - 批次：20261025-0135
- [x] [T93] 暂停里加"选项"入口 + 修掉菜单输入被两处消费：`src/ui/pause.ts` `src/main.ts` `src/render/screens.ts` → `tests/pause.test.ts` 断言四项与环绕；浏览器里暂停→选项→返回对战
  - 做了什么：`PAUSE_ITEMS` 加"选项"；`main.ts` 把按键屏的输入**独占**（`muteFlow`：进屏与离开后直到所有键松开，都喂 0 给 flow）；`screens.ts` 的 `drawOptions` 末尾加"按键设置"行、新增 `drawKeyBind`、选项屏行高收紧（7+1 行放得下）
  - 为什么：实测"按键屏按 B 返回"会被 flow 在同一帧又当成"退出选项屏"，一套按键两处消费必然打架；`muteFlow` 要等到**全部松开**才恢复，否则那个键的按住状态还会被算作新边沿
  - 验证：`tests/pause.test.ts` 更新为四项；浏览器自测里"暂停→选项→B 回对战"通过
  - 批次：20261025-0135
- [x] [T94] 浏览器自测（改键真的生效 / 暂停入口 / 不污染后续脚本）：`scripts/selftest-keybind.mjs` → 13 项全 PASS
  - 做了什么：新增 `scripts/selftest-keybind.mjs`（13 项）；脚本结尾清掉自己改的键位
  - 为什么：改键这条链只有真按键才能验（raw keydown → 菜单 → 设置 → 键盘映射 → 出招）；而键位是**持久化**的，不清掉会让后面所有脚本按 J 都不是轻拳
  - 验证：13/13 PASS；`selftest-menu`、`selftest-flow` 重跑通过；`npm run check` 614 条全绿
  - 批次：20261025-0135

**遗留**：无 `[阻塞]`。还欠：必杀技特效差异化、更细的美术（手绘贴图层）、BOSS 专用登场演出。


## 批次 20261025-0105 · 2026-10-25 · 会话 59bce766

**这批的目标**：让 29 个角色"看起来不是同一个人"——外观参数化 + 程序化绘制。

**条目**（原文照搬，状态保持原样；每条下方的完成说明一起搬）：

- [x] [T90] 角色外观参数（身高/壮实度/头大小/发型/配件）与程序化绘制：`src/render/looks.ts` `src/render/fighter-draw.ts` `src/render/renderer.ts` → `tests/looks.test.ts` 断言 29 人外观合法且无孤儿配置、壮实度真的改肢体粗细、秃头少一个圆、刺猬头/长发/马尾各有额外形状、配件多画东西、身高缩放 save/restore 成对、闪白不留深色块
  - 做了什么：新增 `render/looks.ts`——`Look`（height/build/head/hair/accessory）+ 29 名角色的外观表 + `lookFor()`（合并默认并夹范围）；`fighter-draw.ts` 把肢体粗细乘 `build`、以脚底为原点做 `scale(1, height)`、头发分五种画法（short/spiky/long/bald/ponytail）、配件四种（头带/帽子/面罩/墨镜）；`renderer.ts` 与 `screens.ts` 都按 `lookFor(char.id)` 传入
  - 为什么：29 人共用一套骨架 + 色板时，除了颜色完全分不清谁是谁（截图里大门和蔡宝奇一样高一样壮）；外观只暴露"四个能被程序化绘制"的旋钮，再细就要手绘（版权+工作量），那是 `assets.ts` 那条路。外观表放在独立文件而不是塞进 `CharDef`：外观是表现层的事，不该为了换个发型去动招式数据
  - 验证：`tests/looks.test.ts` 13 条——未知角色走默认、配置与默认合并、29 人外观全部在合法区间、外观表无孤儿 id、极端值被夹、build 越大线越粗、bald 比 short 少一个 arc、spiky/long/ponytail 比 short 多填充、四种配件都多画、身高缩放嵌套且 save/restore 成对、身高 1 不多套一层、闪白时配件也变白；`npm run check` 597 条全绿
  - 批次：20261025-0105
- [x] [T91] 外观的肉眼验收：`npm run dev` + 截图对比不同体型/发型 与 选人界面
  - 做了什么：截图对比 大门五郎（高、壮、光头）vs 蔡宝奇（矮、瘦、刺猬头）；确认 HUD 名字、判定、镜头都没受影响
  - 为什么：外观改的是渲染层，单元测试只能断言"画了更多/更粗"，好不好看必须看图
  - 验证：截图里身高差、体型差、发型差都读得出来；`npm run build` 通过
  - 批次：20261025-0105

**遗留**：无 `[阻塞]`。逐键重绑（T85）、暂停里的"选项"入口、更细的美术（手绘贴图层）仍未做。


## 批次 20261025-0010 · 2026-10-25 · 会话 59bce766

**这批的目标**：补回放（只录输入、靠确定性重演）与移动端适配（DPR/安全区/竖屏提示）。

**条目**（原文照搬，状态保持原样；每条下方的完成说明一起搬）：

- [x] [T86] 回放录制与重演（每帧输入 + 种子 + 队伍，重演后哈希逐步一致）：`src/game/replay.ts` `src/game/match.ts` → `tests/replay.test.ts` 断言录制/序列化往返、重演 300 帧哈希逐步相同、截断输入不崩、脏数据被拒绝
  - 做了什么：`game/replay.ts`——`ReplayRecorder`（每帧记 `[p1held, p2held]`）、`Replay`（版本/种子/**完整 MatchConfig**/队伍/输入）、`ReplayPlayer`（游标，录完给空输入不抛错）、`parseReplay`（外部 JSON 逐项消毒）、`matchFromReplay`（按种子与角色 id 重建对局）；`Match.hash()` 补上组队战的 `indexes`；`World` 暴露 `seed`
  - 为什么：只录输入不录画面，靠的是"同种子 + 同输入 = 同一场"；这也是一条免费的回归测试——回放对不上就说明确定性被破坏了。`config` 必须整份存：演出帧数不同，帧对齐就不同（第一版只存了局数/时间，重演直接偏）
  - 验证：`tests/replay.test.ts` 9 条——录制帧数与位掩码、finish 返回副本、**重演 300 帧每 50 帧哈希逐步相同**、截断到 60 帧仍一致、录完再 next 给空输入、reset 重播、JSON 往返、8 种脏数据返回 null、局数/时间夹取、未知角色抛错
  - 批次：20261025-0010
- [x] [T87] 移动端适配（DPR 上限、安全区、竖屏提示）：`src/render/scale.ts` → `tests/camera.test.ts` 断言 DPR 夹取、安全区扣减、竖屏判定阈值
  - 做了什么：`render/scale.ts` 加 `MAX_DPR=2` + `effectiveDpr()`、`SafeInsets` + `NO_INSETS`、`shouldRotate()`，`computeViewport` 支持第 4 个参数（安全区）并把 DPR 夹在 [1,2]
  - 为什么：手机上 3x 屏按 3x 渲染是纯浪费（像素画 2x 足够），DPR 不夹会明显掉帧；刘海/圆角不扣安全区会切掉血条；竖屏时画面只有拇指大，不如直接提示横屏
  - 验证：`tests/smoke.test.ts` 加 4 条——DPR 夹取（3→2、0.5→1、NaN→1）、安全区扣减后偏移不小于 inset、可用区域变小缩放跟着变小、竖屏判定（390×844 真、844×390 假、800×800 假）
  - 批次：20261025-0010
- [x] [T88] 接线（回放入口 + 竖屏提示层 + 安全区探针）：`src/main.ts` `index.html` → `npm run check` 全绿
  - 做了什么：`index.html` 加 `#safe-probe`（用 `env(safe-area-inset-*)` 做 padding，JS 读 computedStyle）与 `#rotate-hint` 覆盖层；`main.ts` 的 `resize()` 读安全区 + 切竖屏提示、`orientationchange` 延迟重排；录制挂在 `TrainingSession.lastInputs` 上（**录的是真正喂进模拟层的输入**，含 CPU 的）；F9 回放上一场（播完冻结画面）
  - 为什么：安全区必须真的读出来用掉，否则就是"写了没人读"（这个项目已经踩过一次 `invuln` 的坑）；录制若只录键盘输入，街机模式里 CPU 不在场，重演必偏——实测哈希差 5 帧就是这么来的
  - 验证：`npm run check` 584 条全绿；`npm run build` 通过
  - 批次：20261025-0010
- [x] [T89] 浏览器自测（录一段→回放一致；模拟手机竖屏出现提示）：`scripts/selftest-replay.mjs` → 跑通并贴结果
  - 做了什么：新增 `scripts/selftest-replay.mjs`（10 项）；加 `tests/training.test.ts` 两条锁住"lastInputs 记的是假人输入"
  - 为什么：回放的正确性只能端到端验——单测里录的是自己喂的输入，浏览器里才是"键盘 + CPU + 特效随机数"全都在跑的同一场
  - 验证：10/10 PASS（录制 114 帧、真人输入进录像、重演后**对局哈希与原局逐位相同**、竖屏提示出现/横屏消失）；`selftest-menu`、`selftest-audio-pause` 重跑通过
  - 批次：20261025-0010

**遗留**：无 `[阻塞]`。还欠：逐键重绑（T85）、美术提升、暂停里加"选项"入口。


## 批次 20261024-2330 · 2026-10-24 · 会话 59bce766

**这批的目标**：补声音（BGM）、补暂停、补键位选择——把"能玩"往"像个成品"再推一步。

**条目**（原文照搬，状态保持原样；每条下方的完成说明一起搬）：

- [x] [T81] BGM（音序器 + 三条曲子，跟随音量/暂停降音）：`src/audio/bgm.ts` → `tests/bgm.test.ts` 断言步长换算、循环回绕、区间取音符不重复不遗漏、静音不出声
  - 做了什么：`audio/bgm.ts`——`TrackDef`（bpm/每拍步数/循环步数/主旋律/贝斯/波形）+ `midiToHz` + `stepDurationMs`/`stepIndexAt` + `BgmPlayer`（游标式音序器，`advance(toMs)` 返回这段时间该奏的音）+ `TRACKS` 三条曲子（标题/战斗/结果）+ `WebAudioBgm`（每音一个振荡器、主音量节点、`setDucked` 暂停降音）
  - 为什么：音序器做成纯逻辑，才能在 node 里断言"150bpm 每拍 4 步 = 每步 100ms""循环一圈后音高与第一圈相同"，而不是靠耳朵；`advance` 用游标而不是每帧重算，重算会漏边界音或同一音触发两次
  - 验证：`tests/bgm.test.ts` 12 条——三条曲子的音符数组长度一致、A4=440、步长换算与循环回绕、分段推进与一次推进一致、时间不走不重复发音、循环一圈音高相同、reset 回到开头、账本 sink、无 AudioContext 不抛错、未知曲目当静音、休止符不会被当成 0 号音
  - 批次：20261024-2330
- [x] [T82] 暂停菜单（继续/重开/回标题，战斗冻结）：`src/ui/pause.ts` → `tests/pause.test.ts` 断言开关、上下环绕、确认返回动作
  - 做了什么：`ui/pause.ts` 的 `PauseMenu`（继续/重开本场/回到标题，上下环绕、确认返回动作并收起）；`render/screens.ts` 的 `drawPause`；`main.ts` 里 Esc 开关暂停、暂停时**世界完全不推进**（`world.tick` 不动）、BGM 降音、确认后分别执行继续/`match.restart()`/回标题
  - 为什么：暂停做成"外层冻结"而不是给模拟层加 `paused` 字段——模拟层不该知道 UI 状态；菜单状态机保持纯逻辑，node 里能直接断言环绕与动作
  - 验证：`tests/pause.test.ts` 6 条 + 浏览器 10 项（Esc 打开、`world.tick` 在 400ms 内不变、光标移动、确认后收起、重开把回合与胜场清零）
  - 批次：20261024-2330
- [x] [T83] 键位预设（默认 / WASD+GHJK，写进设置并即时生效）：`src/input/keyboard.ts` `src/ui/settings.ts` → `tests/settings.test.ts` 断言预设切换与键位表
  - 做了什么：`input/keyboard.ts` 加 `WASD_KEYMAP_P1`/`ARROWS_KEYMAP_P2`/`KEY_PRESETS`/`keyPresetAt()`，`KeyboardSource.setMap()` 支持运行时换表；`settings.ts` 加 `keyPreset`（第 7 行选项）；`main.ts` 每帧 `syncPreset()`，值变了就换映射（不重建监听）
  - 为什么：KOF 是街机，本来没有键位设置；网页版必须让左手党能用 WASD。预设而不是逐键重绑，是因为两套覆盖了绝大多数习惯，而逐键重绑的 UI 复杂度远高于收益（已记进 TASKS 后续）
  - 验证：`tests/settings.test.ts` 加"键盘预设显示与切换"；浏览器里切到预设 1 后按 D 能往右走、切回预设 0 后方向键能走
  - 批次：20261024-2330
- [x] [T84] 浏览器自测（BGM 起播、暂停冻结、换键位能走能打）：`scripts/selftest-menu.mjs` → 跑通并贴结果
  - 做了什么：新增 `scripts/selftest-audio-pause.mjs`（10 项）；顺带修了脚本里的一个真实陷阱——**设置是持久化的**，上个脚本把键位改成 WASD 后，下个脚本按方向键就会失效
  - 为什么：声音听不见，只能断言"该响的曲子被选中了"；暂停/键位这类改动只有真在浏览器里按一遍才敢说没坏
  - 验证：10/10 PASS；`selftest-menu.mjs`、`selftest-flow.mjs` 重跑通过；`npm run check` 568 条全绿；`npm run build` 通过
  - 批次：20261024-2330

**遗留**：无 `[阻塞]`。逐键重绑键盘记为 T85；还欠回放、移动端适配、美术提升。


## 批次 20261024-2250 · 2026-10-24 · 会话 59bce766

**这批的目标**：从"一条直线的主流程"补成"有模式、有选项、输掉能续关"的完整街机外壳。

**条目**（原文照搬，状态保持原样；每条下方的完成说明一起搬）：

- [x] [T77] 选项与存档（局数/时间/难度/音量/调试开关，localStorage 持久化）：`src/ui/settings.ts` → `tests/settings.test.ts` 断言默认值、非法输入回落默认、循环切换、存盘读盘往返、没有 localStorage 时不崩
  - 做了什么：`ui/settings.ts`——`GameSettings`（回合数/时间/难度/音量/帧数面板/判定框）、`sanitize()` 逐项消毒夹取、`SettingsStore`（注入 `StorageLike`，load/save/cycle/resetDefaults）、`optionRows()` 供界面渲染；存的是数值本身而不是下标
  - 为什么：localStorage 是用户能随便改的，读盘不消毒就是"改一下就崩"；存数值不存下标，以后选项顺序变了老存档不会错位；storage 做成注入，node 里用假 storage 就能测，隐私模式下传 null 也不会崩
  - 验证：`tests/settings.test.ts` 14 条——默认值、空对象/乱码回落、越界夹取、类型不对回落、合法值原样保留、切换自动存盘且新实例能读回、坏 JSON 不抛错、null storage 可用、左右循环与转一圈回落、难度顺序、开关取反、重置默认、六行选项文案
  - 批次：20261024-2250
- [x] [T78] 模式选择 + 选项屏 + 续关流程：`src/ui/flow.ts` → `tests/flow.test.ts` 断言 标题→模式→（街机/双人/训练/选项）、训练模式跳过 VS、输掉进续关倒计时、续关重开同一角色、超时回标题
  - 做了什么：`AppFlow` 加 `mode`（arcade/versus/training）与三块新逻辑——`mode` 屏（四项菜单）、`options` 屏（上下选行、左右/A 改值、B 返回）、`continue` 屏（倒计时 `continueFrames`=600 帧，按 A 续关沿用同一组 picks）；训练模式选完人**跳过 VS 直接开打**；双人对战 P2 用第二个输入源自己选人；街机模式输给 CPU 才进续关
  - 为什么：三种模式共用同一条主干，只在两处分叉（训练跳 VS、双人换 P2 输入源），分支越少越不容易写出"某模式专属 bug"；续关沿用 picks 而不是重新选人，才是 KOF 街机的体验
  - 验证：`tests/flow.test.ts` 扩到 26 条——标题→模式、四项菜单与环绕、街机进选人、双人等 P2 自己确定、训练跳过 VS、选项屏左右改值并写回设置、B 返回、六行都能选到、双方确定进 VS、结果屏锁 30 帧、输给 CPU 进续关、倒计时递减、按 A 续关沿用角色且计数 +1、超时回标题、双人输掉不进续关、reset 清 mode/continues
  - 批次：20261024-2250
- [x] [T79] 新屏绘制与接线（音量/局数/时间真的生效）：`src/render/screens.ts` `src/main.ts` `src/audio/sfx.ts` → `npm run check` 全绿 + 设置改动后 Match 参数跟着变
  - 做了什么：`render/screens.ts` 加 `drawMode`（高亮光标）/`drawOptions`（左右箭头提示）/`drawContinue`（大号倒计时）；`main.ts` 用 `SettingsStore(browserStorage())` 建 flow，开局把 回合数/时间/难度/音量/调试开关 灌进 `Match` 与 `TrainingSession`，音量走 `WebAudioSink.setVolume()`（静音不重建 AudioContext）；模式决定假人（训练=木桩、双人=人操、街机=CPU）
  - 为什么：设置必须"改了立刻生效且不用重启"；音量要能在运行时改，所以给音频 sink 加 `setVolume` 而不是重建实例（重建会丢 AudioContext 的解锁状态）
  - 验证：`npm run check` 548 条全绿；`npm run build` 通过
  - 批次：20261024-2250
- [x] [T80] 浏览器自测（走一遍 选项→街机→打完→续关）：`scripts/selftest-flow.mjs` → 跑通并贴结果
  - 做了什么：新增 `scripts/selftest-menu.mjs`（13 项）；改造既有三份自测适配"标题后多一屏模式选择"；修掉 `selftest-flow.mjs` 里"3v3 只打死一个人不算整场结束"的旧假设
  - 为什么：流程一改，之前所有"从标题一路按到对战"的脚本都会受影响——这类改动的回归只能靠真的从头按一遍
  - 验证：`selftest-menu.mjs` 13/13 PASS（含 localStorage 落盘、倒计时递减、续关沿用同一组角色）；`selftest-flow.mjs`、`selftest-roster.mjs`、`selftest-systems.mjs` 全部重跑通过
  - 批次：20261024-2250

**遗留**：无 `[阻塞]`。还欠：BGM、暂停菜单、按键自定义、回放、移动端适配、美术。


