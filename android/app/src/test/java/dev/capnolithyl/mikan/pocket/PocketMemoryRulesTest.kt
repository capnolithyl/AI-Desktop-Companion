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

    @Test fun automaticCaptureRejectsSensitiveInformation() {
        assertNull(PocketMemoryRules.cleanUser("The user has depression",
            "I have depression", "I have depression."))
        assertNull(PocketMemoryRules.cleanUser("The user shared bank account details",
            "my bank account details", "my bank account details are private."))
        assertFalse(PocketMemoryRules.cleanCharacter("other","Password","secret",
            "My password is secret","My password is secret."))
    }
}
