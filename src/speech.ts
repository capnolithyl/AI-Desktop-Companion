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
