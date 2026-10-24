/**
 * 超必杀演出 + BOSS 战 BGM 自测。
 * 闪光/定格这类"看得见但不改判定"的东西，必须真出一次超必杀才能确认。
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

  const flash = await page.evaluate(async () => {
    const k = window.__kof;
    k.flow.picks = [k.flow.roster[0], k.flow.roster[1]];
    k.flow.mode = 'arcade';
    k.flow.screen = 'fight';
    k.startMatch();
    const m = k.match;
    m.softReset();
    m.p1.x = 220;
    m.p2.x = 320;
    m.p1.meter = 100;
    const before = m.superFlash;
    m.p1.startMove(m.p1.char.moves['236236AC']);
    const f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await f();
    const peak = m.superFlash;
    const frozen = { p1: m.p1.hitstop, p2: m.p2.hitstop };
    for (let i = 0; i < 20; i++) await f();
    return { before, peak, frozen, after: m.superFlash };
  });
  record('平时没有闪光', flash.before, 0);
  // 起手那一帧设成 12，之后每帧减 1，所以测到的峰值是 11~12 都算对
  record('起手超必杀点亮闪光（接近满值）', flash.peak >= 10, true);
  record('双方都被定格', [flash.frozen.p1 > 0, flash.frozen.p2 > 0], [true, true]);
  record('闪光会衰减到 0', flash.after, 0);

  const normal = await page.evaluate(async () => {
    const k = window.__kof;
    const m = k.match;
    m.softReset();
    m.p1.x = 220;
    m.p2.x = 300;
    m.p1.startMove(m.p1.char.moves['236A']);
    const f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await f();
    return m.superFlash;
  });
  record('普通必杀不触发闪白', normal, 0);

  // BOSS 战 BGM：大蛇在场时应该切到 fightBoss
  const bossTrack = await page.evaluate(async () => {
    const k = window.__kof;
    k.flow.picks = [k.flow.roster[28], k.flow.roster[0]];
    k.flow.screen = 'fight';
    k.startMatch();
    const f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (let i = 0; i < 6; i++) await f();
    return { track: k.bgm.trackId, isBoss: k.match.p1.char.boss !== undefined };
  });
  record('BOSS 在场', bossTrack.isBoss, true);
  record('BOSS 战切到专用曲', bossTrack.track, 'fightBoss');

  const normalTrack = await page.evaluate(async () => {
    const k = window.__kof;
    k.flow.picks = [k.flow.roster[0], k.flow.roster[4]]; // 京 vs 特瑞：都不是暗色系
    k.flow.screen = 'fight';
    k.startMatch();
    const f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (let i = 0; i < 6; i++) await f();
    return k.bgm.trackId;
  });
  record('普通对战还是普通曲', normalTrack, 'fight');

  // 暗色系角色（庵）→ 暗色曲
  const darkTrack = await page.evaluate(async () => {
    const k = window.__kof;
    k.flow.picks = [k.flow.roster[1], k.flow.roster[0]]; // 八神庵
    k.flow.screen = 'fight';
    k.startMatch();
    const f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (let i = 0; i < 6; i++) await f();
    return k.bgm.trackId;
  });
  record('庵在场切到暗色曲', darkTrack, 'fightDark');

  // 运镜：闪光期间镜头拉近 + 上下黑边
  const cinema = await page.evaluate(async () => {
    const k = window.__kof;
    k.flow.picks = [k.flow.roster[0], k.flow.roster[1]];
    k.flow.screen = 'fight';
    k.startMatch();
    const m = k.match;
    m.softReset();
    m.p1.x = 240;
    m.p2.x = 300;
    m.p1.meter = 100;
    const before = m.cam.zoomOverride;
    m.p1.startMove(m.p1.char.moves['236236AC']);
    const f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    // 每个 f() 是两帧逻辑时间，闪光只有 12 帧 —— 必须边跑边记，跑完再读就已经归零了
    const samples = [];
    for (let i = 0; i < 10; i++) {
      await f();
      samples.push({ flash: m.superFlash, override: m.cam.zoomOverride, zoom: Math.round(m.cam.zoom * 100) / 100 });
    }
    const during = samples.find((s2) => s2.flash > 0) ?? { override: null, zoom: 0 };
    return { before, during, after: m.cam.zoomOverride };
  });
  record('平时没有运镜覆盖', cinema.before, null);
  record('闪光期间镜头拉近', cinema.during.override, 1.45);
  record('镜头实际变焦上去了', cinema.during.zoom > 1.2, true);
  record('闪完恢复自动镜头', cinema.after, null);

  return report.join('\n') + `\n\nOVERALL: ${report.every((r) => r.startsWith('PASS')) ? 'ALL PASS' : 'HAS FAIL'}`;
}