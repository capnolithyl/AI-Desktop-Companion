# Mikan Brain Lab (P0)

**Status:** Experimental manual diagnostic harness. Not a production conversational reliability certificate.

Open **Desktop Mikan → Settings → Brain lab** or the authenticated remote browser
**Settings → Brain Lab**. Choose a category or scenario, **Fast** or **Live**,
and 1–5 repetitions. The runner is owned by the desktop process, not a settings
component or browser tab; closing a panel does not cancel it.
This does not rebuild the installer.


## v0.9.32: desktop Brain Lab progress parity with remote browser

The desktop Settings Brain Lab previously rendered its progress **after the
entire 83-scenario checklist**, so a running or finished evaluation was hidden
far below the fold. The browser has a permanently visible progress element
and a compact scenario picker. The desktop now:

- Shows a **sticky run status/progress monitor above the scenario catalog**
  containing percentage, completed/total turns, current work label, and
  clear Ready / Running / Finished / Stopped / Failed outcomes.
- Keeps the **completed result state visible** (including when Settings is
  closed/reopened). A finished run is **not** represented as all tests passing:
  the status explicitly distinguishes automatically detected failures and
  replies awaiting human review.
- Exposes auto-save location and export errors, and provides **View results**
  to jump directly to the retained dashboard and traces.
- Allows comma-separated scenario numbers (for example `20, 21, 83`) just
  like the remote browser, with validation, and collapses the lengthy
  checklist when a run starts. Owner selections are preserved. A disclosure
  expands the checklist again without nested scrollbars.
- Uses the existing process-lifetime Brain Lab status store and runner;
  no new polling loops, background processes, changes to evaluation grading,
  or extra data persistence were added.

Node test coverage guards the desktop layout ordering and terminal states.
The browser-side controls and shared engine behavior are unchanged. Verify
the desktop layout with a long Live run and after a completed or failed run
before considering it fully validated.

## v0.9.31: personal reaction, memory capture and unsolicited tool use

**Scenario #83 · Reaction after anime news (three turns).** This is a
regression from a real desktop exchange: public catgirl-anime news lookup,
owner's personal reaction expressing love of yuri but disgust with the heavy
drinking focus of a named anime and skepticism about smoking-themed stories,
then an explicit request to research alternatives.

Required behavior:
1. First turn performs a REAL public-news lookup with normal production
   SearXNG evidence and human status/source review.
2. Middle turn is **ordinary conversation**, with zero public search,
   unsolicited recommendations or source-gate refusal. The local planner
   sees the prior public lookup but must not mistake it for perpetual
   discovery permission. Review the quality of Mikan's acknowledgement.
3. After that middle turn, a **read-only memory extraction preview** runs
   against the real local Ollama model with production memory-extraction
   instructions and quote/validation logic. It makes NO SQLite, Qdrant,
   review-queue, interest-collection or cloud writes. The report and Brain
   Lab UI show the proposed stable user facts and interest items alongside
   exact supporting owner quotes. At least **two durable fact proposals**
   are expected, with human review of their meaning: (a) loves yuri anime;
   (b) specifically disliked the drinking portrayal in *Botan Kamiina
   Fully Blossoms When Drunk*. Possible additional nuance: smoking-heavy
   anime probably would not appeal. The owner did NOT necessarily dislike
   the entire series or categorically say they hate smoking. If recording
   the named title as an interest, `experienced`/watched is supported; a
   blanket `dislike` status is not necessarily justified. Avoid redundant
   genre-as-title interest records and fabricated details.
4. Final turn explicitly asks for other anime. At this point public search
   is warranted, and the stored preference should guide the answer locally.

The isolated preview measures the *proposed* capture on a model run,
not whether the production memory job persisted duplicates or updated an
existing database. A Rust unit regression separately writes exactly two
grounded facts and one `experienced` interest into an **in-memory**
SQLite database and checks source validation. Neither test mutates real
owner memories. Extraction meaning still requires human review; the
minimum fact count is only a structural assertion, not proof of quality.

