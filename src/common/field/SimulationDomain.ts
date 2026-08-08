/**
 * SimulationDomain.ts
 *
 * The discretized rectangle every field lives on.
 *
 * A domain is the *only* place that knows how many cells there are. Nothing else
 * in the simulation — not the model, not the view, not a shader — hard-codes a
 * grid size. Swapping a 128 x 128 classroom grid for a 1024 x 1024 one is a
 * matter of constructing a different domain and rebuilding the engine's
 * resources; the physics, the controls, and the rendering are unchanged.
 *
 * Coordinate systems
 * ──────────────────
 *   grid   (i, j)   integer cell indices, i in [0, gridWidth), j in [0, gridHeight)
 *   unit   (u, v)   normalized [0, 1]^2, origin at the top-left of the field
 *   model  (x, y)   metres, origin at the top-left of the field
 *
 * `u` / `v` are what the view speaks (a pointer hit on the field canvas is
 * trivially normalized), `x` / `y` are what the physics speaks. Everything else
 * converts through this class.
 */

import { RESOLUTION_PRESETS, type ResolutionPresetId } from "../../HeatTransferConstants.js";
import HeatTransferNamespace from "../../HeatTransferNamespace.js";

export type SimulationDomainOptions = {
  /** Physical width of the domain in metres. */
  physicalWidth?: number;
  /** Physical height of the domain in metres. */
  physicalHeight?: number;
};

export class SimulationDomain {
  /** Number of cells along x. */
  public readonly gridWidth: number;

  /** Number of cells along y. */
  public readonly gridHeight: number;

  /** Physical width of the domain, in metres. */
  public readonly physicalWidth: number;

  /** Physical height of the domain, in metres. */
  public readonly physicalHeight: number;

  /** Cell size along x, in metres. */
  public readonly dx: number;

  /** Cell size along y, in metres. */
  public readonly dy: number;

  public constructor(gridWidth: number, gridHeight: number, options?: SimulationDomainOptions) {
    if (!(Number.isInteger(gridWidth) && Number.isInteger(gridHeight)) || gridWidth < 2 || gridHeight < 2) {
      throw new Error(`SimulationDomain requires integer grid dimensions >= 2, got ${gridWidth} x ${gridHeight}`);
    }

    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
    this.physicalWidth = options?.physicalWidth ?? DEFAULT_PHYSICAL_SIZE;
    this.physicalHeight = options?.physicalHeight ?? DEFAULT_PHYSICAL_SIZE;
    this.dx = this.physicalWidth / gridWidth;
    this.dy = this.physicalHeight / gridHeight;
  }

  /** Total number of cells. */
  public get cellCount(): number {
    return this.gridWidth * this.gridHeight;
  }

  /** The smaller of the two cell dimensions — the one that limits the explicit-diffusion time step. */
  public get minCellSize(): number {
    return Math.min(this.dx, this.dy);
  }

  /**
   * The characteristic length used for dimensionless groups (Peclet, Fourier).
   * The larger physical side, so a "cross the domain" journey is length 1.
   */
  public get characteristicLength(): number {
    return Math.max(this.physicalWidth, this.physicalHeight);
  }

  /** Row-major index of cell (i, j). Callers must supply in-range indices. */
  public index(i: number, j: number): number {
    return j * this.gridWidth + i;
  }

  /** Row-major index of cell (i, j), with indices clamped into the grid. */
  public clampedIndex(i: number, j: number): number {
    const ci = i < 0 ? 0 : i > this.gridWidth - 1 ? this.gridWidth - 1 : i;
    const cj = j < 0 ? 0 : j > this.gridHeight - 1 ? this.gridHeight - 1 : j;
    return cj * this.gridWidth + ci;
  }

  /** Continuous grid coordinate (cell units, cell centres at i + 0.5) for a unit-square point. */
  public unitToGridX(u: number): number {
    return u * this.gridWidth;
  }

  /** @see unitToGridX */
  public unitToGridY(v: number): number {
    return v * this.gridHeight;
  }

  /** The cell containing a unit-square point, clamped to the grid. */
  public unitToCell(u: number, v: number): { i: number; j: number } {
    const i = Math.floor(u * this.gridWidth);
    const j = Math.floor(v * this.gridHeight);
    return {
      i: i < 0 ? 0 : i > this.gridWidth - 1 ? this.gridWidth - 1 : i,
      j: j < 0 ? 0 : j > this.gridHeight - 1 ? this.gridHeight - 1 : j,
    };
  }

  /** Model-space x (metres) of the centre of column i. */
  public cellCentreX(i: number): number {
    return (i + 0.5) * this.dx;
  }

  /** Model-space y (metres) of the centre of row j. */
  public cellCentreY(j: number): number {
    return (j + 0.5) * this.dy;
  }

  /** True when this domain has the same discretization as `other`. */
  public equals(other: SimulationDomain): boolean {
    return (
      this.gridWidth === other.gridWidth &&
      this.gridHeight === other.gridHeight &&
      this.physicalWidth === other.physicalWidth &&
      this.physicalHeight === other.physicalHeight
    );
  }

  public toString(): string {
    return `${this.gridWidth}x${this.gridHeight} over ${this.physicalWidth}m x ${this.physicalHeight}m`;
  }

  /** Builds a square domain at one of the named resolutions. */
  public static fromPreset(preset: ResolutionPresetId, options?: SimulationDomainOptions): SimulationDomain {
    const cells = RESOLUTION_PRESETS[preset];
    return new SimulationDomain(cells, cells, options);
  }
}

/** Default physical extent of the (square) plate, in metres. 10 cm on a side. */
export const DEFAULT_PHYSICAL_SIZE = 0.1;

HeatTransferNamespace.register("SimulationDomain", SimulationDomain);
