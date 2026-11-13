/**
 * Local-first support reports. Public GitHub issues are always explicitly
 * previewed, then published with the Windows user's authenticated GitHub CLI.
 * No PATs, OAuth tokens, conversation text, private memories, source URLs,
 * file paths, or unpublished manuscript content are uploaded automatically.
 */
import { spawn } from "node:child_process";

const REPOSITORY = "capnolithyl/AI-Desktop-Companion";
export const GITHUB_ISSUES_URL = "https://github.com/" + REPOSITORY + "/issues";
const finite = value => typeof value === "number" && Number.isFinite(value) ? value : null;
const summary = (value, max = 120) => typeof value === "string" ? value.slice(0, max) : null;
const allowed = (value, valid) => valid.includes(value) ? value : null;
const textLine = value => String(value ?? "").replace(/[\r\n\t]+/g, " ").slice(0, 120);
const formatted = value => value == null ? "n/a" : String(value);
const positive = value => {
  const v = finite(value);
  return v != null && v >= 0 ? v : null;
};

/**
 * Validate the desktop's optional support summary again on the Node side.
 * This keeps even corrupted IndexedDB metadata from crossing into reports.
 */
export function safeReportDiagnostics(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    desktopVersion: summary(value.desktopVersion, 32),
    contextWindow: positive(value.contextWindow),
    avatar: value.avatar && typeof value.avatar === "object" ? {
      status: allowed(value.avatar.status, ["ready","loading","error","offline"]),
      fps: positive(value.avatar.fps),
      speaking: value.avatar.speaking === true,
      activeExpression: summary(value.avatar.activeExpression, 70),
      activeMotion: summary(value.avatar.activeMotion, 70),
      lastReactionKind: summary(value.avatar.lastReactionKind, 30),
      error: summary(value.avatar.error, 300) // local report only
    } : null,
    messages: Array.isArray(value.messages) ? value.messages.slice(-8).map(message => {
      const d = message?.diagnostics;
      return {
        id: summary(message?.id, 100),
        role: allowed(message?.role, ["user","assistant"]),
        failed: message?.failed === true,
        diagnostics: d && typeof d === "object" ? {
          model: summary(d.model, 120),
          provider: allowed(d.provider, ["local","auto","openrouter","gemini"]),
          elapsedMs: positive(d.elapsedMs),
          firstTokenMs: positive(d.firstTokenMs),
          firstAudioMs: positive(d.firstAudioMs),
          fallbackUsed: d.fallbackUsed === true,
          stats: d.stats ? {
            promptTokens: positive(d.stats.promptTokens),
            outputTokens: positive(d.stats.outputTokens),
            loadDurationNs: positive(d.stats.loadDurationNs),
            evalDurationNs: positive(d.stats.evalDurationNs)
          } : null,
          memory: d.memory ? {
            storedFacts: positive(d.memory.storedFacts),
            semanticService: allowed(d.memory.semanticService, ["ready","offline","unknown"]),
            semanticCandidates: positive(d.memory.semanticCandidates),
            strongSemanticMatches: positive(d.memory.strongSemanticMatches),
            selectedFacts: positive(d.memory.selectedFacts),
            interestsReturned: positive(d.memory.interestsReturned),
            interestsIncluded: positive(d.memory.interestsIncluded),
            selectionMethod: allowed(d.memory.selectionMethod,
              ["ai-reranked","hybrid-rrf","fallback","small-talk","empty"])
          } : null,
          toolPlan: d.toolPlan ? {
            method: summary(d.toolPlan.method, 48),
            publicWebAllowed: d.toolPlan.publicWebAllowed === true,
            searchOutcome: summary(d.toolPlan.searchOutcome, 48),
            freshSources: positive(d.toolPlan.freshSources)
          } : null,
          research: d.research ? {
            status: allowed(d.research.status, ["used","fallback"]),
            accepted: positive(d.research.accepted),
            rejected: positive(d.research.rejected),
            elapsedMs: positive(d.research.elapsedMs)
          } : null,
          answerVerification: d.answerVerification ? {
            checked: positive(d.answerVerification.checked),
            rejected: positive(d.answerVerification.rejected),
            recoveredHeadline: d.answerVerification.recoveredHeadline === true
          } : null,
          notion: d.notion ? {
            cachedPages: positive(d.notion.cachedPages),
            excerptCount: positive(d.notion.excerptCount),
            fullReadAttempted: d.notion.fullReadAttempted === true,
            readSucceeded: d.notion.readSucceeded === true,
            linkedScenesRead: positive(d.notion.linkedScenesRead),
            groundingBlocked: d.notion.groundingBlocked === true,
            rereadRequested: d.notion.rereadRequested === true
          } : null,
          parallelTasks: Array.isArray(d.parallelTasks) ? d.parallelTasks.slice(0, 12).map(task => ({
            name: summary(task?.name, 60),
            status: allowed(task?.status, ["complete","ready","unavailable"]),
            elapsedMs: positive(task?.elapsedMs)
          })) : []
        } : null
      };
    }) : []
  };
}

