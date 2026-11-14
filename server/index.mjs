/**
 * Mikan browser relay, deliberately separate from the model and memory engines.
 * The desktop UI remains the sole agent: browser messages travel through its
 * existing chat flow, and desktop state is mirrored back to the browser.
 *
 * Two loopback listeners: 3847 is the ONLY port to expose via Cloudflare;
 * 3848 is for the Tauri WebView bridge and must NEVER be tunneled.
 */
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  appendFileSync,
  existsSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createLocalReport, safeReportDiagnostics, publicIssuePreview, publishGitHubIssue
} from "./reporting.mjs";
import { createDevSupervisorClient } from "./dev-supervisor-client.mjs";

export const PUBLIC_PORT = 3847;
export const AGENT_PORT = 3848;
const HOME = join(homedir(), ".mikan");
const KEY_PATH = join(HOME, "remote-access.key");
const REPORTS_PATH = join(HOME, "remote-issues.jsonl");
// Show the running browser relay's version and commit (not the installed
// desktop .exe version). Resolve this once at startup, so a managed restart
// visibly confirms the updated source is serving the phone interface.
const packageVersion = JSON.parse(readFileSync(
  new URL("../package.json", import.meta.url), "utf8"
)).version;
const RELAY_VERSION = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(packageVersion)
  ? packageVersion : "unknown";
let relayCommit = "local";
try {
  const revision = execFileSync("git", ["rev-parse", "--short=8", "HEAD"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    windowsHide: true, timeout: 2000,
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]
  }).trim();
  if (/^[0-9a-f]{7,12}$/.test(revision)) relayCommit = revision;
} catch { /* Git isn't required to launch the relay. */ }
const HTML = readFileSync(
  new URL("./public/index.html", import.meta.url),
  "utf8",
).replaceAll("__MIKAN_REMOTE_VERSION__", RELAY_VERSION)
 .replaceAll("__MIKAN_REMOTE_COMMIT__", relayCommit);

const avatarScript = new URL("./.generated/avatar-engine.js", import.meta.url);
const outfitManifest = JSON.parse(readFileSync(
  new URL("../assets/iki/mikan-v02/outfits/wardrobe.json", import.meta.url), "utf8"
));
const bundledRigFiles = new Map(outfitManifest.outfits.map(entry => [
  entry.default ? "default" : "bundled:" + entry.id,
  new URL("../assets/iki/mikan-v02/outfits/" + entry.file, import.meta.url)
]));
const safeConversations = (items) => Array.isArray(items) ? items.slice(0, 200)
  .filter(x => x && typeof x.id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(x.id))
  .map(x => ({ id: x.id, title: String(x.title || "New conversation").slice(0, 120),
    updatedAt: Number(x.updatedAt) || 0 })) : [];
const safeAvatar = (avatar) => {
  if (!avatar || typeof avatar !== "object") return null;
  return {
    id: typeof avatar.id === "string" ? avatar.id.slice(0, 180) : "default",
    name: String(avatar.name || "Mikan").slice(0, 120),
    custom: avatar.custom === true,
    revision: Number(avatar.revision) || 0,
    verticalOffset: Number.isFinite(avatar.verticalOffset) ? avatar.verticalOffset : 0,
    reaction: typeof avatar.reaction === "string" ? avatar.reaction.slice(0, 24) : null,
    reactionSerial: Number(avatar.reactionSerial) || 0,
    speaking: avatar.speaking === true,
  };
};

function keyFile() {
  mkdirSync(HOME, { recursive: true, mode: 0o700 });
  if (!existsSync(KEY_PATH)) {
    writeFileSync(KEY_PATH, randomBytes(32).toString("hex") + "\n", {
      mode: 0o600,
      flag: "wx",
    });
  }
  const key = readFileSync(KEY_PATH, "utf8").trim();
  if (key.length < 32)
    throw new Error("Mikan remote key must be at least 32 characters");
  return key;
}
const json = (response, status, body) => {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  response.end(JSON.stringify(body));
};
const fail = (response, status, error) => json(response, status, { error });
const sameSecret = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ab = Buffer.from(a),
    bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};
