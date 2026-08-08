/**
 * CpuFieldEngine.ts
 *
 * The reference backend: the same field model, evolved with {@link kernels} and
 * drawn with the 2-D canvas API.
 *
 * It exists for three reasons, in order of importance:
 *
 *   1. The simulation still runs where WebGPU does not — older browsers, locked
 *      down machines, software rendering.
 *   2. It is the executable specification of the physics. The WGSL shaders are
 *      written to reproduce these kernels, and the unit tests pin the kernels
 *      down, so the test suite indirectly constrains the shaders too.
 *   3. It makes the architectural claim falsifiable: if the model can drive both
 *      an array-of-floats backend and a texture backend without noticing, then
 *      the field abstraction really is the interface, not the GPU.
 *
 * It is deliberately capped at a coarse grid — see MAX_CPU_RESOLUTION — because
 * it runs on the main thread.
 */

import { AMBIENT_TEMPERATURE_K, PARTICLE_COUNT } from "../../../HeatTransferConstants.js";
import { FieldBackend, type FieldBackendId, type FieldEngineOptions, type FieldRenderStyle } from "../FieldEngine.js";
import { FieldEngineBase } from "../FieldEngineBase.js";
import type { LayerVisibility, TransportParameters } from "../FieldTypes.js";
import { advectStep, diffuseStep, type MaterialArrays } from "../kernels.js";
import type { SimulationDomain } from "../SimulationDomain.js";
import { CpuFieldRenderer } from "./CpuFieldRenderer.js";
import { CpuParticleSystem } from "./CpuParticleSystem.js";

export class CpuFieldEngine extends FieldEngineBase {
  public readonly backend: FieldBackendId = FieldBackend.CPU;

  /** The other half of the ping-pong. `temperatureMirror` is always the current field. */
  private readonly scratch: Float32Array;

  /** A second scratch buffer, so advection and diffusion can each write somewhere clean. */
  private readonly scratchB: Float32Array;

  private readonly particles: CpuParticleSystem;
  private readonly renderer: CpuFieldRenderer;

  /** Lazily allocated copy of the material arrays with conductivity scaled. */
  private scaledMaterialCache: MaterialArrays | null = null;

  /** Flow scale from the last step, so the renderer draws particles at the right speed. */
  private lastFlowScale = 1;

  public constructor(domain: SimulationDomain, options: FieldEngineOptions) {
    super(domain, options);
    this.scratch = new Float32Array(domain.cellCount);
    this.scratchB = new Float32Array(domain.cellCount);
    this.particles = new CpuParticleSystem(domain, PARTICLE_COUNT);
    this.renderer = new CpuFieldRenderer(domain, this.geometry, this.canvas);
  }

  // ── Evolving ────────────────────────────────────────────────────────────────

  public step(parameters: TransportParameters): number {
    this.boundary = parameters.boundaryCondition;
    this.lastFlowScale = parameters.flowScale;

    const substep = this.computeSubstep(parameters.flowScale, parameters.diffusionScale, parameters.diffusionEnabled);
    this.currentSubstep = substep;

    const doAdvection = parameters.advectionEnabled && parameters.flowScale > 0 && this.maxSpeed > 0;
    const doDiffusion = parameters.diffusionEnabled && parameters.diffusionScale > 0;

    let advanced = 0;
    for (let n = 0; n < parameters.substeps; n++) {
      // Operator splitting: transport first, then diffuse the transported field.
      let current = this.temperatureMirror;

      if (doAdvection) {
        advectStep(
          current,
          this.scratch,
          this.velocity,
          this.geometry,
          this.boundary,
          AMBIENT_TEMPERATURE_K,
          substep,
          parameters.flowScale,
        );
        current = this.scratch;
      }

      if (doDiffusion) {
        const target = current === this.temperatureMirror ? this.scratch : this.scratchB;
        diffuseStep(
          current,
          target,
          this.geometry,
          this.scaledMaterial(parameters.diffusionScale),
          this.boundary,
          AMBIENT_TEMPERATURE_K,
          substep,
        );
        current = target;
      }

      if (current !== this.temperatureMirror) {
        this.temperatureMirror.set(current);
      }

      advanced += substep;
    }

    if (doAdvection) {
      this.particles.step(this.velocity, advanced, parameters.flowScale);
    }

    this.elapsedTime += advanced;
    return advanced;
  }

  /**
   * The material arrays with conductivity multiplied by the diffusion control.
   *
   * The scale is applied to k rather than to alpha so that rho c_p — and
   * therefore the energy the field carries — is untouched: turning the
   * "diffusion" slider changes how fast heat spreads, not how much there is.
   */
  private scaledMaterial(scale: number): MaterialArrays {
    if (scale === 1) {
      return this.material;
    }
    const cells = this.domain.cellCount;
    const cache: MaterialArrays = this.scaledMaterialCache ?? {
      conductivityX: new Float32Array(cells),
      conductivityY: new Float32Array(cells),
      volumetricHeatCapacity: new Float32Array(cells),
    };
    this.scaledMaterialCache = cache;

    for (let index = 0; index < cells; index++) {
      cache.conductivityX[index] = (this.material.conductivityX[index] ?? 0) * scale;
      cache.conductivityY[index] = (this.material.conductivityY[index] ?? 0) * scale;
      cache.volumetricHeatCapacity[index] = this.material.volumetricHeatCapacity[index] ?? 1;
    }
    return cache;
  }

  // ── Drawing ─────────────────────────────────────────────────────────────────

  public render(layers: LayerVisibility, style: FieldRenderStyle): void {
    this.renderer.render(layers, style, {
      temperature: this.temperatureMirror,
      material: this.material,
      velocity: this.velocity,
      boundary: this.boundary,
      particles: this.particles,
      flowScale: this.lastFlowScale,
    });
  }

  // ── Backend hooks ───────────────────────────────────────────────────────────

  // The CPU backend keeps no second copy of anything, so these are all no-ops —
  // the base class has already written straight into the arrays it evolves.

  protected onMaterialChanged(): void {
    // Nothing to upload.
  }

  protected onVelocityChanged(): void {
    this.particles.reset();
  }

  protected onTemperaturePainted(): void {
    // Already applied to the mirror, which is the field.
  }

  protected onTemperatureReseeded(): void {
    this.particles.reset();
  }

  public dispose(): void {
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
}