Catalog is now **83** scenarios (#01–#82 unchanged). Prefer running
**#83 Live · 1×** by itself after updating. The middle turn should not
invoke the expensive native search or recommendation evidence pass.
This is intentionally a failing regression for the observed problem:
**no production planner fix has been applied yet**.

## v0.9.30: live research-context parity and current-status regression

The latest desktop research trace (2026-11-16) successfully retrieved real
SearXNG sources for `Chainsmoker Cat`, but its answer described an already-past
July 2026 premiere as future news in November. The same trace showed irrelevant
personal facts selected for a public anime-news question. Neither a model's
source count nor a routing PASS certifies a useful answer.

**One concrete Brain Lab fidelity bug corrected:** Live Brain Lab supplied the
compact `chatRuntimeContext()` instructions for every turn, even when it was
actually performing research. Regular desktop research instead supplies the
full `runtimeContext()` with host local date, source chronology, and instructions
to distinguish past schedules from independently confirmed outcomes.
Live Brain Lab now selects that production research context when a genuine
public query is about to be executed. It still uses the lightweight context
for conversational or blocked/no-search turns.

**Scenario #82: Old announcements versus current status** uses a real public
anime name and REAL SearXNG news searches in two turns. The reviewer checks
that a February announcement about an expected July premiere is not repeated
as upcoming in November, and that an old forecast isn't treated as proof
that airing/completion occurred. The scenario does **not** inject synthetic
news or grade correctness from a keyword. Its result requires human review.
Catalog was **82** scenarios at v0.9.30; #01–#81 retained their existing numbers.

This change repairs measurement parity, not the production model's underlying
time-awareness or semantic memory precision. A stronger model and production
answer-stage changes still require separate real-world comparison.
Suggested focused Live 1× quick-select: `20,21,74,76,77,79,82`, only when
the real search provider probe is healthy. Review actual answers and traces,
not the automatic PASS tally. Repeat the failing subset twice to measure
model variance before changing another component.

## v0.9.27 candidate-first evidence recovery and correction tests

**State:** Committed to draft PR #91, pending Windows compile and real Live verification.
The catalog contains **81** scenarios; original numbers 01–77 are unchanged.

When a DISCOVERY task's initial strict evidence screening finds no supported
recommendation, the native pipeline makes a bounded second-stage attempt:

1. A separate local extraction proposes at most two individually named works
   from **verbatim quotes in genuine SearXNG source excerpts**, never from
   article titles alone. An ungrounded lead cannot be used in an answer.
2. Each candidate receives a public, candidate-specific search for the
   applicable duration, track count, page count or typed creator credit. The
   original validated public topic is retained to disambiguate similarly
   named works (for example a horror game versus a film).
3. The full extractor and existing Rust strict-quantity/typed-attribution gate
   check ONLY that named candidate. If no evidence establishes the actual
   requirements, Mikan still says she could not verify a suitable option.
   These are actual additional SearXNG searches; no web result is simulated.
4. Reports show grounded lead names, source numbers, attempted candidate queries
   and validation rejection reasons. This can be slower than ordinary lookups.
   It is not an additional LLM reviewing its own final answer.

**New correction and recovery cases** (Live, current local model and real
SearXNG only): 78 ambiguous *Immortal* corrected to the Norwegian black-metal
band; 79 known dislike of XCOM after a Fire Emblem-style recommendation;
80 a reference band explicitly excluded from revised recommendations;
81 dubious singer birth-year information challenged and reverified.
A correction changes the intended entity, constraint or exclusion; it does
not magically make a user's statement about external facts true. The model
should re-check sources when a prior fact is challenged.

**Deliberately false web results** are NOT injected into the Live engine:
those would invalidate the real-search reliability metric and violate the
previous decision not to mock SearXNG. A separate opt-in, explicitly labeled
adversarial-fixture mode could later test resistance to one fabricated,
untrusted excerpt and its correction. Case 81 instead uses a deliberately
suspicious USER-SUPPLIED claim and searches independently for verification.

**Recommended focused test after updating to v0.9.27:** Live 1×
`77,78,79,81`, export JSON. If the source-validation results improve,
try `74,75,76,80`. Only run the entire 81-test suite when focused regressions
have stabilized. The original v0.9.24 instructions below are historical.

## v0.9.24 research planning and evidence

Live run `eval-1794711699279-2uir5` covered 13 scenarios and 32 turns. It
recorded 21 searched turns, nine empty shortlists, eleven turns that passed
through general extraction or raw excerpts, and one admitted shortlist.
The movie follow-up in #74 switched subjects, and #75 supplied track counts
that its sources did not establish.

The local planner now passes its selected task, target, numeric limits, and
requested credits to the native evidence pass. The planner can resolve a
reference from the previous public result. The quotes for the new answer
come from the retrieved sources. A discovery task may make one focused
lookup for missing details on a promising candidate. For example, it can search
for a show's episode count after a general recommendation page names it.
The model judges qualitative fit by meaning. Rust checks the original
user wording, normalized comparisons, and source-bound credits.

When structured extraction fails, the reply states the gap in evidence.
When verification finds one of several requested details for the selected
work, the notes identify the remaining gaps. Brain Lab exports the app build,
the chosen task, unvalidated limits, and focused follow-up queries. Scenarios
#56 and #64 also flag the two irrelevant memories observed in this run.

After the phone updater finishes and the desktop reconnects, run all **77**
scenarios in **Live · 1×**. Export the JSON in the morning. Review #65 and
#74–77 for evidence coverage, #57–60 and #62–66 for regressions, and leave
conversational results in review until their replies are inspected.

## v0.9.23 normalized quantities, typed attribution and source-of-constraint isolation

**Why:** The recovered real-web 0.9.22 Brain Lab run
`eval-1794707622253-a3obg` (Nov 15, 2026 01:53–01:54 UTC)
had 2 scenarios, 5 turns, 4 SearXNG searches, and 5/5 routing checks.
Quality was still unsatisfactory:
- **#62:** First attempt extracted zero proposed bands despite topical search
  results. Next admitted Dark Tranquillity *itself* (the user's starting
  example), Soilwork and Pinkroom; a general claim about Pinkroom's
  melancholy did not establish melodic-death-metal relevance.
- **#65:** The search planner's first query introduced "under 24 episodes"
  despite no episode count in the user's first message. Later, with the
  actual *under six* request, the extractor returned one unvalidated limit
  (exact wording mismatch) and no accepted titles. Zero matches can mean
  *no candidates proposed* or *candidates rejected*; those require different
  fixes. The source previews were mostly broad listicles, so individual
  episode counts were hard to confirm.

**Implemented across normal local research and Live Brain Lab:**

1. The evidence extractor now receives the last five actual USER turns,
   retaining the latest turn, and receives the SearXNG query in a distinct
   **topic-hint-only** field. Numeric/genre requirements and named exclusions
   are checked **only against the owner's exact original wording**, never
   against an AI-generated search query. An invented "under 24 episodes"
   is therefore not an authorized constraint. The extractor is asked to
   avoid recommending the reference work back to its fan; Rust verifies
   excluded names occurred in the actual user messages.
2. New `src-tauri/src/quantities.rs` performs structural normalization and
   comparisons: seconds/minutes/hours including 1h 35m and 1 hour and
   35 minutes; episodes; songs/tracks; pages; chapters; words; seasons.
   Strict comparisons remain strict, and incompatible dimensions do not
   compare. The quoted evidence must contain the particular work and
   measurable property, not just a neighboring list entry. The validator
   now checks the first measured property after the work in a clause,
   avoiding an incorrect count taken from the next work in the *same*
   sentence. Numeric word forms one through twenty are supported.
3. New `src-tauri/src/attribution.rs` screens typed work-to-creator
   relations: author, director, production **studio**, producer, distributor,
   publisher, developer, musical artist, composer, creator. The exact source
   quote must name the correct work, identify the intended role explicitly
   and attach that role to the claimed person/company. A reviewer is not
   an author, someone who praises a movie is not its director, and a
   production company is not automatically its distributor. The short
   "`Book Title by Author`" form is supported, while `reviewed by` is not
   used as author evidence. Source text can still be false or stale.
4. The existing local evidence extraction pass proposes typed
   `relations`, normalized measurements and `excludedNames`; it is
   **not** another Qwen model reviewing a completed answer. Rust checks
   these candidates before the final generation. If insufficient evidence
   remains, the reply still reports uncertainty rather than fabricating
   precise claims.
5. The Brain Lab JSON/Markdown now records **accepted candidate details**
   including each original source number, verbatim quotes, measured
   amounts/units, and typed relationship edges, plus counts of
   `relationsChecked` and `exclusionsChecked`. The phone and desktop
   views include a compact summary. Passing the structural gate does
   not automatically grade the answer as factually correct.

New unit test coverage: 95 min vs 1h35m vs 1.5h; strict 120 min
boundary; songs/tracks and pages/chapters compatibility; attribution
for book authors, movie director vs producer vs studio vs distributor,
album artist, game developer vs publisher; a reviewer misattributed as
author; two works with different episode counts in one sentence; already
mentioned reference artist exclusion; and a fabricated search limit
not present in user text. The existing phone updater's conditional
`cargo check --tests --locked --manifest-path src-tauri/Cargo.toml`
still protects managed startup from native type errors.

**Current limitations:** Book page counts depend on edition. Game playtime
is generally an estimate rather than fixed media runtime. Songs and tracks
are treated as comparable catalog counts, not as proof every track is a
distinct full song. Relationship checks validate source quotation structure,
not factual accuracy of the website. Genre similarity remains a judgment,
and search results may lack the exact metadata needed to admit otherwise
valid recommendations. Empty candidate proposals now get a distinct
diagnostic from candidates rejected by the gate. A targeted follow-up
metadata search and stronger source selection may still be needed.

**Additional real-web scenarios:** The Brain Lab catalog now has **77**
scenarios. All original #01–#73 numbers remain stable. New cross-media
cases #74 (movie under two hours and director/studio), #75 (album with
fewer than ten songs and correct artist), #76 (book under 200 pages and
actual author versus reviewer), #77 (game under two hours of main-story
playtime versus trailer length). These test the production pipeline and
source availability, not simulated facts or automatic quality grading.

