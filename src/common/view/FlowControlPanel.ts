/**
 * FlowControlPanel.ts
 *
 * The velocity field: which pattern, and how fast.
 *
 * All the presets except "still" are divergence-free, so choosing one never
 * changes how much heat is present — only where it goes. The speed slider scales
 * the whole field at once, which is what makes the Peclet readout on the Heat
 * Transfer screen a single meaningful number rather than a position-dependent one.
 */

import { DerivedProperty, PatternStringProperty } from "scenerystack/axon";
import { Range } from "scenerystack/dot";
import { type Node, VBox } from "scenerystack/scenery";
import { MAX_FLOW_SPEED } from "../../HeatTransferConstants.js";
import HeatTransferNamespace from "../../HeatTransferNamespace.js";
import { StringManager } from "../../i18n/StringManager.js";
import { FLOW_PRESET_ORDER, type FlowPresetId } from "../field/FieldTypes.js";
import { HeatTransferPanel, type HeatTransferPanelOptions } from "../HeatTransferPanel.js";
import type { FieldSimulationModel } from "../model/FieldSimulationModel.js";
import { labelledSlider, panelTitle, themedComboBox } from "./ControlFactory.js";
import { formatSpeed } from "./formatters.js";

/** Slowest selectable flow, in metres per second. Zero would make the layer pointless. */
const MIN_FLOW_SPEED = 0.0002;

export class FlowControlPanel extends HeatTransferPanel {
  public readonly controls: readonly Node[];

  public constructor(model: FieldSimulationModel, listParent: Node, providedOptions?: HeatTransferPanelOptions) {
    const strings = StringManager.getInstance();
    const controls = strings.getControls();
    const readouts = strings.getReadouts();
    const flowNames = strings.getFlowNames();
    const a11y = strings.getSharedA11yStrings();

    const presetComboBox = themedComboBox<FlowPresetId>(
      model.flowPresetProperty,
      FLOW_PRESET_ORDER,
      (id) => flowNames[`${id}StringProperty`],
      listParent,
      controls.flowPatternStringProperty,
      a11y.controls.flowPatternStringProperty,
    );

    const speedReadout = new PatternStringProperty(readouts.speedStringProperty, {
      value: new DerivedProperty([model.flowSpeedProperty], (metresPerSecond) => formatSpeed(metresPerSecond)),
    });

    const speedControl = labelledSlider({
      label: controls.flowSpeedStringProperty,
      property: model.flowSpeedProperty,
      range: new Range(MIN_FLOW_SPEED, MAX_FLOW_SPEED),
      accessibleName: controls.flowSpeedStringProperty,
      accessibleHelpText: a11y.controls.flowSpeedStringProperty,
      readout: speedReadout,
    });

    super(
      new VBox({
        align: "left",
        spacing: 9,
        children: [panelTitle(controls.flowStringProperty), presetComboBox, speedControl.node],
      }),
      providedOptions,
    );

    this.controls = [presetComboBox, speedControl.slider];
  }
}

HeatTransferNamespace.register("FlowControlPanel", FlowControlPanel);
