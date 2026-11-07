package dev.capnolithyl.mikan.pocket

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.util.Base64
import java.io.ByteArrayOutputStream
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.webkit.WebViewAssetLoader
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream

/**
 * Android shell for Mikan's *shared React UI*.
 * Bundled WebView assets remain offline. A narrowly scoped native HTTPS
 * adapter handles optional Tavily research; Gemini Nano inference stays local.
 *
 * The transport is deliberately isolated: it can later be replaced by the
 * Tauri 2 Android plugin without rewriting the React chat/personality/settings.
 */
class ReactActivity : Activity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val backend = NanoBackend()
    private val memoryStore by lazy { PocketMemoryStore(this) }
    private val memoryExtractor by lazy { PocketMemoryExtractor(memoryStore,backend) }
    private val webSearch by lazy { PocketWebSearch(this) }
    private var memoryJob: Job? = null
    private lateinit var web: WebView
    private var generation: Job? = null
    private var fileChooser: ValueCallback<Array<Uri>>? = null
    private val fileRequestCode = 4546
    private val allowedHost = "appassets.androidplatform.net"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        val frame = FrameLayout(this)
        web = WebView(this).apply {
            setBackgroundColor(android.graphics.Color.rgb(24, 21, 30))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = true // for user-selected portrait files only
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.setSupportMultipleWindows(false)
            if (Build.VERSION.SDK_INT >= 26) settings.safeBrowsingEnabled = true
        }
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
                val url = request.url
                if (url.scheme != "https" || url.host != allowedHost || !url.path.orEmpty().startsWith("/assets/")) {
                    return WebResourceResponse("text/plain", "utf-8", 403, "Blocked", mapOf(),
                        ByteArrayInputStream(ByteArray(0)))
                }
                return loader.shouldInterceptRequest(url)
                    ?: WebResourceResponse("text/plain", "utf-8", 404, "Not Found", mapOf(),
                        ByteArrayInputStream(ByteArray(0)))
            }
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                return request.url.host != allowedHost || request.url.scheme != "https"
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?, callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams?
            ): Boolean {
                fileChooser?.onReceiveValue(null)
                fileChooser = callback
                return try {
                    @Suppress("DEPRECATION")
                    startActivityForResult(
                        params?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply { type = "image/*" },
                        fileRequestCode
                    )
                    true
                } catch (_: Exception) {
                    fileChooser = null
                    callback.onReceiveValue(null)
                    false
                }
            }
        }
        web.addJavascriptInterface(Bridge(), "MikanNative")
        frame.addView(web, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(frame)

        // Android 15 edge-to-edge requires accounting for the IME, not only
        // the status/navigation bars. The flex composer then stays visible.
        frame.setOnApplyWindowInsetsListener { view, insets ->
            if (Build.VERSION.SDK_INT >= 30) {
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                val ime = insets.getInsets(WindowInsets.Type.ime())
                view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            }
            insets
        }
        frame.requestApplyInsets()
        web.loadUrl("https://appassets.androidplatform.net/assets/index.html")
    }

    private fun deliver(id: String, kind: String, text: String? = null, status: String? = null, error: String? = null) {
        val result = JSONObject().put("id", id).put("kind", kind)
        if (text != null) result.put("text", text)
        if (status != null) result.put("status", status)
        if (error != null) result.put("error", error)
        // JSONObject.quote escapes user and model text; never interpolate it as JS source.
        val script = "window.__mikanReceive && window.__mikanReceive(" + JSONObject.quote(result.toString()) + ");"
        runOnUiThread { if (::web.isInitialized) web.evaluateJavascript(script, null) }
    }

    private fun bundledPortrait(): String {
        val drawable = getDrawable(R.drawable.mikan_portrait) ?: return ""
        val bitmap = Bitmap.createBitmap(720, 680, Bitmap.Config.ARGB_8888)
        drawable.setBounds(0, 0, bitmap.width, bitmap.height)
        drawable.draw(Canvas(bitmap))
        val bytes = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.PNG, 90, bytes)
        bitmap.recycle()
        return "data:image/png;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP)
    }

    inner class Bridge {
        @JavascriptInterface
        fun postMessage(json: String) {
            // Exposed only to the single bundled app origin. Keep a narrow command allowlist.
            // A legacy localStorage migration may contain hundreds of messages.
            // Reject unreasonable payloads explicitly so the JS Promise doesn't hang.
            if (json.length > 2_000_000) {
                val requestId = Regex("\\\"id\\\":\\\"(mobile-[0-9]{1,12})\\\"")
                    .find(json.take(100))?.groupValues?.getOrNull(1)
                if (requestId != null) deliver(requestId,"error",error="Memory migration exceeds the 2 MB request limit")
                return
            }
            val data = try { JSONObject(json) } catch (_: Exception) { return }
            val id = data.optString("id")
            val method = data.optString("method")
            if (!id.matches(Regex("mobile-[0-9]{1,12}"))) return
            when (method) {
                "portrait" -> deliver(id, "result", text = bundledPortrait())
                "importLegacy" -> {
                    val items = JSONArray()
                    ChatStore(this@ReactActivity).load().forEach { turn ->
                        items.put(JSONObject()
                            .put("id", turn.id)
                            .put("role", if (turn.role == ChatRole.USER) "user" else "assistant")
                            .put("content", turn.content)
                            .put("createdAt", turn.createdAt))
                    }
                    deliver(id, "result", text = items.toString())
                }
                "memory" -> scope.launch {
                    try {
                        val result = withContext(Dispatchers.IO) {
                            memoryStore.handle(data.optString("action"),data)
                        }
                        deliver(id,"result",text=result.toString())
                    } catch (e: Exception) {
                        deliver(id,"error",error=e.message ?: "SQLite memory operation failed")
                    }
                }
                "extractMemory" -> {
                    if (memoryJob?.isActive == true) {
                        deliver(id,"error",error="Memory extraction is already running")
                    } else memoryJob = scope.launch {
                        try {
                            val result = memoryExtractor.process(data)
                            deliver(id,"result",text=result.toString())
                        } catch (_: CancellationException) {
                            deliver(id,"error",error="Memory extraction interrupted")
                        } catch (e: Exception) {
                            deliver(id,"error",error=e.message ?: "Memory extraction failed")
                        }
                    }
                }
                "webKeyStatus" -> scope.launch {
                    try {
                        deliver(id, "result", text = withContext(Dispatchers.IO) {
                            webSearch.status().toString()
                        })
                    } catch (e: Exception) {
                        deliver(id, "error", error = e.message ?: "Web provider status failed")
                    }
                }
                "webSaveKey" -> scope.launch {
                    try {
                        val newKey = data.optString("apiKey")
                        val result = withContext(Dispatchers.IO) { webSearch.saveKey(newKey) }
                        deliver(id, "result", text = result.toString())
                    } catch (e: Exception) {
                        deliver(id, "error", error = e.message ?: "Could not save search key")
                    }
                }
                "webClearKey" -> scope.launch {
                    try {
                        val result = withContext(Dispatchers.IO) { webSearch.clearKey() }
                        deliver(id, "result", text = result.toString())
                    } catch (e: Exception) {
                        deliver(id, "error", error = e.message ?: "Could not clear search key")
                    }
                }
                "webSearch" -> scope.launch {
                    try {
                        val result = withContext(Dispatchers.IO) {
                            webSearch.search(data.optString("query"), data.optBoolean("recent",false))
                        }
                        deliver(id, "result", text = result.toString())
                    } catch (e: Exception) {
                        deliver(id, "error", error = e.message ?: "Web search unavailable")
                    }
                }
                "webRead" -> scope.launch {
                    try {
                        val result = withContext(Dispatchers.IO) {
                            webSearch.readPage(data.optString("url"))
                        }
                        deliver(id, "result", text = result.toString())
                    } catch (e: Exception) {
                        deliver(id, "error", error = e.message ?: "Webpage reading unavailable")
                    }
                }
                "openLink" -> {
                    val url = data.optString("url")
                    try {
                        val uri = Uri.parse(url)
                        require(url.length in 12..1800 && uri.scheme == "https"
                            && !uri.host.isNullOrBlank() && uri.userInfo == null
                            && uri.port in listOf(-1,443)) {
                            "Only public HTTPS links can open in the browser"
                        }
                        startActivity(Intent(Intent.ACTION_VIEW, uri).apply {
                            addCategory(Intent.CATEGORY_BROWSABLE)
                        })
                        deliver(id, "result", text = "{}")
                    } catch (e: Exception) {
                        deliver(id, "error", error = e.message ?: "Could not open URL")
                    }
                }
                "status" -> scope.launch {
                    try { deliver(id, "result", status = backend.checkStatus().name) }
                    catch (e: Exception) { deliver(id, "error", error = e.message ?: "Status failed") }
                }
                "download" -> scope.launch {
                    try { deliver(id, "result", status = backend.download { _ -> }.name) }
                    catch (e: Exception) { deliver(id, "error", error = e.message ?: "Download failed") }
                }
                "generate" -> {
                    val prompt = data.optString("prompt")
                    if (prompt.isBlank() || prompt.length > 30_000) {
                        deliver(id, "error", error = "Invalid prompt"); return
                    }
                    if (generation?.isActive == true) {
                        deliver(id, "error", error = "Mikan is still answering"); return
                    }
                    generation = scope.launch {
                        try {
                            val answer = backend.generate(prompt) { chunk -> deliver(id, "delta", text = chunk) }
                            deliver(id, "result", text = answer)
                        } catch (_: CancellationException) {
                            deliver(id, "error", error = "Generation stopped")
                        } catch (e: Exception) {
                            deliver(id, "error", error = e.message ?: "Gemini Nano failed")
                        }
                    }
                }
                "cancel" -> {
                    generation?.cancel()
                    deliver(id, "result", text = "stopped")
                }
                else -> deliver(id, "error", error = "Unsupported command")
            }
        }
    }

    @Suppress("DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == fileRequestCode) {
            fileChooser?.onReceiveValue(
                if (resultCode == RESULT_OK) WebChromeClient.FileChooserParams.parseResult(resultCode, data) else null
            )
            fileChooser = null
        }
    }

    override fun onStop() {
        super.onStop()
        generation?.cancel()
        memoryJob?.cancel() // AICore inference is foreground-only
    }

    override fun onDestroy() {
        fileChooser?.onReceiveValue(null)
        fileChooser = null
        scope.cancel()
        backend.close()
        memoryStore.close()
        web.removeJavascriptInterface("MikanNative")
        web.destroy()
        super.onDestroy()
    }
}
