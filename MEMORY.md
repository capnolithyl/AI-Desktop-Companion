# Mikan memory foundation (first layer)

This feature is under development on a separate pull request. It has **not** been released or verified on the user's Windows machine yet.

## What is stored

- **Conversation archive:** Each chat has a unique ID, automatically generated title from the first user message, timestamps, and saved user/assistant turns. Assistant message metadata (performance and search sources where present) is stored with the message.
- **User facts:** Explicitly saved statements about the user, such as "I like black metal" or "I work with WordPress." Each fact can be reviewed, edited or deleted.
- **Separate categories:** Existing webpage caching remains separate. Mikan's own *character canon* is planned separately and does not belong in this first memory table.

Everything is stored on disk in a SQLite database called `mikan-memory.sqlite3` under the Tauri **app-data directory** for `dev.capnolithyl.mikan`. No cloud account or remote database is used. The database is **not encrypted**; local Windows account permissions still matter.

## Using it

- Click the brain icon in the chat header or type `/memories` to review saved facts.
- Type `/remember I enjoy tactical RPGs` to save a fact explicitly.
- Select **Chats** in Memory, or type `/chats`, to reopen old conversations.
- `/new` starts a fresh conversation without deleting previous ones.
- Delete chats or facts from the Memory drawer. Deleting a chat permanently removes its saved messages; it does **not** remove separately saved facts.
- `/forget <numeric ID>` deletes a saved user fact by its identifier.

The app restores the most recently updated conversation on startup. The current conversation's most recent 32 turns and a compact selection of explicitly saved facts are available when composing the next local LLM request.

The explicit memories are *reference facts*, not extra instructions or model training. They are not extracted automatically in this version, and Mikan must not claim that it knows old chats or facts it has not actually retrieved. Old chat archives are browsable, but global semantic search across all chats is **future work**.

## Next memory layers

1. Optional automatic candidate extraction with review and deduplication; no silent saving of sensitive data.
2. SQLite full-text search for recall across archived conversations, relevance and source/date tracking.
3. Editable persona-specific character canon, separated from user memory and knowledge documents.
4. Memory retention, export/backup and more granular privacy controls.

## Testing

CI should run `npm run build` and `cargo test --lib`, then the Tauri Windows build. Suggested manual smoke test: remember a fact, send a message, quit the app, restart, verify the conversation and fact persist, then delete both and confirm they no longer appear or enter prompts.
