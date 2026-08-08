# Heat Transfer — Implementation Notes

Architecture and the reasoning behind it. For the physics, see
[`model.md`](model.md).

## The central idea

**The temperature field is GPU-native data, not a Scenery-rendered image that
happens to contain a field.**

Everything else follows from that. Fields are the primary objects: a scalar
temperature field, a vector velocity field, a material field. Compute shaders
evolve them, render pipelines draw them, and Scenery provides the pedagogical
interface around them — buttons, sliders, probes, graphs, labels, accessibility,
screen navigation.

The practical consequence is that resolution is a parameter rather than an
assumption. A 128 × 128 classroom grid and a 2048 × 2048 grid are the same code
with a different number in one constructor. Nothing above `SimulationDomain` knows
how many cells there are, and the scene graph contains exactly **one node** for
the field at every resolution.

```
                          HEAT MODEL
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         Temperature      Velocity        Material
            field           field           field
              │               │               │
              └───────────────┼───────────────┘
                              ▼
                       WebGPU compute
                     (advect, diffuse, brush)
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
            Updated field           Derived fields
                  │                  ∇T, q, |∇T|
                  └───────────┬───────────┘
                              ▼
                       WebGPU rendering
              (colour map, isotherms, arrows, tracers)
                              │
                              ▼
                        Scenery UI layer
```

## Source layout

```
src/
  init.ts assert.ts splash.ts brand.ts main.ts   bootstrap chain (never reorder)
  HeatTransferColors.ts        ProfileColorProperty entries
  HeatTransferConstants.ts     every named numeric constant
  HeatTransferNamespace.ts     Namespace("heat-transfer")
  i18n/                        StringManager + en / es / fr
  preferences/                 resolution, field-status readout, query parameters
  common/
    field/                     ← the field engine; no Scenery anywhere below here
      SimulationDomain.ts        the only place that knows the grid size
      FieldTypes.ts              boundary conditions, presets, layers, materials
      Materials.ts               material presets
      ColorMap.ts                one ramp, generated into both TS and WGSL
      VelocityPresets.ts         analytic divergence-free flows
      kernels.ts                 the reference numerics, in plain TypeScript
      FieldEngine.ts             the interface the model talks to
      FieldEngineBase.ts         everything both backends do identically
      createFieldEngine.ts       backend selection
      cpu/                       reference backend + 2-D canvas renderer
      gpu/                       WebGPU backend, device acquisition, WGSL
    model/FieldSimulationModel.ts   the model every screen composes
    view/                           the shared Scenery layer
  temperature/ conduction/ convection/ combined/ materials/
                                 one folder per screen: Screen, model/, view/
```

## The two backends

`FieldEngine` is an interface, and there are two implementations:

| | `WebGpuFieldEngine` | `CpuFieldEngine` |
|---|---|---|
| Storage | GPU textures | `Float32Array` |
| Evolution | WGSL compute passes | `kernels.ts` |
| Drawing | WGSL render passes | 2-D canvas API |
| Resolution | up to 2048² | capped at 128² |
| Role | the primary path | fallback, oracle, and test subject |

The CPU backend exists for three reasons, in order of importance:

1. **The simulation still runs where WebGPU does not** — older browsers, locked
   down machines, software rendering.
2. **It is the executable specification of the physics.** The WGSL shaders are
   written to reproduce `kernels.ts` statement for statement — the function names
   are deliberately aligned (`fetchCell`/`fetchScalar`,
   `bilinearSample`/`bilinearScalar`) so that a change to the physics has to be
   made in the same two places. The unit tests pin `kernels.ts` down, and
   therefore indirectly constrain the shaders.
3. **It makes the architectural claim falsifiable.** If the model can drive an
   array-of-floats backend and a texture backend without noticing the difference,
   then the field abstraction really is the interface, not the GPU.

Point 2 was checked directly during development: both engines were run in a
browser from the same initial condition, and after equivalent numbers of steps
their mean temperatures agreed to six significant figures (296.16625 K vs
296.16618 K). Two independent implementations conserving the same energy to that
precision is the strongest available evidence that the shaders say what the
kernels say.

### The division of labour

One rule decides what lives where:

> **The CPU authors, the GPU evolves.**

- The **material field** is written by user actions (uniform selection, brush
  strokes), so the CPU holds the authoritative copy and the backend uploads it.
- The **velocity field** is an analytic preset, computed on the CPU and uploaded.
- The **temperature field** is genuinely GPU-owned. It is the only thing that
  needs to come back.

That is why every read-out feature — probe, legend, cross-section graph, field
statistics — is implemented **once**, in `FieldEngineBase`, against a CPU mirror
of the temperature field. There is no duplicated sampling code, and the two
backends cannot disagree about what a probe reads.

### Reading back from the GPU

`copyTextureToBuffer` + `mapAsync` every four frames, at most one readback in
flight. A synchronous read would stall the pipeline every frame; a probe that is a
few tens of milliseconds behind is imperceptible. Brush strokes are applied to the
mirror *immediately* as well as being dispatched to the texture — with identical
arithmetic — so painting still feels instant.

