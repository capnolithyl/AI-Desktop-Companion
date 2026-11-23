import type { Diagnostics } from "./debug-log";
import type { AvatarDebugSnapshot } from "./avatar-debug";

/**
 * Opt-in support report metadata shared with the loopback relay.
 * Never include the memory fact text, private search queries, Notion titles,
 * document passages, source URLs, prompts or secret-bearing tool arguments.
 * The relay separately retains the last eight chat excerpts LOCALLY only.
 */
type DiagnosticMessage = {
  id: string;
  role: "user" | "assistant";
  failed?: boolean;
  diagnostics?: Diagnostics;
  sources?: readonly {url: string}[];
};

const finite = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
// Never export a source path, search query, or page excerpt. Hostnames alone
// show whether the citations came from a publisher, an aggregator or elsewhere.
const publicSourceHost = (raw: string): string | null => {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
      host.length > 100 || !/^[a-z0-9.-]+$/.test(host) || !host.includes(".") ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
      [".local",".localhost",".internal",".test"].some(suffix => host.endsWith(suffix))) return null;
    return host;
  } catch { return null; }
};

// Reasons are emitted by the native structural validator, not generated prose.
// A strict vocabulary avoids copying untrusted candidate names into reports.
const factRejectionReasons = new Set([
  "invalid_source_index", "invalid_subject_field", "invalid_claim_field",
  "invalid_quote_field", "quote_not_contiguous_in_cited_source",
  "subject_not_identified_by_quote", "claim_numbers_missing_from_quote",
  "claim_number_not_tied_to_subject", "not_the_named_target_subject",
  "does_not_answer_requested_detail"
]);
const rejectCode = (item: string): string | null => {
  const code = item.match(/:\s*([a-z_]+)$/)?.[1];
  return code && factRejectionReasons.has(code) ? code : null;
};

export function remoteDiagnosticMessages(messages: readonly DiagnosticMessage[]) {
  return messages.slice(-8).map(message => {
    const d = message.diagnostics;
    return {
      id: message.id.slice(0, 100),
      role: message.role,
      failed: message.failed === true,
      diagnostics: d ? {
        model: d.model.slice(0, 120),
        provider: d.provider ?? null,
        elapsedMs: finite(d.elapsedMs),
        firstTokenMs: finite(d.firstTokenMs),
        firstAudioMs: finite(d.firstAudioMs),
        fallbackUsed: !!d.fallbackReason,
        // These human-readable errors are useful locally but NEVER appear
        // in a GitHub issue, since they may contain document names or URLs.
        privateDetails: {
          fallbackReason: d.fallbackReason?.slice(0, 400) ?? null,
          toolReason: d.toolPlan?.reason.slice(0, 400) ?? null,
          memoryServiceReason: d.memory?.semanticReason?.slice(0, 400) ?? null,
          notionReadFailure: d.notion?.readFailure?.slice(0, 400) ?? null,
          researchNote: d.research?.note.slice(0, 400) ?? null
        },
        stats: d.stats ? {
          promptTokens: finite(d.stats.promptTokens),
          outputTokens: finite(d.stats.outputTokens),
          loadDurationNs: finite(d.stats.loadDurationNs),
          evalDurationNs: finite(d.stats.evalDurationNs)
        } : null,
        memory: d.memory ? {
          storedFacts: finite(d.memory.storedFacts),
          semanticService: d.memory.semanticService,
          semanticCandidates: finite(d.memory.semanticCandidates),
          strongSemanticMatches: finite(d.memory.strongSemanticMatches),
          selectionMethod: d.memory.selectionMethod ?? null,
          selectionCandidates: finite(d.memory.selectionCandidates),
          selectionTimeMs: finite(d.memory.selectionTimeMs),
          selectedIds: d.memory.facts.slice(0, 12).map(fact => fact.id),
          semanticScores: (d.memory.semanticScores ?? []).slice(0, 12)
            .map(hit => ({ id:hit.id, score:finite(hit.score) })),
          selectedFacts: d.memory.facts.length,
          interestsReturned: d.memory.interests?.returned.length ?? 0,
          interestsIncluded: d.memory.interests?.included.length ?? 0
        } : null,
        toolPlan: d.toolPlan ? {
          method: d.toolPlan.method.slice(0, 48),
          publicWebAllowed: d.toolPlan.publicWebAllowed,
          searchOutcome: d.toolPlan.searchOutcome?.slice(0, 48) ?? null,
          freshSources: finite(d.toolPlan.freshSources)
        } : null,
        research: d.research ? {
          status: d.research.status,
          accepted: finite(d.research.accepted),
          rejected: finite(d.research.rejected),
          followupAttempted: typeof d.research.followupQuery === "string" && d.research.followupQuery.trim().length > 0,
          primaryRecoveryStatus: d.research.primaryRecoveryStatus ?? null,
          elapsedMs: finite(d.research.elapsedMs),
          taskKind: d.research.taskKind ?? null,
          requestedDetailCount: Array.isArray(d.toolPlan?.task?.details)
            ? d.toolPlan.task.details.length : null,
          unresolvedDetailCount: d.research.unresolvedDetails?.length ?? 0,
          contextOnlyCount: finite(d.research.contextualCount),
          rejectedReasonCodes: [...new Set((d.research.rejectedDetails ?? [])
            .slice(0, 12).map(rejectCode).filter((code): code is string => !!code))],
          acceptedFactSlots: (d.research.acceptedDetails ?? []).slice(0, 8).map(fact => ({
            source: fact.source, detail: fact.detail ?? null
          })),
          sourceHosts: (message.sources ?? []).slice(0, 12).flatMap((source,index) => {
            const host = publicSourceHost(source.url);
            return host ? [{source:index + 1,host}] : [];
          })
        } : null,
        answerVerification: d.answerVerification ? {
          checked: finite(d.answerVerification.checked),
          rejected: finite(d.answerVerification.rejected),
          recoveredHeadline: d.answerVerification.recoveredHeadline,
          presentation: d.answerVerification.presentation === "model-voice-preserved"
            ? "model-voice-preserved"
            : d.answerVerification.presentation === "source-only" ? "source-only" : null
        } : null,
        notion: d.notion ? {
          cachedPages: finite(d.notion.cachedPages),
          excerptCount: finite(d.notion.excerptCount),
          fullReadAttempted: d.notion.fullReadAttempted,
          readSucceeded: d.notion.readSucceeded,
          linkedScenesRead: finite(d.notion.linkedScenesRead),
          groundingBlocked: d.notion.groundingBlocked === true,
          rereadRequested: d.notion.rereadRequested === true
        } : null,
        parallelTasks: (d.parallelTasks ?? []).slice(0, 12).map(task => ({
          name: task.name.slice(0, 60),
          status: task.status,
          elapsedMs: finite(task.elapsedMs)
        }))
      } : null
    };
  });
}

export function remoteAvatarDiagnostics(avatar: AvatarDebugSnapshot | null) {
  if (!avatar) return null;
  return {
    status: avatar.status,
    fps: finite(avatar.fps),
    speaking: avatar.speaking,
    mouthOpen: finite(avatar.mouthOpen),
    activeExpression: avatar.activeExpression,
    activeMotion: avatar.activeMotion,
    lastReactionKind: avatar.lastReaction?.kind ?? null,
    error: avatar.error?.slice(0, 300) ?? null // local-only; NEVER in a GitHub issue
  };
}
