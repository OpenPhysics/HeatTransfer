/**
 * kernels.test.ts
 *
 * The physics, tested where it is testable.
 *
 * WebGPU is not available under Vitest, so these tests exercise the CPU kernels —
 * which is the point of having written them as the reference implementation. The
 * WGSL shaders reproduce these functions statement for statement, so an invariant
 * pinned down here is an invariant the GPU path is written against. (The two
 * implementations were also checked against each other numerically in a real
 * browser during development; see doc/implementation-notes.md.)
 *
 * What is asserted here is behaviour that would be wrong in an obvious,
 * physically meaningful way if the discretization drifted: energy conservation,
 * the direction of heat flow, the effect of an insulating barrier, and the
 * stability bound the whole time-stepping scheme rests on.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  BoundaryCondition,
  conductivityX,
  conductivityY,
  type MaterialProperties,
  volumetricHeatCapacity,
} from "../../../src/common/field/FieldTypes.js";
import {
  advectStep,
  bilinearSample,
  diffuseStep,
  type FieldGeometry,
  fetchCell,
  gradientAt,
  heatFluxAt,
  type MaterialArrays,
  stableTimeStep,
  totalEnergy,
} from "../../../src/common/field/kernels.js";
import { MATERIALS } from "../../../src/common/field/Materials.js";

const GRID = 24;
const AMBIENT = 293.15;

const geometry: FieldGeometry = {
  gridWidth: GRID,
  gridHeight: GRID,
  dx: 0.1 / GRID,
  dy: 0.1 / GRID,
};

/** A uniform material field. */
function uniformMaterial(material: MaterialProperties): MaterialArrays {
  const cells = GRID * GRID;
  const arrays: MaterialArrays = {
    conductivityX: new Float32Array(cells),
    conductivityY: new Float32Array(cells),
    volumetricHeatCapacity: new Float32Array(cells),
  };
  arrays.conductivityX.fill(conductivityX(material));
  arrays.conductivityY.fill(conductivityY(material));
  arrays.volumetricHeatCapacity.fill(volumetricHeatCapacity(material));
  return arrays;
}

/** A field at ambient everywhere except one hot cell. */
function hotSpotField(i: number, j: number, temperature: number): Float32Array {
  const field = new Float32Array(GRID * GRID).fill(AMBIENT);
  field[j * GRID + i] = temperature;
  return field;
}

/** Runs `steps` diffusion substeps, ping-ponging between two buffers. */
function diffuse(
  field: Float32Array,
  material: MaterialArrays,
  boundary: typeof BoundaryCondition.INSULATED | typeof BoundaryCondition.FIXED | typeof BoundaryCondition.PERIODIC,
  dt: number,
  steps: number,
): Float32Array {
  let current: Float32Array = field;
  let other: Float32Array = new Float32Array(field.length);
  for (let n = 0; n < steps; n++) {
    diffuseStep(current, other, geometry, material, boundary, AMBIENT, dt);
    const swap = current;
    current = other;
    other = swap;
  }
  return current;
}

/** Fractional difference between two values, for comparing large sums. */
function relativeError(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.abs(expected);
}

describe("stableTimeStep", () => {
  it("satisfies the explicit-diffusion stability bound", () => {
    const alpha = 1.16e-4;
    const dt = stableTimeStep(geometry, alpha, 0, 0.4, 1);
    // The five-point Laplacian is stable while alpha dt (1/dx^2 + 1/dy^2) <= 1/2.
    const criterion = alpha * dt * (1 / geometry.dx ** 2 + 1 / geometry.dy ** 2);
    expect(criterion).toBeLessThanOrEqual(0.5);
    expect(criterion).toBeCloseTo(0.2, 10);
  });

  it("shrinks in proportion to the diffusivity", () => {
    const fast = stableTimeStep(geometry, 1e-4, 0, 0.4, 1);
    const slow = stableTimeStep(geometry, 1e-6, 0, 0.4, 1);
    expect(slow / fast).toBeCloseTo(100, 6);
  });

  it("is also bounded by the advective Courant number", () => {
    const speed = 0.05;
    const dt = stableTimeStep(geometry, 1e-9, speed, 0.4, 1);
    expect(speed * dt).toBeLessThanOrEqual(geometry.dx * 1.0000001);
  });

  it("returns a finite step when nothing is diffusing or moving", () => {
    expect(Number.isFinite(stableTimeStep(geometry, 0, 0, 0.4, 1))).toBe(true);
  });
});