## The WebGPU backend

### Resources

| Resource | Format | Notes |
|---|---|---|
| `temperature[2]` | `r32float` | ping-pong pair; the only GPU-owned state |
| `velocity` | `rg32float` | CPU-authored, read-only on the GPU |
| `material` | `rgba32float` | `(k_x, k_y, ρc_p, unused)` |
| `particles` | storage buffer | `(u, v, life, seed)` per tracer |

### A timestep

```
   temperature A ──advect──▶ temperature B ──diffuse──▶ temperature A ──▶ …
```

All `substeps` iterations are recorded into a **single command buffer**, so a
frame is one submission no matter how many substeps it takes. Brush strokes are a
further pass over the same pair, which is why painting heat is a write into the
GPU texture rather than a CPU upload of the whole field.

### Two non-obvious constraints

**Explicit bind group layouts, not `layout: "auto"`.** Every field texture is a
32-bit float format, which can only be bound as `unfilterable-float`. An inferred
layout asks for a filterable float and fails validation on any device that does
not advertise the optional `float32-filterable` feature — that is, most of them.
For the same reason every fetch is a `textureLoad` and bilinear interpolation is
done by hand, in both the shaders and the kernels.

**Uniform block layouts are hand-checked.** WGSL's alignment rules put `vec4` on
16-byte boundaries; the `*_PARAMS_BYTES` constants next to each shader record the
resulting sizes so the `DataView` writes and the struct declarations cannot drift
apart.

### Isotherms without contour tracing

The field shader draws contours analytically:

```wgsl
let level = temperature / interval;
let distance = abs(fract(level - 0.5) - 0.5) / max(fwidth(level), 1e-5);
let line = 1.0 - smoothstep(0.0, 1.5, distance);
```

`fwidth` gives the screen-space rate of change of `T/interval`, so dividing the
distance to the nearest contour by it produces a line exactly one pixel wide at
any zoom and any grid resolution, antialiased, for free. The CPU renderer cannot
do this and uses marching squares instead, with per-cell level pruning so that
most cells test zero or one level rather than all twenty.

### Flux arrows and tracers

Both are **instanced draws with no vertex buffer**. The arrow vertex shader reads
the temperature and material textures directly, applies Fourier's law, and lays
out a nine-vertex arrow in clip space; an arrow below the noise floor collapses to
a degenerate triangle rather than branching. The tracer vertex shader reads the
same storage buffer the particle compute pass writes, so tracer positions never
make a round trip through the CPU.

## Backend selection

`initializeGpuContext` runs **once**, during startup, while the splash screen is
still up. It is the only asynchronous step in the whole simulation; after it
resolves, building a field engine is an ordinary synchronous constructor call and
a screen's model factory — which SceneryStack invokes lazily and synchronously —
can just call it.

It checks three things, and any failure demotes the simulation to the CPU backend
before a student sees anything:

1. **A device can be acquired.** No `navigator.gpu`, no adapter, a rejected
   device request.
2. **Every shader compiles.** WGSL compilation is asynchronous and
   `createShaderModule` never throws, so `getCompilationInfo()` is the only
   reliable way to find out. A shader that fails on one driver would otherwise
   surface as a silently black canvas.
3. **The canvas can be presented.** This one was found by running the simulation
   rather than by reasoning about it. The field reaches the scene graph as a
   Scenery `Image` wrapping the engine's canvas, so the browser has to be able to
   `drawImage` a WebGPU-backed canvas into a 2-D one. That works on hardware — but
   not on every software rasterizer. Some configurations happily create a device,
   compile every shader, and run compute passes *correctly* while presenting
   nothing a 2-D context can read. The symptom is a completely blank field with no
   error anywhere, which is strictly worse than the CPU fallback. So the check
   clears a 4 × 4 canvas to red, copies it, and looks.

## The Scenery boundary

`FieldNode` is the whole of it: one `Image` over the engine's canvas, plus the
input that turns pointer and keyboard gestures into brush strokes in unit-square
coordinates.

Scenery's `Image` only ever advertises the Canvas and WebGL renderers for a canvas
source — never SVG, which would have to re-encode a data URL every frame — so
compositing costs one `drawImage` per frame regardless of grid size.

The frame loop, in `FieldScreenView.step`:

1. advance the model, which advances the fields on the GPU
2. run the visualization passes over the new state
3. `invalidateImage()` so Scenery repaints

Step 2 reads the overlay colours out of `HeatTransferColors` each frame and hands
them to the engine as a `FieldRenderStyle`. That is how the WGSL render passes
follow the active colour profile — including Projector Mode — without knowing that
colour profiles exist. The temperature ramp itself is deliberately *not* themed:
it is a quantitative encoding, and a legend that changed with the theme would lie.

### Coordinates

Three systems, converted only in `SimulationDomain` and `FieldNode`:

| | |
|---|---|
| grid `(i, j)` | integer cell indices |
| unit `(u, v)` | normalized `[0,1]²`, origin top-left, `v` down |
| model `(x, y)` | metres |

