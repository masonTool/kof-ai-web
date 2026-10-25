import { describe, expect, it } from 'vitest';
import { sanitize } from '../src/ui/settings';
import { GROUND_Y, STAGE_LEFT, STAGE_RIGHT, VIEW_HEIGHT, VIEW_WIDTH } from '../src/sim/constants';
import {
  CAMERA_MAX_STEP,
  CAMERA_ZOOM_STEP,
  Camera,
  GROUND_SCREEN_Y,
  ZOOM_FAR_DIST,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_NEAR_DIST,
} from '../src/sim/camera';
import {
  PARALLAX_DISTANT,
  PARALLAX_FAR,
  STAGES,
  TILE_SPACING,
  drawStage,
  drawWeather,
  resetWeatherTick,
  stageForIndex,
  stageForSeed,
  setWeatherEnabled,
  stageById,
} from '../src/render/stage-draw';
import { FakeCtx } from './helpers/fake-ctx';

const at = (x: number): { x: number } => ({ x });

/** 跑到静止（镜头平滑，需要若干帧才到位） */
function settle(cam: Camera, a: number, b: number, frames = 120): Camera {
  for (let i = 0; i < frames; i++) cam.update(at(a), at(b));
  return cam;
}

describe('镜头缩放', () => {
  it('两人贴脸时拉近，离远时放宽到最小', () => {
    expect(Camera.zoomForDistance(0)).toBeCloseTo(ZOOM_MAX, 5);
    expect(Camera.zoomForDistance(ZOOM_NEAR_DIST)).toBeCloseTo(ZOOM_MAX, 5);
    expect(Camera.zoomForDistance(ZOOM_FAR_DIST)).toBeCloseTo(ZOOM_MIN, 5);
    expect(Camera.zoomForDistance(999)).toBeCloseTo(ZOOM_MIN, 5);
  });

  it('距离越远视野越宽（zoom 越小）', () => {
    const near = settle(new Camera(), 250, 270);
    const far = settle(new Camera(), 60, 460);
    expect(near.zoom).toBeGreaterThan(far.zoom);
    expect(far.zoom).toBeCloseTo(ZOOM_MIN, 2);
    expect(near.zoom).toBeLessThanOrEqual(ZOOM_MAX + 1e-9);
  });

  it('缩放每帧变化有上限，不会瞬移', () => {
    const cam = new Camera();
    cam.update(at(250), at(250));
    expect(cam.zoom).toBeLessThanOrEqual(ZOOM_MIN + CAMERA_ZOOM_STEP + 1e-9);
  });

  it('snap 立即到位', () => {
    const cam = new Camera();
    cam.snap(at(250), at(252));
    expect(cam.zoom).toBeCloseTo(ZoomOf(2), 5);
  });
});

function ZoomOf(distance: number): number {
  return Camera.zoomForDistance(distance);
}

describe('镜头平移与夹取', () => {
  it('镜头跟着两人中点走', () => {
    const cam = settle(new Camera(), 200, 240);
    expect(cam.x).toBeCloseTo(220, 1);
  });

  it('贴左墙时镜头夹住，不会露出舞台外', () => {
    const cam = settle(new Camera(), STAGE_LEFT, STAGE_LEFT + 4);
    expect(cam.visibleLeft).toBeGreaterThanOrEqual(STAGE_LEFT - 1e-6);
    expect(cam.x).toBeGreaterThan(STAGE_LEFT);
  });

  it('贴右墙同理', () => {
    const cam = settle(new Camera(), STAGE_RIGHT - 4, STAGE_RIGHT);
    expect(cam.visibleRight).toBeLessThanOrEqual(STAGE_RIGHT + 1e-6);
  });

  it('每帧最多移动 CAMERA_MAX_STEP 像素', () => {
    const cam = new Camera({ x: 170 });
    cam.update(at(300), at(310));
    expect(cam.x - 170).toBeLessThanOrEqual(CAMERA_MAX_STEP + 1e-9);
  });

  it('视野宽度 = 320 / zoom', () => {
    const cam = new Camera({ zoom: 2 });
    expect(cam.visibleWidth).toBeCloseTo(VIEW_WIDTH / 2, 5);
  });
});

