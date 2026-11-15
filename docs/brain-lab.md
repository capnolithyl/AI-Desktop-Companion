# Mikan Brain Lab (P0)

**Status:** Experimental manual diagnostic harness. Not a production conversational reliability certificate.

Open **Desktop Mikan → Settings → Brain lab** or the authenticated remote browser
**Settings → Brain Lab**. Choose a category or scenario, **Fast** or **Live**,
and 1–5 repetitions. The runner is owned by the desktop process, not a settings
component or browser tab; closing a panel does not cancel it.
This does not rebuild the installer.

## v0.9.20 research evidence grounding and desktop status

The first fully recovered public-web Live report (`eval-1794702527001-7e5qe`)
showed 13 real SearXNG searches and 104 returned result previews, and all
18 turns passed routing/memory tests. Manual review still caught multiple
invalid cross-entity facts and ignored recommendation constraints, including
a six-episode label incorrectly attributed to a different anime title.
Search planning works; factual synthesis from snippets does not yet reliably
respect source boundaries.

**Production research improvements, shared by Brain Lab:**

- When structured research is enabled (the default), production
  `chat_stream` now reads up to two relevant **public HTTPS** source pages
  per planned search through the existing bounded/cached page reader before
  extracting source-anchored facts. This is the same path for real desktop
  chat and isolated Live tests. Failed page reads retain normal search previews.
  The lightweight mode stays available by disabling structured research.
- The existing evidence extraction receives both the public research query
  carrying the multi-turn subject and the user's latest constraint. A follow-up
  such as "under six episodes" therefore isn't evaluated in isolation.
- Machine validation of numeric claims now requires the number to occur in
  the **same quoted sentence/clause as the named subject**, not merely
  elsewhere in the search snippet. This rejects one common class of
  cross-title count/date confusion. It is a conservative source-structure
  check, **not** independent factual verification or a hardcoded anime rule.
- The existing synthesis instructions say to test each candidate against
  explicit user constraints and to offer fewer suggestions when evidence is
  insufficient, rather than padding a list with guessed titles.
- Actual per-turn Rust `researchAudit` status, accepted/rejected quote
  counts and timing are now included in Live JSON/Markdown exports and
  visible on the desktop and phone. Separate metrics don't change routing
  success or substitute for owner/ChatGPT manual review. No self-critic
  of the answer has been reintroduced.

**Phone developer status:** The relay's current real agent heartbeat now
controls "Desktop relay: connected". The supervised child process's running
status is shown separately. The strict "heartbeat after managed launch"
gate remains exclusively for proving that a particular restart succeeded.
This resolves the mismatch where the chat was clearly Online but developer
updates said the desktop wasn't yet connected.

Version bumped to **0.9.20** across all app manifests. The Windows build,
supervised restart and real Qwen/SearXNG outcomes are still subject to
verification; no result should be claimed before another Live report.

## v0.9.19 remote report download recovery

A live-web run completed with 7 scenarios / 18 turns, but the phone's JSON
and Markdown download buttons remained disabled. The desktop had finished
the run and auto-saved both files. The browser relay was still validating
the **old** `environment: isolated-synthetic` / `liveWebEnabled: false`
report shape, so it rejected the new public-web report when the desktop
tried to upload it. Its safe status whitelist also silently discarded
`liveSearches`, `liveSearchesWithSources` and `liveSources`, displaying
a misleading `0 searches` even if actual queries ran.

The relay now accepts both strictly consistent synthetic report variants:
`isolated-synthetic` with web disabled, or
`isolated-synthetic+live-public-web` with Live mode and public web enabled.
The real search counters are included in phone state. Invalid/mismatched
reports remain rejected. The phone explains when a finished report is not
yet accepted.

**Recovering a costly completed run after an update:** Rust's new
`brain_eval_load_latest` command can reopen the newest bounded JSON/Markdown
auto-export from its fixed `Documents/Mikan/Brain-Evaluations` folder (or the
same native app-data fallback as the exporter). It accepts no user-selected
path and never touches actual chat memory. Desktop startup restores that
run's report and read-only dashboard status so it can be re-uploaded to the
relay after the managed updater restarts. No new Live test is necessary if
the existing auto-export is still present and valid. This must be verified
on the Windows machine after updating.

