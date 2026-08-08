/**
 * createFieldEngine.ts
 *
 * Builds a field engine for a screen.
 *
 * Synchronous by design: {@link initializeGpuContext} has already answered the
 * only asynchronous question during startup, so a screen's model factory can
 * construct its engine inline. The resolution is clamped to what the chosen
 * backend can actually carry, so asking for a 2048 grid on the CPU fallback
 * quietly yields a coarse grid rather than a frozen tab — and the caller is told
 * what it actually got, so the UI can say so instead of silently lying about the
 * resolution.
 */

import {
  DEFAULT_RESOLUTION,
  MAX_CPU_RESOLUTION,
  RESOLUTION_PRESETS,
  type ResolutionPresetId,
} from "../../HeatTransferConstants.js";
import { CpuFieldEngine } from "./cpu/CpuFieldEngine.js";
import { FieldBackend, type FieldBackendId, type FieldEngine } from "./FieldEngine.js";
import { getGpuContext } from "./gpu/GpuContext.js";
import { WebGpuFieldEngine } from "./gpu/WebGpuFieldEngine.js";
import { SimulationDomain } from "./SimulationDomain.js";

export type CreateFieldEngineOptions = {
  /** Grid resolution the caller would like. May be reduced to fit the backend. */
  resolution?: ResolutionPresetId;
  /** Edge length of the square backing canvas, in device pixels. */
  displaySize: number;
};

export type FieldEngineCreation = {
  engine: FieldEngine;
  backend: FieldBackendId;
  /** Cells per side actually allocated, which may be fewer than requested. */
  effectiveResolution: number;
  /** True when the resolution had to be reduced to fit the backend. */
  resolutionReduced: boolean;
};

export function createFieldEngine(options: CreateFieldEngineOptions): FieldEngineCreation {
  const requestedCells = RESOLUTION_PRESETS[options.resolution ?? DEFAULT_RESOLUTION];
  const gpu = getGpuContext();

  if (gpu) {
    const cells = Math.min(requestedCells, gpu.maxGridSize);
    const domain = new SimulationDomain(cells, cells);
    return {
      engine: new WebGpuFieldEngine(domain, { displaySize: options.displaySize }, gpu),
      backend: FieldBackend.WEBGPU,
      effectiveResolution: cells,
      resolutionReduced: cells < requestedCells,
    };
  }

  const cells = Math.min(requestedCells, MAX_CPU_RESOLUTION);
  const domain = new SimulationDomain(cells, cells);
  return {
    engine: new CpuFieldEngine(domain, { displaySize: options.displaySize }),
    backend: FieldBackend.CPU,
    effectiveResolution: cells,
    resolutionReduced: cells < requestedCells,
  };
}
