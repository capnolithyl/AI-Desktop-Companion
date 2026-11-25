package dev.capnolithyl.mikan.launcher;

import java.util.*;

/** Independent, bounded rectangular placements; page membership is owned by HomeSlots/widget settings. */
final class MixedLayout {
    static final int ROW_LIMIT=80;
    static final class Rect {
        final int x,y,w,h;
        Rect(int x,int y,int w,int h){this.x=x;this.y=y;this.w=w;this.h=h;}
        boolean fits(int columns){return x>=0&&y>=0&&w>0&&h>0&&(long)x+w<=columns&&(long)y+h<=ROW_LIMIT;}
        boolean overlaps(Rect r){return x<r.x+r.w&&x+w>r.x&&y<r.y+r.h&&y+h>r.y;}
    }
    static final class Spec {
        final String key;final int minW,minH,w,h;
        Spec(String key,int minW,int minH,int w,int h){this.key=key;this.minW=minW;this.minH=minH;this.w=w;this.h=h;}
        boolean accepts(Rect r,int columns){return r.fits(columns)&&r.w>=minW&&r.h>=minH&&r.h<=12&&(key.startsWith("widget:")||(r.w==1&&r.h==1));}
    }
    private final LinkedHashMap<String,Rect> saved=new LinkedHashMap<>();
    static MixedLayout parse(String raw){
        MixedLayout model=new MixedLayout();
        if(raw.length()>600000)throw new IllegalArgumentException("Layout too large");
        for(String line:raw.split("\n")){
            if(line.isEmpty())continue;
            String[] parts=line.split("\t",-1);
            if(parts.length!=5||parts[0].isEmpty()||parts[0].length()>512||parts[0].contains("\r")||model.saved.containsKey(parts[0])||model.saved.size()>=1005)throw new IllegalArgumentException("Invalid grid record");
            Rect rect=new Rect(Integer.parseInt(parts[1]),Integer.parseInt(parts[2]),Integer.parseInt(parts[3]),Integer.parseInt(parts[4]));
            if(!rect.fits(5)||rect.h>12)throw new IllegalArgumentException("Invalid grid bounds");
            model.saved.put(parts[0],rect);
        }return model;
    }
    Set<String> keys(){return new HashSet<>(saved.keySet());}
    String encode(){
        StringBuilder out=new StringBuilder();
        for(Map.Entry<String,Rect> item:saved.entrySet()){
            Rect r=item.getValue();if(out.length()>0)out.append('\n');out.append(item.getKey()).append('\t').append(r.x).append('\t').append(r.y).append('\t').append(r.w).append('\t').append(r.h);
        }return out.toString();
    }
    static boolean vacant(Map<String,Rect> placements,String key,Rect rect,int columns){
        if(!rect.fits(columns))return false;
        for(Map.Entry<String,Rect> item:placements.entrySet())if(!item.getKey().equals(key)&&rect.overlaps(item.getValue()))return false;
        return true;
    }
    LinkedHashMap<String,Rect> resolve(List<Spec> specs,int columns){
        LinkedHashMap<String,Rect> result=new LinkedHashMap<>();
        for(Spec spec:specs){Rect old=saved.get(spec.key);if(old!=null&&spec.accepts(old,columns)&&vacant(result,spec.key,old,columns))result.put(spec.key,old);}
        for(Spec spec:specs)if(!result.containsKey(spec.key)){
            int width=Math.min(columns,Math.max(spec.minW,spec.w)),height=Math.max(spec.minH,spec.h);
            Rect old=saved.get(spec.key);if(old!=null&&spec.key.startsWith("widget:")){width=Math.min(columns,Math.max(spec.minW,old.w));height=Math.max(spec.minH,old.h);}
            Rect found=null;
            outer:for(int y=0;y+height<=ROW_LIMIT;y++)for(int x=0;x+width<=columns;x++){
                Rect proposed=new Rect(x,y,width,height);if(vacant(result,spec.key,proposed,columns)){found=proposed;break outer;}
            }
            if(found==null){ // Recover from pathological imported positions without dropping content.
                if(!result.isEmpty()&&height>spec.minH){height=spec.minH;}
                outer:for(int y=0;y+height<=ROW_LIMIT;y++)for(int x=0;x+spec.minW<=columns;x++){
                    Rect proposed=new Rect(x,y,spec.minW,height);if(vacant(result,spec.key,proposed,columns)){found=proposed;break outer;}
                }
            }
            if(found==null)return null;
            result.put(spec.key,found);
        }return result;
    }
    /** Explicitly close vertical gaps, retaining horizontal positions and spans. */
    static LinkedHashMap<String,Rect> compact(Map<String,Rect> current,int columns){
        List<Map.Entry<String,Rect>> ordered=new ArrayList<>(current.entrySet());
        ordered.sort(Comparator.comparingInt((Map.Entry<String,Rect> item)->item.getValue().y).thenComparingInt(item->item.getValue().x).thenComparing(Map.Entry::getKey));
        LinkedHashMap<String,Rect> result=new LinkedHashMap<>();
        for(Map.Entry<String,Rect> item:ordered){
            Rect old=item.getValue(),next=old;
            for(int y=0;y<=old.y;y++){
                Rect candidate=new Rect(old.x,y,old.w,old.h);
                if(vacant(result,item.getKey(),candidate,columns)){next=candidate;break;}
            }
            result.put(item.getKey(),next);
        }
        return result;
    }
    void forget(String key){saved.remove(key);}
    void remember(Map<String,Rect> current,Set<String> keep){saved.keySet().retainAll(keep);saved.putAll(current);}
}
