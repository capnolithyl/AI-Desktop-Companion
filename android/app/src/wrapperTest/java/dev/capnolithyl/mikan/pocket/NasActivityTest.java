package dev.capnolithyl.mikan.pocket;

import org.junit.Test;
import static org.junit.Assert.*;

public class NasActivityTest {
    @Test public void acceptsOwnerHttpsEndpoint() {
        assertEquals("https://beholder.example.ts.net/workspace/",
            NasActivity.normalizeEndpoint(" https://beholder.example.ts.net/workspace/ "));
        assertEquals("https://beholder.example.ts.net:8443/",
            NasActivity.normalizeEndpoint("https://beholder.example.ts.net:8443/"));
    }
    @Test public void rejectsInsecureOrCredentialBearingEndpoint() {
        for (String url : new String[]{"http://beholder.example.ts.net", "file:///tmp/mikan",
            "javascript:alert(1)", "https://user:password@beholder.example.ts.net",
            "https://beholder.example.ts.net/?key=secret", "https://beholder.example.ts.net/#key",
            "https://", "https://beholder.example.ts.net:65536", ""}) {
            assertNull(url, NasActivity.normalizeEndpoint(url));
        }
    }
    @Test public void checksExactHttpsOriginIncludingPort() {
        String origin = "https://beholder.example.ts.net/workspace/";
        assertTrue(NasActivity.sameOrigin(origin, "https://BEHOLDER.example.ts.net:443/api/status"));
        assertFalse(NasActivity.sameOrigin(origin, "https://beholder.example.ts.net:8443"));
        assertFalse(NasActivity.sameOrigin(origin, "http://beholder.example.ts.net/"));
        assertFalse(NasActivity.sameOrigin(origin, "https://beholder.example.ts.net.attacker.test/"));
        assertFalse(NasActivity.sameOrigin(origin, "https://beholder.example.ts.net@attacker.test/"));
        assertFalse(NasActivity.sameOrigin(null, "https://beholder.example.ts.net/"));
    }
}
