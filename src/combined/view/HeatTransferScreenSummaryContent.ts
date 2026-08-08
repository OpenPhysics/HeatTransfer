/**
 * HeatTransferScreenSummaryContent.ts
 *
 * The accessible screen summary for the Heat Transfer screen. `currentDetailsContent`
 * is derived live from the field's coldest and hottest points, so re-reading the
 * summary reports the present state of the plate rather than how it started.
 */
import { DerivedProperty, PatternStringProperty } from "scenerystack/axon";
import { ScreenSummaryContent } from "scenerystack/sim";
import { formatCelsiusRounded, formatPeclet } from "../../common/view/formatters.js";
import { StringManager } from "../../i18n/StringManager.js";
import type { HeatTransferModel } from "../model/HeatTransferModel.js";

export class HeatTransferScreenSummaryContent extends ScreenSummaryContent {
  public constructor(model: HeatTransferModel) {
    const a11y = StringManager.getInstance().getHeatTransferA11yStrings();

    super({
      playAreaContent: a11y.screenSummary.playAreaStringProperty,
      controlAreaContent: a11y.screenSummary.controlAreaStringProperty,
      currentDetailsContent: new PatternStringProperty(a11y.currentDetailsStringProperty, {
        min: new DerivedProperty([model.field.minTemperatureProperty], (kelvin) => formatCelsiusRounded(kelvin)),
        max: new DerivedProperty([model.field.maxTemperatureProperty], (kelvin) => formatCelsiusRounded(kelvin)),
        peclet: new DerivedProperty([model.field.pecletNumberProperty], (peclet) => formatPeclet(peclet)),
      }),
      interactionHintContent: a11y.screenSummary.interactionHintStringProperty,
    });
  }
}
