package dev.capnolithyl.mikan.launcher;
import java.util.*;
public final class DrawerDataTest {
    private static void check(boolean value){if(!value)throw new AssertionError();}
    public static void main(String[] args){
        check(DrawerData.bucket("alpha")==1&&DrawerData.bucket("zebra")==26&&DrawerData.bucket("123")==0);
        int[] sections=new int[27];Arrays.fill(sections,-1);sections[1]=0;sections[4]=5;sections[26]=18;
        check(DrawerData.nearest(2,sections)==1&&DrawerData.nearest(3,sections)==4&&DrawerData.nearest(25,sections)==26);
        Map<String,String> cats=new LinkedHashMap<>();cats.put("a","Games");cats.put("b","Work");check(DrawerData.categories(DrawerData.encode(cats)).equals(cats));
        check(DrawerData.keys("a\nb\n").size()==2);check(!DrawerData.validCategory("foo\tbar"));
        Map<String,Integer> counts=DrawerData.counts("a\t2\nb\t1000001\nc\tinvalid\n");check(counts.size()==1&&counts.get("a")==2);
        boolean bad=false;try{DrawerData.categories("a\tbad\tname");}catch(IllegalArgumentException e){bad=true;}check(bad);
        System.out.println("DrawerData tests passed");
    }
}
