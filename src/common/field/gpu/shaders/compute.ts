/**
 * compute.ts
 *
 * The compute passes that evolve the fields. One timestep is
 *
 *   temperature --advect--> temperature' --diffuse--> temperature''
 *
 * with a texture swap after each pass, exactly the ping-pong the prescription
 * calls for and exactly the operator splitting `CpuFieldEngine.step` performs.
 * Brush strokes are a fourth pass over the same pair, so painting heat is a
 * write into the GPU temperature texture rather than a CPU upload.
 */

import { WGSL_COMPUTE_PRELUDE, WORKGROUP_SIZE } from "./common.js";

/**
 * Semi-Lagrangian advection: each cell traces its parcel back along the velocity
 * field and bilinearly samples the incoming temperature there.
 */
export const ADVECT_SHADER = `
${WGSL_COMPUTE_PRELUDE}

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var destinationTexture: texture_storage_2d<r32float, write>;
@group(0) @binding(2) var velocityTexture: texture_2d<f32>;
@group(0) @binding(3) var<uniform> params: SimParams;

@compute @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let size = vec2<i32>(params.gridSize);
  let coord = vec2<i32>(i32(id.x), i32(id.y));
  if (coord.x >= size.x || coord.y >= size.y) {
    return;
  }

  let velocity = textureLoad(velocityTexture, coord, 0).xy * params.flowScale;
  let departure = vec2<f32>(f32(coord.x) + 0.5, f32(coord.y) + 0.5)
    - velocity * params.dt / params.cellSize;

  let value = bilinearScalar(sourceTexture, departure, size, params.boundary, params.ambient);
  textureStore(destinationTexture, coord, vec4<f32>(value, 0.0, 0.0, 1.0));
}
`;

/**
 * Conservative explicit diffusion with harmonic-mean face conductivities.
 *
 * On an insulated boundary the outward face conductivity is forced to zero, so
 * no flux crosses it and the total energy in the domain is exactly conserved to
 * floating-point round-off.
 */
export const DIFFUSE_SHADER = `
${WGSL_COMPUTE_PRELUDE}

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var destinationTexture: texture_storage_2d<r32float, write>;
@group(0) @binding(2) var materialTexture: texture_2d<f32>;
@group(0) @binding(3) var<uniform> params: SimParams;

@compute @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let size = vec2<i32>(params.gridSize);
  let coord = vec2<i32>(i32(id.x), i32(id.y));
  if (coord.x >= size.x || coord.y >= size.y) {
    return;
  }

  let centre = textureLoad(sourceTexture, coord, 0).r;
  let here = fetchMaterial(materialTexture, coord, size);
  let scale = params.diffusionScale;
  let kxHere = here.x * scale;
  let kyHere = here.y * scale;

  let insulated = params.boundary == BOUNDARY_INSULATED;
  let atLeft = coord.x == 0;
  let atRight = coord.x == size.x - 1;
  let atTop = coord.y == 0;
  let atBottom = coord.y == size.y - 1;

  var kWest = 0.0;
  if (!(insulated && atLeft)) {
    kWest = faceConductivity(kxHere, fetchMaterial(materialTexture, coord - vec2<i32>(1, 0), size).x * scale);
  }
  var kEast = 0.0;
  if (!(insulated && atRight)) {
    kEast = faceConductivity(kxHere, fetchMaterial(materialTexture, coord + vec2<i32>(1, 0), size).x * scale);
  }
  var kNorth = 0.0;
  if (!(insulated && atTop)) {
    kNorth = faceConductivity(kyHere, fetchMaterial(materialTexture, coord - vec2<i32>(0, 1), size).y * scale);
  }
  var kSouth = 0.0;
  if (!(insulated && atBottom)) {
    kSouth = faceConductivity(kyHere, fetchMaterial(materialTexture, coord + vec2<i32>(0, 1), size).y * scale);
  }

  let west = fetchScalar(sourceTexture, coord - vec2<i32>(1, 0), size, params.boundary, params.ambient);
  let east = fetchScalar(sourceTexture, coord + vec2<i32>(1, 0), size, params.boundary, params.ambient);
  let north = fetchScalar(sourceTexture, coord - vec2<i32>(0, 1), size, params.boundary, params.ambient);
  let south = fetchScalar(sourceTexture, coord + vec2<i32>(0, 1), size, params.boundary, params.ambient);

  let inverseSquares = vec2<f32>(1.0, 1.0) / (params.cellSize * params.cellSize);
  let divergence =
    (kEast * (east - centre) + kWest * (west - centre)) * inverseSquares.x +
    (kSouth * (south - centre) + kNorth * (north - centre)) * inverseSquares.y;

  let volumetricHeatCapacity = max(here.z, 1.0);
  let updated = centre + (params.dt / volumetricHeatCapacity) * divergence;
  textureStore(destinationTexture, coord, vec4<f32>(updated, 0.0, 0.0, 1.0));
}
`;

