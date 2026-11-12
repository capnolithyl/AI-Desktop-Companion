/**
 * Extract expressive emoji from assistant prose without changing the original
 * stored reply. Ignore fenced/inline code so copying generated code still works.
 * No model request, extra dependency, or avatar renderer integration needed.
 */
const EMOJI = /(?:\p{Regional_Indicator}{1,2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0E|\uFE0F)?(?:\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0E|\uFE0F)?(?:\p{Emoji_Modifier})?)*)/gu;
const STRAY_EMOJI_PARTS = /[\uFE0E\uFE0F\u200D\u20E3\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]/gu;
const CODE = /(\x60{3}[\s\S]*?\x60{3}|\x60[^\x60\n]*\x60)/g;

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
  const visibleText = reply.split(CODE).map((part, index) => {
    if (index % 2 === 1) return part; // Preserve Markdown code verbatim.
    return cleanGaps(part.replace(EMOJI, (emoji) => {
      if (emojis.length < maxEmojis && !emojis.includes(emoji)) emojis.push(emoji);
      return " ";
    }).replace(STRAY_EMOJI_PARTS, ""));
  }).join("");
  return { visibleText, emojis };
}
