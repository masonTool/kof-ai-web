/**
 * 系统机制自测（playwright-cli run-code 用）：小跳/大跳、AB 回避、受身、MAX 模式、崩防。
 */
async (page) => {
  const wait = (ms) => page.waitForTimeout(ms);
  const report = [];
  const record = (name, value, expect) => {
    const pass = JSON.stringify(value) === JSON.stringify(expect);
    report.push(`${pass ? 'PASS' : 'FAIL'} ${name} = ${JSON.stringify(value)}${pass ? '' : ` (期望 ${JSON.stringify(expect)})`}`);
  };
  const snap = () =>
    page.evaluate(() => {
      const m = window.__kof.match;
      return {
        phase: m.phase,
        p1move: m.p1.move && m.p1.move.id,
        p1state: m.p1.state,
        p1y: Math.round(m.p1.y),
        p1x: Math.round(m.p1.x),
        maxMode: m.p1.maxMode,
        meter: Math.round(m.p1.meter),
        guard: Math.round(m.p1.guardGauge),
        hp: m.p1.hp,
        hudMax: m.toHudModel().p1.maxMode,
      };
    });
  const key = (type, code) =>
    page.evaluate(([t, c]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [type, code]);

  await page.goto('http://localhost:5171/');
  await wait(1400);
  await page.evaluate(() => {
    const k = window.__kof;
    k.flow.picks = [k.flow.roster[0], k.flow.roster[1]];
    k.flow.mode = 'arcade';
    k.flow.screen = 'fight';
    k.startMatch();
  });
  await wait(1200);
  await page.evaluate(() => {
    const k = window.__kof;
    k.training.settings.dummy = 'stand';
    k.training.settings.showFrameData = false;
  });

  // 小跳 vs 大跳：比较落回地面的耗时
  const jump = (holdFrames) =>
    page.evaluate(async (hold) => {
      const m = window.__kof.match;
      m.softReset();
      const key = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true }));
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      let frames = 0;
      let apex = 999;
      key('keydown', 'ArrowUp');
      for (let i = 0; i < 40; i++) {
        if (i === hold) key('keyup', 'ArrowUp');
        await frame();
        apex = Math.min(apex, m.p1.y);
        frames++;
        if (i > 2 && !m.p1.airborne) break;
      }
      key('keyup', 'ArrowUp');
      return { frames, apex: Math.round(apex) };
    }, holdFrames);
  const tap = await jump(2);
  const hold = await jump(20);
  record('小跳比大跳低', tap.apex > hold.apex, true);
  record('小跳滞空比大跳短', tap.frames < hold.frames, true);

  // AB 紧急回避
  await page.evaluate(() => window.__kof.match.softReset());
  await wait(200);
  await key('keydown', 'KeyJ');
  await key('keydown', 'KeyK');
  await wait(80);
  const dodge = await snap();
  await key('keyup', 'KeyJ');
  await key('keyup', 'KeyK');
  record('A+B 出紧急回避', dodge.p1move, 'AB');
  await wait(600);

  // MAX 模式：气满 + ABC
  await page.evaluate(() => {
    const m = window.__kof.match;
    m.softReset();
    m.p1.meter = 100;
  });
  await wait(300);
  await key('keydown', 'KeyJ');
  await key('keydown', 'KeyK');
  await key('keydown', 'KeyU');
  await wait(80);
  const max = await snap();
  await key('keyup', 'KeyJ');
  await key('keyup', 'KeyK');
  await key('keyup', 'KeyU');
  record('ABC 启动 MAX 模式', max.maxMode > 0, true);
  record('启动后扣掉一条气', max.meter, 0);
  record('HUD 显示 MAX MODE', max.hudMax, true);
  await wait(400);

  // 崩防：让 CPU 连续打，自己一直按住后退防御
  await page.evaluate(() => {
    const k = window.__kof;
    k.match.restart();
    k.training.settings.dummy = 'cpu';
    k.match.p1.x = 256 - 30;
    k.match.p2.x = 256 + 30;
  });
  await wait(900);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', bubbles: true })));
  let crushed = false;
  let maxGuard = 0;
  for (let i = 0; i < 60 && !crushed; i += 1) {
    await wait(200);
    const s = await snap();
    maxGuard = Math.max(maxGuard, s.guard);
    if (s.p1state === 'hit' && s.guard === 0 && maxGuard > 20) crushed = true;
    if (s.phase !== 'fight') break;
  }
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft', bubbles: true })));
  record('连续防御会累积削防值', maxGuard > 0, true);

  return report.join('\n') + `\n\nOVERALL: ${report.every((r) => r.startsWith('PASS')) ? 'ALL PASS' : 'HAS FAIL'}`;
}