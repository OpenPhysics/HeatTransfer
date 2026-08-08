/**
 * common.ts
 *
 * WGSL fragments shared by every compute and render pass.
 *
 * Everything here mirrors a function in `kernels.ts` one-for-one — `fetchScalar`
 * is `fetchCell`, `bilinearScalar` is `bilinearSample`, `faceConductivity` is the
 * harmonic mean. Keeping the names aligned is deliberate: when the physics
 * changes, the two implementations have to change in the same places.
 *
 * All textures are float32 formats and are bound as `unfilterable-float`, so
 * every fetch is a `textureLoad` and interpolation is done by hand. That avoids
 * depending on the optional `float32-filterable` feature, which would make the
 * simulation refuse to start on otherwise perfectly capable hardware.
 */

/** Boundary condition ids, matching the order of `BOUNDARY_CONDITION_ORDER`. */
export const WGSL_BOUNDARY_CONSTANTS = `
const BOUNDARY_INSULATED: u32 = 0u;
const BOUNDARY_FIXED: u32 = 1u;
const BOUNDARY_PERIODIC: u32 = 2u;
`;

/** The uniform block every compute pass reads. Must match `SIM_PARAMS_BYTES`. */
export const WGSL_SIM_PARAMS = `
struct SimParams {
  gridSize: vec2<u32>,
  cellSize: vec2<f32>,
  dt: f32,
  flowScale: f32,
  diffusionScale: f32,
  boundary: u32,
  ambient: f32,
  pad0: f32,
  pad1: f32,
  pad2: f32,
};
`;

/** Size of the `SimParams` uniform block, in bytes. */
export const SIM_PARAMS_BYTES = 48;

/**
 * Boundary-aware index resolution.
 *
 * Returns the coordinate to sample, plus a flag saying "this is outside and the
 * boundary condition wants the ambient value instead". Three boundary conditions
 * with no ghost cells anywhere.
 */
export const WGSL_RESOLVE = `
struct Resolved {
  coord: vec2<i32>,
  outside: bool,
};

fn resolveCoord(coord: vec2<i32>, size: vec2<i32>, boundary: u32) -> Resolved {
  var out: Resolved;
  out.coord = coord;
  out.outside = false;

  if (coord.x < 0 || coord.x >= size.x || coord.y < 0 || coord.y >= size.y) {
    if (boundary == BOUNDARY_FIXED) {
      out.outside = true;
    } else if (boundary == BOUNDARY_PERIODIC) {
      out.coord = vec2<i32>(
        ((coord.x % size.x) + size.x) % size.x,
        ((coord.y % size.y) + size.y) % size.y,
      );
    } else {
      out.coord = clamp(coord, vec2<i32>(0, 0), size - vec2<i32>(1, 1));
    }
  }
  return out;
}
`;

/** Scalar fetch and bilinear interpolation against a boundary condition. */
export const WGSL_SAMPLE_SCALAR = `
fn fetchScalar(
  tex: texture_2d<f32>,
  coord: vec2<i32>,
  size: vec2<i32>,
  boundary: u32,
  ambient: f32,
) -> f32 {
  let resolved = resolveCoord(coord, size, boundary);
  if (resolved.outside) {
    return ambient;
  }
  return textureLoad(tex, resolved.coord, 0).r;
}

fn bilinearScalar(
  tex: texture_2d<f32>,
  gridPosition: vec2<f32>,
  size: vec2<i32>,
  boundary: u32,
  ambient: f32,
) -> f32 {
  let shifted = gridPosition - vec2<f32>(0.5, 0.5);
  let base = floor(shifted);
  let frac = shifted - base;
  let corner = vec2<i32>(base);

  let c00 = fetchScalar(tex, corner, size, boundary, ambient);
  let c10 = fetchScalar(tex, corner + vec2<i32>(1, 0), size, boundary, ambient);
  let c01 = fetchScalar(tex, corner + vec2<i32>(0, 1), size, boundary, ambient);
  let c11 = fetchScalar(tex, corner + vec2<i32>(1, 1), size, boundary, ambient);

  return mix(mix(c00, c10, frac.x), mix(c01, c11, frac.x), frac.y);
}
`;

/**
 * Material lookup. The material field always extends outward by clamping,
 * independently of the temperature boundary condition — a plate does not stop
 * being copper because the temperature wraps.
 *
 * Channels are (k_x, k_y, rho c_p, unused).
 */
export const WGSL_SAMPLE_MATERIAL = `
fn fetchMaterial(tex: texture_2d<f32>, coord: vec2<i32>, size: vec2<i32>) -> vec4<f32> {
  let clamped = clamp(coord, vec2<i32>(0, 0), size - vec2<i32>(1, 1));
  return textureLoad(tex, clamped, 0);
}

fn faceConductivity(a: f32, b: f32) -> f32 {
  let total = a + b;
  if (total > 0.0) {
    return 2.0 * a * b / total;
  }
  return 0.0;
}
`;

/** Central-difference gradient of the temperature field, in K/m. */
export const WGSL_GRADIENT = `
fn temperatureGradient(
  tex: texture_2d<f32>,
  coord: vec2<i32>,
  size: vec2<i32>,
  cellSize: vec2<f32>,
  boundary: u32,
  ambient: f32,
) -> vec2<f32> {
  let east = fetchScalar(tex, coord + vec2<i32>(1, 0), size, boundary, ambient);
  let west = fetchScalar(tex, coord - vec2<i32>(1, 0), size, boundary, ambient);
  let south = fetchScalar(tex, coord + vec2<i32>(0, 1), size, boundary, ambient);
  let north = fetchScalar(tex, coord - vec2<i32>(0, 1), size, boundary, ambient);
  return vec2<f32>((east - west) / (2.0 * cellSize.x), (south - north) / (2.0 * cellSize.y));
}
`;

/** Everything a compute pass needs, concatenated. */
export const WGSL_COMPUTE_PRELUDE = [
  WGSL_BOUNDARY_CONSTANTS,
  WGSL_SIM_PARAMS,
  WGSL_RESOLVE,
  WGSL_SAMPLE_SCALAR,
  WGSL_SAMPLE_MATERIAL,
  WGSL_GRADIENT,
].join("\n");

/** Workgroup edge length used by every 2-D compute pass. */
export const WORKGROUP_SIZE = 8;
