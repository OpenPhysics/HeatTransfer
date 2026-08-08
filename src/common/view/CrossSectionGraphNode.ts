/**
 * CrossSectionGraphNode.ts
 *
 * T(s) — and optionally q_s(s) — along the cross-section line.
 *
 * Two curves on one set of axes, with two different vertical scales, is usually a
 * bad idea. Here it earns its place: the whole point is that the flux curve is
 * the *negative slope* of the temperature curve times k, so seeing q peak exactly
 * where T is steepest, and cross zero exactly where T turns over, is the
 * demonstration. The temperature axis is fixed to the legend's range so the curve
 * can be read against the colours on the field; the flux axis autoscales, since
 * its magnitude changes by decades with the material.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import { Shape } from "scenerystack/kite";
import { Node, type NodeOptions, Path, Rectangle, Text } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import HeatTransferColors from "../../HeatTransferColors.js";
import {
  KELVIN_TO_CELSIUS_OFFSET,
  MAX_TEMPERATURE_K,
  MIN_TEMPERATURE_K,
  SMALL_FONT_SIZE,
} from "../../HeatTransferConstants.js";
import HeatTransferNamespace from "../../HeatTransferNamespace.js";
import { StringManager } from "../../i18n/StringManager.js";
import type { CrossSectionSample } from "../field/FieldTypes.js";
import type { FieldSimulationModel } from "../model/FieldSimulationModel.js";
import { panelReadout } from "./ControlFactory.js";

/** Padding inside the plot frame, in view coordinates. */
const PLOT_MARGIN = { left: 34, right: 12, top: 10, bottom: 22 };

/** Number of horizontal gridlines. */
const GRIDLINE_COUNT = 4;

export type CrossSectionGraphNodeOptions = NodeOptions & {
  width: number;
  height: number;
  /** Whether to draw the flux curve alongside the temperature curve. */
  showFluxProperty?: TReadOnlyProperty<boolean>;
};

export class CrossSectionGraphNode extends Node {
  private readonly temperatureCurve: Path;
  private readonly fluxCurve: Path;
  private readonly plotWidth: number;
  private readonly plotHeight: number;

