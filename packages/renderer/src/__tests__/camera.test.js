import { describe, it, expect } from 'vitest';
import { Vec2, AABB } from '@novaforge/math';
import { Camera2D } from '../camera.js';

/** @returns {Camera2D} an 800x600 camera at the origin. */
function camera() {
  return new Camera2D({ viewportWidth: 800, viewportHeight: 600 });
}

describe('projection', () => {
  it('maps the camera position to the viewport centre', () => {
    const cam = camera();
    cam.position.set(100, 200);
    const screen = cam.worldToScreen(new Vec2(100, 200));
    expect(screen.x).toBeCloseTo(400);
    expect(screen.y).toBeCloseTo(300);
  });

  it('maps the viewport centre back to the camera position', () => {
    const cam = camera();
    cam.position.set(-50, 75);
    const world = cam.screenToWorld(new Vec2(400, 300));
    expect(world.x).toBeCloseTo(-50);
    expect(world.y).toBeCloseTo(75);
  });

  it('applies zoom', () => {
    const cam = camera();
    cam.zoom = 2;
    const screen = cam.worldToScreen(new Vec2(100, 0));
    expect(screen.x).toBeCloseTo(400 + 200);
  });

  // This round trip is what turns a mouse click into a world position; if it drifts, editor
  // selection lands on the wrong entity.
  it('round-trips through both projections under position, zoom and rotation', () => {
    const cam = camera();
    cam.position.set(123, -456);
    cam.zoom = 2.75;
    cam.rotation = 0.9;

    for (const point of [new Vec2(0, 0), new Vec2(500, -300), new Vec2(-77, 88)]) {
      const back = cam.screenToWorld(cam.worldToScreen(point));
      expect(back.x).toBeCloseTo(point.x, 4);
      expect(back.y).toBeCloseTo(point.y, 4);
    }
  });

  // Getting the transform order wrong makes rotation orbit the world origin instead of the
  // camera — a classic and very visible camera bug.
  it('rotates about the camera, not about the world origin', () => {
    const cam = camera();
    cam.position.set(1000, 1000);
    cam.rotation = Math.PI / 2;
    const screen = cam.worldToScreen(new Vec2(1000, 1000));
    expect(screen.x).toBeCloseTo(400);
    expect(screen.y).toBeCloseTo(300);
  });

  it('agrees with its own view matrix', () => {
    const cam = camera();
    cam.position.set(40, -20);
    cam.zoom = 1.5;
    cam.rotation = 0.4;

    const point = new Vec2(10, 90);
    const direct = cam.worldToScreen(point);
    const viaMatrix = cam.viewMatrix().transformPoint(point);
    expect(viaMatrix.x).toBeCloseTo(direct.x, 3);
    expect(viaMatrix.y).toBeCloseTo(direct.y, 3);
  });
});

describe('zoom', () => {
  it('clamps to the configured range', () => {
    const cam = camera();
    cam.setZoom(1000);
    expect(cam.zoom).toBe(cam.maxZoom);
    cam.setZoom(0);
    expect(cam.zoom).toBe(cam.minZoom);
  });

  it('zoomBy multiplies rather than adds, so each wheel notch feels equal', () => {
    const cam = camera();
    cam.zoom = 2;
    cam.zoomBy(1.5);
    expect(cam.zoom).toBeCloseTo(3);
  });

  // The behaviour every map and editor viewport is expected to have.
  it('zoomAround keeps the anchored screen point over the same world point', () => {
    const cam = camera();
    cam.position.set(0, 0);
    const anchor = new Vec2(600, 150);
    const worldBefore = cam.screenToWorld(anchor);

    cam.zoomAround(anchor, 2.5);

    const worldAfter = cam.screenToWorld(anchor);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 3);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 3);
  });
});

describe('visible bounds', () => {
  it('covers the viewport at zoom 1', () => {
    const bounds = camera().visibleBounds();
    expect(bounds.width).toBeCloseTo(800);
    expect(bounds.height).toBeCloseTo(600);
  });

  it('halves with a doubled zoom', () => {
    const cam = camera();
    cam.zoom = 2;
    expect(cam.visibleBounds().width).toBeCloseTo(400);
  });

  it('follows the camera position', () => {
    const cam = camera();
    cam.position.set(1000, 0);
    const bounds = cam.visibleBounds();
    expect(bounds.minX).toBeCloseTo(600);
    expect(bounds.maxX).toBeCloseTo(1400);
  });

  // Too generous wastes a draw call; too tight makes sprites vanish at the edges.
  it('grows when rotated, never shrinks', () => {
    const cam = camera();
    const unrotated = cam.visibleBounds();
    cam.rotation = Math.PI / 4;
    const rotated = cam.visibleBounds();
    expect(rotated.width).toBeGreaterThan(unrotated.width);
    expect(rotated.height).toBeGreaterThan(unrotated.height);
  });

  it('contains every corner of the rotated view', () => {
    const cam = camera();
    cam.rotation = 0.7;
    const bounds = cam.visibleBounds();
    const corners = [
      cam.screenToWorld(new Vec2(0, 0)),
      cam.screenToWorld(new Vec2(800, 0)),
      cam.screenToWorld(new Vec2(0, 600)),
      cam.screenToWorld(new Vec2(800, 600)),
    ];
    for (const corner of corners) {
      expect(bounds.containsPoint(corner)).toBe(true);
    }
  });
});

describe('follow and bounds', () => {
  it('converges on the target over repeated frames', () => {
    const cam = camera();
    const target = { x: 500, y: -200 };
    for (let i = 0; i < 200; i += 1) cam.follow(target, 1 / 60, 0.15);
    expect(cam.position.x).toBeCloseTo(500, 0);
    expect(cam.position.y).toBeCloseTo(-200, 0);
  });

  it('does not overshoot the target', () => {
    const cam = camera();
    let maxX = 0;
    for (let i = 0; i < 300; i += 1) {
      cam.follow({ x: 100, y: 0 }, 1 / 60, 0.1);
      maxX = Math.max(maxX, cam.position.x);
    }
    expect(maxX).toBeLessThanOrEqual(100.001);
  });

  it('snapTo jumps immediately and cancels follow momentum', () => {
    const cam = camera();
    for (let i = 0; i < 10; i += 1) cam.follow({ x: 1000, y: 0 }, 1 / 60);
    cam.snapTo({ x: 0, y: 0 });
    expect(cam.position.x).toBe(0);

    // With momentum cancelled, one more follow frame toward a far target must not lurch.
    cam.follow({ x: 0, y: 0 }, 1 / 60);
    expect(cam.position.x).toBeCloseTo(0, 3);
  });

  it('confines the camera to its bounds', () => {
    const cam = camera();
    cam.bounds = new AABB(-100, -100, 100, 100);
    cam.snapTo({ x: 9999, y: -9999 });
    expect(cam.position.x).toBe(100);
    expect(cam.position.y).toBe(-100);
  });

  it('applies bounds while following', () => {
    const cam = camera();
    cam.bounds = new AABB(0, 0, 50, 50);
    for (let i = 0; i < 100; i += 1) cam.follow({ x: 1000, y: 1000 }, 1 / 60);
    expect(cam.position.x).toBeLessThanOrEqual(50);
    expect(cam.position.y).toBeLessThanOrEqual(50);
  });
});

describe('resize', () => {
  it('recentres the projection on the new viewport', () => {
    const cam = camera();
    cam.resize(1000, 500);
    const screen = cam.worldToScreen(cam.position);
    expect(screen.x).toBeCloseTo(500);
    expect(screen.y).toBeCloseTo(250);
  });
});
