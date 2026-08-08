/**
 * VelocityPresets.test.ts
 *
 * The flow presets are prescribed analytic fields, so what matters is that they
 * are *dimensionless* (so the speed control has one meaning), *bounded* (so the
 * advective CFL bound holds), and *divergence-free* (so advecting temperature
 * transports heat rather than creating or destroying it).
 */

import { describe, expect, it } from "vitest";
import { FLOW_PRESET_ORDER, FlowPreset } from "../../../src/common/field/FieldTypes.js";
import { evaluateFlowPreset, fillVelocityField } from "../../../src/common/field/VelocityPresets.js";

/** Central-difference divergence of a preset, in unit-square coordinates. */
function divergenceAt(preset: (typeof FLOW_PRESET_ORDER)[number], u: number, v: number): number {
  const h = 1e-4;
  const right = evaluateFlowPreset(preset, u + h, v).vx;
  const left = evaluateFlowPreset(preset, u - h, v).vx;
  const down = evaluateFlowPreset(preset, u, v + h).vy;
  const up = evaluateFlowPreset(preset, u, v - h).vy;
  return (right - left) / (2 * h) + (down - up) / (2 * h);
}

describe("evaluateFlowPreset", () => {
  it("never exceeds unit magnitude, so `speed` is the peak speed", () => {
    for (const preset of FLOW_PRESET_ORDER) {
      for (let j = 0; j <= 40; j++) {
        for (let i = 0; i <= 40; i++) {
          const { vx, vy } = evaluateFlowPreset(preset, i / 40, j / 40);
          expect(Math.hypot(vx, vy)).toBeLessThanOrEqual(1.0000001);
        }
      }
    }
  });

  it("is divergence-free for every moving preset", () => {
    // A compressible flow would pile temperature up at convergence points, which
    // would look exactly like heating and would be entirely fictitious.
    for (const preset of FLOW_PRESET_ORDER) {
      for (const [u, v] of [
        [0.3, 0.3],
        [0.5, 0.5],
        [0.7, 0.4],
        [0.25, 0.8],
      ]) {
        expect(Math.abs(divergenceAt(preset, u ?? 0, v ?? 0))).toBeLessThan(1e-3);
      }
    }
  });

  it("is exactly zero when still", () => {
    expect(evaluateFlowPreset(FlowPreset.NONE, 0.5, 0.5)).toEqual({ vx: 0, vy: 0 });
  });

  it("makes uniform flow point right everywhere", () => {
    expect(evaluateFlowPreset(FlowPreset.UNIFORM, 0.1, 0.9)).toEqual({ vx: 1, vy: 0 });
  });

  it("gives channel flow a no-slip wall and a peak on the centreline", () => {
    expect(evaluateFlowPreset(FlowPreset.CHANNEL, 0.5, 0).vx).toBeCloseTo(0, 10);
    expect(evaluateFlowPreset(FlowPreset.CHANNEL, 0.5, 1).vx).toBeCloseTo(0, 10);
    expect(evaluateFlowPreset(FlowPreset.CHANNEL, 0.5, 0.5).vx).toBeCloseTo(1, 10);
  });

  it("gives the vortex a stationary centre and opposite tangents across it", () => {
    expect(evaluateFlowPreset(FlowPreset.VORTEX, 0.5, 0.5)).toEqual({ vx: -0, vy: 0 });
    const above = evaluateFlowPreset(FlowPreset.VORTEX, 0.5, 0.35);
    const below = evaluateFlowPreset(FlowPreset.VORTEX, 0.5, 0.65);
    expect(Math.sign(above.vx)).toBe(-Math.sign(below.vx));
  });

  it("makes the plume rise in the middle and sink at the walls", () => {
    // v increases downward, so rising is negative vy.
    expect(evaluateFlowPreset(FlowPreset.PLUME, 0.5, 0.5).vy).toBeLessThan(0);
    expect(evaluateFlowPreset(FlowPreset.PLUME, 0.02, 0.5).vy).toBeGreaterThan(0);
    expect(evaluateFlowPreset(FlowPreset.PLUME, 0.98, 0.5).vy).toBeGreaterThan(0);
  });
});

describe("fillVelocityField", () => {
  it("writes interleaved (vx, vy) scaled by the requested speed", () => {
    const width = 8;
    const height = 8;
    const buffer = new Float32Array(2 * width * height);
    const speed = 0.004;
    fillVelocityField(buffer, width, height, FlowPreset.UNIFORM, speed);

    for (let index = 0; index < width * height; index++) {
      expect(buffer[2 * index]).toBeCloseTo(speed, 9);
      expect(buffer[2 * index + 1]).toBeCloseTo(0, 9);
    }
  });

  it("scales linearly with speed", () => {
    const single = new Float32Array(2 * 16);
    const double = new Float32Array(2 * 16);
    fillVelocityField(single, 4, 4, FlowPreset.VORTEX, 0.001);
    fillVelocityField(double, 4, 4, FlowPreset.VORTEX, 0.002);
    for (let index = 0; index < single.length; index++) {
      expect(double[index]).toBeCloseTo(2 * (single[index] ?? 0), 9);
    }
  });
});
