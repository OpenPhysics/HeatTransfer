/**
 * TransportControlPanel.ts
 *
 * The Heat Transfer screen's main control: one slider from
 * "diffusion dominated" to "advection dominated".
 *
 * Physically there are two independent knobs — the conductivity multiplier and
 * the flow multiplier — and the honest quantity relating them is the Peclet
 * number, Pe = U L / alpha. A student who has just met both mechanisms is not yet
 * ready to be handed two sliders and asked to reason about their ratio, so this
 * control moves both at once, in opposite directions, on a logarithmic scale, and
 * reports the Pe that results.
 *
 * The mapping is deliberately symmetric about the midpoint:
 *
 *   balance 0.0  →  conductivity x 1,    flow x 0.01   (conduction alone)
 *   balance 0.5  →  conductivity x 0.1,  flow x 0.1    (comparable)
 *   balance 1.0  →  conductivity x 0.01, flow x 1      (flow alone)
 *
 * so sliding it sweeps roughly four decades of Pe while keeping the frame cost
 * flat — reducing conductivity raises the stable time step by exactly the factor
 * that raising the flow speed lowers it.
 */

import { DerivedProperty, NumberProperty, PatternStringProperty } from "scenerystack/axon";
import { Range } from "scenerystack/dot";
import { type Node, VBox } from "scenerystack/scenery";
import HeatTransferNamespace from "../../HeatTransferNamespace.js";
import { StringManager } from "../../i18n/StringManager.js";
import { HeatTransferPanel, type HeatTransferPanelOptions } from "../HeatTransferPanel.js";
import type { FieldSimulationModel } from "../model/FieldSimulationModel.js";
import { labelledSlider, panelReadout, panelTitle } from "./ControlFactory.js";
import { formatPeclet } from "./formatters.js";

/** Decades the balance slider sweeps in each direction. */
const DECADES = 2;

/** Peclet numbers below this read as conduction-dominated. */
const CONDUCTION_THRESHOLD = 1;

/** Peclet numbers above this read as flow-dominated. */
const ADVECTION_THRESHOLD = 100;

export class TransportControlPanel extends HeatTransferPanel {
  public readonly controls: readonly Node[];

  /** 0 is pure diffusion, 1 is pure advection. Owned here because only this screen has it. */
  public readonly balanceProperty: NumberProperty;

  public constructor(model: FieldSimulationModel, providedOptions?: HeatTransferPanelOptions) {
    const strings = StringManager.getInstance();
    const controls = strings.getControls();
    const readouts = strings.getReadouts();
    const a11y = strings.getSharedA11yStrings();

    const balanceProperty = new NumberProperty(0.5);

    const balance = labelledSlider({
      property: balanceProperty,
      range: new Range(0, 1),
      accessibleName: controls.transportRegimeStringProperty,
      accessibleHelpText: a11y.controls.transportRegimeStringProperty,
      endLabels: {
        left: controls.diffusionDominatedStringProperty,
        right: controls.advectionDominatedStringProperty,
      },
    });

    const pecletText = new PatternStringProperty(readouts.pecletStringProperty, {
      value: new DerivedProperty([model.pecletNumberProperty], (peclet) => formatPeclet(peclet)),
    });

    // A number is not an interpretation. Name the regime as well as reporting it.
    const regimeText = new DerivedProperty(
      [
        model.pecletNumberProperty,
        readouts.conductionDominatesStringProperty,
        readouts.flowDominatesStringProperty,
        readouts.comparableStringProperty,
      ],
      (peclet, conduction, flow, comparable) => {
        if (peclet < CONDUCTION_THRESHOLD) {
          return conduction;
        }
        if (peclet > ADVECTION_THRESHOLD) {
          return flow;
        }
        return comparable;
      },
    );

    super(
      new VBox({
        align: "left",
        spacing: 8,
        children: [
          panelTitle(controls.transportRegimeStringProperty),
          balance.node,
          panelReadout(pecletText),
          panelReadout(regimeText),
        ],
      }),
      providedOptions,
    );

    this.balanceProperty = balanceProperty;
    this.controls = [balance.slider];

    // Drive both physical multipliers from the single balance value.
    balanceProperty.link((balanceValue) => {
      model.diffusionScaleProperty.value = 10 ** (-DECADES * balanceValue);
      model.flowScaleProperty.value = 10 ** (DECADES * (balanceValue - 1));
    });
  }

  public reset(): void {
    this.balanceProperty.reset();
  }
}

HeatTransferNamespace.register("TransportControlPanel", TransportControlPanel);
