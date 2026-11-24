import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

// Compatible with desktop Mikan's core SQLite tables. Never delete or rebuild imported tables.
export function openStore(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON;
    PRAGMA journal_mode=WAL;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT 'New conversation',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL, created_at INTEGER NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id,created_at,id);
    CREATE TABLE IF NOT EXISTS user_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fact TEXT NOT NULL COLLATE NOCASE UNIQUE,
      category TEXT NOT NULL DEFAULT 'other',
      tags_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );`);

  function hasTable(name) {
    return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
  }
  function conversations() {
    return db.prepare("SELECT id,title,updated_at AS updatedAt FROM conversations ORDER BY updated_at DESC LIMIT 100").all();
  }
  function newConversation() {
    const id = randomUUID(), now = Math.floor(Date.now() / 1000);
    db.prepare("INSERT INTO conversations(id,title,created_at,updated_at) VALUES(?,?,?,?)")
      .run(id, "New conversation", now, now);
    return { id, title: "New conversation", updatedAt: now };
  }
  function exists(id) {
    return !!db.prepare("SELECT 1 FROM conversations WHERE id=?").get(id);
  }
  function messages(id, limit = 80) {
    if (!exists(id)) return null;
    return db.prepare(`SELECT id,role,content,created_at AS createdAt FROM
       (SELECT id,role,content,created_at FROM messages WHERE conversation_id=?
        ORDER BY created_at DESC,rowid DESC LIMIT ?) ORDER BY created_at ASC`)
      .all(id, limit);
  }
  function append(id, role, content) {
    if (!exists(id)) throw new Error("Conversation not found");
    const message = { id:randomUUID(), role, content, createdAt:Date.now() };
    db.prepare(`INSERT INTO messages
      (id,conversation_id,role,content,created_at,metadata_json) VALUES(?,?,?,?,?,'{}')`)
      .run(message.id,id,role,content,message.createdAt);
    db.prepare(`UPDATE conversations SET title=CASE WHEN title='New conversation' AND ?='user'
      THEN substr(?,1,70) ELSE title END,updated_at=? WHERE id=?`)
      .run(role,content,Math.floor(Date.now()/1000),id);
    return message;
  }
  function listMemories(limit = 200) {
    return db.prepare("SELECT id,fact,category,updated_at AS updatedAt FROM user_memories ORDER BY updated_at DESC LIMIT ?").all(limit);
  }
  function addMemory(fact) {
    const trimmed = fact.trim();
    if (!trimmed || trimmed.length > 800) throw new Error("Memory must be 1-800 characters");
    db.prepare(`INSERT INTO user_memories(fact,category,updated_at)
      VALUES(?,'other',unixepoch()) ON CONFLICT(fact) DO UPDATE SET updated_at=unixepoch()`).run(trimmed);
  }
  function removeMemory(id) {
    return db.prepare("DELETE FROM user_memories WHERE id=?").run(id).changes > 0;
  }
  return { db, hasTable, conversations, newConversation, exists, messages, append, listMemories, addMemory, removeMemory };
}

// Lexical recall first. Existing FTS5 and optional Qdrant remain intact for a later integration.
const stop = new Set(["that","this","with","from","what","when","where","which","would","could","should","about","have","there","they","them","your","mine","their","please","just","want","know","does","were","been","into","much","more","some","will","then","than","make","tell"]);
const words = text => new Set(String(text).toLowerCase().match(/[a-z0-9äöüß]{4,}/g)?.filter(x=>!stop.has(x)) ?? []);
function ranking(text, terms) {
  const hay = String(text).toLowerCase();
  let score = 0;
  for (const word of terms) if (hay.includes(word)) score += word.length > 6 ? 3 : 2;
  return score;
}
export function recall(store, question) {
  const terms = words(question);
  if (!terms.size) return [];
  const rows = store.db.prepare("SELECT fact AS text FROM user_memories ORDER BY updated_at DESC LIMIT 3000").all();
  if (store.hasTable("character_facts")) {
    rows.push(...store.db.prepare("SELECT label || ': ' || value AS text FROM character_facts ORDER BY updated_at DESC LIMIT 600").all());
  }
  if (store.hasTable("interest_items")) {
    rows.push(...store.db.prepare(`SELECT name || ' (' || kind || ', ' || status || ')' ||
      CASE WHEN notes <> '' THEN ': ' || substr(notes,1,220) ELSE '' END AS text
      FROM interest_items ORDER BY updated_at DESC LIMIT 1200`).all());
  }
  return rows.map(row=>({text:row.text,score:ranking(row.text,terms)}))
    .filter(row=>row.score>0)
    .sort((a,b)=>b.score-a.score)
    .slice(0,16).map(row=>row.text);
}
