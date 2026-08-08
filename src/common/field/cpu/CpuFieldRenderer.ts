/**
 * CpuFieldRenderer.ts
 *
 * The 2-D canvas equivalent of the WebGPU render passes. Same layer list, same
 * order, same meaning:
 *
 *   1. temperature — colour-mapped scalar field, drawn as an ImageData at grid
 *      resolution and scaled up with the browser's own smoothing
 *   2. material    — conductivity tint, composited into the same ImageData
 *   3. gradient    — |grad T| as a brightness lift, also in the same ImageData
 *   4. isotherms   — marching-squares contours, drawn as vector paths so they
 *      stay crisp no matter how coarse the grid is
 *   5. heat flux   — arrows on a coarse lattice
 *   6. velocity    — tracer particles
 *
 * Passes 1-3 share one pixel loop because they all write colour; 4-6 are vector
 * overlays drawn on top.
 */

import { FLUX_ARROW_COUNT, ISOTHERM_INTERVAL_K, MAX_ARROW_LENGTH_FRACTION } from "../../../HeatTransferConstants.js";
import { rgbToCss, sampleColorMap } from "../ColorMap.js";
import type { FieldRenderStyle } from "../FieldEngine.js";
import type { BoundaryConditionId, LayerVisibility } from "../FieldTypes.js";
import { type FieldGeometry, gradientAt, type MaterialArrays } from "../kernels.js";
import { MAX_PRESET_CONDUCTIVITY, MIN_PRESET_CONDUCTIVITY } from "../Materials.js";
import type { SimulationDomain } from "../SimulationDomain.js";
import type { CpuParticleSystem } from "./CpuParticleSystem.js";

/** Entries in the colour lookup table built once per style change. */
const COLOR_LUT_SIZE = 256;

/** How much of the way to white the gradient layer lifts a pixel at full strength. */
const GRADIENT_LIFT = 0.55;

/** Opacity of the material tint overlay. */
const MATERIAL_TINT_ALPHA = 0.35;

/** Radius of a tracer particle, in display pixels. */
const PARTICLE_RADIUS = 1.6;

/** The colour a pixel starts from when the temperature layer is off. */
const BLANK_COLOR = { red: 15, green: 18, blue: 31 } as const;

/**
 * Grey level for a material of conductivity `k`, on a log scale across the preset
 * range: bright for conductors, near-black for insulators.
 */
function materialTint(conductivity: number): number {
  const logMin = Math.log(MIN_PRESET_CONDUCTIVITY);
  const logSpan = Math.log(MAX_PRESET_CONDUCTIVITY) - logMin;
  const k = Math.max(MIN_PRESET_CONDUCTIVITY, conductivity);
  const t = Math.min(1, Math.max(0, (Math.log(k) - logMin) / logSpan));
  return 40 + 200 * t;
}

export type CpuRenderInputs = {
  temperature: Float32Array;
  material: MaterialArrays;
  velocity: Float32Array;
  boundary: BoundaryConditionId;
  particles: CpuParticleSystem;
  flowScale: number;
};

export class CpuFieldRenderer {
  private readonly domain: SimulationDomain;
  private readonly geometry: FieldGeometry;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;

  /** Grid-resolution scratch canvas the field is painted into before upscaling. */
  private readonly gridCanvas: HTMLCanvasElement;
  private readonly gridContext: CanvasRenderingContext2D | null;
  private readonly gridImage: ImageData | null;

  /** Colour ramp flattened to a byte LUT, rebuilt when the style's range changes. */
  private readonly colorLut = new Uint8ClampedArray(COLOR_LUT_SIZE * 3);

  public constructor(domain: SimulationDomain, geometry: FieldGeometry, canvas: HTMLCanvasElement) {
    this.domain = domain;
    this.geometry = geometry;
    this.canvas = canvas;
    this.context = canvas.getContext("2d");

    this.gridCanvas = document.createElement("canvas");
    this.gridCanvas.width = domain.gridWidth;
    this.gridCanvas.height = domain.gridHeight;
    this.gridContext = this.gridCanvas.getContext("2d");
    this.gridImage = this.gridContext?.createImageData(domain.gridWidth, domain.gridHeight) ?? null;

    this.buildColorLut();
  }

