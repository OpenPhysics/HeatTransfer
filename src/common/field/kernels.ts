/**
 * kernels.ts
 *
 * The reference implementation of the field update, in plain TypeScript over
 * `Float32Array`s. These functions define the *semantics* the WGSL compute
 * shaders reproduce: same discretization, same boundary handling, same order of
 * operations. They are also what the unit tests exercise, since WebGPU is not
 * available under Vitest.
 *
 * Discretization
 * ──────────────
 * Conservative finite volume on a uniform grid. For the general heterogeneous,
 * anisotropic case
 *
 *   rho c_p dT/dt = d/dx (k_x dT/dx) + d/dy (k_y dT/dy)
 *
 * face conductivities use the **harmonic mean** of the two adjacent cells, which
 * is the correct series combination of thermal resistances — an insulating layer
 * one cell thick actually blocks heat, instead of being averaged away.
 *
 * Advection is semi-Lagrangian: each cell traces its parcel backward along the
 * velocity field and bilinearly samples the old field there. That is
 * unconditionally stable (no advective step-size limit) and mass-preserving
 * enough for a teaching sim, at the cost of some numerical diffusion.
 */

import { BoundaryCondition, type BoundaryConditionId } from "./FieldTypes.js";

/**
 * The per-cell material arrays plus grid geometry. Bundled so kernels take one
 * descriptor instead of eight loose parameters.
 */
export type FieldGeometry = {
  gridWidth: number;
  gridHeight: number;
  dx: number;
  dy: number;
};

/** Per-cell material coefficients, row-major, one entry per cell. */
export type MaterialArrays = {
  /** Conductivity along x, W/(m K). */
  conductivityX: Float32Array;
  /** Conductivity along y, W/(m K). */
  conductivityY: Float32Array;
  /** Volumetric heat capacity rho c_p, J/(m^3 K). */
  volumetricHeatCapacity: Float32Array;
};

/**
 * Reads a cell, resolving out-of-range indices according to the boundary
 * condition. This single function is why the three boundary conditions need no
 * ghost-cell bookkeeping anywhere else.
 */
export function fetchCell(
  field: Float32Array,
  geometry: FieldGeometry,
  boundary: BoundaryConditionId,
  i: number,
  j: number,
  outsideValue: number,
): number {
  const { gridWidth, gridHeight } = geometry;
  let ii = i;
  let jj = j;

  if (ii < 0 || ii >= gridWidth || jj < 0 || jj >= gridHeight) {
    if (boundary === BoundaryCondition.FIXED) {
      return outsideValue;
    }
    if (boundary === BoundaryCondition.PERIODIC) {
      ii = ((ii % gridWidth) + gridWidth) % gridWidth;
      jj = ((jj % gridHeight) + gridHeight) % gridHeight;
    } else {
      // INSULATED: zero normal gradient, i.e. mirror the edge cell outward.
      ii = ii < 0 ? 0 : ii >= gridWidth ? gridWidth - 1 : ii;
      jj = jj < 0 ? 0 : jj >= gridHeight ? gridHeight - 1 : jj;
    }
  }

  return field[jj * gridWidth + ii] ?? outsideValue;
}

/** Reads a material array with edge clamping (materials always extend outward). */
function fetchClamped(field: Float32Array, geometry: FieldGeometry, i: number, j: number): number {
  const { gridWidth, gridHeight } = geometry;
  const ii = i < 0 ? 0 : i >= gridWidth ? gridWidth - 1 : i;
  const jj = j < 0 ? 0 : j >= gridHeight ? gridHeight - 1 : j;
  return field[jj * gridWidth + ii] ?? 0;
}

/** Series (harmonic) combination of two face conductivities. */
function faceConductivity(a: number, b: number): number {
  const sum = a + b;
  return sum > 0 ? (2 * a * b) / sum : 0;
}

/**
 * Bilinearly samples a field at continuous grid coordinates, where the centre of
 * cell (i, j) sits at (i + 0.5, j + 0.5).
 */
