package dev.capnolithyl.mikan.pocket

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PocketMemoryRulesTest {
    @Test fun userFactsComeOnlyFromUsersOwnWords() {
        assertTrue(PocketMemoryRules.userCandidate("I love black metal."))
        assertFalse(PocketMemoryRules.userCandidate("What's your favorite music?"))
        assertEquals("The user loves black metal",
            PocketMemoryRules.cleanUser("The user loves black metal", "I love black metal", "I love black metal."))
        assertNull(PocketMemoryRules.cleanUser("The user likes jazz", "I like jazz", "I love black metal."))
        assertNull(PocketMemoryRules.cleanUser("The user loves jazz", "I love metal", "I love metal."))
    }

    @Test fun characterMemoriesCannotBeUserFacts() {
        assertTrue(PocketMemoryRules.characterQuestion("What's your favorite color, Mikan?"))
        assertFalse(PocketMemoryRules.characterQuestion("Do you remember my favorite color?"))
        assertTrue(PocketMemoryRules.cleanCharacter("favorites","Favorite color","Orange",
            "My favorite color is orange","My favorite color is orange."))
        assertFalse(PocketMemoryRules.cleanCharacter("favorites","Favorite color","Blue",
            "My favorite color is blue","My favorite color is orange."))
    }

    @Test fun stableNameAndPreferenceCaptureWithoutNanoJson() {
        assertEquals(
            "The user is named Marcus",
            PocketMemoryRules.obviousUserFact("My name is Marcus")?.first
        )
        assertEquals(
            "My name is Marcus",
            PocketMemoryRules.obviousUserFact("My name is Marcus")?.second
        )
        assertEquals(
            "The user loves metal",
            PocketMemoryRules.obviousUserFact("I love metal.")?.first
        )
        assertEquals(
            "The user says their favorite color is blue",
            PocketMemoryRules.obviousUserFact("My favorite color is blue.")?.first
        )
        assertNull(PocketMemoryRules.obviousUserFact("What's your name?"))
        assertNull(PocketMemoryRules.obviousUserFact("My password is 12345"))
    }


    @Test fun greetedNamesAreAutomaticMemoriesWithExactSourceEvidence() {
        for (input in listOf(
            "Hi I'm Marcus", "Hey, I'm Marcus", "Hello! My name is Marcus",
            "I’m Marcus", "Hi, you can call me Marcus", "I go by Marcus"
        )) {
            assertTrue("Should be considered for automatic extraction: $input",
                PocketMemoryRules.userCandidate(input))
            val proposal = PocketMemoryRules.obviousUserFact(input)
            assertEquals(input, "The user is named Marcus", proposal?.first)
            assertTrue(input, proposal != null && PocketMemoryRules.quoteMatches(input, proposal.second))
            assertEquals(input, "The user is named Marcus",
                proposal?.let { (fact, evidence) -> PocketMemoryRules.cleanUser(fact, evidence, input) })
        }
    }

    @Test fun ordinaryMoodsAreNotMistakenForNames() {
        for (input in listOf(
            "Hi I'm tired", "Hi I'm a developer", "I'm feeling stressed",
            "Hello", "I am just looking around"
        )) {
            assertNull(input, PocketMemoryRules.obviousUserFact(input))
        }
    }

    @Test fun generalizedStableFactsWithoutNanoJson() {
        // Not hardcoded to one particular identity, birthday, profession, or taste.
        val examples = mapOf(
            "My birthday is April 23 1992" to "The user says their birthday is April 23 1992",
            "My job is web development" to "The user says their job is web development",
            "I'm a WordPress developer" to "The user is a WordPress developer",
            "I work as a backend engineer" to "The user works as a backend engineer",
            "My favorite color is black" to "The user says their favorite color is black",
            "My favorite music is metal, especially black metal" to
                "The user says their favorite music is metal, especially black metal",
            "I speak German" to "The user speaks German",
            "I was born on April 23 1992" to "The user was born on April 23 1992",
            "My dog is a Boston terrier" to "The user says their dog is a Boston terrier",
            "I live in Michigan" to "The user lives in Michigan"
        )
        for ((message, expected) in examples) {
            val actual = PocketMemoryRules.stableUserFacts(message)
            assertEquals(message, expected, actual.firstOrNull()?.first)
            assertEquals(message, message, actual.firstOrNull()?.second)
            assertEquals(message, expected, PocketMemoryRules.cleanUser(
                expected, message, message
            ))
        }
    }

    @Test fun multipleStableFactsAreExtractedSeparately() {
        val result = PocketMemoryRules.stableUserFacts(
            "I'm a developer. I speak German. My favorite color is black."
        )
        assertEquals(3, result.size)
        assertEquals("The user is a developer", result[0].first)
        assertEquals("The user speaks German", result[1].first)
        assertEquals("The user says their favorite color is black", result[2].first)
    }

    @Test fun temporaryPrivateOrQuestionContentIsNotAutomaticallyStored() {
        for (message in listOf(
            "I'm tired", "My mood is terrible", "My lunch is cold",
            "My password is 12345", "I have a headache",
            "My favorite color is what?", "Can you tell me what my birthday is?"
        )) {
            assertTrue(message, PocketMemoryRules.stableUserFacts(message).isEmpty())
        }
    }

    @Test fun automaticCaptureRejectsSensitiveInformation() {
        assertNull(PocketMemoryRules.cleanUser("The user has depression",
            "I have depression", "I have depression."))
        assertNull(PocketMemoryRules.cleanUser("The user shared bank account details",
            "my bank account details", "my bank account details are private."))
        assertFalse(PocketMemoryRules.cleanCharacter("other","Password","secret",
            "My password is secret","My password is secret."))
    }
}
