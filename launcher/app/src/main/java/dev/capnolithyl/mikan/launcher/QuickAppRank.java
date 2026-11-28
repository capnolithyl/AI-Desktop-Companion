package dev.capnolithyl.mikan.launcher;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/** Pure, deterministic ranking. Lower score wins; -1 means no match. */
final class QuickAppRank {
    private static final Pattern MARKS=Pattern.compile("\\p{M}+"), SPACE=Pattern.compile("\\s+"), WORD_BREAK=Pattern.compile("[^\\p{L}\\p{N}]+");
    private QuickAppRank(){}
    static String normalize(String value){
        return SPACE.matcher(MARKS.matcher(Normalizer.normalize(value,Normalizer.Form.NFD)).replaceAll("").toLowerCase(Locale.ROOT).trim()).replaceAll(" ");
    }
    static int score(String query,String label,String pkg){
        return scoreNormalized(query,normalize(label),normalize(pkg));
    }
    static int scoreNormalized(String query,String name,String packageName){
        if(query.isEmpty())return -1;
        if(name.equals(query))return 0;
        if(name.startsWith(query))return 10;
        for(String word:WORD_BREAK.split(name))if(word.startsWith(query))return 20;
        if(name.contains(query))return 30;
        String[] terms=query.split(" ");boolean all=true;
        for(String term:terms)if(!name.contains(term)){all=false;break;}
        if(all)return 40;
        if(packageName.equals(query))return 50;
        if(packageName.contains(query))return 60;
        return -1;
    }
}
