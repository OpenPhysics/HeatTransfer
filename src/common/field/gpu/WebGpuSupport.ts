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

import { RESOLUTION_PRESETS, type ResolutionPresetId } from "../../../HeatTransferConstants.js";

export type WebGpuContext = {
  adapter: GPUAdapter;
  device: GPUDevice;
  /** The format the canvas should be configured with. */
  presentationFormat: GPUTextureFormat;
  /** Largest square grid this device's limits allow. */
  maxGridSize: number;
};

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

/**
 * The finest preset a given device can actually allocate. A 2048 grid needs a
 * 2048-wide texture, which is below every conformant WebGPU limit, but the check
 * costs nothing and keeps the preset list honest on unusual hardware.
 */
export function largestSupportedPreset(
  presets: readonly ResolutionPresetId[],
  maxGridSize: number,
): ResolutionPresetId | null {
  let best: ResolutionPresetId | null = null;
  for (const preset of presets) {
    if (RESOLUTION_PRESETS[preset] <= maxGridSize) {
      best = preset;
    }
  }
  return best;
}