const readJson = async (request, limit = 65536) => {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error("Request too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
};
const agentOrigins = new Set([
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "http://127.0.0.1:1420",
  "http://localhost:1420",
]);
const CLOUD_PROVIDERS = ["auto", "openrouter", "gemini"];
const safeModels = (models) => Array.isArray(models)
  ? [...new Set(models.filter(name => typeof name === "string" && name.length > 0 && name.length <= 120))].slice(0, 100)
  : [];
const safeMessages = (messages) =>
  Array.isArray(messages)
    ? messages
        .slice(-100)
        .filter((m) => m && ["user", "assistant"].includes(m.role))
        .map((m) => ({
          id: String(m.id || "").slice(0, 100),
          role: m.role,
          content: String(m.content || "").slice(0, 18000),
          createdAt: Number(m.createdAt) || 0,
        }))
    : [];

// Only expose small, well-typed evaluation metadata to the authenticated browser.
// The full synthetic report is never bundled into regular /api/state polling.
const safeEvalCatalog = entries => Array.isArray(entries)
  ? entries.slice(0, 180).filter(item =>
      item && typeof item.id === "string" && /^[a-z0-9-]{1,90}$/.test(item.id))
    .map(item => ({
      id: item.id,
      label: String(item.label || "").slice(0, 110),
      number: Number.isSafeInteger(item.number) && item.number>=1 && item.number<=180 ? item.number : null,
      group: String(item.group || "").slice(0, 80),
      turns: Number.isSafeInteger(item.turns) ? Math.min(12, Math.max(1, item.turns)) : 1,
      states: Object.fromEntries(["routing","live"].map(mode => {
        const entry=item.states?.[mode];
        const allowed=["passed","failed","review","stale","incomplete","untested"];
        return [mode,{
          status: allowed.includes(entry?.status) ? entry.status : "untested",
          previous: allowed.includes(entry?.previous) ? entry.previous : null,
          at: typeof entry?.at==="string" ? entry.at.slice(0,40) : null
        }];
      }))
    }))
  : [];
const safeEvalStatus = value => {
  if (!value || typeof value !== "object") return null;
  const phases = ["idle","running","complete","stopped","failed"];
  const finite = n => typeof n === "number" && Number.isFinite(n) ? n : null;
  const results = value.results && typeof value.results === "object" ?
    Object.fromEntries([
      "cases","turns","passed","passRate","verifiedPassed","verifiedPassRate","unverifiedTurns","routes","recall","webChecks",
      "webUnobserved","webAgreement","unnecessaryWeb","missedWeb",
      "tokensPerSecond","answers","answerChecks","reviewTurns","elapsedMs"
    ].map(name => [name,finite(value.results[name])])) : null;
  return {
    phase: phases.includes(value.phase) ? value.phase : "idle",
    runId: typeof value.runId === "string" ? value.runId.slice(0, 100) : null,
    mode: ["routing","live"].includes(value.mode) ? value.mode : null,
    model: typeof value.model === "string" ? value.model.slice(0, 120) : null,
    startedAt: typeof value.startedAt === "string" ? value.startedAt.slice(0, 35) : null,
    finishedAt: typeof value.finishedAt === "string" ? value.finishedAt.slice(0, 35) : null,
    done: Math.max(0,finite(value.done)??0),
    total: Math.max(0,finite(value.total)??0),
    label: String(value.label||"").slice(0, 160),
    error: typeof value.error === "string" ? value.error.slice(0, 300) : null,
    savedFolder: value.savedFolder ? "Saved on desktop" : null,
    results
  };
};

export function createBridge({
  key,
  reportsPath = REPORTS_PATH,
  publicHost = "marcus-vostro.tailc46461.ts.net",
  issuePublisher = publishGitHubIssue,
  updater = createDevSupervisorClient(),
} = {}) {
  if (typeof key !== "string" || key.length < 32)
    throw new Error("A 32+ character remote key is required");
  let desktop = {
    conversationId: null, model: "", busy: false,
    messages: [], conversations: [], avatar: null,
    provider: "local", models: [], openrouterModel: "", geminiModel: "",
    modelStatus: null, controlsBlocked: true,
    reportDiagnostics: null,
    brainEval: null,brainEvalCatalog: []
  };
  let customRig = null;
  let customRigId = null;
  let agentSeen = 0;
  let pending = null;
  let issuePreview = null;
  let lastIssueAttempt = 0;
  let latestEvalReport = null;
  const isAuthorized = (request) => {
    const auth = request.headers.authorization || "";
    return auth.startsWith("Bearer ") && sameSecret(auth.slice(7), key);
  };
  const state = () => ({
    ...desktop,
    connected: Date.now() - agentSeen < 8000,
    queued: !!pending,
    reportAvailable: !!latestEvalReport,
    reportRunId: latestEvalReport?.runId ?? null
  });

  const publicServer = createServer(async (request, response) => {
    try {
      const host = String(request.headers.host || "")
        .split(":")[0]
        .toLowerCase();
      if (![publicHost, "localhost", "127.0.0.1"].includes(host))
        return fail(response, 403, "Hostname forbidden");
      const origin = request.headers.origin;
      if (
        origin &&
        origin !== "https://" + publicHost &&
        origin !== "http://localhost:" + PUBLIC_PORT &&
        origin !== "http://127.0.0.1:" + PUBLIC_PORT
      ) {
        return fail(response, 403, "Origin forbidden");
      }
      response.setHeader("X-Frame-Options", "DENY");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader("Cache-Control", "no-store");
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          // Iki decodes embedded atlas PNGs via fetch(data:...). Permit only
          // same-origin requests and data: payloads, never arbitrary hosts.
          "Content-Security-Policy":
            "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' data:; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
        });
        response.end(HTML);
      } else if (request.method === "GET" && url.pathname === "/avatar-engine.js") {
        try {
          const script = readFileSync(avatarScript);
          response.writeHead(200, {
            "Content-Type": "text/javascript; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff"
          });
          response.end(script);
        } catch {
          fail(response, 503, "Remote avatar runtime is not built. Start with npm run server.");
        }
      } else if (!isAuthorized(request)) {
        fail(response, 401, "Enter your Mikan remote key");
      } else if (request.method === "GET" && url.pathname === "/api/state") {
        json(response, 200, state());
      } else if (request.method === "GET" && url.pathname === "/api/dev-update") {
        if (!updater)
          return json(response,200,{available:false,
            reason:"Updater is not running. On Windows, stop npm run server and start npm run remote:dev."});
        try {json(response,200,await updater.status())}
        catch {json(response,200,{available:false,reason:"Local development supervisor is offline."})}
      } else if (request.method === "POST" && url.pathname === "/api/dev-update") {
        if (!updater)return fail(response,409,
          "Start the managed development relay with npm run remote:dev on Windows");
        const body=await readJson(request,250);
        if (body.action!=="check" && body.action!=="apply")
          return fail(response,400,"Only check and apply are allowed");
        if (body.action==="apply" && (
          pending || desktop.busy || desktop.brainEval?.phase==="running"
        ))return fail(response,409,"Finish the active chat or Brain Lab run before updating");
        try{
          const result=body.action==="check"?await updater.check():await updater.apply();
          json(response,202,result);
        }catch(error){
          fail(response,409,String(error?.message||"Supervisor refused the operation").slice(0,250));
        }
      } else if (request.method === "GET" && url.pathname === "/api/avatar/model") {
        const avatar = desktop.avatar;
        if (!avatar) return fail(response, 404, "Avatar not available");
        let bytes;
        if (avatar.custom) {
          if (customRigId !== avatar.id || !customRig)
            return fail(response, 404, "Waiting for desktop outfit");
          bytes = customRig;
        } else {
          const path = bundledRigFiles.get(avatar.id);
          if (!path) return fail(response, 404, "Unknown bundled outfit");
          try { bytes = readFileSync(path); }
          catch { return fail(response, 404, "Bundled outfit file missing"); }
        }
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        });
        response.end(bytes);
      } else if (request.method === "POST" && url.pathname === "/api/brain-eval") {
        const body = await readJson(request, 12_000);
        if (body.action === "start") {
          if (pending || desktop.busy || desktop.controlsBlocked ||
            desktop.brainEval?.phase === "running" ||
            Date.now() - agentSeen >= 8000)
            return fail(response, 409, "Desktop is offline, busy, or already testing");
          const mode = body.mode;
          const repetitions = body.repetitions;
          const ids = body.scenarioIds;
          const allowedIds = new Set(desktop.brainEvalCatalog.map(item => item.id));
          if (!["routing","live"].includes(mode) || ![1,2,3,5].includes(repetitions) ||
            !Array.isArray(ids) || !ids.length || ids.length > allowedIds.size ||
            ids.length !== new Set(ids).size || ids.some(id => !allowedIds.has(id)))
            return fail(response, 400, "Choose a valid test mode, repetition count and scenario selection");
          pending = {
            id: randomBytes(12).toString("hex"),kind:"start_brain_eval",
            evalOptions:{mode,repetitions,scenarioIds:ids}
          };
          json(response, 202, {id:pending.id,selected:ids.length});
        } else if (body.action === "stop") {
          if (pending?.kind === "start_brain_eval") {
            pending = null;
            return json(response, 200, {canceledQueued:true});
          }
          if (pending || desktop.brainEval?.phase !== "running" ||
            Date.now() - agentSeen >= 8000)
            return fail(response, 409, "No active Brain Lab run to stop");
          pending = {id:randomBytes(12).toString("hex"),kind:"stop_brain_eval"};
          json(response, 202, {id:pending.id});
        } else if (body.action === "review") {
          if (pending || desktop.brainEval?.phase === "running" || Date.now() - agentSeen >= 8000)
            return fail(response, 409, "Brain Lab is running or desktop is offline");
          const id=body.scenarioId;
          const mode=body.mode;
          const decision=body.decision;
          const known=desktop.brainEvalCatalog.find(item=>item.id===id);
          if (!known || !["live","routing"].includes(mode) ||
              !["passed","failed"].includes(decision))
            return fail(response, 400, "Unknown test or review decision");
          if (known.states?.[mode]?.status!=="review")
            return fail(response, 409, "The test must have a current pending review");
          pending={
            id:randomBytes(12).toString("hex"),kind:"review_brain_eval",
            evalScenarioId:id,evalMode:mode,evalDecision:decision
          };
          json(response, 202, {id:pending.id});
        } else fail(response, 400, "Unsupported Brain Lab action");
      } else if (request.method === "GET" && url.pathname === "/api/brain-eval/result") {
        if (!latestEvalReport) return fail(response, 404, "No completed test report available");
        const format = url.searchParams.get("format");
        if (!["json","markdown"].includes(format))
          return fail(response, 400, "Choose json or markdown");
        const data = format === "json"
          ? JSON.stringify(latestEvalReport.report,null,2)
          : latestEvalReport.markdown;
        response.writeHead(200, {
          "Content-Type": format === "json"
            ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8",
          "Content-Disposition": 'attachment; filename="mikan-brain-eval-'+
            latestEvalReport.runId+'.'+(format==="json"?"json":"md")+'"',
          "Cache-Control":"no-store",
          "X-Content-Type-Options":"nosniff"
        });
        response.end(data);
      } else if (request.method === "POST" && url.pathname === "/api/conversation") {
        if (pending || desktop.busy || Date.now() - agentSeen >= 8000)
          return fail(response, 409, "Mikan is offline or already busy");
        const body = await readJson(request, 4096);
        if (body.action !== "new" && body.action !== "open")
          return fail(response, 400, "Unsupported conversation action");
        if (body.action === "open" && !desktop.conversations.some(item => item.id === body.conversationId))
          return fail(response, 404, "Conversation not found");
        pending = {
          id: randomBytes(12).toString("hex"),
          kind: body.action === "new" ? "new_chat" : "open_chat",
          conversationId: body.action === "open" ? body.conversationId : null
        };
        json(response, 202, { id: pending.id });
      } else if (request.method === "POST" && url.pathname === "/api/model") {
        if (pending || desktop.busy || desktop.controlsBlocked || Date.now() - agentSeen >= 8000)
          return fail(response, 409, "Mikan is offline, busy, or using desktop controls");
        const body = await readJson(request, 1024);
        if (body.action !== "switch" && body.action !== "refresh")
          return fail(response, 400, "Unsupported model action");
        if (body.action === "switch") {
          const choice = body.choice;
          if (typeof choice !== "string" || choice.length > 140)
            return fail(response, 400, "Invalid model selection");
          const permitted = CLOUD_PROVIDERS.includes(choice) ||
            (choice.startsWith("local:") && desktop.models.includes(choice.slice(6)));
          if (!permitted)
            return fail(response, 400, "Model is not available on Mikan's desktop");
        }
        pending = {
          id: randomBytes(12).toString("hex"),
          kind: body.action === "switch" ? "switch_model" : "refresh_models",
          modelChoice: body.action === "switch" ? body.choice : null
        };
        json(response, 202, { id: pending.id });
      } else if (request.method === "POST" && url.pathname === "/api/send") {
        if (pending || desktop.busy || desktop.brainEval?.phase === "running" ||
          Date.now() - agentSeen >= 8000) {
          return fail(
            response,
            409,
            "Mikan is offline or already working on a message",
          );
        }
        const body = await readJson(request, 8192);
        const message = typeof body.text === "string" ? body.text.trim() : "";
        if (!message || message.length > 4000 || message.startsWith("/")) {
          return fail(
            response,
            400,
            "Send 1–4000 characters of ordinary chat (no slash commands)",
          );
        }
        pending = { id: randomBytes(12).toString("hex"), kind: "send", text: message };
        json(response, 202, { id: pending.id });
      } else if (request.method === "POST" && url.pathname === "/api/report/preview") {
        const body = await readJson(request, 4096);
        const note = typeof body.note === "string" ? body.note.trim() : "";
        if (!note || note.length > 1500)
          return fail(response, 400, "Enter a note up to 1500 characters");
        const report = createLocalReport(desktop, note, request.headers["user-agent"]);
        const issue = publicIssuePreview(report);
        issuePreview = {
          id: randomBytes(16).toString("hex"),
          at: Date.now(), note,
          title: issue.title, body: issue.body
        };
        json(response, 200, {
          previewId: issuePreview.id,
          title: issue.title,
          body: issue.body
        });
      } else if (request.method === "POST" && url.pathname === "/api/report") {
        const body = await readJson(request, 4096);
        const note = typeof body.note === "string" ? body.note.trim() : "";
        const destination = body.destination ?? "local";
        if (!note || note.length > 1500)
          return fail(response, 400, "Enter a note up to 1500 characters");
        if (!["local", "github", "both"].includes(destination))
          return fail(response, 400, "Invalid report destination");
        const includeGitHub = destination !== "local";
        const includeLocal = destination !== "github";
        if (includeGitHub && (
          !issuePreview || issuePreview.id !== body.previewId ||
          issuePreview.note !== note ||
          Date.now() - issuePreview.at >= 10 * 60 * 1000
        )) return fail(response, 409, "Review the GitHub issue preview before publishing");
        // Explicitly reviewed, one-time submission; never publish as a side
        // effect of a normal local report or automatic chat synchronization.
        const toPublish = includeGitHub ? issuePreview : null;
        if (includeGitHub) {
          if (Date.now() - lastIssueAttempt < 15000)
            return fail(response, 429, "Please avoid submitting duplicate issues");
          issuePreview = null;
          lastIssueAttempt = Date.now();
        }
        let githubUrl = null;
        let githubError = null;
        if (toPublish) {
          try {
            githubUrl = await issuePublisher({ title: toPublish.title, body: toPublish.body });
          } catch (error) {
            githubError = error instanceof Error ? error.message : "GitHub CLI failed";
          }
        }
        if (includeLocal) {
          const report = createLocalReport(desktop, note, request.headers["user-agent"]);
          if (includeGitHub) report.github = {
            attempted: true, url: githubUrl, error: githubError
          };
          mkdirSync(dirname(reportsPath), { recursive: true });
          appendFileSync(reportsPath, JSON.stringify(report) + "\n",
            { encoding: "utf8", mode: 0o600 });
        }
        if (githubError && !includeLocal)
          return fail(response, 502, githubError);
        json(response, includeLocal ? 201 : 200, {
          saved: includeLocal,
          githubUrl,
          githubError
        });
      } else {
        fail(response, 404, "Not found");
      }
    } catch (error) {
      fail(
        response,
        error.message === "Request too large" ? 413 : 400,
        "Invalid request",
      );
    }
  });

  const agentServer = createServer(async (request, response) => {
    try {
      const origin = request.headers.origin;
      if (origin && !agentOrigins.has(origin))
        return fail(response, 403, "Desktop origin forbidden");
      if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      response.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, X-Mikan-Agent",
      );
      if (request.method === "OPTIONS") {
        response.writeHead(204);
        return response.end();
      }
      if (request.headers["x-mikan-agent"] !== "desktop")
        return fail(response, 403, "Desktop bridge only");
      const url = new URL(request.url || "/", "http://127.0.0.1");
      agentSeen = Date.now();
      if (request.method === "GET" && url.pathname === "/agent/next") {
        json(response, 200, { job: pending });
      } else if (request.method === "POST" && url.pathname === "/agent/ack") {
        const body = await readJson(request, 256);
        if (!pending || body.id !== pending.id)
          return fail(response, 409, "Job already acknowledged");
        pending = null;
        json(response, 200, { ok: true });
      } else if (request.method === "POST" && url.pathname === "/agent/state") {
        const body = await readJson(request, 2_000_000);
        desktop = {
          conversationId:
            typeof body.conversationId === "string"
              ? body.conversationId.slice(0, 100)
              : null,
          model: String(body.model || "").slice(0, 120),
          provider: ["local", ...CLOUD_PROVIDERS].includes(body.provider) ? body.provider : "local",
          openrouterModel: String(body.openrouterModel || "").slice(0, 120),
          geminiModel: String(body.geminiModel || "").slice(0, 120),
          models: safeModels(body.models),
          modelStatus: body.modelStatus && typeof body.modelStatus === "object"
            ? {
                label: String(body.modelStatus.label || "").slice(0, 200),
                title: String(body.modelStatus.title || "").slice(0, 300)
              } : null,
          controlsBlocked: body.controlsBlocked !== false,
          busy: body.busy === true,
          messages: safeMessages(body.messages),
          conversations: safeConversations(body.conversations),
          avatar: safeAvatar(body.avatar),
          reportDiagnostics: safeReportDiagnostics(body.reportDiagnostics),
          brainEval: safeEvalStatus(body.brainEval),
          brainEvalCatalog: safeEvalCatalog(body.brainEvalCatalog)
        };
        json(response, 200, {ok:true,reportId:latestEvalReport?.runId??null});
      } else if (request.method === "POST" && url.pathname === "/agent/brain-eval/report") {
        const body = await readJson(request, 8_000_000);
        const source = body.report;
        const markdown = body.markdown;
        if (!source || source.version !== 1 || source.environment !== "isolated-synthetic" ||
          source.liveWebEnabled !== false || source.writesToRealMemories !== false ||
          typeof source.runId !== "string" || !/^eval-[a-zA-Z0-9-]{4,90}$/.test(source.runId) ||
          !Array.isArray(source.cases) || source.cases.length > 400 ||
          typeof markdown !== "string" || markdown.length > 2_000_000)
          return fail(response, 400, "Not a valid synthetic Brain Lab report");
        latestEvalReport={runId:source.runId,report:source,markdown};
        json(response, 200, {ok:true,reportId:source.runId});
      } else if (request.method === "POST" && url.pathname === "/agent/avatar-rig") {
        const body = await readJson(request, 16_000_000);
        if (!desktop.avatar?.custom || body.id !== desktop.avatar.id ||
            typeof body.rig !== "string" || body.rig.length > 12_000_000)
          return fail(response, 400, "Unexpected desktop outfit");
        const parsed = JSON.parse(body.rig);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          return fail(response, 400, "Invalid outfit");
        customRig = body.rig;
        customRigId = body.id;
        json(response, 200, { ok: true });
      } else {
        fail(response, 404, "Not found");
      }
    } catch (error) {
      fail(
        response,
        error.message === "Request too large" ? 413 : 400,
        "Invalid request",
      );
    }
  });

  return { publicServer, agentServer, state };
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const key = keyFile();
  if (process.argv.includes("--key")) {
    console.log(key);
  } else {
    const { publicServer, agentServer } = createBridge({ key });
    await listen(agentServer, AGENT_PORT);
    await listen(publicServer, PUBLIC_PORT);
    console.log("Mikan browser relay running: http://127.0.0.1:" + PUBLIC_PORT);
    console.log(
      "Cloudflare origin: http://127.0.0.1:" +
        PUBLIC_PORT +
        " (NEVER expose agent port " +
        AGENT_PORT +
        ")",
    );
    console.log(
      "Remote key: run npm run server:key to display it. Keep it private.",
    );
    console.log("Waiting for the Mikan desktop application to connect.");
  }
}
