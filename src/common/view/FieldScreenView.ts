/**
 * FieldScreenView.ts
 *
 * The layout and frame loop every screen shares.
 *
 * All five screens are the same picture — a square field, a legend beside it, two
 * columns of controls, a clock underneath — differing only in which panels appear
 * and which layers are on. Putting that skeleton here means a screen file is a
 * short list of what it offers, and it guarantees that a control means the same
 * thing and sits in the same place wherever a student meets it.
 *
 * The frame loop
 * ──────────────
 * `step(dt)` does three things in a fixed order:
 *
 *   1. advance the model, which advances the fields on the GPU
 *   2. run the visualization passes over the new state
 *   3. tell Scenery the canvas changed
 *
 * Step 2 reads the overlay colours out of `HeatTransferColors` each frame, which
 * is what lets the WGSL render passes follow the active colour profile without
 * knowing profiles exist.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import type { Color } from "scenerystack/scenery";
import { Node, Rectangle, Text, VBox } from "scenerystack/scenery";
import { PhetFont, ResetAllButton, TimeControlNode } from "scenerystack/scenery-phet";
import { ScreenView, type ScreenViewOptions } from "scenerystack/sim";
import { RectangularPushButton } from "scenerystack/sun";
import HeatTransferColors from "../../HeatTransferColors.js";
import {
  CONTROL_COLUMN_LEFT,
  CONTROL_COLUMN_RIGHT,
  FIELD_VIEW_LEFT,
  FIELD_VIEW_SIZE,
  FIELD_VIEW_TOP,
  ISOTHERM_INTERVAL_K,
  LABEL_FONT_SIZE,
  LEGEND_LEFT,
  MAX_TEMPERATURE_K,
  MIN_TEMPERATURE_K,
  PANEL_SPACING,
  SCREEN_VIEW_MARGIN,
  WIDE_AREA_TOP,
} from "../../HeatTransferConstants.js";
import HeatTransferNamespace from "../../HeatTransferNamespace.js";
import { StringManager } from "../../i18n/StringManager.js";
import type { Rgb } from "../field/ColorMap.js";
import type { FieldRenderStyle } from "../field/FieldEngine.js";
import {
  FLAT_PLAY_PAUSE_STEP_BUTTON_OPTIONS,
  FLAT_RECTANGULAR_BUTTON_OPTIONS,
  FLAT_RESET_ALL_BUTTON_OPTIONS,
  TIME_CONTROL_SPEED_RADIO_OPTIONS,
} from "../HeatTransferButtonOptions.js";
import type { FieldSimulationModel } from "../model/FieldSimulationModel.js";
import { CrossSectionToolNode } from "./CrossSectionToolNode.js";
import { FieldNode } from "./FieldNode.js";
import { FieldStatusNode } from "./FieldStatusNode.js";
import { ProbeNode } from "./ProbeNode.js";
import { TemperatureLegendNode } from "./TemperatureLegendNode.js";

export type FieldScreenViewOptions = ScreenViewOptions & {
  /** Accessible name for the field itself. */
  fieldAccessibleName: TReadOnlyProperty<string>;
  /** Accessible help text for the field. */
  fieldAccessibleHelpText: TReadOnlyProperty<string>;
  /** Whether the heat/material brush is available on this screen. */
  paintingEnabled?: boolean;
  /** Whether the probe tool is created. */
  probeEnabled?: boolean;
  /** Whether the cross-section tool is created. */
  crossSectionEnabled?: boolean;
  /** Whether the field-engine status line is shown, from Preferences. */
  showFieldStatusProperty: TReadOnlyProperty<boolean>;
};

export abstract class FieldScreenView extends ScreenView {
  protected readonly model: FieldSimulationModel;
  protected readonly fieldNode: FieldNode;

  /** Parent for combo-box popup lists, kept above every panel. */
  protected readonly comboBoxLayer: Node;

  /** Left control column. Subclasses push panels into it before calling `finishLayout`. */
  protected readonly leftColumn: VBox;

