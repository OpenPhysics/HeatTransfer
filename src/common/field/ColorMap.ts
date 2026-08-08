/**
 * ColorMap.ts
 *
 * The temperature colour map, defined once as data so the CPU renderer and the
 * WGSL fragment shader cannot drift apart: {@link colorMapWgsl} generates the
 * shader function from the very same stop list that {@link sampleColorMap}
 * interpolates.
 *
 * The ramp is a perceptually ordered cold-to-hot sequence — deep blue, blue,
 * cyan, green, yellow, orange, red, white-hot — chosen so that (a) hue alone
 * orders the values, and (b) lightness increases monotonically, which keeps the
 * ordering legible when the sim is projected or viewed in greyscale.
 */

import HeatTransferNamespace from "../../HeatTransferNamespace.js";

/** One stop on the ramp: a normalized position and an sRGB colour in [0, 1]. */
export type ColorStop = {
  position: number;
  red: number;
  green: number;
  blue: number;
};

/** The ramp, in increasing position order. Positions must span 0 to 1. */
export const TEMPERATURE_COLOR_STOPS: readonly ColorStop[] = [
  { position: 0.0, red: 0.031, green: 0.09, blue: 0.353 },
  { position: 0.15, red: 0.075, green: 0.294, blue: 0.71 },
  { position: 0.3, red: 0.204, green: 0.647, blue: 0.859 },
  { position: 0.45, red: 0.361, green: 0.812, blue: 0.647 },
  { position: 0.58, red: 0.83, green: 0.882, blue: 0.318 },
  { position: 0.72, red: 0.976, green: 0.702, blue: 0.192 },
  { position: 0.86, red: 0.902, green: 0.318, blue: 0.145 },
  { position: 1.0, red: 0.996, green: 0.925, blue: 0.851 },
];

/** An RGB triple in [0, 1]. */
export type Rgb = { red: number; green: number; blue: number };

/**
 * Samples the ramp at a normalized position. Values outside [0, 1] clamp to the
 * end stops, so a field that runs off the legend still renders sensibly.
 */
export function sampleColorMap(position: number): Rgb {
  const stops = TEMPERATURE_COLOR_STOPS;
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!(first && last)) {
    return { red: 0, green: 0, blue: 0 };
  }
  if (!(position > first.position)) {
    return { red: first.red, green: first.green, blue: first.blue };
  }
  if (position >= last.position) {
    return { red: last.red, green: last.green, blue: last.blue };
  }

  for (let i = 1; i < stops.length; i++) {
    const hi = stops[i];
    const lo = stops[i - 1];
    if (!(hi && lo)) {
      continue;
    }
    if (position <= hi.position) {
      const span = hi.position - lo.position;
      const t = span > 0 ? (position - lo.position) / span : 0;
      return {
        red: lo.red + (hi.red - lo.red) * t,
        green: lo.green + (hi.green - lo.green) * t,
        blue: lo.blue + (hi.blue - lo.blue) * t,
      };
    }
  }
  return { red: last.red, green: last.green, blue: last.blue };
}

/**
 * Formats an {@link Rgb} as a CSS colour string.
 *
 * A *format* helper, not a palette: the components it is handed always come from
 * the ramp or from a `ProfileColorProperty` by way of `FieldRenderStyle`. Nothing
 * here chooses a colour.
 */
export function rgbToCss(color: Rgb): string {
  const to255 = (value: number): number => Math.round(Math.min(1, Math.max(0, value)) * 255);
  return `rgb(${to255(color.red)}, ${to255(color.green)}, ${to255(color.blue)})`;
}

/**
 * WGSL source for `fn colorMap(position: f32) -> vec3<f32>`, generated from
 * {@link TEMPERATURE_COLOR_STOPS}. Included by every render shader that paints
 * the temperature field.
 */
export function colorMapWgsl(): string {
  const count = TEMPERATURE_COLOR_STOPS.length;
  const positions = TEMPERATURE_COLOR_STOPS.map((stop) => wgslFloat(stop.position)).join(", ");
  const colors = TEMPERATURE_COLOR_STOPS.map(
    (stop) => `vec3<f32>(${wgslFloat(stop.red)}, ${wgslFloat(stop.green)}, ${wgslFloat(stop.blue)})`,
  ).join(",\n    ");

  return `
const COLOR_STOP_COUNT: u32 = ${count}u;
const COLOR_STOP_POSITIONS = array<f32, ${count}>(${positions});
const COLOR_STOP_COLORS = array<vec3<f32>, ${count}>(
    ${colors}
);

fn colorMap(position: f32) -> vec3<f32> {
  let p = clamp(position, 0.0, 1.0);
  var positions = COLOR_STOP_POSITIONS;
  var colors = COLOR_STOP_COLORS;
  var result = colors[COLOR_STOP_COUNT - 1u];
  for (var i: u32 = 1u; i < COLOR_STOP_COUNT; i = i + 1u) {
    if (p <= positions[i]) {
      let lo = positions[i - 1u];
      let hi = positions[i];
      let span = max(hi - lo, 1e-6);
      let t = clamp((p - lo) / span, 0.0, 1.0);
      result = mix(colors[i - 1u], colors[i], t);
      break;
    }
  }
  return result;
}
`;
}

/** Formats a number as a WGSL `f32` literal (WGSL requires a decimal point). */
function wgslFloat(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

HeatTransferNamespace.register("ColorMap", {
  TEMPERATURE_COLOR_STOPS,
});
