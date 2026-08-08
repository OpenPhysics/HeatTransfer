/**
 * ColorMap.test.ts
 *
 * The colour ramp is a quantitative encoding, not decoration: the legend and the
 * field are drawn from the same stop list, so these tests guard the properties
 * that make the legend readable — monotone ordering, no gaps, and a WGSL
 * generator that agrees with the TypeScript sampler.
 */

import { describe, expect, it } from "vitest";
import { colorMapWgsl, sampleColorMap, TEMPERATURE_COLOR_STOPS } from "../../../src/common/field/ColorMap.js";

describe("TEMPERATURE_COLOR_STOPS", () => {
  it("spans the full normalized range", () => {
    expect(TEMPERATURE_COLOR_STOPS[0]?.position).toBe(0);
    expect(TEMPERATURE_COLOR_STOPS[TEMPERATURE_COLOR_STOPS.length - 1]?.position).toBe(1);
  });

  it("is strictly increasing in position", () => {
    for (let n = 1; n < TEMPERATURE_COLOR_STOPS.length; n++) {
      const previous = TEMPERATURE_COLOR_STOPS[n - 1];
      const current = TEMPERATURE_COLOR_STOPS[n];
      expect(current?.position ?? 0).toBeGreaterThan(previous?.position ?? 0);
    }
  });

  it("increases in luminance from cold to hot", () => {
    // Lightness ordering is what keeps the ramp legible in greyscale and under a
    // projector, where hue alone can wash out.
    const luminance = (position: number): number => {
      const { red, green, blue } = sampleColorMap(position);
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    expect(luminance(1)).toBeGreaterThan(luminance(0.5));
    expect(luminance(0.5)).toBeGreaterThan(luminance(0));
  });
});

describe("sampleColorMap", () => {
  it("returns the end stops exactly at the ends", () => {
    const first = TEMPERATURE_COLOR_STOPS[0];
    const last = TEMPERATURE_COLOR_STOPS[TEMPERATURE_COLOR_STOPS.length - 1];
    expect(sampleColorMap(0)).toEqual({ red: first?.red, green: first?.green, blue: first?.blue });
    expect(sampleColorMap(1)).toEqual({ red: last?.red, green: last?.green, blue: last?.blue });
  });

  it("clamps outside the range instead of extrapolating", () => {
    expect(sampleColorMap(-5)).toEqual(sampleColorMap(0));
    expect(sampleColorMap(5)).toEqual(sampleColorMap(1));
  });

  it("interpolates linearly between adjacent stops", () => {
    const lo = TEMPERATURE_COLOR_STOPS[0];
    const hi = TEMPERATURE_COLOR_STOPS[1];
    if (!(lo && hi)) {
      throw new Error("ramp needs at least two stops");
    }
    const middle = (lo.position + hi.position) / 2;
    expect(sampleColorMap(middle).red).toBeCloseTo((lo.red + hi.red) / 2, 10);
  });

  it("stays inside the unit colour cube everywhere", () => {
    for (let n = 0; n <= 100; n++) {
      const { red, green, blue } = sampleColorMap(n / 100);
      for (const channel of [red, green, blue]) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("colorMapWgsl", () => {
  it("declares one entry per stop", () => {
    const source = colorMapWgsl();
    expect(source).toContain(`COLOR_STOP_COUNT: u32 = ${TEMPERATURE_COLOR_STOPS.length}u`);
    expect(source.match(/vec3<f32>\(/g)?.length).toBe(TEMPERATURE_COLOR_STOPS.length);
  });

  it("writes every literal with a decimal point, as WGSL requires", () => {
    // `1` is an i32 literal in WGSL; `1.0` is the f32 the array needs.
    for (const literal of colorMapWgsl()
      .match(/array<f32, \d+>\(([^)]*)\)/)?.[1]
      ?.split(",") ?? []) {
      expect(literal.trim()).toMatch(/\./);
    }
  });

  it("carries the same stop positions the sampler uses", () => {
    const source = colorMapWgsl();
    for (const stop of TEMPERATURE_COLOR_STOPS) {
      const literal = Number.isInteger(stop.position) ? `${stop.position}.0` : `${stop.position}`;
      expect(source).toContain(literal);
    }
  });
});