describe("fetchCell boundary handling", () => {
  let field: Float32Array;

  beforeEach(() => {
    field = new Float32Array(GRID * GRID);
    for (let index = 0; index < field.length; index++) {
      field[index] = index;
    }
  });

  it("mirrors the edge cell outward when insulated", () => {
    expect(fetchCell(field, geometry, BoundaryCondition.INSULATED, -1, 5, AMBIENT)).toBe(
      fetchCell(field, geometry, BoundaryCondition.INSULATED, 0, 5, AMBIENT),
    );
  });

  it("returns the outside value when fixed", () => {
    expect(fetchCell(field, geometry, BoundaryCondition.FIXED, -1, 5, AMBIENT)).toBe(AMBIENT);
  });

  it("wraps when periodic", () => {
    expect(fetchCell(field, geometry, BoundaryCondition.PERIODIC, -1, 5, AMBIENT)).toBe(
      fetchCell(field, geometry, BoundaryCondition.PERIODIC, GRID - 1, 5, AMBIENT),
    );
    expect(fetchCell(field, geometry, BoundaryCondition.PERIODIC, GRID, 5, AMBIENT)).toBe(
      fetchCell(field, geometry, BoundaryCondition.PERIODIC, 0, 5, AMBIENT),
    );
  });
});

describe("bilinearSample", () => {
  it("reproduces the cell value exactly at a cell centre", () => {
    const field = hotSpotField(7, 9, 400);
    const value = bilinearSample(field, geometry, BoundaryCondition.INSULATED, 7.5, 9.5, AMBIENT);
    expect(value).toBeCloseTo(400, 4);
  });

  it("averages the two neighbours exactly halfway between them", () => {
    const field = new Float32Array(GRID * GRID).fill(AMBIENT);
    field[9 * GRID + 7] = 400;
    field[9 * GRID + 8] = 300;
    const value = bilinearSample(field, geometry, BoundaryCondition.INSULATED, 8.0, 9.5, AMBIENT);
    expect(value).toBeCloseTo(350, 4);
  });
});

describe("diffuseStep", () => {
  it("conserves total energy with insulated boundaries", () => {
    const material = uniformMaterial(MATERIALS.copper);
    const field = hotSpotField(12, 12, 450);
    const before = totalEnergy(field, geometry, material);

    const dt = stableTimeStep(geometry, 1.16e-4, 0, 0.4, 1);
    const after = diffuse(field, material, BoundaryCondition.INSULATED, dt, 200);

    // An adiabatic box neither gains nor loses heat. The comparison has to be
    // relative: the total is on the order of 10^7 J/m, and the fields are
    // Float32, so a few parts in 10^8 of drift over 200 steps is round-off, not
    // a leak. A real conservation bug shows up orders of magnitude above this.
    expect(relativeError(totalEnergy(after, geometry, material), before)).toBeLessThan(1e-6);
  });

  it("conserves total energy with periodic boundaries", () => {
    const material = uniformMaterial(MATERIALS.copper);
    const field = hotSpotField(3, 3, 450);
    const before = totalEnergy(field, geometry, material);

    const dt = stableTimeStep(geometry, 1.16e-4, 0, 0.4, 1);
    const after = diffuse(field, material, BoundaryCondition.PERIODIC, dt, 200);

    expect(relativeError(totalEnergy(after, geometry, material), before)).toBeLessThan(1e-6);
  });

  it("loses energy to fixed boundaries held at ambient", () => {
    const material = uniformMaterial(MATERIALS.copper);
    const field = hotSpotField(12, 12, 450);
    const before = totalEnergy(field, geometry, material);

    const dt = stableTimeStep(geometry, 1.16e-4, 0, 0.4, 1);
    const after = diffuse(field, material, BoundaryCondition.FIXED, dt, 400);

    expect(totalEnergy(after, geometry, material)).toBeLessThan(before);
  });

  it("relaxes toward a uniform field", () => {
    const material = uniformMaterial(MATERIALS.copper);
    const field = hotSpotField(12, 12, 450);
    const dt = stableTimeStep(geometry, 1.16e-4, 0, 0.4, 1);
    const after = diffuse(field, material, BoundaryCondition.INSULATED, dt, 4000);

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const value of after) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    expect(max - min).toBeLessThan(1);
  });

  it("stays bounded by its own extremes (no overshoot at the stability limit)", () => {
    const material = uniformMaterial(MATERIALS.copper);
    const field = hotSpotField(12, 12, 450);
    const dt = stableTimeStep(geometry, 1.16e-4, 0, 0.4, 1);
    const after = diffuse(field, material, BoundaryCondition.INSULATED, dt, 500);

    for (const value of after) {
      expect(value).toBeGreaterThanOrEqual(AMBIENT - 1e-6);
      expect(value).toBeLessThanOrEqual(450 + 1e-6);
    }
  });

  it("spreads faster through copper than through glass", () => {
    const dt = stableTimeStep(geometry, 1.16e-4, 0, 0.4, 1);
    const spread = (material: MaterialProperties): number => {
      const arrays = uniformMaterial(material);
      const after = diffuse(hotSpotField(12, 12, 450), arrays, BoundaryCondition.INSULATED, dt, 50);
      // How much the peak has dropped is a direct measure of how far heat moved.
      return 450 - (after[12 * GRID + 12] ?? 0);
    };
    expect(spread(MATERIALS.copper)).toBeGreaterThan(spread(MATERIALS.glass));
  });

  it("blocks heat with a strip of insulator across the domain", () => {
    // Copper everywhere, except one column of foam splitting the plate in two.
    const material = uniformMaterial(MATERIALS.copper);
    const barrier = MATERIALS.insulator;
    const barrierColumn = 12;
    for (let j = 0; j < GRID; j++) {
      const index = j * GRID + barrierColumn;
      material.conductivityX[index] = conductivityX(barrier);
      material.conductivityY[index] = conductivityY(barrier);
      material.volumetricHeatCapacity[index] = volumetricHeatCapacity(barrier);
    }

    const dt = stableTimeStep(geometry, 1.16e-4, 0, 0.4, 1);
    const withBarrier = diffuse(hotSpotField(6, 12, 450), material, BoundaryCondition.INSULATED, dt, 400);
    const withoutBarrier = diffuse(
      hotSpotField(6, 12, 450),
      uniformMaterial(MATERIALS.copper),
      BoundaryCondition.INSULATED,
      dt,
      400,
    );

    // Well past the barrier, the shielded plate must be cooler than the open one.
    const probe = 12 * GRID + 20;
    expect((withBarrier[probe] ?? 0) - AMBIENT).toBeLessThan((withoutBarrier[probe] ?? 0) - AMBIENT);
  });
});

