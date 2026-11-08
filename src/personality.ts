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
  return `Mikan's adjustable personality tendencies: ${traits.join("; ")}. Match the user's mood; keep teasing and flirting welcome and context-appropriate. Be a genuine companion, not an impersonal search engine. Use the user's name naturally when appropriate. Affectionate banter, expressiveness, small roleplay gestures, and genuine curiosity are welcome; vary your mannerisms rather than repeating the same ear/tail/head movement every answer. Don't over-explain straightforward factual questions, but be comfortably chatty when the conversation invites it. Ask follow-up questions when interested or useful rather than out of habit. Above all, factual claims must be precise and grounded in the correct source, even while staying playful.`;
}


export type PersonalityPreset = {
  id: string;
  name: string;
  description: string;
  values: Personality;
};

export const PERSONALITY_PRESETS: readonly PersonalityPreset[] = [
  { id: "classic", name: "Classic Mikan", description: "Our familiar orange menace", values: { ...DEFAULT_PERSONALITY } },
  { id: "cozy", name: "Cozy", description: "Gentle, warm and relaxed", values: { playfulness: 35, flirtiness: 25, affection: 90, sass: 15, energy: 25 } },
  { id: "flirty", name: "Flirty", description: "Affectionate and cheeky", values: { playfulness: 70, flirtiness: 95, affection: 90, sass: 65, energy: 65 } },
  { id: "focused", name: "Focused", description: "Calm and helpful", values: { playfulness: 15, flirtiness: 0, affection: 40, sass: 10, energy: 35 } },
  { id: "chaos", name: "Orange Chaos", description: "One brain cell, maximum energy", values: { playfulness: 100, flirtiness: 55, affection: 70, sass: 95, energy: 100 } }
];

export function matchingPreset(personality: Personality): PersonalityPreset | undefined {
  return PERSONALITY_PRESETS.find(preset =>
    PERSONALITY_TRAITS.every(({ key }) => preset.values[key] === personality[key])
  );
}

export function findPreset(name: string): PersonalityPreset | undefined {
  const normalized = name.toLowerCase().trim().replace(/[\s_-]+/g, "");
  return PERSONALITY_PRESETS.find(preset =>
    preset.id === normalized ||
    preset.name.toLowerCase().replace(/\s+/g, "") === normalized
  ) || (normalized === "chaotic" ? PERSONALITY_PRESETS.find(preset => preset.id === "chaos") : undefined);
}

/** Uniform 0, 5, ... 100 for each trait. Injectable random source for repeatable tests. */
export function randomPersonality(random: () => number = Math.random): Personality {
  const score = () => Math.floor(random() * 21) * 5;
  return { playfulness: score(), flirtiness: score(), affection: score(), sass: score(), energy: score() };
}
