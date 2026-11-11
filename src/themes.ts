// The theme colours to choose from (Settings); Ampage green, the logo's, is
// the default.
export const THEMES = [
  { id: 'green', label: 'Ampage green', seed: '#66cc33' },
  { id: 'blue', label: 'Ocean blue', seed: '#0969da' },
  { id: 'violet', label: 'Violet', seed: '#7e57c2' },
  { id: 'amber', label: 'Amber', seed: '#f2a007' },
  { id: 'coral', label: 'Coral', seed: '#e5534b' },
  { id: 'teal', label: 'Teal', seed: '#00a396' },
] as const;
export type ThemeId = (typeof THEMES)[number]['id'];
