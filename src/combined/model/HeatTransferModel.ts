/**
 * HeatTransferModel.ts
 *
 * Screen 4: the laboratory. Both mechanisms run, and the balance between them is
 * the control.
 *
 * Every layer is available here because the point of the screen is that they are
 * all views of one state: the same texture drives the colour map, the contour
 * pass, the flux arrows, and the gradient overlay, and the tracer particles ride
 * the same velocity field the advection pass reads. Nothing a checkbox does can
 * change the simulation.
 */
import type { TModel } from "scenerystack/joist";
import { BoundaryCondition, FlowPreset, InitialCondition } from "../../common/field/FieldTypes.js";
import { FieldSimulationModel } from "../../common/model/FieldSimulationModel.js";
import { FIELD_VIEW_SIZE } from "../../HeatTransferConstants.js";
import type { HeatTransferPreferencesModel } from "../../preferences/HeatTransferPreferencesModel.js";

/** Backing-canvas resolution multiplier, so the field is crisp on high-DPI displays. */
const CANVAS_SCALE = 2;

export class HeatTransferModel implements TModel {
  public readonly field: FieldSimulationModel;

  public constructor(preferences: HeatTransferPreferencesModel) {
    this.field = new FieldSimulationModel({
      advectionEnabled: true,
      boundaryCondition: BoundaryCondition.PERIODIC,
      defaultLayers: {
        temperature: true,
        isotherms: false,
        heatFlux: true,
        velocity: true,
        gradient: false,
        material: false,
      },
      initialCondition: InitialCondition.HOT_SPOT,
      initialFlowPreset: FlowPreset.CHANNEL,
      resolution: preferences.resolutionProperty.value,
      displaySize: FIELD_VIEW_SIZE * CANVAS_SCALE,
      initiallyPlaying: true,
    });

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
