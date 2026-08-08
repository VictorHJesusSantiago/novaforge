import { describe, it, expect } from 'vitest';
import { computePostProcessPlan, fullscreenQuadVertices } from '../postprocess-plan.js';

describe('computePostProcessPlan', () => {
  it('a single pass reads the scene and writes straight to output', () => {
    expect(computePostProcessPlan(1)).toEqual([{ input: 'scene', output: 'output' }]);
  });

  it('two passes ping-pong through buffer 0', () => {
    expect(computePostProcessPlan(2)).toEqual([
      { input: 'scene', output: 0 },
      { input: 0, output: 'output' },
    ]);
  });

  it('three passes ping-pong through both buffers before reaching output', () => {
    expect(computePostProcessPlan(3)).toEqual([
      { input: 'scene', output: 0 },
      { input: 0, output: 1 },
      { input: 1, output: 'output' },
    ]);
  });

  it('every pass after the first reads exactly what the previous pass wrote', () => {
    for (const passCount of [2, 3, 4, 5, 8]) {
      const plan = computePostProcessPlan(passCount);
      for (let i = 1; i < plan.length; i += 1) {
        expect(plan[i].input).toBe(plan[i - 1].output);
      }
    }
  });

  it('a pass never reads from the same buffer it writes to', () => {
    for (const passCount of [1, 2, 3, 4, 5, 8, 16]) {
      for (const step of computePostProcessPlan(passCount)) {
        expect(step.input).not.toBe(step.output);
      }
    }
  });

  it('only the last pass writes to output, and only the first reads the scene', () => {
    for (const passCount of [1, 2, 3, 4, 5]) {
      const plan = computePostProcessPlan(passCount);
      plan.forEach((step, i) => {
        expect(step.output === 'output').toBe(i === plan.length - 1);
        expect(step.input === 'scene').toBe(i === 0);
      });
    }
  });

  it('rejects a non-positive or non-integer pass count', () => {
    expect(() => computePostProcessPlan(0)).toThrow(/positive integer/);
    expect(() => computePostProcessPlan(-1)).toThrow(/positive integer/);
    expect(() => computePostProcessPlan(1.5)).toThrow(/positive integer/);
  });
});

describe('fullscreenQuadVertices', () => {
  it('produces six vertices of (x, y, u, v)', () => {
    const vertices = fullscreenQuadVertices();
    expect(vertices).toHaveLength(6 * 4);
  });

  it('covers clip space [-1, 1] on both axes', () => {
    const vertices = fullscreenQuadVertices();
    const xs = [];
    const ys = [];
    for (let i = 0; i < vertices.length; i += 4) {
      xs.push(vertices[i]);
      ys.push(vertices[i + 1]);
    }
    expect(Math.min(...xs)).toBe(-1);
    expect(Math.max(...xs)).toBe(1);
    expect(Math.min(...ys)).toBe(-1);
    expect(Math.max(...ys)).toBe(1);
  });

  it('pairs each clip position with the matching UV corner', () => {
    const vertices = fullscreenQuadVertices();
    for (let i = 0; i < vertices.length; i += 4) {
      const [x, y, u, v] = vertices.slice(i, i + 4);
      expect(u).toBe(x === -1 ? 0 : 1);
      expect(v).toBe(y === -1 ? 0 : 1);
    }
  });
});
