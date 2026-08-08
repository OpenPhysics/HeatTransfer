/**
 * WebGpuFieldEngine.ts
 *
 * The primary backend: the temperature field is a GPU texture, compute shaders
 * evolve it, render pipelines draw it, and the CPU only ever authors inputs and
 * reads back samples.
 *
 * Resources
 * ─────────
 *   temperature[2]  r32float     ping-pong pair, the only GPU-owned state
 *   velocity        rg32float    CPU-authored from an analytic preset
 *   material        rgba32float  CPU-authored: (k_x, k_y, rho c_p, unused)
 *   particles       storage buf  (u, v, life, seed) per tracer
 *
 * A timestep is `substeps` iterations of advect → swap → diffuse → swap, all
 * recorded into a single command buffer so the whole frame is one submission
 * regardless of how many substeps it takes. Brush strokes are a further pass over
 * the same pair.
 *
 * Reading back
 * ────────────
 * The probe, legend, cross-section graph, and statistics all read the CPU mirror
 * in `FieldEngineBase`, which is refreshed from the GPU every
 * {@link READBACK_FRAME_INTERVAL} frames via `copyTextureToBuffer` + `mapAsync`.
 * That is a deliberate trade: a synchronous read would stall the pipeline every
 * frame, and a probe that is a few tens of milliseconds behind is not something a
 * student can perceive. Brush strokes are applied to the mirror immediately as
 * well as to the texture, so painting still feels instant.
 */

import {
  AMBIENT_TEMPERATURE_K,
  FLUX_ARROW_COUNT,
  MAX_ARROW_LENGTH_FRACTION,
  PARTICLE_COUNT,
  PARTICLE_LIFETIME_S,
  READBACK_FRAME_INTERVAL,
} from "../../../HeatTransferConstants.js";
import { FieldBackend, type FieldBackendId, type FieldEngineOptions, type FieldRenderStyle } from "../FieldEngine.js";
import { FieldEngineBase } from "../FieldEngineBase.js";
import {
  BOUNDARY_CONDITION_ORDER,
  type BrushStroke,
  type LayerVisibility,
  type TransportParameters,
} from "../FieldTypes.js";
import { gradientAt } from "../kernels.js";
import { MAX_PRESET_CONDUCTIVITY, MIN_PRESET_CONDUCTIVITY } from "../Materials.js";
import type { SimulationDomain } from "../SimulationDomain.js";
import { SIM_PARAMS_BYTES, WORKGROUP_SIZE } from "./shaders/common.js";
import {
  ADVECT_SHADER,
  BRUSH_PARAMS_BYTES,
  BRUSH_SHADER,
  DIFFUSE_SHADER,
  PARTICLE_COMPUTE_SHADER,
  PARTICLE_PARAMS_BYTES,
} from "./shaders/compute.js";
import {
  ARROW_PARAMS_BYTES,
  ARROW_RENDER_SHADER,
  ARROW_VERTEX_COUNT,
  FIELD_RENDER_SHADER,
  LAYER_BIT,
  PARTICLE_RENDER_PARAMS_BYTES,
  PARTICLE_RENDER_SHADER,
  PARTICLE_VERTEX_COUNT,
  RENDER_PARAMS_BYTES,
} from "./shaders/render.js";
import type { WebGpuContext } from "./WebGpuSupport.js";

/** Index into the ping-pong pair. Typed as a literal union so tuple reads are exact. */
type PingPongIndex = 0 | 1;

/** Floats per particle in the storage buffer: (u, v, life, seed). */
const PARTICLE_STRIDE = 4;

/** Radius of a tracer particle in clip-space units. */
const PARTICLE_CLIP_SIZE = 0.006;

export class WebGpuFieldEngine extends FieldEngineBase {
  public readonly backend: FieldBackendId = FieldBackend.WEBGPU;

  private readonly device: GPUDevice;
  private readonly context: GPUCanvasContext;

