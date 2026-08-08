/**
 * FieldSimulationModel.test.ts
 *
 * The model layer: reactive state wired to an engine. Under Vitest there is no
 * WebGPU device, so `createFieldEngine` selects the CPU backend — which is the
 * fallback path a student without WebGPU gets, and therefore worth having
 * covered by the suite in its own right.
 */

import { TimeSpeed } from "scenerystack/scenery-phet";
import { describe, expect, it } from "vitest";
import { FieldBackend } from "../../../src/common/field/FieldEngine.js";
import {
  BoundaryCondition,
  FlowPreset,
  InitialCondition,
  TEMPERATURE_ONLY_LAYERS,
} from "../../../src/common/field/FieldTypes.js";
import { MATERIALS } from "../../../src/common/field/Materials.js";
import {
  BrushMode,
  type FieldSimulationConfig,
  FieldSimulationModel,
} from "../../../src/common/model/FieldSimulationModel.js";
import { AMBIENT_TEMPERATURE_K, FIELD_VIEW_SIZE, MAX_CPU_RESOLUTION } from "../../../src/HeatTransferConstants.js";

function makeConfig(overrides?: Partial<FieldSimulationConfig>): FieldSimulationConfig {
  return {
    advectionEnabled: false,
    boundaryCondition: BoundaryCondition.INSULATED,
    defaultLayers: TEMPERATURE_ONLY_LAYERS,
    initialCondition: InitialCondition.UNIFORM,
    initialFlowPreset: FlowPreset.NONE,
    resolution: "classroom",
    displaySize: FIELD_VIEW_SIZE,
    initiallyPlaying: true,
    ...overrides,
  };
}

