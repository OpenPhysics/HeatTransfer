# CLAUDE.md — Heat Transfer

Sim-specific context for AI assistants. General SceneryStack guidance:
[OpenPhysics/.github/CLAUDE.md](https://github.com/OpenPhysics/.github/blob/main/CLAUDE.md).

## What this sim is

Heat as a field, on a WebGPU field engine. The governing equation is

```
ρc_p ∂T/∂t + ρc_p (v · ∇T) = ∇ · (k ∇T)
```

with terms switched on screen by screen. Physics and numerics:
[`doc/model.md`](doc/model.md). Architecture and the reasoning behind it:
[`doc/implementation-notes.md`](doc/implementation-notes.md). **Read
implementation-notes before changing anything under `src/common/field/`.**

## The one rule to keep

> The temperature field is GPU-native data, not a Scenery-rendered image that
> happens to contain a field.

Concretely, three invariants are worth defending:

1. **Nothing outside `SimulationDomain` knows the grid size.** The `FieldEngine`
   interface speaks unit-square coordinates and SI units, never cells. If you find
   yourself passing an `i, j` across that boundary, something has gone wrong.
2. **One Scenery node for the field, at any resolution.** `FieldNode` is the whole
   Scenery/WebGPU boundary. Do not add per-cell nodes.
3. **`kernels.ts` and the WGSL compute shaders are the same algorithm twice.**
   Change one and you must change the other; the function names are deliberately
   paired (`fetchCell`/`fetchScalar`, `bilinearSample`/`bilinearScalar`) so the
   correspondence is greppable. The unit tests pin down `kernels.ts` and therefore
   constrain the shaders.

## Key files

| File | Purpose |
|---|---|
| `src/HeatTransferColors.ts` | All `ProfileColorProperty` instances, including the field overlays |
| `src/HeatTransferConstants.ts` | Named numeric constants (layout px, physics SI units) |
| `src/HeatTransferNamespace.ts` | Namespace for color property names |
| `src/i18n/StringManager.ts` | Singleton localized string accessor |
| `src/preferences/` | Grid resolution, field-status readout, query parameters |
| **Field engine** | |
| `src/common/field/SimulationDomain.ts` | The only place that knows the grid size |
| `src/common/field/FieldEngine.ts` | The interface the model talks to |
| `src/common/field/FieldEngineBase.ts` | Sampling, strokes, materials — everything both backends share |
| `src/common/field/kernels.ts` | The reference numerics, in plain TypeScript |
| `src/common/field/ColorMap.ts` | One ramp, generated into both TS and WGSL |
| `src/common/field/VelocityPresets.ts` | Analytic divergence-free flows |
| `src/common/field/cpu/` | Reference backend + 2-D canvas renderer |
| `src/common/field/gpu/` | WebGPU backend, device acquisition, WGSL sources |
| `src/common/field/gpu/webgpu-globals.d.ts` | The flag namespaces TS 7's DOM lib omits |
| **Model / view** | |
| `src/common/model/FieldSimulationModel.ts` | The model every screen composes |
| `src/common/view/FieldNode.ts` | The Scenery/WebGPU boundary |
| `src/common/view/FieldScreenView.ts` | Shared layout and frame loop |
| `src/common/view/ControlFactory.ts` | The sim's themed control vocabulary |
| `src/common/HeatTransferScreenIcons.ts` | Programmatic screen icons |
| **Screens** | `src/{temperature,conduction,convection,combined,materials}/` |

## Screens

| Folder | Class prefix | Adds |
|---|---|---|
| `temperature/` | `Temperature` | The bare field: paint, look, probe |
| `conduction/` | `Conduction` | Materials, edges, flux arrows, cross-section graph |
| `convection/` | `Convection` | The velocity field and tracer particles |
| `combined/` | `HeatTransfer` | Transport balance and the Péclet number |
| `materials/` | `Materials` | A paintable material field and anisotropy |

The combined screen's folder is `combined/` while its classes are `HeatTransfer*`,
so that `HeatTransferScreen` does not collide with the sim-level `HeatTransfer*`
files at `src/` root.

## Things that will bite you

- **Backend selection is asynchronous exactly once.** `initializeGpuContext()` runs
  in `main.ts` before `sim.start()`. Everything after it is synchronous, because
  SceneryStack builds a screen's model lazily and synchronously. Do not make
  `createFieldEngine` async.
- **Explicit bind group layouts, never `layout: "auto"`.** 32-bit float textures
  can only be bound as `unfilterable-float`; an inferred layout asks for a
  filterable float and fails on most hardware.
- **Uniform block sizes are hand-computed.** The `*_PARAMS_BYTES` constants beside
  each shader must match the WGSL struct's actual size under `vec4`'s 16-byte
  alignment. Getting this wrong produces garbage, not an error.
- **`FieldScreenView` sets `pdomOrder` on a wrapper node.** `ScreenView` throws if
  you set it on itself, and a node listed twice throws too — the probe checkbox is
  already inside `layerPanel.checkboxes`.
- **The temperature ramp is not themed.** Overlay colours follow the colour profile
  via `FieldRenderStyle`; the ramp itself must not, or the legend would lie.
- **Node 24 is the fleet version.** `npm install` on Node 22 warns about
  `engines.node` but works; CI uses 24.

## Accessibility

The three required layers are wired up: PDOM names from the `a11y` string group,
a `*ScreenSummaryContent` per screen whose `currentDetailsContent` derives live
from the field's min/max temperature, and an explicit `pdomOrder` plus a
`*KeyboardHelpContent` per screen.

The field itself needed something beyond the standard controls, since it is a
continuous canvas rather than a slider or a draggable object: it has a **paint
cursor** (arrow keys to move, shift for finer steps, space or enter to paint),
documented by `HeatBrushKeyboardHelpSection`. Keep that working when touching
`FieldNode`.

Full convention:
[Baton/ACCESSIBILITY.md](https://github.com/OpenPhysics/Baton/blob/main/ACCESSIBILITY.md).

## Compliance carve-outs

- **`src/common/field/gpu/webgpu-globals.d.ts`** — an ambient declaration file
  under `src/`. TypeScript 7's `lib.dom.d.ts` ships the WebGPU interfaces but not
  the `GPUBufferUsage` / `GPUTextureUsage` / `GPUShaderStage` flag namespaces.
  Declaring those here is cheaper and less fragile than adding `@webgpu/types`,
  which would redeclare all 107 interfaces and collide with the built-in ones.
  Delete it when a TypeScript release fills the gap — `npm run check` will say so.
  Note it deliberately does *not* add a `getContext("webgpu")` overload: augmenting
  `HTMLCanvasElement` puts the new overload ahead of the built-ins in resolution
  order and breaks generic `getContext(id, ...args)` forwarding, including the
  fleet's own `tests/setup.ts` canvas mock. `requestCanvasContext` in
  `WebGpuSupport.ts` does that cast in one place instead.
- **`tsconfig.test.json` lists one extra path.** Ambient declarations are not
  inherited through `extends`, and the tests import src modules that use the
  WebGPU flag namespaces, so the test project includes
  `src/common/field/gpu/webgpu-globals.d.ts` alongside `tests`.
- **`rgbToCss` in `ColorMap.ts`** — flagged by the compliance scan as a possible
  hardcoded colour because it builds an `rgb(...)` string. It is a *format* helper,
  not a palette: the components it is handed come either from the temperature ramp
  (a quantitative encoding, deliberately not themed) or from a
  `ProfileColorProperty` by way of `FieldRenderStyle`. Nothing in it chooses a
  colour, and it is the single such helper in the sim.
- **No `src/common/TimeModel.ts`.** The template's composable timer does not fit:
  the engine's simulated time is set by the stability-limited step, not by
  accumulating `dt`, so `FieldSimulationModel` owns `isPlayingProperty` and
  `timeSpeedProperty` directly and reads elapsed time from the engine.

## Testing

Fleet-standard Vitest layout, `happy-dom` environment, `tests/setup.ts` mocks
Canvas 2D and AudioContext.

| Path | Covers |
|---|---|
| `tests/common/field/kernels.test.ts` | Energy conservation, stability bound, Fourier's law, harmonic-mean barriers, anisotropy, advective translation |
| `tests/common/field/SimulationDomain.test.ts` | Resolution independence |
| `tests/common/field/ColorMap.test.ts` | Ramp ordering, WGSL generation |
| `tests/common/field/VelocityPresets.test.ts` | Bounded, divergence-free flows |
| `tests/common/field/CpuFieldEngine.test.ts` | The `FieldEngine` interface end to end |
| `tests/common/model/FieldSimulationModel.test.ts` | Property wiring, reset, Péclet, CPU clamping |
| `tests/memory-leak.test.ts` | Engines and models collected after `dispose()` |

WebGPU is unavailable under Vitest, so the suites cover the CPU backend. When
changing the shaders, verify them against the CPU backend **in a browser** — run
both engines from the same initial condition and compare mean temperature, which
should agree to ~6 significant figures. See implementation-notes §"The two
backends".

## Commands

```bash
npm run lint && npm run check && npm run build && npm test
```

| Command | Description |
|---|---|
| `npm start` / `npm run dev` | Vite dev server |
| `npm run build` | Type-check + production build |
| `npm run build:single` | Single-file build mode |
| `npm run check` | TypeScript (app, scripts, tests) |
| `npm run lint` / `npm run fix` | Biome check / auto-fix |
| `npm test` | Vitest unit tests |
| `npm run test:fuzz` | Playwright fuzz smoke |
| `npm run icons` | Regenerate PWA icons |

Useful while developing: `?forceCpu=true` to compare backends on one machine,
`?resolution=large` to check the field engine at 1024², `?screens=N` to open one
screen directly.
