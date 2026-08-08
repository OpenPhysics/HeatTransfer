/**
 * VelocityPresets.ts
 *
 * Analytic velocity fields. Each preset returns a *direction* field whose
 * magnitude never exceeds 1; the engine multiplies it by the requested speed in
 * m/s. Keeping the presets dimensionless means the flow-speed control and the
 * Peclet readout have one unambiguous scale to talk about, and it makes the
 * advection CFL bound trivially `speed * dt / dx`.
 *
 * `channel`, `vortex`, and `plume` are all divergence-free by construction (the
 * latter two are written from a stream function), so advecting a temperature
 * field with them neither compresses nor rarefies it — heat is transported, not
 * created.
 *
 * Coordinates are the unit square with v increasing *downward*, matching both
 * the texture layout and Scenery's screen coordinates. "Up" is therefore
 * negative v.
 */

import HeatTransferNamespace from "../../HeatTransferNamespace.js";
import { FlowPreset, type FlowPresetId } from "./FieldTypes.js";

/** Radius of the vortex core, as a fraction of the domain's shorter side. */
const VORTEX_CORE_RADIUS = 0.22;

/** A dimensionless velocity direction with |v| <= 1. */
export type UnitVelocity = { vx: number; vy: number };

/**
 * Evaluates a preset at a point in the unit square.
 *
 * @param preset - which analytic field to evaluate
 * @param u - horizontal position in [0, 1]
 * @param v - vertical position in [0, 1], increasing downward
 */
export function evaluateFlowPreset(preset: FlowPresetId, u: number, v: number): UnitVelocity {
  switch (preset) {
    case FlowPreset.NONE:
      return { vx: 0, vy: 0 };

    case FlowPreset.UNIFORM:
      // v = (U, 0): every parcel moves right at the same speed.
      return { vx: 1, vy: 0 };

    case FlowPreset.CHANNEL: {
      // Hagen-Poiseuille profile between no-slip walls at v = 0 and v = 1:
      //   v_x(y) = U_max (1 - (y/R)^2)  with y measured from the centreline.
      const y = 2 * v - 1;
      return { vx: 1 - y * y, vy: 0 };
    }

    case FlowPreset.VORTEX: {
      // Lamb-Oseen-like swirl: solid-body rotation inside the core, decaying
      // outside it, and exactly zero at the centre (no singularity to guard).
      const dx = u - 0.5;
      const dy = v - 0.5;
      const rSquared = dx * dx + dy * dy;
      const coreSquared = VORTEX_CORE_RADIUS * VORTEX_CORE_RADIUS;
      // speed/r, so multiplying by the (-dy, dx) offset gives the tangential field
      const omega = Math.exp(0.5 * (1 - rSquared / coreSquared)) / VORTEX_CORE_RADIUS;
      return { vx: -dy * omega, vy: dx * omega };
    }

    case FlowPreset.PLUME: {
      // Stream function psi = A sin(2 pi u) sin(pi v) with A = -1/(2 pi), giving
      //   v_x =  d(psi)/dv,  v_y = -d(psi)/du
      // Two counter-rotating cells: rising in the middle, sinking at both walls.
      const amplitude = -1 / (2 * Math.PI);
      const vx = amplitude * Math.PI * Math.sin(2 * Math.PI * u) * Math.cos(Math.PI * v);
      const vy = -amplitude * 2 * Math.PI * Math.cos(2 * Math.PI * u) * Math.sin(Math.PI * v);
      return { vx, vy };
    }

    default:
      return { vx: 0, vy: 0 };
  }
}

/**
 * Fills an interleaved (vx, vy) buffer with `preset` scaled to `speed` m/s.
 * The buffer is laid out row-major with two floats per cell, matching the
 * `rg32float` velocity texture the GPU backend uploads it into.
 */
export function fillVelocityField(
  target: Float32Array,
  gridWidth: number,
  gridHeight: number,
  preset: FlowPresetId,
  speed: number,
): void {
  for (let j = 0; j < gridHeight; j++) {
    const v = (j + 0.5) / gridHeight;
    for (let i = 0; i < gridWidth; i++) {
      const u = (i + 0.5) / gridWidth;
      const { vx, vy } = evaluateFlowPreset(preset, u, v);
      const offset = 2 * (j * gridWidth + i);
      target[offset] = vx * speed;
      target[offset + 1] = vy * speed;
    }
  }
}

HeatTransferNamespace.register("VelocityPresets", { evaluateFlowPreset });
