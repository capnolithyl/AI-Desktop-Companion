# Notion personal knowledge library (experimental)

Mikan can discuss novels, chapters, character sheets, story bibles, and other text you choose to share from Notion. This is **read-only** and **local-first**: Notion is contacted when connecting, listing accessible pages, pressing **Sync now**, or when an explicitly requested complete-chapter read needs to recover missing scene relationships or manuscripts from Notion. Chat uses cached SQLite FTS5 excerpts and local Ollama, not a new cloud LLM.

## One-time setup (free)

1. Open Mikan's **Settings → Notion** (or type **/notion**).
2. Select **Notion integrations** to create an **internal integration** (name it Mikan).
3. Give it **Read content** capability. Write/insert/update permissions are not needed.
4. In Notion, open the pages you want her to read, such as **Charlotte Universe | Master Story Bible** and **Hollow Meridian: Album & Mythology Reference**. In each page's **••• → More → Connections → Add connections** (or **••• → Add connections**, depending on the UI), add your Mikan integration. Sharing a parent page allows reading its accessible children; some linked databases/pages may need their own sharing.
5. Copy the integration secret from Notion into Mikan's password field and click **Connect Notion**.
6. Toggle **All pages shared with Mikan** to index everything accessible to the integration, or leave it off and tick individual roots from the list. Then press **Sync now**.
7. Ask Mikan, for example, "What do you think about Charlotte's development in my book?", "Tell me about the Obsidian Garden" (if that is a synced page title), or "Read the entire Chapter Three and give me your thoughts."

### Changing scope

Grant or revoke page access in Notion at any time. In Mikan, press **Refresh page list** after sharing more pages, adjust the selected roots, and press **Sync now**. The "all pages" option means **every page explicitly shared with this integration**, not every page in your Notion account.

**Important:** Because this is an offline cache, removing a page's Notion permission will not delete an already cached copy until you sync again. To immediately purge all cached content, choose **Disconnect and delete local Notion cache**. In case of a network/API failure, sync preserves the previous complete cache instead of replacing it with partial data.

### Privacy and limitations

- The token is stored as a Windows **DPAPI current-user-encrypted** file under Mikan's app data, never in React localStorage, Git, SQLite, memory facts, or Ollama prompts. Token verification occurs against Notion's official API. Protect your Windows account and Notion token.
- Notion HTTPS API is used only for the owner's shared documents. The selected model processes retrieved excerpts through your configured Ollama endpoint. A remote browser chat connected to your **running desktop** shares this library because it shares the same chat pipeline, but Pocket's standalone Android app does not.
- Cached text is stored **unencrypted in the local SQLite database**. This matches Mikan's other local memories. Protect local backups and your Windows account. Disconnect removes cached Notion text, but does not securely overwrite SQLite pages or backups.
- Content is **untrusted reference data**, separate from Mikan's self-identity facts and from the owner's saved memories. Mikan should distinguish fictional characters from real-life people and mention which page supports plot details.
- The importer caches rich text, nested blocks, headings, tables, captions, child pages, database rows, and relevant database properties (including Purpose and Status). **Images and uploaded files are not downloaded**, and some Notion embed/synced-block structures may not be represented. FTS5 retrieval remains keyword-based, not embeddings; full books are never injected into a prompt at once.
- Chapter database entries may link separate Scene rows through their **Scenes** relation. A complete chapter read assembles the chapter and its linked scene manuscripts in order, then processes their text locally. If the offline cache has only chapter planning notes or missing scenes, Mikan makes one **owner-requested live Notion read** to recover the chapter's current Scenes relation and scene prose, ordered by each Scene's numeric Order field. This live manuscript is not added permanently to SQLite or personal memory. If the scenes are not shared with Mikan's integration, she reports the access problem rather than inventing content. Normal chat continues to use the manually synced cache.
- Long-chapter section summaries are fallible, so for exact phrasing or disputed details Mikan should consult original cached passages. Local chapter-reading notes persist only within the current running conversation, not the user's permanent memory.
- Sync is manual, with basic 429 rate-limit retry. A large library can take time. There is a 10,000-page and 100,000-block-per-page safety bound and a 24-level nested-block bound to prevent runaway syncs.
- Mikan attempts local retrieval when your current or recent conversation is about writing or a cached page title. She can also read a whole cached page on request. The cache only updates when you press Sync now, and binary file attachments, images and Notion comments are not currently included.

## Developer validation

Run:
```bash
node --experimental-strip-types --test src/notion-knowledge.test.mjs src/notion-reading.test.mjs
npm run build
cd src-tauri && cargo test --lib notion
```

Also test manually on Windows with a **throwaway integration** and a few nested pages. Confirm token entry never appears in a saved conversation or browser settings; sync with selected roots and all shared; verify a paragraph and nested child page can be recalled; revoke sharing and re-sync; disconnect; restart; and ask about a public subject to confirm public web research is still unaffected.

Notion API is version-pinned to `2025-09-03`. API reference: https://developers.notion.com/reference. No SDK or separate Notion server is required.

## Linked chapter scenes

Mikan can answer questions such as **“Can you see the scenes for Chapter 1?”** by inspecting the chapter's **Scenes** relation. She lists the actual related scene titles in manuscript order without requesting that you paste individual titles. Questions like **“Read those scenes”** or **“What happens in those scenes?”** trigger the full chapter-reading pipeline, including the linked scene prose and bounded local notes. A stale or incomplete cached relation triggers an owner-requested live, read-only Notion fetch; this does not permanently store the fetched manuscript. If that fetch fails, check that the chapter and the **Scenes** database are shared with Mikan's own Notion integration token, not merely another Notion connection.


## Source-grounded manuscript review (v0.8.40)

`Chapter 02 · North` and similar chapter pages usually contain editorial planning notes separate from approved scene manuscripts. Full chapter review now follows the chapter's `Scenes` relation and extracts only each scene's `## Approved manuscript prose` block, stopping at the next major Markdown heading. The chapter page's planning/research text is not treated as fiction. Missing approved prose fails explicitly instead of inventing a plot.

With the usual 16K context window, original scene prose is sent to the final model directly when it fits the reserved prompt budget. Large chapters are summarized locally scene by scene with original excerpts and clear model-note provenance. Final critiques with unsupported quotes or conspicuous invented details are withheld; `Notion retrieval` in the debug log reports source mode, approved prose character count and grounding counts without including the manuscript or raw notes. Grounding checks are conservative, not a proof that every interpretive claim is correct. Public-web search stays disabled for private chapter reads.
