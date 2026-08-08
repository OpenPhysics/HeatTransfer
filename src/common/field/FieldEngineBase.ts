/**
 * FieldEngineBase.ts
 *
 * Everything both backends do identically.
 *
 * The split follows one rule: **the CPU authors, the GPU evolves.** The material
 * and velocity fields are written by user actions and analytic presets, so the
 * CPU always holds the authoritative copy and a backend merely uploads it. Only
 * the temperature field is genuinely GPU-owned, so only it needs to be mirrored
 * back — and every read-out feature (probe, legend, cross-section graph,
 * statistics) is implemented once here against that mirror.
 *
 * That is what keeps the two backends honest with each other: sampling, material
 * bookkeeping, stroke geometry, initial conditions, and the stability-limited
 * time step are shared code, not duplicated code.
 */

import {
  ADVECTION_CFL,
  AMBIENT_TEMPERATURE_K,
  COOL_BRUSH_TEMPERATURE_K,
  DIFFUSION_CFL,
  HOT_BRUSH_TEMPERATURE_K,
} from "../../HeatTransferConstants.js";
import type { FieldBackendId, FieldEngine, FieldEngineOptions } from "./FieldEngine.js";
import {
  BoundaryCondition,
  type BoundaryConditionId,
  type BrushStroke,
  type CrossSectionSample,
  conductivityX,
  conductivityY,
  type FieldStatistics,
  type FlowPresetId,
  InitialCondition,
  type InitialConditionId,
  type MaterialProperties,
  type MaterialStroke,
  maxDirectionalDiffusivity,
  volumetricHeatCapacity,
} from "./FieldTypes.js";
import { bilinearSample, type FieldGeometry, gradientAt, type MaterialArrays, stableTimeStep } from "./kernels.js";
import { MATERIALS } from "./Materials.js";
import type { SimulationDomain } from "./SimulationDomain.js";
import { fillVelocityField } from "./VelocityPresets.js";

export abstract class FieldEngineBase implements FieldEngine {
  public readonly domain: SimulationDomain;
  public readonly canvas: HTMLCanvasElement;

  /** CPU mirror of the temperature field, in kelvin. Authoritative on CPU, refreshed on GPU. */
  protected readonly temperatureMirror: Float32Array;

  /** Per-cell material coefficients. Always CPU-authoritative; backends upload copies. */
  protected readonly material: MaterialArrays;

  /** Interleaved (vx, vy) velocity in m/s. Always CPU-authoritative. */
  protected readonly velocity: Float32Array;

  /** Grid geometry in the shape the kernels want. */
  protected readonly geometry: FieldGeometry;

  /** Largest directional diffusivity anywhere in the domain, m^2/s. */
  protected maxDiffusivity: number;

  /** Sum of directional diffusivities, for the area-weighted mean used by the Peclet readout. */
  private diffusivitySum: number;

  /** Largest |v| in the velocity field, m/s. */
  protected maxSpeed = 0;

  /** Simulated seconds since the last reset. */
  protected elapsedTime = 0;

  /** The substep used by the most recent step() call, in seconds. */
  protected currentSubstep = 0;

  /** Boundary condition in force, refreshed on every step() from the parameters. */
  protected boundary: BoundaryConditionId = BoundaryCondition.INSULATED;

  /** How the field was last seeded, so a material change can re-derive it if needed. */
  protected lastInitialCondition: InitialConditionId = InitialCondition.UNIFORM;

  public abstract readonly backend: FieldBackendId;

  protected constructor(domain: SimulationDomain, options: FieldEngineOptions) {
    this.domain = domain;
    this.geometry = {
      gridWidth: domain.gridWidth,
      gridHeight: domain.gridHeight,
      dx: domain.dx,
      dy: domain.dy,
    };

    const cells = domain.cellCount;
    this.temperatureMirror = new Float32Array(cells);
    this.material = {
      conductivityX: new Float32Array(cells),
      conductivityY: new Float32Array(cells),
      volumetricHeatCapacity: new Float32Array(cells),
    };
    this.velocity = new Float32Array(2 * cells);

    this.canvas = document.createElement("canvas");
    this.canvas.width = options.displaySize;
    this.canvas.height = options.displaySize;

    const initial = MATERIALS.copper;
    this.maxDiffusivity = maxDirectionalDiffusivity(initial);
    this.diffusivitySum = this.maxDiffusivity * cells;
    this.writeUniformMaterial(initial);
    this.seedTemperature(InitialCondition.UNIFORM);
  }

