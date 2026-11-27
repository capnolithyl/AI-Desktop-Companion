package dev.capnolithyl.mikan.launcher;

public final class DriveRulesTest {
    static void check(boolean ok){if(!ok)throw new AssertionError();}
    public static void main(String[] args){
        DriveRules d=new DriveRules();
        check(!d.wants(true));d.connection(true);check(d.wants(true));check(!d.wants(false));
        d.exit();check(!d.wants(true));d.connection(true);check(!d.wants(true));
        d.connection(null);d.connection(true);check(!d.wants(true));
        d.connection(false);d.connection(true);check(d.wants(true));
        d.disable();check(!d.wants(true));d.preview();check(d.wants(false));
        d.exit();check(!d.wants(false));d.enable();d.connection(true);check(d.wants(true));
        d.connection(null);check(!d.wants(true));
        System.out.println("DriveRules tests passed");
    }
}
