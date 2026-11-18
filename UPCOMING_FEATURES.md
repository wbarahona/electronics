# Upcoming features

Features we've discussed for Ampage but not built yet, grouped by what they
add. Parts and instruments still to come are in
[INCOMING_PARTS.md](INCOMING_PARTS.md). Move an entry out when it's done.

## Top picks

The most value for the effort, roughly in order (already built: the example
gallery, net labels, fault injection, image export, notes
explaining every example, fit-on-open, component tolerances, and the ISO
sheet frame and title block for printing):

1. **Challenges and lessons**: builds on the gallery and fault injection
   (find the hidden fault, checked by the simulator).
2. **Modules (subcircuits)**: reuse for larger schematics; plan below,
   under Schematic editing.

## Learning and sharing

- **Challenges and lessons**: tasks such as "make the lamp light only when both
  switches are on", checked by the simulator.

## Schematic editing

- **Modules (subcircuits)**: a Frame becomes a reusable module, placed as a
  block with pins. Copies are instances of one definition (edit it once, every
  copy follows); the simulator flattens each copy into its parts when it
  builds the nets (ids prefixed per copy, e.g. `A1/K6`), so the solver,
  thermal model and readouts stay as they are. Agreed steps:
  1. **Terminal** part (built: Sources › Reference): the module's pins.
  2. **Make module from frame**: the Terminals on its edge become the block's
     pins (named after them, on the side they sat). Net labels inside are
     local to each copy; rails and grounds stay global. The block is a compact
     box with its title, only as big as its pins need; copies are -A1, -A2…
     (EN 81346 class A), inner parts -A1-K6. Definitions are saved in the
     circuit file (a `modules` section, file VERSION 2), so a circuit opens
     anywhere without the library. Every copy is identical (no per-copy
     settings yet).
  3. **Step inside a copy**: double-click opens it in place with a path bar
     (`Circuit › -A1 Controller`); the simulation keeps running, its
     readouts are live and its buttons work; Back / Esc returns to the same
     pan and zoom. A collapsed block's heat sits at the block's position.
  4. **Module library**: a Modules tray category with Built-in (shipped
     with the app, like the examples) and My modules (rename, edit, export,
     delete); placing one copies its definition into the circuit, and a newer
     library version can be offered as an update. Storage behind one
     list / load / save / delete interface:
     - Web: IndexedDB (a record per module), not localStorage (one ~5 MB
       limit per site, shared with the autosave). Ask for persistent storage
       (`navigator.storage.persist()`) on the first save, show usage from
       `navigator.storage.estimate()`, and say plainly that modules live in
       this browser: export (one module, or all as one bundle) and import
       are the backup, since browsers can clear storage (Safari after 7 days
       without a visit unless installed).
     - Desktop (Tauri): one file per module in the app's data folder, with an
       "Open modules folder" command.
  Tabs for several open circuits are left out for now.
- **Background image in IndexedDB**: it's kept in localStorage as a base64
  data URL (often 1–4 MB of the ~5 MB per site), where it can fill the space
  the autosave needs, and the autosave fails silently. Store it in IndexedDB
  as a Blob instead (about 25 % smaller too).
- **Align and distribute**: tidy a selection, with its wires following.

## Simulation depth

- **AC motor slip model**: induction motors' speed from supply frequency and
  load (slip), current and power factor following load, stalling past
  breakdown torque; synchronous speed from the rated speed. DC motors and the
  fan already run on shaft mechanics (src/sim/shared/shaft.ts); AC motors
  still ramp to a fixed speed, so their losses and efficiency aren't shown.
- **Frequency response (Bode plot)**: sweep a frequency through a filter or
  amplifier and plot gain and phase.
- **DC sweep / I–V curve tracer**: plot a diode's, LED's or transistor's
  characteristic curve.
- **More part numbers**: the first batch is built (diodes, Schottkys,
  zeners, NPN/PNP/MOSFET transistors, LEDs, regulators, with European
  defaults and a modified mark). Still to do: relays and contactors by coil
  voltage and contact rating, more transistor and LED codes, the LM317, and
  specs not modelled yet where they matter (a diode's surge current, a
  transistor's maximum collector voltage). Typing a code in the parts search
  could also drop the part preset to it.
- **Standard values (E12 / E24)**: for resistors and capacitors, which have
  values rather than part numbers: a dropdown or snap-to-standard option.
- **Logarithmic sliders**: settings that span decades (frequencies, a
  transformer's turns ratio, resistances) still take typed values only; a
  log-scale slider would cover them. Discrete and linear sliders are built.
- **Installable app (PWA)**: works offline and opens like a desktop app.
