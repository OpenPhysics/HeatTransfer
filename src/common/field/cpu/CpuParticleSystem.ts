/**
 * CpuParticleSystem.ts
 *
 * Tracer particles for the velocity layer, advected on the CPU.
 *
 * Particles are pure visualization — they carry no heat and never feed back into
 * the temperature field. Each one drifts with the local velocity, ages out after
 * {@link PARTICLE_LIFETIME_S} of simulated time, and respawns at a fresh random
 * position so a steady flow keeps a steady density of tracers instead of
 * draining into stagnation points.
 *
 * The WebGPU backend does the same job in a compute shader over a storage
 * buffer; the spawn and ageing rules are deliberately identical so the two
 * backends look the same.
 */

import { PARTICLE_LIFETIME_S } from "../../../HeatTransferConstants.js";
import type { SimulationDomain } from "../SimulationDomain.js";

export class CpuParticleSystem {
  /** Interleaved (u, v) positions in the unit square. */
  public readonly positions: Float32Array;

  /** Remaining life of each particle, in simulated seconds. */
  private readonly ages: Float32Array;

  private readonly count: number;
  private readonly domain: SimulationDomain;

  public constructor(domain: SimulationDomain, count: number) {
    this.domain = domain;
    this.count = count;
    this.positions = new Float32Array(2 * count);
    this.ages = new Float32Array(count);
    this.reset();
  }

  /** Scatters every particle and randomizes its remaining life. */
  public reset(): void {
    for (let n = 0; n < this.count; n++) {
      this.respawn(n, Math.random() * PARTICLE_LIFETIME_S);
    }
  }

  private respawn(n: number, life: number): void {
    this.positions[2 * n] = Math.random();
    this.positions[2 * n + 1] = Math.random();
    this.ages[n] = life;
  }

  /**
   * Advances every particle by `dt` simulated seconds through the velocity field.
   *
   * @param velocity - interleaved (vx, vy) in m/s, one pair per cell
   * @param dt - simulated time step, in seconds
   * @param flowScale - multiplier matching the one the advection kernel used
   */
  public step(velocity: Float32Array, dt: number, flowScale: number): void {
    const { gridWidth, gridHeight, physicalWidth, physicalHeight } = this.domain;

    for (let n = 0; n < this.count; n++) {
      const life = (this.ages[n] ?? 0) - dt;
      if (life <= 0) {
        this.respawn(n, PARTICLE_LIFETIME_S);
        continue;
      }
      this.ages[n] = life;

      const u = this.positions[2 * n] ?? 0;
      const v = this.positions[2 * n + 1] ?? 0;

      // Nearest-cell velocity lookup: particles are dense and small, so the extra
      // smoothness of a bilinear fetch is not worth the cost here.
      const i = Math.min(gridWidth - 1, Math.max(0, Math.floor(u * gridWidth)));
      const j = Math.min(gridHeight - 1, Math.max(0, Math.floor(v * gridHeight)));
      const cell = 2 * (j * gridWidth + i);
      const vx = (velocity[cell] ?? 0) * flowScale;
      const vy = (velocity[cell + 1] ?? 0) * flowScale;

      // Velocity is metres/second; positions are in the unit square.
      // Wrap rather than respawn: a tracer that leaves one side re-enters the
      // other, which is what makes a uniform flow read as a steady stream. (The
      // advection kernel wraps too whenever the boundary is periodic, so the
      // tracers and the temperature they mark stay together.)
      const nextU = wrapUnit(u + (vx * dt) / physicalWidth);
      const nextV = wrapUnit(v + (vy * dt) / physicalHeight);
      this.positions[2 * n] = nextU;
      this.positions[2 * n + 1] = nextV;
    }
  }

  /** Fraction of life remaining, used to fade particles in and out. */
  public opacityAt(n: number): number {
    const life = (this.ages[n] ?? 0) / PARTICLE_LIFETIME_S;
    // Triangular fade so particles neither pop in nor pop out.
    return Math.min(1, 2 * Math.min(life, 1 - life) * 2);
  }

  public get particleCount(): number {
    return this.count;
  }
}

/** Wraps a unit-square coordinate into [0, 1). */
function wrapUnit(value: number): number {
  return value - Math.floor(value);
}
