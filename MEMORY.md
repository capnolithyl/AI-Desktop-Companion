# Mikan memory foundation (first layer)

## v0.8.18: bulk personal memories, categories and tags

In **Memory → About you → Bulk import memories**, paste one fact per line or open a TXT, Markdown, CSV or JSON file (1 MB maximum, 1000 facts per batch, 2000 total stored facts). A preview lets you skip rows, review suggested categories and tags, set category per row or across the batch, and optionally pin facts. The original file remains on your PC; no online parsing or model calls are made. Invalid input rejects the entire batch; duplicates are skipped and never overwrite existing text, metadata or pins.

Accepted JSON: an array of strings, an array of objects with fact/category/tags/pinned, or an object containing a memories/facts array. CSV needs a fact (or text/memory/content) column and may have category, tags (comma/semicolon-separated) and pinned columns. Markdown headings matching known categories group subsequent bullet or numbered lines; other lines are automatically given rule-based suggested labels. The preview is authoritative, not the suggestion rules.

Categories: profile, family, work, projects, interests, preferences, routines, other. Each user fact can have up to 8 owner-editable tags (32 characters each). Existing facts receive other/[] through a non-destructive SQLite migration. Facts can be filtered by category, text or tags and edited under **Organize**. Retrieval uses category/tag overlap alongside semantic similarity and importance, without blindly loading all memories into the prompt. Optional Mem0 indexes SQLite facts with labels in the background; when indexing is incomplete, SQLite lexical/tag retrieval still functions. Mikan's self-canon, history and imported reference knowledge are unaffected.


The core conversation/user memory layer shipped in v0.6.0, Mikan character canon in v0.7.0, and optional automatic extraction plus SQLite FTS5/semantic memory now ship on desktop. This document includes historical design notes below; the v0.8.10 behavior is summarized here.

## v0.8.10: relevance and durability

- Auto-extraction labels each suggested user fact as **long_term**, **session**, or **project**. Only long_term claims enter the permanent personal-fact table; short-lived chat/testing and engineering updates remain in dated conversation history and session/project records. A source-grounded native guard also rejects obvious temporary activity mistakenly classified as lasting.
- Existing personal facts are preserved without rewriting or deleting them. Legacy one-off testing/debugging/toggle snapshots older than a week are omitted from routine profile recall, but remain browsable and may be retrieved for explicitly historical questions. An owner-pinned entry is always eligible.
- Unrelated personal facts are no longer inserted just to use unused prompt budget. Semantic matches, topical keyword overlap and owner-pinned facts still work. Recalled profile entries carry their saved date and are not evidence of the current status of projects.
- The model is reminded that a preference is **not** external knowledge: liking black metal cannot establish a band's genre, nor does working in software imply every conversation should be about coding. Live Vision and style guidance avoid repeating already acknowledged screen contents and conversational topics. The assistant's warmth and expressive persona remain intact.
- The full chat archive, sessions and memories are **never automatically deleted or purged by age**. Everything stays on the local PC unless the owner removes it. The seven-day rule changes what is **used as current context**, not what is stored.

## What is stored

- **Conversation archive:** Each chat has a unique ID, automatically generated title from the first user message, timestamps, and saved user/assistant turns. Assistant message metadata (performance and search sources where present) is stored with the message.
- **User facts:** Explicitly saved statements about the user, such as "I like black metal" or "I work with WordPress." Each fact can be reviewed, edited or deleted.
- **Mikan character canon:** Manually established facts about Mikan herself, stored in a separate `character_facts` table by `persona_id`. Her own favorite music does not become the user's favorite music and vice versa. Existing webpage knowledge remains independent.

Everything is stored on disk in a SQLite database called `mikan-memory.sqlite3` under the Tauri **app-data directory** for `dev.capnolithyl.mikan`. No cloud account or remote database is used. The database is **not encrypted**; local Windows account permissions still matter.

## Using it

- Click the brain icon in the chat header or type `/memories` to review saved facts.
- Type `/remember I enjoy tactical RPGs` to save a fact explicitly.
- Select **Chats** in Memory, or type `/chats`, to reopen old conversations.
- `/new` starts a fresh conversation without deleting previous ones.
- Delete chats or facts from the Memory drawer. Deleting a chat permanently removes its saved messages; it does **not** remove separately saved facts.
- `/forget <numeric ID>` deletes a saved **user** fact by its identifier.
- `/canon` or `/mikan-memories` opens Mikan's separate self-identity editor. The **About Mikan** tab lets you manually add, edit, and delete categorized details (favorites, likes, dislikes, hobbies, quirks/traits, and other).
- `/canon-set favorite color: orange` explicitly saves an established preference about Mikan. `/canon-forget <ID>` deletes that saved character detail. Character details are unique by label per persona, so duplicates require editing the original instead.
- The app loads Mikan's canon on startup and supplies a compact, separately attributed set of these facts to the model. Editing canon affects future turns, not prior saved replies.

The app restores the most recently updated conversation on startup. The current conversation's most recent 32 turns and a compact selection of explicitly saved facts are available when composing the next local LLM request.

