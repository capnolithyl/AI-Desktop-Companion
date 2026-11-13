import type { WebResult } from "./web-search";

export type OllamaStats = {
  outputTokens: number | null;
  promptTokens: number | null;
  totalDurationNs: number | null;
  loadDurationNs: number | null;
  promptEvalDurationNs: number | null;
  evalDurationNs: number | null;
};

export type ResearchAudit = {
  status: "used" | "fallback";
  accepted: number;
  rejected: number;
  elapsedMs: number;
  note: string;
};

export type MemoryRecallAudit = {
  storedFacts: number;
  semanticService: "ready" | "offline" | "unknown";
  semanticReason?: string;
  semanticCandidates: number;
  strongSemanticMatches: number;
  selectionMethod?: "ai-reranked" | "hybrid-rrf" | "fallback" | "small-talk" | "empty";
  selectionCandidates?: number;
  selectionTimeMs?: number;
  selectionNote?: string;
  semanticScores?: {id:number;score:number|null}[];
  maxFacts: number;
  facts: {
    id: number;
    fact: string;
    category: string;
    tags: string[];
    pinned: boolean;
    semantic: boolean;
  }[];
  /** Separate SQLite interest lookup. Returned is NOT synonymous with injected. */
  interests?: {
    returned: {id:number;name:string;kind:string;status:string}[];
    included: {id:number;promptLine:string}[];
    suppressedForCharacter: boolean;
    searchError?: string;
  };
};

export type ToolPlanningAudit = {
  method: string;
  reason: string;
  query?: string;
  topic?: string;
  publicWebAllowed: boolean;
  searchOutcome?: string;
  freshSources?: number;
};
export type NotionRetrievalAudit = {
  selectedPage?: string;
  cachedPages: number;
  excerptCount: number;
  fullReadAttempted: boolean;
  readSucceeded: boolean;
  linkedScenesRead?: number;
  linkedSceneCharacters?: number;
  sourceMode?: "original-prose" | "per-scene-notes";
  approvedProseCharacters?: number;
  /** Scene titles and counts only: never export unpublished manuscript text. */
  sceneTitles?: string[];
  groundingBlocked?: boolean;
  unsupportedQuotes?: number;
  unsupportedDetails?: number;
  rereadRequested?: boolean;
  modelPolicy?: string;
  falseAccessDenialBlocked?: boolean;
  readFailure?: string;
};

export type PreparationTaskAudit = {
  name: string;
  elapsedMs: number;
  status: "complete" | "ready" | "unavailable";
};

export type Diagnostics = {
  elapsedMs: number;
  firstTokenMs: number | null;
  /** Milliseconds from send to first audible WAV playback, if measured. */
  firstAudioMs?: number;
  model: string;
  /** Provider configured for the turn, not necessarily the backend that replied. */
  provider?: "local" | "auto" | "openrouter" | "gemini";
  fallbackReason?: string | null;
  stats: OllamaStats | null;
  research?: ResearchAudit;
  answerVerification?: {checked:number;rejected:number;recoveredHeadline:boolean};
  memory?: MemoryRecallAudit;
  toolPlan?: ToolPlanningAudit;
  notion?: NotionRetrievalAudit;
  parallelTasks?: PreparationTaskAudit[];
};

export type DebugLogMessage = {
  id: string;
  role: "user" | "assistant";
  createdAt: number;
  content: string;
  failed?: boolean;
  searchQuery?: string;
  sourcesCarriedOver?: boolean;
  sources?: WebResult[];
  diagnostics?: Diagnostics;
};

export type DebugLogOptions = {
  conversationId: string | null;
  model: string;
  provider?: "local" | "auto" | "gemini" | "openrouter";
  geminiModel?: string;
  openrouterModel?: string;
  contextWindow: number | null;
  avatarAnimation?: string;
  exportedAt?: Date;
};

function duration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "n/a";
  return ms >= 1000 ? (ms / 1000).toFixed(2) + " s" : Math.round(ms) + " ms";
}

function fromNanoseconds(ns: number | null | undefined): string {
  return ns == null ? "n/a" : duration(ns / 1_000_000);
}

function timestamp(time: number): string {
  const date = new Date(time);
  if (!Number.isFinite(date.getTime())) return "unknown";
  return date.toLocaleString() + " (" + date.toISOString() + ")";
}