Versions synced to **0.9.19**. Full native Tauri build and end-to-end
remote export are not yet independently confirmed.

## Actual public web search in Live mode (v0.9.18)

**Fast** still tests routing and synthetic lexical memory offline. **Live** now
runs the configured local Qwen and sends any approved PUBLIC discovery query
through the exact same Rust `chat_stream` → source-prioritized SearXNG path
used by normal desktop Mikan. Real public search results, the actual executed
query, source titles, URLs and excerpts are retained **per turn** in the
JSON and Markdown reports. The source count and count of searches returning
results are separate metrics from planner agreement. If SearXNG is offline,
an actual search errors visibly rather than silently simulating evidence.

Each test still uses fabricated, isolated local memory facts. No production
SQLite/Qdrant memory reads or writes, Notion/GitHub private tools, or remote
relay writes occur. The local planner must first authorize a public query,
and permission restrictions protect personal/roleplay/attachment paths.
Outgoing search terms do not include synthetic private memory material.
The Rust tool uses its normal result filtering, fallback query, and optional
source enrichment/evidence extraction. External snippets remain untrusted
source DATA, not prompt instructions. The same-model AI self-review remains
removed; send JSON exports to ChatGPT for manual quality review.

**Limits:** This is a real public search and real response generation, not an
exact copy of every production-chat integration (for example semantic Qdrant
retrieval still uses synthetic lexical fixtures). Expect slower Live tests and
requires working SearXNG. A green routing score alone still does not verify
answer factuality or a source actually supports a claim. Fast test cases and
older JSON report versions remain parseable.

## Conversation-aware public research planning

**What changed:** Production Mikan and the isolated Live Brain Lab now pass
the same recent conversation context to the *local* web-intent model. The
planner sees at most three short, recent **user** turns from the current
conversation, in chronological order, plus an explicit current-turn label.
Assistant replies and older turns are excluded; long passages, attachments,
and obvious identity, contact, home-location or health disclosures stop the
history window. This material stays on-device and is never passed directly
to SearXNG.

The current turn remains authoritative. New subjects, opt-outs (e.g.
"not asking for recommendations") and simple social commentary should
result in `web.search=false`. A relevant constraint can refine an active
discovery request without restarting research from scratch. The model
still decides whether a public search improves the answer; the existing
query validator still rejects personal pronouns, private names, contact
details and URLs before anything is sent to a public service.

**Nov 14 semantic routing refactor:** `src/turn-execution-policy.ts` no
longer classifies phrases as "personal disclosure", "discovery need",
"just venting", or "small talk" with regexes to block planning. Any ordinary
chat turn may now reach the local semantic web planner, including greetings,
offhand remarks, implicit recommendations, and follow-up constraints. The model
must decide whether to search, while the current message and ongoing task
remain explicit in its prompt. This intentionally adds a local planning call
for some short conversational turns; benchmark latency before optimizing.

**Hard safety boundaries remain code-owned:** web disabled in Settings,
selected private Notion/personal-memory/capability routes, roleplay, approved
attachments/screenshots/live frames, and already-provided search evidence.
Cloud providers do not get optional arbitrary-chat web tools before the
locally validated public search decision; direct research routes remain
available. The final search query must still pass privacy and syntax
validation before any outbound request. These are permission and data-safety
checks, not attempts to recognize English-language intent.

No specific band/anime/game phrase or venting regex was added to production
routing. This first pass does **not** remove the separate legacy heuristics
in initial research routing and deterministic memory recall. Those remain
areas for follow-up investigation.

**0.9.17 remote-managed desktop recovery:** A phone update to 0.9.16
showed the new browser relay and commit successfully but reported "Desktop offline".
The Windows supervisor was correctly in `desktop-and-relay` mode and Git
was up to date, yet `npm run desktop` had failed to establish its agent
connection after the restart. The old supervisor waited only for relay
HTTP health, not for the desktop app itself.

