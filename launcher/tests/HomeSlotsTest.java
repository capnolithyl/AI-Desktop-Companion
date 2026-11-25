package dev.capnolithyl.mikan.launcher;
import java.util.*;
public final class HomeSlotsTest {
    private static void check(boolean ok){if(!ok)throw new AssertionError();}
    public static void main(String[] args){
        HomeSlots s=new HomeSlots();s.reconcile(Arrays.asList("a","b","c"));check("a".equals(s.at(0)));
        check(s.move(0,7));check(s.at(0)==null&&"a".equals(s.at(7)));
        check(s.move(1,7));check("a".equals(s.at(1))&&"b".equals(s.at(7)));
        s=HomeSlots.parse(s.encode());check("b".equals(s.at(7))&&s.at(0)==null);
        s.reconcile(Arrays.asList("a","b","c","d"));check("d".equals(s.at(0))&&"b".equals(s.at(7)));
        s.swapPages(0,1,4);check("d".equals(s.at(4))&&"b".equals(s.at(3)));
        check(!s.removeEmptyPage(0,4));check(s.removeEmptyPage(2,4));
        s.reconcile(Arrays.asList("a","b"));check(!s.keys().contains("c")&&s.keys().size()==2);
        for(String invalid:new String[]{"-1\ta","1\ta\n1\tb","1\ta\n2\ta","20000\ta"}){boolean failed=false;try{HomeSlots.parse(invalid);}catch(IllegalArgumentException e){failed=true;}check(failed);}
        System.out.println("HomeSlots tests passed");
    }
}