export function bilinearSample(
  field: Float32Array,
  geometry: FieldGeometry,
  boundary: BoundaryConditionId,
  gx: number,
  gy: number,
  outsideValue: number,
): number {
  const fx = gx - 0.5;
  const fy = gy - 0.5;
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fy);
  const tx = fx - i0;
  const ty = fy - j0;

  const c00 = fetchCell(field, geometry, boundary, i0, j0, outsideValue);
  const c10 = fetchCell(field, geometry, boundary, i0 + 1, j0, outsideValue);
  const c01 = fetchCell(field, geometry, boundary, i0, j0 + 1, outsideValue);
  const c11 = fetchCell(field, geometry, boundary, i0 + 1, j0 + 1, outsideValue);

  const top = c00 + (c10 - c00) * tx;
  const bottom = c01 + (c11 - c01) * tx;
  return top + (bottom - top) * ty;
}

/**
 * One explicit diffusion substep, written into `output`.
 *
 * `input` and `output` must be different arrays — this is the CPU half of the
 * same ping-pong the GPU backend does between two textures.
 */
export function diffuseStep(
  input: Float32Array,
  output: Float32Array,
  geometry: FieldGeometry,
  material: MaterialArrays,
  boundary: BoundaryConditionId,
  outsideValue: number,
  dt: number,
): void {
  const { gridWidth, gridHeight, dx, dy } = geometry;
  const invDx2 = 1 / (dx * dx);
  const invDy2 = 1 / (dy * dy);
  const insulated = boundary === BoundaryCondition.INSULATED;

  for (let j = 0; j < gridHeight; j++) {
    for (let i = 0; i < gridWidth; i++) {
      const index = j * gridWidth + i;
      const centre = input[index] ?? outsideValue;

      const kxHere = material.conductivityX[index] ?? 0;
      const kyHere = material.conductivityY[index] ?? 0;

      // Face conductivities. On an insulated edge the outward face is closed, so
      // its conductivity is zero and no flux crosses it.
      const atLeftEdge = i === 0;
      const atRightEdge = i === gridWidth - 1;
      const atTopEdge = j === 0;
      const atBottomEdge = j === gridHeight - 1;

      const kWest =
        insulated && atLeftEdge
          ? 0
          : faceConductivity(kxHere, fetchClamped(material.conductivityX, geometry, i - 1, j));
      const kEast =
        insulated && atRightEdge
          ? 0
          : faceConductivity(kxHere, fetchClamped(material.conductivityX, geometry, i + 1, j));
      const kNorth =
        insulated && atTopEdge ? 0 : faceConductivity(kyHere, fetchClamped(material.conductivityY, geometry, i, j - 1));
      const kSouth =
        insulated && atBottomEdge
          ? 0
          : faceConductivity(kyHere, fetchClamped(material.conductivityY, geometry, i, j + 1));

      const west = fetchCell(input, geometry, boundary, i - 1, j, outsideValue);
      const east = fetchCell(input, geometry, boundary, i + 1, j, outsideValue);
      const north = fetchCell(input, geometry, boundary, i, j - 1, outsideValue);
      const south = fetchCell(input, geometry, boundary, i, j + 1, outsideValue);

      const divergence =
        (kEast * (east - centre) + kWest * (west - centre)) * invDx2 +
        (kSouth * (south - centre) + kNorth * (north - centre)) * invDy2;

      const rhoCp = material.volumetricHeatCapacity[index] ?? 1;
      output[index] = centre + (dt / rhoCp) * divergence;
    }
  }
}

/**
 * One semi-Lagrangian advection substep, written into `output`.
 *
 * `velocity` is interleaved (vx, vy) in m/s, one pair per cell.
 */
export function advectStep(
  input: Float32Array,
  output: Float32Array,
  velocity: Float32Array,
  geometry: FieldGeometry,
  boundary: BoundaryConditionId,
  outsideValue: number,
  dt: number,
  flowScale: number,
): void {
  const { gridWidth, gridHeight, dx, dy } = geometry;

  for (let j = 0; j < gridHeight; j++) {
    for (let i = 0; i < gridWidth; i++) {
      const index = j * gridWidth + i;
      const vx = (velocity[2 * index] ?? 0) * flowScale;
      const vy = (velocity[2 * index + 1] ?? 0) * flowScale;

      // Trace this cell's parcel backward one step and sample where it came from.
      const gx = i + 0.5 - (vx * dt) / dx;
      const gy = j + 0.5 - (vy * dt) / dy;
      output[index] = bilinearSample(input, geometry, boundary, gx, gy, outsideValue);
    }
  }
}

