/**
 * FieldStatusNode.ts
 *
 * A one-line readout of what is actually running: which backend, how many cells,
 * and how much simulated time has passed.
 *
 * This is shown by default rather than hidden behind a debug flag, because in
 * this simulation the substrate is part of the subject. A student who switches
 * from a 128 x 128 classroom grid to 1024 x 1024 and sees finer structure appear
 * has learned something about discretization; one who does not know the grid
 * changed has only seen the picture get prettier. It can be turned off in
 * Preferences for a cleaner screen.
 */

import { DerivedProperty, PatternStringProperty } from "scenerystack/axon";
import { HBox, type NodeOptions, Text } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import HeatTransferColors from "../../HeatTransferColors.js";
import { SMALL_FONT_SIZE } from "../../HeatTransferConstants.js";
import HeatTransferNamespace from "../../HeatTransferNamespace.js";
import { StringManager } from "../../i18n/StringManager.js";
import { FieldBackend } from "../field/FieldEngine.js";
import type { FieldSimulationModel } from "../model/FieldSimulationModel.js";
import { formatElapsed } from "./formatters.js";

export class FieldStatusNode extends HBox {
  public constructor(model: FieldSimulationModel, providedOptions?: NodeOptions) {
    const strings = StringManager.getInstance();
    const readouts = strings.getReadouts();
    const a11y = strings.getSharedA11yStrings();

    const backendLabel =
      model.backend === FieldBackend.WEBGPU ? readouts.backendWebgpuStringProperty : readouts.backendCpuStringProperty;

    const gridLabel = new PatternStringProperty(readouts.gridStringProperty, {
      width: model.effectiveResolution,
      height: model.effectiveResolution,
    });

    const elapsedLabel = new PatternStringProperty(readouts.elapsedStringProperty, {
      value: new DerivedProperty([model.elapsedTimeProperty], (seconds) => formatElapsed(seconds)),
    });

    const style = {
      font: new PhetFont(SMALL_FONT_SIZE),
      fill: HeatTransferColors.secondaryTextColorProperty,
    };

    super({
      spacing: 14,
      children: [new Text(backendLabel, style), new Text(gridLabel, style), new Text(elapsedLabel, style)],
      accessibleParagraph: a11y.controls.fieldStatusStringProperty,
      ...providedOptions,
    });
  }
}

HeatTransferNamespace.register("FieldStatusNode", FieldStatusNode);