  /** Right control column. */
  protected readonly rightColumn: VBox;

  /** Full-width area under both columns, for anything too wide for one column. */
  protected readonly wideArea: VBox;

  protected readonly probeNode: ProbeNode | null;
  protected readonly crossSectionNode: CrossSectionToolNode | null;

  private readonly resetAllButton: ResetAllButton;
  private readonly clearFieldButton: RectangularPushButton;
  private readonly timeControlNode: TimeControlNode;

  protected constructor(model: FieldSimulationModel, providedOptions: FieldScreenViewOptions) {
    super(providedOptions);

    this.model = model;
    const strings = StringManager.getInstance();
    const controls = strings.getControls();
    const a11y = strings.getSharedA11yStrings();

    // ── Background ────────────────────────────────────────────────────────────

    this.addChild(
      new Rectangle(0, 0, this.layoutBounds.width, this.layoutBounds.height, {
        fill: HeatTransferColors.backgroundColorProperty,
        pickable: false,
      }),
    );

    // ── The field ─────────────────────────────────────────────────────────────

    this.fieldNode = new FieldNode(model, {
      x: FIELD_VIEW_LEFT,
      y: FIELD_VIEW_TOP,
      accessibleName: providedOptions.fieldAccessibleName,
      accessibleHelpText: providedOptions.fieldAccessibleHelpText,
      paintingEnabled: providedOptions.paintingEnabled ?? true,
    });
    this.addChild(this.fieldNode);

    // ── Tools, drawn in the field's coordinate frame ──────────────────────────

    this.probeNode = (providedOptions.probeEnabled ?? true) ? new ProbeNode(model, this.fieldNode) : null;
    if (this.probeNode) {
      this.fieldNode.addChild(this.probeNode);
    }

    this.crossSectionNode = providedOptions.crossSectionEnabled
      ? new CrossSectionToolNode(model, this.fieldNode)
      : null;
    if (this.crossSectionNode) {
      this.fieldNode.addChild(this.crossSectionNode);
    }

    // ── Legend ────────────────────────────────────────────────────────────────

    this.addChild(
      new TemperatureLegendNode({
        x: LEGEND_LEFT,
        y: FIELD_VIEW_TOP,
        barHeight: FIELD_VIEW_SIZE,
        minTemperatureProperty: model.minTemperatureProperty,
        maxTemperatureProperty: model.maxTemperatureProperty,
      }),
    );

    // ── Status line ───────────────────────────────────────────────────────────

    const statusNode = new FieldStatusNode(model, {
      left: FIELD_VIEW_LEFT,
      top: FIELD_VIEW_TOP + FIELD_VIEW_SIZE + 8,
      visibleProperty: providedOptions.showFieldStatusProperty,
    });
    this.addChild(statusNode);

    // ── Control columns ───────────────────────────────────────────────────────

    this.leftColumn = new VBox({
      align: "left",
      spacing: PANEL_SPACING,
      x: CONTROL_COLUMN_LEFT,
      y: FIELD_VIEW_TOP,
    });
    this.rightColumn = new VBox({
      align: "left",
      spacing: PANEL_SPACING,
      x: CONTROL_COLUMN_RIGHT,
      y: FIELD_VIEW_TOP,
    });
    this.wideArea = new VBox({
      align: "left",
      spacing: PANEL_SPACING,
      x: CONTROL_COLUMN_LEFT,
      y: WIDE_AREA_TOP,
    });
    this.addChild(this.leftColumn);
    this.addChild(this.rightColumn);
    this.addChild(this.wideArea);

    // ── Clock and buttons ─────────────────────────────────────────────────────

    this.timeControlNode = new TimeControlNode(model.isPlayingProperty, {
      timeSpeedProperty: model.timeSpeedProperty,
      playPauseStepButtonOptions: {
        ...FLAT_PLAY_PAUSE_STEP_BUTTON_OPTIONS,
        stepForwardButtonOptions: {
          ...FLAT_PLAY_PAUSE_STEP_BUTTON_OPTIONS.stepForwardButtonOptions,
          listener: () => {
            model.stepOnce();
          },
        },
      },
      ...TIME_CONTROL_SPEED_RADIO_OPTIONS,
      centerX: FIELD_VIEW_LEFT + FIELD_VIEW_SIZE / 2,
      top: FIELD_VIEW_TOP + FIELD_VIEW_SIZE + 30,
    });
    this.addChild(this.timeControlNode);

    this.clearFieldButton = new RectangularPushButton({
      ...FLAT_RECTANGULAR_BUTTON_OPTIONS,
      content: new Text(controls.clearFieldStringProperty, {
        font: new PhetFont(LABEL_FONT_SIZE),
        fill: HeatTransferColors.controlSurfaceTextColorProperty,
        maxWidth: 120,
      }),
      baseColor: HeatTransferColors.controlSurfaceColorProperty,
      listener: () => {
        model.engine.resetField(model.config.initialCondition);
      },
      accessibleName: controls.clearFieldStringProperty,
      accessibleHelpText: a11y.controls.clearFieldStringProperty,
      left: LEGEND_LEFT,
      centerY: this.timeControlNode.centerY,
    });
    this.addChild(this.clearFieldButton);

    this.resetAllButton = new ResetAllButton({
      ...FLAT_RESET_ALL_BUTTON_OPTIONS,
      listener: () => {
        model.reset();
        this.reset();
      },
      right: this.layoutBounds.maxX - SCREEN_VIEW_MARGIN,
      bottom: this.layoutBounds.maxY - SCREEN_VIEW_MARGIN,
    });
    this.addChild(this.resetAllButton);

    // Combo-box popups must sit above every panel, so their parent is added last.
    this.comboBoxLayer = new Node();
    this.addChild(this.comboBoxLayer);
  }

