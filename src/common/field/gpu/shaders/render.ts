/**
 * render.ts
 *
 * The visualization passes. Each one reads the same GPU state and draws one
 * layer over it — none of them can change the simulation, which is the property
 * that lets the Heat Transfer screen present five checkboxes as "views of one
 * thing" rather than five different sims.
 *
 *   field     — colour map, isotherms, |grad T|, and material tint in a single
 *               full-screen fragment shader
 *   arrows    — instanced heat-flux arrows, geometry built in the vertex shader
 *   particles — instanced tracer quads read straight from the particle buffer
 */

import { colorMapWgsl } from "../../ColorMap.js";
import { WGSL_BOUNDARY_CONSTANTS, WGSL_GRADIENT, WGSL_RESOLVE, WGSL_SAMPLE_SCALAR } from "./common.js";

/** Size of the `RenderParams` uniform block, in bytes. */
export const RENDER_PARAMS_BYTES = 64;

/** Layer bits packed into `RenderParams.layerFlags`. */
export const LAYER_BIT = {
  TEMPERATURE: 1,
  ISOTHERMS: 2,
  GRADIENT: 4,
  MATERIAL: 8,
} as const;

/**
 * Full-screen pass.
 *
 * The vertex stage emits one oversized triangle rather than a quad — fewer
 * vertices, no seam down the diagonal. `uv` runs (0,0) at the top-left to (1,1)
 * at the bottom-right so it matches the texture and the unit-square coordinates
 * the rest of the simulation speaks.
 *
 * Isotherms are drawn analytically instead of by tracing contours: `fwidth` gives
 * the screen-space rate of change of T/interval, so dividing the distance to the
 * nearest contour by it yields a line exactly one pixel wide at any zoom, on any
 * grid resolution, for free.
 */
export const FIELD_RENDER_SHADER = `
${WGSL_BOUNDARY_CONSTANTS}
${WGSL_RESOLVE}
${WGSL_SAMPLE_SCALAR}
${WGSL_GRADIENT}
${colorMapWgsl()}

struct RenderParams {
  gridSize: vec2<u32>,
  temperatureRange: vec2<f32>,
  isothermInterval: f32,
  layerFlags: u32,
  logMinConductivity: f32,
  logConductivitySpan: f32,
  isothermColor: vec4<f32>,
  peakGradient: f32,
  boundary: u32,
  ambient: f32,
  // Single scalar rather than a vec2: the domain is always square, and the
  // gradient overlay only needs the magnitude to be on the right scale.
  cellSize: f32,
};

const LAYER_TEMPERATURE: u32 = 1u;
const LAYER_ISOTHERMS: u32 = 2u;
const LAYER_GRADIENT: u32 = 4u;
const LAYER_MATERIAL: u32 = 8u;

const GRADIENT_LIFT: f32 = 0.55;
const MATERIAL_TINT_ALPHA: f32 = 0.35;

@group(0) @binding(0) var temperatureTexture: texture_2d<f32>;
@group(0) @binding(1) var materialTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> params: RenderParams;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
  // One triangle covering the clip rectangle: (-1,-1), (3,-1), (-1,3).
  var clip = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0),
  );
  let point = clip[index];

  var out: VertexOutput;
  out.position = vec4<f32>(point, 0.0, 1.0);
  out.uv = vec2<f32>((point.x + 1.0) * 0.5, (1.0 - point.y) * 0.5);
  return out;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let size = vec2<i32>(params.gridSize);
  let gridPosition = input.uv * vec2<f32>(params.gridSize);
  let temperature = bilinearScalar(temperatureTexture, gridPosition, size, params.boundary, params.ambient);

  let span = max(params.temperatureRange.y - params.temperatureRange.x, 1e-6);
  let normalized = (temperature - params.temperatureRange.x) / span;

  var color = vec3<f32>(0.06, 0.07, 0.12);
  if ((params.layerFlags & LAYER_TEMPERATURE) != 0u) {
    color = colorMap(normalized);
  }

  let cell = clamp(vec2<i32>(gridPosition), vec2<i32>(0, 0), size - vec2<i32>(1, 1));

  if ((params.layerFlags & LAYER_MATERIAL) != 0u) {
    // Conductivity spans four decades across the preset list, so tint on a log
    // scale: bright for conductors, near-black for insulators.
    let conductivity = max(textureLoad(materialTexture, cell, 0).x, 1e-6);
    let t = clamp((log(conductivity) - params.logMinConductivity) / max(params.logConductivitySpan, 1e-6), 0.0, 1.0);
    let tint = vec3<f32>(0.157 + 0.784 * t);
    color = mix(color, tint, MATERIAL_TINT_ALPHA);
  }

  if ((params.layerFlags & LAYER_GRADIENT) != 0u && params.peakGradient > 0.0) {
    let gradient = temperatureGradient(
      temperatureTexture, cell, size,
      vec2<f32>(params.cellSize, params.cellSize),
      params.boundary, params.ambient,
    );
    let lift = clamp(length(gradient) / params.peakGradient, 0.0, 1.0) * GRADIENT_LIFT;
    color = mix(color, vec3<f32>(1.0), lift);
  }

  if ((params.layerFlags & LAYER_ISOTHERMS) != 0u && params.isothermInterval > 0.0) {
    let level = temperature / params.isothermInterval;
    let width = fwidth(level);
    let distance = abs(fract(level - 0.5) - 0.5) / max(width, 1e-5);
    let line = 1.0 - smoothstep(0.0, 1.5, distance);
    color = mix(color, params.isothermColor.rgb, line * params.isothermColor.a);
  }

  return vec4<f32>(color, 1.0);
}
`;

