/**
 * Ordinary-chat output guard. A small local model can keep copying narrated
 * gestures from its own old answers, even after its prompt changes.
 *
 * Only delimited, recognizable physical actions are omitted. Actual words
 * and one-word vocalizations such as *meow*, *really*, and *purr* survive.
 * Explicit roleplay bypasses this filter entirely.
 *
 * Identical logic is applied while streaming (including progressive TTS),
 * in finalized replies, and to old assistant turns sent back to the model.
 */
const anatomy = /\b(?:ears?|tails?|paws?|whiskers?|eyes?|eyelids?|cheeks?|chin|head|hands?|arms?|fingers?|shoulders?|hair|body|face|smile|gaze|nose|lips?|feet|wrist)\b/i;
const movement = /\b(?:perk(?:s|ed|ing)?|twitch(?:es|ed|ing)?|flick(?:s|ed|ing)?|curl(?:s|ed|ing)?|wag(?:s|ged|ging)?|sway(?:s|ed|ing)?|swish(?:es|ed|ing)?|nuzzl\w*|lean\w*|tilt\w*|stretch\w*|squeez\w*|wiggl\w*|fold\w*|press\w*|reach\w*|rest\w*|turn\w*|brush\w*|rub\w*|flatten\w*|droop\w*|perk\w*|sparkle\w*|soften\w*|glow\w*|light(?:s|ing)?\s+up|blink\w*|grin\w*|smirk\w*|blush\w*|smil\w*|giggl\w*|chuckl\w*|purr\w*|nod\w*|wav\w*|gesture\w*|shift\w*|pout\w*|scratch\w*|lift\w*|tap\w*)\b/i;
const firstPersonAction = /\b(?:I|she|he)\s+(?:\w+ly\s+)?(?:lean\w*|tilt\w*|stretch\w*|wave\w*|nod\w*|smile\w*|grin\w*|smirk\w*|nuzzle\w*|shift\w*|wiggle\w*|reach\w*|scratch\w*|lift\w*|tap\w*|giggle\w*|chuckle\w*|purr\w*|blush\w*|step\w*|move\w*|turn\w*|rest\w*)\b/i;
const startingAction = /^(?:nuzzl\w*|giggl\w*|chuckl\w*|blush\w*|smirk\w*|grin\w*|nod\w*|wav\w*|lean\w*|tilt\w*|wiggl\w*|purr\w*)\b/i;

export function isNarratedAction(content: string): boolean {
  const text = content.trim();
  // A single sound or emphasized word is dialogue, never stage narration.
  if (!text || !/\s/.test(text) || text.length > 600) return false;
  return firstPersonAction.test(text)
    || startingAction.test(text)
    || (anatomy.test(text) && movement.test(text));
}

/** A user can explicitly enter roleplay; casual references to RP do not count. */
export function roleplayActive(question: string, history: {role:string;content:string}[] = []): boolean {
  const lines = [...history.filter(t => t.role === "user").slice(-8).map(t=>t.content), question];
  let active = false;
  for (const text of lines) {
    if (/\b(?:stop|end|quit|leave|exit|pause|no more)\b.{0,30}\b(?:roleplay|role-play|rp|in.character)\b/i.test(text)) active = false;
    else if (/\b(?:let(?:'|’)?s|can we|could we|please|start|begin|continue|resume|do|play|stay in)\b.{0,65}\b(?:roleplay|role-play|rp|in.character)\b/i.test(text) ||
       isNarratedAction(/^\s*\*([^*\n]{2,150})\*/.exec(text)?.[1] ?? "")) active = true;
  }
  return active;
}

export class NarrationFilter {
  private pending = "";
  private rendered = "";
  private readonly enabled: boolean;
  constructor(enabled = true) { this.enabled = enabled; }

  append(delta: string): string {
    if (!delta) return "";
    if (!this.enabled) { this.rendered += delta; return delta; }
    this.pending += delta;
    return this.drain(false);
  }

  finish(): string {
    if (this.enabled) this.drain(true);
    return this.rendered.trim();
  }

  private drain(final: boolean): string {
    let next = "";
    let index = 0;
    const text = this.pending;
    while (index < text.length) {
      const star = text.indexOf("*", index);
      if (star < 0) { next += text.slice(index); index = text.length; break; }
      next += text.slice(index, star);
      // Double asterisks, escaped stars, multiplication and Markdown lists
      // are not a physical-action delimiter.
      if (star === text.length - 1 && !final) { index = star; break; }
      if (text.startsWith("**", star)) {
        // **bold** is emphasis, never a stage-direction wrapper.
        const endBold = text.indexOf("**", star + 2);
        if (endBold < 0 && !final && text.length - star < 800) { index = star; break; }
        if (endBold < 0) { next += text.slice(star); index = text.length; break; }
        next += text.slice(star, endBold + 2);
        index = endBold + 2;
        continue;
      }
      if ((star > 0 && text[star - 1] === "\\") ||
          /\s/.test(text[star + 1] ?? "")) {
        next += text[star];
        index = star + 1;
        continue;
      }
      const end = text.indexOf("*", star + 1);
      const newline = text.indexOf("\n", star + 1);
      if (newline >= 0 && (end < 0 || newline < end)) {
        next += text.slice(star, newline);
        index = newline;
        continue;
      }
      if (end < 0) {
        // Wait for a closing star so spoken words and the visible reply agree.
        // Malformed Markdown must not hold streaming forever.
        if (!final && text.length - star < 800) { index = star; break; }
        const part = text.slice(star);
        next += isNarratedAction(part.slice(1)) ? "" : part;
        index = text.length;
        break;
      }
      const body = text.slice(star + 1, end);
      if (!isNarratedAction(body)) next += text.slice(star, end + 1);
      index = end + 1;
    }
    this.pending = text.slice(index);
    this.rendered += next;
    return next;
  }
}

export function stripNarratedActions(markdown: string): string {
  const filter = new NarrationFilter();
  filter.append(markdown);
  return filter.finish();
}
