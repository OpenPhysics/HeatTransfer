/**
 * FieldTypes.ts
 *
 * The vocabulary shared by the model, the two field-engine backends, and the
 * view. Everything here is plain data: no Scenery, no WebGPU, no axon. Both
 * backends implement the same semantics against these types, which is what makes
 * the CPU reference backend a usable oracle for the GPU one.
 */

import HeatTransferNamespace from "../../HeatTransferNamespace.js";

// ── Boundary conditions ───────────────────────────────────────────────────────

/**
 * How the field behaves at the edge of the domain.
 *
 *  - `insulated` — zero normal gradient (adiabatic). Energy is conserved.
 *  - `fixed`     — edges are held at the ambient temperature (Dirichlet).
 *  - `periodic`  — the domain wraps, so what leaves one side re-enters the other.
 */
export const BoundaryCondition = {
  INSULATED: "insulated",
  FIXED: "fixed",
  PERIODIC: "periodic",
} as const;

export type BoundaryConditionId = (typeof BoundaryCondition)[keyof typeof BoundaryCondition];

export const BOUNDARY_CONDITION_ORDER: readonly BoundaryConditionId[] = [
  BoundaryCondition.INSULATED,
  BoundaryCondition.FIXED,
  BoundaryCondition.PERIODIC,
];

// ── Flow presets ──────────────────────────────────────────────────────────────

/**
 * Prescribed velocity fields. None of these solve Navier-Stokes; they are
 * analytic fields that give students a `v` to reason about. `plume` is the
 * closest to natural convection: an upward jet up the middle with return flow
 * down the sides.
 */
export const FlowPreset = {
  NONE: "none",
  UNIFORM: "uniform",
  CHANNEL: "channel",
  VORTEX: "vortex",
  PLUME: "plume",
} as const;

export type FlowPresetId = (typeof FlowPreset)[keyof typeof FlowPreset];

export const FLOW_PRESET_ORDER: readonly FlowPresetId[] = [
  FlowPreset.NONE,
  FlowPreset.UNIFORM,
  FlowPreset.CHANNEL,
  FlowPreset.VORTEX,
  FlowPreset.PLUME,
];

// ── Initial conditions ────────────────────────────────────────────────────────

/** How the temperature field is seeded on reset. */
export const InitialCondition = {
  /** Uniform ambient temperature — a blank canvas for the heat brush. */
  UNIFORM: "uniform",
  /** A single hot Gaussian blob at the centre. */
  HOT_SPOT: "hotSpot",
  /** Hot left edge, cold right edge — the classic 1-D conduction setup. */
  GRADIENT: "gradient",
  /** Hot blob on the left, cold blob on the right. */
  TWO_SPOTS: "twoSpots",
} as const;

export type InitialConditionId = (typeof InitialCondition)[keyof typeof InitialCondition];

// ── Brush ─────────────────────────────────────────────────────────────────────

/** A single application of the heat brush, in unit-square coordinates. */
export type BrushStroke = {
  /** Horizontal position in [0, 1]. */
  u: number;
  /** Vertical position in [0, 1]. */
  v: number;
  /** Radius as a fraction of the domain's shorter side. */
  radius: number;
  /** Temperature the brush pushes cells toward, in kelvin. */
  temperature: number;
  /** How far toward `temperature` the centre of the brush moves the field, in [0, 1]. */
  strength: number;
};

/** A single application of the material brush, in unit-square coordinates. */
export type MaterialStroke = {
  u: number;
  v: number;
  radius: number;
  /** Material painted inside the brush. */
  material: MaterialProperties;
};

// ── Materials ─────────────────────────────────────────────────────────────────

/**
 * The three properties that close the heat equation, plus an anisotropy ratio.
 *
 * The isotropic conductivity is `conductivity`; an anisotropic material scales
 * it by `anisotropy` along x and by 1/`anisotropy` along y, so the geometric
 * mean conductivity — and therefore the material's identity — is preserved while
 * heat is free to travel more easily along one axis. An anisotropy of 1 is
 * isotropic.
 */
export type MaterialProperties = {
  /** Thermal conductivity k, in W/(m K). */
  conductivity: number;
  /** Density rho, in kg/m^3. */
  density: number;
  /** Specific heat capacity c_p, in J/(kg K). */
  specificHeat: number;
  /** Ratio of k_x to k_y, as a multiplier on sqrt(k). 1 is isotropic. */
  anisotropy: number;
};