In developer updates the phone now shows a **Restart desktop only** action
when the supervisor owns the dev desktop. It stops and relaunches only the
supervisor-owned Tauri/npm process and leaves the browser relay running;
it never launches shell commands from user input or changes an installed
desktop .exe. The loopback-only desktop-agent health probe does not advance
the agent heartbeat. A restart requires a *fresh* agent heartbeat since
that desktop launch, so the old desktop cannot make the new process look
connected. Short redacted startup output and process-exit status are
available in developer updates for diagnosing a failed spawn or Rust/Vite
startup. When a source update builds and passes tests but the new desktop
fails to connect, the verified source and relay remain in place with an
error and restart control instead of a false success or source rollback;
earlier build/dependency/test failures retain their transactional rollback.
The UI prevents restarting during an active chat or Brain Lab run.
Remote restart requires the existing Tailscale + browser key + private
loopback supervisor token. It is not exposed in relay-only mode.

This is a recovery and diagnostics change, not proof that the underlying
Tauri startup error is fixed. Full Windows build and reconnect verification
remain necessary. App metadata bumped to **0.9.17**.

**0.9.16 shared reply grounding and faster remote test selection:** The
Nov 14 23:03 UTC Live run (`eval-1794697430880-rzoxl`) covered 8
scenarios and 21 turns, all mechanically passing routing/memory checks.
Manual review found genuine model confusions (Immortal interpreted as a game;
questionable metal, horror, book and RPG recommendations), while the 0.9.14
same-model critic was already removed in 0.9.15.

The Live harness had been generating replies with a short bespoke system
prompt unlike the desktop conversation engine. It now shares the actual
desktop `responseFocusGuidance`, owner-detail grounding rules, conversational
clock and owner-configured system prompt while keeping **only synthetic
test memory** and a clear `no public web result was fetched` boundary.
The shared production guidance asks for context-grounded referent resolution
rather than guessing a band/game/book from a verb, keeps an ongoing
discovery request's constraints, and avoids unsourced niche recommendation
claims when a search was planned but not actually run. This adds no
artist-specific, topic-specific or venting regexes, and does not imply
that real search integrations are tested in isolated Brain Lab.

The phone browser Brain Lab now has an optional input to select a precise
comma/space-separated set of scenario numbers (for example
`57,59,60,62,65,66`) in one operation. Unknown IDs are rejected without
clearing the existing selection. The ordinary filters and checkbox list
remain available. Regression tests cover shared guidance and browser
script syntax. Version synchronized to **0.9.16**.

**0.9.12 focused active-task reasoning:** Live run of 0.9.11
(`eval-1794692172668-ah5rl`, Nov 14 21:36 UTC, Qwen3.5:9b)
mechanically passed 5/6 scenarios and 14/15 turns. #59 now correctly continues
a public discovery, but #57 still decides no web after explicitly identifying
an active music-discovery query. The model was confusing "not a new question"
with "not a refinement of the existing task". Active validated tasks now use
a shorter **local model** prompt asking for a structured semantic disposition:
`refine`, `end`, `new` or `chat`, plus the normal validated web plan.
No regex or phrase-based classification was introduced. The model may still
decline to search; a contradictory `end/chat + search=true` output fails
closed. Reports expose the model's disposition for inspection.

**The Live harness does not have public search results.** In the previous
run #65 produced 1,136 tokens of self-corrections and inaccurate episode
counts while the web planner correctly requested research. This is a
conversational-quality failure requiring human review, *not* evidence
the public search returned incorrect data. The isolated reply adapter now
receives whether research was planned and explicitly tells Qwen that planning
did NOT fetch sources; it should avoid unsupported factual recommendation
lists and episode counts, stay concise, and ask when a named entity is
ambiguous. This changes the simulation's evidence discipline, not the
production search-result execution. Full recommendation quality with real
sources still requires a separate integrated test.

