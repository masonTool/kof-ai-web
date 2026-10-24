/**
 * 按键重绑自测：选项 → 按键设置 → 把"轻拳"改到 Z → 回对战按 Z 能出招；
 * 另外验一下"暂停 → 选项 → 返回对战"这条入口。
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
    await wait(70);
    await key('keyup', code);
    await wait(110);
  };
  const snap = () =>
    page.evaluate(() => {
      const k = window.__kof;
      const m = k.match;
      return {
        screen: k.flow.screen,
        optionCursor: k.flow.optionCursor,
        customA: k.flow.settings.settings.customKeys.p1.a ?? null,
        capturing: k.keybind.capturing,
        move: m ? (m.p1.move && m.p1.move.id) : null,
        phase: m ? m.phase : null,
      };
    });

  await page.goto('http://localhost:5171/');
  await wait(1200);
  // 清掉存档，避免上一轮把键位改过（设置是持久化的）
  await page.evaluate(() => window.localStorage.removeItem('kof97.settings'));
  await page.reload();
  await wait(1200);

  // 标题 → 模式 → 选项
  await tapKey('KeyJ');
  for (let i = 0; i < 3; i++) await tapKey('ArrowDown');
  await tapKey('KeyJ');
  record('进入选项屏', (await snap()).screen, 'options');

  // 光标移到"按键设置"（最后一行 = 7 项设置之后）
  for (let i = 0; i < 7; i++) await tapKey('ArrowDown');
  const onRow = await snap();
  record('光标停在按键设置行', onRow.optionCursor, 7);
  await tapKey('KeyJ');
  record('进入按键设置屏', (await snap()).screen, 'keybind');

  // 第一行是"上"；先下移到"轻拳"（4 行），再改键
  for (let i = 0; i < 4; i++) await tapKey('ArrowDown');
  await page.evaluate(() => {
    window.__kof.keybind.row = 4; // 轻拳（保险起见直接对齐，不依赖上一步的行数）
  });
  await tapKey('KeyJ'); // 开始捕获
  record('进入捕获状态', (await snap()).capturing, true);
  await tapKey('KeyZ'); // 绑定 Z
  const bound = await snap();
  record('Z 绑到了轻拳', bound.customA, 'KeyZ');
  record('绑定后退出捕获', bound.capturing, false);

  // 返回：按键设置 → 选项 → 模式
  await tapKey('KeyK');
  record('B 回到选项屏', (await snap()).screen, 'options');
  await tapKey('KeyK');
  record('再按 B 回到模式选择', (await snap()).screen, 'mode');

  // 按键真的生效：进对战按 Z 出轻拳
  await page.evaluate(() => {
    const k = window.__kof;
    k.flow.picks = [k.flow.roster[0], k.flow.roster[1]];
    k.flow.mode = 'arcade';
    k.flow.screen = 'fight';
    k.startMatch();
    k.match.p1.x = 220;
    k.match.p2.x = 300;
  });
  await wait(1300);
  await tapKey('KeyZ');
  const punched = await snap();
  record('按 Z 出轻拳', punched.move, '5A');

  // 暂停 → 选项 → 返回对战
  // 注意：轻拳已经改到 Z，所以"确认"要用 Z（KeyJ 现在不是 A 了）
  await wait(400);
  await tapKey('Escape');
  await tapKey('ArrowDown');
  await tapKey('ArrowDown');
  await page.evaluate(() => {
    window.__kof.pause.cursor = 2; // 选项
  });
  await tapKey('KeyZ');
  await wait(200);
  record('暂停里能进选项', (await snap()).screen, 'options');
  await tapKey('KeyK');
  record('选项返回的是对战（不是模式）', (await snap()).screen, 'fight');

  // 收尾：把自己改的键位清掉，否则后面的脚本按 J 就不是"轻拳"了（设置是持久化的）
  await page.evaluate(() => {
    const k = window.__kof;
    k.flow.settings.clearKeys(1);
    k.flow.settings.clearKeys(2);
  });

  return report.join('\n') + `\n\nOVERALL: ${report.every((r) => r.startsWith('PASS')) ? 'ALL PASS' : 'HAS FAIL'}`;
}