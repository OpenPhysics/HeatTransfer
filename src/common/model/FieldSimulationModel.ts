/**
 * FieldSimulationModel.ts
 *
 * The model every screen composes. It owns one {@link FieldEngine} and the
 * reactive state that drives it, and it knows nothing about how the fields are
 * stored or drawn — a screen's controls bind to Properties here, and the
 * parameters those Properties describe are handed to the engine once per frame.
 *
 * Screens differ only in which Properties they expose to the student and what
 * their {@link FieldSimulationConfig} enables. Nothing about the physics or the
 * substrate is per-screen.
 *
 * On stepping
 * ───────────
 * The engine always integrates at its stability-limited substep, so this model
 * does not pass it a wall-clock dt. What it passes is a *substep budget*, scaled
 * by the frame's length and the speed control. The consequence is worth stating
 * plainly, because it is a real modelling decision and not an accident: a screen
 * showing copper advances far more simulated seconds per real second than one
 * showing glass, since glass's tiny diffusivity permits a much larger stable
 * step. Both run at the same rate in *diffusion times*, which is the quantity
 * that governs what the field actually looks like. The elapsed-time readout tells
 * the honest story. See doc/model.md.
 */

import { BooleanProperty, DerivedProperty, NumberProperty, Property, type TReadOnlyProperty } from "scenerystack/axon";
import { Vector2, Vector2Property } from "scenerystack/dot";
import type { TModel } from "scenerystack/joist";
import { TimeSpeed } from "scenerystack/scenery-phet";
import type { ResolutionPresetId } from "../../HeatTransferConstants.js";
import {
  BRUSH_STRENGTH,
  COOL_BRUSH_TEMPERATURE_K,
  CROSS_SECTION_SAMPLES,
  DEFAULT_BRUSH_RADIUS_FRACTION,
  DEFAULT_FLOW_SPEED,
  HOT_BRUSH_TEMPERATURE_K,
  MAX_FRAME_DT,
  READBACK_FRAME_INTERVAL,
  SLOW_SPEED_FACTOR,
  SUBSTEPS_PER_FRAME,
} from "../../HeatTransferConstants.js";
import HeatTransferNamespace from "../../HeatTransferNamespace.js";
import { createFieldEngine } from "../field/createFieldEngine.js";
import type { FieldBackendId, FieldEngine } from "../field/FieldEngine.js";
import {
  type BoundaryConditionId,
  type CrossSectionSample,
  FlowPreset,
  type FlowPresetId,
  type InitialConditionId,
  type LayerVisibility,
  type MaterialProperties,
} from "../field/FieldTypes.js";
import { DEFAULT_MATERIAL_ID, MATERIALS, type MaterialIdValue, withAnisotropy } from "../field/Materials.js";

/** What a screen turns on. Everything not listed here is identical across screens. */
export type FieldSimulationConfig = {
  /** Whether the advection term is integrated. False on Temperature and Conduction. */
  advectionEnabled: boolean;
  /**
   * Behaviour at the plate edges.
   *
   * Screens with a flow use `periodic`: with insulated edges a uniform stream
   * carries every warm parcel off the downstream side within a few seconds of
   * simulated time and leaves a blank plate, which teaches nothing. Periodic
   * edges make the flow a steady recirculation, so a painted spot keeps
   * travelling and the student can watch it both move and spread.
   */
  boundaryCondition: BoundaryConditionId;
  /** Which layers are visible when the screen opens. */
  defaultLayers: LayerVisibility;
  /** How the temperature field is seeded on load and on Reset All. */
  initialCondition: InitialConditionId;
  /** The flow preset selected on load. */
  initialFlowPreset: FlowPresetId;
  /** Grid resolution to request. */
  resolution: ResolutionPresetId;
  /** Edge length of the field canvas in device pixels. */
  displaySize: number;
  /** Whether the screen starts running. */
  initiallyPlaying: boolean;
};

/** What the heat brush is currently depositing. */
export const BrushMode = {
  HEAT: "heat",
  COOL: "cool",
  MATERIAL: "material",
} as const;

export type BrushModeId = (typeof BrushMode)[keyof typeof BrushMode];

export class FieldSimulationModel implements TModel {
  public readonly config: FieldSimulationConfig;

  /** The substrate. Screens read `engine.canvas` and call `engine.render`; nothing else touches it. */
  public readonly engine: FieldEngine;

  /** Which backend was selected, for the status readout. */
  public readonly backend: FieldBackendId;

  /** Cells per side actually allocated, which may be coarser than requested. */
  public readonly effectiveResolution: number;

