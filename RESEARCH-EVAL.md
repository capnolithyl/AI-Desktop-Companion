# Mikan research: Structured evidence experiment

This uses simple prompt chaining, source quotes, and tests inspired by Anthropic's Building Effective Agents, LlamaIndex citations, and Ragas faithfulness metrics. It adds no new dependencies.

## Flow

1. Ordinary conversation remains unchanged. An explicit new automatic research request retrieves SearXNG results, potentially enriched by relevant public HTTPS pages.
2. With Experimental source-anchored research enabled in Settings → Internet, Qwen makes an additional local, schema-constrained non-streaming JSON call. It proposes up to six source-numbered facts with quotes.
3. Rust checks each source number, quote substring, subject in quote, numeric anchors, and duplicates. The exact quote is source-matched; the candidate's interpretation is NOT semantically proven.
4. Mikan receives both original excerpts and the candidate notes in lower-trust user-level research data, then streams her conversational response. If extraction fails or returns no matching quotes, she falls back to the original excerpts.
5. The /log view and Copy debug log show accepted/rejected candidate counts and extraction latency. The toggle makes A/B comparison straightforward.

Only **newly fetched automatic research** uses the extra call. Manually pasted /search results and prediction follow-ups with carried source data stay on the baseline path. This is a first experiment, not a complete semantic entailment verifier.

## How to evaluate

Repeat the same question in a fresh conversation with the experimental setting OFF and ON. Compare logs for citation accuracy, source relevance, correctly distinguished entities/stages, dates and qualifiers, hedging, personality, and first-token time.

Try different areas: science milestones, music album plans versus release dates, software beta versus stable releases, history dates, observational health studies, revenues versus profit, sports schedules, politics (proposal versus enacted law), streaming announcements, product specs, and ambiguous proper names. Check factual answers against current dated primary sources rather than relying on test fixture text.

Offline Rust tests include 20 cross-domain quote-validation cases in tests/research-cases.json. Those fixtures exercise deterministic validation; they do **not** measure natural-language model accuracy. Any future claim-level entailment checker needs its own separate evaluation.

References:
- https://www.anthropic.com/research/building-effective-agents
- https://docs.ollama.com/capabilities/structured-outputs
- https://developers.llamaindex.ai/python/framework-api-reference/query_engine/citation/
- https://docs.ragas.io/en/latest/concepts/metrics/available_metrics/faithfulness/


## v0.8.23: autonomous public lookup and soft preferred sources

The desktop's local Ollama memory selector now emits a combined memory/tool decision on eligible turns. It can suggest public web search for release verification, recommendations or unfamiliar entities even if the owner did not explicitly say "search". Existing deterministic public research routing remains authoritative. The settings toggle is opt-in and prevents all automatic online requests when off. Personal memory queries, Notion-focused chat, roleplay, screen images and uploaded files cannot be automatically sent to SearXNG. Queries are rejected if they contain obvious private identifiers, URLs or first-person pronouns; this is a best-effort privacy barrier, not a guarantee that arbitrary semantic secrets cannot be inferred.

Preferred sources are owner-editable topic/cue/domain records. A broad SearXNG lookup and one soft-priority domain search can run concurrently; nonpreferred sources remain eligible. Preferred-site membership is not proof a claim is correct: prefer actual primary evidence, date and source agreement. Debug logs distinguish AI web decisions from deterministic routing and expose public search queries.

Regression checks: generic music/game recommendations, ordinary chat and private memory prompts, local SearXNG down, source-topic inference, spoofed domain names, and missing/invalid local planner responses. Profile real GPU latency before raising concurrency: Ollama inference is intentionally serialized instead of forcing two simultaneous Qwen 9B GPU requests.

## v0.8.24: regressions from live owner QA

User tests found false Notion routing for ordinary metal album recommendations, hallucinated first-chapter contents, ungrounded product/release titles, persistent name vocatives due a pinned identity memory, and spoken physical action text. The current implementation tightens both Notion and web routing; a natural first-chapter review attempts a full cached read, otherwise responds with an explicit not-read limitation. Only self-identity questions retrieve name-only facts. Web evidence guidance checks named works and creator/platform/date consistency, and research freshness is propagated. A structural multiword action guard protects visible and spoken text without destroying ordinary Markdown italics. Research debug logs now show whether there was real retrieved evidence and why an automatic search was blocked.

Local manual validation after installing remains necessary; automated tests do not guarantee a 9B model won't hallucinate under different prompts, and the stage classifier intentionally favors preserving legitimate emphasis over deleting every italic phrase.

## v0.8.25: owner live-test follow-up

The latest owner logs showed generic recommendations still aborting web search because Qwen generated queries with private/first-person wording; the unified planner now strips only harmless recipient wording ("recommend me", "for me") and allows one local model retry through the same strict privacy validator. The blocked raw query is never sent to SearXNG. A personal exhaustion message wrongly triggered Notion due capitalized "Today"; sentence-opening capital words no longer count as named entities. Chapter 1's cached Notion page holds editorial planning notes while its actual manuscript is stored as linked Scenes database rows. A chapter read with outline-only content and no linked prose is now rejected, logged with linked-scene counts, and asks for a fresh Notion sync rather than claiming completion. Full chapter reads omit conflicting FTS snippets. The ordinary-chat narration guard now also rejects clearly fictional plain-prose physical action sentences, with regression coverage in streaming TTS. Plain prose buffering can slightly delay visible output until sentence boundaries; compare real first-sentence latency after installation.
