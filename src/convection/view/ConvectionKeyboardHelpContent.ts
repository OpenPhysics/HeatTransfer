/**
 * ConvectionKeyboardHelpContent.ts
 *
 * Content for the keyboard-help dialog (the "?" button in the navigation bar).
 * This screen paints on the field, drags the probe, and uses a slider and
 * checkboxes, so the left column carries the sim-specific paint section plus the
 * stock slider and drag sections.
 */

import {
  BasicActionsKeyboardHelpSection,
  MoveDraggableItemsKeyboardHelpSection,
  SliderControlsKeyboardHelpSection,
  TwoColumnKeyboardHelpContent,
} from "scenerystack/scenery-phet";
import { HeatBrushKeyboardHelpSection } from "../../common/view/HeatBrushKeyboardHelpSection.js";

export class ConvectionKeyboardHelpContent extends TwoColumnKeyboardHelpContent {
  public constructor() {
    super(
      [
        new HeatBrushKeyboardHelpSection(),
        new MoveDraggableItemsKeyboardHelpSection(),
        new SliderControlsKeyboardHelpSection(),
      ],
      [new BasicActionsKeyboardHelpSection({ withCheckboxContent: true })],
    );
  }
}