export function createLocalReport(desktop, note, userAgent) {
  return {
    at: new Date().toISOString(),
    note,
    conversationId: desktop.conversationId,
    runtime: {
      provider: desktop.provider,
      model: desktop.model,
      busy: desktop.busy === true
    },
    browser: summary(userAgent, 220),
    diagnostics: safeReportDiagnostics(desktop.reportDiagnostics),
    messages: desktop.messages.slice(-8).map(message => ({
      role: message.role,
      createdAt: message.createdAt,
      content: message.content.slice(0, 1800)
    }))
  };
}

export function publicIssuePreview(report) {
  const d = report.diagnostics;
  const lines = [
    "## Problem",
    ...report.note.split(/\r?\n/).slice(0, 28).map(line => "> " + line),
    "",
    "## Sanitized diagnostics",
    "- Desktop version: " + formatted(d?.desktopVersion),
    "- Inference provider: " + textLine(report.runtime.provider),
    "- Configured model: " + textLine(report.runtime.model),
    "- Context window: " + formatted(d?.contextWindow),
    "- Avatar state: " + formatted(d?.avatar?.status),
    "- Avatar FPS: " + formatted(d?.avatar?.fps),
    "- Avatar speaking: " + formatted(d?.avatar?.speaking),
    ""
  ];
  // Only recent AI runs; never upload chat messages, memory facts, private
  // searches, manuscript passages, personal file paths, or conversation IDs.
  const recent = (d?.messages ?? []).filter(message => message.role === "assistant").slice(-3);
  if (recent.length) {
    lines.push("### Recent model/tool runs");
    for (const [i, m] of recent.entries()) {
      const v = m.diagnostics;
      lines.push(
        "- Turn " + (i + 1) + ": " +
        (v ? [
          "model=" + textLine(v.model),
          "provider=" + formatted(v.provider),
          "failed=" + m.failed,
          "elapsed=" + formatted(v.elapsedMs) + "ms",
          "firstToken=" + formatted(v.firstTokenMs) + "ms",
          "firstAudio=" + formatted(v.firstAudioMs) + "ms",
          "promptTokens=" + formatted(v.stats?.promptTokens),
          "outputTokens=" + formatted(v.stats?.outputTokens),
          "fallback=" + (v.fallbackUsed ? "yes" : "no"),
          "memoryMatches=" + formatted(v.memory?.strongSemanticMatches),
          "selectedFacts=" + formatted(v.memory?.selectedFacts),
          "webSources=" + formatted(v.toolPlan?.freshSources),
          "researchAccepted=" + formatted(v.research?.accepted),
          "researchRejected=" + formatted(v.research?.rejected),
          "notionPagesRead=" + formatted(v.notion?.cachedPages),
          "notionReadSucceeded=" + formatted(v.notion?.readSucceeded)
        ].join(", ") : "failed=" + m.failed + ", no recorded inference diagnostics")
      );
    }
    lines.push("");
  }
  lines.push(
    "_Generated by Mikan's private remote bug reporter. This GitHub issue deliberately",
    "omits conversations, retrieved memories, personal search queries and local paths._"
  );
  // Generic title avoids copying possibly sensitive chat/note text into URLs.
  return {
    title: "[Remote] Mikan issue report " + report.at.slice(0, 16).replace("T", " "),
    body: lines.join("\n")
  };
}

/** No shell execution or local secret handling. GitHub CLI manages OAuth. */
export async function publishGitHubIssue({ title, body }) {
  return new Promise((resolve, reject) => {
    let output = "";
    let ended = false;
    const complete = (error, url) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(url);
    };
    const child = spawn("gh", [
      "issue", "create", "--repo", REPOSITORY,
      "--title", title, "--body-file", "-"
    ], {
      stdio: ["pipe","pipe","pipe"],
      windowsHide: true,
      env: { ...process.env, GH_PROMPT_DISABLED: "1" }
    });
    const timer = setTimeout(() => {
      child.kill();
      complete(new Error("GitHub issue creation timed out. Check gh auth status on Windows."));
    }, 25000);
    child.stdout.on("data", chunk => { output += chunk.toString("utf8").slice(0, 1000); });
    child.stderr.resume();
    child.stdin.on("error", () => {}); // CLI may exit before stdin is written.
    child.stdin.end(body);
    child.on("error", error => complete(new Error(
      error.code === "ENOENT"
        ? "GitHub CLI is not installed. Install gh, then run gh auth login on Windows."
        : "Could not start GitHub CLI."
    )));
    child.on("close", code => {
      if (ended) return;
      const url = output.match(/https:\/\/github\.com\/capnolithyl\/AI-Desktop-Companion\/issues\/\d+/)?.[0];
      if (code === 0 && url) complete(null, url);
      else complete(new Error("GitHub issue was not confirmed. On Windows check gh auth status and repository permissions."));
    });
  });
}
