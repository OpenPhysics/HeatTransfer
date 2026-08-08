/**
 * MaterialsScreen.ts
 *
 * Screen 5. Wires the model and view factories together and passes screen-level
 * options to `Screen`.
 *
 * The preferences model rides on the options bag because a screen's field engine
 * has to know its grid resolution at construction time, and SceneryStack builds a
 * screen's model lazily — the first time a student opens the screen.
 *
 * Registered in the screens array in src/main.ts. Its home-screen and
 * navigation-bar icons come from createMaterialsIcon() in
 * src/common/HeatTransferScreenIcons.ts (see doc/multi-screen.md).
 */
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import type { ScreenOptions } from "scenerystack/sim";
import { Screen } from "scenerystack/sim";
import type { Tandem } from "scenerystack/tandem";
import { createMaterialsIcon } from "../common/HeatTransferScreenIcons.js";
import HeatTransferColors from "../HeatTransferColors.js";
import type { HeatTransferPreferencesModel } from "../preferences/HeatTransferPreferencesModel.js";
import { MaterialsModel } from "./model/MaterialsModel.js";
import { MaterialsKeyboardHelpContent } from "./view/MaterialsKeyboardHelpContent.js";
import { MaterialsScreenView } from "./view/MaterialsScreenView.js";

// Require tandem to be explicit — accidental omission would break PhET-iO.
export type MaterialsScreenOptions = ScreenOptions & {
  tandem: Tandem;
  preferences: HeatTransferPreferencesModel;
};

export class MaterialsScreen extends Screen<MaterialsModel, MaterialsScreenView> {
  public constructor(options: MaterialsScreenOptions) {
    super(
      // Model factory — called once when the screen is first shown
      () => new MaterialsModel(options.preferences),
      // View factory — receives the model instance
      (model) =>
        new MaterialsScreenView(model, {
          tandem: options.tandem.createTandem("view"),
          showFieldStatusProperty: options.preferences.showFieldStatusProperty,
        }),
      optionize<MaterialsScreenOptions, EmptySelfOptions, ScreenOptions>()(
        {
          backgroundColorProperty: HeatTransferColors.backgroundColorProperty,
          createKeyboardHelpNode: () => new MaterialsKeyboardHelpContent(),
          homeScreenIcon: createMaterialsIcon(),
          navigationBarIcon: createMaterialsIcon(),
        },
        options,
      ),
    );
  }
}
