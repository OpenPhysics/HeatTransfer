/**
 * ConvectionModel.ts
 *
 * Screen 3: a second field enters the picture.
 *
 * The velocity field is prescribed rather than solved — these are analytic,
 * divergence-free patterns, not a Navier-Stokes solution — which keeps the
 * lesson on transport rather than on fluid dynamics. Diffusion still runs
 * underneath, so a hot spot both moves and spreads, and telling those two effects
 * apart is exactly what this screen is for.
 */
import type { TModel } from "scenerystack/joist";
import { BoundaryCondition, FlowPreset, InitialCondition } from "../../common/field/FieldTypes.js";
import { FieldSimulationModel } from "../../common/model/FieldSimulationModel.js";
import { FIELD_VIEW_SIZE } from "../../HeatTransferConstants.js";
import type { HeatTransferPreferencesModel } from "../../preferences/HeatTransferPreferencesModel.js";

/** Backing-canvas resolution multiplier, so the field is crisp on high-DPI displays. */
const CANVAS_SCALE = 2;

export class ConvectionModel implements TModel {
  public readonly field: FieldSimulationModel;

  public constructor(preferences: HeatTransferPreferencesModel) {
    this.field = new FieldSimulationModel({
      advectionEnabled: true,
      boundaryCondition: BoundaryCondition.PERIODIC,
      defaultLayers: {
        temperature: true,
        isotherms: false,
        heatFlux: false,
        velocity: true,
        gradient: false,
        material: false,
      },
      initialCondition: InitialCondition.HOT_SPOT,
      initialFlowPreset: FlowPreset.UNIFORM,
      resolution: preferences.resolutionProperty.value,
      displaySize: FIELD_VIEW_SIZE * CANVAS_SCALE,
      initiallyPlaying: true,
    });

    // Steel rather than copper: a lower diffusivity lets advection win at
    // achievable flow speeds, so the transport is visible instead of being
    // smeared out by conduction before it can travel.
    this.field.materialIdProperty.value = "steel";
  }

  public step(dt: number): void {
    this.field.step(dt);
  }

  public reset(): void {
    this.field.reset();
    this.field.materialIdProperty.value = "steel";
  }

  public dispose(): void {
    this.field.dispose();
  }
}
