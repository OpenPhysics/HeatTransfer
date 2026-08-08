/**
 * HeatTransferConstants.ts
 *
 * Every named numeric constant used across the simulation.
 *
 * Conventions
 * ───────────
 *  - Physics / model values use SI units; the unit is named in the comment or
 *    the identifier suffix (`_M`, `_S`, `_K`, `_W_PER_M_K`, …).
 *  - Layout / chrome values are in screen pixels of the 1024 x 618 layout bounds.
 *  - Colours live in HeatTransferColors.ts, not here.
 */

import HeatTransferNamespace from "./HeatTransferNamespace.js";

// ── Layout / chrome (screen pixels) ───────────────────────────────────────────

/** Margin between the screen edge and edge-anchored controls (e.g. Reset All). */
export const SCREEN_VIEW_MARGIN = 20;

/** Corner radius shared by control panels and dialogs. */
export const PANEL_CORNER_RADIUS = 6;

/** Vertical spacing between stacked control panels. */
export const PANEL_SPACING = 10;

/** Side length of the square field view, in screen pixels. */
export const FIELD_VIEW_SIZE = 470;

/** Left edge of the field view. */
export const FIELD_VIEW_LEFT = 40;

/** Top edge of the field view. */
export const FIELD_VIEW_TOP = 60;

/** Width of the control column down the right-hand side. */
export const CONTROL_PANEL_WIDTH = 240;

/** Font size for panel titles. */
export const TITLE_FONT_SIZE = 15;

/** Font size for ordinary control labels and readouts. */
export const LABEL_FONT_SIZE = 13;

/** Font size for small annotations (legend ticks, units). */
export const SMALL_FONT_SIZE = 11;

// ── Grid resolution ───────────────────────────────────────────────────────────

/**
 * Named grid resolutions. The simulation is resolution-agnostic: these only
 * choose how many cells the field engine allocates. The CPU fallback backend is
 * clamped to {@link MAX_CPU_RESOLUTION} because it evolves the field on the main
 * thread.
 */
export const RESOLUTION_PRESETS = {
  classroom: 128,
  high: 512,
  large: 1024,
  extreme: 2048,
} as const;

export type ResolutionPresetId = keyof typeof RESOLUTION_PRESETS;

/** Preset order for UI controls (coarse to fine). */
export const RESOLUTION_PRESET_ORDER: readonly ResolutionPresetId[] = ["classroom", "high", "large", "extreme"];

/** The CPU fallback backend never allocates a grid finer than this. */
export const MAX_CPU_RESOLUTION = 128;

/** Resolution used when nothing else is specified. */
export const DEFAULT_RESOLUTION: ResolutionPresetId = "classroom";

// ── Time integration ──────────────────────────────────────────────────────────

/**
 * Safety factor on the explicit-diffusion stability limit. The 2-D five-point
 * Laplacian is stable for alpha*dt*(1/dx^2 + 1/dy^2) <= 1/2; staying at 40% of
 * that keeps the scheme well away from the boundary on non-square cells.
 */
export const DIFFUSION_CFL = 0.4;

/**
 * Courant number for advection. Semi-Lagrangian backtracing is unconditionally
 * stable, but accuracy degrades once a parcel jumps more than a cell or two per
 * substep, so the substep is also capped by |v| dt / dx <= this.
 */
export const ADVECTION_CFL = 1.0;

/**
 * Diffusion substeps taken per animation frame at normal speed. The simulation
 * always integrates at the stability-limited step, so this — not a wall-clock
 * target — is what sets how fast the field evolves on screen. See doc/model.md.
 */
export const SUBSTEPS_PER_FRAME = 8;

/** Multiplier applied to {@link SUBSTEPS_PER_FRAME} for TimeControlNode's slow speed. */
export const SLOW_SPEED_FACTOR = 0.25;

/** Largest frame delta the model will accept, in seconds (guards against tab-switch jumps). */
export const MAX_FRAME_DT = 1 / 20;

// ── Temperature ───────────────────────────────────────────────────────────────

/** Ambient / initial temperature of the plate, in kelvin (20 degrees Celsius). */
export const AMBIENT_TEMPERATURE_K = 293.15;

/** Coldest temperature the colour map resolves, in kelvin (-20 degrees Celsius). */
export const MIN_TEMPERATURE_K = 253.15;

