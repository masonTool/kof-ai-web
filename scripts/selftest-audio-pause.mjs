/**
 * BGM / 暂停 / 键位预设自测。
 * 声音听不见，所以断言的是"该响的曲子被选中了、暂停时世界真的冻住、换键位之后 WASD 能走"。
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

  await page.goto('http://localhost:5171/');
  await wait(1200);
  // 设置是持久化的：上个脚本可能把键位改成了 WASD，这里先归零，
  // 否则"按方向键下移光标"会因为方向键没映射而失败（这一步本身也验证了持久化生效）。
  await page.evaluate(() => {
    const k = window.__kof;
    k.flow.settings.settings.keyPreset = 0;
    k.flow.settings.settings.volume = 0.25;
    k.flow.settings.save();
  });
  await wait(120);

  // 直接进对战
  await page.evaluate(() => {
    const k = window.__kof;
    k.flow.picks = [k.flow.roster[0], k.flow.roster[1]];
    k.flow.mode = 'arcade';
    k.flow.screen = 'fight';
    k.startMatch();
  });
  await wait(1400);

  const inFight = await page.evaluate(() => {
    const k = window.__kof;
    return { track: k.bgm.trackId, phase: k.match.phase };
  });
  record('对战时切到战斗曲', inFight.track, 'fight');
  record('对局已开始', inFight.phase, 'fight');

  // Esc 暂停
  await tapKey('Escape');
  const paused = await page.evaluate(() => ({ open: window.__kof.pause.open, cursor: window.__kof.pause.cursor }));
  record('Esc 打开暂停菜单', paused.open, true);

  // 世界冻结：记录时间轴，等 400ms 再看
  const t1 = await page.evaluate(() => window.__kof.match.world.tick);
  await wait(400);
  const t2 = await page.evaluate(() => window.__kof.match.world.tick);
  record('暂停时世界不推进', t2, t1);

  // 菜单下移到"重开本场"并确认 → 回合数回到 1
  await page.evaluate(() => {
    const m = window.__kof.match;
    m.wins = [1, 1];
    m.round = 3;
  });
  await tapKey('ArrowDown');
  const cursor = await page.evaluate(() => window.__kof.pause.cursor);
  record('暂停菜单能移动光标', cursor, 1);
  await tapKey('KeyJ');
  await wait(300);
  const restarted = await page.evaluate(() => ({
    open: window.__kof.pause.open,
    round: window.__kof.match.round,
    wins: window.__kof.match.wins,
  }));
  record('确认后菜单收起', restarted.open, false);
  record('重开本场把回合与胜场清零', [restarted.round, restarted.wins], [1, [0, 0]]);

  // 键位预设：切到 WASD 之后用 A/D 能走
  const before = await page.evaluate(() => {
    const k = window.__kof;
    k.flow.settings.settings.keyPreset = 1;
    k.flow.settings.save();
    k.match.softReset();
    return k.match.p1.x;
  });
  await wait(120);
  await key('keydown', 'KeyD'); // 预设 1 里 KeyD = 右
  await wait(300);
  await key('keyup', 'KeyD');
  const after = await page.evaluate(() => window.__kof.match.p1.x);
  record('换到 WASD 预设后 D 能往右走', after > before, true);

  // 换回默认预设，用方向键确认还能走
  const back = await page.evaluate(() => {
    const k = window.__kof;
    k.flow.settings.settings.keyPreset = 0;
    k.match.softReset();
    return k.match.p1.x;
  });
  await wait(120);
  await key('keydown', 'ArrowRight');
  await wait(300);
  await key('keyup', 'ArrowRight');
  const back2 = await page.evaluate(() => window.__kof.match.p1.x);
  record('换回默认预设后方向键能走', back2 > back, true);

  // 静音：音量为 0 时不会再新建 AudioContext 也不该抛错
  const muted = await page.evaluate(() => {
    const k = window.__kof;
    k.flow.settings.settings.volume = 0;
    k.audio.setVolume(0);
    k.bgm.setVolume(0);
    return k.audio.currentVolume;
  });
  record('音量能调到 0（静音）', muted, 0);

  return report.join('\n') + `\n\nOVERALL: ${report.every((r) => r.startsWith('PASS')) ? 'ALL PASS' : 'HAS FAIL'}`;
}