Saved memories are *reference facts*, not extra instructions or model training. Optional automatic extraction after completed turns requires actual source-message evidence and can be disabled. SQLite FTS5 indexes the locally archived user-authored messages; the optional Mem0/Qdrant sidecar ranks saved user facts. Mikan must not claim it has retrieved a memory or checked a page it did not access.

## Next memory layers

1. **In development:** Optional automatic extraction and exact-duplicate protection, with conservative sensitive-data filtering. Owner-visible editing/deletion remains available; review queue and stronger semantic deduplication are future enhancements.
2. SQLite full-text search for recall across archived conversations, relevance and source/date tracking.
3. **Shipped v0.7.0:** Editable persona-specific character canon, separate from user memory and knowledge documents. **In development:** First automatic capture of Mikan's own explicitly stated preferences after the user asks about them.
4. Memory retention, export/backup and more granular privacy controls.

## Testing

CI should run `npm run build` and `cargo test --lib`, then the Tauri Windows build. Suggested manual smoke test: remember a fact, send a message, quit the app, restart, verify the conversation and fact persist, then delete both and confirm they no longer appear or enter prompts.


## Character canon acceptance testing (feature branch)

1. From `/canon`, add **Favorite color = Orange** under Favorites.
2. Ask Mikan her favorite color. She should answer orange, not the user's favorite color.
3. Use `/remember The user loves black metal`. Ask for her own favorite music and confirm the user's saved preference is not presented as hers.
4. Quit and restart Mikan, ask again, and verify her saved favorite color persists.
5. Set personality sliders to different presets, ask again, and verify canon remains unchanged.
6. Edit Favorite color to Blue in About Mikan, then ask again; she should answer blue.
7. Delete that canon entry and confirm the app does not present it as a fixed established fact.
8. Check that deleting an old chat or user memory does not remove Mikan's stored self-facts.

On the automatic-extraction branch, Mikan's explicit stable preferences may be saved from her answers when enabled. Existing persona/system-prompt prose remains her core identity, and automatic extraction never overwrites established canon. SQLite remains local and unencrypted.


## Automatic retention (desktop implementation)

- Automatic **About you** and **About Mikan** switches appear separately in the Memory panel. Both default on when the feature ships. Each can be disabled independently; manual `/remember`, `/canon-set` and edit/delete always remain available.
- After a **successfully completed** assistant response, the app queues an optional, separate `/api/chat` request to the **same locally installed Ollama model** with structured JSON output. It never sends memories to a remote service, never uses web search for extraction, and does not delay the visible reply.
- A lightweight guard skips extraction when the user did not report anything about themselves or ask a direct question about Mikan's preferences. The model can return zero facts. It sees only the recent user message, Mikan's matching reply when relevant, and a small duplicate-prevention sample of stored facts.
- Every automatic candidate must identify a short verbatim evidence substring from the correct speaker. Before insertion, the backend checks that quote against the actual message archived in SQLite; limits content length and categories, excludes common sensitive topics/credentials, and requires overlapping content words. An unsupported proposal is discarded. This is a useful filter, not a perfect guarantee of factual accuracy, so the Memory inspector remains the place to correct mistakes.
- User facts must be written as **"The user ..."**, not attributed to Mikan. Mikan's canon uses the existing persona-specific keyed table and never overwrites an existing key. Exact duplicate user facts and character keys are skipped.
- Auto-added records have a source-message reference and captured timestamp in `automatic_memory_sources`. The extractor tracks completed assistant-turn IDs in `automatic_memory_runs` so retrying the same turn is idempotent.
- If the user deletes the source conversation, the saved memory itself remains until deliberately deleted, while its source-message reference is cleared. This preserves the no-automatic-deletion policy.
- Extraction adds an extra local inference request per eligible completed turn. It runs separately from the visible reply but uses some GPU resources. If Ollama is unavailable or Mikan is fully quit immediately, the turn may not be processed; the chat transcript is still saved.
- Search across old user-authored conversations uses SQLite FTS5 and optional semantic ranking of curated facts uses Mem0/Qdrant. Full temporal supersession of ongoing projects, rich provenance UI, and semantic deduplication remain future improvements.

### Practical smoke tests

1. Enable both automatic toggles, say `I love black metal`, wait for Mikan to finish, then open **About you**; expect a saved third-person memory. Restart Mikan; it should remain.
2. Ask `What's your favorite color?` with no preexisting canon. Mikan should give a specific answer. Open **About Mikan** and verify a matching "Favorite color" is saved after the extraction finishes. Restart and ask again; it should answer consistently.
3. Set Favorite color to Blue manually, ask again. Mikan should say Blue and automatic extraction should **not** overwrite it.
4. Talk about an unrelated factual question or joke and confirm no permanent memory gets added. Talk about sensitive health or credentials and confirm nothing automatic is saved.
5. Turn automatic capture off for one or both categories, then repeat. No new automatic memories should appear; manual controls still work.
6. Stop Ollama during extraction. Existing chat, saved memory and manual controls remain functional; the Memory panel should show a nonfatal extraction warning.
7. Confirm saving a duplicate and replaying an already-processed message do not produce duplicate entries. A full app restart must preserve earlier memories.