  /** True when the requested resolution had to be reduced to fit the backend. */
  public readonly resolutionReduced: boolean;

  // ── Clock ───────────────────────────────────────────────────────────────────

  public readonly isPlayingProperty: BooleanProperty;
  public readonly timeSpeedProperty: Property<TimeSpeed>;

  /** Simulated seconds since the last reset. */
  public readonly elapsedTimeProperty: NumberProperty;

  // ── Material ────────────────────────────────────────────────────────────────

  public readonly materialIdProperty: Property<MaterialIdValue>;

  /** Ratio of k_x to k_y. 1 is isotropic; only the Materials screen exposes it. */
  public readonly anisotropyProperty: NumberProperty;

  /** Multiplier on conductivity — the "diffusion" control. */
  public readonly diffusionScaleProperty: NumberProperty;

  public readonly boundaryConditionProperty: Property<BoundaryConditionId>;

  // ── Flow ────────────────────────────────────────────────────────────────────

  public readonly flowPresetProperty: Property<FlowPresetId>;

  /** Peak flow speed, in metres per second. */
  public readonly flowSpeedProperty: NumberProperty;

  /** Multiplier on the velocity field — the "flow speed" control on the combined screen. */
  public readonly flowScaleProperty: NumberProperty;

  // ── Visualization layers ────────────────────────────────────────────────────

  public readonly temperatureLayerProperty: BooleanProperty;
  public readonly isothermLayerProperty: BooleanProperty;
  public readonly heatFluxLayerProperty: BooleanProperty;
  public readonly velocityLayerProperty: BooleanProperty;
  public readonly gradientLayerProperty: BooleanProperty;
  public readonly materialLayerProperty: BooleanProperty;

  // ── Tools ───────────────────────────────────────────────────────────────────

  public readonly brushModeProperty: Property<BrushModeId>;

  /** Brush radius as a fraction of the domain's shorter side. */
  public readonly brushRadiusProperty: NumberProperty;

  /** Which material the material brush paints. */
  public readonly paintMaterialIdProperty: Property<MaterialIdValue>;

  /** Probe position in the unit square. */
  public readonly probePositionProperty: Vector2Property;

  /** Temperature under the probe, in kelvin. */
  public readonly probeTemperatureProperty: NumberProperty;

  public readonly probeVisibleProperty: BooleanProperty;

  /** Endpoints of the cross-section line, in the unit square. */
  public readonly crossSectionStartProperty: Vector2Property;
  public readonly crossSectionEndProperty: Vector2Property;
  public readonly crossSectionVisibleProperty: BooleanProperty;
  public readonly crossSectionSamplesProperty: Property<CrossSectionSample[]>;

  // ── Readouts ────────────────────────────────────────────────────────────────

  public readonly minTemperatureProperty: NumberProperty;
  public readonly maxTemperatureProperty: NumberProperty;
  public readonly meanTemperatureProperty: NumberProperty;

  /**
   * Peclet number Pe = U L / alpha: the ratio of advective to diffusive
   * transport. Below 1 the field is shaped by conduction, above ~100 by the flow.
   */
  public readonly pecletNumberProperty: TReadOnlyProperty<number>;

  private frameCounter = 0;

