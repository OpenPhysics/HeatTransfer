/**
 * HeatTransferScreenView.ts
 *
 * Screen 4's controls: the transport balance, the flow pattern, and every layer.
 *
 * This is the screen where the architecture becomes the pedagogy. The layer
 * checkboxes are grouped alone in their own panel and the transport control sits
 * apart from them, because they are categorically different: one changes the
 * simulation, the others change only which render pass runs over its output. A
 * student who notices that toggling four checkboxes never disturbs the field has
 * understood something worth understanding.
 */

import type { Node } from "scenerystack/scenery";
import { BrushControlPanel } from "../../common/view/BrushControlPanel.js";
import { themedCheckbox } from "../../common/view/ControlFactory.js";
import { FieldScreenView, type FieldScreenViewOptions } from "../../common/view/FieldScreenView.js";
import { FlowControlPanel } from "../../common/view/FlowControlPanel.js";
import { LayerControlPanel } from "../../common/view/LayerControlPanel.js";
import { TransportControlPanel } from "../../common/view/TransportControlPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import type { HeatTransferModel } from "../model/HeatTransferModel.js";
import { HeatTransferScreenSummaryContent } from "./HeatTransferScreenSummaryContent.js";

/** The view supplies the field's accessible name and summary itself. */
export type HeatTransferScreenViewOptions = Omit<
  FieldScreenViewOptions,
  "fieldAccessibleName" | "fieldAccessibleHelpText" | "screenSummaryContent"
>;

export class HeatTransferScreenView extends FieldScreenView {
  private readonly transportPanel: TransportControlPanel;

  public constructor(model: HeatTransferModel, providedOptions: HeatTransferScreenViewOptions) {
    const strings = StringManager.getInstance();
    const a11y = strings.getSharedA11yStrings();

    super(model.field, {
      ...providedOptions,
      screenSummaryContent: new HeatTransferScreenSummaryContent(model),
      fieldAccessibleName: a11y.controls.fieldStringProperty,
      fieldAccessibleHelpText: a11y.controls.fieldHelpStringProperty,
    });

    const controls = strings.getControls();

    // ── Left column: what the simulation does ─────────────────────────────────

    this.transportPanel = new TransportControlPanel(model.field);
    this.leftColumn.addChild(this.transportPanel);

    const flowPanel = new FlowControlPanel(model.field, this.comboBoxLayer);
    this.leftColumn.addChild(flowPanel);

    // ── Right column: what is drawn ───────────────────────────────────────────

    const probeCheckbox = themedCheckbox(
      model.field.probeVisibleProperty,
      controls.showProbeStringProperty,
      a11y.controls.probeHelpStringProperty,
    );

    const layerPanel = new LayerControlPanel(
      model.field,
      ["temperature", "isotherms", "heatFlux", "velocity", "gradient"],
      [probeCheckbox],
    );
    this.rightColumn.addChild(layerPanel);

    const brushPanel = new BrushControlPanel(model.field);
    this.rightColumn.addChild(brushPanel);

    const screenControls: Node[] = [
      ...this.transportPanel.controls,
      ...flowPanel.controls,
      ...layerPanel.checkboxes,
      ...brushPanel.controls,
    ];
    this.finishLayout(screenControls);
  }

  public override reset(): void {
    super.reset();
    // The balance slider is view-owned state — the model only sees the two
    // multipliers it derives — so it has to be reset here.
    this.transportPanel.reset();
  }
}
