/**
 * FieldEngine.ts
 *
 * The contract between the simulation and whatever is actually evolving and
 * drawing the fields.
 *
 * The model never touches a texture, a shader, or a typed array. It hands the
 * engine parameters and strokes and asks for samples; the engine owns the field
 * data and the canvas it paints into. Two backends implement this interface:
 *
 *   WebGpuFieldEngine — fields live in GPU textures, compute shaders evolve them,
 *                       render pipelines draw them. The primary path.
 *   CpuFieldEngine    — the same semantics in TypeScript over Float32Arrays,
 *                       drawn with the 2-D canvas API. The fallback, and the
 *                       reference the unit tests check the physics against.
 *
 * Because the interface is expressed in unit-square coordinates and physical
 * units — never in cells — nothing above it changes when the grid resolution
 * does.
 */

import type { Rgb } from "./ColorMap.js";
import type {
  BrushStroke,
  CrossSectionSample,
  FieldStatistics,
  FlowPresetId,
  InitialConditionId,
  LayerVisibility,
  MaterialProperties,
  MaterialStroke,
  TransportParameters,
} from "./FieldTypes.js";
import type { SimulationDomain } from "./SimulationDomain.js";

/** Which substrate is evolving the fields. */
export const FieldBackend = {
  WEBGPU: "webgpu",
  CPU: "cpu",
} as const;

export type FieldBackendId = (typeof FieldBackend)[keyof typeof FieldBackend];

/**
 * Colours and ranges the render passes need. Supplied by the view from
 * HeatTransferColors so the overlays follow the active colour profile — the
 * field renderer holds no palette of its own.
 */
export type FieldRenderStyle = {
  /** Isotherm contour lines. */
  isotherm: Rgb;
  /** Heat-flux arrows. */
  arrow: Rgb;
  /** Velocity tracer particles. */
  particle: Rgb;
  /** Temperature mapped to the bottom of the colour ramp, in kelvin. */
  minTemperature: number;
  /** Temperature mapped to the top of the colour ramp, in kelvin. */
  maxTemperature: number;
  /** Spacing between isotherms, in kelvin. */
  isothermInterval: number;
};

export type FieldEngineOptions = {
  /** Edge length of the square backing canvas, in device pixels. */
  displaySize: number;
};

export interface FieldEngine {
  /** The grid these fields live on. */
  readonly domain: SimulationDomain;

  /** Which backend this is. Surfaced in the UI so the substrate is never a mystery. */
  readonly backend: FieldBackendId;

  /** The canvas the engine renders into. The view wraps it in a Scenery Image. */
  readonly canvas: HTMLCanvasElement;

  /** Simulated time elapsed since the last reset, in seconds. */
  readonly simulatedTime: number;

  /** The stability-limited substep the engine is currently integrating at, in seconds. */
  readonly substepSize: number;

  // ── Authoring the fields ────────────────────────────────────────────────────

  /** Replaces the material field with a single homogeneous material. */
  setMaterial(material: MaterialProperties): void;

  /** Paints a material disc into the material field. */
  paintMaterial(stroke: MaterialStroke): void;

  /** Replaces the velocity field with a preset scaled to `speed` metres per second. */
  setFlow(preset: FlowPresetId, speed: number): void;

  /** Paints a temperature disc into the temperature field. */
  paintTemperature(stroke: BrushStroke): void;

  /** Reseeds the temperature field and zeroes the clock. Materials and flow are untouched. */
  resetField(initial: InitialConditionId): void;

  // ── Evolving the fields ─────────────────────────────────────────────────────

  /**
   * Advances the temperature field by `parameters.substeps` stability-limited
   * substeps and returns the simulated time advanced, in seconds.
   */
  step(parameters: TransportParameters): number;

  // ── Drawing the fields ──────────────────────────────────────────────────────

  /** Runs the enabled visualization passes over the current state. */
  render(layers: LayerVisibility, style: FieldRenderStyle): void;

  // ── Reading the fields ──────────────────────────────────────────────────────

  /** Bilinearly samples temperature at a unit-square point, in kelvin. */
  sampleTemperature(u: number, v: number): number;

  /** Samples the heat flux q = -k grad(T) at a unit-square point, in W/m^2. */
  sampleHeatFlux(u: number, v: number): { qx: number; qy: number };

  /** Samples temperature, gradient, and flux along a line across the field. */
  sampleCrossSection(u0: number, v0: number, u1: number, v1: number, count: number): CrossSectionSample[];

  /** Min / max / mean temperature over the whole field, in kelvin. */
  getStatistics(): FieldStatistics;

  /** The largest |v| currently in the velocity field, in m/s. Used for the Peclet readout. */
  getMaxSpeed(): number;

  /** The area-weighted mean thermal diffusivity, in m^2/s. Used for the Peclet readout. */
  getMeanDiffusivity(): number;

  /** Releases GPU resources, listeners, and buffers. */
  dispose(): void;
}
