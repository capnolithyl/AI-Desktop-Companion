# Mikan Brain Lab (P0)

**Status:** Experimental manual diagnostic harness. Not a production conversational reliability certificate.

Open **Desktop Mikan → Settings → Brain lab**. Choose a category or one scenario,
**Fast** or **Live**, and 1–5 repetitions. Press **Run**. This does not rebuild the installer.

## What it covers

- A fixed catalog of isolated **synthetic** memories. Names such as Cobalt Harbor,
  Nora Vale, and Brookmere are fictional; no real family information is used.
- Deterministic routing via the **existing** `decideDesktopTurn` and
  `planDesktopWebExecution` functions, with lexical memory selection via
  `selectDeterministicMemoryIds`.
- Multiple follow-ups from exactly the same initial question, with interruptions,
  topic changes, corrections and pronoun resolution.
- Optional **Live** mode uses the configured **local Ollama model** through the
  existing native `chat_stream` command. The entire conversation is passed as
  a temporary test session, not saved to chat history.
- A local model may also simulate the existing `planPublicWebTools` decision.
  **Actual web/search calls are always blocked.**
- Transparent outcome checks: expected route, memory IDs included/excluded, a
  public-web decision where observable, and selected factual phrases. Checks
  are intentionally not strict string comparisons.
- A per-category dashboard, repeated-run results and explicit JSON/Markdown
  export to `Documents/Mikan/Brain-Evaluations` (AppData fallback).
- The browser remote Settings has **Copy conversation debug log**, which includes
  recent messages and relay-sanitized desktop diagnostics (model, latency,
  memory-selection IDs/scores, research decision, relevant errors).

## A/B/C/D experiments

The first four scenarios all begin with:

> What's my favorite band?

The next turns branch into favorite song → singer, favorite song → color,
third album → color, and an unrelated soup remark → singer. Each branch is
a **fresh test conversation**. The expected outcome follows the *meaning*
and the correct source, not a predetermined sentence. Each repetition also
starts from scratch; one run cannot influence the next.

## Read these scores carefully

**Fast mode** is not a full end-to-end application run. It measures the
production **deterministic** routing layer and its lexical-memory fallback using
our synthetic dataset. It does not invoke SQLite FTS5, Mem0/Qdrant vectors,
Notion, SearXNG, browser transport, or the generative model.

**Live mode** additionally runs the local model and optional AI web planner.
It still uses synthetic context and blocks all real external actions.
It is useful for measuring model variability and conversation continuity,
but **is not an integration test of real GitHub or Notion fetching**.

In reports, a web decision means a **plan to search**, never a real network call.
A `null` decision means the harness could not observe it (for example,
a Rust factual branch), not that a search failed.

Never fix a failed scenario by inserting an exception matching its wording.
Investigate the trace, find the failed stage, and check generalization against
other scenarios and new phrasing.

## Run the lightweight Node tests manually

```powershell
npm run test:brain
```

These verify the catalog shape, independent branches, summary report, cancellation,
and the scoring helpers. They do **not** contact Ollama or build an installer.

## Adding regression cases

In `src/brain-eval.ts`, add a new `scenario(...)` containing one or more
`e(userMessage, expectations, ...)` steps. For multi-turn behavior, use
separate scenarios with the same prefix so the runner guarantees independent
initial conditions. Seed only fictional facts in `EVAL_FACTS`.

For ambiguous behavior, write expectations about the *decision* and the
*required facts*, not the exact wording of the reply.

## Still to implement for P0

1. A real disposable SQLite/FTS5 + Qdrant integration fixture for semantic
   candidate selection and provenance, without touching the user's database.
2. Mocked SearXNG/Notion/GitHub service adapters with recorded request and response
   traces, plus optional user-approved live integration tests.
3. A richer semantic/claim-level evaluator for answers that cannot be graded
   using simple expected factual phrases.
4. True cross-client desktop/browser parity tests and test-run exports from
   the browser UI.
5. Windows manual smoke verification and benchmark baselines before marking P0 done.

Tracking: https://trello.com/c/ZChbjxzI
