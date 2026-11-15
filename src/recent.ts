import { PARTS } from './components.ts';
import type { PartType } from './types.ts';

const KEY = 'ampage:recent';
const MAX = 6;

// The part types last placed on the board (from the tray or search), most
// recent first, remembered in this browser; what the search shows before
// anything is typed.
export function recentParts(): PartType[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((type): type is PartType => typeof type === 'string' && type in PARTS).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function rememberPart(type: PartType) {
  try {
    localStorage.setItem(KEY, JSON.stringify([type, ...recentParts().filter((t) => t !== type)].slice(0, MAX)));
  } catch {
    // no storage: no recent parts
  }
}
