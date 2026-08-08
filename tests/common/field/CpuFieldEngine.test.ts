/**
 * CpuFieldEngine.test.ts
 *
 * The engine as the model sees it: unit-square coordinates in, physical
 * quantities out, with no mention of cells anywhere. These tests are written
 * entirely against the `FieldEngine` interface, so they would pass unchanged
 * against the WebGPU backend in an environment that had one.
 */

import { describe, expect, it } from "vitest";
import { CpuFieldEngine } from "../../../src/common/field/cpu/CpuFieldEngine.js";
import { FieldBackend } from "../../../src/common/field/FieldEngine.js";
import {
  BoundaryCondition,
  FlowPreset,
  InitialCondition,
  type TransportParameters,
} from "../../../src/common/field/FieldTypes.js";
import { MATERIALS } from "../../../src/common/field/Materials.js";
import { SimulationDomain } from "../../../src/common/field/SimulationDomain.js";
import {
  AMBIENT_TEMPERATURE_K,
  FIELD_VIEW_SIZE,
  KELVIN_TO_CELSIUS_OFFSET,
} from "../../../src/HeatTransferConstants.js";

function makeEngine(cells = 32): CpuFieldEngine {
  return new CpuFieldEngine(new SimulationDomain(cells, cells), { displaySize: FIELD_VIEW_SIZE });
}

const diffusionOnly: TransportParameters = {
  advectionEnabled: false,
  diffusionEnabled: true,
  diffusionScale: 1,
  flowScale: 1,
  boundaryCondition: BoundaryCondition.INSULATED,
  substeps: 8,
};

/** The horizontal position of the warmest point along the middle row, in [0, 1]. */
function warmestAlongCentreRow(engine: CpuFieldEngine): number {
  const samples = 200;
  let bestU = 0;
  let best = Number.NEGATIVE_INFINITY;
  for (let n = 0; n <= samples; n++) {
    const u = n / samples;
    const temperature = engine.sampleTemperature(u, 0.5);
    if (temperature > best) {
      best = temperature;
      bestU = u;
    }
  }
  return bestU;
}

