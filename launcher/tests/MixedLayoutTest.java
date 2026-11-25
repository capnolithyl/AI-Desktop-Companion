package dev.capnolithyl.mikan.launcher;
import java.util.*;
public final class MixedLayoutTest {
    private static void check(boolean value){if(!value)throw new AssertionError();}
    public static void main(String[] args){
        List<MixedLayout.Spec> specs=Arrays.asList(new MixedLayout.Spec("widget:clockPage",2,1,2,1),new MixedLayout.Spec("widget:mikanPage",4,2,4,3),new MixedLayout.Spec("a",1,1,1,1),new MixedLayout.Spec("b",1,1,1,1));
        MixedLayout m=new MixedLayout();Map<String,MixedLayout.Rect> layout=m.resolve(specs,4);check(layout!=null&&layout.size()==4);
        for(String k:layout.keySet())check(MixedLayout.vacant(layout,k,layout.get(k),4));
        check(!MixedLayout.vacant(layout,"a",layout.get("widget:mikanPage"),4));
        layout.put("a",new MixedLayout.Rect(3,10,1,1));m.remember(layout,new HashSet<>(layout.keySet()));m=MixedLayout.parse(m.encode());check(m.resolve(specs,4).get("a").y==10);
        Map<String,MixedLayout.Rect> narrow=m.resolve(specs,5);check(narrow!=null&&narrow.size()==4);
        for(String k:narrow.keySet())check(MixedLayout.vacant(narrow,k,narrow.get(k),5));
        boolean bad=false;try{MixedLayout.parse("a\t0\t79\t1\t2");}catch(IllegalArgumentException e){bad=true;}check(bad);
        m.forget("a");check(!MixedLayout.parse(m.encode()).keys().contains("a"));
        Map<String,MixedLayout.Rect> gaps=new LinkedHashMap<>();
        gaps.put("widget:clockPage",new MixedLayout.Rect(0,2,2,1));
        gaps.put("widget:weatherPage",new MixedLayout.Rect(2,3,2,2));
        gaps.put("widget:mikanPage",new MixedLayout.Rect(0,9,4,3));
        gaps.put("a",new MixedLayout.Rect(0,14,1,1));
        Map<String,MixedLayout.Rect> compact=MixedLayout.compact(gaps,4);
        check(compact.get("widget:clockPage").y==0&&compact.get("widget:weatherPage").y==0);
        check(compact.get("widget:mikanPage").y==2&&compact.get("a").y==1);
        for(String key:compact.keySet()){MixedLayout.Rect rect=compact.get(key),old=gaps.get(key);check(rect.x==old.x&&rect.w==old.w&&rect.h==old.h&&rect.y<=old.y&&MixedLayout.vacant(compact,key,rect,4));}
        System.out.println("MixedLayout tests passed");
    }
}
