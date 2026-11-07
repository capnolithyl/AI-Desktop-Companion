package dev.capnolithyl.mikan.pocket

import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/**
 * Android SQLite implementation of the Windows memory.rs schema and semantics.
 * SQLite is the source of truth; React localStorage is read only for migration.
 * User memories, Mikan's persona canon, and reference knowledge are distinct.
 */
class PocketMemoryStore(private val context: Context) :
    SQLiteOpenHelper(context, "mikan-memory.sqlite3", null, 1) {

    override fun onConfigure(db: SQLiteDatabase) {
        super.onConfigure(db)
        db.setForeignKeyConstraintsEnabled(true)
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL DEFAULT 'New conversation',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )""")
        db.execSQL("""CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK(role IN ('user','assistant')),
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}'
        )""")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at, id)")
        db.execSQL("""CREATE TABLE IF NOT EXISTS user_memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fact TEXT NOT NULL COLLATE NOCASE UNIQUE,
            created_at INTEGER NOT NULL DEFAULT (unixepoch()),
            updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        )""")
        db.execSQL("""CREATE TABLE IF NOT EXISTS character_facts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            persona_id TEXT NOT NULL,
            category TEXT NOT NULL CHECK(category IN ('favorites','likes','dislikes','hobbies','traits','other')),
            label TEXT NOT NULL,
            normalized_label TEXT NOT NULL,
            value TEXT NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (unixepoch()),
            updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
            UNIQUE(persona_id,normalized_label)
        )""")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_character_facts_persona ON character_facts(persona_id,category,updated_at)")
        db.execSQL("""CREATE TABLE IF NOT EXISTS automatic_memory_sources (
            memory_kind TEXT NOT NULL CHECK(memory_kind IN ('user','character')),
            memory_id INTEGER NOT NULL,
            source_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
            captured_at INTEGER NOT NULL DEFAULT (unixepoch()),
            evidence TEXT NOT NULL,
            PRIMARY KEY(memory_kind,memory_id)
        )""")
        db.execSQL("""CREATE TABLE IF NOT EXISTS automatic_memory_runs (
            assistant_message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
            processed_at INTEGER NOT NULL DEFAULT (unixepoch())
        )""")
        // Private migration bookkeeping, not a new competing memory model.
        db.execSQL("CREATE TABLE IF NOT EXISTS memory_migrations (key TEXT PRIMARY KEY, completed_at INTEGER NOT NULL DEFAULT (unixepoch()))")
    }

    // No destructive upgrades: future schema versions must use ALTER migrations.
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        error("Missing non-destructive memory migration from $oldVersion to $newVersion")
    }

    companion object {
        private val uuid = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
        private val persona = Regex("^[a-z0-9_-]{1,64}$")
        private val categories = setOf("favorites","likes","dislikes","hobbies","traits","other")
        fun normalize(value: String) = value.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.joinToString(" ")
        fun validId(value: String) = uuid.matches(value)
        fun cleanFact(value: String): String = normalize(value).also {
            require(it.isNotEmpty() && it.length <= 500) { "A memory must contain 1–500 characters" }
        }
        fun cleanLabel(value: String): String = normalize(value).also {
            require(it.isNotEmpty() && it.length <= 80) { "Character detail names must be 1–80 characters" }
        }
        fun cleanValue(value: String): String = normalize(value).also {
            require(it.isNotEmpty() && it.length <= 500) { "Character detail values must be 1–500 characters" }
        }
        fun validateCharacter(personaId: String, category: String) {
            require(persona.matches(personaId)) { "Invalid persona ID" }
            require(category in categories) { "Invalid character category" }
        }
    }

    private fun now() = System.currentTimeMillis() / 1000
    private fun Cursor.string(name: String) = getString(getColumnIndexOrThrow(name))
    private fun Cursor.number(name: String) = getLong(getColumnIndexOrThrow(name))
    private inline fun <T> query(db: SQLiteDatabase, sql: String, args: Array<String> = emptyArray(),
                                  block: (Cursor) -> T): List<T> {
        return db.rawQuery(sql, args).use { cursor ->
            buildList { while (cursor.moveToNext()) add(block(cursor)) }
        }
    }
    private fun userRow(c: Cursor) = JSONObject()
        .put("id", c.number("id")).put("fact", c.string("fact"))
        .put("createdAt", c.number("created_at")).put("updatedAt", c.number("updated_at"))

    private fun canonRow(c: Cursor) = JSONObject()
        .put("id", c.number("id")).put("personaId", c.string("persona_id"))
        .put("category", c.string("category")).put("label", c.string("label"))
        .put("value", c.string("value")).put("createdAt", c.number("created_at"))
        .put("updatedAt", c.number("updated_at"))

    private fun allFacts(db: SQLiteDatabase) = JSONArray().apply {
        query(db,"SELECT id,fact,created_at,updated_at FROM user_memories ORDER BY updated_at DESC,id DESC LIMIT 500") { userRow(it) }
            .forEach(::put)
    }
    private fun allCanon(db: SQLiteDatabase) = JSONArray().apply {
        query(db,"SELECT id,persona_id,category,label,value,created_at,updated_at FROM character_facts WHERE persona_id='mikan' ORDER BY category,label COLLATE NOCASE LIMIT 500") { canonRow(it) }
            .forEach(::put)
    }

    private fun allThreads(db: SQLiteDatabase) = JSONArray().apply {
        val conversations = query(db,
            "SELECT id,title,created_at,updated_at FROM conversations ORDER BY updated_at DESC LIMIT 200") { c ->
            JSONObject().put("id",c.string("id")).put("title",c.string("title"))
                .put("createdAt",c.number("created_at") * 1000)
        }
        conversations.forEach { conversation ->
            val id = conversation.getString("id")
            val messages = JSONArray()
            query(db, """SELECT id,role,content,created_at FROM messages WHERE conversation_id=?
                ORDER BY created_at ASC,rowid ASC LIMIT 10000""", arrayOf(id)) { c ->
                JSONObject().put("id",c.string("id")).put("role",c.string("role"))
                    .put("content",c.string("content")).put("createdAt",c.number("created_at"))
            }.forEach(messages::put)
            conversation.put("turns",messages)
            put(conversation)
        }
    }
    private fun snapshot(db: SQLiteDatabase) = JSONObject()
        .put("threads",allThreads(db)).put("facts",allFacts(db)).put("canon",allCanon(db))

    private fun insertConversation(db: SQLiteDatabase, id: String, title: String = "New conversation",
                                   created: Long = now()) {
        require(validId(id)) { "Invalid conversation ID" }
        db.execSQL("INSERT OR IGNORE INTO conversations(id,title,created_at,updated_at) VALUES(?,?,?,?)",
            arrayOf<Any>(id, title.take(70), created, created))
    }

    private fun insertMessage(db: SQLiteDatabase, conversationId: String, message: JSONObject) {
        val id = message.optString("id")
        val role = message.optString("role")
        val content = message.optString("content")
        val timestamp = message.optLong("createdAt",System.currentTimeMillis())
        require(validId(id)) { "Invalid message ID" }
        require(role == "user" || role == "assistant") { "Invalid message role" }
        require(content.length <= 1_000_000) { "Message is too large" }
        val metadata = message.optString("metadataJson","{}")
        require(metadata.length <= 200_000) { "Message metadata too large" }
        JSONObject(metadata) // validate, not SQL
        insertConversation(db,conversationId)
        // Use INSERT/UPDATE rather than relying on Android's older SQLite
        // engines supporting newer UPSERT syntax or executeUpdateDelete on INSERT.
        val existing = query(db, "SELECT conversation_id FROM messages WHERE id=?",
            arrayOf(id)) { it.getString(0) }.firstOrNull()
        require(existing == null || existing == conversationId) {
            "Message belongs to a different conversation"
        }
        if (existing == null) {
            db.execSQL("""INSERT INTO messages
                (id,conversation_id,role,content,created_at,metadata_json) VALUES(?,?,?,?,?,?)""",
                arrayOf<Any>(id,conversationId,role,content,timestamp,metadata))
        } else {
            db.execSQL("""UPDATE messages SET content=?,metadata_json=?
                WHERE id=? AND conversation_id=?""",
                arrayOf(content,metadata,id,conversationId))
        }
        val sec = now()
        if (role == "user") {
            db.execSQL("""UPDATE conversations SET
                title=CASE WHEN title='New conversation' THEN substr(?,1,70) ELSE title END,
                updated_at=? WHERE id=?""",arrayOf<Any>(content.trim(),sec,conversationId))
        } else db.execSQL("UPDATE conversations SET updated_at=? WHERE id=?",arrayOf<Any>(sec,conversationId))
    }

    private fun insertUser(db: SQLiteDatabase, value: String, created: Long? = null, updated: Long? = null,
                           touchDuplicate: Boolean = false): JSONObject {
        val fact = cleanFact(value)
        if (created != null && updated != null) {
            db.execSQL("""INSERT OR IGNORE INTO user_memories(fact,created_at,updated_at)
                VALUES(?,?,?)""",arrayOf<Any>(fact,created,updated))
        } else {
            db.execSQL("INSERT OR IGNORE INTO user_memories(fact) VALUES(?)", arrayOf(fact))
            if (touchDuplicate) db.execSQL(
                "UPDATE user_memories SET updated_at=unixepoch() WHERE fact=? COLLATE NOCASE",
                arrayOf(fact))
        }
        return query(db,
            "SELECT id,fact,created_at,updated_at FROM user_memories WHERE fact=? COLLATE NOCASE LIMIT 1",
            arrayOf(fact)) { userRow(it) }.first()
    }

    private fun insertCanon(db: SQLiteDatabase, personaId: String, category: String, labelRaw: String,
                            valueRaw: String, created: Long? = null, updated: Long? = null,
                            ignoreDuplicate: Boolean = false): JSONObject? {
        validateCharacter(personaId, category)
        val label = cleanLabel(labelRaw)
        val value = cleanValue(valueRaw)
        val normalized = label.lowercase(Locale.ROOT)
        val exists = query(db,
            "SELECT id FROM character_facts WHERE persona_id=? AND normalized_label=?",
            arrayOf(personaId,normalized)) { it.getLong(0) }.isNotEmpty()
        if (exists && !ignoreDuplicate) error("That character detail already exists. Edit it instead.")
        if (!exists) {
            if (created != null && updated != null) {
                db.execSQL("""INSERT OR IGNORE INTO character_facts
                    (persona_id,category,label,normalized_label,value,created_at,updated_at)
                    VALUES(?,?,?,?,?,?,?)""",arrayOf<Any>(personaId,category,label,normalized,value,created,updated))
            } else {
                db.execSQL("""INSERT OR IGNORE INTO character_facts
                    (persona_id,category,label,normalized_label,value) VALUES(?,?,?,?,?)""",
                    arrayOf(personaId,category,label,normalized,value))
            }
        }
        return query(db, """SELECT id,persona_id,category,label,value,created_at,updated_at
            FROM character_facts WHERE persona_id=? AND normalized_label=?""",
            arrayOf(personaId,normalized)) { canonRow(it) }.firstOrNull()
    }

    private fun migration(db: SQLiteDatabase, key: String): Boolean =
        query(db,"SELECT 1 FROM memory_migrations WHERE key=?",arrayOf(key)) { it.getInt(0) }.isNotEmpty()
    private fun completeMigration(db: SQLiteDatabase, key: String) {
        db.execSQL("INSERT OR IGNORE INTO memory_migrations(key) VALUES(?)",arrayOf(key))
    }

    /**
     * One transaction imports both earlier React localStorage and v0.1 Kotlin
     * SharedPreferences. Marker is committed only if every import succeeds.
     * React must retain its legacy keys until bootstrap returns successfully.
     */
    @Synchronized
    fun bootstrap(legacy: JSONObject): JSONObject {
        val db = writableDatabase
        db.beginTransaction()
        try {
            if (!migration(db,"react_localstorage_v1")) {
                val threads = legacy.optJSONArray("threads") ?: JSONArray()
                for (i in 0 until minOf(threads.length(),500)) {
                    val item = threads.optJSONObject(i) ?: continue
                    val id = item.optString("id")
                    if (!validId(id)) continue
                    val turns = item.optJSONArray("turns") ?: JSONArray()
                    if (turns.length() == 0) continue
                    insertConversation(db,id,item.optString("title","New conversation"),
                        item.optLong("createdAt",System.currentTimeMillis()) / 1000)
                    for (j in 0 until minOf(turns.length(),10000)) {
                        val message = turns.optJSONObject(j) ?: continue
                        if (!validId(message.optString("id"))) continue
                        // Migration must be idempotent even when a prior build already
                        // imported the old native turn into a separate React thread.
                        val duplicated = query(db,"SELECT 1 FROM messages WHERE id=?",
                            arrayOf(message.optString("id"))) { it.getInt(0) }.isNotEmpty()
                        if (!duplicated) insertMessage(db,id,message)
                    }
                }
                val facts = legacy.optJSONArray("facts") ?: JSONArray()
                for (i in 0 until minOf(facts.length(),500)) {
                    val f = facts.optJSONObject(i) ?: continue
                    val raw = f.optString("fact")
                    if (raw.isNotBlank() && raw.length <= 500)
                        insertUser(db,raw,f.optLong("createdAt",now()),f.optLong("updatedAt",now()))
                }
                val canon = legacy.optJSONArray("canon") ?: JSONArray()
                for (i in 0 until minOf(canon.length(),500)) {
                    val f = canon.optJSONObject(i) ?: continue
                    val cat = f.optString("category")
                    val personaId = f.optString("personaId","mikan")
                    if (personaId == "mikan" && cat in categories &&
                        f.optString("label").isNotBlank() && f.optString("value").isNotBlank()) {
                        insertCanon(db,personaId,cat,f.optString("label"),f.optString("value"),
                            f.optLong("createdAt",now()),f.optLong("updatedAt",now()),true)
                    }
                }
                completeMigration(db,"react_localstorage_v1")
            }
            if (!migration(db,"native_kotlin_v1")) {
                val previous = ChatStore(context)
                val turns = previous.load()
                // Avoid a duplicate conversation if the React v0.2 importer already
                // copied the native IDs into localStorage.
                val missing = turns.filter { turn ->
                    validId(turn.id) && query(db,
                        "SELECT 1 FROM messages WHERE id=?", arrayOf(turn.id)) { it.getInt(0) }.isEmpty()
                }
                if (missing.isNotEmpty()) {
                    insertConversation(db,previous.conversationId,"Earlier Pocket Mikan chat",
                        (missing.first().createdAt / 1000))
                    missing.forEach {
                        insertMessage(db,previous.conversationId,JSONObject()
                            .put("id",it.id)
                            .put("role",if(it.role == ChatRole.USER)"user" else "assistant")
                            .put("content",it.content).put("createdAt",it.createdAt))
                    }
                }
                completeMigration(db,"native_kotlin_v1")
            }
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
        return snapshot(db)
    }

    /** Narrow allowlisted native commands, with SQLite constraints matching Windows. */
    @Synchronized
    fun handle(action: String, data: JSONObject): JSONObject {
        if (action == "bootstrap") return bootstrap(data.optJSONObject("legacy") ?: JSONObject())
        val db = writableDatabase
        return when (action) {
            "snapshot" -> snapshot(db)
            "listFacts" -> JSONObject().put("facts",allFacts(db))
            "listCanon" -> JSONObject().put("canon",allCanon(db))
            "createConversation" -> {
                insertConversation(db,data.getString("conversationId")); JSONObject()
            }
            "saveMessage" -> {
                db.beginTransaction()
                try {
                    insertMessage(db,data.getString("conversationId"),data.getJSONObject("message"))
                    db.setTransactionSuccessful()
                } finally { db.endTransaction() }
                JSONObject()
            }
            "deleteConversation" -> {
                val id = data.getString("conversationId")
                require(validId(id)) { "Invalid conversation ID" }
                db.delete("conversations","id=?",arrayOf(id)); JSONObject()
            }
            "addFact" -> JSONObject().put("fact",insertUser(db,data.getString("fact"),touchDuplicate=true))
            "updateFact" -> {
                val id = data.getLong("id")
                val fact = cleanFact(data.getString("fact"))
                val changed = db.compileStatement(
                    "UPDATE user_memories SET fact=?,updated_at=unixepoch() WHERE id=?").use { st ->
                    st.bindString(1,fact);st.bindLong(2,id);st.executeUpdateDelete()
                }
                require(changed > 0) { "Memory not found" }
                JSONObject()
            }
            "deleteFact" -> {
                db.delete("user_memories","id=?",arrayOf(data.getLong("id").toString())); JSONObject()
            }
            "addCanon" -> JSONObject().put("fact",insertCanon(db,
                data.optString("personaId","mikan"),data.getString("category"),
                data.getString("label"),data.getString("value")))
            "updateCanon" -> {
                val personaId = data.optString("personaId","mikan")
                val category = data.getString("category")
                validateCharacter(personaId,category)
                val label = cleanLabel(data.getString("label"))
                val value = cleanValue(data.getString("value"))
                val changed = db.compileStatement("""UPDATE character_facts SET category=?,label=?,
                    normalized_label=?,value=?,updated_at=unixepoch()
                    WHERE id=? AND persona_id=?""").use { st ->
                    st.bindString(1,category);st.bindString(2,label)
                    st.bindString(3,label.lowercase(Locale.ROOT));st.bindString(4,value)
                    st.bindLong(5,data.getLong("id"));st.bindString(6,personaId)
                    st.executeUpdateDelete()
                }
                require(changed > 0) { "Character detail not found" }
                JSONObject()
            }
            "deleteCanon" -> {
                val personaId = data.optString("personaId","mikan")
                require(persona.matches(personaId)) { "Invalid persona ID" }
                db.delete("character_facts","id=? AND persona_id=?",
                    arrayOf(data.getLong("id").toString(),personaId))
                JSONObject()
            }
            else -> error("Unsupported memory operation")
        }
    }

    data class PairForExtraction(val user: String, val assistant: String)
    @Synchronized
    fun sourcePair(data: JSONObject): PairForExtraction? {
        val db = readableDatabase
        val conversationId = data.optString("conversationId")
        val userId = data.optString("userMessageId")
        val assistantId = data.optString("assistantMessageId")
        require(listOf(conversationId,userId,assistantId).all(::validId)) { "Invalid source message IDs" }
        if (query(db,"SELECT 1 FROM automatic_memory_runs WHERE assistant_message_id=?",
                arrayOf(assistantId)) { it.getInt(0) }.isNotEmpty()) return null
        fun read(id: String, role: String) = query(db,
            "SELECT content FROM messages WHERE id=? AND conversation_id=? AND role=?",
            arrayOf(id,conversationId,role)) { it.getString(0) }.firstOrNull()
        val user = read(userId,"user") ?: return null
        val assistant = read(assistantId,"assistant") ?: return null
        return PairForExtraction(user,assistant)
    }

    /** Caller has checked evidence and the saved message pair. Single SQLite
     * transaction makes the run idempotent and ensures deleted chats cannot
     * resurrect old memories after a delayed model response. */
    @Synchronized
    fun persistExtraction(data: JSONObject, proposal: JSONObject,
                          user: String, assistant: String, captureUser: Boolean,
                          captureCharacter: Boolean): JSONObject {
        val db = writableDatabase
        val assistantId = data.getString("assistantMessageId")
        val userId = data.getString("userMessageId")
        val result = JSONObject().put("userSaved",0).put("characterSaved",0).put("skipped",false)
        db.beginTransaction()
        try {
            // FK ensures the reply wasn't deleted while the model was processing.
            val inserted = db.compileStatement(
                "INSERT OR IGNORE INTO automatic_memory_runs(assistant_message_id) VALUES(?)").use {
                it.bindString(1,assistantId);it.executeInsert()
            }
            if (inserted < 0) {
                result.put("skipped",true)
            } else {
                if (captureUser) {
                    val proposed = proposal.optJSONArray("user_facts") ?: JSONArray()
                    for (i in 0 until minOf(proposed.length(),3)) {
                        val item = proposed.optJSONObject(i) ?: continue
                        val fact = PocketMemoryRules.cleanUser(
                            item.optString("fact"),item.optString("evidence"),user) ?: continue
                        val exists = query(db,
                            "SELECT 1 FROM user_memories WHERE fact=? COLLATE NOCASE",
                            arrayOf(fact)) { it.getInt(0) }.isNotEmpty()
                        if (exists) continue
                        val row = insertUser(db,fact)
                        db.execSQL("""INSERT INTO automatic_memory_sources
                            (memory_kind,memory_id,source_message_id,evidence)
                            VALUES('user',?,?,?)""",arrayOf<Any>(
                            row.getLong("id"),userId,normalize(item.optString("evidence"))))
                        result.put("userSaved",result.getInt("userSaved")+1)
                    }
                }
                if (captureCharacter) {
                    val proposed = proposal.optJSONArray("character_facts") ?: JSONArray()
                    for (i in 0 until minOf(proposed.length(),3)) {
                        val item = proposed.optJSONObject(i) ?: continue
                        val category = item.optString("category")
                        val label = item.optString("label")
                        val value = item.optString("value")
                        val evidence = item.optString("evidence")
                        if (!PocketMemoryRules.cleanCharacter(category,label,value,evidence,assistant)) continue
                        val exists = query(db,
                            "SELECT 1 FROM character_facts WHERE persona_id='mikan' AND normalized_label=?",
                            arrayOf(normalize(label).lowercase(Locale.ROOT))) { it.getInt(0) }.isNotEmpty()
                        if (exists) continue // never overwrite owner-curated canon
                        val row = insertCanon(db,"mikan",category,label,value) ?: continue
                        db.execSQL("""INSERT INTO automatic_memory_sources
                            (memory_kind,memory_id,source_message_id,evidence)
                            VALUES('character',?,?,?)""",arrayOf<Any>(
                            row.getLong("id"),assistantId,normalize(evidence)))
                        result.put("characterSaved",result.getInt("characterSaved")+1)
                    }
                }
            }
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
        return result
    }

    override fun close() { super.close() }
}
