/**
 * ConvectionScreenView.ts
 *
 * Screen 3's controls: the flow pattern, its speed, and the layers that make
 * transport visible.
 *
 * The velocity layer is on by default, because the tracer particles are what
 * distinguish this screen from the last one: without them a swept hot spot looks
 * like a hot spot that happens to be moving, and with them it is obvious that the
 * *material* is moving and carrying its heat along.
 */

import type { Node } from "scenerystack/scenery";
import { BrushControlPanel } from "../../common/view/BrushControlPanel.js";
import { themedCheckbox } from "../../common/view/ControlFactory.js";
import { FieldScreenView, type FieldScreenViewOptions } from "../../common/view/FieldScreenView.js";
import { FlowControlPanel } from "../../common/view/FlowControlPanel.js";
import { LayerControlPanel } from "../../common/view/LayerControlPanel.js";
import { MaterialControlPanel } from "../../common/view/MaterialControlPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import type { ConvectionModel } from "../model/ConvectionModel.js";
import { ConvectionScreenSummaryContent } from "./ConvectionScreenSummaryContent.js";

/** The view supplies the field's accessible name and summary itself. */
export type ConvectionScreenViewOptions = Omit<
  FieldScreenViewOptions,
  "fieldAccessibleName" | "fieldAccessibleHelpText" | "screenSummaryContent"
>;

export class ConvectionScreenView extends FieldScreenView {
  public constructor(model: ConvectionModel, providedOptions: ConvectionScreenViewOptions) {
    const strings = StringManager.getInstance();
    const a11y = strings.getSharedA11yStrings();

    super(model.field, {
      ...providedOptions,
      screenSummaryContent: new ConvectionScreenSummaryContent(model),
      fieldAccessibleName: a11y.controls.fieldStringProperty,
      fieldAccessibleHelpText: a11y.controls.fieldHelpStringProperty,
    });

    const controls = strings.getControls();

    // ── Left column: the flow ─────────────────────────────────────────────────

    const flowPanel = new FlowControlPanel(model.field, this.comboBoxLayer);
    this.leftColumn.addChild(flowPanel);

    const materialPanel = new MaterialControlPanel(model.field, this.comboBoxLayer, false);
    this.leftColumn.addChild(materialPanel);

    // ── Right column: brush, layers, probe ────────────────────────────────────

    const brushPanel = new BrushControlPanel(model.field);
    this.rightColumn.addChild(brushPanel);

    const probeCheckbox = themedCheckbox(
      model.field.probeVisibleProperty,
      controls.showProbeStringProperty,
      a11y.controls.probeHelpStringProperty,
    );

    const layerPanel = new LayerControlPanel(
      model.field,
      ["temperature", "velocity", "isotherms", "heatFlux"],
      [probeCheckbox],
    );
    this.rightColumn.addChild(layerPanel);

    const screenControls: Node[] = [
      ...flowPanel.controls,
      ...materialPanel.controls,
      ...brushPanel.controls,
      ...layerPanel.checkboxes,
    ];
    this.finishLayout(screenControls);
  }
}
