/**
 * CrossSectionToolNode.ts
 *
 * The line the student drags across the field, and its two handles.
 *
 * This is the bridge between the picture and the mathematics: the field is a
 * function of two variables, and restricting it to a line turns it into a
 * function of one, which is the form every textbook derivation is written in.
 * Dragging the line and watching T(s) change shape alongside it is the whole
 * point of the tool, so the graph updates continuously rather than on release.
 */

import { Vector2 } from "scenerystack/dot";
import { Shape } from "scenerystack/kite";
import { Circle, DragListener, KeyboardDragListener, Node, type NodeOptions, Path } from "scenerystack/scenery";
import HeatTransferColors from "../../HeatTransferColors.js";
import HeatTransferNamespace from "../../HeatTransferNamespace.js";
import { StringManager } from "../../i18n/StringManager.js";
import type { FieldSimulationModel } from "../model/FieldSimulationModel.js";
import type { FieldNode } from "./FieldNode.js";

/** Radius of a drag handle, in view coordinates. */
const HANDLE_RADIUS = 8;

/** How far one keyboard drag step moves a handle, as a fraction of the field. */
const KEYBOARD_SCALE = 0.5;

export class CrossSectionToolNode extends Node {
  /** The two handles, in traversal order. */
  public readonly handles: readonly Node[];

  public constructor(model: FieldSimulationModel, fieldNode: FieldNode, providedOptions?: NodeOptions) {
    super();

    const strings = StringManager.getInstance();
    const a11y = strings.getSharedA11yStrings();

    const line = new Path(null, {
      stroke: HeatTransferColors.crossSectionColorProperty,
      lineWidth: 2.5,
      lineDash: [7, 4],
      pickable: false,
    });
    this.addChild(line);

    const makeHandle = (
      positionProperty: typeof model.crossSectionStartProperty,
      accessibleName: typeof a11y.controls.crossSectionStartStringProperty,
    ): Node => {
      const handle = new Circle(HANDLE_RADIUS, {
        fill: HeatTransferColors.crossSectionColorProperty,
        stroke: HeatTransferColors.brushOutlineColorProperty,
        lineWidth: 1.5,
        cursor: "pointer",
        tagName: "div",
        focusable: true,
        accessibleName,
      });

      const clampToField = (u: number, v: number): Vector2 =>
        new Vector2(Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v)));

      handle.addInputListener(
        new DragListener({
          drag: (event) => {
            const local = fieldNode.globalToLocalPoint(event.pointer.point);
            positionProperty.value = clampToField(local.x / fieldNode.viewSize, local.y / fieldNode.viewSize);
          },
        }),
      );

      handle.addInputListener(
        new KeyboardDragListener({
          dragSpeed: 300,
          shiftDragSpeed: 80,
          drag: (_event, listener) => {
            const delta = listener.modelDelta;
            const current = positionProperty.value;
            positionProperty.value = clampToField(
              current.x + (delta.x / fieldNode.viewSize) * KEYBOARD_SCALE,
              current.y + (delta.y / fieldNode.viewSize) * KEYBOARD_SCALE,
            );
          },
        }),
      );

      positionProperty.link((position) => {
        handle.translation = fieldNode.unitToLocal(position.x, position.y);
      });

      return handle;
    };

    const startHandle = makeHandle(model.crossSectionStartProperty, a11y.controls.crossSectionStartStringProperty);
    const endHandle = makeHandle(model.crossSectionEndProperty, a11y.controls.crossSectionEndStringProperty);
    this.addChild(startHandle);
    this.addChild(endHandle);
    this.handles = [startHandle, endHandle];

    const redraw = (): void => {
      const start = fieldNode.unitToLocal(
        model.crossSectionStartProperty.value.x,
        model.crossSectionStartProperty.value.y,
      );
      const end = fieldNode.unitToLocal(model.crossSectionEndProperty.value.x, model.crossSectionEndProperty.value.y);
      line.shape = new Shape().moveTo(start.x, start.y).lineTo(end.x, end.y);
    };
    model.crossSectionStartProperty.link(redraw);
    model.crossSectionEndProperty.link(redraw);

    model.crossSectionVisibleProperty.link((visible) => {
      this.visible = visible;
      if (visible) {
        model.refreshCrossSection();
      }
    });

    this.mutate(providedOptions ?? {});
  }
}

HeatTransferNamespace.register("CrossSectionToolNode", CrossSectionToolNode);