/** Size of the `BrushParams` uniform block, in bytes. */
export const BRUSH_PARAMS_BYTES = 32;

/**
 * The heat brush, as a pass over the whole field: cells outside the disc are
 * copied through, cells inside are pulled toward the brush temperature by a
 * smooth falloff. Identical arithmetic to `FieldEngineBase.applyBrushToMirror`,
 * so the mirror the probe reads stays in step with the texture until the next
 * readback anyway.
 */
export const BRUSH_SHADER = `
struct BrushParams {
  centre: vec2<f32>,
  radius: f32,
  temperature: f32,
  strength: f32,
  pad0: f32,
  pad1: f32,
  pad2: f32,
};

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var destinationTexture: texture_storage_2d<r32float, write>;
@group(0) @binding(2) var<uniform> brush: BrushParams;

@compute @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let size = textureDimensions(sourceTexture);
  if (id.x >= size.x || id.y >= size.y) {
    return;
  }
  let coord = vec2<i32>(i32(id.x), i32(id.y));
  let current = textureLoad(sourceTexture, coord, 0).r;

  let offset = vec2<f32>(f32(coord.x) + 0.5, f32(coord.y) + 0.5) - brush.centre;
  let normalized = dot(offset, offset) / max(brush.radius * brush.radius, 1e-6);

  var updated = current;
  if (normalized < 1.0) {
    let falloff = 1.0 - normalized;
    let weight = falloff * falloff * brush.strength;
    updated = current + (brush.temperature - current) * weight;
  }

  textureStore(destinationTexture, coord, vec4<f32>(updated, 0.0, 0.0, 1.0));
}
`;

/** Size of the `ParticleParams` uniform block, in bytes. */
export const PARTICLE_PARAMS_BYTES = 32;

/**
 * Tracer-particle advection. Particles live in a storage buffer as
 * (u, v, life, seed) and are respawned from a hash when they age out or leave
 * the domain, so the tracer density stays even in a flow with stagnation points.
 */
export const PARTICLE_COMPUTE_SHADER = `
struct Particle {
  position: vec2<f32>,
  life: f32,
  seed: f32,
};

struct ParticleParams {
  gridSize: vec2<u32>,
  dt: f32,
  flowScale: f32,
  physicalSize: vec2<f32>,
  lifetime: f32,
  count: u32,
};

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var velocityTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> params: ParticleParams;

/** PCG-style integer hash, then scaled into [0, 1). */
fn hashToUnit(input: u32) -> f32 {
  var state = input * 747796405u + 2891336453u;
  var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  word = (word >> 22u) ^ word;
  return f32(word) / 4294967296.0;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  if (index >= params.count) {
    return;
  }

  var particle = particles[index];
  let seedBits = bitcast<u32>(particle.seed) ^ (index * 2654435761u);

  particle.life = particle.life - params.dt;

  let cell = vec2<i32>(
    clamp(i32(particle.position.x * f32(params.gridSize.x)), 0, i32(params.gridSize.x) - 1),
    clamp(i32(particle.position.y * f32(params.gridSize.y)), 0, i32(params.gridSize.y) - 1),
  );
  let velocity = textureLoad(velocityTexture, cell, 0).xy * params.flowScale;
  let next = particle.position + velocity * params.dt / params.physicalSize;

  let expired = particle.life <= 0.0;
  let escaped = next.x < 0.0 || next.x > 1.0 || next.y < 0.0 || next.y > 1.0;

  if (expired || escaped) {
    let respawnSeed = seedBits ^ bitcast<u32>(particle.life) ^ 0x9e3779b9u;
    particle.position = vec2<f32>(hashToUnit(respawnSeed), hashToUnit(respawnSeed ^ 0x85ebca6bu));
    particle.life = params.lifetime;
    particle.seed = f32(respawnSeed & 0xffffu) / 65536.0;
  } else {
    particle.position = next;
  }

  particles[index] = particle;
}
`;
