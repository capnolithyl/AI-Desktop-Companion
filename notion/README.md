# Notion personal knowledge library (experimental)

Mikan can discuss your novel, character sheets, story bible, and other documents that you choose to share from Notion. This is **read-only** and **local-first**: Notion is contacted only when connecting, listing accessible pages, or pressing **Sync now**. Chat uses cached SQLite FTS5 excerpts and local Ollama, not a new cloud LLM.

## One-time setup (free)

1. Open Mikan's **Settings → Notion** (or type **/notion**).
2. Select **Notion integrations** to create an **internal integration** (name it Mikan).
3. Give it **Read content** capability. Write/insert/update permissions are not needed.
4. In Notion, open the pages you want her to read, such as **Charlotte Universe | Master Story Bible** and **Hollow Meridian: Album & Mythology Reference**. In each page's **••• → More → Connections → Add connections** (or **••• → Add connections**, depending on the UI), add your Mikan integration. Sharing a parent page allows reading its accessible children; some linked databases/pages may need their own sharing.
5. Copy the integration secret from Notion into Mikan's password field and click **Connect Notion**.
6. Toggle **All pages shared with Mikan** to index everything accessible to the integration, or leave it off and tick individual roots from the list. Then press **Sync now**.
7. Ask Mikan, for example, "What do you think about Charlotte's development in my book?" or "How does Hollow Meridian mythology fit the story?"

### Changing scope

Grant or revoke page access in Notion at any time. In Mikan, press **Refresh page list** after sharing more pages, adjust the selected roots, and press **Sync now**. The "all pages" option means **every page explicitly shared with this integration**, not every page in your Notion account.

**Important:** Because this is an offline cache, removing a page's Notion permission will not delete an already cached copy until you sync again. To immediately purge all cached content, choose **Disconnect and delete local Notion cache**. In case of a network/API failure, sync preserves the previous complete cache instead of replacing it with partial data.

### Privacy and limitations

- The token is stored as a Windows **DPAPI current-user-encrypted** file under Mikan's app data, never in React localStorage, Git, SQLite, memory facts, or Ollama prompts. Token verification occurs against Notion's official API. Protect your Windows account and Notion token.
- Notion HTTPS API is used only for the owner's shared documents. The selected model processes retrieved excerpts through your configured Ollama endpoint. A remote browser chat connected to your **running desktop** shares this library because it shares the same chat pipeline, but Pocket's standalone Android app does not.
- Cached text is stored **unencrypted in the local SQLite database**. This matches Mikan's other local memories. Protect local backups and your Windows account. Disconnect removes cached Notion text, but does not securely overwrite SQLite pages or backups.
- Content is **untrusted reference data**, separate from Mikan's self-identity facts and from the owner's saved memories. Mikan should distinguish fictional characters from real-life people and mention which page supports plot details.
- Current extraction handles rich text, nested blocks, headings, tables, captions, child pages, and Notion database rows; **images and uploaded files are not downloaded**, and some Notion embed/synced-block structures may not be represented. The per-query FTS5 retrieval is keyword-based, not embeddings. The full book is never injected into the prompt at once.
- Sync is manual, with basic 429 rate-limit retry. A large library can take time. There is a 10,000-page and 100,000-block-per-page safety bound and a 24-level nested-block bound to prevent runaway syncs.
- Ask Mikan direct questions about your book, notes, Charlotte or Hollow Meridian to trigger on-demand local retrieval. Vague follow-ups work when the recent chat still indicates a writing topic. This initial version does not run a general-purpose agentic search of Notion.

## Developer validation

Run:
```bash
node --experimental-strip-types --test src/notion-knowledge.test.mjs
npm run build
cd src-tauri && cargo test --lib notion
```

Also test manually on Windows with a **throwaway integration** and a few nested pages. Confirm token entry never appears in a saved conversation or browser settings; sync with selected roots and all shared; verify a paragraph and nested child page can be recalled; revoke sharing and re-sync; disconnect; restart; and ask about a public subject to confirm public web research is still unaffected.

Notion API is version-pinned to `2025-09-03`. API reference: https://developers.notion.com/reference. No SDK or separate Notion server is required.