describe("CpuFieldEngine", () => {
  it("reports itself as the CPU backend and owns a canvas", () => {
    const engine = makeEngine();
    expect(engine.backend).toBe(FieldBackend.CPU);
    expect(engine.canvas.width).toBe(FIELD_VIEW_SIZE);
    engine.dispose();
  });

  it("seeds a uniform field at ambient", () => {
    const engine = makeEngine();
    engine.resetField(InitialCondition.UNIFORM);
    expect(engine.sampleTemperature(0.5, 0.5)).toBeCloseTo(AMBIENT_TEMPERATURE_K, 4);
    const statistics = engine.getStatistics();
    expect(statistics.maxTemperature - statistics.minTemperature).toBeCloseTo(0, 4);
    engine.dispose();
  });

  it("seeds a hot spot at the centre and leaves the corners cool", () => {
    const engine = makeEngine();
    engine.resetField(InitialCondition.HOT_SPOT);
    expect(engine.sampleTemperature(0.5, 0.5)).toBeGreaterThan(engine.sampleTemperature(0.05, 0.05));
    engine.dispose();
  });

  it("paints heat where asked and nowhere else", () => {
    const engine = makeEngine();
    engine.resetField(InitialCondition.UNIFORM);
    const far = engine.sampleTemperature(0.9, 0.9);

    engine.paintTemperature({ u: 0.25, v: 0.25, radius: 0.1, temperature: 450, strength: 0.5 });

    expect(engine.sampleTemperature(0.25, 0.25)).toBeGreaterThan(AMBIENT_TEMPERATURE_K + 50);
    expect(engine.sampleTemperature(0.9, 0.9)).toBeCloseTo(far, 6);
    engine.dispose();
  });

  it("saturates rather than overshooting when a stroke is repeated", () => {
    const engine = makeEngine();
    engine.resetField(InitialCondition.UNIFORM);
    const stroke = { u: 0.5, v: 0.5, radius: 0.15, temperature: 450, strength: 0.5 };
    for (let n = 0; n < 40; n++) {
      engine.paintTemperature(stroke);
    }
    expect(engine.sampleTemperature(0.5, 0.5)).toBeLessThanOrEqual(450 + 1e-6);
    expect(engine.sampleTemperature(0.5, 0.5)).toBeGreaterThan(440);
    engine.dispose();
  });

  it("advances simulated time and relaxes a painted spot", () => {
    const engine = makeEngine();
    engine.resetField(InitialCondition.UNIFORM);
    engine.setMaterial(MATERIALS.copper);
    engine.paintTemperature({ u: 0.5, v: 0.5, radius: 0.12, temperature: 450, strength: 1 });

    const peakBefore = engine.getStatistics().maxTemperature;
    let advanced = 0;
    for (let n = 0; n < 30; n++) {
      advanced += engine.step(diffusionOnly);
    }

    expect(advanced).toBeGreaterThan(0);
    expect(engine.simulatedTime).toBeCloseTo(advanced, 6);
    expect(engine.getStatistics().maxTemperature).toBeLessThan(peakBefore);
    engine.dispose();
  });

  it("zeroes the clock on reset", () => {
    const engine = makeEngine();
    engine.step(diffusionOnly);
    expect(engine.simulatedTime).toBeGreaterThan(0);
    engine.resetField(InitialCondition.UNIFORM);
    expect(engine.simulatedTime).toBe(0);
    engine.dispose();
  });

  it("takes a smaller stability-limited step for a more diffusive material", () => {
    const engine = makeEngine();
    engine.setMaterial(MATERIALS.glass);
    engine.step(diffusionOnly);
    const glassStep = engine.substepSize;

    engine.setMaterial(MATERIALS.copper);
    engine.step(diffusionOnly);
    const copperStep = engine.substepSize;

    expect(copperStep).toBeLessThan(glassStep);
    engine.dispose();
  });

  it("points the sampled flux from hot toward cold", () => {
    const engine = makeEngine();
    engine.resetField(InitialCondition.GRADIENT); // hot left, cold right
    const { qx, qy } = engine.sampleHeatFlux(0.5, 0.5);
    expect(qx).toBeGreaterThan(0);
    expect(Math.abs(qy)).toBeLessThan(Math.abs(qx));
    engine.dispose();
  });

  it("samples a cross-section whose flux is minus k times its own gradient", () => {
    const engine = makeEngine();
    engine.resetField(InitialCondition.GRADIENT);
    engine.setMaterial(MATERIALS.copper);

    const samples = engine.sampleCrossSection(0.05, 0.5, 0.95, 0.5, 32);
    expect(samples).toHaveLength(32);
    expect(samples[0]?.distance).toBe(0);
    expect(samples[31]?.distance).toBeGreaterThan(0);

    for (const sample of samples) {
      expect(sample.flux).toBeCloseTo(-MATERIALS.copper.conductivity * sample.gradient, 0);
    }
    // Hot left, cold right: temperature falls along the line.
    expect(samples[31]?.temperature ?? 0).toBeLessThan(samples[0]?.temperature ?? 0);
    engine.dispose();
  });

  it("returns no cross-section for a degenerate line", () => {
    const engine = makeEngine();
    expect(engine.sampleCrossSection(0.5, 0.5, 0.5, 0.5, 32)).toHaveLength(0);
    expect(engine.sampleCrossSection(0.1, 0.5, 0.9, 0.5, 1)).toHaveLength(0);
    engine.dispose();
  });

  it("reports the peak speed of the flow preset it was given", () => {
    const engine = makeEngine();
    expect(engine.getMaxSpeed()).toBe(0);
    engine.setFlow(FlowPreset.UNIFORM, 0.005);
    expect(engine.getMaxSpeed()).toBeCloseTo(0.005, 9);
    engine.setFlow(FlowPreset.NONE, 0.005);
    expect(engine.getMaxSpeed()).toBe(0);
    engine.dispose();
  });

  it("carries heat downstream at the flow speed when advection is on", () => {
    const engine = makeEngine(48);
    engine.resetField(InitialCondition.UNIFORM);
    engine.setMaterial(MATERIALS.steel);

    const speed = 0.004;
    engine.setFlow(FlowPreset.UNIFORM, speed);
    engine.paintTemperature({ u: 0.25, v: 0.5, radius: 0.08, temperature: 450, strength: 1 });
    expect(warmestAlongCentreRow(engine)).toBeCloseTo(0.25, 1);

    const parameters: TransportParameters = {
      ...diffusionOnly,
      advectionEnabled: true,
      boundaryCondition: BoundaryCondition.PERIODIC,
      substeps: 16,
    };

    // Run to a *simulated* duration rather than a step count: the step size is
    // set by the stability limit, so a fixed number of steps would carry the
    // blob a distance that depends on the material and the grid — and with
    // periodic edges, far enough eventually means all the way back round.
    const targetSeconds = 5;
    while (engine.simulatedTime < targetSeconds) {
      engine.step(parameters);
    }

    const expectedTravel = (speed * engine.simulatedTime) / engine.domain.physicalWidth;
    expect(warmestAlongCentreRow(engine)).toBeCloseTo(0.25 + expectedTravel, 1);
    engine.dispose();
  });

  it("lets a painted insulator slow the spread of heat", () => {
    const build = (withBarrier: boolean): number => {
      const engine = makeEngine(48);
      engine.resetField(InitialCondition.UNIFORM);
      engine.setMaterial(MATERIALS.copper);
      if (withBarrier) {
        for (let n = 0; n <= 20; n++) {
          engine.paintMaterial({ u: 0.5, v: n / 20, radius: 0.05, material: MATERIALS.insulator });
        }
      }
      engine.paintTemperature({ u: 0.25, v: 0.5, radius: 0.1, temperature: 450, strength: 1 });
      for (let n = 0; n < 60; n++) {
        engine.step(diffusionOnly);
      }
      const beyond = engine.sampleTemperature(0.8, 0.5) - AMBIENT_TEMPERATURE_K;
      engine.dispose();
      return beyond;
    };

    expect(build(true)).toBeLessThan(build(false));
  });

  it("keeps degrees Celsius and kelvin consistent at the ambient point", () => {
    const engine = makeEngine();
    engine.resetField(InitialCondition.UNIFORM);
    expect(engine.sampleTemperature(0.5, 0.5) - KELVIN_TO_CELSIUS_OFFSET).toBeCloseTo(20, 1);
    engine.dispose();
  });
});
