/**
 * ConvectionScreenSummaryContent.ts
 *
 * The accessible screen summary for the Convection screen. `currentDetailsContent`
 * is derived live from the field's coldest and hottest points, so re-reading the
 * summary reports the present state of the plate rather than how it started.
 */
import { DerivedProperty, PatternStringProperty } from "scenerystack/axon";
import { ScreenSummaryContent } from "scenerystack/sim";
import { formatCelsiusRounded } from "../../common/view/formatters.js";
import { StringManager } from "../../i18n/StringManager.js";
import type { ConvectionModel } from "../model/ConvectionModel.js";

export class ConvectionScreenSummaryContent extends ScreenSummaryContent {
  public constructor(model: ConvectionModel) {
    const a11y = StringManager.getInstance().getConvectionA11yStrings();

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
