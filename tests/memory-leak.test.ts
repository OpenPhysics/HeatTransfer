/**
 * Fleet-standard memory-leak regression suite (SceneryStackTemplate / QubitSketch pattern).
 *
 * Creates a disposable model object inside a function boundary, disposes it, forces
 * garbage collection via global.gc (--expose-gc in vitest.config.ts), then asserts via
 * WeakRef that the object was collected. V8 requires a function boundary (not merely
 * a block scope) so local strong references die when the helper returns.
 */

import { describe, expect, it } from "vitest";
import { CpuFieldEngine } from "../src/common/field/cpu/CpuFieldEngine.js";
import {
  BoundaryCondition,
  FlowPreset,
  InitialCondition,
  TEMPERATURE_ONLY_LAYERS,
} from "../src/common/field/FieldTypes.js";
import { SimulationDomain } from "../src/common/field/SimulationDomain.js";
import { FieldSimulationModel } from "../src/common/model/FieldSimulationModel.js";
import { FIELD_VIEW_SIZE } from "../src/HeatTransferConstants.js";

/**
 * Force garbage collection with multiple passes. When `earlyExitRefs` is supplied
 * the loop bails as soon as every referenced object is confirmed collected. The
 * setTimeout(0) yield after a live deref() avoids the WeakRef macrotask-liveness pin.
 * Without early-exit refs the loop always runs all passes, which on a slow `gc()`
 * can exceed the Vitest testTimeout — always pass refs when you have them.
 */
async function forceGC(earlyExitRefs?: WeakRef<object> | readonly WeakRef<object>[]): Promise<void> {
  const refs = earlyExitRefs === undefined ? [] : Array.isArray(earlyExitRefs) ? earlyExitRefs : [earlyExitRefs];
  for (let i = 0; i < 15; i++) {
    globalThis.gc?.();
    await new Promise<void>((r) => setTimeout(r, 50));
    if (refs.length > 0 && refs.every((ref) => ref.deref() === undefined)) {
      return;
    }
    if (refs.length > 0) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }
}

/**
 * A field engine holds several megabytes of typed arrays and a canvas, so it is
 * the object in this simulation whose leaking would hurt most: a student moving
 * between five screens would accumulate five engines' worth of field storage.
 */
function createAndDisposeFieldEngine(): WeakRef<object> {
  const engine = new CpuFieldEngine(new SimulationDomain(64, 64), { displaySize: FIELD_VIEW_SIZE });
  engine.resetField(InitialCondition.HOT_SPOT);
  engine.step({
    advectionEnabled: false,
    diffusionEnabled: true,
    diffusionScale: 1,
    flowScale: 1,
    boundaryCondition: BoundaryCondition.INSULATED,
    substeps: 4,
  });
  const ref = new WeakRef<object>(engine);
  engine.dispose();
  return ref;
}

/** The whole model graph: Properties, DerivedProperties, links, and an engine. */
function createAndDisposeFieldSimulationModel(): WeakRef<object> {
  const model = new FieldSimulationModel({
    advectionEnabled: true,
    boundaryCondition: BoundaryCondition.PERIODIC,
    defaultLayers: TEMPERATURE_ONLY_LAYERS,
    initialCondition: InitialCondition.HOT_SPOT,
    initialFlowPreset: FlowPreset.UNIFORM,
    resolution: "classroom",
    displaySize: FIELD_VIEW_SIZE,
    initiallyPlaying: true,
  });
  model.paintAt(0.5, 0.5);
  model.step(1 / 60);
  const ref = new WeakRef<object>(model);
  model.dispose();
  return ref;
}

describe("Memory leak regression", () => {
  it("global.gc is available (--expose-gc)", () => {
    expect(globalThis.gc).toBeDefined();
  });

  it("sanity: plain object is collected", async () => {
    const ref = (() => new WeakRef({ hello: "world" }))();
    await forceGC(ref);
    expect(ref.deref()).toBeUndefined();
  });

  it("CpuFieldEngine is collected after dispose", async () => {
    const ref = createAndDisposeFieldEngine();
    await forceGC(ref);
    expect(ref.deref()).toBeUndefined();
  });

  it("FieldSimulationModel is collected after dispose", async () => {
    const ref = createAndDisposeFieldSimulationModel();
    await forceGC(ref);
    expect(ref.deref()).toBeUndefined();
  });

  it("engine double dispose() does not throw", () => {
    const engine = new CpuFieldEngine(new SimulationDomain(32, 32), { displaySize: FIELD_VIEW_SIZE });
    engine.dispose();
    expect(() => engine.dispose()).not.toThrow();
  });

  it("repeated create/dispose cycles leave no survivors", async () => {
    // Ten engines at 64 x 64 is a few megabytes of field storage; the same cycle
    // at a large resolution is what a student browsing between screens does.
    const refs: WeakRef<object>[] = [];
    for (let i = 0; i < 10; i++) {
      refs.push(createAndDisposeFieldEngine());
    }
    await forceGC(refs);
    const survivors = refs.filter((r) => r.deref() !== undefined).length;
    expect(survivors).toBe(0);
  });
});
