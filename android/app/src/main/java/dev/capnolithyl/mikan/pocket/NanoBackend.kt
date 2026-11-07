package dev.capnolithyl.mikan.pocket

import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.TextPart
import com.google.mlkit.genai.prompt.generateContentRequest
import kotlinx.coroutines.sync.Mutex

/** ML Kit Gemini Nano via Android AICore: local inference, no app network calls. */
class NanoBackend : ChatBackend {
    private val model = Generation.getClient()
    // User replies and background extraction must never compete for AICore.
    private val inferenceLock = Mutex()

    override suspend fun checkStatus() = when (model.checkStatus()) {
        FeatureStatus.AVAILABLE -> BackendStatus.READY
        FeatureStatus.DOWNLOADABLE -> BackendStatus.DOWNLOADABLE
        FeatureStatus.DOWNLOADING -> BackendStatus.DOWNLOADING
        else -> BackendStatus.UNAVAILABLE
    }

    override suspend fun download(onProgress: (String) -> Unit): BackendStatus {
        when (checkStatus()) {
            BackendStatus.READY -> return BackendStatus.READY
            BackendStatus.UNAVAILABLE -> return BackendStatus.UNAVAILABLE
            BackendStatus.DOWNLOADING -> return BackendStatus.DOWNLOADING
            BackendStatus.DOWNLOADABLE -> Unit
        }
        model.download().collect { status ->
            when (status) {
                is DownloadStatus.DownloadStarted -> onProgress("Getting Gemini Nano ready…")
                is DownloadStatus.DownloadProgress -> onProgress(
                    "Downloading local model: ${status.totalBytesDownloaded / 1_048_576} MB"
                )
                DownloadStatus.DownloadCompleted -> onProgress("Model ready")
                is DownloadStatus.DownloadFailed -> throw status.e
            }
        }
        return checkStatus()
    }

    override suspend fun reply(history: List<ChatTurn>, onDelta: (String) -> Unit): String =
        generate(MikanPersona.prompt(history), onDelta)

    /** React supplies the existing desktop persona/system prompt and conversation. */
    suspend fun generate(prompt: String, onDelta: (String) -> Unit): String =
        generateInternal(prompt, 280, 0.75f, onDelta)

    suspend fun generateMemory(prompt: String): String =
        generateInternal(prompt, 520, 0f) { }

    private suspend fun generateInternal(
        prompt: String, maxTokens: Int, temperatureValue: Float,
        onDelta: (String) -> Unit
    ): String {
        inferenceLock.lock()
        try {
            check(checkStatus() == BackendStatus.READY) { "Gemini Nano is not ready yet" }
            val request = generateContentRequest(TextPart(prompt)) {
                temperature = temperatureValue
                topK = 30
                maxOutputTokens = maxTokens
            }
            val full = StringBuilder()
            model.generateContentStream(request).collect { chunk ->
                val delta = chunk.candidates.firstOrNull()?.text.orEmpty()
                if (delta.isNotEmpty()) {
                    full.append(delta)
                    onDelta(delta)
                }
            }
            return full.toString().trim()
                .ifBlank { throw IllegalStateException("Gemini Nano returned no text") }
        } finally {
            inferenceLock.unlock()
        }
    }

    override fun close() {
        model.close()
    }
}
