# Heat Transfer — Model

The physics, the numerics, and the choices made in turning one into the other.

## 1. The governing equation

Everything in this simulation is one equation with pieces switched on and off:

```
    ∂T
ρc_p ── + ρc_p (v · ∇T) = ∇ · (k ∇T)
    ∂t
```

| Screen | Terms active | What is a field |
|---|---|---|
| 1. Temperature | diffusion only, uniform `k` | `T(x, y)` |
| 2. Conduction | diffusion only, uniform `k` | `T`, `q = -k∇T` |
| 3. Convection | diffusion + advection | `T`, `v` |
| 4. Heat Transfer | diffusion + advection, balance adjustable | `T`, `q`, `v` |
| 5. Materials | diffusion, `k(x, y)`, `ρc_p(x, y)`, anisotropic | `T`, `q`, `k` |

For a homogeneous, isotropic medium this reduces to the familiar form

```
∂T/∂t + v · ∇T = α ∇²T,     α = k / (ρ c_p)
```

and Fourier's law `q = -k ∇T` is what the heat-flux layer draws.

## 2. The domain

A square plate, 10 cm on a side, discretized into `N × N` cells with
`dx = dy = 0.1 / N`. `N` is a preference — 128, 512, 1024, or 2048 — and nothing
in the model, the physics, or the UI reads it except `SimulationDomain`. The
physical extent is fixed as `N` changes, so refining the grid resolves more
structure in the same plate rather than simulating a different one.

Thickness is not modelled: the plate is two-dimensional, and energy is quoted per
unit depth (J/m).

## 3. Materials

Room-temperature handbook values. The derived diffusivity `α = k / (ρ c_p)` spans
nearly four decades across the list, which is the point of having a list.

| Material | k [W/m·K] | ρ [kg/m³] | c_p [J/kg·K] | α [m²/s] |
|---|---|---|---|---|
| Copper | 401 | 8960 | 385 | 1.16 × 10⁻⁴ |
| Aluminum | 237 | 2700 | 897 | 9.8 × 10⁻⁵ |
| Steel | 16 | 8000 | 500 | 4.0 × 10⁻⁶ |
| Glass | 1.0 | 2500 | 840 | 4.8 × 10⁻⁷ |
| Water | 0.6 | 1000 | 4182 | 1.4 × 10⁻⁷ |
| Wood | 0.15 | 700 | 1700 | 1.3 × 10⁻⁷ |
| Insulator (foam) | 0.03 | 30 | 1500 | 6.7 × 10⁻⁷ |

Note that foam has the *lowest* conductivity but a *higher* diffusivity than wood,
because it stores almost no energy. The Material panel shows both numbers live so
that this is visible rather than surprising: `k` is what appears in Fourier's law,
`α` is what governs how fast the field changes, and they do not order materials
the same way.

### Anisotropy

The Materials screen can split the scalar `k` into a diagonal conductivity tensor

```
K = diag(k_x, k_y),    k_x = k·r,    k_y = k / r
```

where `r` is the anisotropy ratio. The geometric mean `√(k_x k_y) = k` is
preserved, so changing `r` redistributes the material's conductivity between the
axes without making it a different material. A hot spot then spreads into an
ellipse of aspect ratio `√(k_x/k_y) = r`, and the flux no longer points straight
down the temperature gradient.

## 4. Discretization

### Diffusion — conservative finite volume

Heat entering a cell through its four faces:

```
              1  ⎡                                              ⎤
T_ij ← T_ij + ── ⎢ (F_E − F_W)/dx + (F_S − F_N)/dy ⎥ · dt
             ρc_p⎣                                              ⎦

F_E = k_{i+½,j} (T_{i+1,j} − T_{i,j}) / dx        (and similarly for W, N, S)
```

Face conductivities use the **harmonic mean** of the two adjacent cells:

```
k_{i+½} = 2 k_i k_{i+1} / (k_i + k_{i+1})
```

This is the series combination of thermal resistances, and it is what makes a
painted barrier behave like a barrier. An arithmetic mean would let a single cell
of foam between two cells of copper conduct at roughly half copper's rate; the
harmonic mean gives roughly twice foam's rate, which is the physical answer. The
`blocks heat with a strip of insulator` test in `tests/common/field/kernels.test.ts`
pins this down.

### Advection — semi-Lagrangian

Each cell traces its parcel backward along the velocity field and bilinearly
samples the incoming field there:

```
T_new(x) = T_old(x − v dt)
```

Unconditionally stable, so the time step is never limited by the flow, at the
cost of some numerical diffusion. That trade is right for a teaching simulation:
the alternative (an upwind or flux-limited scheme) buys sharpness at the price of
a step size that collapses when a student drags the speed slider up.

Advection and diffusion are applied by operator splitting, in that order, within
each substep.

### Boundary conditions

| Condition | Meaning | Energy |
|---|---|---|
| Insulated | Zero normal gradient (adiabatic). Outward face conductivities are forced to zero. | Conserved exactly |
| Fixed | Edges held at ambient (Dirichlet). | Leaks to the surroundings |
| Periodic | The domain wraps. | Conserved exactly |

