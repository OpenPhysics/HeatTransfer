/**
 * MaterialsScreenView.ts
 *
 * Screen 5's controls: which material the brush paints, how anisotropic it is,
 * and the layers that make a heterogeneous medium legible.
 *
 * The brush panel here gains a third mode — paint material — and the material
 * layer is on by default so the student can see what they have built even where
 * the plate is at ambient temperature everywhere. The anisotropy slider is the
 * one genuinely advanced control in the simulation: it splits the scalar `k` into
 * `k_x` and `k_y` about a fixed geometric mean, so a hot spot spreads into an
 * ellipse instead of a circle without the material becoming a different material.
 */

import { DerivedProperty, PatternStringProperty } from "scenerystack/axon";
import { Range } from "scenerystack/dot";
import { type Node, VBox } from "scenerystack/scenery";
import { MATERIAL_ORDER, type MaterialIdValue } from "../../common/field/Materials.js";
import { HeatTransferPanel } from "../../common/HeatTransferPanel.js";
import { BrushControlPanel } from "../../common/view/BrushControlPanel.js";
import { labelledSlider, panelTitle, themedCheckbox, themedComboBox } from "../../common/view/ControlFactory.js";
import { FieldScreenView, type FieldScreenViewOptions } from "../../common/view/FieldScreenView.js";
import { LayerControlPanel } from "../../common/view/LayerControlPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import type { MaterialsModel } from "../model/MaterialsModel.js";
import { MaterialsScreenSummaryContent } from "./MaterialsScreenSummaryContent.js";

/**
 * Anisotropy range. The value multiplies k_x and divides k_y, so 4 means heat
 * moves sixteen times more readily along x than along y.
 */
const ANISOTROPY_RANGE = new Range(0.25, 4);

/** The view supplies the field's accessible name and summary itself. */
export type MaterialsScreenViewOptions = Omit<
  FieldScreenViewOptions,
  "fieldAccessibleName" | "fieldAccessibleHelpText" | "screenSummaryContent"
>;

export class MaterialsScreenView extends FieldScreenView {
  public constructor(model: MaterialsModel, providedOptions: MaterialsScreenViewOptions) {
    const strings = StringManager.getInstance();
    const a11y = strings.getSharedA11yStrings();

    super(model.field, {
      ...providedOptions,
      screenSummaryContent: new MaterialsScreenSummaryContent(model),
      fieldAccessibleName: a11y.controls.fieldStringProperty,
      fieldAccessibleHelpText: a11y.controls.fieldHelpStringProperty,
    });

    const controls = strings.getControls();
    const materialNames = strings.getMaterialNames();
    const screenA11y = strings.getMaterialsA11yStrings();

    // ── Left column: what the brush paints ────────────────────────────────────

    const paintComboBox = themedComboBox<MaterialIdValue>(
      model.field.paintMaterialIdProperty,
      MATERIAL_ORDER,
      (id) => materialNames[`${id}StringProperty`],
      this.comboBoxLayer,
      controls.paintMaterialStringProperty,
      a11y.controls.paintMaterialStringProperty,
    );

    const anisotropyReadout = new PatternStringProperty(strings.getReadouts().ratioStringProperty, {
      value: new DerivedProperty([model.field.anisotropyProperty], (ratio) =>
        ratio >= 1 ? `${ratio.toFixed(2)} : 1` : `1 : ${(1 / ratio).toFixed(2)}`,
      ),
    });

    const anisotropy = labelledSlider({
      label: controls.anisotropyStringProperty,
      property: model.field.anisotropyProperty,
      range: ANISOTROPY_RANGE,
      accessibleName: controls.anisotropyStringProperty,
      accessibleHelpText: screenA11y.controls.anisotropyHelpStringProperty,
      readout: anisotropyReadout,
    });

    const paintPanel = new HeatTransferPanel(
      new VBox({
        align: "left",
        spacing: 8,
        children: [panelTitle(controls.paintMaterialStringProperty), paintComboBox, anisotropy.node],
      }),
    );
    this.leftColumn.addChild(paintPanel);

    const brushPanel = new BrushControlPanel(model.field, true);
    this.leftColumn.addChild(brushPanel);

    // ── Right column: what is drawn ───────────────────────────────────────────

    const probeCheckbox = themedCheckbox(
      model.field.probeVisibleProperty,
      controls.showProbeStringProperty,
      a11y.controls.probeHelpStringProperty,
    );

    const layerPanel = new LayerControlPanel(
      model.field,
      ["temperature", "material", "isotherms", "heatFlux", "gradient"],
      [probeCheckbox],
    );
    this.rightColumn.addChild(layerPanel);

    const screenControls: Node[] = [paintComboBox, anisotropy.slider, ...brushPanel.controls, ...layerPanel.checkboxes];
    this.finishLayout(screenControls);
  }
}