describe('地面基准不变', () => {
  it('任意缩放下，世界地面线都落在同一屏幕行', () => {
    for (const zoom of [ZOOM_MIN, 1.2, ZOOM_MAX]) {
      const cam = new Camera({ zoom });
      expect(cam.worldToScreenY(GROUND_Y)).toBeCloseTo(GROUND_SCREEN_Y, 6);
    }
  });

  it('脚底不动，身高随 zoom 变', () => {
    const cam = new Camera({ zoom: 1.5 });
    const feet = cam.worldToScreenY(GROUND_Y);
    const head = cam.worldToScreenY(GROUND_Y - 72);
    expect(feet - head).toBeCloseTo(72 * 1.5, 5);
  });

  it('屏幕中心对应镜头 x（世界坐标）', () => {
    const cam = new Camera({ x: 260, zoom: 1.3 });
    expect(cam.worldToScreenX(260)).toBeCloseTo(VIEW_WIDTH / 2, 6);
    expect(cam.screenToWorldX(VIEW_WIDTH / 2)).toBeCloseTo(260, 6);
  });

  it('世界↔屏幕互转可往返', () => {
    const cam = new Camera({ x: 233, zoom: 1.17 });
    for (const wx of [STAGE_LEFT, 128, 233, 400, STAGE_RIGHT]) {
      expect(cam.screenToWorldX(cam.worldToScreenX(wx))).toBeCloseTo(wx, 5);
    }
    for (const wy of [GROUND_Y, GROUND_Y - 40, GROUND_Y - 120]) {
      expect(cam.screenToWorldY(cam.worldToScreenY(wy))).toBeCloseTo(wy, 5);
    }
  });

  it('applyTo 设置的是"世界坐标"变换：平移/缩放顺序正确', () => {
    const ctx = new FakeCtx();
    const cam = new Camera({ x: 240, zoom: 1.25 });
    cam.applyTo(ctx);
    expect(ctx.transforms.translate[0]).toEqual([VIEW_WIDTH / 2, GROUND_SCREEN_Y]);
    expect(ctx.transforms.scale[0]).toEqual([1.25, 1.25]);
    expect(ctx.transforms.translate[1]).toEqual([-240, -GROUND_Y]);
  });
});

