/**
 * HeatTransferPreferencesNode.ts
 *
 * Custom preferences UI shown in Preferences → Simulation.
 *
 * The Preferences dialog is always white, so text here uses the light
 * control-surface colours rather than `textColorProperty`, which is near-white in
 * the default profile and would be invisible.
 */

import { Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { AquaRadioButtonGroup, Checkbox } from "scenerystack/sun";
import type { Tandem } from "scenerystack/tandem";
import HeatTransferColors from "../HeatTransferColors.js";
import { RESOLUTION_PRESET_ORDER, type ResolutionPresetId } from "../HeatTransferConstants.js";
import HeatTransferNamespace from "../HeatTransferNamespace.js";
import { StringManager } from "../i18n/StringManager.js";
import type { HeatTransferPreferencesModel } from "./HeatTransferPreferencesModel.js";

/** Preference-label font size. */
const LABEL_SIZE = 14;

export class HeatTransferPreferencesNode extends VBox {
  public constructor(preferencesModel: HeatTransferPreferencesModel, tandem?: Tandem) {
    const strings = StringManager.getInstance();
    const preferenceStrings = strings.getPreferences();

    const dialogText = (): { font: PhetFont; fill: typeof HeatTransferColors.controlSurfaceTextColorProperty } => ({
      font: new PhetFont(LABEL_SIZE),
      fill: HeatTransferColors.controlSurfaceTextColorProperty,
    });

    const header = new Text(preferenceStrings.titleStringProperty, {
      font: new PhetFont({ size: 18, weight: "bold" }),
      fill: HeatTransferColors.controlSurfaceTextColorProperty,
    });

    const resolutionHeader = new Text(preferenceStrings.resolutionStringProperty, {
      font: new PhetFont({ size: LABEL_SIZE, weight: "bold" }),
      fill: HeatTransferColors.controlSurfaceTextColorProperty,
    });

    const resolutionLabels: Record<ResolutionPresetId, typeof preferenceStrings.resolutionClassroomStringProperty> = {
      classroom: preferenceStrings.resolutionClassroomStringProperty,
      high: preferenceStrings.resolutionHighStringProperty,
      large: preferenceStrings.resolutionLargeStringProperty,
      extreme: preferenceStrings.resolutionExtremeStringProperty,
    };

    const resolutionRadioButtons = new AquaRadioButtonGroup(
      preferencesModel.resolutionProperty,
      RESOLUTION_PRESET_ORDER.map((preset) => ({
        value: preset,
        createNode: () => new Text(resolutionLabels[preset], dialogText()),
        options: { accessibleName: resolutionLabels[preset] },
      })),
      {
        orientation: "vertical",
        align: "left",
        spacing: 6,
        radioButtonOptions: { radius: 7 },
        accessibleName: preferenceStrings.resolutionStringProperty,
        accessibleHelpText: preferenceStrings.resolutionHelpStringProperty,
        ...(tandem && { tandem: tandem.createTandem("resolutionRadioButtonGroup") }),
      },
    );

    const resolutionHelp = new Text(preferenceStrings.resolutionHelpStringProperty, {
      font: new PhetFont(11),
      fill: HeatTransferColors.controlSurfaceTextColorProperty,
      maxWidth: 340,
    });

    const statusCheckbox = new Checkbox(
      preferencesModel.showFieldStatusProperty,
      new Text(preferenceStrings.showFieldStatusStringProperty, dialogText()),
      {
        checkboxColor: HeatTransferColors.controlSurfaceTextColorProperty,
        checkboxColorBackground: HeatTransferColors.controlSurfaceColorProperty,
        spacing: 8,
        accessibleName: preferenceStrings.showFieldStatusStringProperty,
        ...(tandem && { tandem: tandem.createTandem("showFieldStatusCheckbox") }),
      },
    );

    super({
      align: "left",
      spacing: 12,
      children: [header, resolutionHeader, resolutionRadioButtons, resolutionHelp, statusCheckbox],
    });
  }
}

HeatTransferNamespace.register("HeatTransferPreferencesNode", HeatTransferPreferencesNode);
