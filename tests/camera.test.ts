import { describe, expect, it } from 'vitest';
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
import { PARALLAX_FAR, STAGES, TILE_SPACING, drawStage, stageById } from '../src/render/stage-draw';
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