/** Thermal diffusivity alpha = k / (rho c_p), in m^2/s. */
export function thermalDiffusivity(material: MaterialProperties): number {
  return material.conductivity / (material.density * material.specificHeat);
}

/** Volumetric heat capacity rho c_p, in J/(m^3 K). */
export function volumetricHeatCapacity(material: MaterialProperties): number {
  return material.density * material.specificHeat;
}

/** Conductivity along x, in W/(m K). */
export function conductivityX(material: MaterialProperties): number {
  return material.conductivity * material.anisotropy;
}

/** Conductivity along y, in W/(m K). */
export function conductivityY(material: MaterialProperties): number {
  return material.conductivity / material.anisotropy;
}

/**
 * The largest directional diffusivity, which is what limits the explicit time
 * step. For an isotropic material this is just alpha.
 */
export function maxDirectionalDiffusivity(material: MaterialProperties): number {
  const rhoCp = volumetricHeatCapacity(material);
  return Math.max(conductivityX(material), conductivityY(material)) / rhoCp;
}

// ── Transport parameters ──────────────────────────────────────────────────────

/**
 * Everything the integrator needs that is not stored per-cell. The model rebuilds
 * this each frame from its Properties and hands it to the engine, so neither
 * backend holds duplicated state that could drift out of sync with the UI.
 */
export type TransportParameters = {
  /** Whether the advection term v . grad(T) is integrated at all. */
  advectionEnabled: boolean;
  /** Whether the diffusion term alpha grad^2(T) is integrated at all. */
  diffusionEnabled: boolean;
  /** Multiplier applied to the material's conductivity (the "diffusion" control). */
  diffusionScale: number;
  /** Multiplier applied to the velocity field (the "flow speed" control). */
  flowScale: number;
  /** Behaviour at the domain edge. */
  boundaryCondition: BoundaryConditionId;
  /** Number of stability-limited substeps to take this frame. */
  substeps: number;
};

// ── Visualization layers ──────────────────────────────────────────────────────

/**
 * Which visualization passes run over the current field state. These are render
 * options, never simulation options: toggling a layer changes nothing about the
 * physics, which is exactly the distinction the Heat Transfer screen is meant to
 * teach.
 */
export type LayerVisibility = {
  /** The temperature colour map — the base layer. */
  temperature: boolean;
  /** Isotherm contour lines at fixed temperature intervals. */
  isotherms: boolean;
  /** Heat-flux arrows, q = -k grad(T). */
  heatFlux: boolean;
  /** Tracer particles advected by the velocity field. */
  velocity: boolean;
  /** |grad(T)| as a brightness overlay. */
  gradient: boolean;
  /** Material regions tinted by conductivity. */
  material: boolean;
};

/** No layer visible except the temperature field. */
export const TEMPERATURE_ONLY_LAYERS: LayerVisibility = {
  temperature: true,
  isotherms: false,
  heatFlux: false,
  velocity: false,
  gradient: false,
  material: false,
};

/** The layer ids in the order they are listed in the UI. */
export const LAYER_ORDER: readonly (keyof LayerVisibility)[] = [
  "temperature",
  "isotherms",
  "heatFlux",
  "velocity",
  "gradient",
  "material",
];

// ── Sampling ──────────────────────────────────────────────────────────────────

/** One sample along a cross-section line. */
export type CrossSectionSample = {
  /** Arc length from the start of the line, in metres. */
  distance: number;
  /** Temperature at this point, in kelvin. */
  temperature: number;
  /** Directional derivative dT/ds along the line, in K/m. */
  gradient: number;
  /** Heat flux along the line, q_s = -k dT/ds, in W/m^2. */
  flux: number;
};

/** Aggregate statistics over the whole temperature field. */
export type FieldStatistics = {
  minTemperature: number;
  maxTemperature: number;
  meanTemperature: number;
};

HeatTransferNamespace.register("FieldTypes", {
  BOUNDARY_CONDITION_ORDER,
  BoundaryCondition,
  FLOW_PRESET_ORDER,
  FlowPreset,
  InitialCondition,
  LAYER_ORDER,
  TEMPERATURE_ONLY_LAYERS,
});