  // ── Read-only state ─────────────────────────────────────────────────────────

  public get simulatedTime(): number {
    return this.elapsedTime;
  }

  public get substepSize(): number {
    return this.currentSubstep;
  }

  /** The stability-limited substep for the current material and flow, in seconds. */
  protected computeSubstep(flowScale: number, diffusionScale: number, diffusionEnabled: boolean): number {
    return stableTimeStep(
      this.geometry,
      diffusionEnabled ? this.maxDiffusivity * diffusionScale : 0,
      this.maxSpeed * flowScale,
      DIFFUSION_CFL,
      ADVECTION_CFL,
    );
  }

  // ── Authoring: material ─────────────────────────────────────────────────────

  public setMaterial(material: MaterialProperties): void {
    this.writeUniformMaterial(material);
    this.maxDiffusivity = maxDirectionalDiffusivity(material);
    this.diffusivitySum = this.maxDiffusivity * this.domain.cellCount;
    this.onMaterialChanged();
  }

  public paintMaterial(stroke: MaterialStroke): void {
    const kx = conductivityX(stroke.material);
    const ky = conductivityY(stroke.material);
    const rhoCp = volumetricHeatCapacity(stroke.material);
    const cellDiffusivity = Math.max(kx, ky) / rhoCp;

    this.forEachCellInStroke(stroke.u, stroke.v, stroke.radius, (index, weight) => {
      // A material brush is hard-edged in the middle and feathered at the rim, so
      // a composite has a clean interface but no single-pixel staircase.
      if (weight <= 0) {
        return;
      }
      const previous = (this.material.conductivityX[index] ?? 0) / (this.material.volumetricHeatCapacity[index] ?? 1);
      const previousY = (this.material.conductivityY[index] ?? 0) / (this.material.volumetricHeatCapacity[index] ?? 1);
      this.diffusivitySum += cellDiffusivity - Math.max(previous, previousY);

      this.material.conductivityX[index] = kx;
      this.material.conductivityY[index] = ky;
      this.material.volumetricHeatCapacity[index] = rhoCp;
    });

    this.maxDiffusivity = Math.max(this.maxDiffusivity, cellDiffusivity);
    this.onMaterialChanged();
  }

  private writeUniformMaterial(material: MaterialProperties): void {
    this.material.conductivityX.fill(conductivityX(material));
    this.material.conductivityY.fill(conductivityY(material));
    this.material.volumetricHeatCapacity.fill(volumetricHeatCapacity(material));
  }

  // ── Authoring: flow ─────────────────────────────────────────────────────────

  public setFlow(preset: FlowPresetId, speed: number): void {
    fillVelocityField(this.velocity, this.domain.gridWidth, this.domain.gridHeight, preset, speed);

    let max = 0;
    for (let index = 0; index < this.velocity.length; index += 2) {
      const vx = this.velocity[index] ?? 0;
      const vy = this.velocity[index + 1] ?? 0;
      const magnitude = Math.hypot(vx, vy);
      if (magnitude > max) {
        max = magnitude;
      }
    }
    this.maxSpeed = max;
    this.onVelocityChanged();
  }

  // ── Authoring: temperature ──────────────────────────────────────────────────

  public paintTemperature(stroke: BrushStroke): void {
    this.applyBrushToMirror(stroke);
    this.onTemperaturePainted(stroke);
  }

  /** Applies a brush stroke to the CPU mirror. Both backends do this; the GPU one also dispatches a shader. */
  protected applyBrushToMirror(stroke: BrushStroke): void {
    this.forEachCellInStroke(stroke.u, stroke.v, stroke.radius, (index, weight) => {
      const current = this.temperatureMirror[index] ?? AMBIENT_TEMPERATURE_K;
      const amount = stroke.strength * weight;
      this.temperatureMirror[index] = current + (stroke.temperature - current) * amount;
    });
  }

