/**
 * HeatTransferColors.ts
 *
 * Every dynamic colour in the simulation, as a `ProfileColorProperty` with a
 * `default` (dark) and a `projector` (light) value.
 *
 * The field itself is *not* coloured from here — temperature is mapped through
 * the ramp in `common/field/ColorMap.ts`, which is a quantitative encoding rather
 * than a theme choice and must stay identical in both profiles or the legend
 * would lie. What is here is everything drawn *over* the field (contours, arrows,
 * tracers, tools) and the ordinary UI chrome. The overlay colours are handed to
 * the field engine each frame as a `FieldRenderStyle`, so the WGSL render passes
 * follow the active profile without knowing that profiles exist.
 */
import { ProfileColorProperty } from "scenerystack/scenery";
import HeatTransferNamespace from "./HeatTransferNamespace.js";

const HeatTransferColors = {
  /**
   * Background colour for the simulation screens.
   * Deep navy in default mode; white in projector mode.
   */
  backgroundColorProperty: new ProfileColorProperty(HeatTransferNamespace, "background", {
    default: "#12141f",
    projector: "#ffffff",
  }),

  /**
   * Primary accent for highlights, selected items, and key UI elements.
   * Warm amber in both profiles — it reads as "heat" and stays legible on either
   * background.
   */
  accentColorProperty: new ProfileColorProperty(HeatTransferNamespace, "accent", {
    default: "#ffb347",
    projector: "#b35c00",
  }),

  /** Background fill for control panels and dialogs. */
  panelBackgroundColorProperty: new ProfileColorProperty(HeatTransferNamespace, "panelBackground", {
    default: "#1b1f2e",
    projector: "#f5f5f5",
  }),

  /** Border / stroke colour for control panels and dialogs. */
  panelBorderColorProperty: new ProfileColorProperty(HeatTransferNamespace, "panelBorder", {
    default: "#333a52",
    projector: "#999999",
  }),

  /** Text colour for labels, readouts, and general UI text on the panel fill. */
  textColorProperty: new ProfileColorProperty(HeatTransferNamespace, "text", {
    default: "#e6e6ea",
    projector: "#1a1a1a",
  }),

  /** Secondary text: units, hints, and annotations. */
  secondaryTextColorProperty: new ProfileColorProperty(HeatTransferNamespace, "secondaryText", {
    default: "#9aa0b4",
    projector: "#5a5a5a",
  }),

  // ── Field overlays ──────────────────────────────────────────────────────────
  // Drawn on top of the temperature colour map, so these must contrast with the
  // *ramp*, not with the page background. They change only slightly between
  // profiles: the ramp is the same in both, so what works over it works over it.

  /** Isotherm contour lines. */
  isothermColorProperty: new ProfileColorProperty(HeatTransferNamespace, "isotherm", {
    default: "#12141f",
    projector: "#12141f",
  }),

  /** Heat-flux arrows. */
  heatFluxColorProperty: new ProfileColorProperty(HeatTransferNamespace, "heatFlux", {
    default: "#f2f2f5",
    projector: "#111111",
  }),

  /** Velocity tracer particles. */
  particleColorProperty: new ProfileColorProperty(HeatTransferNamespace, "particle", {
    default: "#ffffff",
    projector: "#1a1a1a",
  }),

  /** Frame drawn around the field view. */
  fieldBorderColorProperty: new ProfileColorProperty(HeatTransferNamespace, "fieldBorder", {
    default: "#4a5170",
    projector: "#666666",
  }),

  // ── Tools ───────────────────────────────────────────────────────────────────

  /** Body of the temperature probe. */
  probeColorProperty: new ProfileColorProperty(HeatTransferNamespace, "probe", {
    default: "#e6e6ea",
    projector: "#1a1a1a",
  }),

  /** The cross-section line and its handles. */
  crossSectionColorProperty: new ProfileColorProperty(HeatTransferNamespace, "crossSection", {
    default: "#7fe3ff",
    projector: "#005f87",
  }),

  /** Ring showing where the brush will deposit. */
  brushOutlineColorProperty: new ProfileColorProperty(HeatTransferNamespace, "brushOutline", {
    default: "#ffffff",
    projector: "#222222",
  }),

  // ── Graph ───────────────────────────────────────────────────────────────────

  /** Plot background for the cross-section graph. */
  graphBackgroundColorProperty: new ProfileColorProperty(HeatTransferNamespace, "graphBackground", {
    default: "#0d0f18",
    projector: "#ffffff",
  }),

  /** Axes and frame of the cross-section graph. */
  graphAxisColorProperty: new ProfileColorProperty(HeatTransferNamespace, "graphAxis", {
    default: "#5a6280",
    projector: "#777777",
  }),

  /** The T(s) curve on the cross-section graph. */
  temperatureCurveColorProperty: new ProfileColorProperty(HeatTransferNamespace, "temperatureCurve", {
    default: "#ffb347",
    projector: "#c1440e",
  }),

  /** The q_s(s) curve on the cross-section graph. */
  fluxCurveColorProperty: new ProfileColorProperty(HeatTransferNamespace, "fluxCurve", {
    default: "#7fe3ff",
    projector: "#005f87",
  }),

  // ── Light control surfaces ──────────────────────────────────────────────────
  // White chrome (combo boxes, flat push buttons, editable input fields) stays
  // light in both profiles; its text stays dark. Identical values in both
  // profiles, but defined here so every colour lives in one themeable place.

  /** Fill of light control surfaces: combo-box button/list, editable input fields. */
  controlSurfaceColorProperty: new ProfileColorProperty(HeatTransferNamespace, "controlSurface", {
    default: "#ffffff",
    projector: "#ffffff",
  }),

  /** Fill of a disabled control surface (grayed-out editable input field). */
  controlSurfaceDisabledColorProperty: new ProfileColorProperty(HeatTransferNamespace, "controlSurfaceDisabled", {
    default: "#cccccc",
    projector: "#cccccc",
  }),

  /** Text on light control surfaces: combo items, flat-button labels, preferences. */
  controlSurfaceTextColorProperty: new ProfileColorProperty(HeatTransferNamespace, "controlSurfaceText", {
    default: "#1a1a1a",
    projector: "#1a1a1a",
  }),
};

export default HeatTransferColors;
