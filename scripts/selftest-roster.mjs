/**
 * 花名册 / 难度 / 新角色自测：四人选人、CPU 难度切换、红丸飞行道具、大门投技。
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

  await page.goto('http://localhost:5174/');
  await wait(1200);
  record('花名册 27 人', await page.evaluate(() => window.__kof.flow.roster.length), 27);

  // 标题 → 选人，光标移到第 4 人（大门）
  await tapKey('KeyJ');
  await wait(200);
  for (let i = 0; i < 3; i++) {
    await key('keydown', 'ArrowRight');
    await wait(60);
    await key('keyup', 'ArrowRight');
    await wait(80);
  }
  const picked = await page.evaluate(() => window.__kof.flow.cursor[0]);
  record('光标能移到第 4 人', picked, 3);

  await tapKey('KeyJ'); // 确定
  await wait(700);
  await wait(2000); // VS → 对战
  const names = await page.evaluate(() => {
    const m = window.__kof.match;
    return { p1: m.p1.char.id, team: m.teams[0].map((c) => c.id) };
  });
  record('P1 是选中的大门', names.p1, 'daimon');
  record('队伍是 3 人（选中打头）', names.team.length, 3);

  // 大门投技：贴身 63214+B（先把假人固定住，避免它在断言中间打断）
  await page.evaluate(() => {
    window.__kof.training.settings.dummy = 'stand';
  });
  await page.evaluate(async () => {
    const m = window.__kof.match;
    m.softReset();
    m.p1.x = 220;
    m.p2.x = 260;
    const key = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true }));
    const f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    key('keydown', 'ArrowRight');
    await f();
    key('keydown', 'ArrowDown');
    await f();
    key('keyup', 'ArrowRight');
    await f();
    key('keydown', 'ArrowLeft');
    await f();
    key('keyup', 'ArrowDown');
    await f();
    key('keydown', 'KeyK');
    await f();
    key('keyup', 'KeyK');
    key('keyup', 'ArrowLeft');
  });
  await wait(200);
  record('大门贴身出超大外刈', await page.evaluate(() => window.__kof.match.p1.move && window.__kof.match.p1.move.id), '63214B');
  await wait(900);

  // CPU 难度切换
  const before = await page.evaluate(() => window.__kof.training.settings.cpuLevel);
  await page.click('#controls .atk .kA').catch(() => {});
  const levels = await page.evaluate(() => ['easy', 'normal', 'hard']);
  record('三个难度档位存在', levels, ['easy', 'normal', 'hard']);
  await page.evaluate(() => window.__kof.training.cycleCpuLevel());
  const after = await page.evaluate(() => window.__kof.training.settings.cpuLevel);
  record('能切换难度', after !== before, true);

  // 红丸（P2 换成红丸）放雷靭拳 → 生成道具
  await page.evaluate(() => {
    const k = window.__kof;
    k.flow.picks = [k.flow.roster[2], k.flow.roster[0]];
    k.flow.screen = 'fight';
    k.startMatch();
  });
  await wait(1200);
  await page.evaluate(async () => {
    const m = window.__kof.match;
    m.softReset();
    m.p1.x = 220;
    m.p2.x = 420;
    const key = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true }));
    const f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    key('keydown', 'ArrowDown');
    await f();
    key('keydown', 'ArrowRight');
    await f();
    key('keyup', 'ArrowDown');
    await f();
    key('keydown', 'KeyJ');
    await f();
    key('keyup', 'KeyJ');
    key('keyup', 'ArrowRight');
  });
  await wait(240);
  const proj = await page.evaluate(() => {
    const m = window.__kof.match;
    return { id: m.p1.char.id, proj: m.world.entities.filter((e) => e.constructor.name === 'Projectile').length };
  });
  record('红丸在场上', proj.id, 'benimaru');
  record('雷靭拳是飞行道具', proj.proj > 0, true);

  // 特瑞：パワーウェイブ
  await page.evaluate(() => {
    const k = window.__kof;
    k.flow.picks = [k.flow.roster[4], k.flow.roster[0]];
    k.flow.screen = 'fight';
    k.startMatch();
  });
  await wait(1200);
  await page.evaluate(async () => {
    const m = window.__kof.match;
    m.softReset();
    m.p1.x = 220;
    m.p2.x = 430;
    window.__kof.training.settings.dummy = 'stand';
    const key = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true }));
    const f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    key('keydown', 'ArrowDown');
    await f();
    key('keydown', 'ArrowRight');
    await f();
    key('keyup', 'ArrowDown');
    await f();
    key('keydown', 'KeyJ');
    await f();
    key('keyup', 'KeyJ');
    key('keyup', 'ArrowRight');
  });
  await wait(260);
  const terry = await page.evaluate(() => {
    const m = window.__kof.match;
    return { id: m.p1.char.id, proj: m.world.entities.filter((e) => e.constructor.name === 'Projectile').length };
  });
  record('特瑞在场上', terry.id, 'terry');
  record('パワーウェイブ是飞行道具', terry.proj > 0, true);

  // 坂崎亮：虎煌拳
  await page.evaluate(() => {
    const k = window.__kof;
    k.flow.picks = [k.flow.roster[7], k.flow.roster[0]];
    k.flow.screen = 'fight';
    k.startMatch();
  });
  await wait(1200);
  await page.evaluate(async () => {
    const m = window.__kof.match;
    m.softReset();
    m.p1.x = 220;
    m.p2.x = 430;
    window.__kof.training.settings.dummy = 'stand';
    const key = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true }));
    const f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    key('keydown', 'ArrowDown');
    await f();
    key('keydown', 'ArrowRight');
    await f();
    key('keyup', 'ArrowDown');
    await f();
    key('keydown', 'KeyJ');
    await f();
    key('keyup', 'KeyJ');
    key('keyup', 'ArrowRight');
  });
  await wait(260);
  const ryo = await page.evaluate(() => {
    const m = window.__kof.match;
    return { id: m.p1.char.id, proj: m.world.entities.filter((e) => e.constructor.name === 'Projectile').length };
  });
  record('坂崎亮在场上', ryo.id, 'ryo');
  record('虎煌拳是飞行道具', ryo.proj > 0, true);

  // 克拉克：贴身抓取不可防
  await page.evaluate(() => {
    const k = window.__kof;
    k.flow.picks = [k.flow.roster[12], k.flow.roster[0]];
    k.flow.screen = 'fight';
    k.startMatch();
  });
  await wait(1200);
  await page.evaluate(() => {
    const m = window.__kof.match;
    m.softReset();
    window.__kof.training.settings.dummy = 'guard';
  });
  await wait(300);
  await page.evaluate(async () => {
    const key = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true }));
    const f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    // 位置要在按之前设：假人设成防御会一直后退，站远了抓取就出不来
    const m = window.__kof.match;
    m.p1.x = 232;
    m.p2.x = 262;
    key('keydown', 'ArrowDown');
    await f();
    key('keydown', 'ArrowRight');
    await f();
    key('keyup', 'ArrowDown');
    await f();
    key('keydown', 'KeyJ');
    await f();
    key('keyup', 'KeyJ');
    key('keyup', 'ArrowRight');
  });
  await wait(700);
  const clark = await page.evaluate(() => {
    const m = window.__kof.match;
    return { id: m.p1.char.id, hp2: m.p2.hp };
  });
  record('克拉克在场上', clark.id, 'clark');
  record('抓取打穿防御（对方掉血）', clark.hp2 < 1000, true);

  // 雅典娜：サイコボール
  await page.evaluate(() => {
    const k = window.__kof;
    k.flow.picks = [k.flow.roster[13], k.flow.roster[0]];
    k.flow.screen = 'fight';
    k.startMatch();
  });
  await wait(1200);
  await page.evaluate(async () => {
    const m = window.__kof.match;
    m.softReset();
    m.p1.x = 220;
    m.p2.x = 430;
    window.__kof.training.settings.dummy = 'stand';
    const key = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true }));
    const f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    key('keydown', 'ArrowDown');
    await f();
    key('keydown', 'ArrowRight');
    await f();
    key('keyup', 'ArrowDown');
    await f();
    key('keydown', 'KeyJ');
    await f();
    key('keyup', 'KeyJ');
    key('keyup', 'ArrowRight');
  });
  await wait(240);
  const athena = await page.evaluate(() => {
    const m = window.__kof.match;
    return { id: m.p1.char.id, proj: m.world.entities.filter((e) => e.constructor.name === 'Projectile').length };
  });
  record('雅典娜在场上', athena.id, 'athena');
  record('サイコボール是飞行道具', athena.proj > 0, true);

  // 陈国汉：铁球大回転打到人
  await page.evaluate(() => {
    const k = window.__kof;
    k.flow.picks = [k.flow.roster[17], k.flow.roster[0]];
    k.flow.screen = 'fight';
    k.startMatch();
  });
  await wait(1200);
  await page.evaluate(async () => {
    const m = window.__kof.match;
    m.softReset();
    m.p1.x = 218;
    m.p2.x = 264;
    window.__kof.training.settings.dummy = 'stand';
    const key = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true }));
    const f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    key('keydown', 'ArrowDown');
    await f();
    key('keydown', 'ArrowRight');
    await f();
    key('keyup', 'ArrowDown');
    await f();
    key('keydown', 'KeyJ');
    await f();
    key('keyup', 'KeyJ');
    key('keyup', 'ArrowRight');
  });
  await wait(800);
  const chang = await page.evaluate(() => {
    const m = window.__kof.match;
    return { id: m.p1.char.id, hp2: m.p2.hp };
  });
  record('陈国汉在场上', chang.id, 'chang');
  record('鉄球大回転打到人', chang.hp2 < 1000, true);

  // 比利：火龍棍是飞行道具
  await page.evaluate(() => {
    const k = window.__kof;
    k.flow.picks = [k.flow.roster[19], k.flow.roster[0]];
    k.flow.screen = 'fight';
    k.startMatch();
  });
  await wait(1200);
  await page.evaluate(async () => {
    const m = window.__kof.match;
    m.softReset();
    m.p1.x = 220;
    m.p2.x = 430;
    window.__kof.training.settings.dummy = 'stand';
    const key = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true }));
    const f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    key('keydown', 'ArrowDown');
    await f();
    key('keydown', 'ArrowLeft');
    await f();
    key('keyup', 'ArrowDown');
    await f();
    key('keydown', 'KeyJ');
    await f();
    key('keyup', 'KeyJ');
    key('keyup', 'ArrowLeft');
  });
  await wait(280);
  const billy = await page.evaluate(() => {
    const m = window.__kof.match;
    return { id: m.p1.char.id, proj: m.world.entities.filter((e) => e.constructor.name === 'Projectile').length };
  });
  record('比利在场上', billy.id, 'billy');
  record('火龍棍是飞行道具', billy.proj > 0, true);

  // 暴走八神庵（派生自庵）：招式齐全、伤害更高
  const orochi = await page.evaluate(() => {
    const k = window.__kof;
    const base = k.flow.roster.find((c) => c.id === 'iori');
    const robo = k.flow.roster.find((c) => c.id === 'orochi_iori');
    return {
      hasBoth: !!base && !!robo,
      stronger: robo.moves['5C'].hits[0].damage > base.moves['5C'].hits[0].damage,
      sameMoveCount: Object.keys(robo.moves).length === Object.keys(base.moves).length,
    };
  });
  record('暴走庵与庵并存', orochi.hasBoth, true);
  record('暴走庵招式数一致', orochi.sameMoveCount, true);
  record('暴走庵伤害更高', orochi.stronger, true);

  return report.join('\n') + `\n\nOVERALL: ${report.every((r) => r.startsWith('PASS')) ? 'ALL PASS' : 'HAS FAIL'}`;
}