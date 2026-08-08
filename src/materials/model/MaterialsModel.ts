/**
 * MaterialsModel.ts
 *
 * Screen 5: the material becomes a field too.
 *
 * Up to here `k`, `rho`, and `c_p` have been three numbers. Here they are three
 * more textures, painted the same way temperature is painted, and the governing
 * equation becomes the general one:
 *
 *   rho c_p dT/dt = div(k grad T)
 *
 * The face conductivities in the diffusion kernel are harmonic means, so a
 * one-cell strip of foam really does act as a thermal resistance in series rather
 * than being averaged into its neighbours. That is what makes a painted barrier
 * behave like a barrier.
 */
import type { TModel } from "scenerystack/joist";
import { BoundaryCondition, FlowPreset, InitialCondition } from "../../common/field/FieldTypes.js";
import { BrushMode, FieldSimulationModel } from "../../common/model/FieldSimulationModel.js";
import { FIELD_VIEW_SIZE } from "../../HeatTransferConstants.js";
import type { HeatTransferPreferencesModel } from "../../preferences/HeatTransferPreferencesModel.js";

/** Backing-canvas resolution multiplier, so the field is crisp on high-DPI displays. */
const CANVAS_SCALE = 2;

export class MaterialsModel implements TModel {
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
        material: true,
      },
      initialCondition: InitialCondition.UNIFORM,
      initialFlowPreset: FlowPreset.NONE,
      resolution: preferences.resolutionProperty.value,
      displaySize: FIELD_VIEW_SIZE * CANVAS_SCALE,
      initiallyPlaying: true,
    });

    // This screen opens in material-painting mode: building the medium is the
    // first thing to do, and heating it only means something afterwards.
    this.field.brushModeProperty.value = BrushMode.MATERIAL;
  }

  public step(dt: number): void {
    this.field.step(dt);
  }

  public reset(): void {
    this.field.reset();
    this.field.brushModeProperty.value = BrushMode.MATERIAL;
  }

  public dispose(): void {
    this.field.dispose();
  }
}
