/**
 * 浏览器自测脚本（playwright-cli run-code 用）。
 *
 * 目的：把"真的能打一局"这件事跑一遍——出招、必杀、取消连段、KO、下一回合、
 * 整场结束、重开、屏上按键点击。断言只读 `window.__kof` 里的真实状态，不看截图猜。
 */
async (page) => {
  const wait = (ms) => page.waitForTimeout(ms);
  const report = { steps: [], ok: true };

  const snap = () =>
    page.evaluate(() => {
      const m = window.__kof.match;
      return {
        phase: m.phase,
        round: m.round,
        wins: m.wins.slice(),
        banner: m.banner,
        p1: {
          x: Math.round(m.p1.x),
          state: m.p1.state,
          move: m.p1.move && m.p1.move.id,
          hp: m.p1.hp,
          meter: Math.round(m.p1.meter),
        },
        p2: { x: Math.round(m.p2.x), state: m.p2.state, hp: m.p2.hp },
      };
    });

  const record = (name, value, expect) => {
    const pass = expect === undefined ? true : JSON.stringify(value) === JSON.stringify(expect);
    if (!pass) report.ok = false;
    report.steps.push(
      `${pass ? 'PASS' : 'FAIL'} ${name} = ${JSON.stringify(value)}${expect === undefined ? '' : ` (期望 ${JSON.stringify(expect)})`}`,
    );
  };

  const key = (type, code) =>
    page.evaluate(([t, c]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [type, code]);

  /** 用页面内的 rAF 节奏喂方向，保证每帧都被采样到 */
  const motion = (frames, button) =>
    page.evaluate(
      async ([dirs, btn]) => {
        const tick = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const press = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true }));
        const codes = { down: 'ArrowDown', right: 'ArrowRight', left: 'ArrowLeft' };
        let held = [];
        for (const dir of dirs) {
          for (const d of held) if (!dir.includes(d)) press('keyup', codes[d]);
          for (const d of dir) if (!held.includes(d)) press('keydown', codes[d]);
          held = dir.slice();
          await tick();
        }
        press('keydown', btn);
        await tick();
        press('keyup', btn);
        for (const d of held) press('keyup', codes[d]);
      },
      [frames, button],
    );

  await page.goto('http://localhost:5174/');
  await wait(1500);
  record('开局进入对局', (await snap()).phase, 'fight');

  // 断言用：先把假人固定成木桩，避免它在断言中间插一手
  await page.evaluate(() => {
    window.__kof.training.settings.dummy = 'stand';
  });

  // ---- 1. 普通技
  await key('keydown', 'KeyJ');
  await wait(120);
  record('按 J 出轻拳', (await snap()).p1.move, '5A');
  await key('keyup', 'KeyJ');
  await wait(500);

  // ---- 2. 蹲下轻脚
  await key('keydown', 'ArrowDown');
  await wait(80);
  await key('keydown', 'KeyK');
  await wait(120);
  record('蹲下 K 出 2B', (await snap()).p1.move, '2B');
  await key('keyup', 'KeyK');
  await key('keyup', 'ArrowDown');
  await wait(500);

  // ---- 3. 必杀技 236+A
  await motion([['down'], ['down', 'right'], ['right']], 'KeyJ');
  await wait(100);
  record('236+A 出荒咬', (await snap()).p1.move, '236A');
  await wait(700);

  // ---- 4. 取消连段：5C 命中后接 236A
  await page.evaluate(() => {
    const m = window.__kof.match;
    m.softReset();
    m.p1.x = 220;
    m.p2.x = 260;
  });
  await wait(400);
  await key('keydown', 'KeyU');
  await wait(60);
  await key('keyup', 'KeyU');
  await wait(140);
  await motion([['down'], ['down', 'right'], ['right']], 'KeyJ');
  await wait(500);
  const cancelled = await snap();
  record('5C 命中后取消进荒咬', cancelled.p1.move, '236A');
  record('取消连段打掉了血', cancelled.p2.hp < 1000, true);
  record('连段让气槽上涨', cancelled.p1.meter > 0, true);

  // ---- 5. KO
  await page.evaluate(() => {
    const m = window.__kof.match;
    m.softReset();
    m.p1.x = 220;
    m.p2.x = 260;
    m.p2.hp = 30;
    m.p1.meter = 0;
  });
  await wait(200);
  await key('keydown', 'KeyU');
  await wait(60);
  await key('keyup', 'KeyU');
  await wait(700);
  const ko = await snap();
  record('KO 后回合结束', ko.phase, 'roundEnd');
  record('KO 横幅', ko.banner, 'K.O.');
  record('P1 拿到一胜', ko.wins[0], 1);

  // ---- 6. 第二回合
  await wait(2400);
  const r2 = await snap();
  record('进入第二回合', r2.round, 2);
  record('第二回合双方满血', r2.p2.hp, 1000);

  // ---- 7. 屏上按键：点 A 应该出轻拳
  const beforeClick = await snap();
  await page.click('#controls .atk .kA');
  await wait(120);
  const afterClick = await snap();
  record('点屏上 A 键出招', afterClick.p1.move === '5A' || afterClick.p1.state === 'attack', true);
  record('点按键不会让角色乱跑', Math.abs(afterClick.p1.x - beforeClick.p1.x) < 20, true);

  // ---- 8. 打完第二回合 → 整场结束 → 点重开
  await page.evaluate(() => {
    const m = window.__kof.match;
    m.softReset(); // 先把上一条测试留下的动作清干净
    m.p1.x = 220;
    m.p2.x = 260;
    m.p2.hp = 30;
  });
  await wait(300);
  await key('keydown', 'KeyU');
  await wait(60);
  await key('keyup', 'KeyU');
  await wait(700);
  await wait(2400);
  const over = await snap();
  record('赢两回合后整场结束', over.phase, 'over');
  record('整场胜者是 P1', over.wins[0], 2);

  const restartBtn = await page.$('#controls .bar .btn:last-child');
  await restartBtn.click();
  await wait(300);
  const restarted = await snap();
  record('点"再来一场"重开', restarted.wins, [0, 0]);
  record('重开后回到第 1 回合', restarted.round, 1);

  // ---- 9. 简易 CPU：切回 cpu 后对手会自己走过来打人
  await page.evaluate(() => {
    const k = window.__kof;
    k.training.settings.dummy = 'cpu';
    k.match.restart();
    k.match.p1.x = 256 - 48;
    k.match.p2.x = 256 + 48;
  });
  await page.waitForTimeout(1400);
  const cpuStart = await snap();
  await page.waitForTimeout(3500);
  const cpuEnd = await snap();
  record('CPU 会靠近', Math.abs(cpuEnd.p2.x - cpuEnd.p1.x) < Math.abs(cpuStart.p2.x - cpuStart.p1.x) + 30, true);
  record('CPU 会主动进攻（P1 掉血）', cpuEnd.p1.hp < 1000, true);

  return report.steps.join('\n') + `\n\nOVERALL: ${report.ok ? 'ALL PASS' : 'HAS FAIL'}`;
}