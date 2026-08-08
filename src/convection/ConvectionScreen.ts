/**
 * ConvectionScreen.ts
 *
 * The top-level Screen component. It wires together the model and view
 * factories and passes screen-level options (name, background color, tandem)
 * to the parent Screen class.
 *
 * Registered in the screens array in src/main.ts. Its home-screen and navigation-bar
 * icons come from createConvectionIcon() in src/common/HeatTransferScreenIcons.ts
 * (see doc/multi-screen.md).
 */
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import type { ScreenOptions } from "scenerystack/sim";
import { Screen } from "scenerystack/sim";
import type { Tandem } from "scenerystack/tandem";
import { createConvectionIcon } from "../common/HeatTransferScreenIcons.js";
import HeatTransferColors from "../HeatTransferColors.js";
import { ConvectionModel } from "./model/ConvectionModel.js";
import { ConvectionKeyboardHelpContent } from "./view/ConvectionKeyboardHelpContent.js";
import { ConvectionScreenView } from "./view/ConvectionScreenView.js";

// Require tandem to be explicit — accidental omission would break PhET-iO.
type ConvectionScreenOptions = ScreenOptions & { tandem: Tandem };

export class ConvectionScreen extends Screen<ConvectionModel, ConvectionScreenView> {
  public constructor(options: ConvectionScreenOptions) {
    super(
      // Model factory — called once when the screen is first shown
      () => new ConvectionModel(),
      // View factory — receives the model instance
      (model) =>
        new ConvectionScreenView(model, {
          tandem: options.tandem.createTandem("view"),
        }),
      optionize<ConvectionScreenOptions, EmptySelfOptions, ScreenOptions>()(
        {
          backgroundColorProperty: HeatTransferColors.backgroundColorProperty,
          createKeyboardHelpNode: () => new ConvectionKeyboardHelpContent(),
          homeScreenIcon: createConvectionIcon(),
          navigationBarIcon: createConvectionIcon(),
        },
        options,
      ),
    );
  }
}
