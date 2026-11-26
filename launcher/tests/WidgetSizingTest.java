package dev.capnolithyl.mikan.launcher;

import java.util.Arrays;

public final class WidgetSizingTest {
    static void check(boolean ok){if(!ok)throw new AssertionError();}
    public static void main(String[] args){
        int[] rows={44,44,44,44};
        WidgetSizing.ensureHeight(rows,0,2,130);
        check(Arrays.equals(rows,new int[]{65,65,44,44}));
        WidgetSizing.ensureHeight(rows,0,2,100);
        check(Arrays.equals(rows,new int[]{65,65,44,44}));
        WidgetSizing.ensureHeight(rows,1,2,132);
        check(rows[1]+rows[2]==132&&rows[0]==65&&rows[3]==44);
        int[] large={44,44,44,44,44,44};
        WidgetSizing.ensureHeight(large,0,6,200);
        check(Arrays.equals(large,new int[]{44,44,44,44,44,44}));
        System.out.println("WidgetSizing tests passed");
    }
}
