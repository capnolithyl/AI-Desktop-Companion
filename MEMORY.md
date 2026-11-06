# Mikan memory foundation (first layer)

The core conversation/user memory layer shipped in v0.6.0 and manually maintained Mikan character canon in v0.7.0. **Automatic extraction is being developed on a separate PR and has not been merged or released yet.**

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

Saved memories are *reference facts*, not extra instructions or model training. On the automatic-extraction branch, some facts can now be added after completed replies, with source quote validation and explicit user switches. Mikan must not claim that it knows old chats or facts it has not actually retrieved. Old chat archives are browsable, but global semantic search across all chats is **future work**.

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


## Automatic retention (feature branch, not released)

- Automatic **About you** and **About Mikan** switches appear separately in the Memory panel. Both default on when the feature ships. Each can be disabled independently; manual `/remember`, `/canon-set` and edit/delete always remain available.
- After a **successfully completed** assistant response, the app queues an optional, separate `/api/chat` request to the **same locally installed Ollama model** with structured JSON output. It never sends memories to a remote service, never uses web search for extraction, and does not delay the visible reply.
- A lightweight guard skips extraction when the user did not report anything about themselves or ask a direct question about Mikan's preferences. The model can return zero facts. It sees only the recent user message, Mikan's matching reply when relevant, and a small duplicate-prevention sample of stored facts.
- Every automatic candidate must identify a short verbatim evidence substring from the correct speaker. Before insertion, the backend checks that quote against the actual message archived in SQLite; limits content length and categories, excludes common sensitive topics/credentials, and requires overlapping content words. An unsupported proposal is discarded. This is a useful filter, not a perfect guarantee of factual accuracy, so the Memory inspector remains the place to correct mistakes.
- User facts must be written as **"The user ..."**, not attributed to Mikan. Mikan's canon uses the existing persona-specific keyed table and never overwrites an existing key. Exact duplicate user facts and character keys are skipped.
- Auto-added records have a source-message reference and captured timestamp in `automatic_memory_sources`. The extractor tracks completed assistant-turn IDs in `automatic_memory_runs` so retrying the same turn is idempotent.
- If the user deletes the source conversation, the saved memory itself remains until deliberately deleted, while its source-message reference is cleared. This preserves the no-automatic-deletion policy.
- Extraction adds an extra local inference request per eligible completed turn. It runs separately from the visible reply but uses some GPU resources. If Ollama is unavailable or Mikan is fully quit immediately, the turn may not be processed; the chat transcript is still saved.
- No global cross-chat search, semantic deduplication, sophisticated time-aware status resolution or autonomous rewriting of established facts yet. Those remain planned.

### Practical smoke tests

1. Enable both automatic toggles, say `I love black metal`, wait for Mikan to finish, then open **About you**; expect a saved third-person memory. Restart Mikan; it should remain.
2. Ask `What's your favorite color?` with no preexisting canon. Mikan should give a specific answer. Open **About Mikan** and verify a matching "Favorite color" is saved after the extraction finishes. Restart and ask again; it should answer consistently.
3. Set Favorite color to Blue manually, ask again. Mikan should say Blue and automatic extraction should **not** overwrite it.
4. Talk about an unrelated factual question or joke and confirm no permanent memory gets added. Talk about sensitive health or credentials and confirm nothing automatic is saved.
5. Turn automatic capture off for one or both categories, then repeat. No new automatic memories should appear; manual controls still work.
6. Stop Ollama during extraction. Existing chat, saved memory and manual controls remain functional; the Memory panel should show a nonfatal extraction warning.
7. Confirm saving a duplicate and replaying an already-processed message do not produce duplicate entries. A full app restart must preserve earlier memories.