**0.9.11 active research state:** A validated public search query from the
immediately previous assistant turn now accompanies recent short user turns
when the local web planner judges the next message. This is explicit task
state, not a regex guess about phrases. If the model says no search or the
conversation changes to another task, the active query is cleared. The
synthetic Live runner follows the same state lifecycle and exports the prior
active query for debugging. No previous assistant prose is used as evidence.
In production only the previous assistant's validated `ai-web` tool audit
may establish this context. The model still decides if a new turn refines,
cancels or replaces the goal; prior state NEVER automatically authorizes web.

**0.9.11 memory precision:** Generic negations/pronouns cannot match unrelated
synthetic memories, and broad domain words like "band" or "RPG" are not
enough to recall a different named artist or game. Direct "favorite band?"
questions still work without entity overlap. The catalog now explicitly
excludes observed unrelated memory IDs in key discovery cases, so the next
rerun tests memory precision rather than granting an automatic green score.

**To verify:** In the browser or desktop Brain Lab, run **Live · 1×** on
**#57 (band discovery)**, **#58 (chat, no search)**,
**#65 (short horror anime)** and **#66 (tactical RPGs)**. Include
the negative opt-out and topic-switch cases for additional coverage.
For #57, #65 and #66, expect the first request *and* the second-turn
constraint to plan the appropriate public discovery. In #58, normal
gushing must remain local. Review the actual model replies separately,
because this harness still doesn't run real SearXNG searches or verify
recommendation accuracy.

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

## Updating test code from the phone

Use the optional Windows development supervisor described in
[server/README.md](../server/README.md#remote-developer-updates-opt-in).
Start `npm run remote:dev` once to manage the browser relay; when local
Tauri compilation works, use `npm run remote:dev -- --desktop` to let
the supervisor also manage the dev desktop. The phone can then Check GitHub,
review the pinned-branch update, and explicitly approve Update & restart.
The supervisor refuses updates while Brain Lab is running.

A Git pull alone never modifies an installed desktop executable. To
run newer desktop test code before the Rust toolchain works, install a
Windows CI-generated installer of the selected commit.

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

## Desktop workspace layout

Brain Lab uses the normal scrollable Settings content viewport, not the
embedded Memory/Capabilities layout (which intentionally clips overflow).
The full test catalog scrolls with the page and no longer has a separate
310px list scrollbar. The Run/Stop/Export bar stays accessible while scrolling.

When Brain Lab is open, Settings navigation switches to compact icon buttons
with accessible labels/tooltips, giving the tests more space. The long
diagnostic introduction and score interpretation are collapsed by default
but still available on demand. You can search by a scenario's stable number
(e.g. `#65`), ID, label or group as well as filtering by category/status.
The selection count is always visible and searching does not deselect tests.

A status of STALE means the previous result was generated using another
build or fixture. It does not mean the test newly failed.

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
decisions remain INCOMPLETE rather than turning green. The dashboard now
separates **No detected failures** (which can include incomplete observations)
from **Verified checks** (which exclude turns awaiting human/tool verification).
Factual assertions
are checked even if human conversational review is also required.

The browser's **Inspect** action loads the latest finished synthetic run's
turn-by-turn replies and expected review goals directly on the phone.
Older run details can still be opened from saved Windows JSON/Markdown files.

### First general production fixes from the Live baseline

- Song, track and album remain useful searchable *domains* in lexical
  retrieval; previously they were removed as stopwords, leaving some direct
  favorite-song questions with no useful matching terms.
- Initial experiments allowed only regex-recognized *unmet discovery needs*
  to reach the local planner. That intermediary gate has since been removed:
  the local model now determines whether a conversational turn requests
  discovery or is simply a personal observation. Eligibility to plan is
  not authorization to execute a public search.

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

**Readable report filenames:** Auto-saved Windows JSON/Markdown and remote
download files now share a metadata-derived name, for example
`mikan-brain_2026-11-14_203931Z_live_qwen3.5-9b_s05_r1_of3xx.json`
and the matching `.md`. This is UTC start time, mode, model, selected
scenario count, repetitions and a short unique run suffix. Conversation
content, owner details and file paths never appear in these names.
Reports keep the original `runId` in JSON for exact correlation.

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
