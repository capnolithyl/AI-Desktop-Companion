package dev.capnolithyl.mikan.pocket

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

enum class ChatRole { USER, ASSISTANT }
data class ChatTurn(val id: String, val role: ChatRole, val content: String, val createdAt: Long) {
    companion object {
        fun new(role: ChatRole, content: String) =
            ChatTurn(UUID.randomUUID().toString(), role, content, System.currentTimeMillis())
    }
}

/**
 * App-private storage. Stable ids, schema version and conversation id make
 * deliberate desktop/phone sync possible later. No implicit cloud backup.
 */
class ChatStore(context: Context) {
    private val prefs = context.getSharedPreferences("pocket_chat_v1", Context.MODE_PRIVATE)
    var conversationId: String = prefs.getString("conversation_id", null)
        ?: UUID.randomUUID().toString()
        private set

    init { prefs.edit().putString("conversation_id", conversationId).apply() }

    fun load(): List<ChatTurn> = try {
        val items = JSONArray(prefs.getString("turns", "[]"))
        (0 until items.length()).map { i ->
            val row = items.getJSONObject(i)
            ChatTurn(
                id = row.getString("id"),
                role = ChatRole.valueOf(row.getString("role")),
                content = row.getString("content"),
                createdAt = row.getLong("createdAt")
            )
        }
    } catch (_: Exception) { emptyList() }

    fun save(turns: List<ChatTurn>) {
        val entries = JSONArray()
        turns.takeLast(200).forEach { turn ->
            entries.put(JSONObject()
                .put("id", turn.id)
                .put("role", turn.role.name)
                .put("content", turn.content)
                .put("createdAt", turn.createdAt))
        }
        prefs.edit().putString("turns", entries.toString()).apply()
    }

    fun startNewChat() {
        conversationId = UUID.randomUUID().toString()
        prefs.edit().putString("conversation_id", conversationId)
            .remove("turns").apply()
    }
}
