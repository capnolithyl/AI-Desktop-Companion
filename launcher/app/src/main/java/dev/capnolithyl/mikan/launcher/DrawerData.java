package dev.capnolithyl.mikan.launcher;

import java.util.*;

/** Bounded local drawer preferences and alphabetical index helpers. */
final class DrawerData {
    private static boolean key(String value){return !value.isEmpty()&&value.length()<=512&&!value.contains("\t")&&!value.contains("\r")&&!value.contains("\n");}
    static LinkedHashSet<String> keys(String value){
        LinkedHashSet<String> result=new LinkedHashSet<>();
        if(value.length()>600000)throw new IllegalArgumentException("Drawer data too large");
        for(String item:value.split("\n")){if(item.isEmpty())continue;if(!key(item)||result.size()>=1000)throw new IllegalArgumentException("Invalid app key");result.add(item);}
        return result;
    }
    static LinkedHashMap<String,String> categories(String value){
        LinkedHashMap<String,String> result=new LinkedHashMap<>();
        if(value.length()>600000)throw new IllegalArgumentException("Drawer data too large");
        for(String line:value.split("\n")){
            if(line.isEmpty())continue;int tab=line.indexOf('\t');if(tab<1)throw new IllegalArgumentException("Invalid category");
            String app=line.substring(0,tab),name=line.substring(tab+1);
            if(!key(app)||!validCategory(name)||result.size()>=1000||result.containsKey(app))throw new IllegalArgumentException("Invalid category");
            result.put(app,name);
        }return result;
    }
    static boolean validCategory(String name){return !name.trim().isEmpty()&&name.equals(name.trim())&&name.length()<=40&&!name.contains("\n")&&!name.contains("\t")&&!name.contains("\r");}
    static String encode(Map<String,?> map){StringBuilder b=new StringBuilder();for(Map.Entry<String,?> e:map.entrySet()){if(b.length()>0)b.append('\n');b.append(e.getKey()).append('\t').append(e.getValue());}return b.toString();}
    static LinkedHashMap<String,Integer> counts(String value){
        LinkedHashMap<String,Integer> result=new LinkedHashMap<>();
        if(value.length()>600000)return result;
        for(String line:value.split("\n")){
            int tab=line.indexOf('\t');if(tab<1)continue;String app=line.substring(0,tab);
            if(!key(app)||result.size()>=1000)continue;
            try{int n=Integer.parseInt(line.substring(tab+1));if(n>0&&n<=1000000)result.put(app,n);}catch(NumberFormatException ignored){}
        }return result;
    }
    static int bucket(String normalized){
        if(normalized.isEmpty())return 0;char c=normalized.charAt(0);return c>='a'&&c<='z'?c-'a'+1:0;
    }
    static String letter(int bucket){return bucket==0?"#":Character.toString((char)('A'+bucket-1));}
    static int nearest(int requested,int[] sections){
        if(requested<0||requested>=sections.length)return -1;
        for(int distance=0;distance<sections.length;distance++){
            int left=requested-distance,right=requested+distance;
            if(left>=0&&sections[left]>=0)return left;
            if(right<sections.length&&sections[right]>=0)return right;
        }return -1;
    }
}
