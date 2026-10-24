/**
 * 回放与移动端自测。
 * 回放的正确性用最硬的方式验：录 N 帧 → 记下当时的对局哈希 → 重演 N 帧 → 哈希必须一模一样。
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

  // 进对战，并按住右键一小会儿，让录像里有真实输入
  await page.evaluate(() => {
    const k = window.__kof;
    k.flow.picks = [k.flow.roster[0], k.flow.roster[1]];
    k.flow.mode = 'arcade';
    k.flow.screen = 'fight';
    k.startMatch();
  });
  await wait(1400);

  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true })));
  await wait(300);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight', bubbles: true })));
  await wait(200);

  const recorded = await page.evaluate(() => {
    const k = window.__kof;
    const frames = k.recordedFrames;
    const replay = k.stopRecording();
    return {
      frames,
      inputs: replay ? replay.inputs.length : 0,
      seed: replay ? replay.seed : null,
      teams: replay ? replay.teams : null,
      hashAtStop: k.match.hash(),
      hasMove: replay ? replay.inputs.some(([a, b]) => (a & 8) !== 0) : false, // 右方向位
    };
  });

  record('录制到了帧', recorded.frames > 10, true);
  record('回放帧数与录制一致', recorded.inputs, recorded.frames);
  record('录像里有真实输入（按过右）', recorded.hasMove, true);
  record('录像带上了种子与队伍', Array.isArray(recorded.teams) && typeof recorded.seed === 'number', true);

  // 重演：等回放跑完（每逻辑帧吃一帧输入）
  const started = await page.evaluate(() => {
    const k = window.__kof;
    return k.playReplay(k.lastReplay);
  });
  record('回放能起播', started, true);

  const deadline = Date.now() + 12000;
  let done = false;
  while (Date.now() < deadline) {
    done = await page.evaluate(() => window.__kof.replayDone);
    if (done) break;
    await wait(120);
  }
  record('回放播放完毕', done, true);

  const replayed = await page.evaluate(() => {
    const k = window.__kof;
    return { hash: k.match.hash(), frames: k.lastReplay.inputs.length };
  });
  record('重演后的对局哈希与原局一致', replayed.hash, recorded.hashAtStop);

  // 移动端：竖屏时叠"请横屏"，横屏时不叠
  const portrait = await page.evaluate(() => {
    const hint = document.getElementById('rotate-hint');
    return { exists: hint !== null, portraitRule: window.innerWidth < window.innerHeight };
  });
  record('页面上有竖屏提示层', portrait.exists, true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const rotated = await page.evaluate(() => ({
    shown: document.getElementById('rotate-hint').classList.contains('show'),
    width: window.innerWidth,
  }));
  record('竖屏时提示会出现', rotated.shown, true);

  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(400);
  const landscape = await page.evaluate(() => document.getElementById('rotate-hint').classList.contains('show'));
  record('横屏时提示消失', landscape, false);

  return report.join('\n') + `\n\nOVERALL: ${report.every((r) => r.startsWith('PASS')) ? 'ALL PASS' : 'HAS FAIL'}`;
}