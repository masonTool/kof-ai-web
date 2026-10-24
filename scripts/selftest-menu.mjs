/**
 * 菜单与续关自测：标题 → 模式选择 → 选项（改设置并落盘）→ 街机 → 打输 → 续关。
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
    await wait(120);
  };
  const snap = () =>
    page.evaluate(() => {
      const k = window.__kof;
      return {
        screen: k.flow.screen,
        modeCursor: k.flow.modeCursor,
        optionCursor: k.flow.optionCursor,
        settings: { ...k.flow.settings.settings },
        continues: k.flow.continues,
        continueLeft: k.flow.continueLeft,
        picks: k.flow.picks ? k.flow.picks.map((c) => c.id) : null,
      };
    });

  await page.goto('http://localhost:5171/');
  await wait(1200);
  await page.evaluate(() => window.localStorage.removeItem('kof97.settings'));
  await page.reload();
  await wait(1200);

  record('开局在标题', (await snap()).screen, 'title');
  await tapKey('KeyJ');
  record('标题按 A 进模式选择', (await snap()).screen, 'mode');

  // 光标移到"选项"（菜单项数量会变，直接按 id 定位，别写死几次下移）
  const optionsIndex = await page.evaluate(() => window.__kof.flow.constructor && 0);
  void optionsIndex;
  for (let i = 0; i < 6; i++) {
    const cur = await page.evaluate(() => {
      const f = window.__kof.flow;
      return { cursor: f.modeCursor, isOptions: f.modeCursor === 4 };
    });
    if (cur.isOptions) break;
    await tapKey('ArrowDown');
  }
  record('光标能移到选项', (await snap()).modeCursor, 4);
  await tapKey('KeyJ');
  const opt = await snap();
  record('进入选项屏', opt.screen, 'options');

  // 第一行是回合数，右键改一次
  const before = opt.settings.roundsToWin;
  await tapKey('ArrowRight');
  const after = await snap();
  record('右键能改设置', after.settings.roundsToWin !== before, true);

  const stored = await page.evaluate(() => window.localStorage.getItem('kof97.settings'));
  record('设置写进了 localStorage', stored !== null && stored.includes('roundsToWin'), true);

  await tapKey('KeyK'); // B 返回
  await wait(250); // 等这一帧走完，别在 B 刚按下的同一帧读屏
  record('B 返回模式选择', (await snap()).screen, 'mode');

  // 回到第一项（街机）并开始：直接设光标，不依赖要按几次上
  await page.evaluate(() => {
    window.__kof.flow.modeCursor = 0;
  });
  await wait(120);
  await tapKey('KeyJ');
  await tapKey('KeyJ'); // P1 确定
  await wait(700);
  await wait(2000);
  const fighting = await snap();
  record('进入对战', fighting.screen, 'fight');
  const picks = fighting.picks;

  // 让 CPU 赢：把 P1 换到最后一人再打死
  await page.evaluate(() => {
    const m = window.__kof.match;
    m.p1.hp = 5;
    m.p2.x = 250;
    m.p1.x = 260;
    m.indexes[0] = m.teams[0].length - 1;
  });
  await wait(150);
  await page.evaluate(() => {
    const m = window.__kof.match;
    m.p1.takeDamage(9999);
  });
  await wait(2600);
  const lost = await snap();
  record('输给 CPU 进续关屏', lost.screen, 'continue');
  record('续关倒计时在走', lost.continueLeft > 0 && lost.continueLeft < 600, true);

  await tapKey('KeyJ');
  await wait(600);
  const resumed = await snap();
  record('按 A 续关后重新开打', resumed.screen, 'fight');
  record('续关沿用同一组角色', resumed.picks, picks);
  record('续关次数 +1', resumed.continues, 1);

  return report.join('\n') + `\n\nOVERALL: ${report.every((r) => r.startsWith('PASS')) ? 'ALL PASS' : 'HAS FAIL'}`;
}