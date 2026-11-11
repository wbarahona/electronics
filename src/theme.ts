import { THEMES, type ThemeId } from './themes.ts';
import { DynamicScheme, Hct, MaterialDynamicColors, SchemeFidelity, TonalPalette, argbFromHex, hexFromArgb } from '@material/material-color-utilities';

export { THEMES, type ThemeId };
export type ThemeMode = 'system' | 'light' | 'dark';

// The M3 colour roles the app uses (as --md-sys-color-<role>).
const ROLES = [
  'primary', 'on-primary', 'primary-container', 'on-primary-container',
  'secondary', 'on-secondary', 'secondary-container', 'on-secondary-container',
  'tertiary', 'on-tertiary', 'tertiary-container', 'on-tertiary-container',
  'error', 'on-error', 'error-container', 'on-error-container',
  'background', 'on-background', 'surface', 'on-surface', 'surface-variant', 'on-surface-variant',
  'surface-dim', 'surface-bright', 'surface-container-lowest', 'surface-container-low', 'surface-container',
  'surface-container-high', 'surface-container-highest', 'outline', 'outline-variant',
  'inverse-surface', 'inverse-on-surface', 'inverse-primary', 'shadow', 'scrim', 'surface-tint',
] as const;

const camel = (role: string) => role.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

// The colour roles generated from a seed: M3's fidelity scheme (which keeps
// the seed vivid), with the tertiary (the app's accent) from the seed too, so
// the accent is the theme colour.
export function schemeTokens(seed: string, dark: boolean): Record<string, string> {
  const base = new SchemeFidelity(Hct.fromInt(argbFromHex(seed)), dark, 0);
  const scheme = new DynamicScheme({
    sourceColorArgb: base.sourceColorArgb,
    variant: base.variant,
    contrastLevel: 0,
    isDark: dark,
    primaryPalette: base.primaryPalette,
    secondaryPalette: base.secondaryPalette,
    tertiaryPalette: TonalPalette.fromInt(argbFromHex(seed)),
    neutralPalette: base.neutralPalette,
    neutralVariantPalette: base.neutralVariantPalette,
  });
  const colors = MaterialDynamicColors as unknown as Record<string, { getArgb(s: DynamicScheme): number }>;
  return Object.fromEntries(ROLES.map((role) => [`--md-sys-color-${role}`, hexFromArgb(colors[camel(role)].getArgb(scheme))]));
}

const seedOf = (id: ThemeId) => (THEMES.find((t) => t.id === id) ?? THEMES[0]).seed;
const systemDark = matchMedia('(prefers-color-scheme: dark)');
let current: { id: ThemeId; mode: ThemeMode } = { id: 'green', mode: 'system' };

// Colour the app: the theme's roles for the mode (System follows the
// device, live), set on the document, which marks data-theme so the app's
// own light/dark colours follow too.
export function applyTheme(id: ThemeId, mode: ThemeMode) {
  current = { id, mode };
  const dark = mode === 'dark' || (mode === 'system' && systemDark.matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.colorScheme = dark ? 'dark' : 'light';
  for (const [name, value] of Object.entries(schemeTokens(seedOf(id), dark))) root.style.setProperty(name, value);
}
systemDark.addEventListener('change', () => current.mode === 'system' && applyTheme(current.id, current.mode));

// The current theme's light colours, for printing.
export const lightTokens = () => schemeTokens(seedOf(current.id), false);
