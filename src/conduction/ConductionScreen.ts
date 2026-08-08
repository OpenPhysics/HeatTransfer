/**
 * ConductionScreen.ts
 *
 * The top-level Screen component. It wires together the model and view
 * factories and passes screen-level options (name, background color, tandem)
 * to the parent Screen class.
 *
 * Registered in the screens array in src/main.ts. Its home-screen and navigation-bar
 * icons come from createConductionIcon() in src/common/HeatTransferScreenIcons.ts
 * (see doc/multi-screen.md).
 */
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import type { ScreenOptions } from "scenerystack/sim";
import { Screen } from "scenerystack/sim";
import type { Tandem } from "scenerystack/tandem";
import { createConductionIcon } from "../common/HeatTransferScreenIcons.js";
import HeatTransferColors from "../HeatTransferColors.js";
import { ConductionModel } from "./model/ConductionModel.js";
import { ConductionKeyboardHelpContent } from "./view/ConductionKeyboardHelpContent.js";
import { ConductionScreenView } from "./view/ConductionScreenView.js";

// Require tandem to be explicit — accidental omission would break PhET-iO.
type ConductionScreenOptions = ScreenOptions & { tandem: Tandem };

export class ConductionScreen extends Screen<ConductionModel, ConductionScreenView> {
  public constructor(options: ConductionScreenOptions) {
    super(
      // Model factory — called once when the screen is first shown
      () => new ConductionModel(),
      // View factory — receives the model instance
      (model) =>
        new ConductionScreenView(model, {
          tandem: options.tandem.createTandem("view"),
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
