/**
 * ConductionModel.ts
 *
 * Screen 2: temperature differences drive heat flow.
 *
 * Still no flow, but now the material matters and the derived fields are on
 * display. Everything the flux and gradient layers show is computed from the same
 * temperature texture the colour map reads — turning them on adds render passes,
 * not physics. The default material is copper because its diffusivity makes the
 * response fast enough to see, and the interesting comparison is switching to
 * glass and watching almost nothing happen.
 */
import type { TModel } from "scenerystack/joist";
import { BoundaryCondition, FlowPreset, InitialCondition } from "../../common/field/FieldTypes.js";
import { FieldSimulationModel } from "../../common/model/FieldSimulationModel.js";
import { FIELD_VIEW_SIZE } from "../../HeatTransferConstants.js";
import type { HeatTransferPreferencesModel } from "../../preferences/HeatTransferPreferencesModel.js";

/** Backing-canvas resolution multiplier, so the field is crisp on high-DPI displays. */
const CANVAS_SCALE = 2;

export class ConductionModel implements TModel {
  public readonly field: FieldSimulationModel;

  public constructor(preferences: HeatTransferPreferencesModel) {
    this.field = new FieldSimulationModel({
      advectionEnabled: false,
      boundaryCondition: BoundaryCondition.INSULATED,
      defaultLayers: {
        temperature: true,
        isotherms: false,
        heatFlux: true,
        velocity: false,
        gradient: false,
        material: false,
      },
      // Two spots so there is a gradient to look at the moment the screen opens.
      initialCondition: InitialCondition.TWO_SPOTS,
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