/** Size of the `ArrowParams` uniform block, in bytes. */
export const ARROW_PARAMS_BYTES = 48;

/** Vertices per arrow: six for the shaft quad, three for the head. */
export const ARROW_VERTEX_COUNT = 9;

/**
 * Heat-flux arrows.
 *
 * One instance per lattice site. The vertex shader reads the temperature and
 * material textures directly, applies Fourier's law, and lays out the arrow in
 * clip space — no vertex buffer, no per-frame CPU geometry. An arrow shorter than
 * the noise floor is collapsed to a degenerate triangle rather than branching,
 * which keeps the pass uniform.
 */
export const ARROW_RENDER_SHADER = `
${WGSL_BOUNDARY_CONSTANTS}
${WGSL_RESOLVE}
${WGSL_SAMPLE_SCALAR}
${WGSL_GRADIENT}

struct ArrowParams {
  gridSize: vec2<u32>,
  arrowCount: u32,
  maxLength: f32,
  color: vec4<f32>,
  peakFlux: f32,
  boundary: u32,
  ambient: f32,
  cellSize: f32,
};

@group(0) @binding(0) var temperatureTexture: texture_2d<f32>;
@group(0) @binding(1) var materialTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> params: ArrowParams;

/** Arrow outline in a unit frame: +x is the flux direction, length 1, centred. */
fn arrowVertex(index: u32) -> vec2<f32> {
  var shape = array<vec2<f32>, 9>(
    vec2<f32>(-0.5, -0.06), vec2<f32>(0.18, -0.06), vec2<f32>(0.18, 0.06),
    vec2<f32>(-0.5, -0.06), vec2<f32>(0.18, 0.06), vec2<f32>(-0.5, 0.06),
    vec2<f32>(0.18, -0.20), vec2<f32>(0.5, 0.0), vec2<f32>(0.18, 0.20),
  );
  return shape[index];
}

struct ArrowOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) shade: f32,
};

@vertex
fn vertexMain(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> ArrowOutput {
  let size = vec2<i32>(params.gridSize);
  let column = instanceIndex % params.arrowCount;
  let row = instanceIndex / params.arrowCount;
  let uv = (vec2<f32>(f32(column), f32(row)) + vec2<f32>(0.5)) / f32(params.arrowCount);

  let cell = clamp(
    vec2<i32>(uv * vec2<f32>(params.gridSize)),
    vec2<i32>(0, 0),
    size - vec2<i32>(1, 1),
  );

  let gradient = temperatureGradient(
    temperatureTexture, cell, size,
    vec2<f32>(params.cellSize, params.cellSize),
    params.boundary, params.ambient,
  );
  let material = textureLoad(materialTexture, cell, 0);
  let flux = vec2<f32>(-material.x * gradient.x, -material.y * gradient.y);
  let magnitude = length(flux);

  var out: ArrowOutput;
  if (magnitude < params.peakFlux * 0.02 || params.peakFlux <= 0.0) {
    // Degenerate: nothing to draw at this site.
    out.position = vec4<f32>(0.0, 0.0, 2.0, 1.0);
    out.shade = 0.0;
    return out;
  }

  // Square-root scaling: |q| routinely spans two decades, and a linear map would
  // leave most of the lattice invisible.
  let length2d = params.maxLength * sqrt(clamp(magnitude / params.peakFlux, 0.0, 1.0));
  let direction = flux / magnitude;

  let local = arrowVertex(vertexIndex) * length2d;
  // Field v points down; clip-space y points up.
  let axis = vec2<f32>(direction.x, -direction.y);
  let perpendicular = vec2<f32>(-axis.y, axis.x);
  let offset = axis * local.x + perpendicular * local.y;

  let centre = vec2<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  out.position = vec4<f32>(centre + offset, 0.0, 1.0);
  out.shade = clamp(magnitude / params.peakFlux, 0.25, 1.0);
  return out;
}

@fragment
fn fragmentMain(input: ArrowOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(params.color.rgb, params.color.a * input.shade);
}
`;

