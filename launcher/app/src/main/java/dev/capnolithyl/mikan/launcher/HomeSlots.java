package dev.capnolithyl.mikan.launcher;

import java.util.*;

/** Sparse linear home slots. Dock remains the existing ordered favorites prefix. */
final class HomeSlots {
    static final int MAX_SLOT=19999;
    private final TreeMap<Integer,String> slots=new TreeMap<>();
    HomeSlots(){}
    static HomeSlots parse(String raw){
        HomeSlots result=new HomeSlots();Set<String> seen=new HashSet<>();
        if(raw.length()>600000)throw new IllegalArgumentException("Layout too large");
        for(String line:raw.split("\\n")){
            if(line.isEmpty())continue;
            int tab=line.indexOf('\t');if(tab<=0)throw new IllegalArgumentException("Invalid slot");
            int slot=Integer.parseInt(line.substring(0,tab));String key=line.substring(tab+1);
            if(slot<0||slot>MAX_SLOT||key.isEmpty()||key.length()>512||key.indexOf('\t')>=0||key.indexOf('\r')>=0||!seen.add(key)||result.slots.containsKey(slot)||result.slots.size()>=1000)throw new IllegalArgumentException("Invalid layout");
            result.slots.put(slot,key);
        }
        return result;
    }
    String encode(){
        StringBuilder out=new StringBuilder();for(Map.Entry<Integer,String> e:slots.entrySet()){if(out.length()>0)out.append('\n');out.append(e.getKey()).append('\t').append(e.getValue());}return out.toString();
    }
    String at(int slot){return slots.get(slot);}
    Set<String> keys(){return new HashSet<>(slots.values());}
    int last(){return slots.isEmpty()?-1:slots.lastKey();}
    int locate(String key){for(Map.Entry<Integer,String> e:slots.entrySet())if(e.getValue().equals(key))return e.getKey();return -1;}
    void reconcile(List<String> wanted){
        Set<String> keep=new LinkedHashSet<>(wanted);
        slots.entrySet().removeIf(e->!keep.contains(e.getValue()));
        Set<String> present=keys();int free=0;
        for(String key:keep)if(!present.contains(key)){
            while(slots.containsKey(free))free++;
            if(free>MAX_SLOT)throw new IllegalStateException("Home full");
            slots.put(free,key);present.add(key);
        }
    }
    boolean move(int from,int to){
        if(from==to||from<0||to<0||to>MAX_SLOT||!slots.containsKey(from))return false;
        String source=slots.remove(from),target=slots.put(to,source);if(target!=null)slots.put(from,target);return true;
    }
    boolean emptyPage(int page,int capacity){int start=page*capacity;return slots.subMap(start,true,start+capacity,false).isEmpty();}
    void swapPages(int a,int b,int capacity){
        if(a==b)return;if(a<0||b<0||capacity<=0||(long)(Math.max(a,b)+1)*capacity>MAX_SLOT+1L)throw new IllegalArgumentException("Page out of range");TreeMap<Integer,String> next=new TreeMap<>();
        for(Map.Entry<Integer,String> e:slots.entrySet()){
            int n=e.getKey(),page=n/capacity,offset=n%capacity;
            next.put((page==a?b:page==b?a:page)*capacity+offset,e.getValue());
        }
        slots.clear();slots.putAll(next);
    }
    boolean removeEmptyPage(int page,int capacity){
        if(!emptyPage(page,capacity))return false;
        TreeMap<Integer,String> next=new TreeMap<>();for(Map.Entry<Integer,String> e:slots.entrySet())next.put(e.getKey()>=((page+1)*capacity)?e.getKey()-capacity:e.getKey(),e.getValue());slots.clear();slots.putAll(next);return true;
    }
}
