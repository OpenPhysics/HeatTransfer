/**
 * heatTransferQueryParameters.ts
 *
 * Sim-specific startup query parameters.
 *
 * The two interesting ones exist because the field engine's substrate is a
 * genuine variable, not an implementation detail: `resolution` chooses how many
 * cells the fields have, and `forceCpu` selects the fallback backend even where
 * WebGPU works. Together they make it possible to compare the two backends and
 * four grid sizes on the same machine, which is how the CPU reference stays
 * honest about the GPU path.
 *
 * Usage: append e.g. `?resolution=high&forceCpu=true` to the sim URL.
 */

import { logGlobal } from "scenerystack/phet-core";
import { QueryStringMachine } from "scenerystack/query-string-machine";
import { DEFAULT_RESOLUTION, RESOLUTION_PRESET_ORDER } from "../HeatTransferConstants.js";
import HeatTransferNamespace from "../HeatTransferNamespace.js";

const heatTransferQueryParameters = QueryStringMachine.getAll({
  /**
   * Grid resolution preset. Coarser presets run everywhere; finer ones need a
   * capable GPU and are clamped to what the backend can allocate.
   */
  resolution: {
    type: "string",
    defaultValue: DEFAULT_RESOLUTION,
    validValues: RESOLUTION_PRESET_ORDER,
    public: true,
  },

  /**
   * Skip WebGPU and run the CPU reference backend. Useful for comparing the two
   * implementations, and for reproducing what a student without WebGPU sees.
   */
  forceCpu: {
    type: "boolean",
    defaultValue: false,
    public: true,
  },

  /**
   * Show the field-engine status line (backend and grid size) under the field.
   * On by default: which substrate is running is part of what this simulation is
   * about, not a debugging detail.
   */
  showFieldStatus: {
    type: "boolean",
    defaultValue: true,
    public: true,
  },
});

HeatTransferNamespace.register("heatTransferQueryParameters", heatTransferQueryParameters);

// Log query parameters (for the console / PhET-iO).
logGlobal("phet.chipper.queryParameters");

export default heatTransferQueryParameters;
