package dev.capnolithyl.mikan.pocket

import android.app.Activity
import android.app.AlertDialog
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.inputmethod.InputMethodManager
import android.content.Context
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class MainActivity : Activity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val background = Color.rgb(24, 21, 30)
    private val surface = Color.rgb(42, 33, 45)
    private val orange = Color.rgb(255, 180, 130)
    private val pale = Color.rgb(255, 237, 226)
    private val muted = Color.rgb(190, 167, 179)
    private val turns = mutableListOf<ChatTurn>()
    private lateinit var store: ChatStore
    private lateinit var backend: ChatBackend
    private lateinit var transcript: LinearLayout
    private lateinit var scroll: ScrollView
    private lateinit var draft: EditText
    private lateinit var send: Button
    private lateinit var modelButton: Button
    private lateinit var status: TextView
    private var ready = false
    private var busy = false
    private var generation: Job? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = ChatStore(this)
        backend = NanoBackend()
        turns.addAll(store.load())
        buildUi()
        turns.forEach(::addBubble)
        if (turns.isEmpty()) addIntro()
        checkModel()
    }

    private fun dp(value: Int) = (resources.displayMetrics.density * value + 0.5f).toInt()

    private fun panel(color: Int, radius: Int = 18): GradientDrawable =
        GradientDrawable().apply { setColor(color); cornerRadius = dp(radius).toFloat() }

    private fun label(text: String, size: Float, color: Int = pale, bold: Boolean = false): TextView =
        TextView(this).apply {
            this.text = text
            textSize = size
            setTextColor(color)
            if (bold) setTypeface(null, Typeface.BOLD)
        }

    private fun buildUi() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(background)
            setPadding(dp(16), dp(14), dp(16), dp(12))
        }
        setContentView(root)
        // Android 15+ edge-to-edge: preserve system bar + cutout space.
        root.setOnApplyWindowInsetsListener { view, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
            view.setPadding(dp(16) + bars.left, dp(14) + bars.top,
                dp(16) + bars.right, dp(12) + bars.bottom)
            insets
        }

        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(2), dp(4), dp(2), dp(16))
        }
        val icon = label("🐈", 30f).apply { gravity = Gravity.CENTER }
        header.addView(icon, LinearLayout.LayoutParams(dp(50), dp(50)))
        val title = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        title.addView(label("Mikan", 22f, pale, true))
        title.addView(label("POCKET COMPANION", 10f, orange, true))
        header.addView(title, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        val fresh = Button(this).apply {
            text = "New"
            textSize = 12f
            setTextColor(pale)
            background = panel(surface, 12)
            setOnClickListener { confirmNewChat() }
        }
        header.addView(fresh, LinearLayout.LayoutParams(dp(78), dp(44)))
        root.addView(header)

        val modelStrip = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = panel(surface, 14)
            setPadding(dp(12), dp(10), dp(10), dp(10))
        }
        status = label("Checking local model…", 12f, muted)
        modelStrip.addView(status, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        modelButton = Button(this).apply {
            text = "Check"
            textSize = 12f
            setTextColor(background)
            background = panel(orange, 10)
            setOnClickListener { activateModel() }
        }
        modelStrip.addView(modelButton, LinearLayout.LayoutParams(dp(100), dp(40)))
        root.addView(modelStrip)

        scroll = ScrollView(this).apply {
            clipToPadding = false
            fillViewport = true
            setPadding(0, dp(16), 0, dp(12))
        }
        transcript = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.BOTTOM
        }
        scroll.addView(transcript, ScrollView.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(scroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        val input = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.BOTTOM
            background = panel(surface, 16)
            setPadding(dp(8), dp(7), dp(7), dp(7))
        }
        draft = EditText(this).apply {
            hint = "Chat with Mikan…"
            setHintTextColor(muted)
            setTextColor(pale)
            textSize = 15f
            background = null
            setPadding(dp(10), dp(9), dp(6), dp(9))
            maxLines = 4
            minLines = 1
            inputType = android.text.InputType.TYPE_CLASS_TEXT or
                android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE or
                android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
        }
        input.addView(draft, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        send = Button(this).apply {
            text = "➤"
            textSize = 22f
            setTextColor(background)
            background = panel(orange, 12)
            setOnClickListener { sendMessage() }
        }
        input.addView(send, LinearLayout.LayoutParams(dp(50), dp(48)))
        root.addView(input)
        root.addView(label("On-device • Private • PC connection coming later", 11f, muted).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(11), 0, dp(2))
        })
        refreshButtons()
    }

    private fun addIntro() {
        val note = label("Hey! Pocket Mikan reporting for duty. ✨\n\n" +
            "I live right here on your phone. My memory stays on this device for now, " +
            "and I can't reach the desktop or search the web yet.", 15f, pale)
        note.background = panel(surface)
        note.setPadding(dp(18), dp(18), dp(18), dp(18))
        transcript.addView(note, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = dp(12)
        })
    }

    private fun addBubble(turn: ChatTurn): TextView {
        val mine = turn.role == ChatRole.USER
        val wrapper = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = if (mine) Gravity.END else Gravity.START
            setPadding(0, dp(4), 0, dp(12))
        }
        wrapper.addView(label(if (mine) "YOU" else "MIKAN", 10f, orange, true))
        val bubble = label(turn.content, 15f, pale).apply {
            background = panel(if (mine) Color.rgb(92, 60, 65) else surface)
            setPadding(dp(14), dp(12), dp(14), dp(12))
            setTextIsSelectable(true)
            maxWidth = (resources.displayMetrics.widthPixels * 0.88f).toInt()
        }
        wrapper.addView(bubble)
        transcript.addView(wrapper)
        scroll.post { scroll.fullScroll(View.FOCUS_DOWN) }
        return bubble
    }

    private fun checkModel() {
        status.text = "Checking Gemini Nano…"
        scope.launch {
            try {
                showBackendStatus(backend.checkStatus())
            } catch (error: Exception) {
                ready = false
                status.text = error.message ?: "Could not check local model"
                refreshButtons()
            }
        }
    }

    private fun showBackendStatus(value: BackendStatus) {
        ready = value == BackendStatus.READY
        status.text = when (value) {
            BackendStatus.READY -> "● Gemini Nano ready • Offline"
            BackendStatus.DOWNLOADABLE -> "Local model needs a first-time download"
            BackendStatus.DOWNLOADING -> "Model downloading • Check again shortly"
            BackendStatus.UNAVAILABLE -> "Nano isn't available on this device yet"
        }
        modelButton.text = if (value == BackendStatus.DOWNLOADABLE) "Download" else "Check"
        modelButton.tag = value
        refreshButtons()
    }

    private fun activateModel() {
        if (busy) return
        val lastStatus = modelButton.tag as? BackendStatus
        scope.launch {
            modelButton.isEnabled = false
            try {
                if (lastStatus == BackendStatus.DOWNLOADABLE) {
                    status.text = "Preparing Gemini Nano…"
                    showBackendStatus(backend.download { progress -> status.text = progress })
                } else showBackendStatus(backend.checkStatus())
            } catch (error: Exception) {
                status.text = error.message ?: "Model setup failed"
            } finally {
                refreshButtons()
            }
        }
    }

    private fun refreshButtons() {
        if (!::send.isInitialized) return
        send.isEnabled = ready && !busy
        send.alpha = if (send.isEnabled) 1f else .45f
        modelButton.isEnabled = !busy
    }

    private fun sendMessage() {
        if (!ready || busy) return
        val message = draft.text.toString().trim()
        if (message.isBlank()) return
        draft.text.clear()
        (getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager)
            ?.hideSoftInputFromWindow(draft.windowToken, 0)
        val user = ChatTurn.new(ChatRole.USER, message)
        turns.add(user)
        store.save(turns)
        addBubble(user)
        val replyBubble = addBubble(ChatTurn.new(ChatRole.ASSISTANT, "Thinking…"))
        busy = true
        refreshButtons()
        generation = scope.launch {
            try {
                var started = false
                val answer = backend.reply(turns.toList()) { chunk ->
                    if (!started) {
                        replyBubble.text = ""
                        started = true
                    }
                    replyBubble.append(chunk)
                    scroll.post { scroll.fullScroll(View.FOCUS_DOWN) }
                }
                replyBubble.text = answer
                turns.add(ChatTurn.new(ChatRole.ASSISTANT, answer))
                store.save(turns)
            } catch (_: CancellationException) {
                replyBubble.text = "Generation paused. Try again when Mikan is open."
            } catch (error: Exception) {
                replyBubble.text = "Can't answer right now: ${error.message ?: "Unknown model error"}"
            } finally {
                busy = false
                refreshButtons()
            }
        }
    }

    private fun confirmNewChat() {
        if (busy) return
        AlertDialog.Builder(this)
            .setTitle("Start a new chat?")
            .setMessage("This clears the phone's current chat. It won't affect your PC.")
            .setPositiveButton("New chat") { _, _ ->
                store.startNewChat()
                turns.clear()
                transcript.removeAllViews()
                addIntro()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    override fun onStop() {
        super.onStop()
        // Android AICore cannot infer while this app is in the background.
        generation?.cancel()
    }

    override fun onDestroy() {
        scope.cancel()
        backend.close()
        super.onDestroy()
    }
}
