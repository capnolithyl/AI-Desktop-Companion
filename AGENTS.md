# Mikan development principles

## Model-first language understanding

Owner directive (2026-11-24): use as little regex and conditional language-routing logic as possible, across all Mikan runtimes and future features. Prefer the LLM for intent, meaning, scope, context, ambiguity, humor, relevance, planning, memory decisions, classification and tool selection. Supply the model with clear instructions, relevant bounded evidence and a small typed result contract. Let it return no-op when nothing should happen.

Do not add keyword gates, phrase-specific exceptions, regex classifiers, hardcoded topic trees or expanding if/else chains to compensate for a semantic failure. Reproduce failures with regression scenarios; improve the shared prompt, model selection, context or contract first. Keep model decisions observable and compare actual model outputs in Brain Lab where appropriate. Do not claim mocked outputs validate a live model.

Deterministic code still owns authentication, consent, privacy boundaries, schema/type checking, exact source-quote validation, retrieval/indexing, ID and duplicate checks, permissions, transaction integrity, resource limits, rate limits and safe execution. Use straightforward deterministic logic for tasks that do not require language understanding. Keep model-generated proposals separate from trusted data/actions; never execute arbitrary model code or silently overwrite owner records. Review exceptions explicitly instead of adding hidden linguistic heuristics. Avoid broad rewrites of unrelated code without tests; migrate existing semantic heuristics incrementally.

## Workflow

GitHub is implementation source of truth; Trello tracks work. Inspect current code before changes, keep the NAS experiment isolated until tested, preserve user data and credentials, and prefer shared runtime-independent modules over duplicate UI or semantic policy.
