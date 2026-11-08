/** Remove formatting, citations and character stage directions from audible text. */
export function toSpeechText(markdown: string): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^`{3}[\s\S]*$/gm, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, " ")
    .replace(/_([^_\n]+)_/g, " ")
    .replace(/\[(?:\d{1,3}|Stopped|Interrupted:[^\]]+)\]/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}(?:>|[-+*]|\d+\.)\s+/gm, "")
    .replace(/[~#|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= 800) return text;
  // Keep an intelligible first passage rather than sending a multi-page reply to TTS.
  const passage = text.slice(0, 800);
  const boundary = Math.max(passage.lastIndexOf(". "), passage.lastIndexOf("! "), passage.lastIndexOf("? "));
  return (boundary > 350 ? passage.slice(0, boundary + 1) : passage.trimEnd()).trim();
}
export const VOICE_TEST_LINE =
  "Hey there! I'm Mikan. I finally have a voice. Let's see if I can sound cute without turning into a squeaky toy.";

/** Break text into short WAV synthesis jobs; avoid delaying the first spoken word. */
export function splitSpeechText(text: string, maxChars = 160): string[] {
  if (maxChars < 32) throw new Error("Speech chunks need at least 32 characters");
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars + 1);
    let boundary = -1;
    for (const regex of [/[.!?]["')\]]*\s+/g, /[,;:]\s+/g, /\s+/g]) {
      for (const match of window.matchAll(regex)) {
        const end = match.index + match[0].length;
        if (end >= Math.floor(maxChars * 0.3) && end <= maxChars) boundary = end;
      }
      if (boundary !== -1) break;
    }
    const cut = boundary === -1 ? maxChars : boundary;
    const chunk = remaining.slice(0, cut).trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