  public resetField(initial: InitialConditionId): void {
    this.seedTemperature(initial);
    this.elapsedTime = 0;
    this.onTemperatureReseeded();
  }

  /** Writes the chosen initial condition into the temperature mirror. */
  protected seedTemperature(initial: InitialConditionId): void {
    this.lastInitialCondition = initial;
    const { gridWidth, gridHeight } = this.domain;

    for (let j = 0; j < gridHeight; j++) {
      const v = (j + 0.5) / gridHeight;
      for (let i = 0; i < gridWidth; i++) {
        const u = (i + 0.5) / gridWidth;
        this.temperatureMirror[j * gridWidth + i] = initialTemperatureAt(initial, u, v);
      }
    }
  }

  // ── Backend hooks ───────────────────────────────────────────────────────────

  /** Called after the material field changes, so a backend can re-upload it. */
  protected abstract onMaterialChanged(): void;

  /** Called after the velocity field changes, so a backend can re-upload it. */
  protected abstract onVelocityChanged(): void;

  /** Called after a brush stroke has been applied to the mirror. */
  protected abstract onTemperaturePainted(stroke: BrushStroke): void;

  /** Called after the mirror has been reseeded, so a backend can upload it. */
  protected abstract onTemperatureReseeded(): void;

  // ── Reading ─────────────────────────────────────────────────────────────────

  public sampleTemperature(u: number, v: number): number {
    return bilinearSample(
      this.temperatureMirror,
      this.geometry,
      this.boundary,
      this.domain.unitToGridX(u),
      this.domain.unitToGridY(v),
      AMBIENT_TEMPERATURE_K,
    );
  }

  public sampleHeatFlux(u: number, v: number): { qx: number; qy: number } {
    const { i, j } = this.domain.unitToCell(u, v);
    const { gx, gy } = gradientAt(this.temperatureMirror, this.geometry, this.boundary, i, j, AMBIENT_TEMPERATURE_K);
    const index = this.domain.index(i, j);
    return {
      qx: -(this.material.conductivityX[index] ?? 0) * gx,
      qy: -(this.material.conductivityY[index] ?? 0) * gy,
    };
  }

  public sampleCrossSection(u0: number, v0: number, u1: number, v1: number, count: number): CrossSectionSample[] {
    const samples: CrossSectionSample[] = [];
    if (count < 2) {
      return samples;
    }

    const dxMetres = (u1 - u0) * this.domain.physicalWidth;
    const dyMetres = (v1 - v0) * this.domain.physicalHeight;
    const length = Math.hypot(dxMetres, dyMetres);
    if (length === 0) {
      return samples;
    }
    const dirX = dxMetres / length;
    const dirY = dyMetres / length;
    const spacing = length / (count - 1);

    for (let n = 0; n < count; n++) {
      const t = n / (count - 1);
      const u = u0 + (u1 - u0) * t;
      const v = v0 + (v1 - v0) * t;
      const temperature = this.sampleTemperature(u, v);

      const { i, j } = this.domain.unitToCell(u, v);
      const { gx, gy } = gradientAt(this.temperatureMirror, this.geometry, this.boundary, i, j, AMBIENT_TEMPERATURE_K);
      // Directional derivative dT/ds and the flux component along the same line.
      const gradient = gx * dirX + gy * dirY;
      const index = this.domain.index(i, j);
      const kAlongLine =
        (this.material.conductivityX[index] ?? 0) * dirX * dirX +
        (this.material.conductivityY[index] ?? 0) * dirY * dirY;

      samples.push({
        distance: n * spacing,
        temperature,
        gradient,
        flux: -kAlongLine * gradient,
      });
    }

    return samples;
  }

