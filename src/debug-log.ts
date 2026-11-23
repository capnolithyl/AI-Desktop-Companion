import type { WebResult } from "./web-search";
import type { BuildInfo } from "./build-info";
import type { ResearchLimit, ResearchTask } from "./unified-planner.ts";

export type OllamaStats = {
  outputTokens: number | null;
  promptTokens: number | null;
  totalDurationNs: number | null;
  loadDurationNs: number | null;
  promptEvalDurationNs: number | null;
  evalDurationNs: number | null;
};

export type ResearchAudit = {
  status: string;
  accepted: number;
  contextualCount?: number;
  retrievalMs?: number;
  extractionMs?: number;
  rejected: number;
  elapsedMs: number;
  note: string;
  taskKind?: ResearchTask["kind"];
  taskSubject?: string;
  ignoredRequirements?: ResearchLimit[];
  followupQuery?: string;
  primaryRecoveryStatus?: string;
  recommendationTask?: boolean;
  recommendationApproved?: string[];
  recommendationRejected?: number;
  rejectedDetails?: string[];
  acceptedDetails?: {source:number;subject:string;claim:string;quote:string;detail?:number|null}[];
  extractionAttempts?: number;
  candidateLeads?: string[];
  candidateQueries?: string[];
  candidateDiscovery?: string;
  unresolvedDetails?: string[];
  constraintsChecked?: number;
  featuresChecked?: number;
  exclusionsChecked?: number;
  relationsChecked?: number;
  recommendationDetails?: {
    source: number;
    title: string;
    creator: string;
    identityQuote: string;
    fitQuote: string;
    measurements: {source:number;value:number;unit:string;quote:string}[];
    relations: {role:string;name:string;source:number;quote:string}[];
    missingDetails?: string[];
  }[];
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
  /** On-demand native tool returns only the IDs it disclosed to the model. */
  onDemand?: {query:string;ids:number[];error?:string|null}[];
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
  sourceRequirement?: "required" | "optional";
  query?: string;
  task?: ResearchTask;
  topic?: string;
  publicWebAllowed: boolean;
  searchOutcome?: string;
  freshSources?: number;
  searchTrace?: {attemptedQueries:string[];rawResults:number;returnedResults:number;
    provisionalResults?:number;rejectedTitles?:string[];upstreamErrors:string[]};
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
  provider?: "local" | "auto" | "openrouter" | "gemini" | "nvidia";
  fallbackReason?: string | null;
  stats: OllamaStats | null;
  research?: ResearchAudit;
  mikanify?: {applied:boolean;elapsedMs:number;draftCharacters:number;finalCharacters:number;error?:string};
  sourceGrounding?: {status:string;accepted:number;rejected:number;structured?:number;pagesRead:number;
    sourceIds:number[];error?:string|null};
  answerVerification?: {
    checked:number;rejected:number;recoveredHeadline:boolean;
    presentation?:"model-voice-preserved"|"source-only"
  };
  memory?: MemoryRecallAudit;
  toolPlan?: ToolPlanningAudit;
  reasoning?: {mode:"fast"|"auto"|"deep";enabled:boolean;reason:string};
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
  provider?: "local" | "auto" | "gemini" | "openrouter" | "nvidia";
  geminiModel?: string;
  openrouterModel?: string;
  contextWindow: number | null;
  avatarAnimation?: string;
  buildInfo?: BuildInfo;
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
    ...(diagnostics.reasoning ? [
      "  Local reasoning: "+diagnostics.reasoning.mode+
      " / "+(diagnostics.reasoning.enabled?"thinking":"quick")+
      " ("+diagnostics.reasoning.reason+")"
    ] : []),
    ...(diagnostics.fallbackReason ? ["  Cloud fallback: " + diagnostics.fallbackReason] : []),
    ...(diagnostics.mikanify ? [
      "  Mikanify answer: " + (diagnostics.mikanify.applied?"applied":"original draft retained"),
      "  Mikanify latency: " + duration(diagnostics.mikanify.elapsedMs),
      "  Draft / final characters: " + diagnostics.mikanify.draftCharacters+
        " / "+diagnostics.mikanify.finalCharacters,
      ...(diagnostics.mikanify.error?["  Mikanify failure: "+diagnostics.mikanify.error]:[])
    ] : []),
    ...(diagnostics.research ? [
      "  Research evidence: " + diagnostics.research.status,
      "  Accepted source-anchored facts: " + diagnostics.research.accepted,
      ...(diagnostics.research.contextualCount ? [
        "  Context-only excerpts (not proven requested details): " + diagnostics.research.contextualCount
      ] : []),
      "  Rejected candidates: " + diagnostics.research.rejected,
      ...(diagnostics.research.taskKind ? [
        "  Task kind: "+diagnostics.research.taskKind] : []),
      ...(diagnostics.research.unresolvedDetails?.length ? [
        "  Unresolved requested details: "+diagnostics.research.unresolvedDetails
          .map((detail,index)=>"["+index+"] "+detail).join("; ")] : []),
      ...(diagnostics.research.primaryRecoveryStatus ? [
        "  Primary-source recovery: "+diagnostics.research.primaryRecoveryStatus] : []),
      ...(diagnostics.research.rejectedDetails?.length
        ? ["  Rejection reasons: " + diagnostics.research.rejectedDetails.join("; ")] : []),
      ...(diagnostics.research.candidateLeads?.length
        ? ["  Individually identified candidates: " + diagnostics.research.candidateLeads.join(", ")] : []),
      ...(diagnostics.research.candidateQueries?.length
        ? diagnostics.research.candidateQueries.map(query=>"  Attempted candidate verification: "+query) : []),
      ...(diagnostics.research.acceptedDetails?.length
        ? diagnostics.research.acceptedDetails.map(fact =>
            "  Accepted excerpt [" + fact.source + "] " + fact.subject +
              (fact.detail == null ? " (context only)" : " (requested detail #"+fact.detail+")")+
              ": " + fact.claim + " | " + fact.quote) : []),
      ...(diagnostics.research.extractionAttempts && diagnostics.research.extractionAttempts>1
        ? ["  Local evidence extraction attempts: " + diagnostics.research.extractionAttempts] : []),
      "  Extraction time: " + duration(diagnostics.research.elapsedMs),
      "  Evidence note: " + diagnostics.research.note
    ] : []),
    ...(diagnostics.answerVerification ? [
      "Final answer evidence check:",
      "  Model claims checked: " + diagnostics.answerVerification.checked,
      "  Model claims rejected: " + diagnostics.answerVerification.rejected,
      "  Source-headline fallback: " + (diagnostics.answerVerification.recoveredHeadline ? "yes" : "no"),
      ...(diagnostics.answerVerification.presentation
        ? ["  Research presentation: "+diagnostics.answerVerification.presentation] : [])
    ] : []),
    ...(diagnostics.sourceGrounding ? [
      "NVIDIA source grounding (literal passages, not semantic model self-grading):",
      "  Status: " + diagnostics.sourceGrounding.status,
      "  Accepted source passages: " + diagnostics.sourceGrounding.accepted,
      "  Rejected unsupported passages: " + diagnostics.sourceGrounding.rejected,
      ...(diagnostics.sourceGrounding.structured != null ? [
        "  Conversation-ready named facts: " + diagnostics.sourceGrounding.structured
      ] : []),
      "  Full public pages read: " + diagnostics.sourceGrounding.pagesRead,
      "  Accepted source IDs: " + (diagnostics.sourceGrounding.sourceIds.length
        ? diagnostics.sourceGrounding.sourceIds.map(id=>"["+id+"]").join(", ") : "(none)"),
      ...(diagnostics.sourceGrounding.error
        ? ["  Grounding issue: " + diagnostics.sourceGrounding.error] : [])
    ] : []),
    ...(diagnostics.toolPlan ? [
      "Tool planning:",
      "  Route: " + diagnostics.toolPlan.method,
      "  Reason: " + diagnostics.toolPlan.reason,
      ...(diagnostics.toolPlan.task ? [
        "  Planned research task: "+diagnostics.toolPlan.task.kind,
        "  Planned subject: "+(diagnostics.toolPlan.task.subject??"(none)"),
        ...(diagnostics.toolPlan.task.details?.length
          ? diagnostics.toolPlan.task.details.map((detail,index)=>
            "  Requested detail #"+index+": "+detail) : [])
      ] : []),
      ...(diagnostics.toolPlan.sourceRequirement ? [
        "  Source requirement: "+diagnostics.toolPlan.sourceRequirement
      ] : []),
      "  Public web allowed: " + (diagnostics.toolPlan.publicWebAllowed ? "yes" : "no"),
      ...(diagnostics.toolPlan.searchOutcome ? [
        "  Web outcome: " + diagnostics.toolPlan.searchOutcome,
        "  Fresh sources returned: " + (diagnostics.toolPlan.freshSources ?? 0)
      ] : []),
      ...(diagnostics.toolPlan.searchTrace ? [
        "  Search engine returned raw candidates: "+diagnostics.toolPlan.searchTrace.rawResults,
        "  Sources retained after ranking: "+diagnostics.toolPlan.searchTrace.returnedResults,
        ...(diagnostics.toolPlan.searchTrace.provisionalResults ? [
          "  Provisional candidates awaiting source validation: "+diagnostics.toolPlan.searchTrace.provisionalResults
        ] : []),
        ...(diagnostics.toolPlan.searchTrace.rejectedTitles??[]).map(title=>
          "  Lexically rejected result title (untrusted): "+title),
        ...diagnostics.toolPlan.searchTrace.attemptedQueries.map((query,index)=>
          "  Executed search "+(index+1)+": "+query),
        ...diagnostics.toolPlan.searchTrace.upstreamErrors.map(error=>
          "  Upstream search issue: "+error)
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
        : ["  No saved SQLite facts were automatically added to this prompt."]),
      ...(memory.onDemand?.length ? [
        "On-demand local memory tools (facts returned to selected model):",
        ...memory.onDemand.map(call=>
          "  Request: "+call.query+" | IDs: "+
          (call.ids.length ? call.ids.map(id=>"#"+id).join(", ") : "(none)")+
          (call.error ? " | Error: "+call.error : ""))
      ] : [])
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
    "Desktop version: " + (options.buildInfo?.version ?? "unknown"),
    "Desktop commit (compiled): " + (options.buildInfo?.commit ?? "unknown"),
    "Desktop built at: " + (options.buildInfo?.builtAt ?? "unknown"),
    "Desktop build type: " + (options.buildInfo?.kind ?? "unknown"),
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
