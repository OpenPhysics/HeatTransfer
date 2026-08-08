/**
 * TemperatureLegendNode.ts
 *
 * The key that makes the colour map quantitative.
 *
 * The bar is drawn from the same {@link TEMPERATURE_COLOR_STOPS} the field
 * renderer uses, so it cannot disagree with the field: adding a stop changes both
 * at once. Live markers track the current coldest and hottest points in the
 * field, which turns the legend into a readout as well as a key — a student can
 * see the range narrow as the plate equilibrates without reading a number.
 */

import { DerivedProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { Shape } from "scenerystack/kite";
import { LinearGradient, Node, type NodeOptions, Path, Rectangle, Text } from "scenerystack/scenery";
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
import { TEMPERATURE_COLOR_STOPS } from "../field/ColorMap.js";

/** Width of the colour bar, in view coordinates. */
const BAR_WIDTH = 22;

/** Number of labelled ticks along the bar, including both ends. */
const TICK_COUNT = 5;

export type TemperatureLegendNodeOptions = NodeOptions & {
  /** Height of the colour bar, in view coordinates. */
  barHeight: number;
  /** Coldest point in the field, in kelvin. */
  minTemperatureProperty: TReadOnlyProperty<number>;
  /** Hottest point in the field, in kelvin. */
  maxTemperatureProperty: TReadOnlyProperty<number>;
};

export class TemperatureLegendNode extends Node {
  public constructor(providedOptions: TemperatureLegendNodeOptions) {
    super();

    const { barHeight } = providedOptions;
    const strings = StringManager.getInstance();

    // ── Colour bar ────────────────────────────────────────────────────────────
    // Hot at the top, so "up" means "hotter" as it does on a thermometer. The
    // gradient runs from y = barHeight (cold) to y = 0 (hot).

    const gradient = new LinearGradient(0, barHeight, 0, 0);
    for (const stop of TEMPERATURE_COLOR_STOPS) {
      gradient.addColorStop(stop.position, rgbToCss(stop));
    }

    const bar = new Rectangle(0, 0, BAR_WIDTH, barHeight, {
      fill: gradient,
      stroke: HeatTransferColors.fieldBorderColorProperty,
      lineWidth: 1,
    });
    this.addChild(bar);

    // ── Ticks ─────────────────────────────────────────────────────────────────

    const tickShape = new Shape();
    for (let n = 0; n < TICK_COUNT; n++) {
      const fraction = n / (TICK_COUNT - 1);
      const y = barHeight * (1 - fraction);
      tickShape.moveTo(BAR_WIDTH, y).lineTo(BAR_WIDTH + 5, y);

      const kelvin = MIN_TEMPERATURE_K + fraction * (MAX_TEMPERATURE_K - MIN_TEMPERATURE_K);
      const label = new Text(`${Math.round(kelvin - KELVIN_TO_CELSIUS_OFFSET)}`, {
        font: new PhetFont(SMALL_FONT_SIZE),
        fill: HeatTransferColors.secondaryTextColorProperty,
        left: BAR_WIDTH + 8,
        centerY: y,
      });
      this.addChild(label);
    }
    this.addChild(
      new Path(tickShape, {
        stroke: HeatTransferColors.fieldBorderColorProperty,
        lineWidth: 1,
      }),
    );

    // ── Title and unit ────────────────────────────────────────────────────────

    const title = new Text(strings.getLegend().titleStringProperty, {
      font: new PhetFont({ size: SMALL_FONT_SIZE, weight: "bold" }),
      fill: HeatTransferColors.textColorProperty,
      maxWidth: 90,
      centerX: BAR_WIDTH / 2,
      bottom: -6,
    });
    this.addChild(title);

    const unit = new Text("°C", {
      font: new PhetFont(SMALL_FONT_SIZE),
      fill: HeatTransferColors.secondaryTextColorProperty,
      centerX: BAR_WIDTH / 2,
      top: barHeight + 5,
    });
    this.addChild(unit);

    // ── Live range markers ────────────────────────────────────────────────────

    const marker = (temperatureProperty: TReadOnlyProperty<number>): Node => {
      const shape = new Shape().moveTo(-7, 0).lineTo(0, -4).lineTo(0, 4).close();
      const node = new Path(shape, { fill: HeatTransferColors.textColorProperty });
      const positionProperty = new DerivedProperty([temperatureProperty], (kelvin) => {
        const fraction = (kelvin - MIN_TEMPERATURE_K) / (MAX_TEMPERATURE_K - MIN_TEMPERATURE_K);
        return barHeight * (1 - Math.min(1, Math.max(0, fraction)));
      });
      positionProperty.link((y) => {
        node.centerY = y;
        node.right = 0;
      });
      return node;
    };

    this.addChild(marker(providedOptions.minTemperatureProperty));
    this.addChild(marker(providedOptions.maxTemperatureProperty));

    this.mutate(providedOptions);
  }
}

/** Formats a colour stop in [0, 1] components as a CSS `rgb()` string. */
function rgbToCss(color: { red: number; green: number; blue: number }): string {
  const to255 = (value: number): number => Math.round(Math.min(1, Math.max(0, value)) * 255);
  return `rgb(${to255(color.red)}, ${to255(color.green)}, ${to255(color.blue)})`;
}

HeatTransferNamespace.register("TemperatureLegendNode", TemperatureLegendNode);