**Next real test after updating to 0.9.23:** Start with Live · 1×
**#65 and #74**, export JSON; these quickly exercise strict episode
limits and duration/director/studio evidence. If the filter works, try
#62/#75/#76/#77 separately as needed. Inspect `recommendationDetails`
and the no-match reason.
This is source-screened evidence, not an independent fact-check.

## v0.9.22 source-screened recommendation shortlist

The previously identified P0 answer-quality failure remained after real
SearXNG searching: the local model proposed fabricated releases, unrelated
genres and recommendations violating strict numeric requirements even when
retrieved sources were available. Search planning works; unbounded synthesis
from mixed snippets is the problem.

The **existing** Rust source-evidence extraction pass (not a second model
reviewer) now returns a structured recommendation shortlist when the
local extractor recognizes a discovery/recommendation task. Each proposed
item carries a numbered source, exact title, optional creator and two exact
quotes tied to that title: identity and fit to the requested qualities.
Explicit style/genre phrases copied verbatim from the user's research request
must also occur in each item's fit quote. A hard quantitative requirement
(e.g. "under six episodes") is copied verbatim from the request, with a
relation, limit and unit. Each candidate supplies its own source-backed
measurement quote; Rust validates the requested comparison and checks that
the title, number and unit occur in the same clause, not a neighboring
result. When a creator is claimed, it must appear alongside the specific
work in the same quoted clause. These are **structural evidence tests**,
not independent verification that a source is correct or genres are
semantically equivalent.

