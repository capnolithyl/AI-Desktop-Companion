package dev.capnolithyl.mikan.pocket

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.net.IDN
import java.net.URI
import java.net.URL
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.net.ssl.HttpsURLConnection
import org.json.JSONArray
import org.json.JSONObject

/**
 * Phone-only search adapter. React cannot fetch external sites; only this
 * pinned Tavily HTTPS client has network access. The user's credential is
 * encrypted with an Android Keystore AES-GCM key in app-private preferences.
 * No API token is embedded in Git, JavaScript, APK resources or logs.
 */
class PocketWebSearch(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("pocket-web-v1", Context.MODE_PRIVATE)
    private val alias = "dev.capnolithyl.mikan.pocket.tavily"
    private val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    private fun secretKey(): SecretKey {
        (keyStore.getKey(alias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }

    private fun readKey(): String? {
        val encoded = prefs.getString("api_key", null) ?: return null
        return try {
            val bytes = Base64.decode(encoded, Base64.NO_WRAP)
            if (bytes.size < 29) return null
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
            String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), StandardCharsets.UTF_8)
                .takeIf { it.isNotBlank() }
        } catch (_: Exception) {
            // Key may have been invalidated by an Android backup/restore.
            null
        }
    }

    fun status(): JSONObject = JSONObject()
        .put("configured", readKey() != null)
        .put("provider", "Tavily")

    fun saveKey(value: String): JSONObject {
        val key = value.trim()
        require(key.matches(Regex("^tvly-[A-Za-z0-9_-]{12,200}$"))) {
            "Enter a Tavily API key (it starts with tvly-)."
        }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val bytes = cipher.iv + cipher.doFinal(key.toByteArray(StandardCharsets.UTF_8))
        check(prefs.edit().putString("api_key", Base64.encodeToString(bytes, Base64.NO_WRAP)).commit()) {
            "Could not save the API key"
        }
        return status()
    }

    fun clearKey(): JSONObject {
        check(prefs.edit().remove("api_key").commit()) { "Could not clear the API key" }
        return status()
    }

    private fun validPublicHttps(raw: String): String? {
        if (raw.length !in 12..1800) return null
        val uri = try { URI(raw) } catch (_: Exception) { return null }
        if (uri.scheme != "https" || uri.rawUserInfo != null || uri.host.isNullOrBlank()
            || uri.port !in listOf(-1, 443)) return null
        val host = try { IDN.toASCII(uri.host).lowercase() } catch (_: Exception) { return null }
        if (!host.contains('.') || host.endsWith(".local") || host.endsWith(".localhost")
            || host.endsWith(".internal") || host == "localhost" || host.contains(':')
            || host.matches(Regex("^[0-9.]+$"))) return null
        return raw
    }

    private fun request(endpoint: String, body: JSONObject): JSONObject {
        val key = readKey() ?: error("Set your Tavily API key under Settings → Internet first.")
        val url = URL("https://api.tavily.com/$endpoint")
        val connection = (url.openConnection() as HttpsURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 12_000
            readTimeout = 19_000
            instanceFollowRedirects = false
            doOutput = true
            setRequestProperty("Authorization", "Bearer $key")
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Accept", "application/json")
        }
        try {
            val bytes = body.toString().toByteArray(StandardCharsets.UTF_8)
            connection.outputStream.use { it.write(bytes) }
            val status = connection.responseCode
            if (status !in 200..299) {
                val reason = when (status) {
                    401, 403 -> "Tavily rejected the API key. Check it under Settings → Internet."
                    402, 429 -> "Tavily search credits or rate limit reached. Check your Tavily account."
                    else -> "Tavily returned HTTP $status."
                }
                error(reason)
            }
            val contentLength = connection.contentLengthLong
            require(contentLength <= 900_000) { "Search response is too large." }
            val bodyBytes = connection.inputStream.use { stream ->
                val output = java.io.ByteArrayOutputStream()
                val chunk = ByteArray(8192)
                var read = stream.read(chunk)
                while (read != -1) {
                    require(output.size() + read <= 900_000) { "Search response is too large." }
                    output.write(chunk, 0, read)
                    read = stream.read(chunk)
                }
                output.toByteArray()
            }
            return JSONObject(String(bodyBytes, StandardCharsets.UTF_8))
        } finally {
            connection.disconnect()
        }
    }

    fun search(rawQuery: String, recent: Boolean): JSONObject {
        val query = rawQuery.trim()
        require(query.length in 3..350) { "Search query must contain 3–350 characters." }
        val body = JSONObject()
            .put("query", query)
            .put("search_depth", "basic")
            .put("max_results", 5)
            .put("include_answer", false)
            .put("include_raw_content", false)
            .put("include_images", false)
        // A generic "latest" search must cover older announcements too.
        // Otherwise a quiet month can hide the last confirmed album update.
        // Reserve the month filter for an explicitly short time window.
        if (recent && Regex(
                """\\b(today|tonight|this week|this month|past month|last month)\\b""",
                RegexOption.IGNORE_CASE
            ).containsMatchIn(query)) {
            body.put("time_range", "month")
        }
        val response = request("search", body)
        val output = JSONArray()
        val seen = HashSet<String>()
        val raw = response.optJSONArray("results") ?: JSONArray()
        for (i in 0 until minOf(12, raw.length())) {
            val item = raw.optJSONObject(i) ?: continue
            val uri = validPublicHttps(item.optString("url")) ?: continue
            if (!seen.add(uri)) continue
            val title = item.optString("title", uri).take(160)
            val snippet = item.optString("content").take(650)
            if (snippet.isBlank()) continue
            val result = JSONObject().put("title", title).put("url", uri)
                .put("content", snippet).put("engine", "Tavily")
            item.optString("published_date").takeIf { it.isNotBlank() }?.let {
                result.put("publishedDate", it.take(70))
            }
            output.put(result)
            if (output.length() >= 5) break
        }
        return JSONObject().put("results", output)
    }

    /** Optional on-demand page reading, through the provider, not WebView fetch. */
    fun readPage(rawUrl: String): JSONObject {
        val url = validPublicHttps(rawUrl.trim())
            ?: error("Only public HTTPS webpages can be read.")
        val response = request("extract",
            JSONObject().put("urls", JSONArray().put(url)).put("extract_depth", "basic")
                .put("format", "markdown"))
        val result = response.optJSONArray("results")?.optJSONObject(0)
            ?: error("Tavily could not extract readable content from that page.")
        val content = result.optString("raw_content").take(8000).trim()
        require(content.isNotBlank()) { "The webpage did not contain readable text." }
        return JSONObject()
            .put("url", url)
            .put("title", URI(url).host)
            .put("content", content)
            .put("fetchedAt", System.currentTimeMillis() / 1000)
            .put("fromCache", false)
    }
}
