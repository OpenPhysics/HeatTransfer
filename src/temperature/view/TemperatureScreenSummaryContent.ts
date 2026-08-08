/**
 * TemperatureScreenSummaryContent.ts
 *
 * The accessible screen summary for the Temperature screen.
 *
 * `currentDetailsContent` is a live `DerivedProperty` over the field's coldest
 * and hottest points, so a screen-reader user re-reading the summary gets the
 * present state of the plate rather than a description of how it started. That is
 * the non-visual counterpart of watching the colours change, and it is the reason
 * the model keeps min/max as Properties rather than computing them only for the
 * legend.
 */
import { DerivedProperty, PatternStringProperty } from "scenerystack/axon";
import { ScreenSummaryContent } from "scenerystack/sim";
import { formatCelsiusRounded } from "../../common/view/formatters.js";
import { StringManager } from "../../i18n/StringManager.js";
import type { TemperatureModel } from "../model/TemperatureModel.js";

export class TemperatureScreenSummaryContent extends ScreenSummaryContent {
  public constructor(model: TemperatureModel) {
    const a11y = StringManager.getInstance().getTemperatureA11yStrings();

    super({
      playAreaContent: a11y.screenSummary.playAreaStringProperty,
      controlAreaContent: a11y.screenSummary.controlAreaStringProperty,
      currentDetailsContent: new PatternStringProperty(a11y.currentDetailsStringProperty, {
        min: new DerivedProperty([model.field.minTemperatureProperty], (kelvin) => formatCelsiusRounded(kelvin)),
        max: new DerivedProperty([model.field.maxTemperatureProperty], (kelvin) => formatCelsiusRounded(kelvin)),
      }),
      interactionHintContent: a11y.screenSummary.interactionHintStringProperty,
    });
  }
}
