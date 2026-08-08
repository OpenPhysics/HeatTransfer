/**
 * HeatTransferScreen.ts
 *
 * Screen 4. Wires the model and view factories together and passes screen-level
 * options to `Screen`.
 *
 * The preferences model rides on the options bag because a screen's field engine
 * has to know its grid resolution at construction time, and SceneryStack builds a
 * screen's model lazily — the first time a student opens the screen.
 *
 * Registered in the screens array in src/main.ts. Its home-screen and
 * navigation-bar icons come from createHeatTransferIcon() in
 * src/common/HeatTransferScreenIcons.ts (see doc/multi-screen.md).
 */
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import type { ScreenOptions } from "scenerystack/sim";
import { Screen } from "scenerystack/sim";
import type { Tandem } from "scenerystack/tandem";
import { createHeatTransferIcon } from "../common/HeatTransferScreenIcons.js";
import HeatTransferColors from "../HeatTransferColors.js";
import type { HeatTransferPreferencesModel } from "../preferences/HeatTransferPreferencesModel.js";
import { HeatTransferModel } from "./model/HeatTransferModel.js";
import { HeatTransferKeyboardHelpContent } from "./view/HeatTransferKeyboardHelpContent.js";
import { HeatTransferScreenView } from "./view/HeatTransferScreenView.js";

// Require tandem to be explicit — accidental omission would break PhET-iO.
export type HeatTransferScreenOptions = ScreenOptions & {
  tandem: Tandem;
  preferences: HeatTransferPreferencesModel;
};

export class HeatTransferScreen extends Screen<HeatTransferModel, HeatTransferScreenView> {
  public constructor(options: HeatTransferScreenOptions) {
    super(
      // Model factory — called once when the screen is first shown
      () => new HeatTransferModel(options.preferences),
      // View factory — receives the model instance
      (model) =>
        new HeatTransferScreenView(model, {
          tandem: options.tandem.createTandem("view"),
          showFieldStatusProperty: options.preferences.showFieldStatusProperty,
        }),
      optionize<HeatTransferScreenOptions, EmptySelfOptions, ScreenOptions>()(
        {
          backgroundColorProperty: HeatTransferColors.backgroundColorProperty,
          createKeyboardHelpNode: () => new HeatTransferKeyboardHelpContent(),
          homeScreenIcon: createHeatTransferIcon(),
          navigationBarIcon: createHeatTransferIcon(),
        },
        options,
      ),
    );
  }
}
