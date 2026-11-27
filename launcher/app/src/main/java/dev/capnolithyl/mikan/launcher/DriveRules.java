package dev.capnolithyl.mikan.launcher;

/** Session-only projection mode, separate from saved Home layout. */
final class DriveRules {
    private boolean projected, suppressed, preview;
    void connection(Boolean connected){
        projected=Boolean.TRUE.equals(connected);
        if(Boolean.FALSE.equals(connected))suppressed=false;
    }
    void enable(){suppressed=false;}
    void disable(){projected=false;suppressed=false;preview=false;}
    void preview(){preview=true;}
    void exit(){preview=false;suppressed=true;}
    boolean wants(boolean enabled){return preview||(enabled&&projected&&!suppressed);}
}
