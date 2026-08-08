/**
 * TemperatureScreen.ts
 *
 * The top-level Screen component. It wires together the model and view
 * factories and passes screen-level options (name, background color, tandem)
 * to the parent Screen class.
 *
 * Registered in the screens array in src/main.ts. Its home-screen and navigation-bar
 * icons come from createTemperatureIcon() in src/common/HeatTransferScreenIcons.ts
 * (see doc/multi-screen.md).
 */
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import type { ScreenOptions } from "scenerystack/sim";
import { Screen } from "scenerystack/sim";
import type { Tandem } from "scenerystack/tandem";
import { createTemperatureIcon } from "../common/HeatTransferScreenIcons.js";
import HeatTransferColors from "../HeatTransferColors.js";
import { TemperatureModel } from "./model/TemperatureModel.js";
import { TemperatureKeyboardHelpContent } from "./view/TemperatureKeyboardHelpContent.js";
import { TemperatureScreenView } from "./view/TemperatureScreenView.js";

// Require tandem to be explicit — accidental omission would break PhET-iO.
type TemperatureScreenOptions = ScreenOptions & { tandem: Tandem };

export class TemperatureScreen extends Screen<TemperatureModel, TemperatureScreenView> {
  public constructor(options: TemperatureScreenOptions) {
    super(
      // Model factory — called once when the screen is first shown
      () => new TemperatureModel(),
      // View factory — receives the model instance
      (model) =>
        new TemperatureScreenView(model, {
          tandem: options.tandem.createTandem("view"),
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
