# Upcoming features

Features we've discussed for Ampage but not built yet, grouped by what they
add. Parts and instruments still to come are in
[INCOMING_PARTS.md](INCOMING_PARTS.md). Move an entry out when it's done.

## Top picks

The most value for the effort, roughly in order (already built: the example
gallery, net labels, share by link, fault injection, image export, notes
explaining every example, fit-on-open, component tolerances, and the ISO
sheet frame and title block for printing):

1. **Challenges and lessons**: builds on the gallery and fault injection
   (find the hidden fault, checked by the simulator).
2. **Subcircuits / blocks**: reuse for larger schematics.

## Learning and sharing

- **Challenges and lessons**: tasks such as "make the lamp light only when both
  switches are on", checked by the simulator.

## Schematic editing

- **Subcircuits / blocks**: turn a selection into one reusable block and drop
  copies of it.
- **Align and distribute**: tidy a selection, with its wires following.

## Simulation depth

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
- **Localised numbers**: the interface speaks English, Spanish and German
  (Settings), but values still show with a decimal point ("4.7 kΩ"); Spanish
  and German would use a comma ("4,7 kΩ"). Typing either already works.
- **Norms and standards: EU or US**: the drawing standard, chosen in
  Settings (the option is there, with US marked "Coming soon").
  EU (today): IEC / DIN EN 60617 symbols and EN 81346 references (-R1).
  US: ANSI / IEEE 315 symbols (zigzag resistors and so on), US reference
  designators (R1, Q1, CR1 for diodes), and US default part numbers (2N3904,
  2N3906, 1N4733A instead of BC547, BC557, BZX55C5V1).
