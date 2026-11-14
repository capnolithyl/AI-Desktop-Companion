# Mikan Brain Lab (P0)

**Status:** Experimental manual diagnostic harness. Not a production conversational reliability certificate.

Open **Desktop Mikan → Settings → Brain lab** or the authenticated remote browser
**Settings → Brain Lab**. Choose a category or scenario, **Fast** or **Live**,
and 1–5 repetitions. The runner is owned by the desktop process, not a settings
component or browser tab; closing a panel does not cancel it.
This does not rebuild the installer.

## What it covers

- A fixed catalog of isolated **synthetic** memories. Names such as Cobalt Harbor,
  Nora Vale, and Brookmere are fictional; no real family information is used.
- Deterministic routing via the **existing** `decideDesktopTurn` and
  `planDesktopWebExecution` functions, with lexical memory selection via
  `selectDeterministicMemoryIds`.
- Multiple follow-ups from exactly the same initial question, with interruptions,
  topic changes, corrections and pronoun resolution.
- **Natural conversation:** 20 additional multi-turn scenarios for jokes, sarcasm,
  excitement, venting, bilingual chatting, harmless imaginative roleplay,
  gentle social engagement, changed emotions, offhand statements, typos and
  conversational corrections. Most are **not questions**.
- **Conversational discovery:** 16 extra multi-turn scenarios for implicit
  research opportunities ("I wish there were more bands like Immortal"),
  followed by recommendation refinements, as well as contrast cases that
  explicitly should **not** search ("I love Immortal", "I wish I had more
  time to listen to Immortal", and "Just venting, no recommendations").
  Includes similar books, anime, games, free software, tour dates and used
  hardware-price curiosity. These test **intent**, not regex phrase matching.
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

## Overnight browser workflow

1. Leave the desktop app running (tray is fine), keep Ollama and the Node
   relay running, and ensure Windows won't sleep overnight.
2. From your phone/browser open authenticated Mikan → **Settings → Brain Lab**.
3. Pick Live or Fast, category or individual scenario, and 1–5 repeats.
   **Start** returns immediately; the desktop processes the selected turns.
4. Close the tab if desired. Reopen it to view completed/total turns, current
   scenario, outcome metrics and errors. **Stop** issues an explicit desktop
   cancellation, even while a live test is running.
5. The completed or stopped run is auto-saved on Windows under
   `Documents/Mikan/Brain-Evaluations` (AppData fallback). Browser download
   buttons provide the latest finished JSON and Markdown report for morning
   review. The relay keeps a RAM copy and the desktop can re-upload it if the
   relay restarts.

The Windows PC must stay awake and the desktop process must remain alive.
This release does **not** resume half-finished runs after Windows restart.
A browser disconnect doesn't interrupt the run; a lost desktop process does.

## Focused reruns and per-scenario statuses

Desktop and browser Brain Lab display a checkbox and last saved outcome for
**each** scenario. Running a subset updates only its results, not the others.

- **PASSED:** all repetitions and checks passed; subjective dialogue must
  also have an explicit human approval before turning green.
- **FAILED:** any repetition/check failed, or a human marked a reviewed
  conversational reply as wrong.
- **REVIEW:** automatic checks didn't fail, but conversational quality or an
  optional web-planning decision requires human inspection. Read the trace
  and choose **Approve** or **Fail**.
- **INCOMPLETE:** a scenario was interrupted, didn't finish all repetitions,
  or an expected web-planning decision was not actually observed (for example
  an implicit discovery prompt in Fast mode). Missing evidence cannot be
  manually approved into a passing grade; rerun with an observable planner.
- **UNTESTED:** never run on the selected model + Fast/Live mode.
- **STALE:** completed with an earlier app build or older test definition.
  The previous result is visible but isn't counted as fresh.

Statuses are scoped to scenario ID, mode, local model, app version + Git commit
(where available), and the test's own definition fingerprint. A model
switch doesn't inherit another model's passing grade.

Use category and status filters, per-test checkboxes, and quick actions:
**Select visible**, **Select unresolved**, **Passed regression sample**, and
**Clear selection**. The stable regression sample selects roughly one seventh
of previously passed scenarios. Full suite runs remain available for occasional
regression checks.

Statuses persist in desktop localStorage, and the browser gets an authenticated
read-only copy of each outcome. Human approvals from the browser are validated
by the desktop. Completed runs also save detailed JSON/Markdown diagnostics.

A code change made without updating Git HEAD or the app version may not
invalidate the build fingerprint automatically. When in doubt, rerun tests.

## Numbered scenarios, evidence-based grading and phone reviews

Each test displays a stable **#01** to **#73** catalog number in desktop and
browser lists, progress, traces and Markdown exports. Filters and selective
runs do not change the numbering. Historical status keys remain the same
scenario IDs; a future reordering only changes display numbers.

Expected memories are **facts**, not exact required database rows. A
synthetic record can explicitly prove another fact: for instance, a
cat-and-dog record containing Pippin's name satisfies the dog-name fact
without needing the separate dog-only row. Raw ID misses and unrelated
retrieved records remain visible as diagnostics. Fixture entailment metadata
does not alter production routing or memory search.

Similarly, route labels (`chat`, `factual`, `research`) are informational
when the observed web decision satisfies the user intent. Unknown web
decisions remain INCOMPLETE rather than turning green. Factual assertions
are checked even if human conversational review is also required.

The browser's **Inspect** action loads the latest finished synthetic run's
turn-by-turn replies and expected review goals directly on the phone.
Older run details can still be opened from saved Windows JSON/Markdown files.

### First general production fixes from the Live baseline

- Song, track and album remain useful searchable *domains* in lexical
  retrieval; previously they were removed as stopwords, leaving some direct
  favorite-song questions with no useful matching terms.
- First-person statements expressing an *unmet discovery need* may reach
  the existing local web planner across topics (music, books, games, anime,
  software). Merely enjoying an artist or a book still stays local.
  Allowing a planning decision does **not** execute a web search.

These checks are synthetic and do not verify production Qdrant, Notion,
GitHub, or live SearXNG execution end to end.

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

**Important for casual conversation:** a nonempty reply does **not** establish
conversational success. Replies without objective factual checks, or with a
`conversationGoal` rubric, are marked **REVIEW** when running a real model.
The dashboard keeps them out of the factual answer accuracy denominator and
exports the explicit behavior goal for a person to judge. Routing and memory
checks still run automatically. A future optional semantic evaluator can
assist with reviews, but no opaque model judge is treated as ground truth.

**How to test an implicit search:** select **Conversational discovery** in
Brain Lab, then use **Live** mode. Fast mode observes only the deterministic
route; ambiguous prompts commonly require the optional AI web planner, so
their unobserved web decisions are marked **REVIEW**, not counted as a confirmed
search success. A failed web check may be due to the pre-planner policy, the
local model choosing not to search, or an unsafe public query. Inspect the
reason and selected plan. Actual external research remains disabled.

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
