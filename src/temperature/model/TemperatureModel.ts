/**
 * TemperatureModel.ts
 *
 * Screen 1: temperature as a field.
 *
 * The physics here is deliberately as thin as it can be while still being real.
 * Diffusion runs — a painted hot spot does soften over time, because a plate that
 * held a razor-edged blob forever would teach the wrong thing — but there is no
 * flow, no material choice, and no flux visualization to interpret. What the
 * student is meant to take away is only this: every point of the surface has a
 * temperature, and it is a number you can read.
 */
import type { TModel } from "scenerystack/joist";
import {
  BoundaryCondition,
  FlowPreset,
  InitialCondition,
  TEMPERATURE_ONLY_LAYERS,
} from "../../common/field/FieldTypes.js";
import { FieldSimulationModel } from "../../common/model/FieldSimulationModel.js";
import { FIELD_VIEW_SIZE } from "../../HeatTransferConstants.js";
import type { HeatTransferPreferencesModel } from "../../preferences/HeatTransferPreferencesModel.js";

/** Backing-canvas resolution multiplier, so the field is crisp on high-DPI displays. */
const CANVAS_SCALE = 2;

export class TemperatureModel implements TModel {
  public readonly field: FieldSimulationModel;

  public constructor(preferences: HeatTransferPreferencesModel) {
    this.field = new FieldSimulationModel({
      advectionEnabled: false,
      boundaryCondition: BoundaryCondition.INSULATED,
      defaultLayers: TEMPERATURE_ONLY_LAYERS,
      initialCondition: InitialCondition.UNIFORM,
      initialFlowPreset: FlowPreset.NONE,
      resolution: preferences.resolutionProperty.value,
      displaySize: FIELD_VIEW_SIZE * CANVAS_SCALE,
      initiallyPlaying: true,
    });
  }

  public step(dt: number): void {
    this.field.step(dt);
  }

  public reset(): void {
    this.field.reset();
  }

  public dispose(): void {
    this.field.dispose();
  }
}
