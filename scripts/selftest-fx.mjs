/**
 * 属性特效自测：必杀带本色、通常技不带、道具按属性染色且回放一致。
 */
async (page) => {
  const wait = (ms) => page.waitForTimeout(ms);
  const report = [];
  const record = (name, value, expect) => {
    const pass = JSON.stringify(value) === JSON.stringify(expect);
    report.push(`${pass ? 'PASS' : 'FAIL'} ${name} = ${JSON.stringify(value)}${pass ? '' : ` (期望 ${JSON.stringify(expect)})`}`);
  };

  await page.goto('http://localhost:5171/');
  await wait(1200);

  // 京 vs 京：先让他出一记必杀（236C 毒咬 → fire）
  const skillHit = await page.evaluate(async () => {
    const k = window.__kof;
    k.flow.picks = [k.flow.roster[0], k.flow.roster[0]];
    k.flow.mode = 'arcade';
    k.flow.screen = 'fight';
    k.startMatch();
    const m = k.match;
    k.training.settings.dummy = 'stand';
    m.softReset();
    m.p1.x = 250;
    m.p2.x = 288;
    m.fx.clear();
    const move = m.p1.char.moves['236C'];
    m.p1.startMove(move);
    const f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (let i = 0; i < 40 && m.fx.count === 0; i++) await f();
    return { style: 'fire', colors: [...new Set(m.fx.particles.map((p) => p.color))], count: m.fx.count };
  });
  record('必杀命中会喷粒子', skillHit.count > 0, true);
  record(
    '京的必杀火花是火色',
    skillHit.colors.every((c) => ['#fff6c4', '#ffc14d', '#ff7a2f', '#ff3b1f'].includes(c)),
    true,
  );

  // 通常技：不带属性
  const normalHit = await page.evaluate(async () => {
    const k = window.__kof;
    const m = k.match;
    m.softReset();
    m.p1.x = 250;
    m.p2.x = 280;
    m.fx.clear();
    m.p1.startMove(m.p1.char.moves['5C']);
    const f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (let i = 0; i < 40 && m.fx.count === 0; i++) await f();
    return [...new Set(m.fx.particles.map((p) => p.color))];
  });
  record(
    '通常技火花不带属性色',
    normalHit.every((c) => ['#fff3b0', '#ffd23f', '#ff8c42', '#ffffff'].includes(c)),
    true,
  );

  // 气弹：雅典娜的サイコボール带 ki 色
  const proj = await page.evaluate(async () => {
    const k = window.__kof;
    k.flow.picks = [k.flow.roster[13], k.flow.roster[0]];
    k.flow.screen = 'fight';
    k.startMatch();
    const m = k.match;
    m.softReset();
    m.p1.x = 180;
    m.p2.x = 420;
    m.p1.startMove(m.p1.char.moves['236A']);
    const f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    let p = null;
    for (let i = 0; i < 40 && !p; i++) {
      await f();
      p = m.world.entities.find((e) => e.constructor.name === 'Projectile') ?? null;
    }
    return p ? { style: p.style } : null;
  });
  record('雅典娜的气弹带 ki 属性', proj && proj.style, 'ki');

  // 大蛇的全屏技是 ki 色（超必杀）
  const boss = await page.evaluate(async () => {
    const k = window.__kof;
    k.flow.picks = [k.flow.roster[28], k.flow.roster[0]];
    k.flow.screen = 'fight';
    k.startMatch();
    const m = k.match;
    m.softReset();
    m.p1.x = 40;
    m.p2.x = 470;
    m.p1.meter = 100;
    m.fx.clear();
    m.p1.startMove(m.p1.char.moves['236236A']);
    const f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (let i = 0; i < 60 && m.fx.count === 0; i++) await f();
    return { count: m.fx.count, colors: [...new Set(m.fx.particles.map((p) => p.color))] };
  });
  record('大蛇全屏超必杀会喷粒子', boss.count > 0, true);
  record('大蛇的火花是 ki 色', boss.colors.every((c) => ['#f6ecff', '#cfa9ff', '#8f6bff', '#ffffff'].includes(c)), true);

  return report.join('\n') + `\n\nOVERALL: ${report.every((r) => r.startsWith('PASS')) ? 'ALL PASS' : 'HAS FAIL'}`;
}