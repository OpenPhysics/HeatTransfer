/**
 * HeatTransferScreen.ts
 *
 * The top-level Screen component. It wires together the model and view
 * factories and passes screen-level options (name, background color, tandem)
 * to the parent Screen class.
 *
 * Registered in the screens array in src/main.ts. Its home-screen and navigation-bar
 * icons come from createHeatTransferIcon() in src/common/HeatTransferScreenIcons.ts
 * (see doc/multi-screen.md).
 */
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import type { ScreenOptions } from "scenerystack/sim";
import { Screen } from "scenerystack/sim";
import type { Tandem } from "scenerystack/tandem";
import { createHeatTransferIcon } from "../common/HeatTransferScreenIcons.js";
import HeatTransferColors from "../HeatTransferColors.js";
import { HeatTransferModel } from "./model/HeatTransferModel.js";
import { HeatTransferKeyboardHelpContent } from "./view/HeatTransferKeyboardHelpContent.js";
import { HeatTransferScreenView } from "./view/HeatTransferScreenView.js";

// Require tandem to be explicit — accidental omission would break PhET-iO.
type HeatTransferScreenOptions = ScreenOptions & { tandem: Tandem };

export class HeatTransferScreen extends Screen<HeatTransferModel, HeatTransferScreenView> {
  public constructor(options: HeatTransferScreenOptions) {
    super(
      // Model factory — called once when the screen is first shown
      () => new HeatTransferModel(),
      // View factory — receives the model instance
      (model) =>
        new HeatTransferScreenView(model, {
          tandem: options.tandem.createTandem("view"),
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
