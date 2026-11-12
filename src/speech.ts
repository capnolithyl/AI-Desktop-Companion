import { stripEmojis } from "./emoji-reactions.ts";

/** Wait for closing Markdown emphasis before dispatching streaming speech. */
function hasUnclosedEmphasis(markdown: string): boolean {
  let open = false;
  for (let i = 0; i < markdown.length; i++) {
    if (markdown[i] !== "*" || (i > 0 && markdown[i - 1] === "\\")) continue;
    if (markdown[i + 1] === "*") { i++; continue; } // **bold**, not a roleplay action
    if (/\s/.test(markdown[i + 1] ?? "")) continue; // Markdown * list item, not an action
    open = !open;
  }
  return open;
}

/** Strip Markdown markup but keep spoken emphasis (*really*, *meow*, etc.). */
export function toSpeechText(markdown: string): string {
  return stripEmojis(markdown)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^`{3}[\s\S]*$/gm, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/(^|\s)\*(?![\s*])([^*\n]+)$/gm, "$1$2") // strip dangling emphasis marker, retain speech
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/\[(?:\d{1,3}|Stopped|Interrupted:[^\]]+)\]/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}(?:>|[-+*]|\d+\.)\s+/gm, "")
    .replace(/[~#|]/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
/** Pocket accepts audio-only reference swaps; Qwen requires an online server and transcript. */
export function canSaveVoiceReference(
  engine: "pocket" | "qwen", hasFile: boolean, serverReady: boolean, referenceChecked: boolean, transcript: string
): boolean {
  return hasFile && (engine === "pocket" || (serverReady && referenceChecked && !!transcript.trim()));
}

/** Voice loudness default for both local TTS engines, independent of Windows volume. */
export const DEFAULT_VOICE_VOLUME = 55;
export function readVoiceVolume(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0,Math.min(100,Math.round(value))) : DEFAULT_VOICE_VOLUME;
}

/** HTMLAudioElement.volume expects [0,1]. Keep WAV amplitude unchanged. */
export function voicePlaybackGain(percent: number): number {
  return Number.isFinite(percent) ? Math.min(1,Math.max(0,percent/100)) : 0.55;
}

export const POCKET_VOICE_ENDPOINT = "http://127.0.0.1:8766";
export function voiceEndpoint(voice: {engine: string; endpoint: string}): string {
  return voice.engine === "pocket" ? POCKET_VOICE_ENDPOINT : voice.endpoint;
}

export const FIRST_SPEECH_CHARS = 72;
export const SPEECH_CHUNK_CHARS = 160;
// Pocket starts on a complete sentence, then uses longer passages for
// natural prosody and overlap with the next in-flight Ollama sentence.
export const POCKET_FIRST_SPEECH_CHARS = 180;
export const POCKET_SPEECH_CHUNK_CHARS = 420;
export const POCKET_FINAL_SPEECH_CHARS = 650;
// A backstop for speculative buffering, not a limit on readback length:
// finish() enqueues the *entire* verified final reply.
export const MAX_SPEECH_CHARS = 8000;

export const VOICE_TEST_LINE =
  "Hey there! I'm Mikan. I finally have a voice. Let's see if I can sound cute without turning into a squeaky toy.";

/** Break text into short WAV synthesis jobs; avoid delaying the first spoken word. */
export function splitSpeechText(text: string, maxChars = SPEECH_CHUNK_CHARS, firstChunkChars = maxChars): string[] {
  if (firstChunkChars < 32) throw new Error("The first speech chunk needs at least 32 characters");
  if (maxChars < 32) throw new Error("Speech chunks need at least 32 characters");
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > (chunks.length === 0 ? Math.min(maxChars, firstChunkChars) : maxChars)) {
    const limit = chunks.length === 0 ? Math.min(maxChars, firstChunkChars) : maxChars;
    const window = remaining.slice(0, limit + 1);
    let boundary = -1;
    for (const regex of [/[.!?]["')\]]*\s+/g, /[,;:]\s+/g, /\s+/g]) {
      for (const match of window.matchAll(regex)) {
        const end = (match.index ?? 0) + match[0].length;
        if (end >= Math.floor(limit * 0.3) && end <= limit) boundary = end;
      }
      if (boundary !== -1) break;
    }
    const cut = boundary === -1 ? limit : boundary;
    const chunk = remaining.slice(0, cut).trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}


/** Only feed speculative chunks to TTS when no web or source verification
 * can replace the answer. Chat with active cloud web tools stays buffered
 * until the final reply is checked, even when automatic research is optional.
 */
export function maySpeakProgressively(options: {
  autoSpeak:boolean; progressiveSpeak:boolean; localTurn:boolean;
  withSearch:boolean; attachment:boolean; screenshot:boolean;
  liveFrame:boolean; webResearch:boolean; cloudWebTools:boolean;
  chatMode:boolean;
}):boolean {
  return options.autoSpeak && options.progressiveSpeak && options.localTurn &&
    !options.withSearch && !options.attachment && !options.screenshot &&
    !options.liveFrame && !options.webResearch && !options.cloudWebTools &&
    options.chatMode;
}

/** A conservative, bounded feed of complete clauses from a streaming model reply.
 * Qwen3-TTS itself still returns whole WAVs; this overlaps text generation with
 * synthesis and uses a shorter first phrase. It is NOT codec-level streaming.
 */
export class ProgressiveSpeechFeed implements AsyncIterable<string> {
  private readonly engine: "qwen" | "pocket";
  constructor(engine: "qwen" | "pocket" = "qwen") { this.engine = engine; }
  private buffer = "";
  private spoken = "";
  private rawChars = 0;
  private queue: string[] = [];
  private waiter: ((value: IteratorResult<string>) => void) | null = null;
  private ended = false;
  private aborted = false;

  append(delta: string): void {
    if (this.ended || !delta || this.rawChars >= MAX_SPEECH_CHARS) return;
    const available = MAX_SPEECH_CHARS - this.rawChars;
    const addition = delta.slice(0, available);
    this.rawChars += addition.length;
    this.buffer += addition;
    // Wait for natural boundaries, avoiding short, jerky individual tokens.
    while (true) {
      // Don't read partially streamed code fences aloud.
      if (this.buffer.includes("```")) break;
      const first = !this.spoken;
      const limit = this.engine === "pocket"
        ? (first ? POCKET_FIRST_SPEECH_CHARS : POCKET_SPEECH_CHUNK_CHARS)
        : (first ? FIRST_SPEECH_CHARS : SPEECH_CHUNK_CHARS);
      const minimum = first ? 24 : 55;
      if (this.buffer.length < minimum) break;
      const window = this.buffer.slice(0, limit + 1);
      let boundary = 0;
      for (const [pattern, floor] of [
        [/[.!?]["')\]]*\s+/g, first ? 20 : 40],
        [/[,;:]\s+/g, first ? 35 : 60],
      ] as const) {
        for (const match of window.matchAll(pattern)) {
          const end = (match.index ?? 0) + match[0].length;
          if (end >= floor && end <= limit && !hasUnclosedEmphasis(this.buffer.slice(0, end))) {
            boundary = end;
            if (first) break;
          }
        }
        if (boundary) break;
      }
      if (!boundary && this.buffer.length >= limit) {
        // Never split within unfinished *emphasis*: a later token can
        // supply the closing marker, and mismatched cleanup would replay text.
        const head = window.slice(0, limit);
        for (let space = head.lastIndexOf(" "); space >= minimum; space = head.lastIndexOf(" ", space - 1)) {
          if (!hasUnclosedEmphasis(head.slice(0, space + 1))) {
            boundary = space + 1;
            break;
          }
        }
        if (!boundary && !hasUnclosedEmphasis(head)) boundary = limit;
      }
      if (!boundary) break;
      const part = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary).trimStart();
      this.emit(toSpeechText(part));
    }
  }

  /** Reconcile speculative spoken clauses with the verified final reply.
   * Return false if the final answer changed an already-dispatched prefix.
   * The caller must stop the feed and use ordinary final-text playback then.
   */
  finish(finalMarkdown: string): boolean {
    if (this.aborted) return false;
    const finalSpeech = toSpeechText(finalMarkdown);
    if (this.spoken && (!finalSpeech.startsWith(this.spoken) ||
        (finalSpeech.length > this.spoken.length &&
          !/\s/.test(finalSpeech.charAt(this.spoken.length))))) {
      this.abort();
      return false;
    }
    const remainder = finalSpeech.slice(this.spoken.length).trim();
    const chunkChars = this.engine === "pocket" ? POCKET_SPEECH_CHUNK_CHARS : SPEECH_CHUNK_CHARS;
    const firstChars = this.spoken ? chunkChars
      : this.engine === "pocket" ? POCKET_FIRST_SPEECH_CHARS : FIRST_SPEECH_CHARS;
    for (const piece of splitSpeechText(remainder, chunkChars, firstChars)) this.emit(piece);
    this.ended = true;
    this.notifyDone();
    return true;
  }

  abort(): void {
    this.aborted = true;
    this.ended = true;
    this.queue.length = 0;
    this.notifyDone();
  }

  [Symbol.asyncIterator](): AsyncIterator<string> {
    return { next: () => this.take() };
  }

  private emit(text: string): void {
    if (!text || this.ended) return;
    this.spoken = this.spoken ? this.spoken + " " + text : text;
    if (this.waiter) {
      const resolve = this.waiter;
      this.waiter = null;
      resolve({ done: false, value: text });
    } else {
      this.queue.push(text);
    }
  }

  private take(): Promise<IteratorResult<string>> {
    const next = this.queue.shift();
    if (next !== undefined) return Promise.resolve({ done: false, value: next });
    if (this.ended) return Promise.resolve({ done: true, value: undefined });
    return new Promise(resolve => { this.waiter = resolve; });
  }

  private notifyDone(): void {
    if (!this.waiter || this.queue.length) return;
    const resolve = this.waiter;
    this.waiter = null;
    resolve({ done: true, value: undefined });
  }
}
