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
    @Test public void exportsOnlyToAnExactConfiguredHttpsOrigin() {
        assertEquals("https://beholder.example.ts.net", NasActivity.exportOrigin("https://BEHOLDER.example.ts.net:443/workspace/"));
        assertEquals("https://beholder.example.ts.net:8443", NasActivity.exportOrigin("https://beholder.example.ts.net:8443/"));
        assertNull(NasActivity.exportOrigin("http://beholder.example.ts.net"));
        assertNull(NasActivity.exportOrigin("https://user:password@beholder.example.ts.net"));
        assertNull(NasActivity.exportOrigin(null));
    }
    @Test public void restrictsExportFilenamesToMikanJsonDocuments() {
        assertTrue(NasActivity.validExportFilename("mikan-nas-chat-1234-5678.json"));
        assertTrue(NasActivity.validExportFilename("mikan-nas-brain-1234-partial.json"));
        for (String name : new String[]{"../../secret.json", "mikan-nas-chat-../secret.json",
            "mikan-nas-chat-abc.html", "mikan-nas-other-abc.json", "mikan-nas-chat-.json", ""})
            assertFalse(NasActivity.validExportFilename(name));
        assertFalse(NasActivity.validExportFilename(null));
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
