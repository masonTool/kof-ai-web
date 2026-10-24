/**
 * 登场演出 + 飞行道具形状自测：
 * - 开场相位角色摆挑衅姿势；
 * - 火→火柱、雷→波、气→球（按属性自动推形状，不用逐个角色写）。
 */
async (page) => {
  const wait = (ms) => page.waitForTimeout(ms);
  const report = [];
  const record = (name, value, expect) => {
    const pass = JSON.stringify(value) === JSON.stringify(expect);
    report.push(`${pass ? 'PASS' : 'FAIL'} ${name} = ${JSON.stringify(value)}${pass ? '' : ` (期望 ${JSON.stringify(expect)})`}`);
  };

  await page.goto('http://localhost:5174/');
  await wait(1200);

  // 开场演出
  const intro = await page.evaluate(async () => {
    const k = window.__kof;
    k.flow.picks = [k.flow.roster[0], k.flow.roster[1]];
    k.flow.mode = 'arcade';
    k.flow.screen = 'fight';
    k.startMatch();
    const f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await f();
    return { phase: k.match.phase, introFrames: k.match.config.introFrames };
  });
  record('开局处于开场演出相位', intro.phase, 'intro');
  record('开场演出有时长（不是 0 帧）', intro.introFrames > 0, true);

  // 三种属性各出一个道具，看形状
  const shapes = await page.evaluate(async () => {
    const k = window.__kof;
    const out = {};
    const spawn = async (index, moveKey) => {
      k.flow.picks = [k.flow.roster[index], k.flow.roster[0]];
      k.flow.screen = 'fight';
      k.startMatch();
      const m = k.match;
      m.softReset();
      m.p1.x = 120;
      m.p2.x = 420;
      m.p1.startMove(m.p1.char.moves[moveKey]);
      const f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      let proj = null;
      for (let i = 0; i < 60 && !proj; i++) {
        await f();
        proj = m.world.entities.find((e) => e.constructor.name === 'Projectile') ?? null;
      }
      return proj ? { style: proj.style, shape: proj.shape } : null;
    };
    out.fire = await spawn(24, '236A'); // 克里斯：火
    out.thunder = await spawn(2, '236A'); // 二阶堂红丸：雷
    out.ki = await spawn(13, '236A'); // 雅典娜：气
    return out;
  });
  record('克里斯的火球是火柱', shapes.fire, { style: 'fire', shape: 'flame' });
  record('红丸的雷是电气波', shapes.thunder, { style: 'thunder', shape: 'wave' });
  record('雅典娜的气弹是圆球', shapes.ki, { style: 'ki', shape: 'orb' });

  // 风刃：莉安娜的投掷（wind）
  const blade = await page.evaluate(async () => {
    const k = window.__kof;
    k.flow.picks = [k.flow.roster[10], k.flow.roster[0]];
    k.flow.screen = 'fight';
    k.startMatch();
    const m = k.match;
    m.softReset();
    m.p1.x = 120;
    m.p2.x = 420;
    m.p1.startMove(m.p1.char.moves['214A']);
    const f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    let proj = null;
    for (let i = 0; i < 60 && !proj; i++) {
      await f();
      proj = m.world.entities.find((e) => e.constructor.name === 'Projectile') ?? null;
    }
    return proj ? { style: proj.style, shape: proj.shape } : null;
  });
  record('莉安娜的投掷是风刃', blade, { style: 'wind', shape: 'blade' });

  return report.join('\n') + `\n\nOVERALL: ${report.every((r) => r.startsWith('PASS')) ? 'ALL PASS' : 'HAS FAIL'}`;
}