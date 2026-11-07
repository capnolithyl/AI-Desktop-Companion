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
            assertEquals(input, input, proposal?.second)
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

    @Test fun automaticCaptureRejectsSensitiveInformation() {
        assertNull(PocketMemoryRules.cleanUser("The user has depression",
            "I have depression", "I have depression."))
        assertNull(PocketMemoryRules.cleanUser("The user shared bank account details",
            "my bank account details", "my bank account details are private."))
        assertFalse(PocketMemoryRules.cleanCharacter("other","Password","secret",
            "My password is secret","My password is secret."))
    }
}
