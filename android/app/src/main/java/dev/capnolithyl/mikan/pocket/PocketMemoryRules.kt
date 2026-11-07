package dev.capnolithyl.mikan.pocket

import java.util.Locale

/**
 * Mirrors the conservative checks in src-tauri/src/memory_extraction.rs.
 * The model proposes candidates; code validates evidence and category before
 * SQLite ever saves anything. Explicit /remember remains user-controlled.
 */
object PocketMemoryRules {
    private val sensitiveWords = listOf(
        "password","passcode","api key","secret key","private key",
        "social security","ssn","credit card","bank account",
        "routing number","account number","street address",
        "medical","diagnos","therapy","therapist","medication",
        "depress","suicid","pregnan","religion","christian",
        "muslim","jewish","church membership","political party",
        "voted for","ballot choice","sexual","salary","income",
        "mortgage","loan balance","debt","insurance policy"
    )
    private val excludedWords = setOf(
        "the","user","and","that","this","with","myself","mine",
        "have","has","are","was","they","them","she","her","his",
        "for","from","your","you","favorite","favourite",
        "like","likes","love","loves","enjoys"
    )
    fun sensitive(text: String) =
        sensitiveWords.any { text.lowercase(Locale.ROOT).contains(it) }

    private val nameGreeting = Regex(
        "^(?:hi|hey|hello|hiya|good (?:morning|afternoon|evening))\\b[!,.:\\s]*",
        RegexOption.IGNORE_CASE
    )
    private val nameIntroduction = Regex(
        "^(my name is|(?:you can |please )?call me|i go by|i['’]m|i am)\\s+(.+)$",
        RegexOption.IGNORE_CASE
    )
    private val validName = Regex(
        "^[\\p{L}][\\p{L}\\p{M}'’-]*(?:[ -][\\p{L}][\\p{L}\\p{M}'’-]*){0,3}$"
    )
    private val nonNameIntroductions = setOf(
        "a","an","the","so","very","really","just","not","too",
        "here","there","fine","good","great","okay","ok",
        "tired","happy","sad","hungry","bored","busy","testing",
        "working","trying","looking","feeling","going","doing",
        "new","ready","sorry","sure","wondering"
    )

    private fun introducedName(raw: String): String? {
        val hasGreeting = nameGreeting.containsMatchIn(raw)
        val statement = nameGreeting.replaceFirst(raw, "").trim()
        val match = nameIntroduction.matchEntire(statement) ?: return null
        val name = match.groupValues[2].trim()
        if (name.isEmpty() || name.length > 80 || !validName.matches(name)) return null
        val informal = Regex("^(?:i['’]m|i am)$", RegexOption.IGNORE_CASE)
            .matches(match.groupValues[1])
        val first = name.split(Regex("[\\s-]"), limit = 2)[0]
        if (informal && (first.lowercase(Locale.ROOT) in nonNameIntroductions ||
            (!hasGreeting && !Character.isUpperCase(name.codePointAt(0))))) return null
        return name
    }

    fun userCandidate(text: String): Boolean {
        val lower = " " + text.lowercase(Locale.ROOT).replace(Regex("[\n\r\t]")," ") + " "
        return listOf(" i "," i'm "," i've "," my "," we "," we're "," our ")
            .any { lower.contains(it) }
    }

    /**
     * Exact, high-confidence user declarations need no second model request.
     * Avoid asking Nano to invent a JSON object for "My name is Marcus".
     * Everything still passes the same evidence and sensitive-content checks
     * before SQLite creates a sourced automatic memory.
     */
    fun obviousUserFact(message: String): Pair<String, String>? {
        val source = PocketMemoryStore.normalize(message)
        if (source.isBlank() || source.length > 240 || sensitive(source)) return null
        val input = source.trimEnd(' ', '.', '!', '?')
        val name = introducedName(input)
        val favorite = Regex("^my favou?rite\\s+([a-z][a-z ]{1,40})\\s+is\\s+(.{1,100})$",
            RegexOption.IGNORE_CASE).matchEntire(input)
        val preference = Regex("^i\\s+(love|like|enjoy|prefer|hate|dislike)\\s+(.{1,120})$",
            RegexOption.IGNORE_CASE).matchEntire(input)
        val proposed = when {
            name != null -> "The user is named " + name
            favorite != null -> "The user says their favorite " + favorite.groupValues[1] +
                " is " + favorite.groupValues[2]
            preference != null -> {
                val verb = when (preference.groupValues[1].lowercase(Locale.ROOT)) {
                    "love" -> "loves"; "like" -> "likes"; "enjoy" -> "enjoys"
                    "prefer" -> "prefers"; "hate" -> "hates"
                    else -> "dislikes"
                }
                "The user " + verb + " " + preference.groupValues[2]
            }
            else -> return null
        }
        // Use the original user's words as the evidence, not a model summary.
        return cleanUser(proposed, input, message)?.let { it to input }
    }

    fun characterQuestion(text: String): Boolean {
        val lower = text.lowercase(Locale.ROOT)
        val targetsMikan = listOf("your ","yours","do you ","are you ","about you","mikan")
            .any { lower.contains(it) }
        val aboutPreference = listOf(
            "favorite","favourite","prefer","enjoy","like","dislike",
            "love","hate","hobb","interest","music","genre",
            "color","colour","personality","tell me about yourself"
        ).any { lower.contains(it) }
        val asks = lower.contains('?') || lower.startsWith("tell me") || lower.startsWith("describe ")
        return targetsMikan && aboutPreference && asks &&
            !lower.contains("my favorite") && !lower.contains("my favourite")
    }

    fun quoteMatches(source: String, evidence: String): Boolean {
        val quote = PocketMemoryStore.normalize(evidence)
        return quote.length in 3..350 &&
            PocketMemoryStore.normalize(source).lowercase(Locale.ROOT).contains(
                quote.lowercase(Locale.ROOT))
    }

    private fun significantWords(text: String): Set<String> =
        Regex("[\\p{L}\\p{N}]+").findAll(text.lowercase(Locale.ROOT))
            .map { it.value }.filter { it.length >= 3 && it !in excludedWords }.toSet()

    private fun groundedValue(text: String, evidence: String): Boolean {
        val evidenceWords = significantWords(evidence)
        return significantWords(text).any { it in evidenceWords }
    }

    fun cleanUser(candidate: String, evidence: String, userMessage: String): String? {
        val fact = PocketMemoryStore.normalize(candidate)
        if (fact.length !in 12..500 ||
            !fact.lowercase(Locale.ROOT).startsWith("the user ") ||
            !quoteMatches(userMessage,evidence) ||
            !groundedValue(fact,evidence) ||
            sensitive(fact) || sensitive(evidence)) return null
        return fact
    }

    fun cleanCharacter(category: String, labelRaw: String, valueRaw: String,
                       evidence: String, assistantMessage: String): Boolean {
        val label = PocketMemoryStore.normalize(labelRaw)
        val value = PocketMemoryStore.normalize(valueRaw)
        return category in setOf("favorites","likes","dislikes","hobbies","traits","other") &&
            label.isNotEmpty() && label.length <= 80 &&
            value.isNotEmpty() && value.length <= 500 &&
            quoteMatches(assistantMessage,evidence) &&
            groundedValue(value,evidence) &&
            !sensitive(value) && !sensitive(evidence)
    }
}
