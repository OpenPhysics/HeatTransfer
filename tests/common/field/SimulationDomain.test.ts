/**
 * SimulationDomain.test.ts
 *
 * The domain is the one place that knows the grid size, so these tests are
 * really about the claim the architecture rests on: that resolution is a
 * parameter and nothing above the domain depends on its value.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_PHYSICAL_SIZE, SimulationDomain } from "../../../src/common/field/SimulationDomain.js";
import { RESOLUTION_PRESETS } from "../../../src/HeatTransferConstants.js";

describe("SimulationDomain", () => {
  it("derives the cell size from the physical extent", () => {
    const domain = new SimulationDomain(128, 128);
    expect(domain.dx).toBeCloseTo(DEFAULT_PHYSICAL_SIZE / 128, 12);
    expect(domain.dy).toBeCloseTo(DEFAULT_PHYSICAL_SIZE / 128, 12);
    expect(domain.cellCount).toBe(128 * 128);
  });

  it("keeps the physical extent fixed as the resolution changes", () => {
    // This is the property that makes the resolution preference safe: refining
    // the grid must not silently change the size of the plate being simulated.
    for (const cells of Object.values(RESOLUTION_PRESETS)) {
      const domain = new SimulationDomain(cells, cells);
      expect(domain.physicalWidth).toBe(DEFAULT_PHYSICAL_SIZE);
      expect(domain.dx * domain.gridWidth).toBeCloseTo(DEFAULT_PHYSICAL_SIZE, 12);
    }
  });

  it("halves the cell size when the resolution doubles", () => {
    const coarse = new SimulationDomain(128, 128);
    const fine = new SimulationDomain(256, 256);
    expect(coarse.dx / fine.dx).toBeCloseTo(2, 12);
  });

  it("indexes row-major", () => {
    const domain = new SimulationDomain(8, 4);
    expect(domain.index(0, 0)).toBe(0);
    expect(domain.index(7, 0)).toBe(7);
    expect(domain.index(0, 1)).toBe(8);
    expect(domain.index(3, 2)).toBe(19);
  });

  it("clamps out-of-range indices", () => {
    const domain = new SimulationDomain(8, 4);
    expect(domain.clampedIndex(-5, -5)).toBe(domain.index(0, 0));
    expect(domain.clampedIndex(99, 99)).toBe(domain.index(7, 3));
  });

  it("maps unit coordinates onto cells, clamped at the edges", () => {
    const domain = new SimulationDomain(10, 10);
    expect(domain.unitToCell(0, 0)).toEqual({ i: 0, j: 0 });
    expect(domain.unitToCell(0.55, 0.35)).toEqual({ i: 5, j: 3 });
    // Exactly 1 would land one cell past the end without the clamp.
    expect(domain.unitToCell(1, 1)).toEqual({ i: 9, j: 9 });
    expect(domain.unitToCell(-0.5, 2)).toEqual({ i: 0, j: 9 });
  });

  it("places cell centres half a cell in from the index", () => {
    const domain = new SimulationDomain(10, 10);
    expect(domain.cellCentreX(0)).toBeCloseTo(0.5 * domain.dx, 12);
    expect(domain.cellCentreY(9)).toBeCloseTo(9.5 * domain.dy, 12);
  });

  it("builds square domains from the named presets", () => {
    const domain = SimulationDomain.fromPreset("classroom");
    expect(domain.gridWidth).toBe(RESOLUTION_PRESETS.classroom);
    expect(domain.gridHeight).toBe(RESOLUTION_PRESETS.classroom);
  });

  it("rejects degenerate grids", () => {
    expect(() => new SimulationDomain(1, 8)).toThrow();
    expect(() => new SimulationDomain(8.5, 8)).toThrow();
  });

  it("compares equal only when the discretization matches", () => {
    expect(new SimulationDomain(64, 64).equals(new SimulationDomain(64, 64))).toBe(true);
    expect(new SimulationDomain(64, 64).equals(new SimulationDomain(64, 32))).toBe(false);
  });
});