  public constructor(config: FieldSimulationConfig) {
    this.config = config;

    const creation = createFieldEngine({
      resolution: config.resolution,
      displaySize: config.displaySize,
    });
    this.engine = creation.engine;
    this.backend = creation.backend;
    this.effectiveResolution = creation.effectiveResolution;
    this.resolutionReduced = creation.resolutionReduced;

    this.isPlayingProperty = new BooleanProperty(config.initiallyPlaying);
    this.timeSpeedProperty = new Property<TimeSpeed>(TimeSpeed.NORMAL);
    this.elapsedTimeProperty = new NumberProperty(0, { units: "s" });

    this.materialIdProperty = new Property<MaterialIdValue>(DEFAULT_MATERIAL_ID);
    this.anisotropyProperty = new NumberProperty(1);
    this.diffusionScaleProperty = new NumberProperty(1);
    this.boundaryConditionProperty = new Property<BoundaryConditionId>(config.boundaryCondition);

    this.flowPresetProperty = new Property<FlowPresetId>(config.initialFlowPreset);
    this.flowSpeedProperty = new NumberProperty(DEFAULT_FLOW_SPEED, { units: "m/s" });
    this.flowScaleProperty = new NumberProperty(1);

    const layers = config.defaultLayers;
    this.temperatureLayerProperty = new BooleanProperty(layers.temperature);
    this.isothermLayerProperty = new BooleanProperty(layers.isotherms);
    this.heatFluxLayerProperty = new BooleanProperty(layers.heatFlux);
    this.velocityLayerProperty = new BooleanProperty(layers.velocity);
    this.gradientLayerProperty = new BooleanProperty(layers.gradient);
    this.materialLayerProperty = new BooleanProperty(layers.material);

    this.brushModeProperty = new Property<BrushModeId>(BrushMode.HEAT);
    this.brushRadiusProperty = new NumberProperty(DEFAULT_BRUSH_RADIUS_FRACTION);
    this.paintMaterialIdProperty = new Property<MaterialIdValue>("insulator");

    this.probePositionProperty = new Vector2Property(new Vector2(0.5, 0.5));
    this.probeTemperatureProperty = new NumberProperty(this.engine.sampleTemperature(0.5, 0.5), { units: "K" });
    this.probeVisibleProperty = new BooleanProperty(false);

    this.crossSectionStartProperty = new Vector2Property(new Vector2(0.1, 0.5));
    this.crossSectionEndProperty = new Vector2Property(new Vector2(0.9, 0.5));
    this.crossSectionVisibleProperty = new BooleanProperty(false);
    this.crossSectionSamplesProperty = new Property<CrossSectionSample[]>([]);

    const statistics = this.engine.getStatistics();
    this.minTemperatureProperty = new NumberProperty(statistics.minTemperature, { units: "K" });
    this.maxTemperatureProperty = new NumberProperty(statistics.maxTemperature, { units: "K" });
    this.meanTemperatureProperty = new NumberProperty(statistics.meanTemperature, { units: "K" });

    this.pecletNumberProperty = new DerivedProperty(
      [this.flowSpeedProperty, this.flowScaleProperty, this.diffusionScaleProperty, this.flowPresetProperty],
      (speed, flowScale, diffusionScale, preset) => {
        if (preset === FlowPreset.NONE) {
          return 0;
        }
        const diffusivity = this.engine.getMeanDiffusivity() * diffusionScale;
        if (diffusivity <= 0) {
          return Number.POSITIVE_INFINITY;
        }
        return (speed * flowScale * this.engine.domain.characteristicLength) / diffusivity;
      },
    );

    // ── Wire the Properties to the engine ─────────────────────────────────────

    this.materialIdProperty.link(() => {
      this.pushMaterial();
    });
    this.anisotropyProperty.link(() => {
      this.pushMaterial();
    });

    const pushFlow = (): void => {
      this.engine.setFlow(this.flowPresetProperty.value, this.flowSpeedProperty.value);
    };
    this.flowPresetProperty.link(pushFlow);
    this.flowSpeedProperty.link(pushFlow);

    this.probePositionProperty.link((position) => {
      this.probeTemperatureProperty.value = this.engine.sampleTemperature(position.x, position.y);
    });

    const updateCrossSection = (): void => {
      this.refreshCrossSection();
    };
    this.crossSectionStartProperty.link(updateCrossSection);
    this.crossSectionEndProperty.link(updateCrossSection);

    this.engine.resetField(config.initialCondition);
    this.refreshReadouts();
  }

  // ── Derived views of state ──────────────────────────────────────────────────

  /** The material the plate is made of, including its anisotropy ratio. */
  public get material(): MaterialProperties {
    return withAnisotropy(MATERIALS[this.materialIdProperty.value], this.anisotropyProperty.value);
  }

  /** A snapshot of which layers are on, for the engine's render call. */
  public getLayerVisibility(): LayerVisibility {
    return {
      temperature: this.temperatureLayerProperty.value,
      isotherms: this.isothermLayerProperty.value,
      heatFlux: this.heatFluxLayerProperty.value,
      velocity: this.velocityLayerProperty.value,
      gradient: this.gradientLayerProperty.value,
      material: this.materialLayerProperty.value,
    };
  }

  // ── Interaction ─────────────────────────────────────────────────────────────

  /**
   * Applies the active brush at a point in the unit square.
   *
   * One entry point for pointer drags, keyboard activation, and touch alike, so
   * every input route deposits exactly the same stroke.
   */
  public paintAt(u: number, v: number): void {
    const mode = this.brushModeProperty.value;
    const radius = this.brushRadiusProperty.value;

    if (mode === BrushMode.MATERIAL) {
      this.engine.paintMaterial({
        u,
        v,
        radius,
        material: withAnisotropy(MATERIALS[this.paintMaterialIdProperty.value], this.anisotropyProperty.value),
      });
      return;
    }

    this.engine.paintTemperature({
      u,
      v,
      radius,
      temperature: mode === BrushMode.HEAT ? HOT_BRUSH_TEMPERATURE_K : COOL_BRUSH_TEMPERATURE_K,
      strength: BRUSH_STRENGTH,
    });
    this.refreshProbe();
  }

