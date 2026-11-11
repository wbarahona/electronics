// The M3 Expressive slider (extra-small size), which @material/web doesn't
// have: a thick rounded track split by a narrow bar handle with a gap either
// side, dots at each step (when `ticks`) or at the track's end, and a value
// indicator above the handle while it's held. A native range input lies over
// it, so the keyboard, touch and screen readers work as for any slider.
// Same use as md-slider: min, max, step, value, valueLabel, ticks; `label`
// names it for screen readers. Fires input (live) and change (on release).

const TRACK = 16; // track height
const HANDLE_W = 4;
const HANDLE_H = 44;
const GAP = 6; // between the handle and the track each side
const DOT = 4; // stop indicators

const STYLE = `
  :host {
    position: relative;
    display: block;
    height: ${HANDLE_H}px;
    --f: 0; /* where the handle is, 0 to 1 */
    --at: calc(var(--f) * (100% - ${HANDLE_W}px)); /* the handle's left edge */
    -webkit-tap-highlight-color: transparent;
  }

  .track {
    position: absolute;
    top: ${(HANDLE_H - TRACK) / 2}px;
    height: ${TRACK}px;
    pointer-events: none;
  }

  /* From the start to the handle, in the accent. Corners are full at the
     ends and small beside the handle. */
  .active {
    left: 0;
    width: max(0px, calc(var(--at) - ${GAP}px));
    border-radius: ${TRACK / 2}px 2px 2px ${TRACK / 2}px;
    background: var(--md-sys-color-primary);
  }

  .inactive {
    left: calc(var(--at) + ${HANDLE_W + GAP}px);
    right: 0;
    border-radius: 2px ${TRACK / 2}px ${TRACK / 2}px 2px;
    background: var(--md-sys-color-secondary-container);
  }

  .dot {
    position: absolute;
    top: ${(HANDLE_H - DOT) / 2}px;
    width: ${DOT}px;
    height: ${DOT}px;
    margin-left: ${-DOT / 2}px;
    border-radius: 50%;
    background: var(--md-sys-color-primary);
    pointer-events: none;
  }

  .dot.on {
    background: var(--md-sys-color-on-primary);
  }

  .dot.hidden {
    display: none;
  }

  .handle {
    position: absolute;
    top: 0;
    left: var(--at);
    width: ${HANDLE_W}px;
    height: ${HANDLE_H}px;
    border-radius: 2px;
    background: var(--md-sys-color-primary);
    pointer-events: none;
    transition: transform 100ms cubic-bezier(0.2, 0, 0, 1);
  }

  :host(.held) .handle {
    transform: scaleX(0.5);
  }

  input:focus-visible ~ .handle {
    outline: 2px solid var(--md-sys-color-secondary);
    outline-offset: 2px;
  }

  /* M3 label-large on inverse surface, a pill above the handle. */
  .value {
    position: absolute;
    bottom: calc(100% + 4px);
    left: calc(var(--at) + ${HANDLE_W / 2}px);
    min-width: 48px;
    padding: 12px 16px;
    box-sizing: border-box;
    border-radius: 22px;
    background: var(--md-sys-color-inverse-surface);
    color: var(--md-sys-color-inverse-on-surface);
    font: 500 14px/20px Roboto, sans-serif;
    letter-spacing: 0.1px;
    text-align: center;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transform: translateX(-50%) scale(0.6);
    transform-origin: bottom center;
    transition: opacity 100ms, transform 100ms cubic-bezier(0.2, 0, 0, 1);
    z-index: 1;
  }

  :host(.held) .value {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }

  /* The native slider, invisible, on top; its thumb is the handle's width
     so it lines up with the drawn one. */
  input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
    z-index: 2;
    -webkit-appearance: none;
    appearance: none;
  }

  input::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: ${HANDLE_W}px;
    height: ${HANDLE_H}px;
  }

  input::-moz-range-thumb {
    width: ${HANDLE_W}px;
    height: ${HANDLE_H}px;
    border: none;
  }
`;