/**
 * Central-difference temperature gradient at a cell, in K/m.
 * One-sided at insulated edges, which is where the mirrored fetch lands.
 */
export function gradientAt(
  field: Float32Array,
  geometry: FieldGeometry,
  boundary: BoundaryConditionId,
  i: number,
  j: number,
  outsideValue: number,
): { gx: number; gy: number } {
  const east = fetchCell(field, geometry, boundary, i + 1, j, outsideValue);
  const west = fetchCell(field, geometry, boundary, i - 1, j, outsideValue);
  const south = fetchCell(field, geometry, boundary, i, j + 1, outsideValue);
  const north = fetchCell(field, geometry, boundary, i, j - 1, outsideValue);
  return {
    gx: (east - west) / (2 * geometry.dx),
    gy: (south - north) / (2 * geometry.dy),
  };
}

/**
 * Fourier's law, q = -k grad(T), evaluated at a cell. Returns W/m^2.
 * The two components use their own directional conductivities, so an anisotropic
 * material bends the flux away from the steepest-descent direction — which is
 * the whole point of the anisotropy control.
 */
export function heatFluxAt(
  field: Float32Array,
  geometry: FieldGeometry,
  material: MaterialArrays,
  boundary: BoundaryConditionId,
  i: number,
  j: number,
  outsideValue: number,
): { qx: number; qy: number } {
  const { gx, gy } = gradientAt(field, geometry, boundary, i, j, outsideValue);
  const index = j * geometry.gridWidth + i;
  return {
    qx: -(material.conductivityX[index] ?? 0) * gx,
    qy: -(material.conductivityY[index] ?? 0) * gy,
  };
}

/**
 * The largest stable explicit time step, in seconds.
 *
 * Diffusion: the five-point Laplacian is stable while
 * `alpha dt (1/dx^2 + 1/dy^2) <= 1/2`. Advection is unconditionally stable under
 * semi-Lagrangian backtracing but is held to a Courant number for accuracy.
 *
 * @param geometry - grid spacing
 * @param maxDiffusivity - the largest directional alpha anywhere in the domain, m^2/s
 * @param maxSpeed - the largest |v| anywhere in the domain, m/s
 * @param diffusionCfl - safety factor in (0, 1] on the diffusion limit
 * @param advectionCfl - Courant number cap on the advective step
 */
export function stableTimeStep(
  geometry: FieldGeometry,
  maxDiffusivity: number,
  maxSpeed: number,
  diffusionCfl: number,
  advectionCfl: number,
): number {
  const { dx, dy } = geometry;
  const inverseSquares = 1 / (dx * dx) + 1 / (dy * dy);

  let dt = Number.POSITIVE_INFINITY;
  if (maxDiffusivity > 0) {
    dt = Math.min(dt, (diffusionCfl * 0.5) / (maxDiffusivity * inverseSquares));
  }
  if (maxSpeed > 0) {
    dt = Math.min(dt, (advectionCfl * Math.min(dx, dy)) / maxSpeed);
  }

  // Nothing is moving and nothing is diffusing: any step is stable, but pick a
  // finite one so the clock still advances.
  return Number.isFinite(dt) ? dt : 1;
}

/** Total thermal energy per unit depth, in J/m — the quantity insulated boundaries conserve. */
export function totalEnergy(field: Float32Array, geometry: FieldGeometry, material: MaterialArrays): number {
  const cellVolume = geometry.dx * geometry.dy;
  let sum = 0;
  for (let index = 0; index < field.length; index++) {
    sum += (material.volumetricHeatCapacity[index] ?? 0) * (field[index] ?? 0) * cellVolume;
  }
  return sum;
}