describe("FieldSimulationModel", () => {
  it("falls back to the CPU backend when there is no GPU device", () => {
    const model = new FieldSimulationModel(makeConfig());
    expect(model.backend).toBe(FieldBackend.CPU);
    model.dispose();
  });

  it("clamps the CPU backend to a grid it can carry on the main thread", () => {
    const model = new FieldSimulationModel(makeConfig({ resolution: "extreme" }));
    expect(model.effectiveResolution).toBeLessThanOrEqual(MAX_CPU_RESOLUTION);
    expect(model.resolutionReduced).toBe(true);
    model.dispose();
  });

  it("does not report a reduction when the request already fits", () => {
    const model = new FieldSimulationModel(makeConfig({ resolution: "classroom" }));
    expect(model.resolutionReduced).toBe(false);
    model.dispose();
  });

  it("stays still while paused and advances while playing", () => {
    const model = new FieldSimulationModel(makeConfig({ initiallyPlaying: false }));
    model.paintAt(0.5, 0.5);
    model.step(1 / 60);
    expect(model.elapsedTimeProperty.value).toBe(0);

    model.isPlayingProperty.value = true;
    model.step(1 / 60);
    expect(model.elapsedTimeProperty.value).toBeGreaterThan(0);
    model.dispose();
  });

  it("advances on a single step even while paused", () => {
    const model = new FieldSimulationModel(makeConfig({ initiallyPlaying: false }));
    model.stepOnce();
    expect(model.elapsedTimeProperty.value).toBeGreaterThan(0);
    model.dispose();
  });

  it("advances less per frame on the slow speed setting", () => {
    const fast = new FieldSimulationModel(makeConfig());
    const slow = new FieldSimulationModel(makeConfig());
    slow.timeSpeedProperty.value = TimeSpeed.SLOW;

    for (let n = 0; n < 10; n++) {
      fast.step(1 / 60);
      slow.step(1 / 60);
    }
    expect(slow.elapsedTimeProperty.value).toBeLessThan(fast.elapsedTimeProperty.value);
    fast.dispose();
    slow.dispose();
  });

  it("pushes a material change through to the engine", () => {
    const model = new FieldSimulationModel(makeConfig());
    model.materialIdProperty.value = "glass";
    model.step(1 / 60);
    const glassStep = model.engine.substepSize;

    model.materialIdProperty.value = "copper";
    model.step(1 / 60);
    expect(model.engine.substepSize).toBeLessThan(glassStep);
    model.dispose();
  });

  it("splits conductivity about the geometric mean when made anisotropic", () => {
    const model = new FieldSimulationModel(makeConfig());
    model.materialIdProperty.value = "copper";
    model.anisotropyProperty.value = 4;

    const material = model.material;
    expect(material.anisotropy).toBe(4);
    // The identity of the material is preserved: sqrt(k_x k_y) is still k.
    expect(Math.sqrt(material.conductivity * 4 * (material.conductivity / 4))).toBeCloseTo(
      MATERIALS.copper.conductivity,
      6,
    );
    model.dispose();
  });

  it("pushes a flow change through to the engine", () => {
    const model = new FieldSimulationModel(makeConfig({ advectionEnabled: true }));
    expect(model.engine.getMaxSpeed()).toBe(0);
    model.flowPresetProperty.value = FlowPreset.UNIFORM;
    expect(model.engine.getMaxSpeed()).toBeCloseTo(model.flowSpeedProperty.value, 9);
    model.dispose();
  });

  it("paints heat, cool, and material through one entry point", () => {
    const model = new FieldSimulationModel(makeConfig());

    model.brushModeProperty.value = BrushMode.HEAT;
    model.paintAt(0.3, 0.3);
    expect(model.engine.sampleTemperature(0.3, 0.3)).toBeGreaterThan(AMBIENT_TEMPERATURE_K);

    model.brushModeProperty.value = BrushMode.COOL;
    model.paintAt(0.7, 0.7);
    expect(model.engine.sampleTemperature(0.7, 0.7)).toBeLessThan(AMBIENT_TEMPERATURE_K);

    // A material stroke must not disturb the temperature it is painted over.
    const before = model.engine.sampleTemperature(0.3, 0.3);
    model.brushModeProperty.value = BrushMode.MATERIAL;
    model.paintAt(0.3, 0.3);
    expect(model.engine.sampleTemperature(0.3, 0.3)).toBeCloseTo(before, 6);
    model.dispose();
  });

  it("tracks the probe temperature as the probe moves", () => {
    const model = new FieldSimulationModel(makeConfig());
    model.paintAt(0.2, 0.2);

    model.probePositionProperty.value = model.probePositionProperty.value.copy().setXY(0.2, 0.2);
    const hot = model.probeTemperatureProperty.value;
    model.probePositionProperty.value = model.probePositionProperty.value.copy().setXY(0.85, 0.85);
    expect(model.probeTemperatureProperty.value).toBeLessThan(hot);
    model.dispose();
  });

  it("reports a Peclet number that rises with flow and falls with diffusion", () => {
    const model = new FieldSimulationModel(makeConfig({ advectionEnabled: true }));
    expect(model.pecletNumberProperty.value).toBe(0); // still

    model.flowPresetProperty.value = FlowPreset.UNIFORM;
    const base = model.pecletNumberProperty.value;
    expect(base).toBeGreaterThan(0);

    model.flowScaleProperty.value = 2;
    expect(model.pecletNumberProperty.value).toBeCloseTo(2 * base, 6);

    model.diffusionScaleProperty.value = 0.5;
    expect(model.pecletNumberProperty.value).toBeCloseTo(4 * base, 6);
    model.dispose();
  });

  it("snapshots exactly the layers whose Properties are true", () => {
    const model = new FieldSimulationModel(makeConfig());
    model.isothermLayerProperty.value = true;
    model.heatFluxLayerProperty.value = true;
    expect(model.getLayerVisibility()).toEqual({
      temperature: true,
      isotherms: true,
      heatFlux: true,
      velocity: false,
      gradient: false,
      material: false,
    });
    model.dispose();
  });

  it("returns everything to its starting state on reset", () => {
    const model = new FieldSimulationModel(makeConfig({ advectionEnabled: true }));

    model.materialIdProperty.value = "wood";
    model.anisotropyProperty.value = 3;
    model.flowPresetProperty.value = FlowPreset.VORTEX;
    model.isothermLayerProperty.value = true;
    model.brushModeProperty.value = BrushMode.COOL;
    model.paintAt(0.5, 0.5);
    model.step(1 / 60);

    model.reset();

    expect(model.materialIdProperty.value).toBe("copper");
    expect(model.anisotropyProperty.value).toBe(1);
    expect(model.flowPresetProperty.value).toBe(FlowPreset.NONE);
    expect(model.isothermLayerProperty.value).toBe(false);
    expect(model.brushModeProperty.value).toBe(BrushMode.HEAT);
    expect(model.elapsedTimeProperty.value).toBe(0);
    expect(model.engine.sampleTemperature(0.5, 0.5)).toBeCloseTo(AMBIENT_TEMPERATURE_K, 3);
    model.dispose();
  });

  it("does not advect when the screen has advection turned off", () => {
    const model = new FieldSimulationModel(makeConfig({ advectionEnabled: false }));
    model.flowPresetProperty.value = FlowPreset.UNIFORM;
    model.paintAt(0.25, 0.5);
    const painted = model.engine.sampleTemperature(0.25, 0.5);

    for (let n = 0; n < 20; n++) {
      model.step(1 / 60);
    }
    // Heat diffuses outward but the peak stays put.
    expect(model.engine.sampleTemperature(0.25, 0.5)).toBeLessThan(painted);
    expect(model.engine.sampleTemperature(0.25, 0.5)).toBeGreaterThan(model.engine.sampleTemperature(0.6, 0.5));
    model.dispose();
  });
});
