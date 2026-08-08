/**
 * ProbeNode.ts
 *
 * A draggable point sampler with a live temperature readout.
 *
 * The lesson this tool carries is that *every* point of the surface has a
 * temperature — the colour is not decoration over a few hot spots, it is a
 * function defined everywhere. So the readout stays visible while the probe
 * moves, updates continuously as the field evolves under a stationary probe, and
 * never snaps to a cell: it reads the bilinearly interpolated value, the same one
 * the renderer shades with.
 *
 * On the WebGPU backend the sample comes from the CPU mirror of the temperature
 * texture, which is refreshed every few frames. A student cannot perceive the
 * lag; a pipeline stall every frame would be very perceptible indeed.
 */

import { DerivedProperty, PatternStringProperty } from "scenerystack/axon";
import { Vector2 } from "scenerystack/dot";
import { Shape } from "scenerystack/kite";
import { Circle, DragListener, KeyboardDragListener, Node, type NodeOptions, Path, Text } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import HeatTransferColors from "../../HeatTransferColors.js";
import { LABEL_FONT_SIZE } from "../../HeatTransferConstants.js";
import HeatTransferNamespace from "../../HeatTransferNamespace.js";
import { StringManager } from "../../i18n/StringManager.js";
import type { FieldSimulationModel } from "../model/FieldSimulationModel.js";
import type { FieldNode } from "./FieldNode.js";
import { formatCelsius } from "./formatters.js";

/** Radius of the probe's ring, in view coordinates. */
const RING_RADIUS = 9;

/** Height of the readout bubble. */
const BUBBLE_HEIGHT = 26;

/** Fraction of the field a keyboard arrow press moves the probe. */
const KEYBOARD_STEP = 0.02;

export class ProbeNode extends Node {
  public constructor(model: FieldSimulationModel, fieldNode: FieldNode, providedOptions?: NodeOptions) {
    super();

    const strings = StringManager.getInstance();
    const a11y = strings.getSharedA11yStrings();

    // ── Readout bubble ────────────────────────────────────────────────────────

    const readoutText = new PatternStringProperty(strings.getReadouts().celsiusStringProperty, {
      value: new DerivedProperty([model.probeTemperatureProperty], (kelvin) => formatCelsius(kelvin)),
    });

    const label = new Text(readoutText, {
      font: new PhetFont({ size: LABEL_FONT_SIZE, weight: "bold" }),
      fill: HeatTransferColors.controlSurfaceTextColorProperty,
    });

    const bubble = new Path(null, {
      fill: HeatTransferColors.controlSurfaceColorProperty,
      stroke: HeatTransferColors.probeColorProperty,
      lineWidth: 1.5,
    });

    // The bubble is redrawn rather than scaled so its corner radius stays constant
    // as the number inside changes width.
    label.boundsProperty.link(() => {
      const width = Math.max(56, label.width + 16);
      bubble.shape = Shape.roundRectangle(-width / 2, -BUBBLE_HEIGHT - RING_RADIUS - 6, width, BUBBLE_HEIGHT, 5, 5);
      label.centerX = 0;
      label.centerY = -BUBBLE_HEIGHT / 2 - RING_RADIUS - 6;
    });

    // ── Crosshair ─────────────────────────────────────────────────────────────

    const ring = new Circle(RING_RADIUS, {
      stroke: HeatTransferColors.probeColorProperty,
      lineWidth: 2.5,
    });
    const crosshair = new Path(
      new Shape()
        .moveTo(-RING_RADIUS - 5, 0)
        .lineTo(RING_RADIUS + 5, 0)
        .moveTo(0, -RING_RADIUS - 5)
        .lineTo(0, RING_RADIUS + 5),
      { stroke: HeatTransferColors.probeColorProperty, lineWidth: 1.5 },
    );

    this.children = [bubble, label, ring, crosshair];

    // ── Position ──────────────────────────────────────────────────────────────

    model.probePositionProperty.link((position) => {
      this.translation = fieldNode.unitToLocal(position.x, position.y);
    });

    const moveTo = (localPoint: Vector2): void => {
      model.probePositionProperty.value = new Vector2(
        Math.min(1, Math.max(0, localPoint.x / fieldNode.viewSize)),
        Math.min(1, Math.max(0, localPoint.y / fieldNode.viewSize)),
      );
    };

    this.addInputListener(
      new DragListener({
        drag: (event) => {
          moveTo(fieldNode.globalToLocalPoint(event.pointer.point));
        },
      }),
    );

    this.addInputListener(
      new KeyboardDragListener({
        dragSpeed: 300,
        shiftDragSpeed: 80,
        drag: (_event, listener) => {
          const delta = listener.modelDelta;
          const current = model.probePositionProperty.value;
          model.probePositionProperty.value = new Vector2(
            Math.min(1, Math.max(0, current.x + (delta.x / fieldNode.viewSize) * KEYBOARD_STEP * 50)),
            Math.min(1, Math.max(0, current.y + (delta.y / fieldNode.viewSize) * KEYBOARD_STEP * 50)),
          );
        },
      }),
    );

    this.mutate({
      cursor: "pointer",
      tagName: "div",
      focusable: true,
      accessibleName: a11y.controls.probeStringProperty,
      accessibleHelpText: a11y.controls.probeHelpStringProperty,
      ...providedOptions,
    });

    model.probeVisibleProperty.link((visible) => {
      this.visible = visible;
    });
  }
}

HeatTransferNamespace.register("ProbeNode", ProbeNode);