The final answer is then given ONLY the bounded, source-screened shortlist
instead of the full noisy search excerpts. The prompt forbids inventing
additional releases, creators and numeric details. If no candidate meets
the gate, Mikan gives a brief honest "couldn't confirm a match" response
rather than fabricating a recommendation. A model that fails to classify
a discovery intent as a recommendation or a local extraction failure can
still leave weak answers; future Live reports must measure those cases.
Fast mode, ordinary conversation and non-recommendation research are
unchanged. Real memory isolation and private tool permissions remain
unchanged. No hardcoded Immortal/Dark Tranquillity/anime-specific routing
or same-model final-answer reviewer was added.

Brain Lab now exports `researchAudit.recommendationTask`,
`recommendationApproved`, `recommendationRejected`,
`constraintsChecked` and `featuresChecked`, with separate shortlist
metrics in the JSON/Markdown, desktop dashboard and phone report.
Rust tests include a verified four-episode example, a twelve-episode
mismatch, a neighboring-card number, a mismatched creator attribution
and cross-genre examples. The app version is **0.9.22**.

To reduce remote startup risk, the supervisor now runs a fixed, bounded
`cargo check --tests --locked --manifest-path src-tauri/Cargo.toml` **only if
native Rust source/build-script files changed**, after JavaScript build/tests and
before restarting its managed desktop. A native compile failure rolls back
the checkout instead of first trying to launch broken Rust. No arbitrary
commands are passed through the phone; Cargo metadata-only version bumps
do not trigger an extra native check.

