/**
 * MaterialsScreen.ts
 *
 * The top-level Screen component. It wires together the model and view
 * factories and passes screen-level options (name, background color, tandem)
 * to the parent Screen class.
 *
 * Registered in the screens array in src/main.ts. Its home-screen and navigation-bar
 * icons come from createMaterialsIcon() in src/common/HeatTransferScreenIcons.ts
 * (see doc/multi-screen.md).
 */
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import type { ScreenOptions } from "scenerystack/sim";
import { Screen } from "scenerystack/sim";
import type { Tandem } from "scenerystack/tandem";
import { createMaterialsIcon } from "../common/HeatTransferScreenIcons.js";
import HeatTransferColors from "../HeatTransferColors.js";
import { MaterialsModel } from "./model/MaterialsModel.js";
import { MaterialsKeyboardHelpContent } from "./view/MaterialsKeyboardHelpContent.js";
import { MaterialsScreenView } from "./view/MaterialsScreenView.js";

// Require tandem to be explicit — accidental omission would break PhET-iO.
type MaterialsScreenOptions = ScreenOptions & { tandem: Tandem };

export class MaterialsScreen extends Screen<MaterialsModel, MaterialsScreenView> {
  public constructor(options: MaterialsScreenOptions) {
    super(
      // Model factory — called once when the screen is first shown
      () => new MaterialsModel(),
      // View factory — receives the model instance
      (model) =>
        new MaterialsScreenView(model, {
          tandem: options.tandem.createTandem("view"),
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