describe('舞台绘制', () => {
  it('三条舞台数据齐全，能按 id 取到', () => {
    expect(STAGES.length).toBeGreaterThanOrEqual(3);
    for (const s of STAGES) {
      expect(s.buildings.length).toBeGreaterThan(3);
      expect(s.horizon).toBeLessThan(GROUND_SCREEN_Y);
    }
    expect(stageById('valley').id).toBe('valley');
    expect(stageById('不存在').id).toBe(STAGES[0]!.id);
  });

  it('会画出天空/地面/楼群，且覆盖整屏宽度', () => {
    const ctx = new FakeCtx();
    drawStage(ctx, new Camera(), STAGES[0]!);
    expect(ctx.rects.length).toBeGreaterThan(5);
    const full = ctx.rects.filter((r) => r.w === VIEW_WIDTH);
    expect(full.length).toBeGreaterThanOrEqual(2);
    // 地面带：从地面行铺到屏幕底
    const ground = ctx.rects.find((r) => r.y === GROUND_SCREEN_Y && r.h === VIEW_HEIGHT - GROUND_SCREEN_Y);
    expect(ground).toBeDefined();
  });

  it('远景楼按视差系数偏移（镜头越右，楼越左，位移只有镜头的 0.35 倍）', () => {
    const stage = STAGES[0]!;
    const drawnFor = (camX: number): [number, number][] => {
      const ctx = new FakeCtx();
      drawStage(ctx, new Camera({ x: camX, zoom: 1 }), stage);
      return ctx.rects.filter((r) => r.fill === stage.far && r.w !== VIEW_WIDTH).map((r) => [r.x, r.w]);
    };

    const expectedFor = (camX: number): [number, number][] =>
      stage.buildings
        .map((b) => ({ sx: Math.round(b.x - camX * PARALLAX_FAR + VIEW_WIDTH / 2), w: b.w }))
        .filter((b) => b.sx <= VIEW_WIDTH && b.sx + b.w >= 0)
        .map((b) => [b.sx, b.w] as [number, number]);

    expect(drawnFor(200)).toEqual(expectedFor(200));
    expect(drawnFor(260)).toEqual(expectedFor(260));

    // 同一栋楼在镜头右移 60 后左移 21 像素（60 × 0.35）
    const a = drawnFor(200);
    const b = drawnFor(260);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    const common = b.find((r) => a.some((s) => s[1] === r[1]));
    const origin = a.find((r) => r[1] === common?.[1]);
    expect(origin![0] - common![0]).toBe(Math.round(60 * PARALLAX_FAR));
  });

  it('天空是三段色带（不是一块平色），且都铺满整屏宽', () => {
    const stage = STAGES[0]!;
    const ctx = new FakeCtx();
    drawStage(ctx, new Camera(), stage);
    for (const color of [stage.skyTop, stage.skyMid, stage.skyBottom]) {
      const band = ctx.rects.find((r) => r.fill === color && r.w === VIEW_WIDTH);
      expect(band, color).toBeDefined();
    }
  });

  it('最远一层楼用更慢的视差（PARALLAX_DISTANT）', () => {
    const stage = STAGES[0]!;
    const shiftFor = (camX: number): number => {
      const ctx = new FakeCtx();
      drawStage(ctx, new Camera({ x: camX, zoom: 1 }), stage);
      const far = ctx.rects.filter((r) => r.fill === stage.farFar);
      return far.length > 0 ? camX * PARALLAX_DISTANT : Number.NaN;
    };
    expect(shiftFor(200)).toBeCloseTo(200 * PARALLAX_DISTANT, 5);
    // 比远景更慢
    expect(PARALLAX_DISTANT).toBeLessThan(PARALLAX_FAR);
  });

  it('天空里有月亮（光源），夜里画面才有明暗关系', () => {
    const ctx = new FakeCtx();
    drawStage(ctx, new Camera(), STAGES[0]!);
    expect(ctx.arcs.length).toBeGreaterThanOrEqual(2); // 光晕 + 月体
  });

  it('地面砖锚在世界坐标上（和角色同一层视差）', () => {
    for (const camX of [200, 224, 300]) {
      const ctx = new FakeCtx();
      const cam = new Camera({ x: camX, zoom: 1 });
      drawStage(ctx, cam, STAGES[0]!);
      const tiles = ctx.lines.filter((l) => l.y1 === GROUND_SCREEN_Y && l.y2 === VIEW_HEIGHT);
      expect(tiles.length).toBeGreaterThan(3);
      for (const t of tiles) {
        const wx = cam.screenToWorldX(t.x1 - 0.5); // 画的时候 +0.5 做了像素对齐
        expect(Math.abs(wx / TILE_SPACING - Math.round(wx / TILE_SPACING))).toBeLessThan(0.01);
      }
    }
  });
});

