/**
 * Materials.ts
 *
 * Material presets. Values are room-temperature handbook figures; the derived
 * thermal diffusivity alpha = k / (rho c_p) spans nearly four decades across this
 * list, which is the point — copper and foam are the same equation with very
 * different coefficients.
 *
 *   material     k [W/m K]   rho [kg/m^3]   c_p [J/kg K]   alpha [m^2/s]
 *   copper           401           8960            385       1.16e-4
 *   aluminum         237           2700            897       9.8e-5
 *   steel             16           8000            500       4.0e-6
 *   glass            1.0           2500            840       4.8e-7
 *   water            0.6           1000           4182       1.4e-7
 *   wood            0.15            700           1700       1.3e-7
 *   insulator       0.03             30           1500       6.7e-7
 *
 * `insulator` is rigid polyurethane foam: a *low conductivity* material whose
 * diffusivity is nevertheless higher than wood's, because it stores almost no
 * energy. That contrast is worth showing rather than smoothing over.
 */

import HeatTransferNamespace from "../../HeatTransferNamespace.js";
import type { MaterialProperties } from "./FieldTypes.js";

export const MaterialId = {
  COPPER: "copper",
  ALUMINUM: "aluminum",
  STEEL: "steel",
  GLASS: "glass",
  WATER: "water",
  WOOD: "wood",
  INSULATOR: "insulator",
} as const;

export type MaterialIdValue = (typeof MaterialId)[keyof typeof MaterialId];

/** Isotropic presets, keyed by id. */
export const MATERIALS: Record<MaterialIdValue, MaterialProperties> = {
  copper: { conductivity: 401, density: 8960, specificHeat: 385, anisotropy: 1 },
  aluminum: { conductivity: 237, density: 2700, specificHeat: 897, anisotropy: 1 },
  steel: { conductivity: 16, density: 8000, specificHeat: 500, anisotropy: 1 },
  glass: { conductivity: 1.0, density: 2500, specificHeat: 840, anisotropy: 1 },
  water: { conductivity: 0.6, density: 1000, specificHeat: 4182, anisotropy: 1 },
  wood: { conductivity: 0.15, density: 700, specificHeat: 1700, anisotropy: 1 },
  insulator: { conductivity: 0.03, density: 30, specificHeat: 1500, anisotropy: 1 },
};

/** Presentation order for combo boxes: most conductive first. */
export const MATERIAL_ORDER: readonly MaterialIdValue[] = [
  MaterialId.COPPER,
  MaterialId.ALUMINUM,
  MaterialId.STEEL,
  MaterialId.GLASS,
  MaterialId.WATER,
  MaterialId.WOOD,
  MaterialId.INSULATOR,
];

/** The material a screen starts with. */
export const DEFAULT_MATERIAL_ID: MaterialIdValue = MaterialId.COPPER;

/** Lowest conductivity in the preset list, used to normalize the material tint. */
export const MIN_PRESET_CONDUCTIVITY = MATERIALS.insulator.conductivity;

/** Highest conductivity in the preset list, used to normalize the material tint. */
export const MAX_PRESET_CONDUCTIVITY = MATERIALS.copper.conductivity;

/** Returns a copy of a preset with its anisotropy ratio replaced. */
export function withAnisotropy(material: MaterialProperties, anisotropy: number): MaterialProperties {
  return { ...material, anisotropy };
}

HeatTransferNamespace.register("Materials", {
  DEFAULT_MATERIAL_ID,
  MATERIAL_ORDER,
  MATERIALS,
  MaterialId,
});
