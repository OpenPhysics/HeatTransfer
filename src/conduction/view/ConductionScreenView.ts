/**
 * ConductionScreenView.ts
 *
 * Screen 2's controls: material, edges, layers, and the cross-section tool.
 *
 * The cross-section is the centrepiece. A student who has only seen the colour
 * field has seen T(x, y); dragging a line across it and watching T(s) appear —
 * with q_s(s) peaking exactly where T(s) is steepest — is the moment Fourier's law
 * stops being a formula. The graph therefore gets the full width under the
 * control columns rather than being squeezed into one.
 */

import { type Node, VBox } from "scenerystack/scenery";
import { HeatTransferPanel } from "../../common/HeatTransferPanel.js";
import { BrushControlPanel } from "../../common/view/BrushControlPanel.js";
import { panelTitle, themedCheckbox } from "../../common/view/ControlFactory.js";
import { CrossSectionGraphNode } from "../../common/view/CrossSectionGraphNode.js";
import { FieldScreenView, type FieldScreenViewOptions } from "../../common/view/FieldScreenView.js";
import { LayerControlPanel } from "../../common/view/LayerControlPanel.js";
import { MaterialControlPanel } from "../../common/view/MaterialControlPanel.js";
import { CONTROL_AREA_WIDTH } from "../../HeatTransferConstants.js";
import { StringManager } from "../../i18n/StringManager.js";
import type { ConductionModel } from "../model/ConductionModel.js";
import { ConductionScreenSummaryContent } from "./ConductionScreenSummaryContent.js";

/** Height of the cross-section graph, in view coordinates. */
const GRAPH_HEIGHT = 150;

/** The view supplies the field's accessible name and summary itself. */
export type ConductionScreenViewOptions = Omit<
  FieldScreenViewOptions,
  "fieldAccessibleName" | "fieldAccessibleHelpText" | "screenSummaryContent" | "crossSectionEnabled"
>;

export class ConductionScreenView extends FieldScreenView {
  public constructor(model: ConductionModel, providedOptions: ConductionScreenViewOptions) {
    const strings = StringManager.getInstance();
    const a11y = strings.getSharedA11yStrings();

    super(model.field, {
      ...providedOptions,
      screenSummaryContent: new ConductionScreenSummaryContent(model),
      fieldAccessibleName: a11y.controls.fieldStringProperty,
      fieldAccessibleHelpText: a11y.controls.fieldHelpStringProperty,
      crossSectionEnabled: true,
    });

    const controls = strings.getControls();
    const graphStrings = strings.getGraph();
    const screenA11y = strings.getConductionA11yStrings();

    // ── Left column: material and edges ───────────────────────────────────────

    const materialPanel = new MaterialControlPanel(model.field, this.comboBoxLayer, true);
    this.leftColumn.addChild(materialPanel);

    const brushPanel = new BrushControlPanel(model.field);
    this.leftColumn.addChild(brushPanel);

    // ── Right column: layers and tools ────────────────────────────────────────

    const layerPanel = new LayerControlPanel(model.field, ["temperature", "isotherms", "heatFlux", "gradient"]);
    this.rightColumn.addChild(layerPanel);

    const probeCheckbox = themedCheckbox(
      model.field.probeVisibleProperty,
      controls.showProbeStringProperty,
      a11y.controls.probeHelpStringProperty,
    );
    const crossSectionCheckbox = themedCheckbox(
      model.field.crossSectionVisibleProperty,
      controls.showCrossSectionStringProperty,
      screenA11y.controls.crossSectionStringProperty,
    );
    const showFluxCheckbox = themedCheckbox(model.field.heatFluxLayerProperty, graphStrings.showFluxStringProperty);

    const toolPanel = new HeatTransferPanel(
      new VBox({
        align: "left",
        spacing: 7,
        children: [
          panelTitle(controls.showCrossSectionStringProperty),
          probeCheckbox,
          crossSectionCheckbox,
          showFluxCheckbox,
        ],
      }),
    );
    this.rightColumn.addChild(toolPanel);

    // ── Full width: the graph ─────────────────────────────────────────────────

    const graph = new CrossSectionGraphNode(model.field, {
      width: CONTROL_AREA_WIDTH,
      height: GRAPH_HEIGHT,
      showFluxProperty: model.field.heatFluxLayerProperty,
      visibleProperty: model.field.crossSectionVisibleProperty,
    });
    this.wideArea.addChild(graph);

    const screenControls: Node[] = [
      ...materialPanel.controls,
      ...brushPanel.controls,
      ...layerPanel.checkboxes,
      probeCheckbox,
      crossSectionCheckbox,
      showFluxCheckbox,
    ];
    this.finishLayout(screenControls);

    // The cross-section starts visible: this screen is largely about it.
    model.field.crossSectionVisibleProperty.value = true;
  }
}