function performanceLines(diagnostics: Diagnostics): string[] {
  const s = diagnostics.stats;
  const memory = diagnostics.memory;
  const speed = s?.outputTokens != null && s.evalDurationNs != null && s.evalDurationNs > 0
    ? (s.outputTokens / (s.evalDurationNs / 1e9)).toFixed(1) + " tok/s" : "n/a";
  return [
    "Performance:",
    "  Wall time: " + duration(diagnostics.elapsedMs),
    "  First token: " + duration(diagnostics.firstTokenMs),
    ...(diagnostics.firstAudioMs == null ? [] : ["  First spoken audio: " + duration(diagnostics.firstAudioMs)]),
    "  Output: " + (s?.outputTokens == null ? "n/a" : s.outputTokens + " tokens"),
    "  Speed: " + speed,
    "  Prompt: " + (s?.promptTokens == null ? "n/a" : s.promptTokens + " tokens"),
    "  Model time: " + fromNanoseconds(s?.totalDurationNs),
    "  Load time: " + fromNanoseconds(s?.loadDurationNs),
    "  Prompt eval: " + fromNanoseconds(s?.promptEvalDurationNs),
    "  Model: " + diagnostics.model,
    ...(diagnostics.fallbackReason ? ["  Cloud fallback: " + diagnostics.fallbackReason] : []),
    ...(diagnostics.research ? [
      "  Research evidence: " + diagnostics.research.status,
      "  Accepted source-anchored facts: " + diagnostics.research.accepted,
      "  Rejected candidates: " + diagnostics.research.rejected,
      "  Extraction time: " + duration(diagnostics.research.elapsedMs),
      "  Evidence note: " + diagnostics.research.note
    ] : []),
    ...(diagnostics.answerVerification ? [
      "Final answer evidence check:",
      "  Model claims checked: " + diagnostics.answerVerification.checked,
      "  Model claims rejected: " + diagnostics.answerVerification.rejected,
      "  Source-headline fallback: " + (diagnostics.answerVerification.recoveredHeadline ? "yes" : "no")
    ] : []),
    ...(diagnostics.toolPlan ? [
      "Tool planning:",
      "  Route: " + diagnostics.toolPlan.method,
      "  Reason: " + diagnostics.toolPlan.reason,
      "  Public web allowed: " + (diagnostics.toolPlan.publicWebAllowed ? "yes" : "no"),
      ...(diagnostics.toolPlan.searchOutcome ? [
        "  Web outcome: " + diagnostics.toolPlan.searchOutcome,
        "  Fresh sources returned: " + (diagnostics.toolPlan.freshSources ?? 0)
      ] : []),
      ...(diagnostics.toolPlan.query ? ["  Public search query: " + diagnostics.toolPlan.query] : []),
      ...(diagnostics.toolPlan.topic ? ["  Preferred source topic: " + diagnostics.toolPlan.topic] : [])
    ] : []),
    ...(diagnostics.notion ? [
      "Notion retrieval:",
      "  Cached pages: " + diagnostics.notion.cachedPages,
      "  Matching excerpts: " + diagnostics.notion.excerptCount,
      "  Selected page: " + (diagnostics.notion.selectedPage ?? "none"),
      "  Complete chapter read requested: " + (diagnostics.notion.fullReadAttempted ? "yes" : "no"),
      "  Complete chapter read succeeded: " + (diagnostics.notion.readSucceeded ? "yes" : "no"),
      "  Linked scene pages read: " + (diagnostics.notion.linkedScenesRead ?? 0),
      "  Linked scene characters cached: " + (diagnostics.notion.linkedSceneCharacters ?? 0),
      ...(diagnostics.notion.rereadRequested !== undefined ? [
        "  Explicit reread requested: " + (diagnostics.notion.rereadRequested ? "yes" : "no")
      ] : []),
      ...(diagnostics.notion.sourceMode ? [
        "  Manuscript source mode: " + diagnostics.notion.sourceMode,
        "  Approved prose characters: " + (diagnostics.notion.approvedProseCharacters ?? 0),
        "  Approved scenes: " + (diagnostics.notion.sceneTitles?.join(" | ") ?? "n/a"),
        "  Manuscript grounding blocked reply: " + (diagnostics.notion.groundingBlocked ? "yes" : "no"),
        "  Unsupported dialogue excerpts: " + (diagnostics.notion.unsupportedQuotes ?? 0),
        "  Suspect concrete details: " + (diagnostics.notion.unsupportedDetails ?? 0),
        ...(diagnostics.notion.modelPolicy ? [
          "  Document-analysis model policy: " + diagnostics.notion.modelPolicy
        ] : []),
        ...(diagnostics.notion.falseAccessDenialBlocked !== undefined ? [
          "  False Notion-access denial blocked: " + (diagnostics.notion.falseAccessDenialBlocked ? "yes" : "no")
        ] : [])
      ] : []),
      ...(diagnostics.notion.readFailure ? ["  Reading failure: " + diagnostics.notion.readFailure] : [])
    ] : []),
    ...(diagnostics.parallelTasks?.length ? [
      "Parallel preparation:",
      ...diagnostics.parallelTasks.map(task =>
        "  " + task.name + ": " + task.status + " (" + duration(task.elapsedMs) + ")")
    ] : []),
    ...(memory ? [
      "Memory recall (facts actually included in the prompt):",
      "  SQLite facts available: " + memory.storedFacts,
      "  Semantic service: " + memory.semanticService +
        (memory.semanticReason ? " (" + memory.semanticReason + ")" : ""),
      "  Semantic candidates returned: " + memory.semanticCandidates,
      "  Strong semantic matches (legacy cutoff): " + memory.strongSemanticMatches,
      ...(memory.semanticScores?.length ? [
        "  Nearest-neighbor scores (not an absolute relevance test): " +
          memory.semanticScores.map(hit =>
            "#" + hit.id + "=" + (hit.score == null ? "n/a" : hit.score.toFixed(3))).join(", ")
      ] : []),
      ...(memory.selectionMethod ? [
        "  Selection method: " + memory.selectionMethod,
        "  AI candidates considered: " + (memory.selectionCandidates ?? "n/a"),
        "  Selection time: " + duration(memory.selectionTimeMs),
        ...(memory.selectionNote ? ["  Selection note: " + memory.selectionNote] : [])
      ] : []),
      "  Selected facts: " + memory.facts.length + " / " + memory.maxFacts + " maximum",
      ...(memory.facts.length
        ? memory.facts.flatMap((fact, index) => [
          "  [" + (index + 1) + "] ID " + fact.id + " | " + fact.category +
            " | " + (fact.pinned ? "pinned" : "not pinned") +
            " | " + (fact.semantic ? "semantic match" : fact.pinned ? "pinned core" :
              memory.selectionMethod === "ai-reranked" ? "AI-selected" : memory.selectionMethod === "hybrid-rrf" ? "FTS5 + semantic fusion" : "keyword/category/tag match") +
            (fact.tags.length ? " | tags: " + fact.tags.join(", ") : ""),
          "    " + fact.fact
        ])
        : ["  No user facts were included in this model prompt."])
    ] : []),
    ...(memory?.interests ? [
      "Structured interest recall (SQLite collection, separate from personal facts):",
      "  Lookup: " + (memory.interests.searchError ? "failed ("+memory.interests.searchError+")" : "completed"),
      "  Collection candidates returned: " + memory.interests.returned.length,
      "  Interest items included in prompt: " + memory.interests.included.length,
      ...(memory.interests.suppressedForCharacter ? [
        "  Owner interests suppressed because the question concerns Mikan's own preferences."
      ] : []),
      ...(memory.interests.returned.length
        ? memory.interests.returned.map((item,index)=>
          "  ["+(index+1)+"] ID "+item.id+" | "+item.kind+" | "+item.status+" | "+
          (memory.interests!.included.some(injected=>injected.id===item.id)?"in prompt":"not in prompt")+
          " | "+item.name)
        : ["  No matching structured interests were returned."]),
      ...(memory.interests.included.length ? [
        "  Exact interest lines actually supplied to the model:",
        ...memory.interests.included.map(item=>"    #"+item.id+" "+item.promptLine)
      ] : ["  No structured interest lines were supplied to the model."])
    ] : [])
  ];
}

