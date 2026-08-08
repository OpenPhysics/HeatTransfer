/**
 * MaterialControlPanel.ts
 *
 * Choosing the plate's material, and seeing what that choice means.
 *
 * The preset combo box is the primary control, and the two readouts underneath
 * are the reason: `k` is the number in Fourier's law, `alpha = k / (rho c_p)` is
 * the number that governs how fast the field actually changes, and they do *not*
 * order materials the same way. Foam has the lowest conductivity in the list but a
 * higher diffusivity than wood. Showing both, live, is what makes that visible
 * instead of surprising.
 *
 * Optionally the panel also carries the edge-condition control, since "what is
 * the plate made of" and "what happens at its edges" are the two things that
 * close the heat equation.
 */

import { DerivedProperty, PatternStringProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { type Node, VBox } from "scenerystack/scenery";
import HeatTransferNamespace from "../../HeatTransferNamespace.js";
import { StringManager } from "../../i18n/StringManager.js";
import { BOUNDARY_CONDITION_ORDER, type BoundaryConditionId, thermalDiffusivity } from "../field/FieldTypes.js";
import { MATERIAL_ORDER, MATERIALS, type MaterialIdValue, withAnisotropy } from "../field/Materials.js";
import { HeatTransferPanel, type HeatTransferPanelOptions } from "../HeatTransferPanel.js";
import type { FieldSimulationModel } from "../model/FieldSimulationModel.js";
import { panelReadout, panelTitle, themedComboBox } from "./ControlFactory.js";
import { formatConductivity, formatDiffusivity } from "./formatters.js";

export type MaterialControlPanelOptions = HeatTransferPanelOptions;

export class MaterialControlPanel extends HeatTransferPanel {
  public readonly controls: readonly Node[];

  /**
   * @param model - the screen's field model
   * @param listParent - a node high in the scene graph for the combo-box popups
   * @param includeEdges - also show the boundary-condition combo box
   * @param providedOptions - ordinary Panel options
   */
  public constructor(
    model: FieldSimulationModel,
    listParent: Node,
    includeEdges: boolean,
    providedOptions?: MaterialControlPanelOptions,
  ) {
    const strings = StringManager.getInstance();
    const controls = strings.getControls();
    const readouts = strings.getReadouts();
    const materialNames = strings.getMaterialNames();
    const edgeNames = strings.getEdgeNames();
    const a11y = strings.getSharedA11yStrings();

    const materialComboBox = themedComboBox<MaterialIdValue>(
      model.materialIdProperty,
      MATERIAL_ORDER,
      (id) => materialNames[`${id}StringProperty`],
      listParent,
      controls.materialStringProperty,
      a11y.controls.materialStringProperty,
    );

    // Both readouts follow the anisotropy control too, because an anisotropic
    // material has a different diffusivity along each axis and the readout should
    // not quietly keep showing the isotropic value.
    const conductivityText = new PatternStringProperty(readouts.conductivityStringProperty, {
      value: new DerivedProperty([model.materialIdProperty], (id) => formatConductivity(MATERIALS[id].conductivity)),
    });
    const diffusivityText = new PatternStringProperty(readouts.diffusivityStringProperty, {
      value: new DerivedProperty([model.materialIdProperty, model.anisotropyProperty], (id, anisotropy) =>
        formatDiffusivity(thermalDiffusivity(withAnisotropy(MATERIALS[id], anisotropy))),
      ),
    });

    const children: Node[] = [
      panelTitle(controls.materialStringProperty),
      materialComboBox,
      panelReadout(conductivityText),
      panelReadout(diffusivityText),
    ];
    const interactive: Node[] = [materialComboBox];

    if (includeEdges) {
      const edgeComboBox = themedComboBox<BoundaryConditionId>(
        model.boundaryConditionProperty,
        BOUNDARY_CONDITION_ORDER,
        (id) => edgeNames[`${id}StringProperty`],
        listParent,
        controls.edgesStringProperty,
        a11y.controls.edgesStringProperty,
      );
      children.push(panelTitle(controls.edgesStringProperty), edgeComboBox);
      interactive.push(edgeComboBox);
    }

    super(new VBox({ align: "left", spacing: 8, children }), providedOptions);
    this.controls = interactive;
  }
}

/** Type helper: the string tree exposes each key as `<key>StringProperty`. */
export type NamedStrings<Key extends string> = Record<`${Key}StringProperty`, TReadOnlyProperty<string>>;

HeatTransferNamespace.register("MaterialControlPanel", MaterialControlPanel);
