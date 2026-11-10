import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, ExternalLink, LoaderCircle, RotateCw } from "lucide-react";

type Status = {
  connected: boolean;
  allPages: boolean;
  pages: number;
  chunks: number;
  lastSynced: number | null;
};
type Page = {
  id: string;
  title: string;
  url: string;
  selected: boolean;
  lastEdited: string;
};

function describeError(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

export function NotionPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [token, setToken] = useState("");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await invoke<Status>("notion_status");
      setStatus(next);
      setPages(next.connected ? await invoke<Page[]>("notion_list_pages") : []);
    } catch (reason) {
      setError(describeError(reason));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const visible = useMemo(() => pages.filter(page =>
    page.title.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase())
  ), [pages,filter]);

  async function connect() {
    setBusy(true); setError(null); setMessage(null);
    try {
      const next = await invoke<Status>("notion_connect", {token});
      setToken("");
      setStatus(next);
      setPages(await invoke<Page[]>("notion_list_pages"));
      setMessage("Connected. Choose pages, then sync.");
    } catch (reason) { setError(describeError(reason)); }
    finally { setBusy(false); }
  }

  async function setAll(enabled: boolean) {
    setBusy(true); setError(null);
    try { setStatus(await invoke<Status>("notion_set_all",{enabled})); }
    catch (reason) { setError(describeError(reason)); }
    finally { setBusy(false); }
  }

  async function select(page: Page, selected: boolean) {
    setBusy(true); setError(null);
    try {
      await invoke("notion_select_page",{id:page.id,selected});
      setPages(current => current.map(entry => entry.id===page.id ? {...entry,selected} : entry));
    } catch (reason) { setError(describeError(reason)); }
    finally { setBusy(false); }
  }

  async function sync() {
    setBusy(true); setError(null); setMessage(null);
    try {
      setStatus(await invoke<Status>("notion_sync"));
      setMessage("Library synced. Mikan can now retrieve these pages in chat.");
    } catch (reason) { setError(describeError(reason)); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Notion and delete all of Mikan's cached Notion pages?")) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      setStatus(await invoke<Status>("notion_disconnect"));
      setPages([]); setToken("");
    } catch (reason) { setError(describeError(reason)); }
    finally { setBusy(false); }
  }

  return <div className="notion-panel">
    <div className="settings-section-title">Notion · personal knowledge library</div>
    <div className="settings-note">
      Mikan reads only pages shared with her Notion integration. Your book and character notes
      are searchable reference knowledge, separate from conversation memory.
      Sync is manual for now; the last successful copy remains available offline. Ask Mikan to read a named chapter to scan its complete cached text, or discuss your writing naturally for relevant excerpts.
    </div>
    {!status?.connected ? <>
      <div className="service-panel">
        <strong>Connect a free Notion integration</strong>
        <small>Create an internal integration with Read content capability, then grant it access
          from your chosen Notion pages (••• → Connections). You can share more later.</small>
        <button type="button" className="inline-action"
          onClick={()=>void openUrl("https://www.notion.so/profile/integrations")}>
          <ExternalLink size={14}/> Notion integrations
        </button>
        <label className="setting-field">Integration secret
          <input type="password" autoComplete="off" spellCheck={false}
            value={token} onChange={event=>setToken(event.target.value)}
            placeholder="Paste Notion internal integration token"/>
          <small>Encrypted with Windows DPAPI under your Windows user. Not stored in browser settings, chat messages or GitHub.</small>
        </label>
        <button type="button" className="secondary-action" onClick={()=>void connect()}
          disabled={busy||!token.trim()}>
          {busy?<LoaderCircle size={14} className="spin"/>:<Check size={14}/>} Connect Notion
        </button>
      </div>
    </> : <>
      <div className="service-panel">
        <strong>Notion connected · read only</strong>
        <small>{status.pages} cached pages · {status.chunks} searchable excerpts
          {status.lastSynced ? " · synced " + new Date(status.lastSynced*1000).toLocaleString() : " · not synced yet"}</small>
        <label className="settings-toggle">
          <input type="checkbox" checked={status.allPages} disabled={busy}
            onChange={event=>void setAll(event.target.checked)}/>
          <span><strong>All pages shared with Mikan</strong>
            <small>Index every accessible page and its nested content. Sharing additional pages in Notion expands access on the next sync.</small>
          </span>
        </label>
        <small>Or turn this off and select specific pages below. Child pages are included automatically.</small>
      </div>
      <div className="service-panel">
        <div className="service-buttons">
          <button type="button" className="secondary-action" disabled={busy} onClick={()=>void sync()}>
            {busy?<LoaderCircle size={14} className="spin"/>:<RotateCw size={14}/>} Sync now
          </button>
          <button type="button" className="secondary-action" disabled={busy} onClick={()=>void refresh()}>
            Refresh page list
          </button>
        </div>
        <label className="setting-field">Find accessible pages
          <input value={filter} spellCheck={false} placeholder="Charlotte, Hollow Meridian, chapters…"
            onChange={event=>setFilter(event.target.value)}/>
        </label>
        <div style={{maxHeight:280, overflowY:"auto"}}>
          {visible.map(page=><label key={page.id} className="settings-toggle">
            <input type="checkbox" checked={status.allPages || page.selected}
              disabled={busy || status.allPages}
              onChange={event=>void select(page,event.target.checked)}/>
            <span><strong>{page.title}</strong>
              <small>{page.lastEdited ? "Edited " + new Date(page.lastEdited).toLocaleDateString() : "Accessible page"}</small>
            </span>
          </label>)}
          {!visible.length && <small>No accessible pages match. In Notion, share the page with the Mikan integration, then refresh.</small>}
        </div>
        <small>Full text of shared pages is cached in sections, including headings, table cells and captions. You can discuss a named page or have Mikan read the complete chapter. Images and embedded attachments are not imported.</small>
      </div>
      <button type="button" className="secondary-action" disabled={busy}
        onClick={()=>void disconnect()}>Disconnect and delete local Notion cache</button>
    </>}
    {error && <small className="field-error" role="alert">{error}</small>}
    {message && <small className="service-running" role="status">{message}</small>}
  </div>;
}
