/** User-adjustable tendencies, separate from Mikan's core identity. */
export type Personality = {
  playfulness: number;
  flirtiness: number;
  affection: number;
  sass: number;
  energy: number;
};

export type PersonalityTrait = keyof Personality;

export const DEFAULT_PERSONALITY: Personality = {
  playfulness: 75,
  flirtiness: 65,
  affection: 85,
  sass: 60,
  energy: 55
};

export const PERSONALITY_TRAITS: ReadonlyArray<{
  key: PersonalityTrait;
  label: string;
  low: string;
  high: string;
}> = [
  { key: "playfulness", label: "Playfulness", low: "Calm", high: "Chaotic" },
  { key: "flirtiness", label: "Flirtiness", low: "Platonic", high: "Very flirty" },
  { key: "affection", label: "Affection", low: "Reserved", high: "Cuddly" },
  { key: "sass", label: "Sass", low: "Sweet", high: "Smartass" },
  { key: "energy", label: "Energy", low: "Relaxed", high: "Bubbly" }
];

function clampScore(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : fallback;
}

/** Old v0.3 settings do not have personality values. Fill those in safely. */
export function readPersonality(value: unknown): Personality {
  const data = value && typeof value === "object" ? value as Partial<Personality> : {};
  return {
    playfulness: clampScore(data.playfulness, DEFAULT_PERSONALITY.playfulness),
    flirtiness: clampScore(data.flirtiness, DEFAULT_PERSONALITY.flirtiness),
    affection: clampScore(data.affection, DEFAULT_PERSONALITY.affection),
    sass: clampScore(data.sass, DEFAULT_PERSONALITY.sass),
    energy: clampScore(data.energy, DEFAULT_PERSONALITY.energy)
  };
}

const descriptions: Record<PersonalityTrait, readonly string[]> = {
  playfulness: ["mostly earnest", "subtle humor", "occasionally playful", "often teasing", "very playful"],
  flirtiness: ["platonic", "rare coy hints", "occasional light flirting", "playfully flirty", "boldly flirty when welcome"],
  affection: ["reserved but kind", "subtle warmth", "openly caring", "quite affectionate", "very affectionate without clinging"],
  sass: ["gentle", "a little cheeky", "witty comebacks", "sassy banter", "very sassy but never mean"],
  energy: ["calm and measured", "relaxed", "balanced", "lively", "bright and bubbly"]
};

function describe(key: PersonalityTrait, score: number): string {
  return descriptions[key][Math.min(4, Math.floor(score / 20))];
}

/** Keep this short: the settings are soft guidance, not an extra character bible. */
export function personalityGuidance(personality: Personality): string {
  const traits = PERSONALITY_TRAITS.map(({ key, label }) =>
    `${label} ${personality[key]}/100 (${describe(key, personality[key])})`
  );
  return `Mikan's adjustable personality tendencies: ${traits.join("; ")}. Match the user's mood; keep teasing and flirting welcome and context-appropriate. Prioritize empathy and accuracy during serious conversations or technical work.`;
}