  // ── Resources ───────────────────────────────────────────────────────────────

  private readonly temperatureTextures: [GPUTexture, GPUTexture];
  private readonly temperatureViews: [GPUTextureView, GPUTextureView];
  private readonly velocityTexture: GPUTexture;
  private readonly materialTexture: GPUTexture;
  private readonly particleBuffer: GPUBuffer;
  private readonly readbackBuffer: GPUBuffer;

  private readonly simParamsBuffer: GPUBuffer;
  private readonly brushParamsBuffer: GPUBuffer;
  private readonly particleParamsBuffer: GPUBuffer;
  private readonly renderParamsBuffer: GPUBuffer;
  private readonly arrowParamsBuffer: GPUBuffer;
  private readonly particleRenderParamsBuffer: GPUBuffer;

  // ── Pipelines ───────────────────────────────────────────────────────────────

  private readonly advectPipeline: GPUComputePipeline;
  private readonly diffusePipeline: GPUComputePipeline;
  private readonly brushPipeline: GPUComputePipeline;
  private readonly particlePipeline: GPUComputePipeline;
  private readonly fieldPipeline: GPURenderPipeline;
  private readonly arrowPipeline: GPURenderPipeline;
  private readonly particleRenderPipeline: GPURenderPipeline;

  // ── Bind groups (index 0 reads texture A, index 1 reads texture B) ──────────

  private readonly advectBindGroups: [GPUBindGroup, GPUBindGroup];
  private readonly diffuseBindGroups: [GPUBindGroup, GPUBindGroup];
  private readonly brushBindGroups: [GPUBindGroup, GPUBindGroup];
  private readonly particleBindGroup: GPUBindGroup;
  private readonly fieldBindGroups: [GPUBindGroup, GPUBindGroup];
  private readonly arrowBindGroups: [GPUBindGroup, GPUBindGroup];
  private readonly particleRenderBindGroup: GPUBindGroup;

  /** Which of the ping-pong textures currently holds the field. */
  private current: PingPongIndex = 0;

  private frameCounter = 0;
  private readbackInFlight = false;
  private disposed = false;

  /** Scratch typed arrays for uniform writes, so stepping allocates nothing. */
  private readonly simParamsData = new ArrayBuffer(SIM_PARAMS_BYTES);
  private readonly simParamsView = new DataView(this.simParamsData);
  private readonly brushParamsData = new Float32Array(BRUSH_PARAMS_BYTES / 4);
  private readonly particleParamsData = new ArrayBuffer(PARTICLE_PARAMS_BYTES);
  private readonly particleParamsView = new DataView(this.particleParamsData);
  private readonly renderParamsData = new ArrayBuffer(RENDER_PARAMS_BYTES);
  private readonly renderParamsView = new DataView(this.renderParamsData);
  private readonly arrowParamsData = new ArrayBuffer(ARROW_PARAMS_BYTES);
  private readonly arrowParamsView = new DataView(this.arrowParamsData);
  private readonly particleRenderParamsData = new Float32Array(PARTICLE_RENDER_PARAMS_BYTES / 4);

