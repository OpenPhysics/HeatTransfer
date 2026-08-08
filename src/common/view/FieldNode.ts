/**
 * FieldNode.ts
 *
 * The field's window into the scene graph.
 *
 * This is the whole of the Scenery/WebGPU boundary: a single `Image` wrapping the
 * canvas the field engine renders into, plus the input that turns pointer and
 * keyboard gestures into brush strokes in unit-square coordinates. There is one
 * node here no matter how many cells the grid has — a 1024 x 1024 field is the
 * same one node as a 128 x 128 one, which is the entire reason the field is a GPU
 * texture rather than a lattice of Rectangles.
 *
 * Scenery's `Image` only ever advertises the Canvas and WebGL renderers for a
 * canvas source (never SVG, which would have to re-encode a data URL every
 * frame), so compositing the engine's output costs one `drawImage` per frame.
 *
 * Keyboard parity
 * ───────────────
 * Painting must not require a pointer. When the field has focus, the arrow keys
 * move a visible paint cursor and space or enter deposits a stroke there; holding
 * shift moves the cursor in finer increments. The cursor is the keyboard's
 * equivalent of the hover ring, so both routes show the student the same thing
 * before they commit to it.
 */

import { DerivedProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { Vector2 } from "scenerystack/dot";
import { Shape } from "scenerystack/kite";
import {
  Circle,
  DragListener,
  Image,
  KeyboardListener,
  Node,
  type NodeOptions,
  Path,
  Rectangle,
} from "scenerystack/scenery";
import HeatTransferColors from "../../HeatTransferColors.js";
import { FIELD_VIEW_SIZE } from "../../HeatTransferConstants.js";
import HeatTransferNamespace from "../../HeatTransferNamespace.js";
import type { FieldSimulationModel } from "../model/FieldSimulationModel.js";

/** Fraction of the field the keyboard cursor moves per arrow-key press. */
const KEYBOARD_STEP = 0.05;

/** Finer keyboard step, used while shift is held. */
const KEYBOARD_FINE_STEP = 0.01;

export type FieldNodeOptions = NodeOptions & {
  /** Accessible name for the field itself. */
  accessibleName: TReadOnlyProperty<string>;
  /** Accessible help text describing how to paint. */
  accessibleHelpText: TReadOnlyProperty<string>;
  /** Whether the brush is available on this screen. */
  paintingEnabled?: boolean;
};

export class FieldNode extends Node {
  /** Side length of the field on screen, in view coordinates. */
  public readonly viewSize: number;

  private readonly model: FieldSimulationModel;
  private readonly fieldImage: Image;

  /** Ring showing where a pointer stroke would land. */
  private readonly hoverRing: Circle;

  /** Cross-hair showing where a keyboard stroke would land. */
  private readonly keyboardCursor: Path;

  /** Keyboard paint position, in the unit square. */
  private keyboardPosition = new Vector2(0.5, 0.5);

  public constructor(model: FieldSimulationModel, providedOptions: FieldNodeOptions) {
    super();

    this.model = model;
    this.viewSize = FIELD_VIEW_SIZE;
    const paintingEnabled = providedOptions.paintingEnabled ?? true;

    // ── The field ─────────────────────────────────────────────────────────────
    // One Image over the engine's canvas, scaled from its device-pixel backing
    // size to the view's layout size.

    const canvas = model.engine.canvas;
    this.fieldImage = new Image(canvas, {
      scale: this.viewSize / canvas.width,
    });
    this.addChild(this.fieldImage);

    const border = new Rectangle(0, 0, this.viewSize, this.viewSize, {
      stroke: HeatTransferColors.fieldBorderColorProperty,
      lineWidth: 1.5,
      pickable: false,
    });
    this.addChild(border);

    // ── Brush affordances ─────────────────────────────────────────────────────

    this.hoverRing = new Circle(this.brushRadiusInView(), {
      stroke: HeatTransferColors.brushOutlineColorProperty,
      lineWidth: 1.5,
      lineDash: [4, 3],
      visible: false,
      pickable: false,
    });
    this.addChild(this.hoverRing);

    this.keyboardCursor = new Path(null, {
      stroke: HeatTransferColors.brushOutlineColorProperty,
      lineWidth: 2,
      visible: false,
      pickable: false,
    });
    this.addChild(this.keyboardCursor);

    model.brushRadiusProperty.link(() => {
      this.hoverRing.radius = this.brushRadiusInView();
      this.updateKeyboardCursor();
    });

    // ── Input ─────────────────────────────────────────────────────────────────

    if (paintingEnabled) {
      this.cursor = "crosshair";
      this.addInputListener(
        new DragListener({
          press: (event) => {
            this.paintAtGlobalPoint(event.pointer.point);
          },
          drag: (event) => {
            this.paintAtGlobalPoint(event.pointer.point);
          },
        }),
      );

      this.addInputListener({
        enter: (event) => {
          this.hoverRing.visible = true;
          this.moveHoverRing(event.pointer.point);
        },
        move: (event) => {
          this.moveHoverRing(event.pointer.point);
        },
        exit: () => {
          this.hoverRing.visible = false;
        },
      });

      this.addInputListener({
        focus: () => {
          this.keyboardCursor.visible = true;
          this.updateKeyboardCursor();
        },
        blur: () => {
          this.keyboardCursor.visible = false;
        },
      });

      this.addInputListener(
        new KeyboardListener({
          keys: [
            "arrowLeft",
            "arrowRight",
            "arrowUp",
            "arrowDown",
            "shift+arrowLeft",
            "shift+arrowRight",
            "shift+arrowUp",
            "shift+arrowDown",
            "space",
            "enter",
          ],
          fire: (_event, keysPressed) => {
            this.handleKey(keysPressed);
          },
        }),
      );
    }

    this.mutate({
      tagName: "div",
      focusable: paintingEnabled,
      ...providedOptions,
    });
  }

  /** Pushes the latest engine output to the display. Called once per frame by the ScreenView. */
  public updateImage(): void {
    this.fieldImage.invalidateImage();
  }

  // ── Coordinate conversion ───────────────────────────────────────────────────

  /** Converts a global point to unit-square field coordinates, clamped to the field. */
  private globalToUnit(globalPoint: Vector2): Vector2 {
    const local = this.globalToLocalPoint(globalPoint);
    return new Vector2(
      Math.min(1, Math.max(0, local.x / this.viewSize)),
      Math.min(1, Math.max(0, local.y / this.viewSize)),
    );
  }

  /** Converts unit-square field coordinates to this node's local frame. */
  public unitToLocal(u: number, v: number): Vector2 {
    return new Vector2(u * this.viewSize, v * this.viewSize);
  }

  private brushRadiusInView(): number {
    return this.model.brushRadiusProperty.value * this.viewSize;
  }

  // ── Painting ────────────────────────────────────────────────────────────────

  private paintAtGlobalPoint(globalPoint: Vector2): void {
    const unit = this.globalToUnit(globalPoint);
    this.model.paintAt(unit.x, unit.y);
    this.moveHoverRing(globalPoint);
  }

  private moveHoverRing(globalPoint: Vector2): void {
    const unit = this.globalToUnit(globalPoint);
    this.hoverRing.translation = this.unitToLocal(unit.x, unit.y);
  }

  private handleKey(keysPressed: string): void {
    if (keysPressed === "space" || keysPressed === "enter") {
      this.model.paintAt(this.keyboardPosition.x, this.keyboardPosition.y);
      return;
    }

    const step = keysPressed.startsWith("shift+") ? KEYBOARD_FINE_STEP : KEYBOARD_STEP;
    const key = keysPressed.replace("shift+", "");
    const delta =
      key === "arrowLeft"
        ? new Vector2(-step, 0)
        : key === "arrowRight"
          ? new Vector2(step, 0)
          : key === "arrowUp"
            ? new Vector2(0, -step)
            : new Vector2(0, step);

    this.keyboardPosition = new Vector2(
      Math.min(1, Math.max(0, this.keyboardPosition.x + delta.x)),
      Math.min(1, Math.max(0, this.keyboardPosition.y + delta.y)),
    );
    this.updateKeyboardCursor();
  }

  private updateKeyboardCursor(): void {
    const centre = this.unitToLocal(this.keyboardPosition.x, this.keyboardPosition.y);
    const radius = this.brushRadiusInView();
    const arm = Math.max(8, radius);

    this.keyboardCursor.shape = new Shape()
      .moveTo(centre.x - arm, centre.y)
      .lineTo(centre.x + arm, centre.y)
      .moveTo(centre.x, centre.y - arm)
      .lineTo(centre.x, centre.y + arm)
      .moveTo(centre.x + radius, centre.y)
      .arc(centre.x, centre.y, radius, 0, 2 * Math.PI);
  }

  /**
   * A live description of the field for the screen summary: how hot the hottest
   * and coldest parts currently are.
   */
  public static createStateDescription(
    model: FieldSimulationModel,
    pattern: (minCelsius: number, maxCelsius: number) => string,
  ): TReadOnlyProperty<string> {
    return new DerivedProperty([model.minTemperatureProperty, model.maxTemperatureProperty], (min, max) =>
      pattern(min, max),
    );
  }
}

HeatTransferNamespace.register("FieldNode", FieldNode);