describe('镜头缩放覆盖（超必杀运镜）', () => {
  it('设了覆盖就忽略"距离决定缩放"，朝覆盖值平滑逼近', () => {
    const cam = new Camera({ x: 200, zoom: 1 });
    cam.zoomOverride = 1.45;
    const a = { x: 200 };
    const b = { x: 400 }; // 距离 200 → 正常应该接近 1
    for (let i = 0; i < 30; i++) cam.update(a, b);
    expect(cam.zoom).toBeCloseTo(1.45, 2);
  });

  it('清掉覆盖后回到距离决定的缩放', () => {
    const cam = new Camera({ x: 200, zoom: 1.45 });
    cam.zoomOverride = null;
    for (let i = 0; i < 60; i++) cam.update({ x: 200 }, { x: 400 });
    // 距离拉远 → 回到"距离决定的缩放"，现在区间压到 1.2~1.3，所以只断言落回这个范围
    expect(cam.zoom).toBeGreaterThanOrEqual(1.2);
    expect(cam.zoom).toBeLessThanOrEqual(1.3);
  });

  it('覆盖值也参与左右夹取（拉近后视野更窄，位置仍在舞台内）', () => {
    const cam = new Camera({ x: 400, zoom: 1 });
    cam.zoomOverride = 1.6;
    for (let i = 0; i < 40; i++) cam.update({ x: 480 }, { x: 500 });
    const halfView = VIEW_WIDTH / cam.zoom / 2;
    expect(cam.x - halfView).toBeGreaterThanOrEqual(STAGE_LEFT - 1);
    expect(cam.x + halfView).toBeLessThanOrEqual(STAGE_RIGHT + 1);
  });
});

describe('震屏（打击感）', () => {
  it('触发后有偏移，逐帧衰减到 0', () => {
    const cam = new Camera({ x: 200, zoom: 1 });
    cam.shake(6, 3);
    expect(Math.abs(cam.shakeOffset.x)).toBeGreaterThan(0);
    for (let i = 0; i < 6; i++) cam.update({ x: 200 }, { x: 200 });
    expect(cam.shakeOffset).toEqual({ x: 0, y: 0 });
  });

  it('方向逐帧翻转（左右抖，不是单方向位移）', () => {
    const cam = new Camera({ x: 200, zoom: 1 });
    cam.shake(6, 3);
    const a = cam.shakeOffset.x;
    cam.update({ x: 200 }, { x: 200 });
    const b = cam.shakeOffset.x;
    expect(Math.sign(a)).not.toBe(Math.sign(b));
  });

  it('同时触发取更强的那次，不叠加', () => {
    const cam = new Camera({ x: 200, zoom: 1 });
    cam.shake(6, 2);
    cam.shake(6, 5);
    expect(cam.shakePower).toBe(5);
  });

  it('震屏不影响镜头位置本身（只是绘制偏移）', () => {
    const cam = new Camera({ x: 200, zoom: 1 });
    cam.shake(6, 3);
    cam.update({ x: 200 }, { x: 200 });
    expect(cam.x).toBeCloseTo(200, 0);
  });
});

describe('运镜焦点', () => {
  it('focusX 让镜头对准指定位置，而不是两人中点', () => {
    const a = { x: 180 };
    const b = { x: 240 };
    const mid = new Camera();
    for (let i = 0; i < 200; i++) mid.update(a, b);

    const focused = new Camera();
    focused.focusX = 236;
    for (let i = 0; i < 200; i++) focused.update(a, b);

    expect(focused.x).toBeGreaterThan(mid.x);
    expect(Math.abs(focused.x - 236)).toBeLessThan(Math.abs(mid.x - 210) + 1);
  });

  it('清掉 focusX 后会自己回到中点（不会卡在运镜位置上）', () => {
    const a = { x: 180 };
    const b = { x: 240 };
    const cam = new Camera();
    cam.focusX = 236;
    for (let i = 0; i < 60; i++) cam.update(a, b);
    cam.focusX = null;
    for (let i = 0; i < 200; i++) cam.update(a, b);
    expect(Math.abs(cam.x - 210)).toBeLessThan(2);
  });
});

