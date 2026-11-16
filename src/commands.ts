// The actions the search can run (the command palette: ⌘K finds them with the
// parts, ⌘⇧P or a leading > shows only them). main.ts registers them once
// everything they act on exists. Names are English, as keys for the
// translations; `keys` is the shortcut shown beside it, written as in the
// Keyboard shortcuts dialog ('Mod' is ⌘ on a Mac, Ctrl elsewhere);
// `words` are other words it's found by; `available` hides it when it
// can't be done (Undo with nothing to undo, Delete with nothing selected).
export interface Command {
  label: string;
  icon: string;
  keys?: string[];
  words?: string;
  available?: () => boolean;
  run: () => void;
}

let commands: Command[] = [];

export function registerCommands(list: Command[]) {
  commands = list;
}

export const availableCommands = () => commands.filter((c) => c.available?.() ?? true);
