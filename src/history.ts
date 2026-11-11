import { fromControl } from './keys.ts';

const LIMIT = 100; // undo steps kept
const SETTLE_MS = 300; // edits this close together are one step (a drag)

export interface HistoryOptions {
  capture: () => string; // the circuit as it is now
  restore: (snapshot: string) => void; // put it back as it was
}

// Undo / redo: ⌘Z, ⇧⌘Z (or Ctrl+Y), and the buttons by the file actions.
// After each edit the circuit is captured whole; a burst of edits (a drag)
// settles into one step. Undoing restores a capture without resetting the
// simulation. Text fields keep their own undo.
export function createHistory(root: HTMLElement, { capture, restore }: HistoryOptions) {
  const undoButton = root.querySelector<HTMLElement & { disabled: boolean }>('#undo')!;
  const redoButton = root.querySelector<HTMLElement & { disabled: boolean }>('#redo')!;
  let past: string[] = []; // the last entry is the circuit as it is now
  let future: string[] = [];
  let pending = 0;
  let restoring = false;

  function show() {
    undoButton.disabled = past.length < 2;
    redoButton.disabled = !future.length;
  }

  function commit() {
    clearTimeout(pending);
    pending = 0;
    const now = capture();
    if (now === past[past.length - 1]) return;
    past.push(now);
    if (past.length > LIMIT + 1) past.shift();
    future = [];
    show();
  }

  // After any change to the circuit (ignored while undoing or redoing).
  function changed() {
    if (restoring) return;
    clearTimeout(pending);
    pending = window.setTimeout(commit, SETTLE_MS);
  }

  function apply(snapshot: string) {
    restoring = true;
    try {
      restore(snapshot);
    } finally {
      restoring = false;
    }
    show();
  }

  // The current state moves to the redo stack; the one before it returns.
  function undo() {
    if (pending) commit();
    if (past.length < 2) return;
    future.push(past.pop()!);
    apply(past[past.length - 1]);
  }

  function redo() {
    if (pending) commit();
    if (!future.length) return;
    past.push(future.pop()!);
    apply(past[past.length - 1]);
  }

  // A different circuit (opened or new): its history starts here.
  function reset() {
    clearTimeout(pending);
    pending = 0;
    past = [capture()];
    future = [];
    show();
  }

  undoButton.addEventListener('click', undo);
  redoButton.addEventListener('click', redo);
  window.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || fromControl(e)) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) undo();
    else if ((key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey)) redo();
    else return;
    e.preventDefault();
  });

  show();
  return { changed, reset };
}