  public constructor(domain: SimulationDomain, options: FieldEngineOptions, gpu: WebGpuContext) {
    super(domain, options);

    this.device = gpu.device;
    const context = this.canvas.getContext("webgpu");
    if (!context) {
      throw new Error("WebGpuFieldEngine: canvas did not provide a webgpu context");
    }
    this.context = context;
    this.context.configure({
      device: gpu.device,
      format: gpu.presentationFormat,
      alphaMode: "premultiplied",
    });

    const { device } = this;
    const { gridWidth, gridHeight } = domain;
    const size = { width: gridWidth, height: gridHeight };

    // ── Textures ──────────────────────────────────────────────────────────────

    const makeTemperature = (label: string): GPUTexture =>
      device.createTexture({
        label,
        size,
        format: "r32float",
        usage:
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.COPY_DST,
      });

    this.temperatureTextures = [makeTemperature("temperatureA"), makeTemperature("temperatureB")];
    this.temperatureViews = [this.temperatureTextures[0].createView(), this.temperatureTextures[1].createView()];

    this.velocityTexture = device.createTexture({
      label: "velocity",
      size,
      format: "rg32float",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    this.materialTexture = device.createTexture({
      label: "material",
      size,
      format: "rgba32float",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    // ── Buffers ───────────────────────────────────────────────────────────────

    this.particleBuffer = device.createBuffer({
      label: "particles",
      size: PARTICLE_COUNT * PARTICLE_STRIDE * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.readbackBuffer = device.createBuffer({
      label: "temperatureReadback",
      size: gridWidth * gridHeight * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const uniform = (label: string, bytes: number): GPUBuffer =>
      device.createBuffer({ label, size: bytes, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    this.simParamsBuffer = uniform("simParams", SIM_PARAMS_BYTES);
    this.brushParamsBuffer = uniform("brushParams", BRUSH_PARAMS_BYTES);
    this.particleParamsBuffer = uniform("particleParams", PARTICLE_PARAMS_BYTES);
    this.renderParamsBuffer = uniform("renderParams", RENDER_PARAMS_BYTES);
    this.arrowParamsBuffer = uniform("arrowParams", ARROW_PARAMS_BYTES);
    this.particleRenderParamsBuffer = uniform("particleRenderParams", PARTICLE_RENDER_PARAMS_BYTES);

    // ── Bind group layouts ────────────────────────────────────────────────────
    //
    // Explicit rather than "auto": every field texture is a 32-bit float format,
    // which can only be bound as `unfilterable-float`. An inferred layout would
    // ask for a filterable float and fail validation on hardware that does not
    // advertise the optional `float32-filterable` feature — that is, most of it.

    const computeTransportLayout = device.createBindGroupLayout({
      label: "transport",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: "unfilterable-float" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: { access: "write-only", format: "r32float" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: "unfilterable-float" },
        },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      ],
    });

    const brushLayout = device.createBindGroupLayout({
      label: "brush",
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float" } },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: { access: "write-only", format: "r32float" },
        },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      ],
    });

    const particleLayout = device.createBindGroupLayout({
      label: "particleCompute",
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float" } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      ],
    });

    const fieldLayout = device.createBindGroupLayout({
      label: "fieldRender",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });

    const arrowLayout = device.createBindGroupLayout({
      label: "arrowRender",
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, texture: { sampleType: "unfilterable-float" } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, texture: { sampleType: "unfilterable-float" } },
        {
          binding: 2,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    const particleRenderLayout = device.createBindGroupLayout({
      label: "particleRender",
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    // ── Pipelines ─────────────────────────────────────────────────────────────

    const computePipeline = (label: string, code: string, layout: GPUBindGroupLayout): GPUComputePipeline =>
      device.createComputePipeline({
        label,
        layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        compute: { module: device.createShaderModule({ label, code }), entryPoint: "main" },
      });

    this.advectPipeline = computePipeline("advect", ADVECT_SHADER, computeTransportLayout);
    this.diffusePipeline = computePipeline("diffuse", DIFFUSE_SHADER, computeTransportLayout);
    this.brushPipeline = computePipeline("brush", BRUSH_SHADER, brushLayout);
    this.particlePipeline = computePipeline("particles", PARTICLE_COMPUTE_SHADER, particleLayout);

    const alphaBlend: GPUBlendState = {
      color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
      alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
    };

    const renderPipeline = (
      label: string,
      code: string,
      layout: GPUBindGroupLayout,
      blend: GPUBlendState | undefined,
    ): GPURenderPipeline => {
      const module = device.createShaderModule({ label, code });
      return device.createRenderPipeline({
        label,
        layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        vertex: { module, entryPoint: "vertexMain" },
        fragment: {
          module,
          entryPoint: "fragmentMain",
          targets: [blend ? { format: gpu.presentationFormat, blend } : { format: gpu.presentationFormat }],
        },
        primitive: { topology: "triangle-list" },
      });
    };

    this.fieldPipeline = renderPipeline("fieldRender", FIELD_RENDER_SHADER, fieldLayout, undefined);
    this.arrowPipeline = renderPipeline("arrowRender", ARROW_RENDER_SHADER, arrowLayout, alphaBlend);
    this.particleRenderPipeline = renderPipeline(
      "particleRender",
      PARTICLE_RENDER_SHADER,
      particleRenderLayout,
      alphaBlend,
    );

    // ── Bind groups ───────────────────────────────────────────────────────────

    const transportGroup = (read: PingPongIndex, auxiliary: GPUTexture): GPUBindGroup =>
      device.createBindGroup({
        layout: computeTransportLayout,
        entries: [
          { binding: 0, resource: this.temperatureViews[read] },
          { binding: 1, resource: this.temperatureViews[read === 0 ? 1 : 0] },
          { binding: 2, resource: auxiliary.createView() },
          { binding: 3, resource: { buffer: this.simParamsBuffer } },
        ],
      });

    this.advectBindGroups = [transportGroup(0, this.velocityTexture), transportGroup(1, this.velocityTexture)];
    this.diffuseBindGroups = [transportGroup(0, this.materialTexture), transportGroup(1, this.materialTexture)];

    const brushGroup = (read: PingPongIndex): GPUBindGroup =>
      device.createBindGroup({
        layout: brushLayout,
        entries: [
          { binding: 0, resource: this.temperatureViews[read] },
          { binding: 1, resource: this.temperatureViews[read === 0 ? 1 : 0] },
          { binding: 2, resource: { buffer: this.brushParamsBuffer } },
        ],
      });
    this.brushBindGroups = [brushGroup(0), brushGroup(1)];

    this.particleBindGroup = device.createBindGroup({
      layout: particleLayout,
      entries: [
        { binding: 0, resource: { buffer: this.particleBuffer } },
        { binding: 1, resource: this.velocityTexture.createView() },
        { binding: 2, resource: { buffer: this.particleParamsBuffer } },
      ],
    });

    const readGroup = (layout: GPUBindGroupLayout, read: PingPongIndex, buffer: GPUBuffer): GPUBindGroup =>
      device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: this.temperatureViews[read] },
          { binding: 1, resource: this.materialTexture.createView() },
          { binding: 2, resource: { buffer } },
        ],
      });

    this.fieldBindGroups = [
      readGroup(fieldLayout, 0, this.renderParamsBuffer),
      readGroup(fieldLayout, 1, this.renderParamsBuffer),
    ];
    this.arrowBindGroups = [
      readGroup(arrowLayout, 0, this.arrowParamsBuffer),
      readGroup(arrowLayout, 1, this.arrowParamsBuffer),
    ];

    this.particleRenderBindGroup = device.createBindGroup({
      layout: particleRenderLayout,
      entries: [
        { binding: 0, resource: { buffer: this.particleBuffer } },
        { binding: 1, resource: { buffer: this.particleRenderParamsBuffer } },
      ],
    });

    // ── Initial upload ────────────────────────────────────────────────────────

    this.uploadMaterial();
    this.uploadVelocity();
    this.uploadTemperature();
    this.uploadParticles();
  }

  // ── Uploads ─────────────────────────────────────────────────────────────────

  private uploadTemperature(): void {
    const { gridWidth, gridHeight } = this.domain;
    this.device.queue.writeTexture(
      { texture: this.temperatureTextures[this.current] },
      this.temperatureMirror,
      { bytesPerRow: gridWidth * 4, rowsPerImage: gridHeight },
      { width: gridWidth, height: gridHeight },
    );
  }

  private uploadVelocity(): void {
    const { gridWidth, gridHeight } = this.domain;
    this.device.queue.writeTexture(
      { texture: this.velocityTexture },
      this.velocity,
      { bytesPerRow: gridWidth * 8, rowsPerImage: gridHeight },
      { width: gridWidth, height: gridHeight },
    );
  }

  private uploadMaterial(): void {
    const { gridWidth, gridHeight, cellCount } = this.domain;
    const packed = new Float32Array(cellCount * 4);
    for (let index = 0; index < cellCount; index++) {
      packed[4 * index] = this.material.conductivityX[index] ?? 0;
      packed[4 * index + 1] = this.material.conductivityY[index] ?? 0;
      packed[4 * index + 2] = this.material.volumetricHeatCapacity[index] ?? 1;
      packed[4 * index + 3] = 0;
    }
    this.device.queue.writeTexture(
      { texture: this.materialTexture },
      packed,
      { bytesPerRow: gridWidth * 16, rowsPerImage: gridHeight },
      { width: gridWidth, height: gridHeight },
    );
  }

  private uploadParticles(): void {
    const data = new Float32Array(PARTICLE_COUNT * PARTICLE_STRIDE);
    for (let n = 0; n < PARTICLE_COUNT; n++) {
      data[PARTICLE_STRIDE * n] = Math.random();
      data[PARTICLE_STRIDE * n + 1] = Math.random();
      data[PARTICLE_STRIDE * n + 2] = Math.random() * PARTICLE_LIFETIME_S;
      data[PARTICLE_STRIDE * n + 3] = Math.random();
    }
    this.device.queue.writeBuffer(this.particleBuffer, 0, data);
  }

  // ── Backend hooks ───────────────────────────────────────────────────────────

  protected onMaterialChanged(): void {
    this.uploadMaterial();
  }

  protected onVelocityChanged(): void {
    this.uploadVelocity();
  }

  protected onTemperaturePainted(stroke: BrushStroke): void {
    // The mirror already has the stroke (the base class applied it); run the same
    // arithmetic on the texture so the GPU state matches without a full upload.
    const radiusCells = stroke.radius * Math.min(this.domain.gridWidth, this.domain.gridHeight);
    this.brushParamsData[0] = stroke.u * this.domain.gridWidth;
    this.brushParamsData[1] = stroke.v * this.domain.gridHeight;
    this.brushParamsData[2] = radiusCells;
    this.brushParamsData[3] = stroke.temperature;
    this.brushParamsData[4] = stroke.strength;
    this.device.queue.writeBuffer(this.brushParamsBuffer, 0, this.brushParamsData);

    const encoder = this.device.createCommandEncoder({ label: "brush" });
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.brushPipeline);
    pass.setBindGroup(0, this.brushBindGroups[this.current]);
    pass.dispatchWorkgroups(this.workgroupsX(), this.workgroupsY());
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    this.current = this.current === 0 ? 1 : 0;
  }

  protected onTemperatureReseeded(): void {
    this.uploadTemperature();
    this.uploadParticles();
  }

  private workgroupsX(): number {
    return Math.ceil(this.domain.gridWidth / WORKGROUP_SIZE);
  }

  private workgroupsY(): number {
    return Math.ceil(this.domain.gridHeight / WORKGROUP_SIZE);
  }

  // ── Stepping ────────────────────────────────────────────────────────────────

  public step(parameters: TransportParameters): number {
    if (this.disposed) {
      return 0;
    }

    this.boundary = parameters.boundaryCondition;
    const substep = this.computeSubstep(parameters.flowScale, parameters.diffusionScale, parameters.diffusionEnabled);
    this.currentSubstep = substep;

    const doAdvection = parameters.advectionEnabled && parameters.flowScale > 0 && this.maxSpeed > 0;
    const doDiffusion = parameters.diffusionEnabled && parameters.diffusionScale > 0;
    if (!(doAdvection || doDiffusion)) {
      return 0;
    }

    this.writeSimParams(substep, parameters);

    const encoder = this.device.createCommandEncoder({ label: "step" });
    const pass = encoder.beginComputePass({ label: "transport" });
    const groupsX = this.workgroupsX();
    const groupsY = this.workgroupsY();

    for (let n = 0; n < parameters.substeps; n++) {
      if (doAdvection) {
        pass.setPipeline(this.advectPipeline);
        pass.setBindGroup(0, this.advectBindGroups[this.current]);
        pass.dispatchWorkgroups(groupsX, groupsY);
        this.current = this.current === 0 ? 1 : 0;
      }
      if (doDiffusion) {
        pass.setPipeline(this.diffusePipeline);
        pass.setBindGroup(0, this.diffuseBindGroups[this.current]);
        pass.dispatchWorkgroups(groupsX, groupsY);
        this.current = this.current === 0 ? 1 : 0;
      }
    }
    pass.end();

    const advanced = substep * parameters.substeps;

    if (doAdvection) {
      this.writeParticleParams(advanced, parameters.flowScale);
      const particlePass = encoder.beginComputePass({ label: "particles" });
      particlePass.setPipeline(this.particlePipeline);
      particlePass.setBindGroup(0, this.particleBindGroup);
      particlePass.dispatchWorkgroups(Math.ceil(PARTICLE_COUNT / 64));
      particlePass.end();
    }

    this.device.queue.submit([encoder.finish()]);

    this.elapsedTime += advanced;
    this.frameCounter++;
    if (this.frameCounter % READBACK_FRAME_INTERVAL === 0) {
      this.requestReadback();
    }

    return advanced;
  }

  private writeSimParams(substep: number, parameters: TransportParameters): void {
    const view = this.simParamsView;
    view.setUint32(0, this.domain.gridWidth, true);
    view.setUint32(4, this.domain.gridHeight, true);
    view.setFloat32(8, this.domain.dx, true);
    view.setFloat32(12, this.domain.dy, true);
    view.setFloat32(16, substep, true);
    view.setFloat32(20, parameters.flowScale, true);
    view.setFloat32(24, parameters.diffusionScale, true);
    view.setUint32(28, BOUNDARY_CONDITION_ORDER.indexOf(parameters.boundaryCondition), true);
    view.setFloat32(32, AMBIENT_TEMPERATURE_K, true);
    this.device.queue.writeBuffer(this.simParamsBuffer, 0, this.simParamsData);
  }

  private writeParticleParams(dt: number, flowScale: number): void {
    const view = this.particleParamsView;
    view.setUint32(0, this.domain.gridWidth, true);
    view.setUint32(4, this.domain.gridHeight, true);
    view.setFloat32(8, dt, true);
    view.setFloat32(12, flowScale, true);
    view.setFloat32(16, this.domain.physicalWidth, true);
    view.setFloat32(20, this.domain.physicalHeight, true);
    view.setFloat32(24, PARTICLE_LIFETIME_S, true);
    view.setUint32(28, PARTICLE_COUNT, true);
    this.device.queue.writeBuffer(this.particleParamsBuffer, 0, this.particleParamsData);
  }

  // ── Readback ────────────────────────────────────────────────────────────────

  /**
   * Copies the current temperature texture into the mirror, asynchronously.
   *
   * At most one readback is in flight at a time; if the previous one has not
   * resolved, this frame simply skips it. The mirror going a few frames stale is
   * invisible in the UI, whereas blocking on `mapAsync` would not be.
   */
  private requestReadback(): void {
    if (this.readbackInFlight || this.disposed) {
      return;
    }
    this.readbackInFlight = true;

    const { gridWidth, gridHeight } = this.domain;
    const encoder = this.device.createCommandEncoder({ label: "readback" });
    encoder.copyTextureToBuffer(
      { texture: this.temperatureTextures[this.current] },
      { buffer: this.readbackBuffer, bytesPerRow: gridWidth * 4, rowsPerImage: gridHeight },
      { width: gridWidth, height: gridHeight },
    );
    this.device.queue.submit([encoder.finish()]);

    this.readbackBuffer
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        if (this.disposed) {
          return;
        }
        this.temperatureMirror.set(new Float32Array(this.readbackBuffer.getMappedRange()));
        this.readbackBuffer.unmap();
      })
      .catch(() => {
        // The device was lost or the buffer was destroyed mid-flight; the mirror
        // simply keeps its previous contents.
      })
      .finally(() => {
        this.readbackInFlight = false;
      });
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  public render(layers: LayerVisibility, style: FieldRenderStyle): void {
    if (this.disposed) {
      return;
    }

    this.writeRenderParams(layers, style);

    const encoder = this.device.createCommandEncoder({ label: "render" });
    const view = this.context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });

    pass.setPipeline(this.fieldPipeline);
    pass.setBindGroup(0, this.fieldBindGroups[this.current]);
    pass.draw(3);

    if (layers.heatFlux) {
      this.writeArrowParams(style);
      pass.setPipeline(this.arrowPipeline);
      pass.setBindGroup(0, this.arrowBindGroups[this.current]);
      pass.draw(ARROW_VERTEX_COUNT, FLUX_ARROW_COUNT * FLUX_ARROW_COUNT);
    }

    if (layers.velocity) {
      this.writeParticleRenderParams(style);
      pass.setPipeline(this.particleRenderPipeline);
      pass.setBindGroup(0, this.particleRenderBindGroup);
      pass.draw(PARTICLE_VERTEX_COUNT, PARTICLE_COUNT);
    }

    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  private writeRenderParams(layers: LayerVisibility, style: FieldRenderStyle): void {
    let flags = 0;
    if (layers.temperature) {
      flags |= LAYER_BIT.TEMPERATURE;
    }
    if (layers.isotherms) {
      flags |= LAYER_BIT.ISOTHERMS;
    }
    if (layers.gradient) {
      flags |= LAYER_BIT.GRADIENT;
    }
    if (layers.material) {
      flags |= LAYER_BIT.MATERIAL;
    }

    const view = this.renderParamsView;
    view.setUint32(0, this.domain.gridWidth, true);
    view.setUint32(4, this.domain.gridHeight, true);
    view.setFloat32(8, style.minTemperature, true);
    view.setFloat32(12, style.maxTemperature, true);
    view.setFloat32(16, style.isothermInterval, true);
    view.setUint32(20, flags, true);
    view.setFloat32(24, Math.log(MIN_PRESET_CONDUCTIVITY), true);
    view.setFloat32(28, Math.log(MAX_PRESET_CONDUCTIVITY) - Math.log(MIN_PRESET_CONDUCTIVITY), true);
    view.setFloat32(32, style.isotherm.red, true);
    view.setFloat32(36, style.isotherm.green, true);
    view.setFloat32(40, style.isotherm.blue, true);
    view.setFloat32(44, 0.85, true);
    view.setFloat32(48, layers.gradient ? this.peakGradientFromMirror() : 0, true);
    view.setUint32(52, BOUNDARY_CONDITION_ORDER.indexOf(this.boundary), true);
    view.setFloat32(56, AMBIENT_TEMPERATURE_K, true);
    view.setFloat32(60, this.domain.dx, true);
    this.device.queue.writeBuffer(this.renderParamsBuffer, 0, this.renderParamsData);
  }

  private writeArrowParams(style: FieldRenderStyle): void {
    const view = this.arrowParamsView;
    view.setUint32(0, this.domain.gridWidth, true);
    view.setUint32(4, this.domain.gridHeight, true);
    view.setUint32(8, FLUX_ARROW_COUNT, true);
    // Clip space spans 2 units across the canvas, so a fraction of the canvas
    // width is twice that fraction in clip units.
    view.setFloat32(12, MAX_ARROW_LENGTH_FRACTION * 2, true);
    view.setFloat32(16, style.arrow.red, true);
    view.setFloat32(20, style.arrow.green, true);
    view.setFloat32(24, style.arrow.blue, true);
    view.setFloat32(28, 1, true);
    view.setFloat32(32, this.peakFluxFromMirror(), true);
    view.setUint32(36, BOUNDARY_CONDITION_ORDER.indexOf(this.boundary), true);
    view.setFloat32(40, AMBIENT_TEMPERATURE_K, true);
    view.setFloat32(44, this.domain.dx, true);
    this.device.queue.writeBuffer(this.arrowParamsBuffer, 0, this.arrowParamsData);
  }

  private writeParticleRenderParams(style: FieldRenderStyle): void {
    this.particleRenderParamsData[0] = style.particle.red;
    this.particleRenderParamsData[1] = style.particle.green;
    this.particleRenderParamsData[2] = style.particle.blue;
    this.particleRenderParamsData[3] = 0.9;
    this.particleRenderParamsData[4] = PARTICLE_CLIP_SIZE;
    this.particleRenderParamsData[5] = PARTICLE_LIFETIME_S;
    this.device.queue.writeBuffer(this.particleRenderParamsBuffer, 0, this.particleRenderParamsData);
  }

  /**
   * The largest |q| on the arrow lattice, taken from the CPU mirror.
   *
   * A GPU reduction would be more current, but it would also add a readback
   * dependency to the render path for a value that only sets the arrow scale.
   * 400 samples off a slightly stale mirror is the cheaper, steadier answer — and
   * it is exactly what the CPU renderer computes, so the two look alike.
   */
  private peakFluxFromMirror(): number {
    const { gridWidth, gridHeight } = this.domain;
    let peak = 0;
    for (let row = 0; row < FLUX_ARROW_COUNT; row++) {
      for (let column = 0; column < FLUX_ARROW_COUNT; column++) {
        const i = Math.min(gridWidth - 1, Math.floor(((column + 0.5) / FLUX_ARROW_COUNT) * gridWidth));
        const j = Math.min(gridHeight - 1, Math.floor(((row + 0.5) / FLUX_ARROW_COUNT) * gridHeight));
        const { gx, gy } = gradientAt(
          this.temperatureMirror,
          this.geometry,
          this.boundary,
          i,
          j,
          AMBIENT_TEMPERATURE_K,
        );
        const index = j * gridWidth + i;
        const qx = -(this.material.conductivityX[index] ?? 0) * gx;
        const qy = -(this.material.conductivityY[index] ?? 0) * gy;
        const magnitude = Math.hypot(qx, qy);
        if (magnitude > peak) {
          peak = magnitude;
        }
      }
    }
    return peak;
  }

  /** The largest |grad T| on a coarse sample of the mirror, for the gradient layer. */
  private peakGradientFromMirror(): number {
    const { gridWidth, gridHeight } = this.domain;
    const stride = Math.max(1, Math.floor(gridWidth / 128));
    let peak = 0;
    for (let j = 0; j < gridHeight; j += stride) {
      for (let i = 0; i < gridWidth; i += stride) {
        const { gx, gy } = gradientAt(
          this.temperatureMirror,
          this.geometry,
          this.boundary,
          i,
          j,
          AMBIENT_TEMPERATURE_K,
        );
        const magnitude = Math.hypot(gx, gy);
        if (magnitude > peak) {
          peak = magnitude;
        }
      }
    }
    return peak;
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    for (const texture of this.temperatureTextures) {
      texture.destroy();
    }
    this.velocityTexture.destroy();
    this.materialTexture.destroy();
    this.particleBuffer.destroy();
    this.readbackBuffer.destroy();
    for (const buffer of [
      this.simParamsBuffer,
      this.brushParamsBuffer,
      this.particleParamsBuffer,
      this.renderParamsBuffer,
      this.arrowParamsBuffer,
      this.particleRenderParamsBuffer,
    ]) {
      buffer.destroy();
    }
    this.context.unconfigure();
  }
}