/**
 * Copy exactly the current conversation and its attached debugging evidence.
 * This is an explicit, user-initiated export. It never reads unrelated chats,
 * system prompts, credentials, or local memory records.
 */
export function formatDebugLog(messages: readonly DebugLogMessage[], options: DebugLogOptions): string {
  const lines = [
    "MIKAN DEBUG LOG",
    "Exported: " + (options.exportedAt ?? new Date()).toISOString(),
    "Conversation ID: " + (options.conversationId ?? "none"),
    "Current selected model: " + options.model,
    ...(options.provider ? ["Inference provider setting: " + options.provider] : []),
    ...(options.openrouterModel && (options.provider === "auto" || options.provider === "openrouter")
      ? ["Configured OpenRouter model: " + options.openrouterModel] : []),
    ...(options.geminiModel && options.provider === "gemini"
      ? ["Configured Gemini model: " + options.geminiModel] : []),
    "Context window: " + (options.contextWindow == null ? "Ollama default" : options.contextWindow + " tokens"),
    "Message count: " + messages.length,
    ...(options.avatarAnimation ? ["Avatar animation (snapshot at export):", options.avatarAnimation] : []),
    "Note: Contains conversation text, source excerpts, selected personal-memory facts and structured interest matches. Review before sharing.",
    ""
  ];

  for (const message of messages) {
    lines.push("=== " + (message.role === "user" ? "YOU" : "MIKAN") + " | " + timestamp(message.createdAt) + " ===");
    lines.push("Message ID: " + message.id);
    lines.push(message.content || "(Empty / still generating)");
    if (message.failed) lines.push("Status: failed or interrupted");

    if (message.searchQuery) lines.push("SearXNG query: " + message.searchQuery);
    if (message.sources?.length) {
      lines.push(message.sourcesCarriedOver
        ? "Sources carried from earlier research (not refreshed):"
        : "Retrieved sources (not independently verified):");
      message.sources.forEach((source, index) => {
        lines.push("[" + (index + 1) + "] " + source.title);
        lines.push("  URL: " + source.url);
        lines.push("  Published: " + (source.publishedDate ?? "not supplied"));
        lines.push("  Engine: " + source.engine);
        lines.push("  Excerpt: " + (source.content || "(none)").replace(/\n/g, "\n  "));
      });
    }

    if (message.diagnostics) lines.push(...performanceLines(message.diagnostics));
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}
