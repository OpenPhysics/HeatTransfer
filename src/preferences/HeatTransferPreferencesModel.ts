/**
 * HeatTransferPreferencesModel.ts
 *
 * Simulation-specific preferences, shown in Preferences → Simulation. Initial
 * values come from the matching query parameters.
 *
 * Resolution is a preference rather than an in-screen control on purpose: it
 * changes how much GPU memory the fields occupy and how much work a frame is, so
 * it belongs with the other machine-shaped settings and not next to the physics
 * controls. A screen reads it when its model is built, so changing it takes
 * effect on the next screen load rather than reallocating textures underneath a
 * running simulation.
 */

import { BooleanProperty, StringUnionProperty } from "scenerystack/axon";
import type { Tandem } from "scenerystack/tandem";
import { RESOLUTION_PRESET_ORDER, type ResolutionPresetId } from "../HeatTransferConstants.js";
import HeatTransferNamespace from "../HeatTransferNamespace.js";
import heatTransferQueryParameters from "./heatTransferQueryParameters.js";

export class HeatTransferPreferencesModel {
  /**
   * Grid resolution the field engines request when a screen's model is built.
   *
   * A `StringUnionProperty` rather than a plain `Property<ResolutionPresetId>`:
   * it carries the valid-values list and the PhET-iO value type that a
   * tandem-registered Property requires, and it asserts on a bad value instead of
   * letting a typo reach `RESOLUTION_PRESETS` and produce `undefined` cells.
   */
  public readonly resolutionProperty: StringUnionProperty<ResolutionPresetId>;

  /** Whether the backend and grid-size readout is shown under the field. */
  public readonly showFieldStatusProperty: BooleanProperty;

  public constructor(tandem?: Tandem) {
    this.resolutionProperty = new StringUnionProperty<ResolutionPresetId>(
      heatTransferQueryParameters.resolution as ResolutionPresetId,
      {
        validValues: RESOLUTION_PRESET_ORDER,
        ...(tandem && { tandem: tandem.createTandem("resolutionProperty") }),
      },
    );

    this.showFieldStatusProperty = new BooleanProperty(
      heatTransferQueryParameters.showFieldStatus,
      tandem ? { tandem: tandem.createTandem("showFieldStatusProperty") } : undefined,
    );
  }

  public reset(): void {
    this.resolutionProperty.reset();
    this.showFieldStatusProperty.reset();
  }
}

HeatTransferNamespace.register("HeatTransferPreferencesModel", HeatTransferPreferencesModel);