export class AmpageSlider extends HTMLElement {
  private input = document.createElement('input');
  private bubble = document.createElement('div');
  private dots = document.createElement('div');
  private _valueLabel = '';
  private _ticks = false;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    this.input.type = 'range';
    this.bubble.className = 'value';
    this.bubble.setAttribute('aria-hidden', 'true');
    const part = (className: string) => Object.assign(document.createElement('div'), { className });
    // The input comes before the handle, for its focus style.
    root.append(style, this.input, part('track active'), part('track inactive'), this.dots, part('handle'), this.bubble);

    this.input.addEventListener('input', () => this.render()); // composed: it reaches the host's listeners
    this.input.addEventListener('change', () => this.dispatchEvent(new Event('change', { bubbles: true })));
    const hold = (held: boolean) => this.classList.toggle('held', held);
    this.input.addEventListener('pointerdown', () => hold(true));
    for (const type of ['pointerup', 'pointercancel', 'blur']) this.input.addEventListener(type, () => hold(false));
    // Which dots the handle covers depends on the width (the sheet resizes).
    new ResizeObserver(() => this.render()).observe(this);
  }

  get min() {
    return Number(this.input.min);
  }
  set min(v: number) {
    this.input.min = String(v);
    this.layout();
  }

  get max() {
    return Number(this.input.max);
  }
  set max(v: number) {
    this.input.max = String(v);
    this.layout();
  }

  get step() {
    return Number(this.input.step);
  }
  set step(v: number) {
    this.input.step = String(v);
    this.layout();
  }

  get value() {
    return Number(this.input.value);
  }
  set value(v: number) {
    this.input.value = String(v);
    this.render();
  }

  // Shown in the value indicator (the plain value if unset).
  get valueLabel() {
    return this._valueLabel;
  }
  set valueLabel(text: string) {
    this._valueLabel = text;
    this.render();
  }

  // A dot at every step, for discrete values.
  get ticks() {
    return this._ticks;
  }
  set ticks(on: boolean) {
    this._ticks = on;
    this.layout();
  }

  set label(text: string) {
    this.input.setAttribute('aria-label', text);
  }

  private fraction(v: number) {
    const span = this.max - this.min;
    return span > 0 ? Math.min(1, Math.max(0, (v - this.min) / span)) : 0;
  }

  // The stop indicators: one per step with ticks, else one at the end.
  private layout() {
    const span = this.max - this.min;
    const count = this._ticks && this.step > 0 && span > 0 ? Math.round(span / this.step) : 0;
    const fractions = count ? Array.from({ length: count + 1 }, (_, i) => i / count) : [1];
    this.dots.replaceChildren(
      ...fractions.map((f) => {
        const dot = document.createElement('div');
        dot.className = 'dot';
        dot.dataset.f = String(f);
        // Centred on its step, inset at the ends so it sits inside the track.
        const inset = f === 0 ? TRACK / 2 - DOT : f === 1 ? -(TRACK / 2 - DOT) : 0;
        dot.style.left = `calc(${f} * (100% - ${HANDLE_W}px) + ${HANDLE_W / 2 + inset}px)`;
        return dot;
      }),
    );
    this.render();
  }

  private render() {
    const f = this.fraction(this.value);
    this.style.setProperty('--f', String(f));
    this.bubble.textContent = this._valueLabel || this.input.value;
    // Dots behind the handle or its gaps are hidden; those over the active
    // track are in its on-colour.
    const width = this.clientWidth - HANDLE_W;
    for (const dot of this.dots.children as HTMLCollectionOf<HTMLElement>) {
      const df = Number(dot.dataset.f);
      const near = width > 0 ? Math.abs(df - f) * width < HANDLE_W / 2 + GAP + DOT : df === f;
      dot.classList.toggle('hidden', near);
      dot.classList.toggle('on', df < f);
    }
  }

}

customElements.define('ampage-slider', AmpageSlider);

declare global {
  interface HTMLElementTagNameMap {
    'ampage-slider': AmpageSlider;
  }
}
