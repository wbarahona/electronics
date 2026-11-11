import * as battery from './sources/battery.ts';
import * as ground from './sources/ground.ts';
import * as generator from './sources/generator.ts';
import * as rails from './sources/rails.ts';
import * as resistor from './passive/resistor.ts';
import * as capacitors from './passive/capacitors.ts';
import * as inductor from './passive/inductor.ts';
import * as variable from './passive/variable.ts';
import * as ldr from './passive/ldr.ts';
import * as ntc from './passive/ntc.ts';
import * as transformer from './passive/transformer.ts';
import * as fuse from './passive/fuse.ts';
import * as lamp from './signals/lamp.ts';
import * as led from './signals/led.ts';
import * as stackLight from './signals/stack-light.ts';
import * as rgbLed from './signals/rgb-led.ts';
import * as dotMatrix from './signals/dot-matrix.ts';
import * as barGraph from './signals/bar-graph.ts';
import * as bicolorLed from './signals/bicolor-led.ts';
import * as sevenSeg from './signals/seven-seg.ts';
import * as switches from './switches/switches.ts';
import * as changeover from './switches/changeover.ts';
import * as motor from './loads/motor.ts';
import * as heater from './loads/heater.ts';
import * as solenoid from './loads/solenoid.ts';
import * as fluorescent from './loads/fluorescent.ts';
import * as sounders from './signals/sounders.ts';
import * as speaker from './signals/speaker.ts';
import * as relays from './switches/relays.ts';
import * as gates from './digital/gates.ts';
import * as flipFlops from './digital/flip-flops.ts';
import * as io from './digital/io.ts';
import * as cd4511 from './chips/cd4511.ts';
import * as cd4017 from './chips/cd4017.ts';
import * as lm358 from './chips/lm358.ts';
import * as uln2003 from './chips/uln2003.ts';
import * as ne555 from './chips/ne555.ts';
import * as regulator from './chips/regulator.ts';
import * as scopeProbe from './meters/scope-probe.ts';
import * as panelMeter from './meters/panel-meter.ts';
import * as multimeter from './meters/multimeter.ts';
import * as diodes from './semiconductors/diodes.ts';
import * as transistors from './semiconductors/transistors.ts';
import type { PartDefs } from './defs.ts';
import type { ModelDefs } from '../sim/models.ts';
import type { PartType } from '../types.ts';

// Every part: its symbol and settings (DEFS) and its electrical model
// (MODEL_DEFS), from one file per part or family of parts. A part type
// missing either half won't compile. This order is the order parts are
// listed in (within their category and group) in the tray and in search; to
// add a part, add its file and a line to each list.
export const DEFS: PartDefs<PartType> = {
  ...battery.defs,
  ...ground.defs,
  ...generator.defs,
  ...rails.defs,
  ...resistor.defs,
  ...capacitors.defs,
  ...inductor.defs,
  ...variable.defs,
  ...ldr.defs,
  ...ntc.defs,
  ...transformer.defs,
  ...fuse.defs,
  ...lamp.defs,
  ...led.defs,
  ...stackLight.defs,
  ...rgbLed.defs,
  ...dotMatrix.defs,
  ...barGraph.defs,
  ...bicolorLed.defs,
  ...sevenSeg.defs,
  ...switches.defs,
  ...changeover.defs,
  ...motor.defs,
  ...heater.defs,
  ...solenoid.defs,
  ...fluorescent.defs,
  ...sounders.defs,
  ...speaker.defs,
  ...relays.defs,
  ...gates.defs,
  ...flipFlops.defs,
  ...io.defs,
  ...cd4511.defs,
  ...cd4017.defs,
  ...lm358.defs,
  ...uln2003.defs,
  ...ne555.defs,
  ...regulator.defs,
  ...scopeProbe.defs,
  ...panelMeter.defs,
  ...multimeter.defs,
  ...diodes.defs,
  ...transistors.defs,
};

export const MODEL_DEFS: ModelDefs<PartType> = {
  ...battery.models,
  ...ground.models,
  ...generator.models,
  ...rails.models,
  ...resistor.models,
  ...capacitors.models,
  ...inductor.models,
  ...variable.models,
  ...ldr.models,
  ...ntc.models,
  ...transformer.models,
  ...fuse.models,
  ...lamp.models,
  ...led.models,
  ...stackLight.models,
  ...rgbLed.models,
  ...dotMatrix.models,
  ...barGraph.models,
  ...bicolorLed.models,
  ...sevenSeg.models,
  ...switches.models,
  ...changeover.models,
  ...motor.models,
  ...heater.models,
  ...solenoid.models,
  ...fluorescent.models,
  ...sounders.models,
  ...speaker.models,
  ...relays.models,
  ...gates.models,
  ...flipFlops.models,
  ...io.models,
  ...cd4511.models,
  ...cd4017.models,
  ...lm358.models,
  ...uln2003.models,
  ...ne555.models,
  ...regulator.models,
  ...scopeProbe.models,
  ...panelMeter.models,
  ...multimeter.models,
  ...diodes.models,
  ...transistors.models,
};
