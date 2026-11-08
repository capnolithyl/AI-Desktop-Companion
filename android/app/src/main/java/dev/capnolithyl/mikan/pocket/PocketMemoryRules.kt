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
        val lower = " " + text.lowercase(Locale.ROOT).replace('’','\'')
            .replace(Regex("[\n\r\t]")," ") + " "
        return listOf(" i "," i'm "," i've "," my "," we "," we're "," our ",
            " call me "," i go by ").any { lower.contains(it) }
    }

    /**
     * A short answer to Mikan's latest personal question can express a stable
     * preference without "I" or "my". Nano decides its meaning from the Q/A.
     * This gate merely avoids spending a model request on obvious non-answers.
     */
    fun contextualAnswerCandidate(previousAssistant: String, user: String): Boolean {
        val text = PocketMemoryStore.normalize(user)
        if (text.length !in 2..260 || text.endsWith("?") || sensitive(text) ||
            text.startsWith("/") || text.contains("http://") || text.contains("https://")) return false
        val negative = Regex(
            "^(?:not sure|don't know|i don't know|no idea|idk|skip|pass|maybe|it depends|depends|rather not say|prefer not to say)[.!? ]*$",
            RegexOption.IGNORE_CASE
        )
        if (negative.matches(text)) return false
        // Use the final interrogative from the immediately preceding assistant
        // turn, never a question in an unrelated old chat.
        val question = Regex("""[^?!\n]{3,220}\?""")
            .findAll(previousAssistant).lastOrNull()?.value?.trim().orEmpty()
        if (question.isBlank() || sensitive(question)) return false
        return Regex("\\b(?:you|your|yours)\\b", RegexOption.IGNORE_CASE)
            .containsMatchIn(question)
    }

    /**
     * Grounded first-person assertion extraction. This covers broad grammatical
     * patterns rather than specializing in one person's favorite color/name.
     * Claims that do not confidently indicate durable information fall through
     * to Gemini Nano rather than becoming automatic memories.
     *
     * Every result is checked for exact source evidence, sensitive content and
     * duplicates by cleanUser and persistExtraction.
     */
    fun stableUserFacts(message: String): List<Pair<String, String>> {
        val source = PocketMemoryStore.normalize(message)
        if (source.length !in 6..1500 || sensitive(source)) return emptyList()
        val clauses = source.split(
            Regex("(?<=[.!?;])\\s+(?=(?:my|i|we|hi|hey|hello)\\b)", RegexOption.IGNORE_CASE)
        ).take(6)
        return clauses.mapNotNull { clause ->
            if (clause.trim().endsWith("?")) return@mapNotNull null
            val evidence = clause.trim().trimEnd('.', '!', '?', ';').trim()
            if (evidence.length !in 6..320 || sensitive(evidence)) return@mapNotNull null
            val name = introducedName(evidence)
            val favorite = Regex(
                "^my favou?rite\\s+([\\p{L}][\\p{L} ]{1,42})\\s+is\\s+(.{1,180})$",
                RegexOption.IGNORE_CASE
            ).matchEntire(evidence)
            val preference = Regex(
                "^i\\s+(love|like|enjoy|prefer|hate|dislike)\\s+(.{2,180})$",
                RegexOption.IGNORE_CASE
            ).matchEntire(evidence)
            val possessive = Regex(
                "^my\\s+([\\p{L}][\\p{L}\\p{M}' -]{1,65}?)\\s+(?:is|are)\\s+(.{2,180})$",
                RegexOption.IGNORE_CASE
            ).matchEntire(evidence)
            val occupation = Regex(
                "^(?:i['’]m|i am)\\s+(?:a|an)\\s+(.{2,140})$",
                RegexOption.IGNORE_CASE
            ).matchEntire(evidence)
            val ongoing = Regex(
                "^i\\s+(work as|work at|work in|live in|come from|grew up in|was born on|was born in|speak|play|collect|study|teach|own|make)\\s+(.{2,160})$",
                RegexOption.IGNORE_CASE
            ).matchEntire(evidence)
            val temporarySubject = Regex(
                "^(?:day|mood|feeling|current mood|time|appointment|plan|problem|phone|screen|battery|meal|dinner|lunch|breakfast|weather|question|issue|temporary|today|week|morning|afternoon|night)\\b",
                RegexOption.IGNORE_CASE
            )
            val temporaryRole = Regex(
                "^(?:bit|little|lot|huge|terrible|very|currently|kind|sort|mess|bad|good|great|happy|sad|tired|sick|hungry|bored)\\b",
                RegexOption.IGNORE_CASE
            )
            val fact = when {
                name != null -> "The user is named $name"
                favorite != null ->
                    "The user says their favorite ${favorite.groupValues[1]} is ${favorite.groupValues[2]}"
                preference != null -> {
                    val verb = when (preference.groupValues[1].lowercase(Locale.ROOT)) {
                        "love" -> "loves"; "like" -> "likes"; "enjoy" -> "enjoys"
                        "prefer" -> "prefers"; "hate" -> "hates"
                        else -> "dislikes"
                    }
                    "The user $verb ${preference.groupValues[2]}"
                }
                possessive != null && !temporarySubject.containsMatchIn(possessive.groupValues[1]) ->
                    "The user says their ${possessive.groupValues[1]} is ${possessive.groupValues[2]}"
                occupation != null && !temporaryRole.containsMatchIn(occupation.groupValues[1]) ->
                    "The user is a ${occupation.groupValues[1]}"
                ongoing != null -> when (ongoing.groupValues[1].lowercase(Locale.ROOT)) {
                    "work as" -> "The user works as ${ongoing.groupValues[2]}"
                    "work at" -> "The user works at ${ongoing.groupValues[2]}"
                    "work in" -> "The user works in ${ongoing.groupValues[2]}"
                    "live in" -> "The user lives in ${ongoing.groupValues[2]}"
                    "come from" -> "The user comes from ${ongoing.groupValues[2]}"
                    "grew up in" -> "The user grew up in ${ongoing.groupValues[2]}"
                    "was born on" -> "The user was born on ${ongoing.groupValues[2]}"
                    "was born in" -> "The user was born in ${ongoing.groupValues[2]}"
                    "speak" -> "The user speaks ${ongoing.groupValues[2]}"
                    "play" -> "The user plays ${ongoing.groupValues[2]}"
                    "collect" -> "The user collects ${ongoing.groupValues[2]}"
                    "study" -> "The user studies ${ongoing.groupValues[2]}"
                    "teach" -> "The user teaches ${ongoing.groupValues[2]}"
                    "own" -> "The user owns ${ongoing.groupValues[2]}"
                    else -> "The user makes ${ongoing.groupValues[2]}"
                }
                else -> null
            }
            fact?.let { cleanUser(it, evidence, message)?.let { saved -> saved to evidence } }
        }.distinctBy { it.first.lowercase(Locale.ROOT) }.take(3)
    }

    // Keep compatibility with prior one-fact callers/tests.
    fun obviousUserFact(message: String): Pair<String, String>? =
        stableUserFacts(message).firstOrNull()

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
