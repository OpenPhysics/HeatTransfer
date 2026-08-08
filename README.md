# Heat Transfer

An interactive simulation of heat as a **field**, built on a WebGPU field engine.

Temperature, heat flux, velocity, and material properties are all fields living in
GPU textures; compute shaders evolve them, render pipelines draw them, and
[SceneryStack](https://scenerystack.org/) provides the interface around them. The
same simulation runs as a 128 × 128 classroom demonstration or a 2048 × 2048
high-resolution study — the resolution is a preference, not an assumption.

Five screens build the subject up one field at a time: **Temperature** (T is a
field you can read at every point), **Conduction** (gradients drive flux,
q = −k∇T), **Convection** (a second field, v, carries heat with it), **Heat
Transfer** (both mechanisms, with the balance adjustable and the Péclet number
displayed), and **Materials** (k, ρ, and c_p become fields too).

## Features

- **GPU-native fields** — ping-pong `r32float` temperature textures evolved by
  WGSL compute passes; the scene graph holds one node for the field at any grid size
- **Four grid resolutions** — 128², 512², 1024², 2048², selectable in Preferences
  with no change to the model or the UI
- **A CPU reference backend** — the same physics in TypeScript, used automatically
  where WebGPU is unavailable and as the oracle the WGSL shaders are written against
- **Five visualization layers** — colour-mapped temperature, antialiased isotherms,
  heat-flux arrows, tracer particles, and gradient magnitude, each a render pass over
  the same state rather than a separate simulation
- **Measurement tools** — a probe that samples the interpolated field, and a
  draggable cross-section that graphs T(s) and q_s(s) together
- **Seven materials** spanning four decades of thermal diffusivity, paintable into
  the plate to build composites, barriers, and anisotropic media
- **Full keyboard access** — including a paint cursor for the field itself — with
  live screen-reader summaries of the plate's current temperature range
- English, Spanish, and French localization; default and projector colour profiles
- Progressive Web App (installable, offline-capable)

## Quick Start

```bash
npm install
npm run icons    # generate PNG icons from public/icons/icon.svg
npm start        # dev server → http://localhost:5173
```

Useful query parameters:

| Parameter | Effect |
|---|---|
| `?resolution=high` | Request a 512 × 512 grid (`classroom`, `high`, `large`, `extreme`) |
| `?forceCpu=true` | Skip WebGPU and run the CPU reference backend |
| `?showFieldStatus=false` | Hide the backend / grid-size readout under the field |
| `?screens=2` | Open a single screen directly |

## Scripts

| Command | Description |
|---|---|
| `npm start` / `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check + production build → `dist/` |
| `npm run build:single` | Single self-contained `dist/index.html` |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run Vitest unit tests (includes memory-leak suite) |
| `npm run test:fuzz` | Optional Playwright fuzz smoke (`?fuzz`, default 15s) |
| `npm run test:fuzz:quick` | Shorter fuzz smoke (10s) |
| `npm run check` | TypeScript type check (app, scripts, tests) |
| `npm run lint` | Biome lint check |
| `npm run format` | Auto-format all files |
| `npm run fix` | Lint + auto-fix |
| `npm run icons` | Regenerate PNG icons from `public/icons/icon.svg` |
| `npm run clean` | Remove `dist/` |

## Tech Stack

| Tool | Version | Purpose |
|---|---|---|
| [SceneryStack](https://scenerystack.org/) | ^3 | Simulation framework (PhET-derived) |
| WebGPU | — | Field storage, compute, and rendering |
| [Vite](https://vite.dev/) | ^8 | Build tool and dev server |
| [TypeScript](https://www.typescriptlang.org/) | ^7 | `erasableSyntaxOnly`, `verbatimModuleSyntax` |
| [Biome](https://biomejs.dev/) | ^2.5 | Linting and formatting |
| [Vitest](https://vitest.dev/) | ^4 | Unit tests (happy-dom) |
| [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) | ^1 | PWA / offline / installable |

The physics and numerics are documented in [`doc/model.md`](doc/model.md); the
architecture in [`doc/implementation-notes.md`](doc/implementation-notes.md).

## License

[AGPL-3.0-or-later](https://github.com/OpenPhysics/.github/blob/main/LICENSE), the
OpenPhysics organization default.

## Contributing

See [CONTRIBUTING.md](https://github.com/OpenPhysics/.github/blob/main/CONTRIBUTING.md)
in the OpenPhysics organization defaults.
