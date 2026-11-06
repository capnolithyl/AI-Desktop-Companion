# Mikan memory foundation (first layer)

The core conversation/user memory layer was introduced in v0.6.0. A separate character-canon layer is being developed on a new feature branch and is **not yet merged or released**.

## What is stored

- **Conversation archive:** Each chat has a unique ID, automatically generated title from the first user message, timestamps, and saved user/assistant turns. Assistant message metadata (performance and search sources where present) is stored with the message.
- **User facts:** Explicitly saved statements about the user, such as "I like black metal" or "I work with WordPress." Each fact can be reviewed, edited or deleted.
- **Mikan character canon (in this feature branch):** Manually established facts about Mikan herself, stored in a separate `character_facts` table by `persona_id`. Her own favorite music does not become the user's favorite music and vice versa. Existing webpage knowledge remains independent.

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

The explicit memories are *reference facts*, not extra instructions or model training. They are not extracted automatically in this version, and Mikan must not claim that it knows old chats or facts it has not actually retrieved. Old chat archives are browsable, but global semantic search across all chats is **future work**.

## Next memory layers

1. Optional automatic candidate extraction with review and deduplication; no silent saving of sensitive data.
2. SQLite full-text search for recall across archived conversations, relevance and source/date tracking.
3. **In progress on a separate branch:** Editable persona-specific character canon, separate from user memory and knowledge documents. Automatic character-fact extraction is a later step.
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

There is **no automatic extraction** from Mikan's chat responses in this version: the owner deliberately adds or changes character canon. Existing persona/system-prompt prose remains the core identity source. SQLite is local and not encrypted.
