/**
 * WebGpuSupport.ts
 *
 * Device acquisition, kept separate from the engine so that "can we run on the
 * GPU?" is a question with one answer in one place.
 *
 * Nothing here throws: every failure mode — no `navigator.gpu`, no adapter, a
 * device request that rejects, a device that is lost a second later — resolves to
 * `null` so the caller can fall back to the CPU backend without a try/catch
 * around half the application.
 */

export type WebGpuContext = {
  adapter: GPUAdapter;
  device: GPUDevice;
  /** The format the canvas should be configured with. */
  presentationFormat: GPUTextureFormat;
  /** Largest square grid this device's limits allow. */
  maxGridSize: number;
};

/**
 * `canvas.getContext("webgpu")`, typed.
 *
 * TypeScript 7's DOM lib has every WebGPU interface but no `"webgpu"` overload on
 * `getContext`, and augmenting `HTMLCanvasElement` to add one would reorder
 * overload resolution for every other caller. One cast, in one place, is the
 * smaller cost.
 */
export function requestCanvasContext(canvas: HTMLCanvasElement): GPUCanvasContext | null {
  return (canvas.getContext("webgpu") as unknown as GPUCanvasContext | null) ?? null;
}

/** Whether this browser exposes the WebGPU entry point at all. */
export function isWebGpuAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator && Boolean(navigator.gpu);
}

/**
 * Requests an adapter and device.
 *
 * @param onDeviceLost - called if the device is lost after a successful start, so
 *   the simulation can rebuild on the CPU backend rather than freezing.
 */
export async function requestWebGpuContext(onDeviceLost?: (reason: string) => void): Promise<WebGpuContext | null> {
  if (!isWebGpuAvailable()) {
    return null;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) {
      return null;
    }

    const device = await adapter.requestDevice({
      requiredLimits: {
        maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
        maxStorageTexturesPerShaderStage: Math.min(4, adapter.limits.maxStorageTexturesPerShaderStage),
      },
    });

    if (onDeviceLost) {
      device.lost.then((info) => {
        // A destroyed device is an ordinary part of teardown, not a failure.
        if (info.reason !== "destroyed") {
          onDeviceLost(info.message || info.reason);
        }
      });
    }

    return {
      adapter,
      device,
      presentationFormat: navigator.gpu.getPreferredCanvasFormat(),
      maxGridSize: device.limits.maxTextureDimension2D,
    };
  } catch {
    // Adapter or device request failed (blocklisted driver, headless, …).
    return null;
  }
}
