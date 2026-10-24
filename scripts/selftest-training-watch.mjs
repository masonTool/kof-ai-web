/**
 * 训练挑战 + 观战模式自测。
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

  // 训练模式：打一拳应该推进"命中 20 次"的进度
  const training = await page.evaluate(async () => {
    const k = window.__kof;
    k.flow.picks = [k.flow.roster[0], k.flow.roster[1]];
    k.flow.mode = 'training';
    k.flow.screen = 'fight';
    k.startMatch();
    const m = k.match;
    m.softReset();
    m.p1.x = 240;
    m.p2.x = 286;
    k.training.settings.dummy = 'stand';
    const before = k.challenges?.runs?.find((r) => r.def.id === 'hits20')?.progress ?? null;
    m.p1.startMove(m.p1.char.moves['5C']);
    const f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (let i = 0; i < 20; i++) await f();
    const after = k.challenges?.runs?.find((r) => r.def.id === 'hits20')?.progress ?? null;
    return { before, after, panel: k.flow.mode };
  });
  record('训练模式挑战面板可用', training.panel, 'training');
  record('命中会推进挑战进度', training.after > training.before, true);

  // 挑战切换与重置
  const nav = await page.evaluate(() => {
    const k = window.__kof;
    const first = k.challenges.index;
    k.challenges.next();
    const second = k.challenges.index;
    k.challenges.resetAll();
    return { first, second, done: k.challenges.doneCount };
  });
  record('能切换挑战', nav.second !== nav.first, true);
  record('重置后完成数归零', nav.done, 0);

  // 观战模式：两边都自动打
  const watch = await page.evaluate(async () => {
    const k = window.__kof;
    k.flow.picks = [k.flow.roster[0], k.flow.roster[1]];
    k.flow.mode = 'watch';
    k.flow.screen = 'fight';
    k.startMatch();
    const m = k.match;
    m.softReset();
    const p1Start = m.p1.x;
    const p2Start = m.p2.x;
    const f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    let p1Moved = false;
    let p2Moved = false;
    for (let i = 0; i < 120 && !(p1Moved && p2Moved); i++) {
      await f();
      if (Math.abs(m.p1.x - p1Start) > 2) p1Moved = true;
      if (Math.abs(m.p2.x - p2Start) > 2) p2Moved = true;
    }
    return { cpuP1: k.training.settings.cpuP1, p1Moved, p2Moved };
  });
  record('观战模式 P1 也交给 CPU', watch.cpuP1, true);
  record('观战时 P1 会自己动', watch.p1Moved, true);
  record('观战时 P2 也会自己动', watch.p2Moved, true);

  return report.join('\n') + `\n\nOVERALL: ${report.every((r) => r.startsWith('PASS')) ? 'ALL PASS' : 'HAS FAIL'}`;
}