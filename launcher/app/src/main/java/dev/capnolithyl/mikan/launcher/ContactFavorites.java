package dev.capnolithyl.mikan.launcher;

import java.nio.charset.StandardCharsets;
import java.util.*;

/** Explicitly selected device-local snapshots, not an address book mirror. */
final class ContactFavorites {
    static final int LIMIT=8;
    static final class Entry {
        final String id,name,number,photo;
        Entry(String id,String name,String number,String photo){this.id=id;this.name=name;this.number=number;this.photo=photo;}
    }
    private final List<Entry> entries=new ArrayList<>();
    List<Entry> entries(){return new ArrayList<>(entries);}
    Entry get(String id){for(Entry e:entries)if(e.id.equals(id))return e;return null;}
    static String phone(String raw){
        if(raw==null||raw.length()>100)return null;
        String s=raw.trim().replaceAll("[\\s().-]","");
        return s.matches("\\+?[0-9]{3,30}")?s:null;
    }
    static String whatsapp(String number){String n=phone(number);return n!=null&&n.matches("\\+[1-9][0-9]{6,14}")?n.substring(1):null;}
    static String initials(String name){
        StringBuilder out=new StringBuilder();
        for(String word:name.trim().split("\\s+")){
            if(word.isEmpty())continue;
            out.appendCodePoint(Character.toUpperCase(word.codePointAt(0)));
            if(out.codePointCount(0,out.length())>=2)break;
        }
        return out.length()==0?"?":out.toString();
    }
    boolean put(String id,String name,String raw,String photo){
        name=name==null?"":name.trim();String number=phone(raw);
        if(name.isEmpty()||name.length()>100||number==null||photo==null||photo.length()>65536)return false;
        Entry existing=id==null?null:get(id);
        if(id!=null&&existing==null||existing==null&&entries.size()>=LIMIT)return false;
        for(Entry e:entries)if(!e.id.equals(id)&&e.number.equals(number))return false;
        Entry next=new Entry(existing==null?UUID.randomUUID().toString():id,name,number,photo);
        if(existing==null)entries.add(next);else entries.set(entries.indexOf(existing),next);
        return true;
    }
    void remove(String id){Entry e=get(id);if(e!=null)entries.remove(e);}
    void move(String id,int delta){Entry e=get(id);if(e==null)return;int from=entries.indexOf(e),to=from+delta;if(to>=0&&to<entries.size())Collections.swap(entries,from,to);}
    private static String encodeText(String value){return Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8));}
    private static String decodeText(String value){return new String(Base64.getDecoder().decode(value),StandardCharsets.UTF_8);}
    String encode(){
        StringBuilder out=new StringBuilder();
        for(Entry e:entries){
            if(out.length()>0)out.append('\n');
            out.append(e.id).append('\t').append(encodeText(e.name)).append('\t').append(e.number).append('\t').append(e.photo);
        }
        return out.toString();
    }
    static ContactFavorites parse(String raw){
        ContactFavorites model=new ContactFavorites();
        if(raw==null||raw.length()>600000)return model;
        for(String line:raw.split("\n")){
            if(model.entries.size()>=LIMIT)break;
            try{
                String[] fields=line.split("\t",-1);
                if(fields.length!=4||!UUID.fromString(fields[0]).toString().equals(fields[0])||model.get(fields[0])!=null)continue;
                String name=decodeText(fields[1]).trim(),number=phone(fields[2]);
                if(name.isEmpty()||name.length()>100||number==null||fields[3].length()>65536)continue;
                if(model.entries.stream().anyMatch(e->e.number.equals(number)))continue;
                model.entries.add(new Entry(fields[0],name,number,fields[3]));
            }catch(RuntimeException ignored){}
        }
        return model;
    }
}
