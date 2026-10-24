/**
 * 3v3 与飞行道具的浏览器自测：选人进对局 → 打掉对面一人 → 对面换人 → 队伍图标递减。
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
      const hud = m.toHudModel();
      return {
        phase: m.phase,
        teamMode: m.teamMode,
        p1: m.p1.char.id,
        p2: m.p2.char.id,
        p1hp: m.p1.hp,
        p2hp: m.p2.hp,
        left1: hud.p1.teamLeft,
        left2: hud.p2.teamLeft,
        index2: m.indexes[1],
        proj: m.world.entities.filter((e) => e.constructor.name === 'Projectile').length,
      };
    });

  await page.goto('http://localhost:5174/');
  await wait(1200);
  await page.evaluate(() => {
    const k = window.__kof;
    k.flow.picks = [k.flow.roster[1], k.flow.roster[0]]; // P1 用八神（闇払い是飞行道具）
    k.flow.screen = 'fight';
    k.startMatch();
  });
  await wait(1200);
  await page.evaluate(() => {
    window.__kof.training.settings.dummy = 'stand';
    window.__kof.training.settings.showFrameData = false;
  });

  const start = await snap();
  record('开局是组队战', start.teamMode, true);
  record('双方队伍都有 2 人（当前花名册）', [start.left1, start.left2], [2, 2]);
  record('P1 是八神', start.p1, 'iori');

  // 闇払い：会生成飞行道具
  await page.evaluate(() => {
    const m = window.__kof.match;
    m.softReset();
    m.p1.x = 220;
    m.p2.x = 400;
  });
  await page.evaluate(async () => {
    const m = window.__kof.match;
    const key = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true }));
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    key('keydown', 'ArrowDown');
    await frame();
    key('keydown', 'ArrowRight');
    await frame();
    key('keyup', 'ArrowDown');
    await frame();
    key('keydown', 'KeyJ');
    await frame();
    key('keyup', 'KeyJ');
    key('keyup', 'ArrowRight');
  });
  await wait(300);
  const fired = await snap();
  record('放出来的东西是真的飞行道具', fired.proj > 0, true);
  await wait(700);

  // 打掉对面第一个人 → 换人
  await page.evaluate(() => {
    const m = window.__kof.match;
    m.softReset();
    m.p1.x = 220;
    m.p2.x = 260;
    m.p2.hp = 5;
    m.p1.hp = 800;
  });
  await wait(200);
  await page.evaluate(async () => {
    const key = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true }));
    key('keydown', 'KeyU');
    await new Promise((r) => setTimeout(r, 60));
    key('keyup', 'KeyU');
  });
  await wait(1200);
  const ko = await snap();
  record('KO 后进回合结束', ko.phase, 'roundEnd');

  await wait(2600);
  const swapped = await snap();
  record('对面换人了', swapped.index2, 1);
  record('换上的角色满血', swapped.p2hp, 1000);
  record('赢家保留残血', swapped.p1hp, 800);
  record('队伍图标递减', swapped.left2, 1);

  return report.join('\n') + `\n\nOVERALL: ${report.every((r) => r.startsWith('PASS')) ? 'ALL PASS' : 'HAS FAIL'}`;
}