/** Hottest temperature the colour map resolves, in kelvin (180 degrees Celsius). */
export const MAX_TEMPERATURE_K = 453.15;

/** Offset between kelvin and degrees Celsius. */
export const KELVIN_TO_CELSIUS_OFFSET = 273.15;

/** Temperature deposited by the heat brush at full strength, in kelvin. */
export const HOT_BRUSH_TEMPERATURE_K = MAX_TEMPERATURE_K;

/** Temperature deposited by the cool brush at full strength, in kelvin. */
export const COOL_BRUSH_TEMPERATURE_K = MIN_TEMPERATURE_K;

/** Spacing between isotherm contour lines, in kelvin. */
export const ISOTHERM_INTERVAL_K = 10;

// ── Brush ─────────────────────────────────────────────────────────────────────

/** Brush radius as a fraction of the domain's shorter side. */
export const DEFAULT_BRUSH_RADIUS_FRACTION = 0.08;

/** Smallest selectable brush radius, as a fraction of the domain's shorter side. */
export const MIN_BRUSH_RADIUS_FRACTION = 0.02;

/** Largest selectable brush radius, as a fraction of the domain's shorter side. */
export const MAX_BRUSH_RADIUS_FRACTION = 0.2;

/**
 * Fraction of the way to the brush temperature that a single application moves a
 * cell at the brush centre. Repeated strokes saturate rather than overshoot.
 */
export const BRUSH_STRENGTH = 0.35;

// ── Flow ──────────────────────────────────────────────────────────────────────

/** Flow speed at the "fast" end of the speed control, in metres per second. */
export const MAX_FLOW_SPEED = 0.01;

/** Default flow speed, in metres per second. */
export const DEFAULT_FLOW_SPEED = 0.002;

// ── Visualization ─────────────────────────────────────────────────────────────

/** Number of heat-flux arrows across the field, per axis. */
export const FLUX_ARROW_COUNT = 20;

/** Longest an arrow may be drawn, as a fraction of the field's on-screen size. */
export const MAX_ARROW_LENGTH_FRACTION = 0.055;

/** Number of tracer particles used to visualize the velocity field. */
export const PARTICLE_COUNT = 1800;

/** Tracer particle lifetime, in seconds, before it respawns at a random position. */
export const PARTICLE_LIFETIME_S = 6;

/** How many animation frames pass between GPU-to-CPU field readbacks. */
export const READBACK_FRAME_INTERVAL = 4;

/** Number of samples taken along the cross-section line. */
export const CROSS_SECTION_SAMPLES = 128;

HeatTransferNamespace.register("HeatTransferConstants", {
  ADVECTION_CFL,
  AMBIENT_TEMPERATURE_K,
  BRUSH_STRENGTH,
  CONTROL_PANEL_WIDTH,
  COOL_BRUSH_TEMPERATURE_K,
  CROSS_SECTION_SAMPLES,
  DEFAULT_BRUSH_RADIUS_FRACTION,
  DEFAULT_FLOW_SPEED,
  DEFAULT_RESOLUTION,
  DIFFUSION_CFL,
  FIELD_VIEW_LEFT,
  FIELD_VIEW_SIZE,
  FIELD_VIEW_TOP,
  FLUX_ARROW_COUNT,
  HOT_BRUSH_TEMPERATURE_K,
  ISOTHERM_INTERVAL_K,
  KELVIN_TO_CELSIUS_OFFSET,
  LABEL_FONT_SIZE,
  MAX_ARROW_LENGTH_FRACTION,
  MAX_BRUSH_RADIUS_FRACTION,
  MAX_CPU_RESOLUTION,
  MAX_FLOW_SPEED,
  MAX_FRAME_DT,
  MAX_TEMPERATURE_K,
  MIN_BRUSH_RADIUS_FRACTION,
  MIN_TEMPERATURE_K,
  PANEL_CORNER_RADIUS,
  PANEL_SPACING,
  PARTICLE_COUNT,
  PARTICLE_LIFETIME_S,
  READBACK_FRAME_INTERVAL,
  RESOLUTION_PRESETS,
  SCREEN_VIEW_MARGIN,
  SLOW_SPEED_FACTOR,
  SMALL_FONT_SIZE,
  SUBSTEPS_PER_FRAME,
  TITLE_FONT_SIZE,
});
