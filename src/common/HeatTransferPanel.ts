/**
 * HeatTransferPanel.ts
 *
 * A pre-themed Panel that automatically uses HeatTransferColors for background and
 * border. Use this for all control panels and info boxes in the sim so that
 * default / projector mode switching is handled automatically.
 *
 * ── Basic usage ───────────────────────────────────────────────────────────────
 *
 *   import { HeatTransferPanel } from "../../common/HeatTransferPanel.js";
 *   import { VBox, Text } from "scenerystack/scenery";
 *
 *   const content = new VBox({
 *     children: [ new Text("label"), slider ],
 *     spacing: 8,
 *   });
 *   const panel = new HeatTransferPanel(content);
 *
 * ── Overriding defaults ───────────────────────────────────────────────────────
 *
 *   // Wider margins, sharper corners, custom stroke
 *   const panel = new HeatTransferPanel(content, { xMargin: 20, cornerRadius: 0 });
 *
 *   // Transparent background (decorative border only)
 *   const panel = new HeatTransferPanel(content, { fill: "transparent" });
 */

import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import type { Node } from "scenerystack/scenery";
import { Panel, type PanelOptions } from "scenerystack/sun";
import HeatTransferColors from "../HeatTransferColors.js";
import { PANEL_CORNER_RADIUS } from "../HeatTransferConstants.js";

export type HeatTransferPanelOptions = PanelOptions;

export class HeatTransferPanel extends Panel {
  public constructor(content: Node, providedOptions?: HeatTransferPanelOptions) {
    const options = optionize<HeatTransferPanelOptions, EmptySelfOptions, PanelOptions>()(
      {
        fill: HeatTransferColors.panelBackgroundColorProperty,
        stroke: HeatTransferColors.panelBorderColorProperty,
        cornerRadius: PANEL_CORNER_RADIUS,
        xMargin: 12,
        yMargin: 10,
      },
      providedOptions,
    );
    super(content, options);
  }
}
