/**
 * LayerControlPanel.ts
 *
 * Checkboxes for the visualization layers.
 *
 * The panel deliberately reads as a list of *views* rather than a list of
 * options: every checkbox here changes which render pass runs over the current
 * GPU state and nothing else. Turning on heat flux does not start computing heat
 * flux — the gradient was always there — it starts drawing it. That is the
 * distinction the Heat Transfer screen is built to teach, so the UI should not
 * blur it by mixing a simulation setting into this group.
 */

import type { BooleanProperty } from "scenerystack/axon";
import { Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { Checkbox } from "scenerystack/sun";
import HeatTransferColors from "../../HeatTransferColors.js";
import { CONTROL_PANEL_WIDTH, LABEL_FONT_SIZE, TITLE_FONT_SIZE } from "../../HeatTransferConstants.js";
import HeatTransferNamespace from "../../HeatTransferNamespace.js";
import { StringManager } from "../../i18n/StringManager.js";
import { HeatTransferPanel, type HeatTransferPanelOptions } from "../HeatTransferPanel.js";
import type { FieldSimulationModel } from "../model/FieldSimulationModel.js";

/** Which layer checkboxes a screen shows, in display order. */
export type LayerControlId = "temperature" | "isotherms" | "heatFlux" | "velocity" | "gradient" | "material";

export class LayerControlPanel extends HeatTransferPanel {
  /** The checkboxes, in display order, so the ScreenView can put them in `pdomOrder`. */
  public readonly checkboxes: Checkbox[];

  /**
   * @param model - the screen's field model
   * @param layers - which checkboxes to include; screens show only the layers they are about
   * @param extras - further checkboxes appended below the layers (the probe toggle,
   *   which is a view option too and does not deserve a panel of its own)
   * @param providedOptions - ordinary Panel options
   */
  public constructor(
    model: FieldSimulationModel,
    layers: readonly LayerControlId[],
    extras: readonly Checkbox[] = [],
    providedOptions?: HeatTransferPanelOptions,
  ) {
    const strings = StringManager.getInstance();
    const controls = strings.getControls();
    const a11y = strings.getSharedA11yStrings();

    const sources: Record<
      LayerControlId,
      { property: BooleanProperty; label: typeof controls.temperatureLayerStringProperty }
    > = {
      temperature: { property: model.temperatureLayerProperty, label: controls.temperatureLayerStringProperty },
      isotherms: { property: model.isothermLayerProperty, label: controls.isothermLayerStringProperty },
      heatFlux: { property: model.heatFluxLayerProperty, label: controls.heatFluxLayerStringProperty },
      velocity: { property: model.velocityLayerProperty, label: controls.velocityLayerStringProperty },
      gradient: { property: model.gradientLayerProperty, label: controls.gradientLayerStringProperty },
      material: { property: model.materialLayerProperty, label: controls.materialLayerStringProperty },
    };

    const checkboxes = layers.map((id) => {
      const source = sources[id];
      return new Checkbox(
        source.property,
        new Text(source.label, {
          font: new PhetFont(LABEL_FONT_SIZE),
          fill: HeatTransferColors.textColorProperty,
          maxWidth: CONTROL_PANEL_WIDTH - 60,
        }),
        {
          checkboxColor: HeatTransferColors.textColorProperty,
          checkboxColorBackground: HeatTransferColors.panelBackgroundColorProperty,
          spacing: 8,
          accessibleName: source.label,
        },
      );
    });

    const title = new Text(controls.fieldLayersStringProperty, {
      font: new PhetFont({ size: TITLE_FONT_SIZE, weight: "bold" }),
      fill: HeatTransferColors.textColorProperty,
      maxWidth: CONTROL_PANEL_WIDTH - 30,
    });

    const content = new VBox({
      align: "left",
      spacing: 7,
      children: [title, ...checkboxes, ...extras],
      accessibleHeading: controls.fieldLayersStringProperty,
      accessibleHelpText: a11y.controls.layersStringProperty,
    });

    super(content, providedOptions);
    this.checkboxes = [...checkboxes, ...extras];
  }
}

HeatTransferNamespace.register("LayerControlPanel", LayerControlPanel);
