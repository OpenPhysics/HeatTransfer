/**
 * GpuContext.ts
 *
 * One device for the whole simulation, acquired once before the first screen is
 * built.
 *
 * Screens create their field engines lazily — SceneryStack only calls a screen's
 * model factory when the student first opens it — and a model factory cannot
 * await. So the single genuinely asynchronous step, "do we have a working GPU?",
 * is hoisted out of the model layer and answered here during startup, while the
 * splash screen is still up. After {@link initializeGpuContext} resolves,
 * building a field engine is an ordinary synchronous constructor call.
 *
 * "Working" means more than "a device was returned". WGSL compilation is
 * asynchronous and does *not* throw from `createShaderModule`, so a shader that
 * fails to compile on some driver would otherwise surface as a silently black
 * canvas. Every shader is therefore compiled and checked here, once, and any
 * error demotes the whole simulation to the CPU backend before a student sees
 * anything.
 */

import { ADVECT_SHADER, BRUSH_SHADER, DIFFUSE_SHADER, PARTICLE_COMPUTE_SHADER } from "./shaders/compute.js";
import { ARROW_RENDER_SHADER, FIELD_RENDER_SHADER, PARTICLE_RENDER_SHADER } from "./shaders/render.js";
import { requestWebGpuContext, type WebGpuContext } from "./WebGpuSupport.js";

/** Why the simulation is not using the GPU, when it is not. */
export const GpuUnavailableReason = {
  /** The browser has no `navigator.gpu`, or no adapter/device could be acquired. */
  NO_DEVICE: "noDevice",
  /** A shader failed to compile on this device. */
  SHADER_ERROR: "shaderError",
  /** The device works, but its canvas output cannot be composited into Scenery. */
  PRESENTATION: "presentation",
  /** The user asked for the CPU backend explicitly. */
  FORCED: "forced",
} as const;

export type GpuUnavailableReasonId = (typeof GpuUnavailableReason)[keyof typeof GpuUnavailableReason];

export type GpuInitializationResult = {
  context: WebGpuContext | null;
  reason: GpuUnavailableReasonId | null;
  /** Compiler diagnostics, when a shader failed. Shown in the About/preferences UI, not thrown. */
  diagnostics: readonly string[];
};

let cached: GpuInitializationResult | null = null;

/** The result of the one-time initialization, or null if it has not run yet. */
export function getGpuInitialization(): GpuInitializationResult | null {
  return cached;
}

/** The device, if the simulation has one. */
export function getGpuContext(): WebGpuContext | null {
  return cached?.context ?? null;
}

/**
 * Acquires and validates the device. Safe to call more than once; the first
 * result is cached and returned thereafter.
 *
 * @param forceCpu - skip WebGPU entirely, for the `forceCpu` query parameter
 */
export async function initializeGpuContext(forceCpu: boolean): Promise<GpuInitializationResult> {
  if (cached) {
    return cached;
  }

  if (forceCpu) {
    cached = { context: null, reason: GpuUnavailableReason.FORCED, diagnostics: [] };
    return cached;
  }

  const context = await requestWebGpuContext();
  if (!context) {
    cached = { context: null, reason: GpuUnavailableReason.NO_DEVICE, diagnostics: [] };
    return cached;
  }

  const diagnostics = await compileAllShaders(context.device);
  if (diagnostics.length > 0) {
    context.device.destroy();
    cached = { context: null, reason: GpuUnavailableReason.SHADER_ERROR, diagnostics };
    return cached;
  }

  if (!canPresentToCanvas(context.device, context.presentationFormat)) {
    context.device.destroy();
    cached = { context: null, reason: GpuUnavailableReason.PRESENTATION, diagnostics: [] };
    return cached;
  }

  cached = { context, reason: null, diagnostics: [] };
  return cached;
}

/** Resets the cache. Test-only; the simulation acquires a device exactly once. */
export function resetGpuContextForTesting(): void {
  cached = null;
}

/** Edge length of the throwaway canvas used by the presentation check. */
const PRESENTATION_PROBE_SIZE = 4;

/**
 * Whether a WebGPU canvas's output can actually be composited into Scenery.
 *
 * The field reaches the scene graph as a Scenery `Image` wrapping the engine's
 * canvas, which means the browser has to be able to `drawImage` a WebGPU-backed
 * canvas into a 2-D one. That works on hardware, but not on every software
 * rasterizer: some configurations happily create a device, compile every shader,
 * and run compute passes correctly while presenting nothing a 2-D context can
 * read. Without this check the symptom is a completely blank field with no error
 * anywhere — strictly worse than the CPU fallback, which at least draws.
 *
 * So: clear a 4 x 4 canvas to an unmistakable colour, copy it, and look. If the
 * pixel does not survive the trip, the device is unusable *for this simulation*
 * however well it computes, and we take the CPU path.
 */
function canPresentToCanvas(device: GPUDevice, format: GPUTextureFormat): boolean {
  try {
    const source = document.createElement("canvas");
    source.width = PRESENTATION_PROBE_SIZE;
    source.height = PRESENTATION_PROBE_SIZE;
    const gpuContext = source.getContext("webgpu");
    if (!gpuContext) {
      return false;
    }
    gpuContext.configure({ device, format, alphaMode: "opaque" });

    const encoder = device.createCommandEncoder({ label: "presentationProbe" });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: gpuContext.getCurrentTexture().createView(),
          clearValue: { r: 1, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.end();
    device.queue.submit([encoder.finish()]);

    const destination = document.createElement("canvas");
    destination.width = PRESENTATION_PROBE_SIZE;
    destination.height = PRESENTATION_PROBE_SIZE;
    const context2d = destination.getContext("2d", { willReadFrequently: true });
    if (!context2d) {
      return false;
    }
    context2d.drawImage(source, 0, 0);

    const pixel = context2d.getImageData(1, 1, 1, 1).data;
    // Red and opaque is what was cleared; anything else means it did not arrive.
    return (pixel[0] ?? 0) > 200 && (pixel[3] ?? 0) > 200;
  } catch {
    return false;
  }
}

/**
 * Compiles every shader and returns the error messages, if any.
 *
 * `getCompilationInfo()` is the only reliable way to see a WGSL error: shader
 * module creation never rejects, and the resulting pipeline would just draw
 * nothing.
 */
async function compileAllShaders(device: GPUDevice): Promise<string[]> {
  const sources: Record<string, string> = {
    advect: ADVECT_SHADER,
    diffuse: DIFFUSE_SHADER,
    brush: BRUSH_SHADER,
    particleCompute: PARTICLE_COMPUTE_SHADER,
    fieldRender: FIELD_RENDER_SHADER,
    arrowRender: ARROW_RENDER_SHADER,
    particleRender: PARTICLE_RENDER_SHADER,
  };

  const problems: string[] = [];
  const checks = Object.entries(sources).map(async ([label, code]) => {
    const module = device.createShaderModule({ label, code });
    const info = await module.getCompilationInfo();
    for (const message of info.messages) {
      if (message.type === "error") {
        problems.push(`${label}:${message.lineNum}:${message.linePos} ${message.message}`);
      }
    }
  });

  await Promise.all(checks);
  return problems;
}
