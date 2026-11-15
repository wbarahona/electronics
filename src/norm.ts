// The drawing standard the app draws to, chosen in Settings: EU (IEC / DIN EN
// 60617 symbols, EN 81346 references like -R1) or US (ANSI / IEEE 315
// symbols, ASME Y14.44 references like R1). It's a view of the circuit, not
// part of it: every part carries a reference for each standard and each part
// type may have a US symbol (see `us` in src/parts/defs.ts), so switching
// only redraws.
export type Norm = 'eu' | 'us';

let current: Norm = 'eu';
const listeners: (() => void)[] = [];

export const getNorm = (): Norm => current;

export function setNorm(norm: Norm) {
  if (norm === current) return;
  current = norm;
  for (const listener of listeners) listener();
}

// Run `redraw` whenever the standard changes, for whatever shows symbols or
// references.
export const onNorm = (redraw: () => void) => listeners.push(redraw);

// A part's reference as shown: -R1 in the EU standard, R1 in the US one.
export const refText = (part: { ref: string; usRef: string }): string => (current === 'us' ? part.usRef : `-${part.ref}`);
