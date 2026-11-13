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
};

const finite = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

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
          elapsedMs: finite(d.research.elapsedMs)
        } : null,
        answerVerification: d.answerVerification ? {
          checked: finite(d.answerVerification.checked),
          rejected: finite(d.answerVerification.rejected),
          recoveredHeadline: d.answerVerification.recoveredHeadline
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
