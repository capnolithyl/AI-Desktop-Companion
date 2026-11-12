/**
 * Extract expressive emoji from assistant prose without changing the original
 * stored reply. Ignore fenced/inline code so copying generated code still works.
 * No model request, extra dependency, or avatar renderer integration needed.
 */
const EMOJI = /(?:\p{Regional_Indicator}{1,2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0E|\uFE0F)?(?:\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0E|\uFE0F)?(?:\p{Emoji_Modifier})?)*)/gu;
const STRAY_EMOJI_PARTS = /[\uFE0E\uFE0F\u200D\u20E3\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]/gu;
const CODE = /(\x60{3}[\s\S]*?\x60{3}|\x60[^\x60\n]*\x60)/g;

export const DEFAULT_EMOJI_BUBBLE_SECONDS = 6;
export const MIN_EMOJI_BUBBLE_SECONDS = 2;
export const MAX_EMOJI_BUBBLE_SECONDS = 15;

/** Restore a persisted duration safely; old installs use the shorter new default. */
export function readEmojiBubbleSeconds(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(MIN_EMOJI_BUBBLE_SECONDS, Math.min(MAX_EMOJI_BUBBLE_SECONDS, Math.round(value)))
    : DEFAULT_EMOJI_BUBBLE_SECONDS;
}

function cleanGaps(text: string): string {
  return text
    .replace(/[ \t]+([,.!?;:])/g, "$1")
    .replace(/ {2,}/g, " ");
}

/** Remove emoji glyphs (including joined sequences, skin tones and flags) before synthesis. */
export function stripEmojis(text: string): string {
  return text.replace(EMOJI, " ").replace(STRAY_EMOJI_PARTS, "");
}

/** Move at most three distinct prose emojis into temporary avatar thought bubbles. */
export function extractReplyEmojis(reply: string, maxEmojis = 3): {
  visibleText: string;
  emojis: string[];
} {
  const emojis: string[] = [];
  let moved = false;
  const text = reply.split(CODE).map((part, index) => {
    if (index % 2 === 1) return part; // Preserve Markdown code verbatim.
    // Only tidy lines where we actually removed emoji. Other lines may rely
    // on whitespace for Markdown indentation, tables and hard line breaks.
    return part.split(/(\r?\n)/).map(line => {
      if (line.search(EMOJI) < 0) return line;
      return cleanGaps(line.replace(EMOJI, (emoji) => {
        moved = true;
        if (emojis.length < maxEmojis && !emojis.includes(emoji)) emojis.push(emoji);
        return " ";
      }).replace(STRAY_EMOJI_PARTS, ""));
    }).join("");
  }).join("");
  return { visibleText: moved ? text.trimEnd() : text, emojis };
}
