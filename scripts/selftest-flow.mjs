/**
 * 界面流程自测：标题 → 选人 → VS → 对战 → 结果 → 回标题。
 * 用真实键盘事件驱动，断言只读 `window.__kof.flow` / `match` 的真实状态。
 */
async (page) => {
  const wait = (ms) => page.waitForTimeout(ms);
  const report = [];
  const record = (name, value, expect) => {
    const pass = JSON.stringify(value) === JSON.stringify(expect);
    report.push(`${pass ? 'PASS' : 'FAIL'} ${name} = ${JSON.stringify(value)}${pass ? '' : ` (期望 ${JSON.stringify(expect)})`}`);
  };
  const key = (type, code) =>
    page.evaluate(([t, c]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [type, code]);
  const tapKey = async (code) => {
    await key('keydown', code);
    await wait(60);
    await key('keyup', code);
    await wait(90);
  };
  const snap = () =>
    page.evaluate(() => {
      const k = window.__kof;
      const m = k.match;
      return {
        screen: k.flow.screen,
        cursor: k.flow.cursor[0],
        locked: k.flow.locked[0],
        picks: k.flow.picks ? k.flow.picks.map((c) => c.id) : null,
        hasMatch: m !== null,
        phase: m ? m.phase : null,
        p1name: m ? m.p1.char.name : null,
        p2name: m ? m.p2.char.name : null,
      };
    });

  await page.goto('http://localhost:5174/');
  await wait(1200);
  record('开局在标题屏', (await snap()).screen, 'title');

  await tapKey('KeyJ'); // A = 开始 → 模式选择
  await wait(200);
  record('标题按 A 进模式选择', (await snap()).screen, 'mode');
  await tapKey('KeyJ'); // 选"街机模式"（第一项）
  await wait(200);
  const selecting = await snap();
  record('选街机模式后进选人屏', selecting.screen, 'select');

  await tapKey('KeyK'); // 方向？B 键？——用方向键更稳
  await key('keydown', 'ArrowRight');
  await wait(60);
  await key('keyup', 'ArrowRight');
  await wait(80);
  const moved = await snap();
  record('方向键能移动光标', moved.cursor, 1);

  await tapKey('KeyJ'); // 确定
  const lockedSnap = await snap();
  record('按 A 锁定选择', lockedSnap.locked, true);

  // CPU 24 帧后选定 → 进 VS
  await wait(600);
  const vs = await snap();
  record('双方确定后进 VS', vs.screen, 'vs');
  record('VS 时角色已固定', Array.isArray(vs.picks) && vs.picks.length === 2, true);

  await wait(1800); // VS 演出 90 帧
  const fight = await snap();
  record('VS 结束进入对战', fight.screen, 'fight');

  record('对局对象已建立', fight.hasMatch, true);

  // 选的是第二个角色（八神庵）
  record('P1 用的是选中的角色', fight.p1name, '八神庵');

  // 打完（直接压血）→ 结果屏。
  // 注意是 3v3：必须把对方换到最后一人，KO 才算"队伍被打空 = 整场结束"。
  await page.evaluate(() => {
    const m = window.__kof.match;
    m.p1.x = 220;
    m.p2.x = 260;
    m.p2.hp = 5;
    m.wins = [1, 0];
    m.indexes[1] = m.teams[1].length - 1;
  });
  await key('keydown', 'KeyU');
  await wait(80);
  await key('keyup', 'KeyU');
  await wait(2500);
  const result = await snap();
  record('KO 后进结果屏', result.screen, 'result');

  await wait(700);
  await tapKey('KeyJ');
  await wait(300);
  const back = await snap();
  record('结果屏按 A 回标题', back.screen, 'title');
  record('回标题后清掉上一场', back.picks, null);

  return report.join('\n') + `\n\nOVERALL: ${report.every((r) => r.startsWith('PASS')) ? 'ALL PASS' : 'HAS FAIL'}`;
}