  private buildColorLut(): void {
    for (let n = 0; n < COLOR_LUT_SIZE; n++) {
      const { red, green, blue } = sampleColorMap(n / (COLOR_LUT_SIZE - 1));
      this.colorLut[3 * n] = red * 255;
      this.colorLut[3 * n + 1] = green * 255;
      this.colorLut[3 * n + 2] = blue * 255;
    }
  }

  public render(layers: LayerVisibility, style: FieldRenderStyle, inputs: CpuRenderInputs): void {
    const context = this.context;
    if (!context) {
      return;
    }

    const { width, height } = this.canvas;
    context.clearRect(0, 0, width, height);

    this.paintField(layers, style, inputs);

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(this.gridCanvas, 0, 0, width, height);

    if (layers.isotherms) {
      this.drawIsotherms(context, style, inputs);
    }
    if (layers.heatFlux) {
      this.drawFluxArrows(context, style, inputs);
    }
    if (layers.velocity) {
      this.drawParticles(context, style, inputs);
    }
  }

  // ── Pass 1-3: colour ────────────────────────────────────────────────────────

  private paintField(layers: LayerVisibility, style: FieldRenderStyle, inputs: CpuRenderInputs): void {
    const image = this.gridImage;
    const gridContext = this.gridContext;
    if (!(image && gridContext)) {
      return;
    }

    const { gridWidth, gridHeight } = this.domain;
    const { temperature, material, boundary } = inputs;
    const span = Math.max(1e-6, style.maxTemperature - style.minTemperature);
    const pixels = image.data;

    // The gradient layer normalizes against the frame's own peak, so a nearly
    // uniform field does not render as noise amplified to full brightness.
    const gradientScale = layers.gradient ? this.gradientNormalization(inputs, style.minTemperature) : 0;

    for (let j = 0; j < gridHeight; j++) {
      for (let i = 0; i < gridWidth; i++) {
        const index = j * gridWidth + i;
        const offset = 4 * index;

        const temperatureColor = layers.temperature
          ? this.lookUpColor(((temperature[index] ?? style.minTemperature) - style.minTemperature) / span)
          : BLANK_COLOR;

        let { red, green, blue } = temperatureColor;

        if (layers.material) {
          const tint = materialTint(material.conductivityX[index] ?? MIN_PRESET_CONDUCTIVITY);
          red = red * (1 - MATERIAL_TINT_ALPHA) + tint * MATERIAL_TINT_ALPHA;
          green = green * (1 - MATERIAL_TINT_ALPHA) + tint * MATERIAL_TINT_ALPHA;
          blue = blue * (1 - MATERIAL_TINT_ALPHA) + tint * MATERIAL_TINT_ALPHA;
        }

        if (gradientScale > 0) {
          const { gx, gy } = gradientAt(temperature, this.geometry, boundary, i, j, style.minTemperature);
          const lift = Math.min(1, Math.hypot(gx, gy) * gradientScale) * GRADIENT_LIFT;
          red += (255 - red) * lift;
          green += (255 - green) * lift;
          blue += (255 - blue) * lift;
        }

        pixels[offset] = red;
        pixels[offset + 1] = green;
        pixels[offset + 2] = blue;
        pixels[offset + 3] = 255;
      }
    }

    gridContext.putImageData(image, 0, 0);
  }

  /** The colour ramp sampled through the byte LUT, as 0-255 components. */
  private lookUpColor(position: number): { red: number; green: number; blue: number } {
    const lut = Math.min(COLOR_LUT_SIZE - 1, Math.max(0, Math.round(position * (COLOR_LUT_SIZE - 1))));
    return {
      red: this.colorLut[3 * lut] ?? 0,
      green: this.colorLut[3 * lut + 1] ?? 0,
      blue: this.colorLut[3 * lut + 2] ?? 0,
    };
  }

  /**
   * `1 / peak |grad T|` over a quarter-density sample of the field, or 0 when the
   * field is flat. Sampling every other cell in each direction is four times
   * cheaper and cannot miss a peak by more than one cell's worth of curvature.
   */
  private gradientNormalization(inputs: CpuRenderInputs, outsideValue: number): number {
    const { gridWidth, gridHeight } = this.domain;
    let peak = 0;
    for (let j = 0; j < gridHeight; j += 2) {
      for (let i = 0; i < gridWidth; i += 2) {
        const { gx, gy } = gradientAt(inputs.temperature, this.geometry, inputs.boundary, i, j, outsideValue);
        const magnitude = Math.hypot(gx, gy);
        if (magnitude > peak) {
          peak = magnitude;
        }
      }
    }
    return peak > 0 ? 1 / peak : 0;
  }