**Verification pending on Windows:** First install this iteration from
the phone, confirm tests and desktop reconnect. Then run Live · 1× on
`62,65` and export JSON. Check that shortlisted candidates actually match
the requested genre/episode limits, and that no-match cases are reported
accurately rather than hallucinated. Expect false negatives when good
source evidence is not explicit. A green route score still does not
prove qualitative accuracy.

## v0.9.21 use one authoritative desktop connection status

The 2026-11-15 01:06 UTC Live report on v0.9.20 succeeded with two
scenarios, five turns, four SearXNG searches and four source-extraction
passes, yet phone Developer updates still showed `Desktop relay: offline`
even while its chat header said `Online` and Brain Lab ran correctly.

The two UI labels came from **different backends**. The chat's `Online`
label is backed by the browser relay's fresh `/api/state.connected` value,
derived directly from its last desktop-agent heartbeat. Developer updates
was instead relying on an independent supervisor-to-agent health probe,
which may fail separately from the working relay. The supervisor health
probe is not the authority on whether the browser relay is connected.

The authenticated `GET /api/dev-update` response now also returns
`relayDesktopConnected` computed from the **same** relay heartbeat as
`/api/state.connected`. The Developer updates **Desktop relay** line uses
this value only. Its own separately-owned process status remains visible;
when the supervisor's own probe disagrees, it reports that disagreement
as `Supervisor probe: unavailable`, without mislabeling the real chat
connection or suppressing process diagnostics. A regression test explicitly
sets the supervisor's reported connection false, sends a valid desktop
agent state, and checks that both authenticated endpoints agree the relay
is truly online. The strict post-launch heartbeat gate remains enabled
when confirming a restart, because that answers a different question.

Manual review of the attached v0.9.20 report shows factual answer quality
still poor: `#62` invented Dark Tranquillity releases, mislabeled the
Canadian melodeath group Quo Vadis as Finnish and offered non-matching
genre recommendations; `#65` offered the 12-episode Junji Ito Collection
and 13-episode Mouryou no Hako after an explicit under-six-episode
constraint. Source extraction accepted 10 passages across the four
search turns, but quotes do not prove the eventual answer meets the user's
constraints. **Next research iteration:** ensure candidate works and their
hard constraints are explicitly checked against evidence BEFORE answer
generation, with no entity-specific regexes and no same-model critic.
This release intentionally addresses the connection display alone.

Metadata bumped to **0.9.21**. Windows update/build and visual verification
must still be performed. The PR remains draft/unmerged.

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
   **Start** returns immediately; the desktop first probes real SearXNG results for any Live selection containing web-research cases. If even a general public query returns no sources, the run stops with an actionable error rather than a false success. On success it processes the selected turns.
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
reason and selected plan. Live mode allows real public SearXNG search when the planner authorizes it; private connectors and synthetic-memory writes remain disabled.

In reports, a web decision indicates a **plan**, not proof of retrieval. Inspect `webExecution.query` and `webExecution.results` to see whether the Rust host performed a real network call and received actual sources.
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
2. Real source-backed web evaluation and optionally permissioned end-to-end GitHub/Notion checks. Do not replace public search with mocked search results; synthetic private facts stay isolated.
3. Better deterministic claim/evidence checks and transparent human reviews for nuanced answers. Do not use Qwen to grade its own answers.
4. True cross-client desktop/browser parity tests and test-run exports from
   the browser UI.
5. Windows manual smoke verification and benchmark baselines before marking P0 done.

Tracking: https://trello.com/c/ZChbjxzI
# v0.9.33 research reliability changes

See [the implementation and validation note](p0-brain-reliability-v0.9.33.md)
for shared execution, source selection, direct document reads, extraction,
memory precision, and the focused Live targets `20,21,24,80,81,82,83`.
Partial evidence remains review-required; an accepted quotation is not a
certificate that the user's question was answered correctly.