Screens with a flow default to **periodic**, because with insulated edges a
uniform stream carries every warm parcel off the downstream side within a few
seconds of simulated time and leaves a blank plate. Periodic edges make the flow a
steady recirculation, so a painted spot keeps travelling.

## 5. The time step

This is the modelling decision most worth understanding, because it is why the
elapsed-time readout behaves the way it does.

The explicit five-point Laplacian is stable while

```
α · dt · (1/dx² + 1/dy²) ≤ ½
```

and the simulation always integrates at **40% of that limit**, with a further cap
from the advective Courant number `|v| dt / dx ≤ 1`. It does *not* pick a step to
match wall-clock time. Instead, each frame takes a fixed budget of substeps
(8 at normal speed, scaled by the frame's actual length).

The consequence is that **simulated seconds per real second depend on the
material**. Glass permits a step ~250× larger than copper's, so a screen showing
glass advances ~250× more simulated time per frame. Both run at the same rate in
*diffusion times* — the dimensionless `Fo = αt/L²` that actually governs what the
field looks like — which is why copper and glass produce the same *sequence* of
pictures at very different clock readings.

That is the honest behaviour, and the elapsed-time readout in the status line
reports it rather than hiding it. The alternative — fixing simulated seconds per
real second — would mean either an unstable scheme or a glass plate on which
nothing visibly happens for ten minutes.

### Cost

Substeps per frame is constant, so the per-frame cost is `O(N²)` in the grid
size and independent of the material. A 2048 × 2048 grid is 256× the work of the
classroom 128 × 128 grid, which is exactly why the field lives on the GPU.

## 6. Velocity fields

The flow is prescribed, not solved — these are analytic fields, not a
Navier-Stokes solution. Each preset returns a dimensionless direction field of
magnitude ≤ 1, which the engine multiplies by the requested speed, so the speed
control and the Péclet readout have one unambiguous scale.

| Preset | Field | Note |
|---|---|---|
| Still | `v = 0` | |
| Uniform | `v = (U, 0)` | |
| Channel | `v_x = U(1 − y²/R²)` | Hagen-Poiseuille between no-slip walls |
| Vortex | Lamb-Oseen-like swirl about the centre | Zero at the core, decaying outward |
| Plume | `ψ = A sin(2πu) sin(πv)` | Two counter-rotating cells: rising in the middle, sinking at the walls |

Vortex and plume are written from a stream function, and channel is
one-dimensional, so all three are divergence-free by construction. That matters:
a compressible flow would pile temperature up at convergence points, which would
look exactly like heating and would be entirely fictitious. The
`is divergence-free for every moving preset` test checks this numerically.

The plume is the closest thing here to natural convection, but it is still
imposed — the temperature field does not drive it. Buoyancy coupling would be the
natural next step.

## 7. The Péclet number

The Heat Transfer screen's single control moves conductivity and flow speed in
opposite directions on a logarithmic scale, and reports

```
Pe = U L / α
```

where `L` is the plate width, `U` the peak flow speed, and `α` the area-weighted
mean diffusivity. Below `Pe ≈ 1` the field is shaped by conduction; above
`Pe ≈ 100` by the flow; in between both matter. The readout names the regime as
well as printing the number.

The mapping is symmetric about the midpoint —

| Balance | Conductivity | Flow | |
|---|---|---|---|
| 0.0 | × 1 | × 0.01 | conduction alone |
| 0.5 | × 0.1 | × 0.1 | comparable |
| 1.0 | × 0.01 | × 1 | flow alone |

— which sweeps roughly four decades of `Pe` while keeping the frame cost flat:
reducing conductivity raises the stable time step by exactly the factor that
raising the flow speed lowers it.

## 8. The heat brush

A stroke pulls each cell inside a disc toward the brush temperature:

```
T ← T + (T_brush − T) · s · w(r),     w(r) = (1 − r²/R²)²
```

The falloff `w` is a compactly supported bump: 1 at the centre, reaching 0 with
zero slope at the rim, so repeated strokes build a smooth blob rather than a stack
of hard discs. Because the update is a convex combination, repeated painting
*saturates* at `T_brush` and never overshoots — there is no way to paint a plate
to 10 000 °C by scribbling.

The material brush is a hard assignment instead, since a half-copper-half-foam
cell is not a material.

## 9. What is not modelled

Worth being explicit about, since each is a place a student's intuition might
reasonably go:

- **Radiation.** No `σT⁴` term. At the temperatures shown (−20 °C to 180 °C)
  radiative loss is small next to conduction in a solid, but it is not zero.
- **Convective loss to the air.** The plate does not cool to its surroundings
  unless the boundary condition is set to fixed.
- **Buoyancy.** The flow is prescribed; temperature does not drive it. The plume
  preset looks like natural convection but is imposed.
- **Phase change.** Water stays water at 180 °C.
- **Temperature-dependent properties.** `k`, `ρ`, and `c_p` are constants.
- **The third dimension.** The plate is a 2-D slab with no through-thickness
  gradient.
