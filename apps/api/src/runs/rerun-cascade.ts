export interface CascadeStep {
  key: string;
  dependsOn?: string[];
}

export interface RerunCascade {
  target: string;
  downstream: string[];
}

export function computeRerunCascade(steps: CascadeStep[], targetKey: string): RerunCascade {
  const idx = steps.findIndex((s) => s.key === targetKey);
  if (idx < 0) throw new Error(`target step "${targetKey}" not found`);

  const earlierKeysBy = new Map<string, string[]>();
  steps.forEach((s, i) => {
    earlierKeysBy.set(s.key, steps.slice(0, i).map((x) => x.key));
  });

  const effectiveDeps = (s: CascadeStep): string[] =>
    s.dependsOn === undefined ? (earlierKeysBy.get(s.key) ?? []) : s.dependsOn;

  const affected = new Set<string>([targetKey]);
  for (let i = idx + 1; i < steps.length; i++) {
    const s = steps[i];
    if (effectiveDeps(s).some((d) => affected.has(d))) {
      affected.add(s.key);
    }
  }

  const downstream = steps
    .slice(idx + 1)
    .filter((s) => affected.has(s.key))
    .map((s) => s.key);

  return { target: targetKey, downstream };
}
