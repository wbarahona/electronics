# Upcoming features

Features we've discussed for Ampage but not built yet, grouped by what they
add. Parts and instruments still to come are in
[INCOMING_PARTS.md](INCOMING_PARTS.md). Move an entry out when it's done.

## Top picks

The most value for the effort, roughly in order:

1. **Example circuits gallery**: biggest win for newcomers; circuits are
   already plain JSON files.
2. **Net labels**: make larger schematics manageable; every real CAD tool has
   them.
3. **Share by link**: instant sharing without a server.
4. **Fault injection**: turns the meters and oscilloscope into real
   troubleshooting practice.
5. **Export as PNG / SVG**: small effort, used constantly (builds on the
   print pipeline).

## Learning and sharing

- **Example circuits gallery**: ready-made circuits (stairway light, motor
  starter with seal-in, 555 blinker, bridge rectifier, logic counter,
  doorbell) that open with one click.
- **Share by link**: the whole circuit packed into the URL; opening the link
  opens the circuit.
- **Export as image**: PNG or SVG of the schematic, for documents, slides and
  chat.
- **Text notes on the board**: labels and comments placed among the parts, to
  explain a circuit or mark its sections.
- **Challenges and lessons**: tasks such as "make the lamp light only when both
  switches are on", checked by the simulator.

## Schematic editing

- **Net labels**: name a wire (e.g. "+12V", "CLK"); every wire with the same
  name is connected, without drawing it across the sheet.
- **Subcircuits / blocks**: turn a selection into one reusable block and drop
  copies of it.
- **Title block and sheet frame**: a proper DIN / ISO drawing frame for
  printing.
- **Align and distribute**: tidy a selection, with its wires following.

## Simulation depth

- **Fault injection**: make any part fail on purpose (open, short, drifted) to
  practise fault finding.
- **Component tolerances**: ±5 % resistors and the like, so "identical"
  circuits differ slightly, as in real life.
- **Frequency response (Bode plot)**: sweep a frequency through a filter or
  amplifier and plot gain and phase.
- **DC sweep / I–V curve tracer**: plot a diode's, LED's or transistor's
  characteristic curve.
- **Ambient temperature**: affects the NTC, LDR and when parts overheat.
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
- **Command palette (⌘⇧P)**: run any action by typing ("rotate", "fit",
  "export PNG", "add resistor").
- **Installable app (PWA)**: works offline and opens like a desktop app.
- **Touch and tablet support**: pinch zoom, long-press for the context menu,
  larger targets.
- **Languages**: English, Spanish and German.
- **Norms and standards: EU or US**: the drawing standard, chosen in
  Settings (the option is there, with US marked "Coming soon").
  EU (today): IEC / DIN EN 60617 symbols and EN 81346 references (-R1).
  US: ANSI / IEEE 315 symbols (zigzag resistors and so on), US reference
  designators (R1, Q1, CR1 for diodes), and US default part numbers (2N3904,
  2N3906, 1N4733A instead of BC547, BC557, BZX55C5V1).
- **Fit to circuit on open**: optionally fit the view when a file is opened,
  instead of restoring the view saved with it.
