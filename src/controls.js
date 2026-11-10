import { formatSI } from './units.js';

// Simulated seconds per real second, slowest first.
const SPEEDS = [
  { value: 0.001, label: '1/1000×' },
  { value: 0.01, label: '1/100×' },
  { value: 0.1, label: '1/10×' },
  { value: 1, label: '1×' },
  { value: 10, label: '10×' },
  { value: 100, label: '100×' },
  { value: 1000, label: '1000×' },
];

// Seconds as "12.3 ms" / "4.5 s" below a minute, then "1:02:05" style.
function formatTime(t) {
  if (t < 60) return formatSI(t, 's');
  const s = Math.floor(t % 60);
  const m = Math.floor(t / 60) % 60;
  const h = Math.floor(t / 3600);
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// Run/pause, simulation speed and the simulated clock in the top bar (M3
// buttons declared in index.html).
// Returns live state: { running, speed (simulated seconds per real second),
// showTime(t) }.
export function createControls(root) {
  const run = root.querySelector('#run');
  const slower = root.querySelector('#slower');
  const faster = root.querySelector('#faster');
  const speedText = root.querySelector('#speed');
  const clock = root.querySelector('#clock');
  let level = SPEEDS.findIndex((s) => s.value === 1); // start at real time

  const state = {
    running: false,
    speed: SPEEDS[level].value,
    showTime(t) {
      clock.textContent = `t = ${formatTime(t)}`;
    },
  };

  function render() {
    run.querySelector('md-icon').textContent = state.running ? 'pause' : 'play_arrow';
    run.querySelector('span').textContent = state.running ? 'Pause' : 'Run';
    run.setAttribute('aria-pressed', state.running);
    speedText.textContent = SPEEDS[level].label;
    slower.disabled = level === 0;
    faster.disabled = level === SPEEDS.length - 1;
  }

  function setLevel(next) {
    level = Math.max(0, Math.min(SPEEDS.length - 1, next));
    state.speed = SPEEDS[level].value;
    render();
  }

  run.addEventListener('click', () => {
    state.running = !state.running;
    render();
  });
  slower.addEventListener('click', () => setLevel(level - 1));
  faster.addEventListener('click', () => setLevel(level + 1));

  render();
  state.showTime(0);
  return state;
}
