/**
 * TemperatureScreen.ts
 *
 * Screen 1. Wires the model and view factories together and passes screen-level
 * options to `Screen`.
 *
 * The preferences model rides on the options bag because a screen's field engine
 * has to know its grid resolution at construction time, and SceneryStack builds a
 * screen's model lazily — the first time a student opens the screen.
 *
 * Registered in the screens array in src/main.ts. Its home-screen and
 * navigation-bar icons come from createTemperatureIcon() in
 * src/common/HeatTransferScreenIcons.ts (see doc/multi-screen.md).
 */
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import type { ScreenOptions } from "scenerystack/sim";
import { Screen } from "scenerystack/sim";
import type { Tandem } from "scenerystack/tandem";
import { createTemperatureIcon } from "../common/HeatTransferScreenIcons.js";
import HeatTransferColors from "../HeatTransferColors.js";
import type { HeatTransferPreferencesModel } from "../preferences/HeatTransferPreferencesModel.js";
import { TemperatureModel } from "./model/TemperatureModel.js";
import { TemperatureKeyboardHelpContent } from "./view/TemperatureKeyboardHelpContent.js";
import { TemperatureScreenView } from "./view/TemperatureScreenView.js";

// Require tandem to be explicit — accidental omission would break PhET-iO.
export type TemperatureScreenOptions = ScreenOptions & {
  tandem: Tandem;
  preferences: HeatTransferPreferencesModel;
};

export class TemperatureScreen extends Screen<TemperatureModel, TemperatureScreenView> {
  public constructor(options: TemperatureScreenOptions) {
    super(
      // Model factory — called once when the screen is first shown
      () => new TemperatureModel(options.preferences),
      // View factory — receives the model instance
      (model) =>
        new TemperatureScreenView(model, {
          tandem: options.tandem.createTandem("view"),
          showFieldStatusProperty: options.preferences.showFieldStatusProperty,
        }),
      optionize<TemperatureScreenOptions, EmptySelfOptions, ScreenOptions>()(
        {
          backgroundColorProperty: HeatTransferColors.backgroundColorProperty,
          createKeyboardHelpNode: () => new TemperatureKeyboardHelpContent(),
          homeScreenIcon: createTemperatureIcon(),
          navigationBarIcon: createTemperatureIcon(),
        },
        options,
      ),
    );
  }
}