describe("advectStep", () => {
  it("translates a blob downstream without changing its peak much", () => {
    const field = new Float32Array(GRID * GRID).fill(AMBIENT);
    // A smooth bump, so bilinear interpolation has something to interpolate.
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const r2 = (i - 6) ** 2 + (j - 12) ** 2;
        field[j * GRID + i] = AMBIENT + 150 * Math.exp(-r2 / 8);
      }
    }

    const speed = 0.002;
    const velocity = new Float32Array(2 * GRID * GRID);
    for (let index = 0; index < GRID * GRID; index++) {
      velocity[2 * index] = speed;
    }

    // Move the blob exactly six cells to the right.
    const dt = (6 * geometry.dx) / speed;
    const steps = 12;
    let current: Float32Array = field;
    let other: Float32Array = new Float32Array(field.length);
    for (let n = 0; n < steps; n++) {
      advectStep(current, other, velocity, geometry, BoundaryCondition.PERIODIC, AMBIENT, dt / steps, 1);
      const swap = current;
      current = other;
      other = swap;
    }

    const peakIndex = current.indexOf(Math.max(...current));
    expect(peakIndex % GRID).toBe(12);
    expect(Math.floor(peakIndex / GRID)).toBe(12);
  });

  it("leaves the field alone when the velocity is zero", () => {
    const field = hotSpotField(8, 8, 400);
    const output = new Float32Array(field.length);
    const velocity = new Float32Array(2 * GRID * GRID);
    advectStep(field, output, velocity, geometry, BoundaryCondition.INSULATED, AMBIENT, 0.5, 1);
    expect(Array.from(output)).toEqual(Array.from(field));
  });
});

describe("gradientAt and heatFluxAt", () => {
  it("points the gradient uphill and the flux downhill", () => {
    const field = new Float32Array(GRID * GRID).fill(AMBIENT);
    // A linear ramp increasing to the right.
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        field[j * GRID + i] = AMBIENT + i * 10;
      }
    }

    const { gx, gy } = gradientAt(field, geometry, BoundaryCondition.INSULATED, 12, 12, AMBIENT);
    expect(gx).toBeGreaterThan(0);
    expect(gy).toBeCloseTo(0, 6);
    expect(gx).toBeCloseTo(10 / geometry.dx, 3);

    const material = uniformMaterial(MATERIALS.copper);
    const { qx, qy } = heatFluxAt(field, geometry, material, BoundaryCondition.INSULATED, 12, 12, AMBIENT);
    // Fourier's law: q = -k grad(T), so heat flows toward the cold side.
    expect(qx).toBeLessThan(0);
    expect(qy).toBeCloseTo(0, 6);
    expect(qx).toBeCloseTo(-MATERIALS.copper.conductivity * gx, 0);
  });

  it("bends the flux away from the gradient in an anisotropic material", () => {
    const field = new Float32Array(GRID * GRID).fill(AMBIENT);
    // A ramp along the diagonal, so grad(T) points at 45 degrees.
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        field[j * GRID + i] = AMBIENT + (i + j) * 10;
      }
    }

    const anisotropic = uniformMaterial({ ...MATERIALS.copper, anisotropy: 4 });
    const { qx, qy } = heatFluxAt(field, geometry, anisotropic, BoundaryCondition.INSULATED, 12, 12, AMBIENT);

    // k_x is sixteen times k_y, so the flux leans far harder along x than the
    // 45-degree gradient alone would give.
    expect(Math.abs(qx / qy)).toBeCloseTo(16, 1);
  });
});
