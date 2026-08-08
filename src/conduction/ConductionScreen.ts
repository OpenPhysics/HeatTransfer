/**
 * ConductionScreen.ts
 *
 * Screen 2. Wires the model and view factories together and passes screen-level
 * options to `Screen`.
 *
 * The preferences model rides on the options bag because a screen's field engine
 * has to know its grid resolution at construction time, and SceneryStack builds a
 * screen's model lazily — the first time a student opens the screen.
 *
 * Registered in the screens array in src/main.ts. Its home-screen and
 * navigation-bar icons come from createConductionIcon() in
 * src/common/HeatTransferScreenIcons.ts (see doc/multi-screen.md).
 */
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import type { ScreenOptions } from "scenerystack/sim";
import { Screen } from "scenerystack/sim";
import type { Tandem } from "scenerystack/tandem";
import { createConductionIcon } from "../common/HeatTransferScreenIcons.js";
import HeatTransferColors from "../HeatTransferColors.js";
import type { HeatTransferPreferencesModel } from "../preferences/HeatTransferPreferencesModel.js";
import { ConductionModel } from "./model/ConductionModel.js";
import { ConductionKeyboardHelpContent } from "./view/ConductionKeyboardHelpContent.js";
import { ConductionScreenView } from "./view/ConductionScreenView.js";

// Require tandem to be explicit — accidental omission would break PhET-iO.
export type ConductionScreenOptions = ScreenOptions & {
  tandem: Tandem;
  preferences: HeatTransferPreferencesModel;
};

export class ConductionScreen extends Screen<ConductionModel, ConductionScreenView> {
  public constructor(options: ConductionScreenOptions) {
    super(
      // Model factory — called once when the screen is first shown
      () => new ConductionModel(options.preferences),
      // View factory — receives the model instance
      (model) =>
        new ConductionScreenView(model, {
          tandem: options.tandem.createTandem("view"),
          showFieldStatusProperty: options.preferences.showFieldStatusProperty,
        }),
      optionize<ConductionScreenOptions, EmptySelfOptions, ScreenOptions>()(
        {
          backgroundColorProperty: HeatTransferColors.backgroundColorProperty,
          createKeyboardHelpNode: () => new ConductionKeyboardHelpContent(),
          homeScreenIcon: createConductionIcon(),
          navigationBarIcon: createConductionIcon(),
        },
        options,
      ),
    );
  }
}