/** Size of the `ParticleRenderParams` uniform block, in bytes. */
export const PARTICLE_RENDER_PARAMS_BYTES = 32;

/** Vertices per tracer particle (two triangles). */
export const PARTICLE_VERTEX_COUNT = 6;

/**
 * Tracer particles, one instanced quad each, read directly from the same storage
 * buffer the particle compute pass writes — the positions never make a round trip
 * through the CPU.
 */
export const PARTICLE_RENDER_SHADER = `
struct Particle {
  position: vec2<f32>,
  life: f32,
  seed: f32,
};

struct ParticleRenderParams {
  color: vec4<f32>,
  size: f32,
  lifetime: f32,
  pad0: f32,
  pad1: f32,
};

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: ParticleRenderParams;

struct ParticleOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) offset: vec2<f32>,
  @location(1) alpha: f32,
};

@vertex
fn vertexMain(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> ParticleOutput {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, 1.0), vec2<f32>(-1.0, 1.0),
  );
  let corner = corners[vertexIndex];
  let particle = particles[instanceIndex];

  let centre = vec2<f32>(particle.position.x * 2.0 - 1.0, 1.0 - particle.position.y * 2.0);

  // Triangular fade over the particle's life so tracers neither pop in nor out.
  let fraction = clamp(particle.life / max(params.lifetime, 1e-6), 0.0, 1.0);
  let fade = clamp(4.0 * min(fraction, 1.0 - fraction), 0.0, 1.0);

  var out: ParticleOutput;
  out.position = vec4<f32>(centre + corner * params.size, 0.0, 1.0);
  out.offset = corner;
  out.alpha = params.color.a * fade;
  return out;
}

@fragment
fn fragmentMain(input: ParticleOutput) -> @location(0) vec4<f32> {
  // Round the quad off into a soft disc.
  let radius = length(input.offset);
  let coverage = 1.0 - smoothstep(0.6, 1.0, radius);
  return vec4<f32>(params.color.rgb, input.alpha * coverage);
}
`;
