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
  parts anywhere inside it (a display's size too). Put the title on top, in
  the middle, or leave it out. **Automatic layout** goes back to the
  automatic face.

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
| RGB LED | A lamp in the colour its dies mix |
| Bi-colour LED | A lamp: red, green, or amber when both are lit |

### Displays

Drawn as on the board, in a window, without their pins, and lit the same way.
On the Face view, press one to select it and choose its size in the path bar:
50, 75 or 100 % of its full size.

| Part | On the face | Starts at |
|---|---|---|
| 7-segment display | Its digit, with the dot | 100 % |
| LED bar graph | Its ten bars, closer together | 100 % |
| Dot-matrix display | Its dots, mono or RGB | 50 % |

Front-panel parts never overlap: dragged onto another, a part takes the
nearest free spot, and the box grows to fit them all.

Not yet: meters and potentiometers.

## My modules

To use a module in other circuits, keep it in **my modules**: choose **Save
to my modules** from its block's right-click menu or panel. It then appears
in the **Modules** category of the parts bar; drag it onto the board, or
click it, to place a copy. Saving it again (after editing) updates it there;
right-click it in the tray to export, rename or delete it.

**Manage…** at the end of the My modules row opens the whole library in one
list: each module with its block, version, when it was saved and what's in
it, and where they're kept and how much room they take. Rename, export or
delete one; tick several (or all) to export or delete them together; or
import more. Built-in modules are listed too, and stay.

**Export and import.** Export saves modules to a `.ampage-modules` file: a
backup, or a way to share them. **Import…** adds the modules in such a file to
mine: new ones, and newer versions of ones you have (older or the same
versions are left as they are).

**Updates.** A module in a circuit remembers which of my modules (or the
built-in ones) it came from, and which version. When my modules has a newer
one (saved again since), the block's right-click menu and panel offer
**Update to version N**: every copy in the circuit follows, as after an edit,
in one undo step. Pins follow their terminals; wires to a pin the newer
version doesn't have are cut, with a message.

The tray also has **Built-in** modules that come with the app:

| Module | Pins | Inside | On its face |
|---|---|---|---|
| 5 V supply | +VIN, 0V, +5V | 7805 regulator with 100 µF in, 10 µF out | Green power LED |
| 555 astable | +V, 0V, OUT | NE555 at about 1.5 Hz (1 kΩ, 47 kΩ, 10 µF) | Red LED blinking with OUT |

They fit together: 7 to 24 V into the supply's +VIN, its +5V to the
astable's +V, and both 0V to ground.

A module placed from my modules is copied into the circuit, so the circuit
still opens anywhere, even where that module isn't saved.

Where they're kept:

- In the browser, in this browser's own storage (IndexedDB). It's asked to
  keep them, but they can be lost if the browser's site data is cleared, and
  Safari clears a site's storage after 7 days without a visit unless the app
  is installed. Export them now and then to keep a copy.
- In the desktop app, as a file each in the app's data folder (`modules/`),
  which you can back up like any other files.

## In files

A circuit with modules carries their definitions in a `modules` section and
is saved as version 2; one without is still version 1, so older copies of the
app keep opening it. Each block keeps its copy's own switch positions, and
each module where it came from in my modules (so placing it again reuses it).
