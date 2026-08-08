/**
 * TemperatureScreenView.ts
 *
 * Screen 1's controls: a brush, an isotherm toggle, and a probe.
 *
 * Everything that could distract from "temperature is a field" has been left
 * out. There is no material choice, no flux, no flow — just paint, look, and
 * measure. The isotherm checkbox is the one optional layer, because contours are
 * the first hint that the colour field has structure worth naming.
 */

import { type Node, VBox } from "scenerystack/scenery";
import { HeatTransferPanel } from "../../common/HeatTransferPanel.js";
import { BrushControlPanel } from "../../common/view/BrushControlPanel.js";
import { panelTitle, themedCheckbox } from "../../common/view/ControlFactory.js";
import { FieldScreenView, type FieldScreenViewOptions } from "../../common/view/FieldScreenView.js";
import { StringManager } from "../../i18n/StringManager.js";
import type { TemperatureModel } from "../model/TemperatureModel.js";
import { TemperatureScreenSummaryContent } from "./TemperatureScreenSummaryContent.js";

/** The view supplies the field's accessible name and summary itself. */
export type TemperatureScreenViewOptions = Omit<
  FieldScreenViewOptions,
  "fieldAccessibleName" | "fieldAccessibleHelpText" | "screenSummaryContent"
>;

export class TemperatureScreenView extends FieldScreenView {
  public constructor(model: TemperatureModel, providedOptions: TemperatureScreenViewOptions) {
    const strings = StringManager.getInstance();
    const a11y = strings.getSharedA11yStrings();

    super(model.field, {
      ...providedOptions,
      screenSummaryContent: new TemperatureScreenSummaryContent(model),
      fieldAccessibleName: a11y.controls.fieldStringProperty,
      fieldAccessibleHelpText: a11y.controls.fieldHelpStringProperty,
    });

    const controls = strings.getControls();
    const screenA11y = strings.getTemperatureA11yStrings();

    // ── Brush ─────────────────────────────────────────────────────────────────

    const brushPanel = new BrushControlPanel(model.field);
    this.leftColumn.addChild(brushPanel);

    // ── Layers and tools ──────────────────────────────────────────────────────

    const isothermCheckbox = themedCheckbox(
      model.field.isothermLayerProperty,
      controls.isothermLayerStringProperty,
      screenA11y.controls.isothermsStringProperty,
    );
    const probeCheckbox = themedCheckbox(
      model.field.probeVisibleProperty,
      controls.showProbeStringProperty,
      a11y.controls.probeHelpStringProperty,
    );

    const viewPanel = new HeatTransferPanel(
      new VBox({
        align: "left",
        spacing: 7,
        children: [panelTitle(controls.fieldLayersStringProperty), isothermCheckbox, probeCheckbox],
      }),
    );
    this.rightColumn.addChild(viewPanel);

    const screenControls: Node[] = [...brushPanel.controls, isothermCheckbox, probeCheckbox];
    this.finishLayout(screenControls);

    // The probe starts hidden so the plate is unobstructed; showing it is the
    // student's first deliberate act of measurement.
    model.field.probeVisibleProperty.value = false;
  }
}
