# P0 research and memory reliability — v0.9.33

This change responds to the exact owner-supplied report
`mikan-brain_2026-11-16_154608Z_live_qwen3.5-9b_s07_r1_8i46j.json`
from `0.9.31+fd38bb7a9ed1` (scenarios 20, 21, 24, 80, 81, 82, 83).
The branch was first fast-forwarded to v0.9.32; its desktop UI changes are retained.

## Implemented boundaries

- **Execution and continuity:** `resolvePublicWebExecution` in
  `src/turn-execution-policy.ts` is shared by `App.tsx` and `brain-eval.ts`.
  Factual turns may reach local semantic planning. A no-search decision or an
  invalid plan cannot fall through to a legacy forced search. Permissions still
  override every model decision. Brain Lab preserves source objects, recency,
  and the native factual fallback instead of silently turning it into chat.
- **Task representation:** `unified-planner.ts` separates the entity name/type,
  requested details, qualitative preferences, excluded names, and an optional
  exact user-supplied public document URL. Active-task context no longer assumes
  every prior search was discovery. Model-selected entity types survive query
  serialization, followed by the existing outbound privacy checks.
- **Document reading:** `lib.rs` reads a selected explicit URL through the
  existing `web_reader`. Both frontend and native code check that the user
  supplied the locator; native HTTPS/DNS/private-address protections remain.
  It uses topic-focused page passages rather than searching the URL's words.
- **Source selection:** `web_search.rs` provides a bounded pool of 24 results
  to `source_priority.rs` before selecting eight. Generic one-word matches
  cannot qualify multi-term queries unless the named target is actually
  present. Domain preference is a small bonus after relevance, not an override.
  Recent searches keep the query unchanged; an unfiltered retry happens only
  when the dated request fails or is empty. The album-specific rewrite and
  unconditional parallel fallback were removed.
- **Extraction:** `evidence_pack.rs` uses fact extraction for verification
  without requested numeric/credit constraints. Its JSON schema fixes the
  verification subject, avoiding page-title substitutions. Facts identify the
  requested detail they answer; incidental background cannot fill that slot.
  Partial facts remain available and unresolved details are explicit.
  Credit/quantity verification still uses `recommendation_gate.rs` and its
  existing exact attribution and measurement checks.
- **Discovery:** the existing source-quoted candidate-name pass runs before
  property extraction. The stricter extractor receives the identified name;
  missing details can trigger at most two existing candidate-specific searches.
  Invalid source quotes never become leads. Audits now expose discovery outcome
  counts/schema failure and unresolved details. This costs one small extra pass
  on discovery that would previously succeed immediately; failed discovery no
  longer starts by repeatedly extracting article headings as entities.
- **Answer handling:** `reviewResearchCompletion` in `evidence-verification.ts`
  is shared by desktop and Brain Lab. Structured facts restrict postprocessing
  to accepted quotations. If the final draft fails the existing guard, valid
  extracted facts can be returned with their original citations instead of a
  generic refusal. Partial evidence requires human review. Direct reads and
  candidate-specific searches are distinguished in report metrics/Markdown.
- **Memory:** `memory-ranking.ts` and `memory-retrieval.ts` use one meaningful-term
  vocabulary, preventing sentiment/grammar alone from recalling unrelated
  memories. Semantic neighbors and genuine topic matches remain eligible.
  Shared generation and extraction instructions preserve the user's scope,
  tentative wording, and separation from Mikan's own preferences.

No source truth is inferred merely from a quote match. No entity-specific
production rule, same-model answer critic, new dependency, private integration,
real-memory write in Brain Lab, or updater bypass was added.

## Validation

The isolated Node/Rust fixtures never supply fake public search results to a
real Live run.

- `npm run test:brain`: **112 passed, 0 failed**.
- Adjacent routing, prior-source, memory-ranking and personal-grounding tests:
  **41 passed, 0 failed**.
- Relay/authenticated reporting/updater rollback tests: **25 passed, 0 failed**;
  remote frontend build passed.
- Native Rust unit suite: **158 passed, 0 failed**; compile includes privacy,
  quote ownership, attribution, numeric limits, memory isolation and new cases.
- `cargo check --tests --locked --manifest-path src-tauri/Cargo.toml`: passed.
- TypeScript and frontend production build: passed; Vite reports its existing
  large-chunk advisory. Three pre-existing Rust test warnings concern
  `gemini.rs`, `file_attachments.rs`, and `notion.rs`.
- One real SearXNG probe of the repository query returned **36 results**:
  10 Bing and 26 Brave. Nine generic Bing pages preceded the exact repository
  at position 10. This directly reproduced the cutoff defect independently of
  the old report. Qwant reported access denied. No engine configuration changed.
- Eight local-only Qwen3.5:9B planner probes used the report's actual prompts
  (8192 context, temperature 0, output cap 380): #20 turn 2, #21 turn 1,
  #24 turns 1–2, #81 turns 1–2, #83 turns 2–3. Both informational follow-ups
  selected research; both repository turns selected the supplied URL; both
  biography turns preserved the person's name and empty credit roles; the
  opinion selected chat. These were planning probes, **not Live answer tests**.

## Remaining validation and limits

Run **Live ×1: 20,21,24,80,81,82,83** on the rebuilt Windows app and manually
inspect usefulness, source relevance, extraction, answer attribution and scope.
Do not automatically run all 83 scenarios. The provider probe and local planner
probes do not replace the native end-to-end run or desktop/phone smoke test.

The local planner can still invent or misunderstand task fields: one probe
proposed a numeric "one release" limit unsupported by an actual numerical user
requirement. The existing quoted-quantity gate rejects that limit. Qualitative
fit, aliases, memory scope, factual entailment, and negative claims still need
semantic judgment and Live review. Coverage indices are model-proposed bindings,
not independent proof of entailment. The older final-answer guard remains
lexical; this patch does **not** claim to solve every unsupported negative
conclusion from #83. Memory previews still do not test persistence/correction
through an isolated database lifecycle.

The pool is deliberately bounded; lexical source relevance may miss paraphrases
without a selected named subject. Provider relevance and availability remain
external variables. Compare latency and missed useful sources in the focused
rerun before expanding filters or adding inference stages. PR #91 remains draft;
P0 is not closed by these offline checks.