  // ── Pass 4: isotherms ───────────────────────────────────────────────────────

  /**
   * Marching squares over the cell-centre lattice.
   *
   * Only the levels that actually cross a given quad are tested, which turns a
   * levels x cells double loop into something close to a single pass over the
   * cells: most quads in a smooth field span less than one contour interval.
   */
  private drawIsotherms(context: CanvasRenderingContext2D, style: FieldRenderStyle, inputs: CpuRenderInputs): void {
    const { gridWidth, gridHeight } = this.domain;
    const temperature = inputs.temperature;
    const interval = style.isothermInterval > 0 ? style.isothermInterval : ISOTHERM_INTERVAL_K;
    const scaleX = this.canvas.width / gridWidth;
    const scaleY = this.canvas.height / gridHeight;

    context.save();
    context.strokeStyle = rgbToCss(style.isotherm);
    context.lineWidth = 1.25;
    context.globalAlpha = 0.85;
    context.beginPath();

    for (let j = 0; j < gridHeight - 1; j++) {
      for (let i = 0; i < gridWidth - 1; i++) {
        const t00 = temperature[j * gridWidth + i] ?? 0;
        const t10 = temperature[j * gridWidth + i + 1] ?? 0;
        const t01 = temperature[(j + 1) * gridWidth + i] ?? 0;
        const t11 = temperature[(j + 1) * gridWidth + i + 1] ?? 0;

        const lowest = Math.min(t00, t10, t01, t11);
        const highest = Math.max(t00, t10, t01, t11);
        const firstLevel = Math.ceil(lowest / interval);
        const lastLevel = Math.floor(highest / interval);

        for (let level = firstLevel; level <= lastLevel; level++) {
          const value = level * interval;
          appendContourSegment(context, i, j, t00, t10, t01, t11, value, scaleX, scaleY);
        }
      }
    }

    context.stroke();
    context.restore();
  }

  // ── Pass 5: heat flux ───────────────────────────────────────────────────────

  private drawFluxArrows(context: CanvasRenderingContext2D, style: FieldRenderStyle, inputs: CpuRenderInputs): void {
    const { gridWidth, gridHeight } = this.domain;
    const { temperature, material, boundary } = inputs;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const maxLength = MAX_ARROW_LENGTH_FRACTION * width;

    // Two passes: find the largest flux on the lattice, then scale every arrow
    // against it so the longest arrow is always exactly maxLength.
    const samples: { x: number; y: number; qx: number; qy: number }[] = [];
    let peak = 0;

    for (let row = 0; row < FLUX_ARROW_COUNT; row++) {
      for (let column = 0; column < FLUX_ARROW_COUNT; column++) {
        const u = (column + 0.5) / FLUX_ARROW_COUNT;
        const v = (row + 0.5) / FLUX_ARROW_COUNT;
        const i = Math.min(gridWidth - 1, Math.floor(u * gridWidth));
        const j = Math.min(gridHeight - 1, Math.floor(v * gridHeight));
        const { gx, gy } = gradientAt(temperature, this.geometry, boundary, i, j, style.minTemperature);
        const index = j * gridWidth + i;
        const qx = -(material.conductivityX[index] ?? 0) * gx;
        const qy = -(material.conductivityY[index] ?? 0) * gy;
        const magnitude = Math.hypot(qx, qy);
        if (magnitude > peak) {
          peak = magnitude;
        }
        samples.push({ x: u * width, y: v * height, qx, qy });
      }
    }

    if (peak <= 0) {
      return;
    }

    context.save();
    context.strokeStyle = rgbToCss(style.arrow);
    context.fillStyle = rgbToCss(style.arrow);
    context.lineWidth = 1.4;
    context.lineCap = "round";

    for (const sample of samples) {
      const magnitude = Math.hypot(sample.qx, sample.qy);
      if (magnitude < peak * 0.02) {
        continue;
      }
      // Square-root scaling keeps weak arrows visible without letting strong ones
      // dominate — the field often spans two decades of |q|.
      const length = maxLength * Math.sqrt(magnitude / peak);
      const dirX = sample.qx / magnitude;
      const dirY = sample.qy / magnitude;
      drawArrow(context, sample.x, sample.y, dirX, dirY, length);
    }

    context.restore();
  }

