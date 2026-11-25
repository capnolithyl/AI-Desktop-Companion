package dev.capnolithyl.mikan.launcher;

public final class QuickAppRankTest {
    private static void expect(int value,int expected){if(value!=expected)throw new AssertionError("Expected "+expected+", got "+value);}
    private static int score(String q,String label,String pkg){return QuickAppRank.score(QuickAppRank.normalize(q),label,pkg);}
    public static void main(String[] args){
        expect(score("  SPOTIFY ","Spotify","com.spotify.music"),0);
        expect(score("sp","Spotify","com.spotify.music"),10);
        expect(score("maps","Google Maps","com.google.android.apps.maps"),20);
        expect(score("tif","Spotify","com.spotify.music"),30);
        expect(score("maps google","Google Maps","com.google.android.apps.maps"),40);
        expect(score("com.spotify.music","Spotify","com.spotify.music"),50);
        expect(score("android.apps","Google Maps","com.google.android.apps.maps"),60);
        expect(score("cafe","Café","example.cafe"),0);
        expect(score("missing","Spotify","com.spotify.music"),-1);
        expect(score("   ","Spotify","com.spotify.music"),-1);
        System.out.println("QuickAppRank: 10 cases passed");
    }
}