  public getStatistics(): FieldStatistics {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let sum = 0;
    const cells = this.domain.cellCount;
    for (let index = 0; index < cells; index++) {
      const value = this.temperatureMirror[index] ?? AMBIENT_TEMPERATURE_K;
      sum += value;
      if (value < min) {
        min = value;
      }
      if (value > max) {
        max = value;
      }
    }
    return cells > 0
      ? { minTemperature: min, maxTemperature: max, meanTemperature: sum / cells }
      : { minTemperature: 0, maxTemperature: 0, meanTemperature: 0 };
  }

  public getMaxSpeed(): number {
    return this.maxSpeed;
  }

  public getMeanDiffusivity(): number {
    const cells = this.domain.cellCount;
    return cells > 0 ? this.diffusivitySum / cells : 0;
  }

  public abstract step(parameters: import("./FieldTypes.js").TransportParameters): number;

  public abstract render(
    layers: import("./FieldTypes.js").LayerVisibility,
    style: import("./FieldEngine.js").FieldRenderStyle,
  ): void;

  public abstract dispose(): void;

  // ── Stroke geometry ─────────────────────────────────────────────────────────

  /**
   * Visits every cell touched by a disc brush, with a smooth falloff weight.
   *
   * The weight is `1 - (r/R)^2` squared — a compactly supported bump that is 1 at
   * the centre and reaches 0 with zero slope at the rim, so repeated strokes
   * build up a smooth Gaussian-looking blob rather than a stack of hard discs.
   */
  protected forEachCellInStroke(
    u: number,
    v: number,
    radiusFraction: number,
    visit: (index: number, weight: number) => void,
  ): void {
    const { gridWidth, gridHeight } = this.domain;
    const radiusCells = radiusFraction * Math.min(gridWidth, gridHeight);
    if (radiusCells <= 0) {
      return;
    }

    const centreX = u * gridWidth;
    const centreY = v * gridHeight;
    const minI = Math.max(0, Math.floor(centreX - radiusCells));
    const maxI = Math.min(gridWidth - 1, Math.ceil(centreX + radiusCells));
    const minJ = Math.max(0, Math.floor(centreY - radiusCells));
    const maxJ = Math.min(gridHeight - 1, Math.ceil(centreY + radiusCells));
    const radiusSquared = radiusCells * radiusCells;

    for (let j = minJ; j <= maxJ; j++) {
      const dy = j + 0.5 - centreY;
      for (let i = minI; i <= maxI; i++) {
        const dx = i + 0.5 - centreX;
        const normalized = (dx * dx + dy * dy) / radiusSquared;
        if (normalized >= 1) {
          continue;
        }
        const falloff = 1 - normalized;
        visit(j * gridWidth + i, falloff * falloff);
      }
    }
  }
}

/** The temperature an initial condition prescribes at a unit-square point, in kelvin. */
export function initialTemperatureAt(initial: InitialConditionId, u: number, v: number): number {
  switch (initial) {
    case InitialCondition.HOT_SPOT: {
      const r2 = (u - 0.5) ** 2 + (v - 0.5) ** 2;
      return AMBIENT_TEMPERATURE_K + (HOT_BRUSH_TEMPERATURE_K - AMBIENT_TEMPERATURE_K) * Math.exp(-r2 / 0.006);
    }

    case InitialCondition.GRADIENT:
      // Linear ramp: hot left wall, cold right wall — the textbook 1-D setup.
      return HOT_BRUSH_TEMPERATURE_K + (COOL_BRUSH_TEMPERATURE_K - HOT_BRUSH_TEMPERATURE_K) * u;

    case InitialCondition.TWO_SPOTS: {
      const hot = Math.exp(-((u - 0.28) ** 2 + (v - 0.5) ** 2) / 0.006);
      const cold = Math.exp(-((u - 0.72) ** 2 + (v - 0.5) ** 2) / 0.006);
      return (
        AMBIENT_TEMPERATURE_K +
        (HOT_BRUSH_TEMPERATURE_K - AMBIENT_TEMPERATURE_K) * hot +
        (COOL_BRUSH_TEMPERATURE_K - AMBIENT_TEMPERATURE_K) * cold
      );
    }

    default:
      return AMBIENT_TEMPERATURE_K;
  }
}