  public constructor(model: FieldSimulationModel, providedOptions: CrossSectionGraphNodeOptions) {
    super();

    const strings = StringManager.getInstance();
    const graph = strings.getGraph();

    const { width, height } = providedOptions;
    this.plotWidth = width - PLOT_MARGIN.left - PLOT_MARGIN.right;
    this.plotHeight = height - PLOT_MARGIN.top - PLOT_MARGIN.bottom;

    // ── Frame ─────────────────────────────────────────────────────────────────

    const background = new Rectangle(0, 0, width, height, 4, 4, {
      fill: HeatTransferColors.graphBackgroundColorProperty,
      stroke: HeatTransferColors.panelBorderColorProperty,
    });
    this.addChild(background);

    const plot = new Node({ x: PLOT_MARGIN.left, y: PLOT_MARGIN.top });
    this.addChild(plot);

    const gridShape = new Shape();
    for (let n = 0; n <= GRIDLINE_COUNT; n++) {
      const y = (this.plotHeight * n) / GRIDLINE_COUNT;
      gridShape.moveTo(0, y).lineTo(this.plotWidth, y);
    }
    plot.addChild(
      new Path(gridShape, {
        stroke: HeatTransferColors.graphAxisColorProperty,
        lineWidth: 0.5,
        opacity: 0.5,
      }),
    );

    // Temperature axis ticks, in degrees Celsius, matching the legend's range.
    for (let n = 0; n <= GRIDLINE_COUNT; n++) {
      const fraction = n / GRIDLINE_COUNT;
      const kelvin = MIN_TEMPERATURE_K + (1 - fraction) * (MAX_TEMPERATURE_K - MIN_TEMPERATURE_K);
      plot.addChild(
        new Text(`${Math.round(kelvin - KELVIN_TO_CELSIUS_OFFSET)}`, {
          font: new PhetFont(SMALL_FONT_SIZE - 1),
          fill: HeatTransferColors.graphAxisColorProperty,
          right: -5,
          centerY: (this.plotHeight * n) / GRIDLINE_COUNT,
        }),
      );
    }

    // ── Curves ────────────────────────────────────────────────────────────────

    this.fluxCurve = new Path(null, {
      stroke: HeatTransferColors.fluxCurveColorProperty,
      lineWidth: 1.5,
      lineDash: [4, 3],
    });
    this.temperatureCurve = new Path(null, {
      stroke: HeatTransferColors.temperatureCurveColorProperty,
      lineWidth: 2,
    });
    plot.addChild(this.fluxCurve);
    plot.addChild(this.temperatureCurve);

    // ── Labels ────────────────────────────────────────────────────────────────

    const title = panelReadout(graph.titleStringProperty);
    title.left = PLOT_MARGIN.left;
    title.bottom = -3;
    this.addChild(title);

    const xAxisLabel = panelReadout(graph.distanceAxisStringProperty);
    xAxisLabel.centerX = PLOT_MARGIN.left + this.plotWidth / 2;
    xAxisLabel.top = height - PLOT_MARGIN.bottom + 4;
    this.addChild(xAxisLabel);

    const yAxisLabel = new Text(graph.temperatureAxisStringProperty, {
      font: new PhetFont(SMALL_FONT_SIZE - 1),
      fill: HeatTransferColors.temperatureCurveColorProperty,
      rotation: -Math.PI / 2,
      right: 10,
      centerY: PLOT_MARGIN.top + this.plotHeight / 2,
    });
    this.addChild(yAxisLabel);

    // ── Data ──────────────────────────────────────────────────────────────────

    const showFluxProperty = providedOptions.showFluxProperty;
    model.crossSectionSamplesProperty.link((samples) => {
      this.updateCurves(samples, showFluxProperty?.value ?? false);
    });
    showFluxProperty?.link((show) => {
      this.updateCurves(model.crossSectionSamplesProperty.value, show);
    });

    this.mutate(providedOptions);
  }

  private updateCurves(samples: readonly CrossSectionSample[], showFlux: boolean): void {
    if (samples.length < 2) {
      this.temperatureCurve.shape = null;
      this.fluxCurve.shape = null;
      return;
    }

    const lastSample = samples[samples.length - 1];
    const totalDistance = lastSample ? lastSample.distance : 1;
    const xOf = (distance: number): number => (totalDistance > 0 ? (distance / totalDistance) * this.plotWidth : 0);

    // Temperature: fixed scale, matching the legend.
    const temperatureSpan = MAX_TEMPERATURE_K - MIN_TEMPERATURE_K;
    const temperatureShape = new Shape();
    samples.forEach((sample, index) => {
      const fraction = (sample.temperature - MIN_TEMPERATURE_K) / temperatureSpan;
      const y = this.plotHeight * (1 - Math.min(1, Math.max(0, fraction)));
      if (index === 0) {
        temperatureShape.moveTo(xOf(sample.distance), y);
      } else {
        temperatureShape.lineTo(xOf(sample.distance), y);
      }
    });
    this.temperatureCurve.shape = temperatureShape;

    if (!showFlux) {
      this.fluxCurve.shape = null;
      return;
    }

    // Flux: autoscaled and centred, so zero flux sits on the middle gridline and
    // the sign of q is readable directly.
    let peak = 0;
    for (const sample of samples) {
      peak = Math.max(peak, Math.abs(sample.flux));
    }
    if (peak <= 0) {
      this.fluxCurve.shape = null;
      return;
    }

    const fluxShape = new Shape();
    samples.forEach((sample, index) => {
      const y = this.plotHeight * (0.5 - (sample.flux / peak) * 0.45);
      if (index === 0) {
        fluxShape.moveTo(xOf(sample.distance), y);
      } else {
        fluxShape.lineTo(xOf(sample.distance), y);
      }
    });
    this.fluxCurve.shape = fluxShape;
  }
}

HeatTransferNamespace.register("CrossSectionGraphNode", CrossSectionGraphNode);
