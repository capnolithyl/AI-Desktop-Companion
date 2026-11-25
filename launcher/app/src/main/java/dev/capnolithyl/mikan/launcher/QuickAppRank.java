package dev.capnolithyl.mikan.launcher;

import java.text.Normalizer;
import java.util.Locale;

/** Pure, deterministic ranking. Lower score wins; -1 means no match. */
final class QuickAppRank {
    private QuickAppRank(){}
    static String normalize(String value){
        return Normalizer.normalize(value,Normalizer.Form.NFD).replaceAll("\\p{M}+","").toLowerCase(Locale.ROOT).trim().replaceAll("\\s+"," ");
    }
    static int score(String query,String label,String pkg){
        String name=normalize(label),packageName=normalize(pkg);
        if(query.isEmpty())return -1;
        if(name.equals(query))return 0;
        if(name.startsWith(query))return 10;
        for(String word:name.split("[^\\p{L}\\p{N}]+"))if(word.startsWith(query))return 20;
        if(name.contains(query))return 30;
        String[] terms=query.split(" ");boolean all=true;
        for(String term:terms)if(!name.contains(term)){all=false;break;}
        if(all)return 40;
        if(packageName.equals(query))return 50;
        if(packageName.contains(query))return 60;
        return -1;
    }
}