  /**
   * Sets the keyboard traversal order. Subclasses call this at the end of their
   * constructor with their own interactive nodes; the field comes first and Reset
   * All comes last, always.
   *
   * `ScreenView` throws if `pdomOrder` is set on itself, so the order lives on a
   * lightweight wrapper node.
   */
  protected finishLayout(screenControls: readonly Node[]): void {
    const tools: Node[] = [];
    if (this.probeNode) {
      tools.push(this.probeNode);
    }
    if (this.crossSectionNode) {
      tools.push(...this.crossSectionNode.handles);
    }

    this.addChild(
      new Node({
        pdomOrder: [
          this.fieldNode,
          ...tools,
          ...screenControls,
          this.timeControlNode,
          this.clearFieldButton,
          this.resetAllButton,
        ],
      }),
    );
  }

  /** Resets view-side state. Subclasses override and call `super.reset()`. */
  public reset(): void {
    // The model owns all persistent state; nothing view-side survives a reset.
  }

  /**
   * Advance, draw, present.
   *
   * `step` is called even while the sim is paused, so the render passes still run
   * and a layer toggled off-clock takes effect immediately.
   */
  public override step(dt: number): void {
    this.model.step(dt);
    this.model.engine.render(this.model.getLayerVisibility(), this.renderStyle());
    this.fieldNode.updateImage();
  }

  /** Reads the overlay colours out of the active colour profile. */
  private renderStyle(): FieldRenderStyle {
    return {
      isotherm: toRgb(HeatTransferColors.isothermColorProperty.value),
      arrow: toRgb(HeatTransferColors.heatFluxColorProperty.value),
      particle: toRgb(HeatTransferColors.particleColorProperty.value),
      minTemperature: MIN_TEMPERATURE_K,
      maxTemperature: MAX_TEMPERATURE_K,
      isothermInterval: ISOTHERM_INTERVAL_K,
    };
  }
}

/** Converts a Scenery `Color` to the 0-1 triple the field engine expects. */
function toRgb(color: Color): Rgb {
  return { red: color.red / 255, green: color.green / 255, blue: color.blue / 255 };
}

HeatTransferNamespace.register("FieldScreenView", FieldScreenView);