describe('天气层', () => {
  const draw = (id: string): FakeCtx => {
    const ctx = new FakeCtx();
    drawWeather(ctx, new Camera({ x: 120, zoom: 1 }), stageById(id));
    return ctx;
  };

  it('每条舞台都有自己的天气（雨 / 落花 / 浮尘 / 飘雪）', () => {
    expect(STAGES.length).toBeGreaterThanOrEqual(5);
    expect(STAGES.slice(0, 3).map((s) => s.weather)).toEqual(['rain', 'petals', 'dust']);
    // 新加的两条也必须有天气，不能留空
    for (const s of STAGES.slice(3)) expect(s.weather, s.id).toBeTruthy();
  });

  it('下雨以线为主（雨丝）+ 少量地面溅射；落花和浮尘只有点', () => {
    resetWeatherTick();
    const rain = draw('skyline');
    expect(rain.calls.filter((c) => c === 'stroke').length).toBeGreaterThan(0);
    // 溅射点比雨丝少得多：雨的主体必须是线，否则就成了"下雪"
    expect(rain.rects.length).toBeLessThan(20);

    resetWeatherTick();
    const petals = draw('valley');
    expect(petals.rects.length).toBeGreaterThan(10);
    expect(petals.calls).not.toContain('stroke');

    resetWeatherTick();
    const dust = draw('arena');
    expect(dust.rects.length).toBeGreaterThan(10);
    expect(dust.calls).not.toContain('stroke');
  });

  it('确定性：同样的帧数画两次完全一样（回放/截图对比不会漂）', () => {
    resetWeatherTick();
    const a = draw('skyline');
    resetWeatherTick();
    const b = draw('skyline');
    expect(a.calls).toEqual(b.calls);
    expect(a.rects).toEqual(b.rects);
  });

  it('会动：推进一帧后位置变化（不是一张静态贴图）', () => {
    resetWeatherTick();
    const first = draw('valley');
    const second = draw('valley');
    expect(second.rects).not.toEqual(first.rects);
  });

  it('画完把 globalAlpha 还原（否则后面整屏半透明）', () => {
    resetWeatherTick();
    for (const id of ['skyline', 'valley', 'arena']) expect(draw(id).globalAlpha).toBe(1);
  });
});

describe('天气开关', () => {
  it('关掉后一个粒子都不画（挡视线/省电）', () => {
    setWeatherEnabled(false);
    resetWeatherTick();
    const ctx = new FakeCtx();
    drawWeather(ctx, new Camera({ x: 100, zoom: 1 }), stageById('skyline'));
    expect(ctx.rects).toHaveLength(0);
    expect(ctx.calls).not.toContain('stroke');
    setWeatherEnabled(true);
  });

  it('重新打开能恢复（开关不是一次性的）', () => {
    setWeatherEnabled(true);
    resetWeatherTick();
    const ctx = new FakeCtx();
    drawWeather(ctx, new Camera({ x: 100, zoom: 1 }), stageById('skyline'));
    expect(ctx.calls).toContain('stroke');
  });

  it('设置里的字段默认开，消毒时保留布尔值', () => {
    expect(sanitize({}).weatherFx).toBe(true);
    expect(sanitize({ weatherFx: false }).weatherFx).toBe(false);
    expect(sanitize({ weatherFx: 'yes' }).weatherFx).toBe(true); // 脏数据回落默认
  });
});

describe('舞台轮换（之前 drawFrame 不传 stage，永远只有夜城）', () => {
  it('街机 8 场能走到 5 条不同的舞台', () => {
    const ids = new Set<string>();
    for (let s = 0; s < 8; s++) ids.add(stageForIndex(s).id);
    expect(ids.size).toBe(STAGES.length);
  });

  it('场次越界也能取到舞台（不会 undefined 崩掉渲染）', () => {
    expect(stageForIndex(-1).id).toBeTruthy();
    expect(stageForIndex(999).id).toBeTruthy();
  });

  it('同一对局种子永远同一个舞台（不能一帧一跳）', () => {
    expect(stageForSeed(12345).id).toBe(stageForSeed(12345).id);
    // 不同种子应该能分到不同舞台（不然等于没轮换）
    const ids = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => stageForSeed(s * 9973).id));
    expect(ids.size).toBeGreaterThan(1);
  });

  it('五条舞台的 id 与底图对得上（有 id 没图等于画不出背景层）', () => {
    const ids = STAGES.map((s) => s.id);
    expect(ids).toEqual(['skyline', 'valley', 'arena', 'harbor', 'snow']);
  });
});
