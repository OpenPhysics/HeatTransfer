/**
 * ControlFactory.ts
 *
 * The sim's small vocabulary of themed controls.
 *
 * Five screens share one control language: the same title weight, the same
 * slider track, the same combo-box chrome, the same label colour on the panel
 * fill versus on the white control surface. Centralizing that here means a screen
 * file reads as a list of *what* it offers rather than a wall of styling, and it
 * makes the whole set retheme with one edit.
 *
 * Colour rule worth remembering: text drawn on a panel uses
 * `textColorProperty`, text drawn on a combo box or a flat button uses
 * `controlSurfaceTextColorProperty`. The surfaces stay white in both profiles, so
 * their text must stay dark in both.
 */

import type { PhetioProperty, TReadOnlyProperty } from "scenerystack/axon";
import { Dimension2, type Range } from "scenerystack/dot";
import { Node, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { Checkbox, ComboBox, HSlider } from "scenerystack/sun";
import HeatTransferColors from "../../HeatTransferColors.js";
import { CONTROL_PANEL_WIDTH, LABEL_FONT_SIZE, SMALL_FONT_SIZE, TITLE_FONT_SIZE } from "../../HeatTransferConstants.js";
import HeatTransferNamespace from "../../HeatTransferNamespace.js";
import { HEAT_TRANSFER_COMBO_BOX_OPTIONS } from "../HeatTransferButtonOptions.js";

/** Usable content width inside a control panel. */
export const CONTENT_WIDTH = CONTROL_PANEL_WIDTH - 30;

/** Slider track dimensions shared by every slider in the sim. */
const SLIDER_TRACK = new Dimension2(CONTENT_WIDTH - 10, 4);

/** A panel heading. */
export function panelTitle(label: TReadOnlyProperty<string>): Text {
  return new Text(label, {
    font: new PhetFont({ size: TITLE_FONT_SIZE, weight: "bold" }),
    fill: HeatTransferColors.textColorProperty,
    maxWidth: CONTENT_WIDTH,
  });
}

/** An ordinary control label on the panel fill. */
export function panelLabel(label: TReadOnlyProperty<string>): Text {
  return new Text(label, {
    font: new PhetFont(LABEL_FONT_SIZE),
    fill: HeatTransferColors.textColorProperty,
    maxWidth: CONTENT_WIDTH,
  });
}

/** A secondary readout: units, derived quantities, status. */
export function panelReadout(label: TReadOnlyProperty<string>): Text {
  return new Text(label, {
    font: new PhetFont(SMALL_FONT_SIZE),
    fill: HeatTransferColors.secondaryTextColorProperty,
    maxWidth: CONTENT_WIDTH,
  });
}

/** A combo-box item label, drawn on the white control surface. */
export function comboBoxLabel(label: TReadOnlyProperty<string>): Text {
  return new Text(label, {
    font: new PhetFont(LABEL_FONT_SIZE),
    fill: HeatTransferColors.controlSurfaceTextColorProperty,
    maxWidth: CONTENT_WIDTH - 40,
  });
}

export type LabelledSliderOptions = {
  /** Label above the track. Omit when the panel title already names the control. */
  label?: TReadOnlyProperty<string>;
  property: PhetioProperty<number>;
  range: Range;
  accessibleName: TReadOnlyProperty<string>;
  accessibleHelpText?: TReadOnlyProperty<string>;
  /** Optional end labels drawn under the track, e.g. "Diffusion" and "Advection". */
  endLabels?: { left: TReadOnlyProperty<string>; right: TReadOnlyProperty<string> };
  /** Optional live readout drawn under the slider. */
  readout?: TReadOnlyProperty<string>;
};

/**
 * A slider with a label above it and, optionally, end labels and a readout below.
 *
 * Returned as a `VBox` rather than a `NumberControl` because most of this sim's
 * sliders control a quantity whose raw number means nothing to a student — brush
 * radius as a fraction of the plate, a dimensionless transport balance — so the
 * label and an interpreted readout carry the meaning instead of a spinner.
 */
export function labelledSlider(options: LabelledSliderOptions): { node: VBox; slider: HSlider } {
  const slider = new HSlider(options.property, options.range, {
    trackSize: SLIDER_TRACK,
    trackFillEnabled: HeatTransferColors.panelBorderColorProperty,
    thumbFill: HeatTransferColors.accentColorProperty,
    thumbSize: new Dimension2(13, 24),
    accessibleName: options.accessibleName,
    ...(options.accessibleHelpText && { accessibleHelpText: options.accessibleHelpText }),
  });

  const children: Node[] = options.label ? [panelLabel(options.label), slider] : [slider];

  if (options.endLabels) {
    children.push(
      new VBox({
        align: "center",
        children: [endLabelRow(options.endLabels.left, options.endLabels.right)],
      }),
    );
  }
  if (options.readout) {
    children.push(panelReadout(options.readout));
  }

  return {
    node: new VBox({ align: "left", spacing: 5, children }),
    slider,
  };
}

/** The two end labels under a slider, pushed to the track's ends. */
function endLabelRow(left: TReadOnlyProperty<string>, right: TReadOnlyProperty<string>): Node {
  const leftText = panelReadout(left);
  const rightText = panelReadout(right);
  const row = new Node({ children: [leftText, rightText] });
  leftText.left = 0;
  rightText.right = SLIDER_TRACK.width;
  return row;
}

/** A checkbox with a panel-fill label. */
export function themedCheckbox(
  property: PhetioProperty<boolean>,
  label: TReadOnlyProperty<string>,
  accessibleHelpText?: TReadOnlyProperty<string>,
): Checkbox {
  return new Checkbox(property, panelLabel(label), {
    checkboxColor: HeatTransferColors.textColorProperty,
    checkboxColorBackground: HeatTransferColors.panelBackgroundColorProperty,
    spacing: 8,
    accessibleName: label,
    ...(accessibleHelpText && { accessibleHelpText }),
  });
}

/**
 * A themed combo box over a list of ids.
 *
 * `listParent` must be a node high in the scene graph — usually the ScreenView's
 * combo-box layer — so the popup list is not clipped by the panel it lives in.
 */
export function themedComboBox<T>(
  property: PhetioProperty<T>,
  values: readonly T[],
  labelFor: (value: T) => TReadOnlyProperty<string>,
  listParent: Node,
  accessibleName: TReadOnlyProperty<string>,
  accessibleHelpText?: TReadOnlyProperty<string>,
): ComboBox<T> {
  return new ComboBox(
    property,
    values.map((value) => ({
      value,
      createNode: () => comboBoxLabel(labelFor(value)),
      accessibleName: labelFor(value),
    })),
    listParent,
    {
      ...HEAT_TRANSFER_COMBO_BOX_OPTIONS,
      xMargin: 10,
      yMargin: 5,
      accessibleName,
      ...(accessibleHelpText && { accessibleHelpText }),
    },
  );
}

HeatTransferNamespace.register("ControlFactory", { labelledSlider, panelTitle });
