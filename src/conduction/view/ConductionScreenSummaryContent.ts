/**
 * ConductionScreenSummaryContent.ts
 *
 * The accessible screen summary for the Conduction screen. `currentDetailsContent`
 * is derived live from the field's coldest and hottest points, so re-reading the
 * summary reports the present state of the plate rather than how it started.
 */
import { DerivedProperty, PatternStringProperty } from "scenerystack/axon";
import { ScreenSummaryContent } from "scenerystack/sim";
import { formatCelsiusRounded } from "../../common/view/formatters.js";
import { StringManager } from "../../i18n/StringManager.js";
import type { ConductionModel } from "../model/ConductionModel.js";

export class ConductionScreenSummaryContent extends ScreenSummaryContent {
  public constructor(model: ConductionModel) {
    const a11y = StringManager.getInstance().getConductionA11yStrings();

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
