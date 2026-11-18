# Modules

A module is a section of a circuit made into one reusable block: a box with
pins, placed as often as you like. Every copy is the same module, so editing
it once changes them all. Inside, each copy runs on its own, with its own
readings and its own switch positions.

## Making a module

1. Draw a **Frame** (Annotate) round the section.
2. Put **Terminals** (Sources › Reference) on the frame's edge. Each becomes
   one of the block's pins, named after the terminal (or numbered). Terminals
   further inside stay inside, as test points.
3. Right-click the frame, or open its panel, and choose **Make module**.

The frame and everything in it become a block at the frame's centre, -A1,
-A2… Wires from outside to the edge terminals now end on the block's pins.
A wire that crosses the edge without a terminal can't come along: it's cut,
and a message says how many were.

Net labels inside a module belong to each copy, so two copies never join
through them. Rails and grounds stay shared, like real supply symbols.

## Looking inside

Double-click a block to step inside it. You see that copy's parts, live:
readings on hover, current flowing, lamps lit. Buttons and switches work.
Double-click a block inside to go deeper. The path bar at the top steps back
out, as does Esc (the first Esc clears a selection), to the same pan and zoom.

Inside is for looking and operating only: to change the module, edit it.

## Editing a module

Choose **Edit module** from a block's right-click menu or panel, or from the
path bar while inside one. The module opens in its frame, editable like any
circuit, with undo steps of its own; the simulation waits.

- **Inside** view: the parts and wiring. The frame's edge marks the pins and
  its title names the module.
- **Face** view: the block as it will look. Drag its edges or corners to
  resize it, its pins along an edge or to another side, and its front-panel
  parts anywhere inside it. Put the title on top, in the middle, or leave it
  out. **Automatic layout** goes back to the automatic face.

**Done** updates every copy, on the board and inside other modules, as one
undo step. Pins follow their terminals: a wire to a pin whose terminal you
removed is cut, with a message. **Cancel** leaves the module as it was.

## Front panel

Like the controls and pilot lights on a panel door, some parts inside a
module can be mounted on its block's face. While editing, right-click one on
the Inside view and tick **On the front panel**; place it on the Face view.
On the board it then shows that copy's live state, and controls work from
there.

### Controls

Operated from the face; a switch's position is kept by each copy and saved
with the circuit.

| Part | On the face | Clicking it | Kept per copy |
|---|---|---|---|
| Switch | Toggle | Turns it on or off | Yes |
| Changeover switch | Toggle | Throws it to its other contact | Yes |
| Logic switch | Toggle | Sets its output high or low | Yes |
| Push button (NO) | Round button | Closes it while held | No (springs back) |
| Push button (NC) | Round button | Opens it while held | No (springs back) |

### Indicators

Lit from the simulation, in their own colour.

| Part | On the face |
|---|---|
| LED | A lamp in the LED's colour |
| Lamp | A lamp in its colour |
| Pilot lamp | A lamp in its colour |
| Logic probe | A lamp, lit while its input is high |

Not yet: 7-segment, dot-matrix and bar-graph displays, RGB and bi-colour
LEDs, meters and potentiometers.

## In files

A circuit with modules carries their definitions in a `modules` section and
is saved as version 2; one without is still version 1, so older copies of the
app keep opening it. Each block keeps its copy's own switch positions. A
module library shared across circuits is planned (see
[UPCOMING_FEATURES.md](UPCOMING_FEATURES.md)).
