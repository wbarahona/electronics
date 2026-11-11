<p align="center">
  <img src="public/ampage.svg" alt="Ampage logo" width="120" />
</p>

<h1 align="center">Ampage</h1>

<p align="center">Circuits that come alive in your browser.</p>

Ampage is a browser-based electronics simulator. Drag parts onto a grid,
wire them up and press Run to watch lamps glow, current flow and
overloaded parts burn out. Schematics follow DIN EN 60617 symbols and
EN 81346 reference designations (-R1, -S1, -P1…).

## Features

- **Live simulation**: DC and AC transient analysis (nodal analysis with
  Newton–Raphson for diodes and transistors), from 1/1000× to 1000× speed
- **Realistic behaviour**: capacitors charge, batteries drain, parts heat
  up and fail when overloaded
- **Parts**: batteries, AC generator, resistors, capacitors, inductors,
  potentiometers, LDR, NTC, transformer, fuse, lamps, LEDs, switches and
  push buttons, diodes, BJTs, MOSFET, logic gates, flip-flops, 555 timer,
  voltage regulator, voltmeter and ammeter
- **Editing**: snap-to-grid, right-angle wires, joints, drop a part onto a
  wire to splice it in, copy/cut/paste/duplicate, marquee select
- **Visual feedback**: animated current flow, glowing lights, charge
  gauges, net highlighting and live readouts on hover
- **Files**: save and open circuits as JSON; autosaves in the browser

## Getting started

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev      # start the dev server
npm run build    # typecheck and build to dist/
npm run preview  # serve the build
```

## Shortcuts

| Key | Action |
| --- | --- |
| ⌘K | Search parts |
| R | Rotate (also while dragging) |
| Delete / Backspace | Delete selection |
| Esc | Cancel a drag or wire, or clear the selection |
| Backspace while wiring | Undo the last bend |
| Space + drag | Pan the board |
| Double-click a wire | Branch a new wire from it |
| ⌘C / ⌘X / ⌘V / ⌘D | Copy / cut / paste / duplicate |
| ⌘S / ⌘O | Save / open |

On Windows and Linux use Ctrl instead of ⌘.

## Project layout

```
src/
  main.ts        app wiring and frame loop
  components.ts  part definitions and DIN symbols
  model.ts       circuit data (parts, wires, joints)
  editor.ts      board editing and rendering
  palette.ts     category bar and parts tray
  search.ts      part search
  sim/           solver: engine, part models, linear algebra, current flow
```

Built with TypeScript, Vite, SVG and [Material Web](https://github.com/material-components/material-web) (Material Design 3).

## License

[MIT](LICENSE) © 2026 wbarahona
