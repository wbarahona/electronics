// The example circuits (the gallery, from the rail's Examples), each a saved
// circuit file loaded when picked. Titles and descriptions are English, as
// keys for the translations (src/i18n).
export interface Example {
  id: string;
  icon: string; // Material Symbols name (also listed in scripts/icons.mjs)
  title: string;
  description: string;
  load: () => Promise<string>;
}

const file = (load: () => Promise<{ default: string }>) => () => load().then((m) => m.default);

export const EXAMPLES: Example[] = [
  {
    id: 'stairway-light',
    icon: 'stairs',
    title: 'Stairway light',
    description: 'Two changeover switches control one lamp from either end of a stairway.',
    load: file(() => import('./stairway-light.json?raw')),
  },
  {
    id: 'doorbell',
    icon: 'doorbell',
    title: 'Doorbell',
    description: 'A bell transformer, a push button and a door chime.',
    load: file(() => import('./doorbell.json?raw')),
  },
  {
    id: 'motor-starter',
    icon: 'mode_fan',
    title: 'Motor starter',
    description: 'A three-phase motor on a contactor with start, stop and a seal-in contact.',
    load: file(() => import('./motor-starter.json?raw')),
  },
  {
    id: 'dynamos',
    icon: 'wind_power',
    title: 'Four ways to turn a dynamo',
    description: 'A motor, a hand crank, a fan’s wind and falling water each turn a dynamo to light a lamp or an LED.',
    load: file(() => import('./dynamos.json?raw')),
  },
  {
    id: 'bridge-rectifier',
    icon: 'power',
    title: 'Bridge rectifier',
    description: 'Mains to a smooth 5 V: transformer, bridge, reservoir capacitor and a transistor regulator.',
    load: file(() => import('./bridge-rectifier.json?raw')),
  },
  {
    id: '555-blinker',
    icon: 'timer',
    title: '555 blinker',
    description: 'A 555 timer flashing an LED about once a second.',
    load: file(() => import('./555-blinker.json?raw')),
  },
  {
    id: 'decade-counter',
    icon: 'linear_scale',
    title: 'Running light',
    description: 'A clock steps a CD4017 decade counter along a 10-LED bar graph.',
    load: file(() => import('./decade-counter.json?raw')),
  },
  {
    id: 'thermostat',
    icon: 'thermostat',
    title: 'Thermostat',
    description: 'An NTC and a comparator switch a heater off and a fan on at the set temperature.',
    load: file(() => import('./thermostat.json?raw')),
  },
  {
    id: 'enclosure-cooling',
    icon: 'air',
    title: 'Cooling an enclosure',
    description: 'A regulator heats a sealed box; a fan on its wall brings fresh air in. Shows the airflow and heat haze.',
    load: file(() => import('./enclosure-cooling.json?raw')),
  },
  {
    id: 'rgb-rainbow',
    icon: 'gradient',
    title: 'Rainbow matrix',
    description: 'Six phase-shifted generators sweep a rainbow across an RGB dot matrix.',
    load: file(() => import('./rgb-rainbow.json?raw')),
  },
  {
    id: 'rgb-mixing',
    icon: 'palette',
    title: 'RGB colour mixing',
    description: 'RGB LEDs and a switchable RGB dot matrix: how currents, lens and PWM set the colour you see.',
    load: file(() => import('./rgb-mixing.json?raw')),
  },
];