The `FieldEngine` interface speaks **only** unit coordinates and physical units,
never cells. That is what makes it resolution-agnostic in a way the type system
enforces.

## The model layer

`FieldSimulationModel` owns one engine and the reactive state that drives it. It
never touches a texture, a shader, or a typed array — it hands the engine
parameters and strokes and asks for samples.

Each screen composes it (composition, not inheritance) and adds nothing but a
configuration:

```ts
this.field = new FieldSimulationModel({
  advectionEnabled: true,
  boundaryCondition: BoundaryCondition.PERIODIC,
  defaultLayers: { temperature: true, velocity: true, … },
  initialCondition: InitialCondition.HOT_SPOT,
  initialFlowPreset: FlowPreset.CHANNEL,
  resolution: preferences.resolutionProperty.value,
  displaySize: FIELD_VIEW_SIZE * 2,
  initiallyPlaying: true,
});
```

Screens differ only in which Properties they expose and what that config enables.
Nothing about the physics or the substrate is per-screen.

The one piece of genuinely screen-local state is the Heat Transfer screen's
transport balance, which lives on `TransportControlPanel` because it is a *view*
of the two multipliers the model actually holds. That is also why that screen
overrides `reset()`.

## Visualization layers are not simulation options

Every layer checkbox changes which render pass runs over the current GPU state and
nothing else. Turning on heat flux does not start computing heat flux — the
gradient was always there — it starts *drawing* it.

This is why the Heat Transfer screen groups the layer checkboxes alone in their own
panel, well away from the transport control. A student who notices that toggling
four checkboxes never disturbs the field has understood something worth
understanding, and the UI should not blur it.

## Accessibility

The three required layers, per
[Baton/ACCESSIBILITY.md](https://github.com/OpenPhysics/Baton/blob/main/ACCESSIBILITY.md):

1. **PDOM names.** Every interactive node carries an `accessibleName` from the
   `a11y` string group.
2. **Screen summaries.** Each `ScreenView` registers a `*ScreenSummaryContent`
   whose `currentDetailsContent` is a live `DerivedProperty` over the field's
   coldest and hottest points — the non-visual counterpart of watching the colours
   change.
3. **Keyboard.** A wrapper `Node` carries `pdomOrder` (field first, Reset All
   last); the probe and cross-section handles use `KeyboardDragListener`.

The field itself needed something the standard controls do not cover: it is not a
slider, a combo box, or a draggable object but a continuous canvas you deposit
into. So it has a **paint cursor** — arrow keys move it, shift moves it in finer
steps, space or enter paints — shown as a crosshair whenever the field has focus,
exactly as the hover ring is shown to a pointer user. `HeatBrushKeyboardHelpSection`
documents it in the keyboard-help dialog.

## Testing

WebGPU is not available under Vitest, so the suites exercise the CPU kernels and
the model layer — which is the point of having written the kernels as the
reference implementation.

| Suite | Covers |
|---|---|
| `kernels.test.ts` | energy conservation under each boundary condition, no overshoot at the stability limit, the direction of heat flow, harmonic-mean barriers, anisotropic flux, advective translation |
| `SimulationDomain.test.ts` | resolution independence: the plate stays the same size as the grid refines |
| `ColorMap.test.ts` | monotone ordering, WGSL generation matching the TS sampler |
| `VelocityPresets.test.ts` | bounded magnitude, divergence-free flows |
| `CpuFieldEngine.test.ts` | the `FieldEngine` interface end to end — written so it would pass unchanged against the GPU backend |
| `FieldSimulationModel.test.ts` | Property wiring, reset, Péclet, CPU clamping |
| `memory-leak.test.ts` | engines and models are collected after `dispose()` |

Two tests are worth calling out as things that caught real bugs:

- *`carries heat downstream at the flow speed`* runs to a **simulated duration**
  rather than a step count, and asserts the blob travelled `speed × time`. Written
  the obvious way — a fixed number of steps — it passed for the wrong reason and
  then failed once periodic boundaries were introduced, because the blob had gone
  all the way round.
- The energy-conservation tests compare **relative** error. The totals are on the
  order of 10⁷ J/m in Float32, so an absolute tolerance either fails on round-off
  or is meaningless.

## Where this goes next

The field engine is not heat-specific. `SimulationDomain`, `FieldEngine`,
`ColorMap`, the ping-pong compute machinery, and the render passes are a general
GPU field framework that happens to implement heat transfer first. The same
infrastructure would carry electric potential, gravitational fields, wave
propagation, concentration fields, or a real fluid solver, with the physics
confined to `kernels.ts` and the compute shaders.

Nearer-term work, in rough order of value:

- **Buoyancy coupling** on the plume preset, so the flow is driven by the
  temperature field instead of prescribed alongside it.
- **A GPU reduction** for field statistics and the arrow scale, removing the last
  dependency of the render path on the CPU mirror.
- **Convective and radiative loss** as boundary options, which the boundary
  machinery is already shaped to accept.
- **A full conductivity tensor** rather than a diagonal one, giving flux that
  bends in a direction unrelated to either axis.
