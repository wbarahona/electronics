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
2. **Subcircuits / blocks**: reuse for larger schematics.

## Learning and sharing

- **Challenges and lessons**: tasks such as "make the lamp light only when both
  switches are on", checked by the simulator.

## Schematic editing

- **Subcircuits / blocks**: turn a selection into one reusable block and drop
  copies of it. Starting point: a Frame (Annotate) already marks out a section
  and finds its contents; "Make block from frame" would take those, with net
  labels on the frame's edge as the block's pins.
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