  // ── Pass 6: velocity ────────────────────────────────────────────────────────

  private drawParticles(context: CanvasRenderingContext2D, style: FieldRenderStyle, inputs: CpuRenderInputs): void {
    const { particles } = inputs;
    const width = this.canvas.width;
    const height = this.canvas.height;

    context.save();
    context.fillStyle = rgbToCss(style.particle);
    for (let n = 0; n < particles.particleCount; n++) {
      const u = particles.positions[2 * n] ?? 0;
      const v = particles.positions[2 * n + 1] ?? 0;
      context.globalAlpha = particles.opacityAt(n);
      context.beginPath();
      context.arc(u * width, v * height, PARTICLE_RADIUS, 0, 2 * Math.PI);
      context.fill();
    }
    context.restore();
  }
}

/** Linear interpolation of the crossing position between two corner values. */
function crossing(a: number, b: number, value: number): number {
  const span = b - a;
  return span === 0 ? 0.5 : (value - a) / span;
}

/**
 * Appends the contour segment(s) for one marching-squares cell to the current path.
 *
 * Corners are the cell centres (i, j), (i+1, j), (i, j+1), (i+1, j+1); the
 * segment endpoints are placed on the edges where the level is crossed.
 */
function appendContourSegment(
  context: CanvasRenderingContext2D,
  i: number,
  j: number,
  t00: number,
  t10: number,
  t01: number,
  t11: number,
  value: number,
  scaleX: number,
  scaleY: number,
): void {
  const code = (t00 > value ? 1 : 0) | (t10 > value ? 2 : 0) | (t11 > value ? 4 : 0) | (t01 > value ? 8 : 0);
  if (code === 0 || code === 15) {
    return;
  }

  // Edge crossing points, in cell-centre coordinates offset by (i, j).
  const top = { x: i + crossing(t00, t10, value), y: j };
  const right = { x: i + 1, y: j + crossing(t10, t11, value) };
  const bottom = { x: i + crossing(t01, t11, value), y: j + 1 };
  const left = { x: i, y: j + crossing(t00, t01, value) };

  const line = (a: { x: number; y: number }, b: { x: number; y: number }): void => {
    context.moveTo((a.x + 0.5) * scaleX, (a.y + 0.5) * scaleY);
    context.lineTo((b.x + 0.5) * scaleX, (b.y + 0.5) * scaleY);
  };

  switch (code) {
    case 1:
    case 14:
      line(left, top);
      break;
    case 2:
    case 13:
      line(top, right);
      break;
    case 3:
    case 12:
      line(left, right);
      break;
    case 4:
    case 11:
      line(right, bottom);
      break;
    case 6:
    case 9:
      line(top, bottom);
      break;
    case 7:
    case 8:
      line(left, bottom);
      break;
    case 5:
      // Saddle: two disjoint segments.
      line(left, top);
      line(right, bottom);
      break;
    case 10:
      line(top, right);
      line(left, bottom);
      break;
    default:
      break;
  }
}

/** Draws a line-and-head arrow centred on (x, y) pointing along (dirX, dirY). */
function drawArrow(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  length: number,
): void {
  const halfLength = length / 2;
  const tailX = x - dirX * halfLength;
  const tailY = y - dirY * halfLength;
  const tipX = x + dirX * halfLength;
  const tipY = y + dirY * halfLength;

  context.beginPath();
  context.moveTo(tailX, tailY);
  context.lineTo(tipX, tipY);
  context.stroke();

  const headLength = Math.min(length * 0.45, 7);
  const perpX = -dirY;
  const perpY = dirX;
  context.beginPath();
  context.moveTo(tipX, tipY);
  context.lineTo(
    tipX - dirX * headLength + perpX * headLength * 0.45,
    tipY - dirY * headLength + perpY * headLength * 0.45,
  );
  context.lineTo(
    tipX - dirX * headLength - perpX * headLength * 0.45,
    tipY - dirY * headLength - perpY * headLength * 0.45,
  );
  context.closePath();
  context.fill();
}
