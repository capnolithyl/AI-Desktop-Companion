/**
 * Mikan browser relay, deliberately separate from the model and memory engines.
 * The desktop UI remains the sole agent: browser messages travel through its
 * existing chat flow, and desktop state is mirrored back to the browser.
 *
 * Two loopback listeners: 3847 is the ONLY port to expose via Cloudflare;
 * 3848 is for the Tauri WebView bridge and must NEVER be tunneled.
 */
import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PUBLIC_PORT = 3847;
export const AGENT_PORT = 3848;
const HOME = join(homedir(), ".mikan");
const KEY_PATH = join(HOME, "remote-access.key");
const REPORTS_PATH = join(HOME, "remote-issues.jsonl");
const HTML = readFileSync(new URL("./public/index.html", import.meta.url), "utf8");

function keyFile() {
  mkdirSync(HOME, { recursive: true, mode: 0o700 });
  if (!existsSync(KEY_PATH)) {
    writeFileSync(KEY_PATH, randomBytes(32).toString("hex") + "\n", { mode: 0o600, flag: "wx" });
  }
  const key = readFileSync(KEY_PATH, "utf8").trim();
  if (key.length < 32) throw new Error("Mikan remote key must be at least 32 characters");
  return key;
}
const json = (response, status, body) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
  response.end(JSON.stringify(body));
};
const fail = (response, status, error) => json(response, status, { error });
const sameSecret = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ab = Buffer.from(a), bb = Buffer.from(b);
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
  "tauri://localhost", "http://tauri.localhost", "https://tauri.localhost",
  "http://127.0.0.1:1420", "http://localhost:1420"
]);
const safeMessages = (messages) => Array.isArray(messages)
  ? messages.slice(-100).filter((m) => m && ["user", "assistant"].includes(m.role))
    .map((m) => ({
      id: String(m.id || "").slice(0, 100),
      role: m.role,
      content: String(m.content || "").slice(0, 18000),
      createdAt: Number(m.createdAt) || 0
    }))
  : [];

export function createBridge({ key, reportsPath = REPORTS_PATH, publicHost = "mikan.marcusborger.com" } = {}) {
  if (typeof key !== "string" || key.length < 32) throw new Error("A 32+ character remote key is required");
  let desktop = { conversationId: null, model: "", busy: false, messages: [] };
  let agentSeen = 0;
  let pending = null;
  const isAuthorized = (request) => {
    const auth = request.headers.authorization || "";
    return auth.startsWith("Bearer ") && sameSecret(auth.slice(7), key);
  };
  const state = () => ({
    ...desktop,
    connected: Date.now() - agentSeen < 8000,
    queued: !!pending
  });

  const publicServer = createServer(async (request, response) => {
    try {
      const host = String(request.headers.host || "").split(":")[0].toLowerCase();
      if (![publicHost, "localhost", "127.0.0.1"].includes(host)) return fail(response, 403, "Hostname forbidden");
      const origin = request.headers.origin;
      if (origin && origin !== "https://" + publicHost &&
          origin !== "http://localhost:" + PUBLIC_PORT &&
          origin !== "http://127.0.0.1:" + PUBLIC_PORT) {
        return fail(response, 403, "Origin forbidden");
      }
      response.setHeader("X-Frame-Options", "DENY");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader("Cache-Control", "no-store");
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" });
        response.end(HTML);
      } else if (!isAuthorized(request)) {
        fail(response, 401, "Enter your Mikan remote key");
      } else if (request.method === "GET" && url.pathname === "/api/state") {
        json(response, 200, state());
      } else if (request.method === "POST" && url.pathname === "/api/send") {
        if (pending || desktop.busy || Date.now() - agentSeen >= 8000) {
          return fail(response, 409, "Mikan is offline or already working on a message");
        }
        const body = await readJson(request, 8192);
        const message = typeof body.text === "string" ? body.text.trim() : "";
        if (!message || message.length > 4000 || message.startsWith("/")) {
          return fail(response, 400, "Send 1–4000 characters of ordinary chat (no slash commands)");
        }
        pending = { id: randomBytes(12).toString("hex"), text: message };
        json(response, 202, { id: pending.id });
      } else if (request.method === "POST" && url.pathname === "/api/report") {
        const body = await readJson(request, 4096);
        const note = typeof body.note === "string" ? body.note.trim() : "";
        if (!note || note.length > 1500) return fail(response, 400, "Enter a note up to 1500 characters");
        mkdirSync(dirname(reportsPath), { recursive: true });
        appendFileSync(reportsPath, JSON.stringify({
          at: new Date().toISOString(), note, conversationId: desktop.conversationId,
          messages: desktop.messages.slice(-8).map((m) => ({role:m.role, content:m.content.slice(0,1800)}))
        }) + "\n", { encoding: "utf8", mode: 0o600 });
        json(response, 201, { saved: true });
      } else {
        fail(response, 404, "Not found");
      }
    } catch (error) {
      fail(response, error.message === "Request too large" ? 413 : 400, "Invalid request");
    }
  });

  const agentServer = createServer(async (request, response) => {
    try {
      const origin = request.headers.origin;
      if (origin && !agentOrigins.has(origin)) return fail(response, 403, "Desktop origin forbidden");
      if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Mikan-Agent");
      if (request.method === "OPTIONS") { response.writeHead(204); return response.end(); }
      if (request.headers["x-mikan-agent"] !== "desktop") return fail(response, 403, "Desktop bridge only");
      const url = new URL(request.url || "/", "http://127.0.0.1");
      agentSeen = Date.now();
      if (request.method === "GET" && url.pathname === "/agent/next") {
        json(response, 200, { job: pending });
      } else if (request.method === "POST" && url.pathname === "/agent/ack") {
        const body = await readJson(request, 256);
        if (!pending || body.id !== pending.id) return fail(response, 409, "Job already acknowledged");
        pending = null;
        json(response, 200, { ok: true });
      } else if (request.method === "POST" && url.pathname === "/agent/state") {
        const body = await readJson(request, 2_000_000);
        desktop = {
          conversationId: typeof body.conversationId === "string" ? body.conversationId.slice(0,100) : null,
          model: String(body.model || "").slice(0,120),
          busy: body.busy === true,
          messages: safeMessages(body.messages)
        };
        json(response, 200, { ok: true });
      } else {
        fail(response, 404, "Not found");
      }
    } catch (error) {
      fail(response, error.message === "Request too large" ? 413 : 400, "Invalid request");
    }
  });

  return { publicServer, agentServer, state };
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const key = keyFile();
  if (process.argv.includes("--key")) {
    console.log(key);
  } else {
    const { publicServer, agentServer } = createBridge({ key });
    await listen(agentServer, AGENT_PORT);
    await listen(publicServer, PUBLIC_PORT);
    console.log("Mikan browser relay running: http://127.0.0.1:" + PUBLIC_PORT);
    console.log("Cloudflare origin: http://127.0.0.1:" + PUBLIC_PORT + " (NEVER expose agent port " + AGENT_PORT + ")");
    console.log("Remote key: run npm run server:key to display it. Keep it private.");
    console.log("Waiting for the Mikan desktop application to connect.");
  }
}