  /** Re-reads the cross-section line from the engine. */
  public refreshCrossSection(): void {
    const start = this.crossSectionStartProperty.value;
    const end = this.crossSectionEndProperty.value;
    this.crossSectionSamplesProperty.value = this.engine.sampleCrossSection(
      start.x,
      start.y,
      end.x,
      end.y,
      CROSS_SECTION_SAMPLES,
    );
  }

  private refreshProbe(): void {
    const position = this.probePositionProperty.value;
    this.probeTemperatureProperty.value = this.engine.sampleTemperature(position.x, position.y);
  }

  private pushMaterial(): void {
    this.engine.setMaterial(this.material);
  }

  // ── Stepping ────────────────────────────────────────────────────────────────

  public step(dt: number): void {
    if (!this.isPlayingProperty.value) {
      return;
    }
    this.advance(dt);
  }

  /** Advances one frame's worth of simulation regardless of the play/pause state. */
  public stepOnce(): void {
    this.advance(1 / 60);
  }

  private advance(dt: number): void {
    const clamped = Math.min(Math.max(dt, 0), MAX_FRAME_DT);
    const speedFactor = this.timeSpeedProperty.value === TimeSpeed.SLOW ? SLOW_SPEED_FACTOR : 1;

    // Scale the substep budget by how long the frame actually was, so the
    // simulation runs at the same rate on a 30 Hz display as on a 120 Hz one.
    const budget = Math.round(SUBSTEPS_PER_FRAME * speedFactor * clamped * 60);
    const substeps = Math.min(Math.max(budget, 1), SUBSTEPS_PER_FRAME * 4);

    this.engine.step({
      advectionEnabled: this.config.advectionEnabled && this.flowPresetProperty.value !== FlowPreset.NONE,
      diffusionEnabled: true,
      diffusionScale: this.diffusionScaleProperty.value,
      flowScale: this.flowScaleProperty.value,
      boundaryCondition: this.boundaryConditionProperty.value,
      substeps,
    });

    this.elapsedTimeProperty.value = this.engine.simulatedTime;

    // Statistics and the cross-section scan the whole field, and the GPU mirror
    // only refreshes every few frames anyway, so there is nothing to gain from
    // recomputing them more often than the data changes.
    this.frameCounter++;
    if (this.frameCounter % READBACK_FRAME_INTERVAL === 0) {
      this.refreshReadouts();
    }
  }

  private refreshReadouts(): void {
    const statistics = this.engine.getStatistics();
    this.minTemperatureProperty.value = statistics.minTemperature;
    this.maxTemperatureProperty.value = statistics.maxTemperature;
    this.meanTemperatureProperty.value = statistics.meanTemperature;
    this.refreshProbe();
    if (this.crossSectionVisibleProperty.value) {
      this.refreshCrossSection();
    }
  }

  // ── Reset ───────────────────────────────────────────────────────────────────

  public reset(): void {
    this.isPlayingProperty.reset();
    this.timeSpeedProperty.reset();
    this.materialIdProperty.reset();
    this.anisotropyProperty.reset();
    this.diffusionScaleProperty.reset();
    this.boundaryConditionProperty.reset();
    this.flowPresetProperty.reset();
    this.flowSpeedProperty.reset();
    this.flowScaleProperty.reset();

    this.temperatureLayerProperty.reset();
    this.isothermLayerProperty.reset();
    this.heatFluxLayerProperty.reset();
    this.velocityLayerProperty.reset();
    this.gradientLayerProperty.reset();
    this.materialLayerProperty.reset();

    this.brushModeProperty.reset();
    this.brushRadiusProperty.reset();
    this.paintMaterialIdProperty.reset();
    this.probePositionProperty.reset();
    this.probeVisibleProperty.reset();
    this.crossSectionStartProperty.reset();
    this.crossSectionEndProperty.reset();
    this.crossSectionVisibleProperty.reset();

    // The material Property links above have already restored the homogeneous
    // material, so reseeding the temperature is all that is left.
    this.engine.resetField(this.config.initialCondition);
    this.elapsedTimeProperty.reset();
    this.frameCounter = 0;
    this.refreshReadouts();
  }

  public dispose(): void {
    this.pecletNumberProperty.dispose();
    this.engine.dispose();
  }
}

HeatTransferNamespace.register("FieldSimulationModel", FieldSimulationModel);
