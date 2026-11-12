// A part's values as built rather than as marked: each value its tolerance
// applies to (`keys`) moved by its deviation (see src/parts/tolerance.ts).
export function actualFactor(p: { tolerance?: number; deviation?: number }): number {
  return 1 + ((p.tolerance ?? 0) / 100) * (p.deviation ?? 0);
}

export function actualProps<P extends object>(props: P, keys: readonly string[]): P {
  const factor = actualFactor(props);
  const out = { ...props } as Record<string, unknown>;
  for (const key of keys) out[key] = (out[key] as number) * factor;
  return out as P;
}
